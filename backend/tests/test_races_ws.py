import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from starlette.websockets import WebSocketDisconnect

import app.api.v1.races as races_module
from app.api.v1.races import _run_countdown_and_start, ws_manager
from app.models.entities import LeaderboardEntry, RaceParticipant, RaceRoom, TestResult, User
from tests.conftest import auth_headers


def _create_room(client, username="racer1", email="r1@example.com", difficulty="easy"):
    client.post(
        "/api/v1/auth/register",
        json={"username": username, "email": email, "password": "Password123!"},
    )
    headers = auth_headers(client)
    room_res = client.post("/api/v1/races", json={"difficulty": difficulty}, headers=headers)
    assert room_res.status_code == 201
    return room_res.json()


def _activate_room_at(room_id: str, started_seconds_ago: float) -> None:
    with races_module.SessionLocal() as db:
        room = db.get(RaceRoom, room_id)
        room.status = "active"
        room.started_at = datetime.now(timezone.utc) - timedelta(seconds=started_seconds_ago)
        db.commit()


def _advance_server_clock(room_id: str, username: str, step_seconds: float) -> None:
    """Shift room.started_at and participant.last_progress_at back deterministically to simulate elapsed wall time."""
    with races_module.SessionLocal() as db:
        room = db.get(RaceRoom, room_id)
        room.started_at = races_module._as_utc(room.started_at) - timedelta(seconds=step_seconds)
        user = db.query(User).filter_by(username=username).first()
        part = (
            db.query(RaceParticipant)
            .filter_by(room_id=room_id, user_id=user.id)
            .first()
        )
        if part and part.last_progress_at is not None:
            part.last_progress_at = races_module._as_utc(part.last_progress_at) - timedelta(
                seconds=step_seconds
            )
        db.commit()


def test_race_room_creation_and_websocket_sync(client):
    unauth = client.post("/api/v1/races", json={"difficulty": "easy"})
    assert unauth.status_code == 401

    room = _create_room(client)
    room_id = room["id"]
    assert room["status"] == "waiting"

    with client.websocket_connect(
        f"/api/v1/ws/races/{room_id}",
        headers={"Origin": "http://localhost:5173"},
    ) as ws:
        initial = ws.receive_json()
        assert initial["type"] == "state"
        assert initial["room"]["id"] == room_id
        assert len(initial["room"]["participants"]) == 1

        ws.send_text("{not-valid-json")
        err1 = ws.receive_json()
        assert err1["type"] == "error"
        assert "Invalid JSON" in err1["detail"]

        ws.send_json(["not", "a", "dict"])
        assert ws.receive_json()["type"] == "error"

        ws.send_json({"type": "unknown_action"})
        assert ws.receive_json()["type"] == "error"


@pytest.mark.parametrize(
    "bad_headers",
    [
        {},
        {"Origin": "https://evil.example"},
        {"Origin": "not-a-valid-url"},
        {"Origin": "http://localhost:5173/injected-path"},
        {"Origin": "ftp://localhost:5173"},
    ],
)
def test_websocket_rejects_unauthorized_or_malformed_origin(client, bad_headers):
    room = _create_room(client)
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(f"/api/v1/ws/races/{room['id']}", headers=bad_headers):
            pass
    assert exc_info.value.code == 4403


def test_websocket_rejects_malformed_progress_metrics_safely(client):
    room = _create_room(client)
    with client.websocket_connect(
        f"/api/v1/ws/races/{room['id']}",
        headers={"Origin": "http://127.0.0.1:5173"},
    ) as ws:
        assert ws.receive_json()["type"] == "state"
        ws.send_json({"type": "progress", "progress": "invalid", "wpm": "NaN"})
        err = ws.receive_json()
        assert err["type"] == "error"
        assert "Invalid progress metrics" in err["detail"]


def test_countdown_task_handles_unexpected_errors_safely(monkeypatch):
    async def _run():
        def _boom():
            raise RuntimeError("Simulated DB outage")

        monkeypatch.setattr(races_module, "SessionLocal", _boom)
        await _run_countdown_and_start("nonexistent-room")
        assert "nonexistent-room" not in ws_manager.countdown_tasks

    asyncio.run(_run())


def test_rejects_automatic_full_prompt_submission_without_progress(client):
    room = _create_room(client, username="auto_bot", email="bot1@example.com")
    room_id = room["id"]
    prompt = room["prompt_text"]

    # Even after 20s of elapsed race time, submitting finish with no prior progress checkpoints fails
    _activate_room_at(room_id, started_seconds_ago=20)

    with client.websocket_connect(
        f"/api/v1/ws/races/{room_id}",
        headers={"Origin": "http://localhost:5173"},
    ) as ws:
        ws.receive_json()
        ws.send_json({"type": "finish", "typed_text": prompt})
        err = ws.receive_json()
        assert err["type"] == "error"
        assert "progressive typing updates required" in err["detail"]

    with races_module.SessionLocal() as db:
        assert db.query(TestResult).count() == 0
        assert db.query(LeaderboardEntry).count() == 0


def test_rejects_instant_race_completion_and_forged_client_timestamps(client):
    room = _create_room(client, username="speed_bot", email="bot2@example.com")
    room_id = room["id"]
    prompt = room["prompt_text"]
    prompt_len = len(prompt)

    # Race started only 0.5 seconds ago
    _activate_room_at(room_id, started_seconds_ago=0.5)

    with client.websocket_connect(
        f"/api/v1/ws/races/{room_id}",
        headers={"Origin": "http://localhost:5173"},
    ) as ws:
        ws.receive_json()
        # Even if client forges elapsed_seconds=60, server clock rejects superhuman burst/early finish
        ws.send_json({"type": "progress", "chars_typed": 25, "progress": 28, "accuracy": 100})
        err_burst = ws.receive_json()
        assert err_burst["type"] == "error"

        # Simulate valid progressive checkpoints right up to 75%, still within 1.5s total elapsed
        _advance_server_clock(room_id, "speed_bot", 1.0)
        for ch in (10, 20, 30):
            _advance_server_clock(room_id, "speed_bot", 0.5)
        # Keep total elapsed short (~1.5s) after resetting clock to 1.2s ago
        with races_module.SessionLocal() as db:
            r = db.get(RaceRoom, room_id)
            r.started_at = datetime.now(timezone.utc) - timedelta(seconds=1.2)
            u = db.query(User).filter_by(username="speed_bot").first()
            p = db.query(RaceParticipant).filter_by(room_id=room_id, user_id=u.id).first()
            p.chars_typed = prompt_len - 5
            p.progress = 94
            p.progress_updates_count = 4
            p.last_progress_at = datetime.now(timezone.utc) - timedelta(milliseconds=300)
            db.commit()

        ws.send_json({"type": "finish", "typed_text": prompt, "elapsed_seconds": 999.0})
        err_early = ws.receive_json()
        assert err_early["type"] == "error"
        assert "faster than humanly plausible" in err_early["detail"]

    with races_module.SessionLocal() as db:
        assert db.query(TestResult).count() == 0
        assert db.query(LeaderboardEntry).count() == 0


def test_rejects_impossible_progress_jumps_and_duplicate_updates(client):
    room = _create_room(client, username="jumper", email="jump@example.com")
    room_id = room["id"]
    prompt_len = len(room["prompt_text"])
    _activate_room_at(room_id, started_seconds_ago=10)

    with client.websocket_connect(
        f"/api/v1/ws/races/{room_id}",
        headers={"Origin": "http://localhost:5173"},
    ) as ws:
        ws.receive_json()

        # Impossible 0 -> 100% jump rejected
        ws.send_json({"type": "progress", "chars_typed": prompt_len, "progress": 100, "accuracy": 100})
        jump_err = ws.receive_json()
        assert jump_err["type"] == "error"
        assert "Impossible progress jump" in jump_err["detail"]

        # Valid step: 15 chars
        ws.send_json({"type": "progress", "chars_typed": 15, "progress": 17, "accuracy": 98})
        ok_state = ws.receive_json()
        assert ok_state["type"] == "state"

        # Duplicate identical progress message rejected
        ws.send_json({"type": "progress", "chars_typed": 15, "progress": 17, "accuracy": 98})
        dup_err = ws.receive_json()
        assert dup_err["type"] == "error"
        assert "Duplicate progress update" in dup_err["detail"]

        # Regressive backward update rejected
        ws.send_json({"type": "progress", "chars_typed": 10, "progress": 11, "accuracy": 98})
        back_err = ws.receive_json()
        assert back_err["type"] == "error"
        assert "backwards" in back_err["detail"]


def test_legitimate_fast_typist_succeeds(client):
    # ~180 WPM (15 chars/sec) on 89-char prompt (~5.9s total)
    room = _create_room(client, username="fast_pro", email="fast@example.com")
    room_id = room["id"]
    prompt = room["prompt_text"]
    prompt_len = len(prompt)
    _activate_room_at(room_id, started_seconds_ago=1.5)

    with client.websocket_connect(
        f"/api/v1/ws/races/{room_id}",
        headers={"Origin": "http://localhost:5173"},
    ) as ws:
        ws.receive_json()

        checkpoints = [22, 44, 66, prompt_len - 5]
        for idx, ch in enumerate(checkpoints):
            if idx > 0:
                _advance_server_clock(room_id, "fast_pro", 1.45)
            pct = round((ch / prompt_len) * 100)
            ws.send_json({"type": "progress", "chars_typed": ch, "progress": pct, "accuracy": 99.0})
            msg = ws.receive_json()
            assert msg["type"] == "state"

        _advance_server_clock(room_id, "fast_pro", 0.4)
        ws.send_json({"type": "finish", "typed_text": prompt, "elapsed_seconds": 999.0})
        done_msg = ws.receive_json()
        assert done_msg["type"] == "state"
        assert done_msg["room"]["status"] == "finished"
        p = done_msg["room"]["participants"][0]
        assert p["finished"] is True
        assert 150.0 <= p["wpm"] <= 210.0  # Server-authoritative ~180 WPM, NOT forged 999s


def test_normal_race_completion_server_grading_and_leaderboard_deduplication(client):
    room = _create_room(client, username="grader_user", email="grader@example.com")
    room_id = room["id"]
    prompt = room["prompt_text"]
    prompt_len = len(prompt)
    _activate_room_at(room_id, started_seconds_ago=4.0)

    with client.websocket_connect(
        f"/api/v1/ws/races/{room_id}",
        headers={"Origin": "http://localhost:5173"},
    ) as ws:
        ws.receive_json()

        for ch in (25, 50, 75):
            _advance_server_clock(room_id, "grader_user", 4.0)
            ws.send_json(
                {
                    "type": "progress",
                    "chars_typed": ch,
                    "progress": round((ch / prompt_len) * 100),
                    "accuracy": 98.0,
                }
            )
            assert ws.receive_json()["type"] == "state"

        _advance_server_clock(room_id, "grader_user", 3.0)

        # Incomplete typed_text is rejected
        ws.send_json({"type": "finish", "typed_text": "short"})
        assert ws.receive_json()["type"] == "error"

        # Server grades 2 typos regardless of spoofed client counts
        tampered = "XX" + prompt[2:]
        ws.send_json(
            {
                "type": "finish",
                "typed_text": tampered,
                "correct_chars": prompt_len,
                "incorrect_chars": 0,
                "elapsed_seconds": 1.0,
            }
        )
        done_msg = ws.receive_json()
        assert done_msg["type"] == "state"
        assert done_msg["room"]["status"] == "finished"
        participant = done_msg["room"]["participants"][0]
        expected_acc = round(((prompt_len - 2) / prompt_len) * 100.0, 1)
        assert participant["accuracy"] == expected_acc
        assert participant["wpm"] < 100.0  # Server timing (~19s), not forged 1.0s

    # Add a lower leaderboard entry (from another verified result) for the same user and verify deduplication
    with races_module.SessionLocal() as db:
        u = db.query(User).filter_by(username="grader_user").first()
        r2 = TestResult(
            user_id=u.id,
            client_record_id="extra-lower-race",
            mode="race",
            category="race-extra",
            difficulty="easy",
            duration_seconds=30.0,
            gross_wpm=14.0,
            net_wpm=12.0,
            accuracy=80.0,
            consistency=80.0,
            correct_chars=80,
            incorrect_chars=10,
            total_chars=90,
            verified_competitive=True,
            imported_from_guest=False,
        )
        db.add(r2)
        db.flush()
        db.add(
            LeaderboardEntry(
                user_id=u.id,
                result_id=r2.id,
                period="all",
                mode="race",
                net_wpm=12.0,
                accuracy=80.0,
            )
        )
        db.commit()

    lb = client.get("/api/v1/leaderboard")
    assert lb.status_code == 200
    entries = lb.json()["entries"]
    assert len(entries) == 1
    assert entries[0]["username"] == "grader_user"
    assert entries[0]["net_wpm"] > 12.0
    assert entries[0]["consistency"] is not None
    assert entries[0]["consistency"] < 100.0  # Computed from real interval variance, not hardcoded 100.0


def test_rejects_chunk_splitting_and_tail_burst_auto_submit(client):
    room = _create_room(client, username="chunk_bot", email="chunk@example.com")
    room_id = room["id"]
    prompt = room["prompt_text"]
    prompt_len = len(prompt)

    # Idle 10s, then try chunk-splitting small updates (delta_chars=8) within milliseconds
    _activate_room_at(room_id, started_seconds_ago=10.0)
    with client.websocket_connect(
        f"/api/v1/ws/races/{room_id}",
        headers={"Origin": "http://localhost:5173"},
    ) as ws:
        ws.receive_json()

        # First valid 20 chars after 10s
        ws.send_json(
            {
                "type": "progress",
                "chars_typed": 20,
                "progress": round((20 / prompt_len) * 100),
                "accuracy": 100.0,
            }
        )
        assert ws.receive_json()["type"] == "state"

        # Immediately send rapid 8-char chunk (< 200ms) -> rejected by short-chunk burst check
        ws.send_json(
            {
                "type": "progress",
                "chars_typed": 28,
                "progress": round((28 / prompt_len) * 100),
                "accuracy": 100.0,
            }
        )
        chunk_err = ws.receive_json()
        assert chunk_err["type"] == "error"
        assert "Suspicious burst typing speed" in chunk_err["detail"]

        # Advance 3s and reach ~70% legitimately across 2 more checkpoints
        for ch in (42, 62):
            _advance_server_clock(room_id, "chunk_bot", 3.0)
            ws.send_json(
                {
                    "type": "progress",
                    "chars_typed": ch,
                    "progress": round((ch / prompt_len) * 100),
                    "accuracy": 100.0,
                }
            )
            assert ws.receive_json()["type"] == "state"

        # Immediately blast finish with remaining ~27 chars in < 100ms -> rejected by tail-burst check
        ws.send_json({"type": "finish", "typed_text": prompt})
        tail_err = ws.receive_json()
        assert tail_err["type"] == "error"
        assert "final burst speed" in tail_err["detail"]

    with races_module.SessionLocal() as db:
        assert db.query(TestResult).count() == 0
        assert db.query(LeaderboardEntry).count() == 0
