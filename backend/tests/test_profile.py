"""Integration tests for the profile router.

Covers reading and updating the profile, the verified email-change flow, and
password changes. The Brevo email service is stubbed out — these tests assert
on the database state and the HTTP contract, plus the fact that the right
email is requested.
"""

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest

import auth
import models


@pytest.fixture
def email_enabled():
    """Pretend Brevo is configured and every send succeeds."""
    with patch("routers.profile.is_email_configured", return_value=True), \
         patch("routers.profile.send_email_verification_email", new_callable=AsyncMock) as send_verify, \
         patch("routers.profile.send_email_change_notification", new_callable=AsyncMock) as send_change, \
         patch("routers.profile.send_password_changed_notification", new_callable=AsyncMock) as send_pw:
        send_verify.return_value = True
        send_change.return_value = True
        send_pw.return_value = True
        yield {
            "verification": send_verify,
            "change_notice": send_change,
            "password_notice": send_pw,
        }


@pytest.fixture
def email_disabled():
    with patch("routers.profile.is_email_configured", return_value=False):
        yield


def pending_token_for(db, user_id):
    return db.query(models.EmailVerificationToken).filter(
        models.EmailVerificationToken.user_id == user_id
    ).order_by(models.EmailVerificationToken.id.desc()).first()


# --- GET /users/me/profile -------------------------------------------------

class TestGetProfile:
    def test_returns_the_current_user(self, client, auth_headers, test_user):
        response = client.get("/users/me/profile", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == test_user.email
        assert data["full_name"] == "Test User"
        assert data["email_verified"] is False
        assert data["default_currency"] == "USD"

    def test_requires_authentication(self, client):
        assert client.get("/users/me/profile").status_code == 401

    def test_never_exposes_the_password_hash(self, client, auth_headers):
        assert "hashed_password" not in client.get("/users/me/profile", headers=auth_headers).json()


# --- PUT /users/me/profile -------------------------------------------------

class TestUpdateProfile:
    def test_updates_full_name(self, client, auth_headers, db_session, test_user):
        response = client.put("/users/me/profile", headers=auth_headers,
                              json={"full_name": "New Name"})
        assert response.status_code == 200
        assert response.json()["updated_fields"] == ["full_name"]
        db_session.refresh(test_user)
        assert test_user.full_name == "New Name"

    def test_updates_default_currency(self, client, auth_headers, db_session, test_user):
        response = client.put("/users/me/profile", headers=auth_headers,
                              json={"default_currency": "EUR"})
        assert response.status_code == 200
        assert response.json()["updated_fields"] == ["default_currency"]
        db_session.refresh(test_user)
        assert test_user.default_currency == "EUR"

    def test_updates_both_fields_at_once(self, client, auth_headers, db_session, test_user):
        response = client.put("/users/me/profile", headers=auth_headers,
                              json={"full_name": "Both", "default_currency": "GBP"})
        assert response.status_code == 200
        assert set(response.json()["updated_fields"]) == {"full_name", "default_currency"}

    def test_rejects_an_unsupported_currency(self, client, auth_headers):
        response = client.put("/users/me/profile", headers=auth_headers,
                              json={"default_currency": "XYZ"})
        assert response.status_code == 422

    def test_rejects_an_overlong_full_name(self, client, auth_headers):
        response = client.put("/users/me/profile", headers=auth_headers,
                              json={"full_name": "x" * 101})
        assert response.status_code == 422

    def test_empty_payload_is_a_no_op(self, client, auth_headers):
        response = client.put("/users/me/profile", headers=auth_headers, json={})
        assert response.status_code == 200
        assert response.json()["updated_fields"] == []

    def test_requires_authentication(self, client):
        assert client.put("/users/me/profile", json={"full_name": "x"}).status_code == 401


class TestEmailChangeRequest:
    def test_email_change_creates_a_verification_token(
        self, client, auth_headers, db_session, test_user, email_enabled
    ):
        response = client.put("/users/me/profile", headers=auth_headers,
                              json={"email": "new@example.com"})
        assert response.status_code == 200
        assert response.json()["email_verification_pending"] is True

        token = pending_token_for(db_session, test_user.id)
        assert token is not None
        assert token.new_email == "new@example.com"
        assert token.used is False

    def test_email_is_not_changed_until_verification(
        self, client, auth_headers, db_session, test_user, email_enabled
    ):
        client.put("/users/me/profile", headers=auth_headers, json={"email": "new@example.com"})
        db_session.refresh(test_user)
        assert test_user.email == "test@example.com"

    def test_verification_email_is_sent_to_the_new_address(
        self, client, auth_headers, test_user, email_enabled
    ):
        client.put("/users/me/profile", headers=auth_headers, json={"email": "new@example.com"})
        email_enabled["verification"].assert_awaited_once()
        assert email_enabled["verification"].await_args.kwargs["new_email"] == "new@example.com"

    def test_the_raw_token_is_never_stored(
        self, client, auth_headers, db_session, test_user, email_enabled
    ):
        client.put("/users/me/profile", headers=auth_headers, json={"email": "new@example.com"})
        sent_token = email_enabled["verification"].await_args.kwargs["verification_token"]
        token = pending_token_for(db_session, test_user.id)
        assert token.token_hash != sent_token
        assert token.token_hash == auth.hash_token(sent_token)

    def test_rejects_changing_to_the_current_email(
        self, client, auth_headers, test_user, email_enabled
    ):
        response = client.put("/users/me/profile", headers=auth_headers,
                              json={"email": test_user.email})
        assert response.status_code == 400
        assert "same as current" in response.json()["detail"]

    def test_rejects_an_email_already_in_use(
        self, client, auth_headers, db_session, email_enabled
    ):
        db_session.add(models.User(
            email="taken@example.com",
            hashed_password=auth.get_password_hash("password123"),
            full_name="Taken",
            is_active=True,
        ))
        db_session.commit()
        response = client.put("/users/me/profile", headers=auth_headers,
                              json={"email": "taken@example.com"})
        assert response.status_code == 400
        assert response.json()["detail"] == "Email already in use"

    def test_requesting_a_second_change_invalidates_the_first_token(
        self, client, auth_headers, db_session, test_user, email_enabled
    ):
        client.put("/users/me/profile", headers=auth_headers, json={"email": "first@example.com"})
        first = pending_token_for(db_session, test_user.id)
        first_id = first.id

        client.put("/users/me/profile", headers=auth_headers, json={"email": "second@example.com"})
        db_session.expire_all()
        superseded = db_session.query(models.EmailVerificationToken).get(first_id)
        assert superseded.used is True

    def test_rejects_a_malformed_email(self, client, auth_headers, email_enabled):
        response = client.put("/users/me/profile", headers=auth_headers,
                              json={"email": "not-an-email"})
        assert response.status_code == 422

    def test_returns_503_when_email_is_not_configured(
        self, client, auth_headers, email_disabled
    ):
        response = client.put("/users/me/profile", headers=auth_headers,
                              json={"email": "new@example.com"})
        assert response.status_code == 503

    def test_returns_500_when_sending_fails(self, client, auth_headers, test_user):
        with patch("routers.profile.is_email_configured", return_value=True), \
             patch("routers.profile.send_email_verification_email",
                   new_callable=AsyncMock) as send:
            send.return_value = False
            response = client.put("/users/me/profile", headers=auth_headers,
                                  json={"email": "new@example.com"})
        assert response.status_code == 500


# --- POST /auth/verify-email -----------------------------------------------

class TestVerifyEmail:
    def request_change(self, client, auth_headers, email_enabled, new_email="new@example.com"):
        client.put("/users/me/profile", headers=auth_headers, json={"email": new_email})
        return email_enabled["verification"].await_args.kwargs["verification_token"]

    def test_valid_token_applies_the_new_email(
        self, client, auth_headers, db_session, test_user, email_enabled
    ):
        token = self.request_change(client, auth_headers, email_enabled)
        response = client.post("/auth/verify-email", json={"token": token})
        assert response.status_code == 200
        db_session.refresh(test_user)
        assert test_user.email == "new@example.com"
        assert test_user.email_verified is True

    def test_the_old_address_is_notified(
        self, client, auth_headers, test_user, email_enabled
    ):
        token = self.request_change(client, auth_headers, email_enabled)
        client.post("/auth/verify-email", json={"token": token})
        email_enabled["change_notice"].assert_awaited_once()
        assert email_enabled["change_notice"].await_args.kwargs["old_email"] == "test@example.com"

    def test_token_cannot_be_replayed(
        self, client, auth_headers, db_session, test_user, email_enabled
    ):
        token = self.request_change(client, auth_headers, email_enabled)
        assert client.post("/auth/verify-email", json={"token": token}).status_code == 200
        second = client.post("/auth/verify-email", json={"token": token})
        assert second.status_code == 400
        assert "already been used" in second.json()["detail"]

    def test_unknown_token_rejected(self, client, email_enabled):
        response = client.post("/auth/verify-email", json={"token": "nope"})
        assert response.status_code == 400
        assert "Invalid or expired" in response.json()["detail"]

    def test_expired_token_rejected(
        self, client, auth_headers, db_session, test_user, email_enabled
    ):
        token = self.request_change(client, auth_headers, email_enabled)
        db_token = pending_token_for(db_session, test_user.id)
        db_token.expires_at = datetime.utcnow() - timedelta(hours=1)
        db_session.commit()

        response = client.post("/auth/verify-email", json={"token": token})
        assert response.status_code == 400
        assert "expired" in response.json()["detail"]
        db_session.refresh(test_user)
        assert test_user.email == "test@example.com"

    def test_rejected_when_the_address_was_taken_in_the_meantime(
        self, client, auth_headers, db_session, test_user, email_enabled
    ):
        token = self.request_change(client, auth_headers, email_enabled)
        db_session.add(models.User(
            email="new@example.com",
            hashed_password=auth.get_password_hash("password123"),
            full_name="Sniper",
            is_active=True,
        ))
        db_session.commit()

        response = client.post("/auth/verify-email", json={"token": token})
        assert response.status_code == 400
        assert "no longer available" in response.json()["detail"]

    def test_verifying_the_current_address_only_sets_the_flag(
        self, client, auth_headers, db_session, test_user, email_enabled
    ):
        # A token whose new_email equals the current address is the
        # "verify your existing email" case, not a change.
        raw = auth.create_email_verification_token()
        db_session.add(models.EmailVerificationToken(
            user_id=test_user.id,
            new_email=test_user.email,
            token_hash=auth.hash_token(raw),
            expires_at=auth.get_email_verification_token_expiry(),
        ))
        db_session.commit()

        response = client.post("/auth/verify-email", json={"token": raw})
        assert response.status_code == 200
        assert response.json()["message"] == "Email verified successfully"
        db_session.refresh(test_user)
        assert test_user.email_verified is True
        email_enabled["change_notice"].assert_not_awaited()

    def test_returns_503_when_email_is_not_configured(self, client, email_disabled):
        assert client.post("/auth/verify-email", json={"token": "x"}).status_code == 503

    def test_does_not_require_authentication(self, client, email_enabled):
        # The token itself is the credential — the link is followed from an inbox.
        assert client.post("/auth/verify-email", json={"token": "x"}).status_code == 400


# --- POST /auth/resend-verification-email ----------------------------------

class TestResendVerificationEmail:
    def test_resends_for_a_pending_change(
        self, client, auth_headers, db_session, test_user, email_enabled
    ):
        client.put("/users/me/profile", headers=auth_headers, json={"email": "new@example.com"})
        first = pending_token_for(db_session, test_user.id)
        first_id = first.id

        response = client.post("/auth/resend-verification-email", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["target_email"] == "new@example.com"

        db_session.expire_all()
        assert db_session.query(models.EmailVerificationToken).get(first_id).used is True

    def test_falls_back_to_the_current_address_with_no_pending_change(
        self, client, auth_headers, test_user, email_enabled
    ):
        response = client.post("/auth/resend-verification-email", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["target_email"] == test_user.email

    def test_rejected_once_the_email_is_verified(
        self, client, auth_headers, db_session, test_user, email_enabled
    ):
        test_user.email_verified = True
        db_session.commit()
        response = client.post("/auth/resend-verification-email", headers=auth_headers)
        assert response.status_code == 400
        assert "already verified" in response.json()["detail"]

    def test_requires_authentication(self, client, email_enabled):
        assert client.post("/auth/resend-verification-email").status_code == 401

    def test_returns_503_when_email_is_not_configured(
        self, client, auth_headers, email_disabled
    ):
        assert client.post("/auth/resend-verification-email",
                           headers=auth_headers).status_code == 503


# --- POST /auth/change-password --------------------------------------------

class TestChangePassword:
    def test_changes_the_password(
        self, client, auth_headers, db_session, test_user, email_enabled
    ):
        response = client.post("/auth/change-password", headers=auth_headers, json={
            "current_password": "password123",
            "new_password": "newpassword456",
        })
        assert response.status_code == 200
        db_session.refresh(test_user)
        assert auth.verify_password("newpassword456", test_user.hashed_password)
        assert not auth.verify_password("password123", test_user.hashed_password)

    def test_records_when_the_password_changed(
        self, client, auth_headers, db_session, test_user, email_enabled
    ):
        client.post("/auth/change-password", headers=auth_headers, json={
            "current_password": "password123",
            "new_password": "newpassword456",
        })
        db_session.refresh(test_user)
        assert test_user.password_changed_at is not None

    def test_new_password_works_for_login(
        self, client, auth_headers, test_user, email_enabled
    ):
        client.post("/auth/change-password", headers=auth_headers, json={
            "current_password": "password123",
            "new_password": "newpassword456",
        })
        response = client.post("/token", data={
            "username": test_user.email, "password": "newpassword456",
        })
        assert response.status_code == 200

    def test_revokes_every_outstanding_refresh_token(
        self, client, auth_headers, db_session, test_user, email_enabled
    ):
        for _ in range(3):
            db_session.add(models.RefreshToken(
                user_id=test_user.id,
                token_hash=auth.hash_token(auth.create_refresh_token()),
                expires_at=auth.get_refresh_token_expiry(),
            ))
        db_session.commit()

        client.post("/auth/change-password", headers=auth_headers, json={
            "current_password": "password123",
            "new_password": "newpassword456",
        })

        db_session.expire_all()
        live = db_session.query(models.RefreshToken).filter(
            models.RefreshToken.user_id == test_user.id,
            models.RefreshToken.revoked == False,
        ).count()
        assert live == 0

    def test_wrong_current_password_rejected(
        self, client, auth_headers, db_session, test_user, email_enabled
    ):
        response = client.post("/auth/change-password", headers=auth_headers, json={
            "current_password": "wrongpassword",
            "new_password": "newpassword456",
        })
        assert response.status_code == 401
        db_session.refresh(test_user)
        assert auth.verify_password("password123", test_user.hashed_password)

    def test_reusing_the_current_password_rejected(
        self, client, auth_headers, email_enabled
    ):
        response = client.post("/auth/change-password", headers=auth_headers, json={
            "current_password": "password123",
            "new_password": "password123",
        })
        assert response.status_code == 400
        assert "must be different" in response.json()["detail"]

    def test_short_password_rejected(self, client, auth_headers, email_enabled):
        response = client.post("/auth/change-password", headers=auth_headers, json={
            "current_password": "password123",
            "new_password": "short",
        })
        assert response.status_code == 422

    def test_sends_a_confirmation_email(self, client, auth_headers, email_enabled):
        client.post("/auth/change-password", headers=auth_headers, json={
            "current_password": "password123",
            "new_password": "newpassword456",
        })
        email_enabled["password_notice"].assert_awaited_once()

    def test_requires_authentication(self, client, email_enabled):
        response = client.post("/auth/change-password", json={
            "current_password": "password123",
            "new_password": "newpassword456",
        })
        assert response.status_code == 401

    def test_returns_503_when_email_is_not_configured(
        self, client, auth_headers, email_disabled
    ):
        response = client.post("/auth/change-password", headers=auth_headers, json={
            "current_password": "password123",
            "new_password": "newpassword456",
        })
        assert response.status_code == 503
