"""Integration tests for the password recovery router.

Covers the forgot-password request (including its deliberate refusal to leak
whether an account exists) and the token-based reset. Brevo is stubbed out.
"""

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest

import auth
import models


@pytest.fixture
def email_enabled():
    with patch("routers.password_recovery.is_email_configured", return_value=True), \
         patch("routers.password_recovery.send_password_reset_email",
               new_callable=AsyncMock) as send_reset, \
         patch("routers.password_recovery.send_password_changed_notification",
               new_callable=AsyncMock) as send_notice:
        send_reset.return_value = True
        send_notice.return_value = True
        yield {"reset": send_reset, "notice": send_notice}


@pytest.fixture
def email_disabled():
    with patch("routers.password_recovery.is_email_configured", return_value=False):
        yield


def latest_reset_token(db, user_id):
    return db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.user_id == user_id
    ).order_by(models.PasswordResetToken.id.desc()).first()


def request_reset(client, email_enabled, email="test@example.com"):
    """Run the forgot-password flow and return the raw token that was emailed."""
    response = client.post("/auth/forgot-password", json={"email": email})
    assert response.status_code == 200
    return email_enabled["reset"].await_args.kwargs["reset_token"]


# --- POST /auth/forgot-password --------------------------------------------

class TestForgotPassword:
    def test_creates_a_reset_token_for_a_known_user(
        self, client, db_session, test_user, email_enabled
    ):
        client.post("/auth/forgot-password", json={"email": test_user.email})
        token = latest_reset_token(db_session, test_user.id)
        assert token is not None
        assert token.used is False
        assert token.expires_at > datetime.utcnow()

    def test_sends_the_reset_email(self, client, test_user, email_enabled):
        client.post("/auth/forgot-password", json={"email": test_user.email})
        email_enabled["reset"].assert_awaited_once()
        assert email_enabled["reset"].await_args.kwargs["user_email"] == test_user.email

    def test_only_the_token_hash_is_persisted(
        self, client, db_session, test_user, email_enabled
    ):
        raw = request_reset(client, email_enabled, test_user.email)
        stored = latest_reset_token(db_session, test_user.id)
        assert stored.token_hash != raw
        assert stored.token_hash == auth.hash_token(raw)

    def test_unknown_email_returns_the_same_success_message(
        self, client, test_user, email_enabled
    ):
        known = client.post("/auth/forgot-password", json={"email": test_user.email})
        unknown = client.post("/auth/forgot-password", json={"email": "nobody@example.com"})
        assert unknown.status_code == known.status_code == 200
        assert unknown.json() == known.json()

    def test_unknown_email_creates_no_token_and_sends_no_mail(
        self, client, db_session, email_enabled
    ):
        client.post("/auth/forgot-password", json={"email": "nobody@example.com"})
        assert db_session.query(models.PasswordResetToken).count() == 0
        email_enabled["reset"].assert_not_awaited()

    def test_a_second_request_invalidates_the_first_token(
        self, client, db_session, test_user, email_enabled
    ):
        first_raw = request_reset(client, email_enabled, test_user.email)
        first_id = latest_reset_token(db_session, test_user.id).id

        request_reset(client, email_enabled, test_user.email)

        db_session.expire_all()
        assert db_session.query(models.PasswordResetToken).get(first_id).used is True

        # And the superseded token no longer works.
        response = client.post("/auth/reset-password", json={
            "token": first_raw, "new_password": "newpassword456",
        })
        assert response.status_code == 400

    def test_rejects_a_malformed_email(self, client, email_enabled):
        assert client.post("/auth/forgot-password",
                           json={"email": "not-an-email"}).status_code == 422

    def test_returns_503_when_email_is_not_configured(self, client, email_disabled):
        response = client.post("/auth/forgot-password", json={"email": "test@example.com"})
        assert response.status_code == 503

    def test_a_send_failure_still_returns_success(self, client, test_user, db_session):
        # The response must not reveal delivery problems either.
        with patch("routers.password_recovery.is_email_configured", return_value=True), \
             patch("routers.password_recovery.send_password_reset_email",
                   new_callable=AsyncMock) as send:
            send.return_value = False
            response = client.post("/auth/forgot-password", json={"email": test_user.email})
        assert response.status_code == 200


# --- POST /auth/reset-password ---------------------------------------------

class TestResetPassword:
    def test_valid_token_sets_the_new_password(
        self, client, db_session, test_user, email_enabled
    ):
        raw = request_reset(client, email_enabled, test_user.email)
        response = client.post("/auth/reset-password", json={
            "token": raw, "new_password": "newpassword456",
        })
        assert response.status_code == 200
        db_session.refresh(test_user)
        assert auth.verify_password("newpassword456", test_user.hashed_password)

    def test_the_old_password_stops_working(
        self, client, db_session, test_user, email_enabled
    ):
        raw = request_reset(client, email_enabled, test_user.email)
        client.post("/auth/reset-password", json={
            "token": raw, "new_password": "newpassword456",
        })
        response = client.post("/token", data={
            "username": test_user.email, "password": "password123",
        })
        assert response.status_code == 401

    def test_the_new_password_works_for_login(self, client, test_user, email_enabled):
        raw = request_reset(client, email_enabled, test_user.email)
        client.post("/auth/reset-password", json={
            "token": raw, "new_password": "newpassword456",
        })
        response = client.post("/token", data={
            "username": test_user.email, "password": "newpassword456",
        })
        assert response.status_code == 200

    def test_token_cannot_be_replayed(self, client, test_user, email_enabled):
        raw = request_reset(client, email_enabled, test_user.email)
        assert client.post("/auth/reset-password", json={
            "token": raw, "new_password": "newpassword456",
        }).status_code == 200

        second = client.post("/auth/reset-password", json={
            "token": raw, "new_password": "anotherpassword789",
        })
        assert second.status_code == 400
        assert "already been used" in second.json()["detail"]

    def test_revokes_every_outstanding_refresh_token(
        self, client, db_session, test_user, email_enabled
    ):
        for _ in range(3):
            db_session.add(models.RefreshToken(
                user_id=test_user.id,
                token_hash=auth.hash_token(auth.create_refresh_token()),
                expires_at=auth.get_refresh_token_expiry(),
            ))
        db_session.commit()

        raw = request_reset(client, email_enabled, test_user.email)
        client.post("/auth/reset-password", json={
            "token": raw, "new_password": "newpassword456",
        })

        db_session.expire_all()
        live = db_session.query(models.RefreshToken).filter(
            models.RefreshToken.user_id == test_user.id,
            models.RefreshToken.revoked == False,
        ).count()
        assert live == 0

    def test_records_when_the_password_changed(
        self, client, db_session, test_user, email_enabled
    ):
        raw = request_reset(client, email_enabled, test_user.email)
        client.post("/auth/reset-password", json={
            "token": raw, "new_password": "newpassword456",
        })
        db_session.refresh(test_user)
        assert test_user.password_changed_at is not None

    def test_sends_a_confirmation_email(self, client, test_user, email_enabled):
        raw = request_reset(client, email_enabled, test_user.email)
        client.post("/auth/reset-password", json={
            "token": raw, "new_password": "newpassword456",
        })
        email_enabled["notice"].assert_awaited_once()

    def test_unknown_token_rejected(self, client, email_enabled):
        response = client.post("/auth/reset-password", json={
            "token": "never-issued", "new_password": "newpassword456",
        })
        assert response.status_code == 400
        assert "Invalid or expired" in response.json()["detail"]

    def test_expired_token_rejected(self, client, db_session, test_user, email_enabled):
        raw = request_reset(client, email_enabled, test_user.email)
        stored = latest_reset_token(db_session, test_user.id)
        stored.expires_at = datetime.utcnow() - timedelta(hours=1)
        db_session.commit()

        response = client.post("/auth/reset-password", json={
            "token": raw, "new_password": "newpassword456",
        })
        assert response.status_code == 400
        assert "expired" in response.json()["detail"]
        db_session.refresh(test_user)
        assert auth.verify_password("password123", test_user.hashed_password)

    def test_token_for_a_deleted_user_returns_404(
        self, client, db_session, test_user, email_enabled
    ):
        raw = request_reset(client, email_enabled, test_user.email)
        db_session.delete(test_user)
        db_session.commit()

        response = client.post("/auth/reset-password", json={
            "token": raw, "new_password": "newpassword456",
        })
        assert response.status_code == 404

    def test_short_password_rejected(self, client, test_user, email_enabled):
        raw = request_reset(client, email_enabled, test_user.email)
        response = client.post("/auth/reset-password", json={
            "token": raw, "new_password": "short",
        })
        assert response.status_code == 422

    def test_returns_503_when_email_is_not_configured(self, client, email_disabled):
        response = client.post("/auth/reset-password", json={
            "token": "x", "new_password": "newpassword456",
        })
        assert response.status_code == 503

    def test_does_not_require_authentication(self, client, email_enabled):
        # The emailed token is the credential.
        response = client.post("/auth/reset-password", json={
            "token": "never-issued", "new_password": "newpassword456",
        })
        assert response.status_code == 400


# --- end-to-end ------------------------------------------------------------

def test_full_forgot_and_reset_round_trip(client, db_session, test_user, email_enabled):
    """Forgot -> emailed token -> reset -> log in with the new password."""
    assert client.post("/token", data={
        "username": test_user.email, "password": "password123",
    }).status_code == 200

    raw = request_reset(client, email_enabled, test_user.email)

    assert client.post("/auth/reset-password", json={
        "token": raw, "new_password": "brandnewpassword",
    }).status_code == 200

    assert client.post("/token", data={
        "username": test_user.email, "password": "password123",
    }).status_code == 401
    assert client.post("/token", data={
        "username": test_user.email, "password": "brandnewpassword",
    }).status_code == 200
