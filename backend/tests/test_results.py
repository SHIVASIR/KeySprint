from tests.conftest import auth_headers


def _register_user(client, username="typist1", email="typist1@example.com"):
    res = client.post(
        "/api/v1/auth/register",
        json={"username": username, "email": email, "password": "Password123!"},
    )
    assert res.status_code == 201
    return auth_headers(client)


def test_results_crud_duplicate_protection_and_ownership(client):
    headers_a = _register_user(client, "user_a", "a@example.com")

    payload = {
        "client_record_id": "rec-unique-001",
        "mode": "time",
        "category": "general",
        "difficulty": "medium",
        "duration_seconds": 30.0,
        "gross_wpm": 74.0,
        "net_wpm": 72.0,
        "accuracy": 97.5,
        "consistency": 91.0,
        "correct_chars": 180,
        "incorrect_chars": 5,
        "total_chars": 185,
        "correct_words": 34,
        "incorrect_words": 1,
        "timeline": [{"second": 1, "wpm": 70, "rawWpm": 72, "accuracy": 98, "errors": 0}],
        "keystroke_summary": [{"expected": "a", "correct": True, "latency_ms": 110}],
    }

    r1 = client.post("/api/v1/results", json=payload, headers=headers_a)
    assert r1.status_code == 201
    result_id = r1.json()["id"]

    # Duplicate client_record_id returns existing record without creating a duplicate row
    r2 = client.post("/api/v1/results", json=payload, headers=headers_a)
    assert r2.status_code == 201
    assert r2.json()["id"] == result_id

    listing = client.get("/api/v1/results?page=1&page_size=10")
    assert listing.status_code == 200
    assert listing.json()["total"] == 1

    # Invalid implausible WPM rejected
    bad_payload = {**payload, "client_record_id": "rec-bad-999", "net_wpm": 500.0}
    bad = client.post("/api/v1/results", json=bad_payload, headers=headers_a)
    assert bad.status_code == 422

    # Switch to another user and verify ownership isolation
    client.post("/api/v1/auth/logout", headers=headers_a)
    headers_b = _register_user(client, "user_b", "b@example.com")
    forbidden_get = client.get(f"/api/v1/results/{result_id}")
    assert forbidden_get.status_code == 404
    forbidden_del = client.delete(f"/api/v1/results/{result_id}", headers=headers_b)
    assert forbidden_del.status_code == 404


def test_guest_import_prevents_duplicates(client):
    headers = _register_user(client, "migrator", "m@example.com")
    records = [
        {
            "client_record_id": "guest-1",
            "mode": "words",
            "category": "technology",
            "difficulty": "medium",
            "duration_seconds": 20.0,
            "gross_wpm": 65.0,
            "net_wpm": 63.0,
            "accuracy": 96.0,
            "correct_chars": 100,
            "incorrect_chars": 4,
            "total_chars": 104,
        }
    ]

    first = client.post("/api/v1/results/import", json={"records": records}, headers=headers)
    assert first.status_code == 200
    assert first.json()["imported"] == 1
    assert first.json()["skipped"] == 0

    second = client.post("/api/v1/results/import", json={"records": records}, headers=headers)
    assert second.status_code == 200
    assert second.json()["imported"] == 0
    assert second.json()["skipped"] == 1
