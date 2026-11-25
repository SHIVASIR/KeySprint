from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.core.rate_limit import enforce_rate_limit
from app.core.security import (
    CSRF_COOKIE_NAME,
    SESSION_COOKIE_NAME,
    create_session_token,
    generate_csrf_token,
    hash_password,
    verify_password,
)
from app.models.entities import Profile, User, UserPreference
from app.schemas.api import LoginRequest, RegisterRequest, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_auth_cookies(response: Response, user_id: str) -> None:
    session_token = create_session_token(user_id)
    csrf_token = generate_csrf_token()
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session_token,
        httponly=True,
        samesite="lax",
        secure=settings.COOKIE_SECURE,
        max_age=settings.SESSION_MAX_AGE_SECONDS,
        path="/",
    )
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=csrf_token,
        httponly=False,
        samesite="lax",
        secure=settings.COOKIE_SECURE,
        max_age=settings.SESSION_MAX_AGE_SECONDS,
        path="/",
    )


def _to_user_response(user: User) -> UserResponse:
    p = user.profile
    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        display_name=p.display_name if p else user.username,
        bio=p.bio if p else "",
        preferred_layout=p.preferred_layout if p else "qwerty-ansi",
        is_public=p.is_public if p else True,
        show_stats=p.show_stats if p else True,
        show_achievements=p.show_achievements if p else True,
        show_race_history=p.show_race_history if p else True,
        created_at=user.created_at,
    )


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(enforce_rate_limit("auth_register", limit=15, window_seconds=60))],
)
def register(payload: RegisterRequest, response: Response, db: Session = Depends(get_db)) -> UserResponse:
    normalized_username = payload.username.strip().lower()
    normalized_email = payload.email.strip().lower()

    existing = db.scalar(
        select(User).where(
            or_(User.username == normalized_username, User.email == normalized_email)
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username or email is already registered.",
        )

    user = User(
        username=normalized_username,
        email=normalized_email,
        password_hash=hash_password(payload.password),
    )
    user.profile = Profile(display_name=(payload.display_name or payload.username).strip())
    user.preferences = UserPreference(theme="dark", settings_json={})

    db.add(user)
    db.commit()
    db.refresh(user)

    _set_auth_cookies(response, user.id)
    return _to_user_response(user)


@router.post(
    "/login",
    response_model=UserResponse,
    dependencies=[Depends(enforce_rate_limit("auth_login", limit=20, window_seconds=60))],
)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)) -> UserResponse:
    ident = payload.identifier.strip().lower()
    user = db.scalar(
        select(User).where(or_(User.username == ident, User.email == ident))
    )
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username/email or password.",
        )

    _set_auth_cookies(response, user.id)
    return _to_user_response(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    response.delete_cookie(CSRF_COOKIE_NAME, path="/")


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return _to_user_response(current_user)
