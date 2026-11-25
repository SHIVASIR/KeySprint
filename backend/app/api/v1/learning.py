from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.data.curriculum import CURRICULUM_LESSONS
from app.models.entities import Achievement, LearningProgress, User
from app.schemas.api import LearningProgressRequest
from app.services.social import evaluate_achievements

router = APIRouter(tags=["learning"])


@router.get("/lessons")
def list_lessons() -> dict:
    return {"lessons": CURRICULUM_LESSONS}


@router.get("/achievements")
def list_user_achievements(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    items = evaluate_achievements(db, current_user.id, notify=False)
    db.commit()
    return {"achievements": items}


@router.get("/learning/progress")
def get_learning_progress(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    rows = db.scalars(
        select(LearningProgress).where(LearningProgress.user_id == current_user.id)
    ).all()
    achievements = db.scalars(
        select(Achievement).where(Achievement.user_id == current_user.id)
    ).all()
    return {
        "progress": [
            {
                "lesson_id": r.lesson_id,
                "completed": r.completed,
                "best_wpm": r.best_wpm,
                "best_accuracy": r.best_accuracy,
                "attempts": r.attempts,
                "draft_typed_text": r.draft_typed_text,
                "draft_elapsed_ms": r.draft_elapsed_ms,
                "updated_at": r.updated_at,
            }
            for r in rows
        ],
        "achievements": [
            {"code": a.code, "title": a.title, "earned_at": a.earned_at} for a in achievements
        ],
    }


@router.post("/learning/progress")
def upsert_learning_progress(
    payload: LearningProgressRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    is_draft_only = (
        payload.draft_typed_text is not None
        and not payload.completed
        and not payload.clear_draft
        and payload.best_wpm == 0
        and payload.best_accuracy == 0
    )

    existing = db.scalar(
        select(LearningProgress).where(
            LearningProgress.user_id == current_user.id,
            LearningProgress.lesson_id == payload.lesson_id,
        )
    )
    if existing:
        existing.completed = existing.completed or payload.completed
        existing.best_wpm = max(existing.best_wpm, payload.best_wpm)
        existing.best_accuracy = max(existing.best_accuracy, payload.best_accuracy)
        if not is_draft_only:
            existing.attempts += 1
        if payload.clear_draft or payload.completed:
            existing.draft_typed_text = None
            existing.draft_elapsed_ms = 0
        elif payload.draft_typed_text is not None:
            existing.draft_typed_text = payload.draft_typed_text
            existing.draft_elapsed_ms = payload.draft_elapsed_ms or 0
        row = existing
    else:
        draft_text = None if (payload.clear_draft or payload.completed) else payload.draft_typed_text
        draft_ms = 0 if (payload.clear_draft or payload.completed) else (payload.draft_elapsed_ms or 0)
        row = LearningProgress(
            user_id=current_user.id,
            lesson_id=payload.lesson_id,
            completed=payload.completed,
            best_wpm=payload.best_wpm,
            best_accuracy=payload.best_accuracy,
            attempts=0 if is_draft_only else 1,
            draft_typed_text=draft_text,
            draft_elapsed_ms=draft_ms,
        )
        db.add(row)

    db.flush()
    evaluate_achievements(db, current_user.id, notify=True)
    db.commit()
    db.refresh(row)
    return {
        "lesson_id": row.lesson_id,
        "completed": row.completed,
        "best_wpm": row.best_wpm,
        "best_accuracy": row.best_accuracy,
        "attempts": row.attempts,
        "draft_typed_text": row.draft_typed_text,
        "draft_elapsed_ms": row.draft_elapsed_ms,
    }
