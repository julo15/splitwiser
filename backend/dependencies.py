"""Shared dependencies for authentication and authorization."""

from typing import Annotated, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.orm import Session

import auth
import schemas
from database import get_db
from utils.validation import get_user_by_email

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Same scheme without the automatic 401, for routes that work signed out.
optional_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token", auto_error=False)


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)], 
    db: Session = Depends(get_db)
):
    """Get the current authenticated user from the JWT token."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = auth.jwt.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = schemas.TokenData(email=email)
    except JWTError as err:
        raise credentials_exception from err
    user = get_user_by_email(db, email=token_data.email)
    if user is None:
        raise credentials_exception
    return user


async def get_optional_current_user(
    token: Annotated[Optional[str], Depends(optional_oauth2_scheme)],
    db: Session = Depends(get_db),
):
    """
    The signed-in user, or None on a route that also serves strangers.

    For surfaces that work without an account and are *better* with one — the
    public tab link, where a signed-in claimer should land on their own account
    instead of becoming a nameless guest on someone else's expense.

    No credentials means anonymous. Credentials that do not check out are still
    an error: silently downgrading someone whose token has expired would seat
    them as a guest and quietly lose the association they came for, where a 401
    lets the caller refresh and try again.
    """
    if token is None:
        return None
    return await get_current_user(token, db)
