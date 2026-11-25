from tests.conftest import auth_headers


def test_register_login_me_and_logout_flow(client):
    reg = client.post(
        "/api/v1/auth/register",
        json={
            "username": "Alice_Dev",
            "email": "alice@example.com",
            "password": "StrongPassword123",
            "display_name": "Alice",
        },
    )
    assert reg.status_code == 201
    data = reg.json()
    assert data["username"] == "alice_dev"
    assert "ks_session" in client.cookies

    me = client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["display_name"] == "Alice"

    # Duplicate registration fails cleanly
    dup = client.post(
        "/api/v1/auth/register",
        json={
            "username": "alice_dev",
            "email": "alice2@example.com",
            "password": "StrongPassword123",
        },
    )
    assert dup.status_code == 409

    # Logout clears session
    out = client.post("/api/v1/auth/logout", headers=auth_headers(client))
    assert out.status_code == 204
    assert client.get("/api/v1/auth/me").status_code == 401

    # Login with email works
    login = client.post(
        "/api/v1/auth/login",
        json={"identifier": "alice@example.com", "password": "StrongPassword123"},
    )
    assert login.status_code == 200
    assert login.json()["username"] == "alice_dev"


def test_wrong_password_and_csrf_protection(client):
    client.post(
        "/api/v1/auth/register",
        json={
            "username": "bob_test",
            "email": "bob@example.com",
            "password": "Password123!",
        },
    )

    # Mutating without X-CSRF-Token should be blocked when CSRF cookie is present
    no_csrf = client.patch("/api/v1/profile", json={"bio": "Updated bio"})
    assert no_csrf.status_code == 403

    ok_csrf = client.patch(
        "/api/v1/profile",
        json={"bio": "Updated bio"},
        headers=auth_headers(client),
    )
    assert ok_csrf.status_code == 200
    assert ok_csrf.json()["bio"] == "Updated bio"

    # Delete account
    deleted = client.delete("/api/v1/profile", headers=auth_headers(client))
    assert deleted.status_code == 204
    assert client.get("/api/v1/auth/me").status_code == 401

    # Wrong password rejected
    bad = client.post(
        "/api/v1/auth/login",
        json={"identifier": "bob_test", "password": "WrongPassword"},
    )
    assert bad.status_code == 401
