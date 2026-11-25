import secrets
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app.core.config import settings

_ph = PasswordHasher()
_serializer = URLSafeTimedSerializer(settings.SECRET_KEY, salt="keysprint-session-v1")

SESSION_COOKIE_NAME = "ks_session"
CSRF_COOKIE_NAME = "ks_csrf"


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def create_session_token(user_id: str) -> str:
    return _serializer.dumps({"uid": user_id})


def decode_session_token(token: str) -> str | None:
    try:
        data = _serializer.loads(token, max_age=settings.SESSION_MAX_AGE_SECONDS)
        uid = data.get("uid")
        return str(uid) if uid else None
    except (BadSignature, SignatureExpired):
        return None


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(24)
