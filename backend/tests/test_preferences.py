from tests.conftest import auth_headers


def test_preferences_roundtrip(client):
    assert client.get("/api/v1/preferences").status_code == 401

    client.post(
        "/api/v1/auth/register",
        json={"username": "prefs_user", "email": "prefs@example.com", "password": "Password123!"},
    )
    headers = auth_headers(client)

    initial = client.get("/api/v1/preferences")
    assert initial.status_code == 200
    assert initial.json()["theme"] == "dark"

    updated = client.put(
        "/api/v1/preferences",
        json={"theme": "light", "settings": {"fontSize": "lg", "soundProfile": "thock"}},
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["theme"] == "light"
    assert updated.json()["settings"]["fontSize"] == "lg"
