from tests.conftest import auth_headers


def test_learning_analytics_and_leaderboard_endpoints(client):
    # Public endpoints work without auth
    lessons = client.get("/api/v1/lessons")
    assert lessons.status_code == 200
    lesson_list = lessons.json()["lessons"]
    assert len(lesson_list) == 16
    assert any(item["id"] == "beg-0-posture-setup" for item in lesson_list)

    challenges = client.get("/api/v1/leaderboard/challenges")
    assert challenges.status_code == 200
    assert len(challenges.json()["challenges"]) >= 2

    lb = client.get("/api/v1/leaderboard")
    assert lb.status_code == 200
    assert lb.json()["entries"] == []

    # Register & record learning progress + result
    client.post(
        "/api/v1/auth/register",
        json={"username": "learner1", "email": "l1@example.com", "password": "Password123!"},
    )
    headers = auth_headers(client)

    lp = client.post(
        "/api/v1/learning/progress",
        json={
            "lesson_id": "beg-1-home-row-anchors",
            "completed": True,
            "best_wpm": 32.5,
            "best_accuracy": 98.0,
        },
        headers=headers,
    )
    assert lp.status_code == 200
    assert lp.json()["completed"] is True

    # Repeated submission updates same record rather than duplicating rows & keeps max scores
    lp_repeat = client.post(
        "/api/v1/learning/progress",
        json={
            "lesson_id": "beg-1-home-row-anchors",
            "completed": False,
            "best_wpm": 28.0,
            "best_accuracy": 95.0,
        },
        headers=headers,
    )
    assert lp_repeat.status_code == 200
    assert lp_repeat.json()["completed"] is True
    assert lp_repeat.json()["best_wpm"] == 32.5
    assert lp_repeat.json()["attempts"] == 2

    progress_res = client.get("/api/v1/learning/progress")
    assert progress_res.status_code == 200
    assert len(progress_res.json()["progress"]) == 1
    assert any(a["code"] == "first-lesson" for a in progress_res.json()["achievements"])

    # Completing 6 distinct lessons unlocks halfway-academy without duplicate achievements
    for idx in range(5):
        lesson_id = lesson_list[idx]["id"]
        if lesson_id == "beg-1-home-row-anchors":
            lesson_id = lesson_list[idx + 5]["id"]
        res = client.post(
            "/api/v1/learning/progress",
            json={
                "lesson_id": lesson_id,
                "completed": True,
                "best_wpm": 40.0,
                "best_accuracy": 97.0,
            },
            headers=headers,
        )
        assert res.status_code == 200

    progress_after_six = client.get("/api/v1/learning/progress").json()
    codes = [a["code"] for a in progress_after_six["achievements"]]
    assert "first-lesson" in codes
    assert "halfway-academy" in codes
    assert codes.count("first-lesson") == 1

    client.post(
        "/api/v1/results",
        json={
            "client_record_id": "res-learn-1",
            "mode": "lesson",
            "category": "beg-1-home-row-anchors",
            "difficulty": "medium",
            "duration_seconds": 18.0,
            "gross_wpm": 33.0,
            "net_wpm": 32.5,
            "accuracy": 98.0,
            "correct_chars": 49,
            "incorrect_chars": 1,
            "total_chars": 50,
            "keystroke_summary": [{"expected": "f", "correct": True, "latency_ms": 95}],
        },
        headers=headers,
    )

    overview = client.get("/api/v1/analytics/overview")
    assert overview.status_code == 200
    assert overview.json()["total_tests"] == 1
    assert overview.json()["best_wpm"] == 32.5

    kb = client.get("/api/v1/analytics/keyboard")
    assert kb.status_code == 200
    assert kb.json()["keys"]["f"]["attempts"] == 1
