"""Password recovery router: forgot password and reset password."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

import auth
import models
import schemas
from database import get_db
from utils.email import is_email_configured, send_password_changed_notification, send_password_reset_email
from utils.rate_limiter import auth_rate_limiter, password_reset_rate_limiter

router = APIRouter(tags=["password-recovery"])


@router.post("/auth/forgot-password", dependencies=[Depends(password_reset_rate_limiter)])
async def forgot_password(
    request: schemas.ForgotPasswordRequest,
    db: Session = Depends(get_db)
):
    """
    Request password reset email.
    Always returns success (security: don't reveal if email exists).
    """
    # Check if email service is configured
    if not is_email_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email service not configured. Please contact administrator."
        )

    # Always return success, even if user doesn't exist (security)
    # This prevents email enumeration attacks

    # Check if user exists
    user = db.query(models.User).filter(models.User.email == request.email).first()

    if user:
        # Invalidate old password reset tokens for this user
        db.query(models.PasswordResetToken).filter(
            models.PasswordResetToken.user_id == user.id,
            models.PasswordResetToken.used == False,
            models.PasswordResetToken.expires_at > datetime.utcnow()
        ).update({"used": True})

        # Create new password reset token
        reset_token = auth.create_password_reset_token()
        token_hash = auth.hash_token(reset_token)
        expires_at = auth.get_password_reset_token_expiry()

        db_token = models.PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at
        )
        db.add(db_token)
        db.commit()

        # Send password reset email
        email_sent = await send_password_reset_email(
            user_email=user.email,
            user_name=user.full_name or user.email,
            reset_token=reset_token
        )

        if not email_sent:
            # Log error but don't reveal to user
            print(f"Failed to send password reset email to {user.email}")

    # Always return success
    return {
        "message": "If an account with that email exists, you will receive a password reset link shortly."
    }


@router.post("/auth/reset-password", dependencies=[Depends(auth_rate_limiter)])
async def reset_password(
    request: schemas.ResetPasswordRequest,
    db: Session = Depends(get_db)
):
    """
    Reset password using token from email.
    """
    # Check if email service is configured (for sending confirmation)
    if not is_email_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email service not configured. Please contact administrator."
        )

    # Hash the token to find it in database
    token_hash = auth.hash_token(request.token)

    # Find token in database
    db_token = db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.token_hash == token_hash
    ).first()

    if not db_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )

    # Check if token is used
    if db_token.used:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token has already been used"
        )

    # Check if token is expired
    if db_token.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token has expired. Please request a new one."
        )

    # Get user
    user = db.query(models.User).filter(models.User.id == db_token.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Update password
    user.hashed_password = auth.get_password_hash(request.new_password)
    user.password_changed_at = datetime.utcnow()

    # Mark token as used
    db_token.used = True

    # Invalidate all refresh tokens (force re-login on all devices)
    db.query(models.RefreshToken).filter(
        models.RefreshToken.user_id == user.id,
        models.RefreshToken.revoked == False
    ).update({"revoked": True})

    db.commit()

    # Send confirmation email
    await send_password_changed_notification(
        user_email=user.email,
        user_name=user.full_name or user.email
    )

    return {
        "message": "Password reset successfully. Please log in with your new password."
    }
