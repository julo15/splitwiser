from datetime import timedelta

import auth


def test_expired_access_token_returns_401(client, test_user):
    expired_token = auth.create_access_token(
        data={"sub": test_user.email},
        expires_delta=timedelta(minutes=-1),
    )

    response = client.get(
        "/users/me",
        headers={"Authorization": f"Bearer {expired_token}"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Could not validate credentials"}
