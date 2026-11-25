from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from itsdangerous import URLSafeTimedSerializer
from sqlalchemy import select

import app.api.v1.races as races_module
from app.core.config import settings
from app.models.entities import (
    Challenge,
    ChallengeAttempt,
    LeaderboardEntry,
    RaceRoom,
    TestResult,
    User,
)
from app.services.social import CHALLENGE_SALT
from tests.conftest import auth_headers
from app.main import app


def _register_and_login_cookies(username: str) -> tuple[TestClient, dict[str, str]]:
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


def test_friends_workflow_authorization_and_notifications():
    c_alice, h_alice = _register_and_login_cookies("alice")
    c_bob, h_bob = _register_and_login_cookies("bob")
    c_charlie, h_charlie = _register_and_login_cookies("charlie")

    # Cannot friend self or missing user
    assert (
        c_alice.post("/api/v1/friends/requests", json={"username": "alice"}, headers=h_alice).status_code
        == 400
    )
    assert (
        c_alice.post("/api/v1/friends/requests", json={"username": "nobody_99"}, headers=h_alice).status_code
        == 404
    )

    # Alice requests Bob
    req_res = c_alice.post("/api/v1/friends/requests", json={"username": "bob"}, headers=h_alice)
    assert req_res.status_code == 201
    friendship_id = req_res.json()["friendship_id"]

    # Duplicate request in either direction is rejected (409)
    assert (
        c_alice.post("/api/v1/friends/requests", json={"username": "bob"}, headers=h_alice).status_code
        == 409
    )
    assert (
        c_bob.post("/api/v1/friends/requests", json={"username": "alice"}, headers=h_bob).status_code
        == 409
    )

    # Bob received a notification
    bob_notes = c_bob.get("/api/v1/notifications").json()
    assert bob_notes["unread_count"] >= 1
    assert any(n["kind"] == "friend_request" for n in bob_notes["notifications"])

    # Authorization checks: requester cannot accept own request; unrelated Charlie cannot accept
    assert (
        c_alice.post(f"/api/v1/friends/requests/{friendship_id}/accept", headers=h_alice).status_code
        == 403
    )
    assert (
        c_charlie.post(f"/api/v1/friends/requests/{friendship_id}/accept", headers=h_charlie).status_code
        == 403
    )
    # Recipient cannot cancel outgoing request
    assert (
        c_bob.delete(f"/api/v1/friends/requests/{friendship_id}", headers=h_bob).status_code == 403
    )

    # Bob accepts
    acc_res = c_bob.post(f"/api/v1/friends/requests/{friendship_id}/accept", headers=h_bob)
    assert acc_res.status_code == 200
    assert acc_res.json()["status"] == "accepted"

    # Alice receives friend_accepted notification and marks all read
    alice_notes = c_alice.get("/api/v1/notifications").json()
    assert any(n["kind"] == "friend_accepted" for n in alice_notes["notifications"])
    c_alice.post("/api/v1/notifications/read-all", headers=h_alice)
    assert c_alice.get("/api/v1/notifications").json()["unread_count"] == 0

    # Friends list contains each other
    alice_friends = c_alice.get("/api/v1/friends").json()["friends"]
    assert len(alice_friends) == 1
    assert alice_friends[0]["username"] == "bob"

    # Remove friend
    bob_uid = alice_friends[0]["user_id"]
    assert c_alice.delete(f"/api/v1/friends/{bob_uid}", headers=h_alice).status_code == 204
    assert c_bob.get("/api/v1/friends").json()["friends"] == []


def test_friends_cancel_and_reject_flow():
    c_a, h_a = _register_and_login_cookies("req_sender")
    c_b, h_b = _register_and_login_cookies("req_target")

    res = c_a.post("/api/v1/friends/requests", json={"username": "req_target"}, headers=h_a)
    fid = res.json()["friendship_id"]
    assert c_a.delete(f"/api/v1/friends/requests/{fid}", headers=h_a).status_code == 204

    res2 = c_a.post("/api/v1/friends/requests", json={"username": "req_target"}, headers=h_a)
    fid2 = res2.json()["friendship_id"]
    assert c_b.post(f"/api/v1/friends/requests/{fid2}/reject", headers=h_b).status_code == 200
    assert c_b.get("/api/v1/friends").json()["friends"] == []


def test_leaderboard_ranking_pagination_friends_scope_and_verified_only():
    c1, h1 = _register_and_login_cookies("lb_one")
    c2, h2 = _register_and_login_cookies("lb_two")
    c3, h3 = _register_and_login_cookies("lb_three")

    # lb_one and lb_two become friends; lb_three is unrelated
    fid = c1.post("/api/v1/friends/requests", json={"username": "lb_two"}, headers=h1).json()[
        "friendship_id"
    ]
    c2.post(f"/api/v1/friends/requests/{fid}/accept", headers=h2)

    # Practice results must NEVER appear on competitive leaderboard
    c1.post(
        "/api/v1/results",
        json={
            "client_record_id": "practice-not-comp",
            "mode": "words",
            "category": "general",
            "difficulty": "medium",
            "duration_seconds": 15.0,
            "gross_wpm": 195.0,
            "net_wpm": 190.0,
            "accuracy": 100.0,
            "consistency": 99.0,
            "correct_chars": 250,
            "incorrect_chars": 0,
            "total_chars": 250,
        },
        headers=h1,
    )

    with races_module.SessionLocal() as db:
        users = {u.username: u for u in db.scalars(select(User)).all()}
        now = datetime.now(timezone.utc)
        specs = [
            # lb_one: 2 entries in period to verify single-entry-per-user deduplication
            ("lb_one", 72.0, 99.0, 88.0, now - timedelta(hours=1)),
            ("lb_one", 84.0, 95.0, 82.0, now),
            ("lb_two", 92.0, 93.0, 97.0, now - timedelta(days=3)),
            ("lb_three", 78.0, 100.0, 91.0, now - timedelta(days=12)),
        ]
        for idx, (uname, wpm, acc, cons, ts) in enumerate(specs):
            r = TestResult(
                user_id=users[uname].id,
                client_record_id=f"comp-{idx}",
                mode="race",
                category="race-test",
                difficulty="medium",
                duration_seconds=20.0,
                gross_wpm=wpm + 1,
                net_wpm=wpm,
                accuracy=acc,
                consistency=cons,
                correct_chars=150,
                incorrect_chars=2,
                total_chars=152,
                verified_competitive=True,
                imported_from_guest=False,
                created_at=ts,
            )
            db.add(r)
            db.flush()
            db.add(
                LeaderboardEntry(
                    user_id=users[uname].id,
                    result_id=r.id,
                    period="all",
                    mode="race",
                    net_wpm=wpm,
                    accuracy=acc,
                    achieved_at=ts,
                )
            )
        db.commit()

    # Global WPM order: lb_two (92) > lb_one (84) > lb_three (78); practice 190 WPM excluded!
    page1 = c1.get("/api/v1/leaderboard?sort_by=wpm&page=1&page_size=2").json()
    assert page1["total"] == 3
    assert [e["username"] for e in page1["entries"]] == ["lb_two", "lb_one"]
    assert [e["rank"] for e in page1["entries"]] == [1, 2]

    page2 = c1.get("/api/v1/leaderboard?sort_by=wpm&page=2&page_size=2").json()
    assert [e["username"] for e in page2["entries"]] == ["lb_three"]
    assert page2["entries"][0]["rank"] == 3

    # Sort by accuracy: lb_three (100) > lb_one (99) > lb_two (93)
    by_acc = c1.get("/api/v1/leaderboard?sort_by=accuracy").json()
    assert [e["username"] for e in by_acc["entries"]] == ["lb_three", "lb_one", "lb_two"]

    # Sort by consistency: lb_two (97) > lb_three (91) > lb_one (88)
    by_cons = c1.get("/api/v1/leaderboard?sort_by=consistency").json()
    assert [e["username"] for e in by_cons["entries"]] == ["lb_two", "lb_three", "lb_one"]

    # Daily period only includes lb_one; weekly includes lb_one & lb_two
    assert [e["username"] for e in c1.get("/api/v1/leaderboard/daily").json()["entries"]] == ["lb_one"]
    assert [e["username"] for e in c1.get("/api/v1/leaderboard/weekly").json()["entries"]] == [
        "lb_two",
        "lb_one",
    ]

    # Friends leaderboard requires auth and excludes lb_three
    unauth = TestClient(app)
    assert unauth.get("/api/v1/leaderboard?scope=friends").status_code == 401
    friends_lb = c1.get("/api/v1/leaderboard?scope=friends").json()
    assert [e["username"] for e in friends_lb["entries"]] == ["lb_two", "lb_one"]


def test_challenges_verification_history_and_leaderboard():
    c, h = _register_and_login_cookies("challenger")

    daily = c.get("/api/v1/challenges?period=daily").json()["challenges"]
    weekly = c.get("/api/v1/challenges?period=weekly").json()["challenges"]
    assert len(daily) >= 1
    assert len(weekly) >= 1
    ch = daily[0]

    # Start challenge -> get signed token
    start = c.post(f"/api/v1/challenges/{ch['slug']}/start", headers=h)
    assert start.status_code == 200
    token = start.json()["attempt_token"]

    # Instant submit fails anti-cheat timing / checkpoint check
    instant = c.post(
        f"/api/v1/challenges/{ch['slug']}/complete",
        json={"attempt_token": token, "typed_text": ch["prompt_text"], "consistency": 95.0},
        headers=h,
    )
    assert instant.status_code == 400

    # Tampered token fails
    tampered = c.post(
        f"/api/v1/challenges/{ch['slug']}/complete",
        json={"attempt_token": "tampered.token.value", "typed_text": ch["prompt_text"]},
        headers=h,
    )
    assert tampered.status_code == 400

    # Simulate realistic typing duration with server-recorded checkpoints
    prompt_len = len(ch["prompt_text"])
    checkpoints = [int(prompt_len * 0.25), int(prompt_len * 0.55), int(prompt_len * 0.85)]
    for seq_idx, ch_count in enumerate(checkpoints, start=1):
        with races_module.SessionLocal() as db:
            att = db.scalar(
                select(ChallengeAttempt).where(ChallengeAttempt.status == "active")
            )
            att.started_at = att.started_at - timedelta(seconds=3)
            if att.last_checkpoint_at:
                att.last_checkpoint_at = att.last_checkpoint_at - timedelta(seconds=3)
            db.commit()
        cp_res = c.post(
            f"/api/v1/challenges/{ch['slug']}/checkpoint",
            json={"attempt_token": token, "seq": seq_idx, "chars_typed": ch_count},
            headers=h,
        )
        assert cp_res.status_code == 200

    with races_module.SessionLocal() as db:
        att = db.scalar(select(ChallengeAttempt).where(ChallengeAttempt.status == "active"))
        att.started_at = att.started_at - timedelta(seconds=2)
        att.last_checkpoint_at = att.last_checkpoint_at - timedelta(seconds=2)
        db.commit()

    done = c.post(
        f"/api/v1/challenges/{ch['slug']}/complete",
        json={"attempt_token": token, "typed_text": ch["prompt_text"], "consistency": 94.0},
        headers=h,
    )
    assert done.status_code == 200
    assert done.json()["verified_competitive"] is True
    assert done.json()["consistency_verified"] is True
    assert done.json()["passed"] is True

    # Appears in Challenge History, Challenge Leaderboard, Notifications, and Achievements
    hist = c.get("/api/v1/challenges/history").json()["history"]
    assert len(hist) == 1
    assert hist[0]["challenge_slug"] == ch["slug"]

    c_board = c.get(f"/api/v1/challenges/{ch['slug']}/leaderboard").json()
    assert c_board["entries"][0]["username"] == "challenger"

    ach = {a["code"]: a for a in c.get("/api/v1/achievements").json()["achievements"]}
    assert ach["challenge-champion"]["unlocked"] is True


def test_race_readiness_invites_leave_rematch_and_victory_achievement():
    c_host, h_host = _register_and_login_cookies("race_host")
    c_guest, h_guest = _register_and_login_cookies("race_guest")

    created = c_host.post(
        "/api/v1/races",
        json={"difficulty": "easy", "is_private": True},
        headers=h_host,
    )
    assert created.status_code == 201
    room = created.json()
    assert room["difficulty"] == "easy"
    assert room["is_private"] is True

    # Invite guest -> creates race_invite notification without duplicates
    assert (
        c_host.post(
            f"/api/v1/races/{room['id']}/invite",
            json={"username": "race_guest"},
            headers=h_host,
        ).status_code
        == 200
    )
    c_host.post(
        f"/api/v1/races/{room['id']}/invite",
        json={"username": "race_guest"},
        headers=h_host,
    )
    guest_notes = c_guest.get("/api/v1/notifications").json()["notifications"]
    assert [n["kind"] for n in guest_notes].count("race_invite") == 1

    # Guest joins by room code
    joined = c_guest.get(f"/api/v1/races/{room['code']}").json()
    assert len(joined["participants"]) == 2

    # Guest toggles ready over WS
    with c_guest.websocket_connect(
        f"/api/v1/ws/races/{room['id']}", headers={"Origin": "http://localhost:5173"}
    ) as ws_g:
        _ = ws_g.receive_json()
        ws_g.send_json({"type": "ready", "ready": True})
        state_msg = ws_g.receive_json()
        guest_part = next(
            p for p in state_msg["room"]["participants"] if p["username"] == "race_guest"
        )
        assert guest_part["is_ready"] is True

    # Guest leaves while waiting
    assert c_guest.post(f"/api/v1/races/{room['id']}/leave", headers=h_guest).status_code == 200
    assert len(c_host.get(f"/api/v1/races/{room['id']}").json()["participants"]) == 1

    # Rejoin guest using room code, finish race, and test rematch + race-victory achievement
    assert c_guest.get(f"/api/v1/races/{room['code']}").status_code == 200
    with races_module.SessionLocal() as db:
        r_db = db.get(RaceRoom, room["id"])
        r_db.status = "active"
        r_db.started_at = datetime.now(timezone.utc) - timedelta(seconds=12)
        for part in r_db.participants:
            part.chars_typed = len(r_db.prompt_text) - 5
            part.progress_updates_count = 3
        db.commit()

    with c_host.websocket_connect(
        f"/api/v1/ws/races/{room['id']}", headers={"Origin": "http://localhost:5173"}
    ) as ws_h:
        _ = ws_h.receive_json()
        ws_h.send_json({"type": "finish", "typed_text": room["prompt_text"]})
        finished_msg = ws_h.receive_json()
        host_part = next(
            p for p in finished_msg["room"]["participants"] if p["username"] == "race_host"
        )
        assert host_part["finished"] is True
        assert host_part["placement"] == 1

    # Host earned race-victory achievement (beating >= 1 opponent)
    host_ach = {a["code"]: a for a in c_host.get("/api/v1/achievements").json()["achievements"]}
    assert host_ach["race-victory"]["unlocked"] is True

    # Mark room finished so rematch can be created cleanly
    with races_module.SessionLocal() as db:
        r_db = db.get(RaceRoom, room["id"])
        r_db.status = "finished"
        db.commit()

    rematch = c_host.post(f"/api/v1/races/{room['id']}/rematch", headers=h_host)
    assert rematch.status_code == 201
    rematch_data = rematch.json()
    assert rematch_data["id"] != room["id"]
    assert len(rematch_data["participants"]) == 2


def test_achievements_streak_profile_privacy_and_cloud_sync():
    c_owner, h_owner = _register_and_login_cookies("privacy_owner")
    c_viewer, _ = _register_and_login_cookies("privacy_viewer")

    # Save session with keystrokes + bigrams + mistakes -> sync check
    res = c_owner.post(
        "/api/v1/results",
        json={
            "client_record_id": "sync-1",
            "mode": "words",
            "category": "general",
            "difficulty": "medium",
            "duration_seconds": 25.0,
            "gross_wpm": 108.0,
            "net_wpm": 104.0,
            "accuracy": 97.5,
            "consistency": 90.0,
            "correct_chars": 215,
            "incorrect_chars": 5,
            "total_chars": 220,
            "keystroke_summary": [{"expected": "q", "correct": False, "latency_ms": 210}],
            "bigram_summary": {"qu": {"attempts": 8, "errors": 2, "total_latency_ms": 1400}},
            "mistake_summary": {"q->w": 2},
        },
        headers=h_owner,
    )
    assert res.status_code == 201

    kb = c_owner.get("/api/v1/analytics/keyboard").json()
    assert kb["keys"]["q"]["errors"] == 1
    assert kb["bigrams"]["qu"]["attempts"] == 8
    assert kb["mistakes"]["q->w"] == 2

    # Unfinished lesson draft sync & clear
    c_owner.post(
        "/api/v1/learning/progress",
        json={
            "lesson_id": "beg-0-posture-setup",
            "completed": False,
            "best_wpm": 0,
            "best_accuracy": 0,
            "draft_typed_text": "ff jj ff",
            "draft_elapsed_ms": 4200,
        },
        headers=h_owner,
    )
    lp = c_owner.get("/api/v1/learning/progress").json()["progress"][0]
    assert lp["draft_typed_text"] == "ff jj ff"
    assert lp["attempts"] == 0

    c_owner.post(
        "/api/v1/learning/progress",
        json={
            "lesson_id": "beg-0-posture-setup",
            "completed": True,
            "best_wpm": 45.0,
            "best_accuracy": 98.0,
            "clear_draft": True,
        },
        headers=h_owner,
    )
    lp_after = c_owner.get("/api/v1/learning/progress").json()["progress"][0]
    assert lp_after["draft_typed_text"] is None
    assert lp_after["attempts"] == 1

    # Inject 7-day UTC practice streak & verify speed/accuracy/streak achievements
    with races_module.SessionLocal() as db:
        u = db.scalar(select(User).where(User.username == "privacy_owner"))
        base = datetime.now(timezone.utc)
        for day_offset in range(1, 7):
            db.add(
                TestResult(
                    user_id=u.id,
                    client_record_id=f"streak-day-{day_offset}",
                    mode="words",
                    category="general",
                    difficulty="medium",
                    duration_seconds=30.0,
                    gross_wpm=62.0,
                    net_wpm=60.0,
                    accuracy=96.0,
                    correct_chars=150,
                    incorrect_chars=2,
                    total_chars=152,
                    imported_from_guest=False,
                    created_at=base - timedelta(days=day_offset),
                )
            )
        db.commit()

    ach = {a["code"]: a for a in c_owner.get("/api/v1/achievements").json()["achievements"]}
    assert ach["first-test"]["unlocked"] is True
    assert ach["speed-50"]["unlocked"] is True
    assert ach["speed-80"]["unlocked"] is True
    assert ach["speed-100"]["unlocked"] is True
    assert ach["accuracy-95"]["unlocked"] is True
    assert ach["streak-7"]["unlocked"] is True

    # Profile privacy: hide stats & achievements from other users
    c_owner.patch(
        "/api/v1/profile",
        json={"show_stats": False, "show_achievements": False},
        headers=h_owner,
    )
    pub_partial = c_viewer.get("/api/v1/users/privacy_owner").json()
    assert pub_partial["is_public"] is True
    assert pub_partial["stats"] is None
    assert pub_partial["achievements"] == []

    # Hide entire profile -> viewer sees private lock, owner still sees own summary
    c_owner.patch("/api/v1/profile", json={"is_public": False}, headers=h_owner)
    pub_hidden = c_viewer.get("/api/v1/users/privacy_owner").json()
    assert pub_hidden["is_public"] is False
    assert pub_hidden["stats"] is None

    own_summary = c_owner.get("/api/v1/profile/summary").json()
    assert own_summary["stats"]["personal_best_wpm"] == 104.0
