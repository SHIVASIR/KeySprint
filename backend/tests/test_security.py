import pytest
from pydantic import ValidationError

from app.core.config import Settings
from tests.conftest import auth_headers


def test_csrf_missing_cookie_missing_header_mismatch_and_valid(client):
    reg = client.post(
        "/api/v1/auth/register",
        json={
            "username": "csrf_tester",
            "email": "csrf@example.com",
            "password": "Password123!",
        },
    )
    assert reg.status_code == 201
    session_cookie = client.cookies.get("ks_session")
    csrf_cookie = client.cookies.get("ks_csrf")
    assert session_cookie
    assert csrf_cookie

    # 1. Missing X-CSRF-Token header -> 403
    res_missing_header = client.patch("/api/v1/profile", json={"bio": "no header"})
    assert res_missing_header.status_code == 403

    # 2. Mismatched X-CSRF-Token header -> 403
    res_mismatch = client.patch(
        "/api/v1/profile",
        json={"bio": "wrong header"},
        headers={"X-CSRF-Token": "wrong-token-value"},
    )
    assert res_mismatch.status_code == 403

    # 3. Missing ks_csrf cookie while ks_session cookie IS sent (CSRF bypass attempt) -> 403
    client.cookies.delete("ks_csrf")
    res_missing_cookie = client.patch(
        "/api/v1/profile",
        json={"bio": "bypass attempt"},
        headers={"X-CSRF-Token": csrf_cookie},
    )
    assert res_missing_cookie.status_code == 403

    # Restore ks_csrf cookie -> valid matching tokens succeed
    client.cookies.set("ks_csrf", csrf_cookie)
    res_valid = client.patch(
        "/api/v1/profile",
        json={"bio": "legitimate update"},
        headers=auth_headers(client),
    )
    assert res_valid.status_code == 200
    assert res_valid.json()["bio"] == "legitimate update"


def test_production_settings_validation():
    # Development allows defaults
    dev = Settings(ENVIRONMENT="development")
    assert dev.COOKIE_SECURE is False

    # Production rejects default dev SECRET_KEY
    with pytest.raises(ValidationError):
        Settings(
            ENVIRONMENT="production",
            SECRET_KEY="dev-insecure-change-me-in-production-keysprint-secret",
            COOKIE_SECURE=True,
        )

    # Production rejects short SECRET_KEY
    with pytest.raises(ValidationError):
        Settings(
            ENVIRONMENT="production",
            SECRET_KEY="too-short-secret",
            COOKIE_SECURE=True,
        )

    # Production rejects COOKIE_SECURE=False
    with pytest.raises(ValidationError):
        Settings(
            ENVIRONMENT="production",
            SECRET_KEY="x" * 48,
            COOKIE_SECURE=False,
        )

    # Production accepts strong SECRET_KEY + COOKIE_SECURE=True
    prod = Settings(
        ENVIRONMENT="production",
        SECRET_KEY="x" * 48,
        COOKIE_SECURE=True,
    )
    assert prod.COOKIE_SECURE is True
