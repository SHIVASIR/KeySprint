from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from itsdangerous import URLSafeTimedSerializer
from sqlalchemy import select
from starlette.websockets import WebSocketDisconnect

import app.api.v1.races as races_module
from app.core.config import settings
from app.main import app
from app.models.entities import (
    Achievement,
    Challenge,
    ChallengeAttempt,
    ChallengeCompletion,
    LeaderboardEntry,
    RaceRoom,
    TestResult,
    User,
)
from app.services.social import CHALLENGE_SALT, evaluate_achievements, verify_challenge_attempt_token
from tests.conftest import auth_headers


def _reg(username: str) -> tuple[TestClient, dict[str, str]]:
    c = TestClient(app)
    res = c.post(
        "/api/v1/auth/register",
        json={
            "username": username,
            "email": f"{username}@example.com",
            "password": "Password123!",
            "display_name": username.title(),
        },
    )
    assert res.status_code == 201
    return c, auth_headers(c)


def test_private_race_room_high_entropy_tokens_invalid_code_rate_limit_and_ws_auth():
    c_host, h_host = _reg("priv_host")
    c_outsider, h_outsider = _reg("priv_outsider")
    c_invited, _ = _reg("priv_invited")

    room_res = c_host.post(
        "/api/v1/races",
        json={"difficulty": "medium", "is_private": True},
        headers=h_host,
    )
    assert room_res.status_code == 201
    room = room_res.json()

    # Room code is 16 hex chars (64-bit) and invite_token is >= 32 URL-safe chars (192-bit)
    assert len(room["code"]) == 16
    assert len(room["invite_token"]) >= 32

    # Outsider CANNOT join private room merely by knowing room.id UUID
    deny_rest = c_outsider.get(f"/api/v1/races/{room['id']}")
    assert deny_rest.status_code == 403

    # Outsider CANNOT leave, invite, or rematch a private room they aren't in
    assert c_outsider.post(f"/api/v1/races/{room['id']}/leave", headers=h_outsider).status_code == 403
    assert (
        c_outsider.post(
            f"/api/v1/races/{room['id']}/invite",
            json={"username": "priv_invited"},
            headers=h_outsider,
        ).status_code
        == 403
    )

    # Outsider CANNOT bypass REST via direct WS connection without valid invite token
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with c_outsider.websocket_connect(
            f"/api/v1/ws/races/{room['id']}",
            headers={"Origin": "http://localhost:5173"},
        ):
            pass
    assert exc_info.value.code == 4403

    # Invited user joins cleanly with invite_token & reconnects via room.id
    join_ok = c_invited.get(f"/api/v1/races/{room['invite_token']}")
    assert join_ok.status_code == 200
    assert len(join_ok.json()["participants"]) == 2

    reconnect_ok = c_invited.get(f"/api/v1/races/{room['id']}")
    assert reconnect_ok.status_code == 200

    # Host can reconnect to WS cleanly by room.id
    with c_host.websocket_connect(
        f"/api/v1/ws/races/{room['id']}",
        headers={"Origin": "http://localhost:5173"},
    ) as ws:
        assert ws.receive_json()["type"] == "state"

    # Repeated invalid room-code probing triggers 429 rate limiting
    for _ in range(7):
        r = c_outsider.get("/api/v1/races/INVALIDCODE0000")
        assert r.status_code == 404
    blocked = c_outsider.get("/api/v1/races/INVALIDCODE9999")
    assert blocked.status_code == 429


def test_race_join_and_challenge_start_rate_limits():
    c, h = _reg("ratelimit_user")
    room = c.post("/api/v1/races", json={"difficulty": "easy"}, headers=h).json()

    # Room join rate limit (25/min)
    for _ in range(25):
        assert c.get(f"/api/v1/races/{room['id']}").status_code == 200
    assert c.get(f"/api/v1/races/{room['id']}").status_code == 429

    # Challenge start rate limit (20/min)
    for _ in range(20):
        assert c.post("/api/v1/challenges/daily-precision-sprint/start", headers=h).status_code == 200
    assert c.post("/api/v1/challenges/daily-precision-sprint/start", headers=h).status_code == 429


def test_challenge_token_expiration_identity_binding_replay_and_server_consistency():
    c1, h1 = _reg("ch_user1")
    c2, h2 = _reg("ch_user2")

    ch = c1.get("/api/v1/challenges?period=daily").json()["challenges"][0]
    other_ch = c1.get("/api/v1/challenges?period=weekly").json()["challenges"][0]

    start_res = c1.post(f"/api/v1/challenges/{ch['slug']}/start", headers=h1)
    assert start_res.status_code == 200
    valid_token = start_res.json()["attempt_token"]

    with races_module.SessionLocal() as db:
        u1 = db.scalar(select(User).where(User.username == "ch_user1"))
        ch_row = db.scalar(select(Challenge).where(Challenge.slug == ch["slug"]))
        serializer = URLSafeTimedSerializer(settings.SECRET_KEY, salt=CHALLENGE_SALT)

        # Expired token (> 600s old) rejected
        expired_token = serializer.dumps(
            {
                "uid": u1.id,
                "cid": ch_row.id,
                "jti": "expired-jti-111",
                "started_at": (datetime.now(timezone.utc) - timedelta(seconds=620)).timestamp(),
            }
        )

    assert (
        c1.post(
            f"/api/v1/challenges/{ch['slug']}/complete",
            json={"attempt_token": expired_token, "typed_text": ch["prompt_text"]},
            headers=h1,
        ).status_code
        == 400
    )

    # Wrong user cannot replay user1's token
    assert (
        c2.post(
            f"/api/v1/challenges/{ch['slug']}/complete",
            json={"attempt_token": valid_token, "typed_text": ch["prompt_text"]},
            headers=h2,
        ).status_code
        == 400
    )

    # Wrong challenge slug cannot accept token bound to daily challenge
    assert (
        c1.post(
            f"/api/v1/challenges/{other_ch['slug']}/complete",
            json={"attempt_token": valid_token, "typed_text": other_ch["prompt_text"]},
            headers=h1,
        ).status_code
        == 400
    )

    # Stream uneven checkpoints (8s for 20 chars -> ~30 WPM, then 1.5s for 30 chars -> ~240 WPM / high variance)
    prompt_len = len(ch["prompt_text"])
    _, active_jti = verify_challenge_attempt_token(valid_token, u1.id, ch_row.id)
    with races_module.SessionLocal() as db:
        att = db.scalar(select(ChallengeAttempt).where(ChallengeAttempt.attempt_jti == active_jti))
        att.started_at = att.started_at - timedelta(seconds=8)
        db.commit()
    assert (
        c1.post(
            f"/api/v1/challenges/{ch['slug']}/checkpoint",
            json={"attempt_token": valid_token, "seq": 1, "chars_typed": 20},
            headers=h1,
        ).status_code
        == 200
    )

    with races_module.SessionLocal() as db:
        att = db.scalar(select(ChallengeAttempt).where(ChallengeAttempt.attempt_jti == active_jti))
        att.started_at = att.started_at - timedelta(seconds=2)
        att.last_checkpoint_at = att.last_checkpoint_at - timedelta(seconds=2)
        db.commit()
    assert (
        c1.post(
            f"/api/v1/challenges/{ch['slug']}/checkpoint",
            json={"attempt_token": valid_token, "seq": 2, "chars_typed": min(prompt_len - 5, 48)},
            headers=h1,
        ).status_code
        == 200
    )

    with races_module.SessionLocal() as db:
        att = db.scalar(select(ChallengeAttempt).where(ChallengeAttempt.attempt_jti == active_jti))
        att.started_at = att.started_at - timedelta(seconds=2)
        att.last_checkpoint_at = att.last_checkpoint_at - timedelta(seconds=2)
        db.commit()

    # Client submits inflated consistency=100.0 alongside flat timeline -> server ignores both
    flat_timeline = [
        {"second": 1, "wpm": 80, "rawWpm": 80, "accuracy": 100, "errors": 0},
        {"second": 2, "wpm": 80, "rawWpm": 80, "accuracy": 100, "errors": 0},
    ]
    res1 = c1.post(
        f"/api/v1/challenges/{ch['slug']}/complete",
        json={
            "attempt_token": valid_token,
            "typed_text": ch["prompt_text"],
            "consistency": 100.0,
            "timeline": flat_timeline,
        },
        headers=h1,
    )
    assert res1.status_code == 200
    body1 = res1.json()
    assert body1["consistency"] < 90.0  # Server interval variance governs consistency, not client 100.0
    assert body1["consistency_verified"] is True

    # Replay same token twice -> idempotent response, zero duplicate rows/notifications
    res2 = c1.post(
        f"/api/v1/challenges/{ch['slug']}/complete",
        json={
            "attempt_token": valid_token,
            "typed_text": ch["prompt_text"],
            "consistency": 100.0,
        },
        headers=h1,
    )
    assert res2.status_code == 200
    assert res2.json()["net_wpm"] == body1["net_wpm"]

    with races_module.SessionLocal() as db:
        u1 = db.scalar(select(User).where(User.username == "ch_user1"))
        assert len(db.scalars(select(TestResult).where(TestResult.user_id == u1.id)).all()) == 1
        assert (
            len(db.scalars(select(ChallengeCompletion).where(ChallengeCompletion.user_id == u1.id)).all())
            == 1
        )
        assert (
            len(db.scalars(select(LeaderboardEntry).where(LeaderboardEntry.user_id == u1.id)).all())
            == 1
        )


def test_profile_privacy_enforced_across_direct_api_endpoints():
    c_owner, h_owner = _reg("hidden_user")
    c_friend, h_friend = _reg("hidden_friend")
    c_stranger, _ = _reg("hidden_stranger")

    # Become friends
    fid = c_owner.post(
        "/api/v1/friends/requests", json={"username": "hidden_friend"}, headers=h_owner
    ).json()["friendship_id"]
    c_friend.post(f"/api/v1/friends/requests/{fid}/accept", headers=h_friend)

    # Record a competitive challenge completion for hidden_user
    ch = c_owner.get("/api/v1/challenges?period=daily").json()["challenges"][0]
    tok = c_owner.post(f"/api/v1/challenges/{ch['slug']}/start", headers=h_owner).json()[
        "attempt_token"
    ]
    prompt_len = len(ch["prompt_text"])
    for seq_idx, ch_cnt in enumerate((20, 44), start=1):
        with races_module.SessionLocal() as db:
            att = db.scalar(select(ChallengeAttempt).where(ChallengeAttempt.status == "active"))
            att.started_at = att.started_at - timedelta(seconds=3)
            if att.last_checkpoint_at:
                att.last_checkpoint_at = att.last_checkpoint_at - timedelta(seconds=3)
            db.commit()
        assert (
            c_owner.post(
                f"/api/v1/challenges/{ch['slug']}/checkpoint",
                json={"attempt_token": tok, "seq": seq_idx, "chars_typed": ch_cnt},
                headers=h_owner,
            ).status_code
            == 200
        )
    with races_module.SessionLocal() as db:
        att = db.scalar(select(ChallengeAttempt).where(ChallengeAttempt.status == "active"))
        att.started_at = att.started_at - timedelta(seconds=3)
        att.last_checkpoint_at = att.last_checkpoint_at - timedelta(seconds=3)
        db.commit()

    assert (
        c_owner.post(
            f"/api/v1/challenges/{ch['slug']}/complete",
            json={"attempt_token": tok, "typed_text": ch["prompt_text"]},
            headers=h_owner,
        ).status_code
        == 200
    )

    # Case 1: show_stats=False, is_public=True -> hidden from global leaderboard, friends leaderboard, challenge leaderboard, and /users/{username}
    c_owner.patch(
        "/api/v1/profile",
        json={
            "bio": "Secret bio",
            "show_stats": False,
            "show_achievements": False,
            "show_race_history": False,
        },
        headers=h_owner,
    )

    pub_stranger = c_stranger.get("/api/v1/users/hidden_user").json()
    assert pub_stranger["stats"] is None
    assert pub_stranger["achievements"] == []
    assert pub_stranger["race_history"] == []

    assert c_stranger.get("/api/v1/leaderboard").json()["entries"] == []
    assert (
        c_stranger.get(f"/api/v1/challenges/{ch['slug']}/leaderboard").json()["entries"] == []
    )
    # Friends leaderboard hides friend's stats when show_stats=False
    assert c_friend.get("/api/v1/leaderboard?scope=friends").json()["entries"] == []
    # Owner still sees own stats
    assert c_owner.get("/api/v1/leaderboard?scope=friends").json()["entries"][0]["username"] == "hidden_user"
    assert c_owner.get("/api/v1/profile/summary").json()["stats"]["total_tests"] == 1

    # Case 2: is_public=False -> /users/{username} strips bio, layout, created_at, stats, achievements, race_history
    c_owner.patch(
        "/api/v1/profile",
        json={"is_public": False, "show_stats": True},
        headers=h_owner,
    )
    pub_locked = c_stranger.get("/api/v1/users/hidden_user").json()
    assert pub_locked["is_public"] is False
    assert pub_locked["bio"] == ""
    assert pub_locked["preferred_layout"] == ""
    assert pub_locked["created_at"] is None
    assert pub_locked["stats"] is None
    assert pub_locked["achievements"] == []
    assert pub_locked["race_history"] == []


def test_concurrent_achievement_evaluation_prevents_duplicates(tmp_path):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.core.database import Base

    db_file = tmp_path / "concurrent_ach.db"
    file_engine = create_engine(
        f"sqlite:///{db_file}",
        connect_args={"check_same_thread": False, "timeout": 15},
    )
    Base.metadata.create_all(bind=file_engine)
    FileSession = sessionmaker(autocommit=False, autoflush=False, bind=file_engine)

    with FileSession() as db:
        u = User(username="conc_u", email="conc@e.com", password_hash="x")
        db.add(u)
        db.flush()
        uid = u.id
        db.add(
            TestResult(
                user_id=uid,
                client_record_id="conc-1",
                mode="words",
                category="general",
                difficulty="medium",
                duration_seconds=20.0,
                gross_wpm=88.0,
                net_wpm=85.0,
                accuracy=97.0,
                correct_chars=170,
                incorrect_chars=5,
                total_chars=175,
                imported_from_guest=False,
            )
        )
        db.commit()

    def _eval_once(_i: int):
        with FileSession() as db:
            try:
                evaluate_achievements(db, uid, notify=True)
                db.commit()
            except Exception:
                db.rollback()

    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(_eval_once, range(6)))

    with FileSession() as db:
        rows = db.scalars(select(Achievement).where(Achievement.user_id == uid)).all()
        codes = [r.code for r in rows]
        assert len(codes) == len(set(codes))
        assert "first-test" in codes
        assert "speed-80" in codes
    file_engine.dispose()
