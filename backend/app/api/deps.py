import secrets
from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import (
    CSRF_COOKIE_NAME,
    SESSION_COOKIE_NAME,
    decode_session_token,
)
from app.models.entities import User


def get_current_user_optional(
    db: Session = Depends(get_db),
    ks_session: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> User | None:
    if not ks_session:
        return None
    uid = decode_session_token(ks_session)
    if not uid:
        return None
    user = db.get(User, uid)
    if not user or not user.is_active:
        return None
    return user


def get_current_user(
    request: Request,
    user: User | None = Depends(get_current_user_optional),
    ks_csrf: str | None = Cookie(default=None, alias=CSRF_COOKIE_NAME),
    x_csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
) -> User:
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    # Enforce double-submit CSRF check on mutating cookie-authenticated requests
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        if (
            not ks_csrf
            or not x_csrf_token
            or not secrets.compare_digest(x_csrf_token, ks_csrf)
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid or missing CSRF token.",
            )
    return user
