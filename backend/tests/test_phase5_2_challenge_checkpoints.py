from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

import app.api.v1.races as races_module
from app.core.database import Base, get_db
from app.main import app
from app.models.entities import (
    Achievement,
    Challenge,
    ChallengeAttempt,
    ChallengeCompletion,
    LeaderboardEntry,
    Notification,
    TestResult,
    User,
)
from tests.conftest import auth_headers


def _reg(username: str) -> tuple[TestClient, dict[str, str]]:
    c = TestClient(app)
    res = c.post(
        "/api/v1/auth/register",
        json={
            "username": username,
            "email": f"{username}@example.com",
            "password": "Password123!",
        },
    )
    assert res.status_code == 201
    return c, auth_headers(c)


def _advance_attempt(attempt_jti: str | None = None, seconds: int = 3) -> None:
    with races_module.SessionLocal() as db:
        q = select(ChallengeAttempt).where(ChallengeAttempt.status == "active")
        if attempt_jti:
            q = q.where(ChallengeAttempt.attempt_jti == attempt_jti)
        att = db.scalar(q)
        assert att is not None
        att.started_at = att.started_at - timedelta(seconds=seconds)
        if att.last_checkpoint_at:
            att.last_checkpoint_at = att.last_checkpoint_at - timedelta(seconds=seconds)
        db.commit()


def test_challenge_rejects_missing_replayed_out_of_order_and_manipulated_checkpoints():
    c, h = _reg("cp_guard")
    ch = c.get("/api/v1/challenges?period=daily").json()["challenges"][0]
    slug = ch["slug"]
    prompt = ch["prompt_text"]
    prompt_len = len(prompt)

    token = c.post(f"/api/v1/challenges/{slug}/start", headers=h).json()["attempt_token"]

    # 1. Completing with 0 checkpoints is rejected
    assert (
        c.post(
            f"/api/v1/challenges/{slug}/complete",
            json={"attempt_token": token, "typed_text": prompt},
            headers=h,
        ).status_code
        == 400
    )

    # 2. Out-of-order seq=2 before seq=1 is rejected
    _advance_attempt(seconds=3)
    assert (
        c.post(
            f"/api/v1/challenges/{slug}/checkpoint",
            json={"attempt_token": token, "seq": 2, "chars_typed": 18},
            headers=h,
        ).status_code
        == 400
    )

    # 3. Manipulated jump (0 -> full prompt_len) is rejected
    assert (
        c.post(
            f"/api/v1/challenges/{slug}/checkpoint",
            json={"attempt_token": token, "seq": 1, "chars_typed": prompt_len},
            headers=h,
        ).status_code
        == 400
    )

    # 4. Superhuman burst speed (25 chars within < 0.2s) rejected
    token_burst = c.post(f"/api/v1/challenges/{slug}/start", headers=h).json()["attempt_token"]
    assert (
        c.post(
            f"/api/v1/challenges/{slug}/checkpoint",
            json={"attempt_token": token_burst, "seq": 1, "chars_typed": 25},
            headers=h,
        ).status_code
        == 400
    )

    # Old superseded token (`token`) is now abandoned and rejected
    assert (
        c.post(
            f"/api/v1/challenges/{slug}/checkpoint",
            json={"attempt_token": token, "seq": 1, "chars_typed": 15},
            headers=h,
        ).status_code
        == 409
    )

    # 5. Valid seq=1 -> duplicate seq=1 & regressive chars_typed rejected
    _advance_attempt(seconds=3)
    assert (
        c.post(
            f"/api/v1/challenges/{slug}/checkpoint",
            json={"attempt_token": token_burst, "seq": 1, "chars_typed": 20},
            headers=h,
        ).status_code
        == 200
    )
    assert (
        c.post(
            f"/api/v1/challenges/{slug}/checkpoint",
            json={"attempt_token": token_burst, "seq": 1, "chars_typed": 30},
            headers=h,
        ).status_code
        == 400
    )
    assert (
        c.post(
            f"/api/v1/challenges/{slug}/checkpoint",
            json={"attempt_token": token_burst, "seq": 2, "chars_typed": 15},
            headers=h,
        ).status_code
        == 400
    )

    # Completing with only 1 checkpoint (< MIN_CHALLENGE_CHECKPOINTS=2) is rejected
    assert (
        c.post(
            f"/api/v1/challenges/{slug}/complete",
            json={"attempt_token": token_burst, "typed_text": prompt},
            headers=h,
        ).status_code
        == 400
    )


def test_challenge_ignores_fabricated_timeline_and_computes_consistency_from_server_checkpoints():
    c, h = _reg("cp_consistency")
    ch = c.get("/api/v1/challenges?period=daily").json()["challenges"][0]
    slug = ch["slug"]
    prompt = ch["prompt_text"]
    prompt_len = len(prompt)

    token = c.post(f"/api/v1/challenges/{slug}/start", headers=h).json()["attempt_token"]

    # Steady server-timed checkpoints (~15 chars per 2.5s = ~72 WPM each interval)
    step = max(12, prompt_len // 4)
    pos = 0
    for seq_idx in (1, 2, 3):
        pos = min(prompt_len - 4, pos + step)
        _advance_attempt(seconds=3)
        assert (
            c.post(
                f"/api/v1/challenges/{slug}/checkpoint",
                json={"attempt_token": token, "seq": seq_idx, "chars_typed": pos},
                headers=h,
            ).status_code
            == 200
        )
    _advance_attempt(seconds=2)

    # Client tries to inject wildly erratic fabricated timeline & bogus consistency=12.0
    bogus_timeline = [
        {"second": 1, "wpm": 5, "rawWpm": 5, "accuracy": 100, "errors": 0},
        {"second": 2, "wpm": 210, "rawWpm": 210, "accuracy": 100, "errors": 0},
    ]
    done = c.post(
        f"/api/v1/challenges/{slug}/complete",
        json={
            "attempt_token": token,
            "typed_text": prompt,
            "consistency": 12.0,
            "timeline": bogus_timeline,
        },
        headers=h,
    )
    assert done.status_code == 200
    body = done.json()
    assert body["consistency_verified"] is True
    assert body["consistency"] > 60.0  # Derived from steady server checkpoints, not bogus 12.0

    # Replaying a checkpoint on an already-completed attempt fails (409)
    assert (
        c.post(
            f"/api/v1/challenges/{slug}/checkpoint",
            json={"attempt_token": token, "seq": 4, "chars_typed": prompt_len},
            headers=h,
        ).status_code
        == 409
    )


def test_concurrent_challenge_completions_are_idempotent_with_single_rewards(tmp_path):
    db_file = tmp_path / "concurrent_challenge.db"
    file_engine = create_engine(
        f"sqlite:///{db_file}",
        connect_args={"check_same_thread": False, "timeout": 15},
    )
    Base.metadata.create_all(bind=file_engine)
    FileSession = sessionmaker(autocommit=False, autoflush=False, bind=file_engine)

    def _override():
        db = FileSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override
    try:
        c = TestClient(app)
        c.post(
            "/api/v1/auth/register",
            json={"username": "conc_ch", "email": "conc_ch@e.com", "password": "Password123!"},
        )
        headers = auth_headers(c)
        cookies = dict(c.cookies)

        ch = c.get("/api/v1/challenges?period=daily").json()["challenges"][0]
        slug = ch["slug"]
        prompt = ch["prompt_text"]
        prompt_len = len(prompt)
        token = c.post(f"/api/v1/challenges/{slug}/start", headers=headers).json()["attempt_token"]

        for seq_idx, ch_cnt in enumerate((int(prompt_len * 0.35), int(prompt_len * 0.72)), start=1):
            with FileSession() as db:
                att = db.scalar(select(ChallengeAttempt).where(ChallengeAttempt.status == "active"))
                att.started_at = att.started_at - timedelta(seconds=3)
                if att.last_checkpoint_at:
                    att.last_checkpoint_at = att.last_checkpoint_at - timedelta(seconds=3)
                db.commit()
            assert (
                c.post(
                    f"/api/v1/challenges/{slug}/checkpoint",
                    json={"attempt_token": token, "seq": seq_idx, "chars_typed": ch_cnt},
                    headers=headers,
                ).status_code
                == 200
            )
        with FileSession() as db:
            att = db.scalar(select(ChallengeAttempt).where(ChallengeAttempt.status == "active"))
            att.started_at = att.started_at - timedelta(seconds=3)
            att.last_checkpoint_at = att.last_checkpoint_at - timedelta(seconds=3)
            db.commit()

        clients = []
        for _ in range(4):
            tc = TestClient(app)
            tc.cookies.update(cookies)
            clients.append(tc)

        def _submit(tc: TestClient) -> int:
            resp = tc.post(
                f"/api/v1/challenges/{slug}/complete",
                json={"attempt_token": token, "typed_text": prompt},
                headers=headers,
            )
            return resp.status_code

        with ThreadPoolExecutor(max_workers=4) as pool:
            statuses = list(pool.map(_submit, clients))
        assert all(s == 200 for s in statuses)

        with FileSession() as db:
            u = db.scalar(select(User).where(User.username == "conc_ch"))
            assert len(db.scalars(select(TestResult).where(TestResult.user_id == u.id)).all()) == 1
            assert (
                len(
                    db.scalars(
                        select(ChallengeCompletion).where(ChallengeCompletion.user_id == u.id)
                    ).all()
                )
                == 1
            )
            assert (
                len(
                    db.scalars(select(LeaderboardEntry).where(LeaderboardEntry.user_id == u.id)).all()
                )
                == 1
            )
            assert (
                len(
                    db.scalars(
                        select(Notification).where(
                            Notification.user_id == u.id, Notification.kind == "challenge_completed"
                        )
                    ).all()
                )
                == 1
            )
    finally:
        app.dependency_overrides.clear()
        file_engine.dispose()


def test_unverified_historical_challenge_consistency_preserved_but_excluded_from_consistency_rankings():
    c_legacy, _ = _reg("legacy_hist")
    c_verified, h_ver = _reg("verified_curr")

    ch = c_verified.get("/api/v1/challenges?period=daily").json()["challenges"][0]
    slug = ch["slug"]
    prompt = ch["prompt_text"]
    prompt_len = len(prompt)

    # Seed historical pre-5.2 unverified challenge completion (e.g. client-spoofed 99.9 consistency)
    with races_module.SessionLocal() as db:
        u_leg = db.scalar(select(User).where(User.username == "legacy_hist"))
        ch_row = db.scalar(select(Challenge).where(Challenge.slug == slug))
        res_leg = TestResult(
            user_id=u_leg.id,
            client_record_id="legacy-ch-1",
            mode="challenge",
            category=slug,
            difficulty="easy",
            duration_seconds=12.0,
            gross_wpm=115.0,
            net_wpm=115.0,
            accuracy=100.0,
            consistency=99.9,
            correct_chars=prompt_len,
            incorrect_chars=0,
            total_chars=prompt_len,
            verified_competitive=True,
            imported_from_guest=False,
        )
        db.add(res_leg)
        db.flush()
        db.add(
            ChallengeCompletion(
                user_id=u_leg.id,
                challenge_id=ch_row.id,
                result_id=res_leg.id,
                attempt_jti=None,
                net_wpm=115.0,
                accuracy=100.0,
                consistency=99.9,
                consistency_verified=False,
                passed=True,
            )
        )
        db.add(
            LeaderboardEntry(
                user_id=u_leg.id,
                result_id=res_leg.id,
                period="all",
                mode="challenge",
                net_wpm=115.0,
                accuracy=100.0,
            )
        )
        db.add(Achievement(user_id=u_leg.id, code="challenge-champion", title="Challenge Finisher"))
        db.commit()

    # Verified Phase 5.2 run with lower WPM (~70 WPM)
    tok = c_verified.post(f"/api/v1/challenges/{slug}/start", headers=h_ver).json()["attempt_token"]
    for seq_idx, ch_cnt in enumerate((int(prompt_len * 0.35), int(prompt_len * 0.72)), start=1):
        _advance_attempt(seconds=4)
        assert (
            c_verified.post(
                f"/api/v1/challenges/{slug}/checkpoint",
                json={"attempt_token": tok, "seq": seq_idx, "chars_typed": ch_cnt},
                headers=h_ver,
            ).status_code
            == 200
        )
    _advance_attempt(seconds=4)
    assert (
        c_verified.post(
            f"/api/v1/challenges/{slug}/complete",
            json={"attempt_token": tok, "typed_text": prompt},
            headers=h_ver,
        ).status_code
        == 200
    )

    # Sort by WPM: legacy history preserved cleanly, consistency marked unverified (None)
    by_wpm = c_legacy.get("/api/v1/leaderboard?sort_by=wpm").json()["entries"]
    leg_entry = next(e for e in by_wpm if e["username"] == "legacy_hist")
    assert leg_entry["net_wpm"] == 115.0
    assert leg_entry["consistency_verified"] is False
    assert leg_entry["consistency"] is None

    # Sort by Consistency: legacy unverified 99.9 CANNOT appear or outrank verified_curr
    by_cons = c_legacy.get("/api/v1/leaderboard?sort_by=consistency").json()["entries"]
    assert [e["username"] for e in by_cons] == ["verified_curr"]
    assert by_cons[0]["consistency_verified"] is True

    # Historical achievement & history preserved
    leg_hist = c_legacy.get("/api/v1/challenges/history").json()["history"]
    assert len(leg_hist) == 1
    assert leg_hist[0]["consistency"] is None
    assert leg_hist[0]["consistency_verified"] is False
    leg_ach = {a["code"]: a for a in c_legacy.get("/api/v1/achievements").json()["achievements"]}
    assert leg_ach["challenge-champion"]["unlocked"] is True
