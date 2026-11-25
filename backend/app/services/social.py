import secrets
from datetime import datetime, timedelta, timezone
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.data.curriculum import CURRICULUM_LESSONS
from app.models.entities import (
    Achievement,
    ChallengeCompletion,
    Friendship,
    LearningProgress,
    Notification,
    RaceParticipant,
    TestResult,
)

CHALLENGE_SALT = "keysprint-challenge-attempt"
CHALLENGE_TOKEN_MAX_AGE_SECONDS = 600
_challenge_serializer = URLSafeTimedSerializer(settings.SECRET_KEY, salt=CHALLENGE_SALT)


def create_challenge_attempt_token(user_id: str, challenge_id: str) -> str:
    return _challenge_serializer.dumps(
        {
            "uid": user_id,
            "cid": challenge_id,
            "jti": secrets.token_hex(16),
            "started_at": datetime.now(timezone.utc).timestamp(),
        }
    )


def verify_challenge_attempt_token(
    token: str,
    user_id: str,
    challenge_id: str,
    max_age: int = CHALLENGE_TOKEN_MAX_AGE_SECONDS,
) -> tuple[datetime, str] | None:
    try:
        data = _challenge_serializer.loads(token, max_age=max_age)
    except (BadSignature, SignatureExpired):
        return None
    if not isinstance(data, dict):
        return None
    if data.get("uid") != user_id or data.get("cid") != challenge_id:
        return None
    started_ts = data.get("started_at")
    jti = data.get("jti")
    if not isinstance(started_ts, (int, float)) or not isinstance(jti, str) or len(jti) < 8:
        return None
    started_dt = datetime.fromtimestamp(float(started_ts), tz=timezone.utc)
    if (datetime.now(timezone.utc) - started_dt).total_seconds() > max_age:
        return None
    return (started_dt, jti)


def create_notification(
    db: Session,
    user_id: str,
    kind: str,
    title: str,
    message: str,
    link: str = "",
    reference_id: str | None = None,
) -> Notification | None:
    if reference_id:
        existing = db.scalar(
            select(Notification).where(
                Notification.user_id == user_id,
                Notification.kind == kind,
                Notification.reference_id == reference_id,
                Notification.is_read.is_(False),
            )
        )
        if existing:
            return None

    note = Notification(
        user_id=user_id,
        kind=kind,
        title=title[:120],
        message=message[:280],
        link=link[:200],
        reference_id=reference_id,
    )
    db.add(note)
    return note


def compute_practice_streak(timestamps: list[datetime]) -> tuple[int, int]:
    if not timestamps:
        return (0, 0)
    unique_days = sorted(
        {
            (
                dt.astimezone(timezone.utc)
                if dt.tzinfo is not None
                else dt.replace(tzinfo=timezone.utc)
            ).date()
            for dt in timestamps
        }
    )
    if not unique_days:
        return (0, 0)

    best_streak = 1
    run = 1
    for i in range(1, len(unique_days)):
        if unique_days[i] - unique_days[i - 1] == timedelta(days=1):
            run += 1
            best_streak = max(best_streak, run)
        else:
            run = 1

    today = datetime.now(timezone.utc).date()
    if today - unique_days[-1] > timedelta(days=1):
        current_streak = 0
    else:
        current_streak = 1
        for i in range(len(unique_days) - 1, 0, -1):
            if unique_days[i] - unique_days[i - 1] == timedelta(days=1):
                current_streak += 1
            else:
                break

    return (current_streak, best_streak)


def get_accepted_friend_ids(db: Session, user_id: str) -> list[str]:
    rows = db.scalars(
        select(Friendship).where(
            Friendship.status == "accepted",
            or_(Friendship.requester_id == user_id, Friendship.addressee_id == user_id),
        )
    ).all()
    return [r.addressee_id if r.requester_id == user_id else r.requester_id for r in rows]


def evaluate_achievements(db: Session, user_id: str, notify: bool = True) -> list[dict]:
    validated_results = db.scalars(
        select(TestResult).where(
            TestResult.user_id == user_id,
            TestResult.imported_from_guest.is_(False),
        )
    ).all()

    completed_lessons = len(
        db.scalars(
            select(LearningProgress).where(
                LearningProgress.user_id == user_id,
                LearningProgress.completed.is_(True),
            )
        ).all()
    )

    race_wins = len(
        [
            p
            for p in db.scalars(
                select(RaceParticipant).where(
                    RaceParticipant.user_id == user_id,
                    RaceParticipant.finished.is_(True),
                    RaceParticipant.placement == 1,
                )
            ).all()
            if len(p.room.participants) >= 2
        ]
    )

    passed_challenges = len(
        db.scalars(
            select(ChallengeCompletion).where(
                ChallengeCompletion.user_id == user_id,
                ChallengeCompletion.passed.is_(True),
            )
        ).all()
    )

    total_tests = len(validated_results)
    qualifying_speed = [r.net_wpm for r in validated_results if r.total_chars >= 15]
    best_wpm = round(max(qualifying_speed, default=0.0), 1)
    qualifying_acc = [r.accuracy for r in validated_results if r.total_chars >= 20]
    best_acc = round(max(qualifying_acc, default=0.0), 1)
    _, best_streak = compute_practice_streak([r.created_at for r in validated_results])

    total_curriculum = len(CURRICULUM_LESSONS)
    specs = [
        {
            "code": "first-test",
            "title": "First Test Completed",
            "description": "Complete your first verified practice or competitive typing test.",
            "category": "milestone",
            "current": min(total_tests, 1),
            "target": 1,
            "met": total_tests >= 1,
        },
        {
            "code": "first-lesson",
            "title": "First Academy Lesson Completed",
            "description": "Pass your first structured Learning Academy lesson.",
            "category": "academy",
            "current": min(completed_lessons, 1),
            "target": 1,
            "met": completed_lessons >= 1,
        },
        {
            "code": "halfway-academy",
            "title": "Full Keyboard Fluency (6+ Lessons)",
            "description": "Pass at least 6 Learning Academy lessons.",
            "category": "academy",
            "current": min(completed_lessons, 6),
            "target": 6,
            "met": completed_lessons >= 6,
        },
        {
            "code": "academy-graduate",
            "title": "Academy Graduate (All Lessons Passed)",
            "description": f"Pass all {total_curriculum} curriculum lessons.",
            "category": "academy",
            "current": min(completed_lessons, total_curriculum),
            "target": total_curriculum,
            "met": completed_lessons >= total_curriculum,
        },
        {
            "code": "speed-50",
            "title": "50 WPM Milestone",
            "description": "Reach at least 50 net WPM on a validated test.",
            "category": "speed",
            "current": min(int(best_wpm), 50),
            "target": 50,
            "met": best_wpm >= 50.0,
        },
        {
            "code": "speed-80",
            "title": "80 WPM Milestone",
            "description": "Reach at least 80 net WPM on a validated test.",
            "category": "speed",
            "current": min(int(best_wpm), 80),
            "target": 80,
            "met": best_wpm >= 80.0,
        },
        {
            "code": "speed-100",
            "title": "100 WPM Milestone",
            "description": "Break the 100 net WPM barrier on a validated test.",
            "category": "speed",
            "current": min(int(best_wpm), 100),
            "target": 100,
            "met": best_wpm >= 100.0,
        },
        {
            "code": "accuracy-95",
            "title": "95% Accuracy Milestone",
            "description": "Achieve 95% or higher accuracy on a validated test.",
            "category": "accuracy",
            "current": min(int(best_acc), 95),
            "target": 95,
            "met": best_acc >= 95.0,
        },
        {
            "code": "streak-7",
            "title": "Seven-Day Practice Streak",
            "description": "Practice on 7 consecutive UTC days.",
            "category": "consistency",
            "current": min(best_streak, 7),
            "target": 7,
            "met": best_streak >= 7,
        },
        {
            "code": "race-victory",
            "title": "Competitive Race Champion",
            "description": "Win a multiplayer race room against at least one opponent.",
            "category": "competition",
            "current": min(race_wins, 1),
            "target": 1,
            "met": race_wins >= 1,
        },
        {
            "code": "challenge-champion",
            "title": "Challenge Finisher",
            "description": "Pass a verified daily or weekly typing challenge.",
            "category": "competition",
            "current": min(passed_challenges, 1),
            "target": 1,
            "met": passed_challenges >= 1,
        },
    ]

    existing_rows = db.scalars(
        select(Achievement).where(Achievement.user_id == user_id)
    ).all()
    by_code = {a.code: a for a in existing_rows}

    for spec in specs:
        if spec["met"] and spec["code"] not in by_code:
            inserted = False
            try:
                with db.begin_nested():
                    ach = Achievement(user_id=user_id, code=spec["code"], title=spec["title"])
                    db.add(ach)
                    db.flush()
                    by_code[spec["code"]] = ach
                    inserted = True
            except IntegrityError:
                existing = db.scalar(
                    select(Achievement).where(
                        Achievement.user_id == user_id,
                        Achievement.code == spec["code"],
                    )
                )
                if existing:
                    by_code[spec["code"]] = existing

            if inserted and notify:
                create_notification(
                    db,
                    user_id=user_id,
                    kind="achievement_unlocked",
                    title="Achievement Unlocked!",
                    message=f"You unlocked '{spec['title']}': {spec['description']}",
                    link="/profile",
                    reference_id=spec["code"],
                )

    db.flush()

    return [
        {
            "code": spec["code"],
            "title": spec["title"],
            "description": spec["description"],
            "category": spec["category"],
            "unlocked": spec["code"] in by_code,
            "earned_at": by_code[spec["code"]].earned_at if spec["code"] in by_code else None,
            "progress_current": spec["target"] if spec["code"] in by_code else spec["current"],
            "progress_target": spec["target"],
        }
        for spec in specs
    ]
