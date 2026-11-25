from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.entities import PracticeSession, TestResult, User
from app.schemas.api import (
    CreateResultRequest,
    ImportResultsRequest,
    PaginatedResultsResponse,
    ResultResponse,
)
from app.services.social import evaluate_achievements

router = APIRouter(prefix="/results", tags=["results"])


def _to_result_response(r: TestResult) -> ResultResponse:
    return ResultResponse(
        id=r.id,
        client_record_id=r.client_record_id,
        mode=r.mode,
        category=r.category,
        difficulty=r.difficulty,
        language=r.language,
        duration_seconds=r.duration_seconds,
        gross_wpm=r.gross_wpm,
        net_wpm=r.net_wpm,
        accuracy=r.accuracy,
        consistency=r.consistency,
        correct_chars=r.correct_chars,
        incorrect_chars=r.incorrect_chars,
        total_chars=r.total_chars,
        correct_words=r.correct_words,
        incorrect_words=r.incorrect_words,
        timeline=r.timeline_json or [],
        verified_competitive=r.verified_competitive,
        imported_from_guest=r.imported_from_guest,
        created_at=r.created_at,
    )


@router.post("", response_model=ResultResponse, status_code=status.HTTP_201_CREATED)
def create_result(
    payload: CreateResultRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ResultResponse:
    # Prevent duplicate submission for same client_record_id
    existing = db.scalar(
        select(TestResult).where(
            TestResult.user_id == current_user.id,
            TestResult.client_record_id == payload.client_record_id,
        )
    )
    if existing:
        return _to_result_response(existing)

    result = TestResult(
        user_id=current_user.id,
        client_record_id=payload.client_record_id,
        mode=payload.mode,
        category=payload.category,
        difficulty=payload.difficulty,
        language=payload.language,
        duration_seconds=payload.duration_seconds,
        gross_wpm=payload.gross_wpm,
        net_wpm=payload.net_wpm,
        accuracy=payload.accuracy,
        consistency=payload.consistency,
        correct_chars=payload.correct_chars,
        incorrect_chars=payload.incorrect_chars,
        total_chars=payload.total_chars,
        correct_words=payload.correct_words,
        incorrect_words=payload.incorrect_words,
        timeline_json=[s.model_dump() for s in payload.timeline],
        verified_competitive=False,
        imported_from_guest=False,
    )
    db.add(result)

    if payload.keystroke_summary or payload.bigram_summary or payload.mistake_summary:
        agg: dict[str, dict[str, float | int]] = {}
        for item in payload.keystroke_summary:
            k = item.expected.lower()
            entry = agg.setdefault(k, {"attempts": 0, "errors": 0, "total_latency_ms": 0.0})
            entry["attempts"] = int(entry["attempts"]) + 1
            if not item.correct:
                entry["errors"] = int(entry["errors"]) + 1
            entry["total_latency_ms"] = float(entry["total_latency_ms"]) + item.latency_ms

        bigrams_clean: dict[str, dict[str, float | int]] = {}
        for bg, bstats in list(payload.bigram_summary.items())[:400]:
            if len(bg) <= 4:
                bigrams_clean[bg] = {
                    "attempts": bstats.attempts,
                    "errors": bstats.errors,
                    "total_latency_ms": bstats.total_latency_ms,
                }

        mistakes_clean: dict[str, int] = {}
        for mkey, count in list(payload.mistake_summary.items())[:200]:
            if len(mkey) <= 12 and 0 < count <= 50000:
                mistakes_clean[mkey] = int(count)

        db.add(
            PracticeSession(
                user_id=current_user.id,
                key_stats_json=agg,
                bigrams_json=bigrams_clean,
                mistakes_json=mistakes_clean,
            )
        )

    db.flush()
    evaluate_achievements(db, current_user.id, notify=True)
    db.commit()
    db.refresh(result)
    return _to_result_response(result)


@router.post("/import")
def import_guest_results(
    payload: ImportResultsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    imported = 0
    skipped = 0

    for item in payload.records:
        existing = db.scalar(
            select(TestResult).where(
                TestResult.user_id == current_user.id,
                TestResult.client_record_id == item.client_record_id,
            )
        )
        if existing:
            skipped += 1
            continue

        row = TestResult(
            user_id=current_user.id,
            client_record_id=item.client_record_id,
            mode=item.mode,
            category=item.category,
            difficulty=item.difficulty,
            language=item.language,
            duration_seconds=item.duration_seconds,
            gross_wpm=item.gross_wpm,
            net_wpm=item.net_wpm,
            accuracy=item.accuracy,
            consistency=item.consistency,
            correct_chars=item.correct_chars,
            incorrect_chars=item.incorrect_chars,
            total_chars=item.total_chars,
            correct_words=item.correct_words,
            incorrect_words=item.incorrect_words,
            timeline_json=[s.model_dump() for s in item.timeline],
            verified_competitive=False,  # Guest imports are personal history, not competitive leaderboard runs
            imported_from_guest=True,
        )
        if item.created_at:
            row.created_at = item.created_at
        db.add(row)
        imported += 1

    db.commit()
    return {
        "imported": imported,
        "skipped": skipped,
        "message": f"Imported {imported} guest record(s) into personal history ({skipped} duplicate skipped). Note: imported guest runs are excluded from server-verified competitive leaderboards.",
    }


@router.get("", response_model=PaginatedResultsResponse)
def list_results(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PaginatedResultsResponse:
    total = (
        db.scalar(select(func.count(TestResult.id)).where(TestResult.user_id == current_user.id))
        or 0
    )
    rows = db.scalars(
        select(TestResult)
        .where(TestResult.user_id == current_user.id)
        .order_by(desc(TestResult.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return PaginatedResultsResponse(
        items=[_to_result_response(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{result_id}", response_model=ResultResponse)
def get_result(
    result_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ResultResponse:
    row = db.get(TestResult, result_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Result not found.")
    return _to_result_response(row)


@router.delete("/{result_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_result(
    result_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    row = db.get(TestResult, result_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Result not found.")
    db.delete(row)
    db.commit()
