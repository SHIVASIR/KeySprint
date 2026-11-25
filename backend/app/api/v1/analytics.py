from fastapi import APIRouter, Depends
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.entities import PracticeSession, TestResult, User

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/overview")
def analytics_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    results = db.scalars(
        select(TestResult).where(TestResult.user_id == current_user.id)
    ).all()
    if not results:
        return {
            "total_tests": 0,
            "average_wpm": 0.0,
            "best_wpm": 0.0,
            "average_accuracy": 0.0,
            "total_practice_seconds": 0.0,
        }

    total_tests = len(results)
    avg_wpm = round(sum(r.net_wpm for r in results) / total_tests, 1)
    best_wpm = round(max(r.net_wpm for r in results), 1)
    avg_acc = round(sum(r.accuracy for r in results) / total_tests, 1)
    total_sec = round(sum(r.duration_seconds for r in results), 1)
    return {
        "total_tests": total_tests,
        "average_wpm": avg_wpm,
        "best_wpm": best_wpm,
        "average_accuracy": avg_acc,
        "total_practice_seconds": total_sec,
    }


@router.get("/history")
def analytics_history(
    limit: int = 40,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    safe_limit = max(1, min(limit, 100))
    rows = db.scalars(
        select(TestResult)
        .where(TestResult.user_id == current_user.id)
        .order_by(desc(TestResult.created_at))
        .limit(safe_limit)
    ).all()
    return {
        "points": [
            {
                "id": r.id,
                "net_wpm": r.net_wpm,
                "gross_wpm": r.gross_wpm,
                "accuracy": r.accuracy,
                "mode": r.mode,
                "created_at": r.created_at,
            }
            for r in reversed(rows)
        ]
    }


@router.get("/keyboard")
def analytics_keyboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    sessions = db.scalars(
        select(PracticeSession).where(PracticeSession.user_id == current_user.id)
    ).all()
    merged_keys: dict[str, dict[str, float | int]] = {}
    merged_bigrams: dict[str, dict[str, float | int]] = {}
    merged_mistakes: dict[str, int] = {}

    for s in sessions:
        for key, stats in (s.key_stats_json or {}).items():
            cur = merged_keys.setdefault(key, {"attempts": 0, "errors": 0, "total_latency_ms": 0.0})
            cur["attempts"] = int(cur["attempts"]) + int(stats.get("attempts", 0))
            cur["errors"] = int(cur["errors"]) + int(stats.get("errors", 0))
            cur["total_latency_ms"] = float(cur["total_latency_ms"]) + float(
                stats.get("total_latency_ms", 0.0)
            )
        for bg, stats in (s.bigrams_json or {}).items():
            cur = merged_bigrams.setdefault(bg, {"attempts": 0, "errors": 0, "total_latency_ms": 0.0})
            cur["attempts"] = int(cur["attempts"]) + int(stats.get("attempts", 0))
            cur["errors"] = int(cur["errors"]) + int(stats.get("errors", 0))
            cur["total_latency_ms"] = float(cur["total_latency_ms"]) + float(
                stats.get("total_latency_ms", 0.0)
            )
        for mk, count in (s.mistakes_json or {}).items():
            merged_mistakes[mk] = merged_mistakes.get(mk, 0) + int(count)

    return {"keys": merged_keys, "bigrams": merged_bigrams, "mistakes": merged_mistakes}
