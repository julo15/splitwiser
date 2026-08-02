from utils.rate_limiter import RateLimiter, auth_rate_limiter, ocr_rate_limiter

# These tests use the shared `client` fixture from conftest so they get the
# in-memory test database. The autouse `disable_rate_limits` fixture there
# neutralises the real limiters; each test below re-overrides the one limiter
# it is exercising with a strict instance, and `restore_dependency_overrides`
# undoes that afterwards.


def test_auth_rate_limiting(client, app_overrides):
    test_limiter = RateLimiter(requests_limit=5, time_window=60)
    app_overrides[auth_rate_limiter] = test_limiter

    url = "/token"
    # Valid form data structure required by OAuth2PasswordRequestForm
    data = {"username": "test@example.com", "password": "password"}

    # Send 5 requests
    for i in range(5):
        response = client.post(url, data=data)
        # Should not be 429
        assert response.status_code != 429, f"Request {i+1} was rate limited unexpectedly"

    # The 6th request should be rate limited
    response = client.post(url, data=data)
    assert response.status_code == 429, "6th request should have been rate limited"
    assert response.json()["detail"] == "Too many requests. Please try again later."


def test_register_rate_limiting(client, app_overrides):
    # The current implementation uses the SAME instance `auth_rate_limiter` for
    # both /token and /register.
    test_limiter = RateLimiter(requests_limit=5, time_window=60)
    app_overrides[auth_rate_limiter] = test_limiter

    url = "/register"
    data = {"email": "rate_limit@example.com", "password": "password", "full_name": "Rate Limit"}

    # Send 5 requests
    for i in range(5):
        response = client.post(url, json=data)
        assert response.status_code != 429, f"Request {i+1} was rate limited unexpectedly"

    # The 6th request should be rate limited
    response = client.post(url, json=data)
    assert response.status_code == 429


def test_ocr_rate_limiting(client, app_overrides):
    test_limiter = RateLimiter(requests_limit=5, time_window=60)
    app_overrides[ocr_rate_limiter] = test_limiter

    url = "/ocr/scan-receipt"

    # We need to send a valid-looking file to pass the initial checks
    file_content = b"fake image content"

    # The rate limiter runs as a dependency, before the path operation function.
    # If it allows the request the endpoint runs and fails on the invalid image;
    # that's fine — we only care that the first 5 are not 429 and the 6th is.
    for i in range(5):
        # Recreate the file object for each request because it gets closed
        files = {"file": ("test.jpg", file_content, "image/jpeg")}
        response = client.post(url, files=files)

        assert response.status_code != 429, (
            f"Request {i+1} was rate limited unexpectedly. Status: {response.status_code}"
        )

    # The 6th request should be rate limited
    files = {"file": ("test.jpg", file_content, "image/jpeg")}
    response = client.post(url, files=files)
    assert response.status_code == 429, "6th request should have been rate limited"
    assert response.json()["detail"] == "Too many requests. Please try again later."


def test_proxy_rate_limiting(client, app_overrides):
    """Verify that X-Forwarded-For is respected to prevent shared rate limits behind a proxy"""
    test_limiter = RateLimiter(requests_limit=1, time_window=60)
    app_overrides[auth_rate_limiter] = test_limiter

    url = "/token"
    data = {"username": "test@example.com", "password": "password"}

    # Request 1: User A (IP: 10.0.0.1), as forwarded by nginx
    headers_a = {"X-Forwarded-For": "10.0.0.1"}
    response = client.post(url, data=data, headers=headers_a)
    assert response.status_code != 429

    # Request 2: User B (IP: 10.0.0.2) - DIFFERENT USER
    # Should NOT be blocked (this previously failed when using only client.host)
    headers_b = {"X-Forwarded-For": "10.0.0.2"}
    response = client.post(url, data=data, headers=headers_b)
    assert response.status_code != 429, "Rate limiter failed to distinguish users via X-Forwarded-For"

    # Request 3: User A again — should be blocked
    response = client.post(url, data=data, headers=headers_a)
    assert response.status_code == 429, "Rate limiter failed to block repeat request from User A"
