import math
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_current_user_optional
from app.core.database import get_db
from app.core.rate_limit import enforce_rate_limit
from app.data.curriculum import DEFAULT_CHALLENGES
from app.models.entities import (
    Challenge,
    ChallengeAttempt,
    ChallengeCompletion,
    LeaderboardEntry,
    Profile,
    TestResult,
    User,
)
from app.schemas.api import ChallengeCheckpointRequest, ChallengeCompleteRequest
from app.services.social import (
    create_challenge_attempt_token,
    create_notification,
    evaluate_achievements,
    get_accepted_friend_ids,
    verify_challenge_attempt_token,
)

router = APIRouter(tags=["leaderboard"])

MAX_CHALLENGE_GROSS_WPM = 260.0
MAX_CHALLENGE_NET_WPM = 240.0
MAX_CHALLENGE_CHARS_PER_SECOND = 22.0
MIN_CHALLENGE_SECONDS = 2.0
MIN_CHALLENGE_CHECKPOINTS = 2
MIN_CHALLENGE_TRACKED_RATIO = 0.60


def _as_utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def _max_challenge_step(prompt_len: int) -> int:
    return max(15, int(prompt_len * 0.40))


def _ensure_default_challenges(db: Session) -> list[Challenge]:
    existing_by_slug = {
        c.slug: c for c in db.scalars(select(Challenge)).all()
    }
    changed = False
    for ch in DEFAULT_CHALLENGES:
        if ch["slug"] not in existing_by_slug:
            db.add(Challenge(**ch))
            changed = True
    if changed:
        db.commit()
    return db.scalars(select(Challenge).where(Challenge.active.is_(True))).all()


def _query_leaderboard(
    db: Session,
    since: datetime | None,
    sort_by: str = "wpm",
    scope: str = "global",
    viewer: User | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    if scope == "friends":
        if not viewer:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Sign in to view your friends leaderboard.",
            )
        allowed_ids = [viewer.id, *get_accepted_friend_ids(db, viewer.id)]
    else:
        allowed_ids = None

    stmt = (
        select(LeaderboardEntry, TestResult, User, Profile, ChallengeCompletion)
        .join(TestResult, TestResult.id == LeaderboardEntry.result_id)
        .join(User, User.id == LeaderboardEntry.user_id)
        .outerjoin(Profile, Profile.user_id == User.id)
        .outerjoin(ChallengeCompletion, ChallengeCompletion.result_id == TestResult.id)
        .where(TestResult.verified_competitive.is_(True))
    )
    if scope == "global":
        stmt = stmt.where(Profile.is_public.is_(True), Profile.show_stats.is_(True))
    elif allowed_ids is not None and viewer is not None:
        stmt = stmt.where(
            LeaderboardEntry.user_id.in_(allowed_ids),
            or_(User.id == viewer.id, Profile.show_stats.is_(True)),
        )

    if sort_by == "consistency":
        # Unverified historical challenge consistency must never influence trusted consistency rankings
        stmt = stmt.where(
            or_(
                TestResult.mode != "challenge",
                ChallengeCompletion.consistency_verified.is_(True),
            )
        )

    if since is not None:
        stmt = stmt.where(LeaderboardEntry.achieved_at >= since)

    rows = db.execute(stmt).all()

    def _sort_key(
        item: tuple[LeaderboardEntry, TestResult, User, Profile | None, ChallengeCompletion | None],
    ):
        entry, result, user, _, comp = item
        verified_cons = result.mode != "challenge" or bool(comp and comp.consistency_verified)
        eff_consistency = result.consistency if verified_cons else -1.0
        primary = (
            entry.accuracy
            if sort_by == "accuracy"
            else eff_consistency
            if sort_by == "consistency"
            else entry.net_wpm
        )
        return (
            -primary,
            -entry.net_wpm,
            -entry.accuracy,
            -eff_consistency,
            entry.achieved_at.timestamp(),
            user.username,
        )

    rows_sorted = sorted(rows, key=_sort_key)

    best_per_user: list[
        tuple[LeaderboardEntry, TestResult, User, Profile | None, ChallengeCompletion | None]
    ] = []
    seen_users: set[str] = set()
    for item in rows_sorted:
        uid = item[2].id
        if uid in seen_users:
            continue
        seen_users.add(uid)
        best_per_user.append(item)

    total = len(best_per_user)
    start_idx = (page - 1) * page_size
    page_items = best_per_user[start_idx : start_idx + page_size]

    entries = []
    for offset, (entry, result, user, profile, comp) in enumerate(page_items):
        verified_cons = result.mode != "challenge" or bool(comp and comp.consistency_verified)
        entries.append(
            {
                "rank": start_idx + offset + 1,
                "username": user.username,
                "display_name": profile.display_name if profile else user.username,
                "net_wpm": entry.net_wpm,
                "accuracy": entry.accuracy,
                "consistency": result.consistency if verified_cons else None,
                "consistency_verified": verified_cons,
                "mode": entry.mode,
                "verified_competitive": True,
                "achieved_at": entry.achieved_at,
            }
        )

    return {
        "sort_by": sort_by,
        "scope": scope,
        "page": page,
        "page_size": page_size,
        "total": total,
        "entries": entries,
    }


@router.get("/leaderboard")
def leaderboard_all(
    sort_by: str = Query(default="wpm", pattern="^(wpm|accuracy|consistency)$"),
    scope: str = Query(default="global", pattern="^(global|friends)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_current_user_optional),
) -> dict:
    res = _query_leaderboard(db, since=None, sort_by=sort_by, scope=scope, viewer=viewer, page=page, page_size=page_size)
    return {"period": "all", **res}


@router.get("/leaderboard/daily")
def leaderboard_daily(
    sort_by: str = Query(default="wpm", pattern="^(wpm|accuracy|consistency)$"),
    scope: str = Query(default="global", pattern="^(global|friends)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_current_user_optional),
) -> dict:
    since = datetime.now(timezone.utc) - timedelta(days=1)
    res = _query_leaderboard(db, since=since, sort_by=sort_by, scope=scope, viewer=viewer, page=page, page_size=page_size)
    return {"period": "daily", **res}


@router.get("/leaderboard/weekly")
def leaderboard_weekly(
    sort_by: str = Query(default="wpm", pattern="^(wpm|accuracy|consistency)$"),
    scope: str = Query(default="global", pattern="^(global|friends)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_current_user_optional),
) -> dict:
    since = datetime.now(timezone.utc) - timedelta(days=7)
    res = _query_leaderboard(db, since=since, sort_by=sort_by, scope=scope, viewer=viewer, page=page, page_size=page_size)
    return {"period": "weekly", **res}


@router.get("/leaderboard/monthly")
def leaderboard_monthly(
    sort_by: str = Query(default="wpm", pattern="^(wpm|accuracy|consistency)$"),
    scope: str = Query(default="global", pattern="^(global|friends)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_current_user_optional),
) -> dict:
    since = datetime.now(timezone.utc) - timedelta(days=30)
    res = _query_leaderboard(db, since=since, sort_by=sort_by, scope=scope, viewer=viewer, page=page, page_size=page_size)
    return {"period": "monthly", **res}


def _serialize_challenges(db: Session, rows: list[Challenge], viewer: User | None) -> list[dict]:
    user_best: dict[str, dict] = {}
    if viewer:
        comps = db.scalars(
            select(ChallengeCompletion).where(ChallengeCompletion.user_id == viewer.id)
        ).all()
        for c in comps:
            cur = user_best.get(c.challenge_id)
            if not cur:
                user_best[c.challenge_id] = {
                    "passed": c.passed,
                    "best_wpm": c.net_wpm,
                    "attempts": 1,
                }
            else:
                cur["passed"] = cur["passed"] or c.passed
                cur["best_wpm"] = max(cur["best_wpm"], c.net_wpm)
                cur["attempts"] += 1

    return [
        {
            "id": ch.id,
            "slug": ch.slug,
            "title": ch.title,
            "period": ch.period,
            "difficulty": ch.difficulty,
            "prompt_text": ch.prompt_text,
            "target_wpm": ch.target_wpm,
            "user_passed": user_best.get(ch.id, {}).get("passed", False),
            "user_best_wpm": user_best.get(ch.id, {}).get("best_wpm", 0.0),
            "user_attempts": user_best.get(ch.id, {}).get("attempts", 0),
        }
        for ch in rows
    ]


@router.get("/leaderboard/challenges")
@router.get("/challenges")
def list_challenges(
    period: str | None = Query(default=None, pattern="^(daily|weekly)$"),
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_current_user_optional),
) -> dict:
    rows = _ensure_default_challenges(db)
    if period:
        rows = [r for r in rows if r.period == period]
    return {"challenges": _serialize_challenges(db, rows, viewer)}


@router.get("/challenges/history")
def get_challenge_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    rows = db.execute(
        select(ChallengeCompletion, Challenge)
        .join(Challenge, Challenge.id == ChallengeCompletion.challenge_id)
        .where(ChallengeCompletion.user_id == current_user.id)
        .order_by(desc(ChallengeCompletion.completed_at))
        .limit(50)
    ).all()
    return {
        "history": [
            {
                "id": comp.id,
                "challenge_slug": ch.slug,
                "challenge_title": ch.title,
                "period": ch.period,
                "difficulty": ch.difficulty,
                "target_wpm": ch.target_wpm,
                "net_wpm": comp.net_wpm,
                "accuracy": comp.accuracy,
                "consistency": comp.consistency if comp.consistency_verified else None,
                "consistency_verified": comp.consistency_verified,
                "passed": comp.passed,
                "completed_at": comp.completed_at,
            }
            for comp, ch in rows
        ]
    }


def _compute_consistency_from_wpm_samples(wpm_values: list[float]) -> float:
    valid = [float(v) for v in wpm_values if math.isfinite(v) and v >= 0]
    if len(valid) < 2:
        return 100.0 if (len(valid) == 1 and valid[0] > 0) else 0.0
    mean = sum(valid) / len(valid)
    if mean <= 0:
        return 0.0
    variance = sum((v - mean) ** 2 for v in valid) / len(valid)
    std_dev = math.sqrt(variance)
    cv = std_dev / mean
    return round(max(0.0, min(100.0, (1.0 - cv) * 100.0)), 1)


@router.post(
    "/challenges/{slug}/start",
    dependencies=[Depends(enforce_rate_limit("challenge_start", limit=20, window_seconds=60))],
)
def start_challenge(
    slug: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    _ensure_default_challenges(db)
    ch = db.scalar(select(Challenge).where(Challenge.slug == slug, Challenge.active.is_(True)))
    if not ch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Challenge not found.")

    token = create_challenge_attempt_token(current_user.id, ch.id)
    verified = verify_challenge_attempt_token(token, current_user.id, ch.id)
    assert verified is not None
    started_at, attempt_jti = verified

    # Mark any prior incomplete active attempts for this user+challenge as abandoned
    stale = db.scalars(
        select(ChallengeAttempt).where(
            ChallengeAttempt.user_id == current_user.id,
            ChallengeAttempt.challenge_id == ch.id,
            ChallengeAttempt.status == "active",
        )
    ).all()
    for s in stale:
        s.status = "abandoned"

    db.add(
        ChallengeAttempt(
            attempt_jti=attempt_jti,
            user_id=current_user.id,
            challenge_id=ch.id,
            started_at=started_at,
            status="active",
        )
    )
    db.commit()

    return {
        "challenge": _serialize_challenges(db, [ch], current_user)[0],
        "attempt_token": token,
    }


@router.post(
    "/challenges/{slug}/checkpoint",
    dependencies=[Depends(enforce_rate_limit("challenge_checkpoint", limit=180, window_seconds=60))],
)
def record_challenge_checkpoint(
    slug: str,
    payload: ChallengeCheckpointRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    _ensure_default_challenges(db)
    ch = db.scalar(select(Challenge).where(Challenge.slug == slug, Challenge.active.is_(True)))
    if not ch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Challenge not found.")

    verified = verify_challenge_attempt_token(payload.attempt_token, current_user.id, ch.id)
    if verified is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired challenge attempt token.",
        )
    _, attempt_jti = verified

    attempt = db.scalar(
        select(ChallengeAttempt).where(
            ChallengeAttempt.attempt_jti == attempt_jti,
            ChallengeAttempt.user_id == current_user.id,
            ChallengeAttempt.challenge_id == ch.id,
        )
    )
    if not attempt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Challenge attempt session not found.",
        )
    if attempt.status != "active":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Challenge attempt is no longer active.",
        )

    if payload.seq != attempt.checkpoints_count + 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Out-of-order or duplicate checkpoint sequence.",
        )

    prompt_len = len(ch.prompt_text)
    if payload.chars_typed <= 0 or payload.chars_typed > prompt_len:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid checkpoint character count.",
        )
    if payload.chars_typed <= attempt.last_chars_typed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Checkpoint progress must strictly advance.",
        )

    delta_chars = payload.chars_typed - attempt.last_chars_typed
    if delta_chars > _max_challenge_step(prompt_len):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Impossible checkpoint progress jump rejected.",
        )

    now = datetime.now(timezone.utc)
    started = _as_utc(attempt.started_at)
    total_elapsed = (now - started).total_seconds()
    if total_elapsed <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Challenge attempt has not started.",
        )

    prev_ts = _as_utc(attempt.last_checkpoint_at) if attempt.last_checkpoint_at else started
    interval_dt = max(0.05, (now - prev_ts).total_seconds())
    if delta_chars > 10 and (delta_chars / interval_dt) > MAX_CHALLENGE_CHARS_PER_SECOND:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Suspicious burst typing speed detected.",
        )

    cum_wpm = (payload.chars_typed / 5.0) / (max(total_elapsed, 0.25) / 60.0)
    if payload.chars_typed > 12 and cum_wpm > MAX_CHALLENGE_NET_WPM:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Suspicious cumulative typing speed detected.",
        )

    interval_wpm = round((delta_chars / 5.0) / (max(interval_dt, 0.15) / 60.0), 1)
    checkpoints = list(attempt.checkpoints_json or [])
    checkpoints.append(
        {
            "seq": payload.seq,
            "second": max(1, round(total_elapsed)),
            "chars_typed": payload.chars_typed,
            "elapsed_ms": round(total_elapsed * 1000.0, 1),
            "interval_wpm": interval_wpm,
            "wpm": round(cum_wpm, 1),
            "recorded_at": now.isoformat(),
        }
    )

    attempt.checkpoints_json = checkpoints
    attempt.last_chars_typed = payload.chars_typed
    attempt.last_checkpoint_at = now
    attempt.checkpoints_count = payload.seq
    db.commit()

    return {
        "seq": payload.seq,
        "chars_typed": payload.chars_typed,
        "interval_wpm": interval_wpm,
        "checkpoints_count": attempt.checkpoints_count,
    }


@router.post(
    "/challenges/{slug}/complete",
    dependencies=[Depends(enforce_rate_limit("challenge_complete", limit=30, window_seconds=60))],
)
def complete_challenge(
    slug: str,
    payload: ChallengeCompleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    _ensure_default_challenges(db)
    ch = db.scalar(select(Challenge).where(Challenge.slug == slug, Challenge.active.is_(True)))
    if not ch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Challenge not found.")

    verified = verify_challenge_attempt_token(payload.attempt_token, current_user.id, ch.id)
    if verified is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired challenge attempt token.",
        )
    _, attempt_jti = verified

    # Replay / idempotency check before grading
    existing_comp = db.scalar(
        select(ChallengeCompletion).where(ChallengeCompletion.attempt_jti == attempt_jti)
    )
    if existing_comp:
        existing_res = db.get(TestResult, existing_comp.result_id)
        return {
            "passed": existing_comp.passed,
            "net_wpm": existing_comp.net_wpm,
            "gross_wpm": existing_res.gross_wpm if existing_res else existing_comp.net_wpm,
            "accuracy": existing_comp.accuracy,
            "consistency": existing_comp.consistency if existing_comp.consistency_verified else None,
            "consistency_verified": existing_comp.consistency_verified,
            "target_wpm": ch.target_wpm,
            "duration_seconds": existing_res.duration_seconds if existing_res else 0.0,
            "verified_competitive": True,
        }

    attempt = db.scalar(
        select(ChallengeAttempt).where(
            ChallengeAttempt.attempt_jti == attempt_jti,
            ChallengeAttempt.user_id == current_user.id,
            ChallengeAttempt.challenge_id == ch.id,
        )
    )
    if not attempt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Challenge attempt session not found.",
        )
    if attempt.status == "abandoned":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Challenge attempt was superseded or abandoned.",
        )

    prompt_len = len(ch.prompt_text)
    if len(payload.typed_text) != prompt_len:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Challenge submission must match full prompt length.",
        )

    # Require progressive server-recorded checkpoints before completion
    min_tracked = int(prompt_len * MIN_CHALLENGE_TRACKED_RATIO)
    if (
        attempt.checkpoints_count < MIN_CHALLENGE_CHECKPOINTS
        or attempt.last_chars_typed < min_tracked
        or (prompt_len - attempt.last_chars_typed) > _max_challenge_step(prompt_len)
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing or insufficient server-recorded progress checkpoints.",
        )

    now = datetime.now(timezone.utc)
    started = _as_utc(attempt.started_at)
    server_elapsed = (now - started).total_seconds()
    min_plausible = max(MIN_CHALLENGE_SECONDS, prompt_len / MAX_CHALLENGE_CHARS_PER_SECOND)
    if server_elapsed < min_plausible:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Challenge completed faster than humanly plausible.",
        )

    tail_chars = prompt_len - attempt.last_chars_typed
    tail_dt = (
        max(0.05, (now - _as_utc(attempt.last_checkpoint_at)).total_seconds())
        if attempt.last_checkpoint_at
        else server_elapsed
    )
    if tail_chars > 10 and (tail_chars / tail_dt) > MAX_CHALLENGE_CHARS_PER_SECOND:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Final completion burst faster than humanly plausible.",
        )

    correct_chars = sum(1 for a, b in zip(ch.prompt_text, payload.typed_text) if a == b)
    incorrect_chars = prompt_len - correct_chars
    gross_wpm = round((prompt_len / 5.0) / (server_elapsed / 60.0), 1)
    net_wpm = round(max(0.0, gross_wpm - (incorrect_chars / 5.0) / (server_elapsed / 60.0)), 1)
    accuracy = round((correct_chars / prompt_len) * 100.0, 1)

    if gross_wpm > MAX_CHALLENGE_GROSS_WPM or net_wpm > MAX_CHALLENGE_NET_WPM:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Submission flagged by server speed sanity check.",
        )

    # Calculate consistency strictly from server-recorded checkpoint intervals (never client payload)
    checkpoints = list(attempt.checkpoints_json or [])
    interval_samples = [float(cp.get("interval_wpm", 0.0)) for cp in checkpoints]
    if tail_chars > 0:
        tail_wpm = round((tail_chars / 5.0) / (max(tail_dt, 0.15) / 60.0), 1)
        interval_samples.append(tail_wpm)
        checkpoints.append(
            {
                "seq": attempt.checkpoints_count + 1,
                "second": max(1, round(server_elapsed)),
                "chars_typed": prompt_len,
                "elapsed_ms": round(server_elapsed * 1000.0, 1),
                "interval_wpm": tail_wpm,
                "wpm": net_wpm,
                "recorded_at": now.isoformat(),
            }
        )

    server_consistency = _compute_consistency_from_wpm_samples(interval_samples)
    server_timeline = [
        {
            "second": int(cp.get("second", idx + 1)),
            "wpm": float(cp.get("interval_wpm", 0.0)),
            "rawWpm": float(cp.get("interval_wpm", 0.0)),
            "accuracy": accuracy,
            "errors": 0,
        }
        for idx, cp in enumerate(checkpoints)
    ]

    passed = net_wpm >= ch.target_wpm and accuracy >= 90.0
    client_rec_id = f"challenge-{ch.slug}-{attempt_jti}"

    try:
        res = TestResult(
            user_id=current_user.id,
            client_record_id=client_rec_id,
            mode="challenge",
            category=ch.slug,
            difficulty=ch.difficulty,
            duration_seconds=round(server_elapsed, 2),
            gross_wpm=gross_wpm,
            net_wpm=net_wpm,
            accuracy=accuracy,
            consistency=server_consistency,
            correct_chars=correct_chars,
            incorrect_chars=incorrect_chars,
            total_chars=prompt_len,
            timeline_json=server_timeline,
            verified_competitive=True,
            imported_from_guest=False,
        )
        db.add(res)
        db.flush()

        completion = ChallengeCompletion(
            user_id=current_user.id,
            challenge_id=ch.id,
            result_id=res.id,
            attempt_jti=attempt_jti,
            net_wpm=net_wpm,
            accuracy=accuracy,
            consistency=server_consistency,
            consistency_verified=True,
            passed=passed,
        )
        db.add(completion)

        db.add(
            LeaderboardEntry(
                user_id=current_user.id,
                result_id=res.id,
                period="all",
                mode="challenge",
                net_wpm=net_wpm,
                accuracy=accuracy,
            )
        )
        attempt.status = "completed"
        attempt.completed_at = now
        attempt.last_chars_typed = prompt_len
        db.flush()
    except IntegrityError:
        db.rollback()
        existing_comp = db.scalar(
            select(ChallengeCompletion).where(ChallengeCompletion.attempt_jti == attempt_jti)
        )
        if existing_comp:
            existing_res = db.get(TestResult, existing_comp.result_id)
            return {
                "passed": existing_comp.passed,
                "net_wpm": existing_comp.net_wpm,
                "gross_wpm": existing_res.gross_wpm if existing_res else existing_comp.net_wpm,
                "accuracy": existing_comp.accuracy,
                "consistency": existing_comp.consistency if existing_comp.consistency_verified else None,
                "consistency_verified": existing_comp.consistency_verified,
                "target_wpm": ch.target_wpm,
                "duration_seconds": existing_res.duration_seconds if existing_res else 0.0,
                "verified_competitive": True,
            }
        raise

    if passed:
        create_notification(
            db,
            user_id=current_user.id,
            kind="challenge_completed",
            title="Challenge Completed!",
            message=f"You passed '{ch.title}' at {net_wpm} WPM ({accuracy}% accuracy).",
            link="/leaderboard",
            reference_id=ch.id,
        )

    evaluate_achievements(db, current_user.id, notify=True)
    db.commit()

    return {
        "passed": passed,
        "net_wpm": net_wpm,
        "gross_wpm": gross_wpm,
        "accuracy": accuracy,
        "consistency": server_consistency,
        "consistency_verified": True,
        "target_wpm": ch.target_wpm,
        "duration_seconds": round(server_elapsed, 2),
        "verified_competitive": True,
    }


@router.get("/challenges/{slug}/leaderboard")
def challenge_leaderboard(
    slug: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
) -> dict:
    _ensure_default_challenges(db)
    ch = db.scalar(select(Challenge).where(Challenge.slug == slug))
    if not ch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Challenge not found.")

    rows = db.execute(
        select(ChallengeCompletion, User, Profile)
        .join(User, User.id == ChallengeCompletion.user_id)
        .outerjoin(Profile, Profile.user_id == User.id)
        .where(
            ChallengeCompletion.challenge_id == ch.id,
            Profile.is_public.is_(True),
            Profile.show_stats.is_(True),
        )
        .order_by(desc(ChallengeCompletion.net_wpm), desc(ChallengeCompletion.accuracy))
    ).all()

    best_per_user = []
    seen: set[str] = set()
    for comp, user, profile in rows:
        if user.id in seen:
            continue
        seen.add(user.id)
        best_per_user.append((comp, user, profile))

    total = len(best_per_user)
    start_idx = (page - 1) * page_size
    page_items = best_per_user[start_idx : start_idx + page_size]

    return {
        "challenge": {
            "slug": ch.slug,
            "title": ch.title,
            "period": ch.period,
            "difficulty": ch.difficulty,
            "target_wpm": ch.target_wpm,
        },
        "page": page,
        "page_size": page_size,
        "total": total,
        "entries": [
            {
                "rank": start_idx + idx + 1,
                "username": user.username,
                "display_name": profile.display_name if profile else user.username,
                "net_wpm": comp.net_wpm,
                "accuracy": comp.accuracy,
                "consistency": comp.consistency if comp.consistency_verified else None,
                "consistency_verified": comp.consistency_verified,
                "passed": comp.passed,
                "completed_at": comp.completed_at,
            }
            for idx, (comp, user, profile) in enumerate(page_items)
        ],
    }
