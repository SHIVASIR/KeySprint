from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import and_, desc, or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_current_user_optional
from app.core.database import get_db
from app.core.rate_limit import enforce_rate_limit
from app.core.security import CSRF_COOKIE_NAME, SESSION_COOKIE_NAME
from app.models.entities import (
    Friendship,
    Profile,
    RaceParticipant,
    RaceRoom,
    TestResult,
    User,
)
from app.schemas.api import ProfileUpdateRequest, UserResponse
from app.services.social import compute_practice_streak, evaluate_achievements

router = APIRouter(tags=["profile"])


def _build_user_stats(db: Session, user_id: str) -> dict:
    results = db.scalars(
        select(TestResult).where(TestResult.user_id == user_id)
    ).all()
    if not results:
        return {
            "total_tests": 0,
            "personal_best_wpm": 0.0,
            "average_wpm": 0.0,
            "average_accuracy": 0.0,
            "total_practice_seconds": 0.0,
            "current_streak_days": 0,
            "best_streak_days": 0,
            "race_wins": 0,
        }

    total_tests = len(results)
    best_wpm = round(max(r.net_wpm for r in results), 1)
    avg_wpm = round(sum(r.net_wpm for r in results) / total_tests, 1)
    avg_acc = round(sum(r.accuracy for r in results) / total_tests, 1)
    total_sec = round(sum(r.duration_seconds for r in results), 1)
    cur_streak, best_streak = compute_practice_streak([r.created_at for r in results])
    race_wins = len(
        db.scalars(
            select(RaceParticipant).where(
                RaceParticipant.user_id == user_id,
                RaceParticipant.finished.is_(True),
                RaceParticipant.placement == 1,
            )
        ).all()
    )
    return {
        "total_tests": total_tests,
        "personal_best_wpm": best_wpm,
        "average_wpm": avg_wpm,
        "average_accuracy": avg_acc,
        "total_practice_seconds": total_sec,
        "current_streak_days": cur_streak,
        "best_streak_days": best_streak,
        "race_wins": race_wins,
    }


def _build_race_history(db: Session, user_id: str, limit: int = 10) -> list[dict]:
    rows = db.execute(
        select(RaceParticipant, RaceRoom)
        .join(RaceRoom, RaceRoom.id == RaceParticipant.room_id)
        .where(
            RaceParticipant.user_id == user_id,
            RaceParticipant.finished.is_(True),
        )
        .order_by(desc(RaceParticipant.finished_at))
        .limit(limit)
    ).all()
    return [
        {
            "room_code": room.code,
            "difficulty": room.difficulty,
            "wpm": part.wpm,
            "accuracy": part.accuracy,
            "placement": part.placement,
            "finished_at": part.finished_at,
        }
        for part, room in rows
    ]


def _friendship_status(db: Session, viewer_id: str | None, target_id: str) -> str:
    if not viewer_id:
        return "none"
    if viewer_id == target_id:
        return "self"
    row = db.scalar(
        select(Friendship).where(
            or_(
                and_(
                    Friendship.requester_id == viewer_id,
                    Friendship.addressee_id == target_id,
                ),
                and_(
                    Friendship.requester_id == target_id,
                    Friendship.addressee_id == viewer_id,
                ),
            )
        )
    )
    if not row or row.status == "rejected":
        return "none"
    if row.status == "accepted":
        return "friends"
    return "outgoing_pending" if row.requester_id == viewer_id else "incoming_pending"


@router.get("/profile", response_model=UserResponse)
def get_profile(current_user: User = Depends(get_current_user)) -> UserResponse:
    p = current_user.profile
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        display_name=p.display_name if p else current_user.username,
        bio=p.bio if p else "",
        preferred_layout=p.preferred_layout if p else "qwerty-ansi",
        is_public=p.is_public if p else True,
        show_stats=p.show_stats if p else True,
        show_achievements=p.show_achievements if p else True,
        show_race_history=p.show_race_history if p else True,
        created_at=current_user.created_at,
    )


@router.get("/profile/summary")
def get_own_profile_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    achievements = evaluate_achievements(db, current_user.id, notify=False)
    return {
        "stats": _build_user_stats(db, current_user.id),
        "achievements": achievements,
        "race_history": _build_race_history(db, current_user.id),
    }


@router.patch(
    "/profile",
    response_model=UserResponse,
    dependencies=[Depends(enforce_rate_limit("profile_update", limit=20, window_seconds=60))],
)
def update_profile(
    payload: ProfileUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    profile = current_user.profile
    if not profile:
        profile = Profile(user_id=current_user.id, display_name=current_user.username)
        db.add(profile)

    if payload.display_name is not None:
        profile.display_name = payload.display_name.strip()
    if payload.bio is not None:
        profile.bio = payload.bio.strip()
    if payload.preferred_layout is not None:
        profile.preferred_layout = payload.preferred_layout
    if payload.is_public is not None:
        profile.is_public = payload.is_public
    if payload.show_stats is not None:
        profile.show_stats = payload.show_stats
    if payload.show_achievements is not None:
        profile.show_achievements = payload.show_achievements
    if payload.show_race_history is not None:
        profile.show_race_history = payload.show_race_history

    db.commit()
    db.refresh(current_user)
    return get_profile(current_user)


@router.delete("/profile", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    db.delete(current_user)
    db.commit()
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    response.delete_cookie(CSRF_COOKIE_NAME, path="/")


@router.get("/users/{username}")
def get_public_profile(
    username: str,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_current_user_optional),
) -> dict:
    target = db.scalar(
        select(User).where(User.username == username.strip().lower(), User.is_active.is_(True))
    )
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    p = target.profile
    is_owner = viewer is not None and viewer.id == target.id
    is_public = p.is_public if p else True
    rel = _friendship_status(db, viewer.id if viewer else None, target.id)

    if not is_public and not is_owner:
        return {
            "username": target.username,
            "display_name": target.username,
            "bio": "",
            "preferred_layout": "",
            "created_at": None,
            "is_public": False,
            "friendship_status": rel,
            "stats": None,
            "achievements": [],
            "race_history": [],
        }

    show_stats = is_owner or (p.show_stats if p else True)
    show_achievements = is_owner or (p.show_achievements if p else True)
    show_race_history = is_owner or (p.show_race_history if p else True)

    achievements = (
        [a for a in evaluate_achievements(db, target.id, notify=False) if a["unlocked"]]
        if show_achievements
        else []
    )

    return {
        "username": target.username,
        "display_name": p.display_name if p else target.username,
        "bio": p.bio if p else "",
        "preferred_layout": p.preferred_layout if p else "qwerty-ansi",
        "created_at": target.created_at,
        "is_public": is_public,
        "friendship_status": rel,
        "stats": _build_user_stats(db, target.id) if show_stats else None,
        "achievements": achievements,
        "race_history": _build_race_history(db, target.id) if show_race_history else [],
    }
