import asyncio
import json
import logging
import math
import secrets
from datetime import datetime, timezone
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import SessionLocal, get_db
from app.core.rate_limit import enforce_rate_limit, rate_limiter
from app.core.security import SESSION_COOKIE_NAME, decode_session_token
from app.data.curriculum import RACE_PROMPTS
from app.models.entities import LeaderboardEntry, RaceParticipant, RaceRoom, TestResult, User
from app.schemas.api import CreateRaceRequest, InviteRaceRequest
from app.services.social import create_notification, evaluate_achievements

logger = logging.getLogger(__name__)
router = APIRouter(tags=["races"])

# Anti-cheat thresholds (server-authoritative)
MAX_BURST_CHARS_PER_SECOND = 22.0  # ~264 WPM instantaneous burst ceiling
MAX_SHORT_CHUNK_CHARS_PER_SECOND = 30.0  # Blocks rapid small-chunk scripting bots
MAX_CUMULATIVE_WPM = 240.0  # Max sustained WPM ceiling
MIN_RACE_DURATION_SECONDS = 2.0
MIN_PROGRESS_UPDATES_BEFORE_FINISH = 2
MIN_TRACKED_PROGRESS_RATIO = 0.60


def _compute_race_consistency(interval_wpms: list[float]) -> float:
    valid = [float(v) for v in interval_wpms if math.isfinite(v) and v >= 0]
    if len(valid) < 2:
        return 100.0 if (len(valid) == 1 and valid[0] > 0) else 0.0
    mean = sum(valid) / len(valid)
    if mean <= 0:
        return 0.0
    variance = sum((v - mean) ** 2 for v in valid) / len(valid)
    cv = math.sqrt(variance) / mean
    return round(max(0.0, min(100.0, (1.0 - cv) * 100.0)), 1)


def is_allowed_ws_origin(origin: str | None) -> bool:
    if not origin:
        return False
    try:
        parsed = urlparse(origin.strip())
    except ValueError:
        return False
    if (
        parsed.scheme.lower() not in ("http", "https")
        or not parsed.netloc
        or parsed.path
        or parsed.params
        or parsed.query
        or parsed.fragment
        or parsed.username
        or parsed.password
    ):
        return False
    normalized = f"{parsed.scheme.lower()}://{parsed.netloc.lower()}"
    allowed = {o.lower() for o in settings.cors_origin_list}
    return normalized in allowed


class RaceConnectionManager:
    def __init__(self) -> None:
        self.rooms: dict[str, set[WebSocket]] = {}
        self.countdown_tasks: dict[str, asyncio.Task[None]] = {}

    async def connect(self, room_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self.rooms.setdefault(room_id, set()).add(ws)

    def disconnect(self, room_id: str, ws: WebSocket) -> None:
        conns = self.rooms.get(room_id)
        if conns and ws in conns:
            conns.remove(ws)
            if not conns:
                self.rooms.pop(room_id, None)

    async def broadcast(self, room_id: str, payload: dict) -> None:
        conns = list(self.rooms.get(room_id, set()))
        dead: list[WebSocket] = []
        message = json.dumps(payload)
        for ws in conns:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(room_id, ws)

    def start_countdown(self, room_id: str) -> None:
        existing = self.countdown_tasks.get(room_id)
        if existing and not existing.done():
            return
        task = asyncio.create_task(_run_countdown_and_start(room_id))
        self.countdown_tasks[room_id] = task

        def _cleanup(done_task: asyncio.Task[None]) -> None:
            if self.countdown_tasks.get(room_id) is done_task:
                self.countdown_tasks.pop(room_id, None)
            if not done_task.cancelled():
                exc = done_task.exception()
                if exc is not None:
                    logger.exception("Race countdown task failed for room %s", room_id, exc_info=exc)

        task.add_done_callback(_cleanup)


ws_manager = RaceConnectionManager()


def _as_utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def _max_single_update_chars(prompt_len: int) -> int:
    # Allow at most 35% of the prompt (with floor 15 chars for short tests) per single update
    return max(15, int(prompt_len * 0.35))


def _generate_room_code() -> str:
    return secrets.token_hex(8).upper()


def _generate_invite_token() -> str:
    return secrets.token_urlsafe(24)


def _find_room_by_ref(db: Session, room_ref: str) -> RaceRoom | None:
    cleaned = room_ref.strip()
    if not cleaned:
        return None
    return db.scalar(
        select(RaceRoom).where(
            or_(
                RaceRoom.invite_token == cleaned,
                RaceRoom.code == cleaned.upper(),
                RaceRoom.id == cleaned,
            )
        )
    )


def _record_invalid_room_attempt(request: Request | None) -> None:
    client_ip = request.client.host if request and request.client else "unknown"
    rate_limiter.check(f"race_invalid_code:{client_ip}", limit=8, window_seconds=300)


def _serialize_room(db: Session, room: RaceRoom, countdown_seconds: int = 0) -> dict:
    host = db.get(User, room.host_user_id)
    participants_rows = db.scalars(
        select(RaceParticipant).where(RaceParticipant.room_id == room.id)
    ).all()

    participants_rows = sorted(
        participants_rows,
        key=lambda p: (
            0 if p.finished else 1,
            p.placement if p.placement is not None else 999,
            -p.progress,
            -p.wpm,
            -p.accuracy,
            p.id,
        ),
    )

    participants = []
    for p in participants_rows:
        u = db.get(User, p.user_id)
        if u:
            participants.append(
                {
                    "username": u.username,
                    "is_ready": p.is_ready,
                    "progress": p.progress,
                    "wpm": p.wpm,
                    "accuracy": p.accuracy,
                    "finished": p.finished,
                    "placement": p.placement,
                }
            )
    return {
        "id": room.id,
        "code": room.code,
        "invite_token": room.invite_token,
        "status": room.status,
        "difficulty": room.difficulty,
        "is_private": room.is_private,
        "rematch_room_id": room.rematch_room_id,
        "prompt_text": room.prompt_text,
        "countdown_seconds": countdown_seconds,
        "host_username": host.username if host else "",
        "participants": participants,
    }


@router.post(
    "/races",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(enforce_rate_limit("race_create", limit=20, window_seconds=60))],
)
def create_race_room(
    payload: CreateRaceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    code = _generate_room_code()
    invite_token = _generate_invite_token()
    prompt_text = RACE_PROMPTS.get(payload.difficulty, RACE_PROMPTS["medium"])

    room = RaceRoom(
        code=code,
        invite_token=invite_token,
        host_user_id=current_user.id,
        status="waiting",
        difficulty=payload.difficulty,
        is_private=payload.is_private,
        prompt_text=prompt_text,
    )
    db.add(room)
    db.flush()

    db.add(RaceParticipant(room_id=room.id, user_id=current_user.id, is_ready=True))
    db.commit()
    db.refresh(room)
    return _serialize_room(db, room)


@router.get(
    "/races/{room_id}",
    dependencies=[Depends(enforce_rate_limit("race_join", limit=25, window_seconds=60))],
)
def get_race_room(
    room_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    room = _find_room_by_ref(db, room_id)
    if not room:
        _record_invalid_room_attempt(request)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Race room not found.")

    existing = db.scalar(
        select(RaceParticipant).where(
            RaceParticipant.room_id == room.id,
            RaceParticipant.user_id == current_user.id,
        )
    )
    if not existing:
        if room.is_private:
            cleaned = room_id.strip()
            has_valid_secret = secrets.compare_digest(
                cleaned, room.invite_token
            ) or secrets.compare_digest(cleaned.upper(), room.code)
            if not has_valid_secret:
                _record_invalid_room_attempt(request)
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Valid room code or invite token is required to join a private room.",
                )

        if room.status not in ("waiting", "countdown"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot join a race that has already started or finished.",
            )
        try:
            with db.begin_nested():
                db.add(RaceParticipant(room_id=room.id, user_id=current_user.id))
                db.flush()
        except IntegrityError:
            pass
        db.commit()

    return _serialize_room(db, room)


@router.post("/races/{room_id}/leave")
async def leave_race_room(
    room_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    room = _find_room_by_ref(db, room_id)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Race room not found.")

    part = db.scalar(
        select(RaceParticipant).where(
            RaceParticipant.room_id == room.id,
            RaceParticipant.user_id == current_user.id,
        )
    )
    if not part:
        if room.is_private:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a participant in this race room.",
            )
        return {"left": True}

    if room.status == "waiting":
        db.delete(part)
        db.flush()
        remaining = db.scalars(
            select(RaceParticipant).where(RaceParticipant.room_id == room.id)
        ).all()
        if not remaining:
            room.status = "finished"
        elif room.host_user_id == current_user.id:
            room.host_user_id = remaining[0].user_id
        db.commit()
        snapshot = _serialize_room(db, room)
        await ws_manager.broadcast(room.id, {"type": "state", "room": snapshot})

    return {"left": True}


@router.post(
    "/races/{room_id}/invite",
    dependencies=[Depends(enforce_rate_limit("race_invite", limit=20, window_seconds=60))],
)
def invite_to_race(
    room_id: str,
    payload: InviteRaceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    room = _find_room_by_ref(db, room_id)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Race room not found.")

    is_participant = db.scalar(
        select(RaceParticipant).where(
            RaceParticipant.room_id == room.id,
            RaceParticipant.user_id == current_user.id,
        )
    )
    if not is_participant:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only room participants can invite players.",
        )
    if room.status not in ("waiting", "countdown"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot invite players after a race has started or finished.",
        )

    target = db.scalar(
        select(User).where(User.username == payload.username.strip().lower(), User.is_active.is_(True))
    )
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    if target.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot invite yourself.")

    create_notification(
        db,
        user_id=target.id,
        kind="race_invite",
        title="Race Room Invitation",
        message=f"@{current_user.username} invited you to join race room {room.code} ({room.difficulty}).",
        link=f"/arena?room={room.invite_token}",
        reference_id=f"{room.id}:{target.id}",
    )
    db.commit()
    return {"invited": target.username, "room_code": room.code}


@router.post(
    "/races/{room_id}/rematch",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(enforce_rate_limit("race_rematch", limit=20, window_seconds=60))],
)
async def create_rematch_room(
    room_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    room = db.get(RaceRoom, room_id)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Race room not found.")

    part = db.scalar(
        select(RaceParticipant).where(
            RaceParticipant.room_id == room.id,
            RaceParticipant.user_id == current_user.id,
        )
    )
    if not part:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only participants in the race can start a rematch.",
        )
    if room.status != "finished":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Rematch is only available after the race has finished.",
        )

    if room.rematch_room_id:
        existing_rematch = db.get(RaceRoom, room.rematch_room_id)
        if existing_rematch and existing_rematch.status in ("waiting", "countdown"):
            return _serialize_room(db, existing_rematch)

    new_code = _generate_room_code()
    new_invite_token = _generate_invite_token()
    prompt_text = RACE_PROMPTS.get(room.difficulty, RACE_PROMPTS["medium"])
    new_room = RaceRoom(
        code=new_code,
        invite_token=new_invite_token,
        host_user_id=current_user.id,
        status="waiting",
        difficulty=room.difficulty,
        is_private=room.is_private,
        prompt_text=prompt_text,
    )
    db.add(new_room)
    db.flush()

    old_parts = db.scalars(
        select(RaceParticipant).where(RaceParticipant.room_id == room.id)
    ).all()
    for op_row in old_parts:
        db.add(
            RaceParticipant(
                room_id=new_room.id,
                user_id=op_row.user_id,
                is_ready=(op_row.user_id == current_user.id),
            )
        )

    room.rematch_room_id = new_room.id
    db.commit()
    db.refresh(new_room)
    new_snapshot = _serialize_room(db, new_room)
    old_snapshot = _serialize_room(db, room)
    await ws_manager.broadcast(room.id, {"type": "rematch", "room": old_snapshot, "rematch_room": new_snapshot})
    return new_snapshot


async def _run_countdown_and_start(room_id: str) -> None:
    try:
        for remaining in (3, 2, 1):
            with SessionLocal() as db:
                room = db.get(RaceRoom, room_id)
                if not room or room.status != "countdown":
                    return
                snapshot = _serialize_room(db, room, countdown_seconds=remaining)
            await ws_manager.broadcast(room_id, {"type": "state", "room": snapshot})
            await asyncio.sleep(1)

        with SessionLocal() as db:
            room = db.get(RaceRoom, room_id)
            if not room:
                return
            room.status = "active"
            room.started_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(room)
            snapshot = _serialize_room(db, room, countdown_seconds=0)
        await ws_manager.broadcast(room_id, {"type": "state", "room": snapshot})
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception("Unexpected error during race countdown for room %s", room_id)
        try:
            with SessionLocal() as db:
                room = db.get(RaceRoom, room_id)
                if room and room.status == "countdown":
                    room.status = "waiting"
                    db.commit()
                    snapshot = _serialize_room(db, room, countdown_seconds=0)
                    await ws_manager.broadcast(
                        room_id,
                        {
                            "type": "error",
                            "detail": "Failed to start race countdown; please retry.",
                            "room": snapshot,
                        },
                    )
        except Exception:
            logger.exception("Failed to recover race room %s after countdown error", room_id)


def _parse_finite_float(value: object, name: str) -> float:
    if isinstance(value, bool):
        raise ValueError(f"Invalid boolean for {name}.")
    num = float(value)  # type: ignore[arg-type]
    if not math.isfinite(num):
        raise ValueError(f"Non-finite number for {name}.")
    return num


def _parse_int(value: object, name: str) -> int:
    if isinstance(value, bool):
        raise ValueError(f"Invalid boolean for {name}.")
    return int(value)  # type: ignore[arg-type]


@router.websocket("/ws/races/{room_id}")
async def race_websocket(websocket: WebSocket, room_id: str) -> None:
    origin = websocket.headers.get("origin")
    if not is_allowed_ws_origin(origin):
        await websocket.close(code=4403)
        return

    session_cookie = websocket.cookies.get(SESSION_COOKIE_NAME)
    user_id = decode_session_token(session_cookie) if session_cookie else None
    if not user_id:
        await websocket.close(code=4401)
        return

    with SessionLocal() as db:
        user = db.get(User, user_id)
        room = db.get(RaceRoom, room_id)
        if not user or not room:
            await websocket.close(code=4404)
            return

        participant = db.scalar(
            select(RaceParticipant).where(
                RaceParticipant.room_id == room.id,
                RaceParticipant.user_id == user.id,
            )
        )
        if not participant:
            if room.is_private:
                token_param = websocket.query_params.get("token", "")
                if not token_param or not secrets.compare_digest(token_param, room.invite_token):
                    await websocket.close(code=4403)
                    return
            if room.status not in ("waiting", "countdown"):
                await websocket.close(code=4403)
                return
            participant = RaceParticipant(room_id=room.id, user_id=user.id)
            db.add(participant)
            db.commit()

        initial_snapshot = _serialize_room(db, room)

    await ws_manager.connect(room_id, websocket)
    await ws_manager.broadcast(room_id, {"type": "state", "room": initial_snapshot})

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "detail": "Invalid JSON payload."})
                continue

            if not isinstance(data, dict) or not isinstance(data.get("type"), str):
                await websocket.send_json({"type": "error", "detail": "Invalid message format."})
                continue

            msg_type = data["type"]

            if msg_type == "start_race":
                started_countdown = False
                with SessionLocal() as db:
                    room = db.get(RaceRoom, room_id)
                    if not room or room.host_user_id != user_id or room.status != "waiting":
                        continue
                    room.status = "countdown"
                    db.commit()
                    started_countdown = True
                if started_countdown:
                    ws_manager.start_countdown(room_id)

            elif msg_type == "ready":
                ready_val = bool(data.get("ready", True))
                with SessionLocal() as db:
                    room = db.get(RaceRoom, room_id)
                    part = db.scalar(
                        select(RaceParticipant).where(
                            RaceParticipant.room_id == room_id,
                            RaceParticipant.user_id == user_id,
                        )
                    )
                    if not room or not part or room.status != "waiting":
                        continue
                    part.is_ready = ready_val
                    db.commit()
                    snapshot = _serialize_room(db, room)
                await ws_manager.broadcast(room_id, {"type": "state", "room": snapshot})

            elif msg_type == "progress":
                try:
                    raw_progress = _parse_int(data.get("progress", 0), "progress")
                    if raw_progress < 0 or raw_progress > 100:
                        raise ValueError("progress out of range")
                    acc = _parse_finite_float(data.get("accuracy", 0.0), "accuracy")
                    if acc < 0 or acc > 100:
                        raise ValueError("accuracy out of range")
                    raw_chars = data.get("chars_typed")
                    chars_typed_input = (
                        _parse_int(raw_chars, "chars_typed") if raw_chars is not None else None
                    )
                except (ValueError, TypeError):
                    await websocket.send_json({"type": "error", "detail": "Invalid progress metrics."})
                    continue

                with SessionLocal() as db:
                    room = db.get(RaceRoom, room_id)
                    part = db.scalar(
                        select(RaceParticipant).where(
                            RaceParticipant.room_id == room_id,
                            RaceParticipant.user_id == user_id,
                        )
                    )
                    if not room or not part:
                        continue
                    if room.status != "active" or room.started_at is None:
                        await websocket.send_json(
                            {"type": "error", "detail": "Race is not currently active."}
                        )
                        continue
                    if part.finished:
                        await websocket.send_json(
                            {"type": "error", "detail": "Participant has already finished."}
                        )
                        continue

                    prompt_len = len(room.prompt_text)
                    chars_typed = (
                        chars_typed_input
                        if chars_typed_input is not None
                        else round((raw_progress / 100.0) * prompt_len)
                    )
                    if chars_typed < 0 or chars_typed > prompt_len:
                        await websocket.send_json(
                            {"type": "error", "detail": "Invalid character progress count."}
                        )
                        continue

                    derived_progress = min(100, round((chars_typed / max(1, prompt_len)) * 100))

                    # Reject duplicate or regressive updates
                    if chars_typed == part.chars_typed and derived_progress == part.progress:
                        await websocket.send_json(
                            {"type": "error", "detail": "Duplicate progress update rejected."}
                        )
                        continue
                    if chars_typed < part.chars_typed or derived_progress < part.progress:
                        await websocket.send_json(
                            {"type": "error", "detail": "Progress cannot move backwards."}
                        )
                        continue

                    # Reject impossible single-step jumps
                    delta_chars = chars_typed - part.chars_typed
                    if delta_chars > _max_single_update_chars(prompt_len):
                        await websocket.send_json(
                            {"type": "error", "detail": "Impossible progress jump detected."}
                        )
                        continue

                    now = datetime.now(timezone.utc)
                    started = _as_utc(room.started_at)
                    elapsed_from_start = (now - started).total_seconds()
                    if elapsed_from_start <= 0:
                        await websocket.send_json(
                            {"type": "error", "detail": "Race has not started yet."}
                        )
                        continue

                    # Enforce interval burst ceiling (both large jumps and rapid small-chunk bursts)
                    prev_ts = _as_utc(part.last_progress_at) if part.last_progress_at else started
                    dt = max(0.05, (now - prev_ts).total_seconds())
                    if (
                        delta_chars > 10 and (delta_chars / dt) > MAX_BURST_CHARS_PER_SECOND
                    ) or (
                        delta_chars >= 2
                        and dt < 0.20
                        and (delta_chars / dt) > MAX_SHORT_CHUNK_CHARS_PER_SECOND
                    ):
                        await websocket.send_json(
                            {"type": "error", "detail": "Suspicious burst typing speed detected."}
                        )
                        continue

                    # Enforce cumulative WPM sanity after initial small burst (>12 chars)
                    server_wpm = (chars_typed / 5.0) / (max(elapsed_from_start, 0.25) / 60.0)
                    if chars_typed > 12 and server_wpm > MAX_CUMULATIVE_WPM:
                        await websocket.send_json(
                            {"type": "error", "detail": "Suspicious typing speed detected."}
                        )
                        continue

                    interval_wpm = round((delta_chars / 5.0) / (max(dt, 0.15) / 60.0), 1)
                    intervals = list(part.progress_intervals_json or [])
                    intervals.append(
                        {
                            "second": max(1, round(elapsed_from_start)),
                            "chars": chars_typed,
                            "interval_wpm": interval_wpm,
                            "wpm": round(server_wpm, 1),
                        }
                    )

                    part.chars_typed = chars_typed
                    part.progress = derived_progress
                    part.progress_updates_count += 1
                    part.progress_intervals_json = intervals
                    part.last_progress_at = now
                    part.wpm = round(server_wpm, 1)
                    part.accuracy = round(acc, 1)
                    db.commit()
                    snapshot = _serialize_room(db, room)
                await ws_manager.broadcast(room_id, {"type": "state", "room": snapshot})

            elif msg_type == "finish":
                with SessionLocal() as db:
                    room = db.get(RaceRoom, room_id)
                    part = db.scalar(
                        select(RaceParticipant).where(
                            RaceParticipant.room_id == room_id,
                            RaceParticipant.user_id == user_id,
                        )
                    )
                    if not room or not part:
                        continue
                    if room.status != "active" or room.started_at is None:
                        await websocket.send_json(
                            {"type": "error", "detail": "Cannot finish a race that is not active."}
                        )
                        continue
                    if part.finished:
                        await websocket.send_json(
                            {"type": "error", "detail": "Duplicate finish submission rejected."}
                        )
                        continue

                    typed_text = data.get("typed_text")
                    prompt_len = len(room.prompt_text)
                    if not isinstance(typed_text, str) or len(typed_text) != prompt_len:
                        await websocket.send_json(
                            {
                                "type": "error",
                                "detail": "Race submission must include complete typed_text matching prompt length.",
                            }
                        )
                        continue

                    # Require progressive checkpoint tracking before finish (blocks instant auto-submit)
                    min_tracked_chars = int(prompt_len * MIN_TRACKED_PROGRESS_RATIO)
                    if (
                        part.progress_updates_count < MIN_PROGRESS_UPDATES_BEFORE_FINISH
                        or part.chars_typed < min_tracked_chars
                        or (prompt_len - part.chars_typed) > _max_single_update_chars(prompt_len)
                    ):
                        await websocket.send_json(
                            {
                                "type": "error",
                                "detail": "Early or unverified finish rejected: progressive typing updates required.",
                            }
                        )
                        continue

                    # Server-authoritative elapsed race duration (ignore any client timestamps)
                    now = datetime.now(timezone.utc)
                    started = _as_utc(room.started_at)
                    server_elapsed = (now - started).total_seconds()
                    min_plausible_elapsed = max(
                        MIN_RACE_DURATION_SECONDS, prompt_len / MAX_BURST_CHARS_PER_SECOND
                    )
                    if server_elapsed < min_plausible_elapsed:
                        await websocket.send_json(
                            {
                                "type": "error",
                                "detail": "Early finish rejected: race completed faster than humanly plausible.",
                            }
                        )
                        continue

                    # Enforce interval burst ceiling on the final tail between last checkpoint and finish
                    tail_chars = prompt_len - part.chars_typed
                    tail_dt = (
                        max(0.05, (now - _as_utc(part.last_progress_at)).total_seconds())
                        if part.last_progress_at
                        else server_elapsed
                    )
                    if (
                        tail_chars > 10 and (tail_chars / tail_dt) > MAX_BURST_CHARS_PER_SECOND
                    ) or (
                        tail_chars >= 2
                        and tail_dt < 0.20
                        and (tail_chars / tail_dt) > MAX_SHORT_CHUNK_CHARS_PER_SECOND
                    ):
                        await websocket.send_json(
                            {
                                "type": "error",
                                "detail": "Suspicious final burst speed detected before finish.",
                            }
                        )
                        continue

                    # Server-authoritative character grading
                    correct_chars = sum(
                        1
                        for expected_ch, typed_ch in zip(room.prompt_text, typed_text)
                        if expected_ch == typed_ch
                    )
                    incorrect_chars = prompt_len - correct_chars
                    total_chars = prompt_len

                    gross_wpm = round((total_chars / 5.0) / (server_elapsed / 60.0), 1)
                    net_wpm = round(
                        max(0.0, gross_wpm - (incorrect_chars / 5.0) / (server_elapsed / 60.0)), 1
                    )
                    accuracy = round((correct_chars / total_chars) * 100.0, 1)

                    if gross_wpm > 260 or net_wpm > MAX_CUMULATIVE_WPM:
                        await websocket.send_json(
                            {
                                "type": "error",
                                "detail": "Submission flagged by server speed sanity check.",
                            }
                        )
                        continue

                    intervals = list(part.progress_intervals_json or [])
                    interval_wpms = [float(item.get("interval_wpm", 0.0)) for item in intervals]
                    if tail_chars > 0:
                        tail_wpm = round((tail_chars / 5.0) / (max(tail_dt, 0.15) / 60.0), 1)
                        interval_wpms.append(tail_wpm)
                        intervals.append(
                            {
                                "second": max(1, round(server_elapsed)),
                                "chars": prompt_len,
                                "interval_wpm": tail_wpm,
                                "wpm": net_wpm,
                            }
                        )
                    server_consistency = _compute_race_consistency(interval_wpms)
                    server_timeline = [
                        {
                            "second": int(item.get("second", idx + 1)),
                            "wpm": float(item.get("interval_wpm", 0.0)),
                            "rawWpm": float(item.get("interval_wpm", 0.0)),
                            "accuracy": accuracy,
                            "errors": 0,
                        }
                        for idx, item in enumerate(intervals)
                    ]

                    finished_before = len(
                        db.scalars(
                            select(RaceParticipant).where(
                                RaceParticipant.room_id == room.id,
                                RaceParticipant.finished.is_(True),
                            )
                        ).all()
                    )

                    part.chars_typed = prompt_len
                    part.progress = 100
                    part.wpm = net_wpm
                    part.accuracy = accuracy
                    part.progress_intervals_json = intervals
                    part.finished = True
                    part.placement = finished_before + 1
                    part.finished_at = now

                    client_rec_id = f"race-{room.id}-{user_id}"
                    existing_res = db.scalar(
                        select(TestResult).where(
                            TestResult.user_id == user_id,
                            TestResult.client_record_id == client_rec_id,
                        )
                    )
                    if not existing_res:
                        res = TestResult(
                            user_id=user_id,
                            client_record_id=client_rec_id,
                            mode="race",
                            category=f"race-{room.code}",
                            difficulty=room.difficulty,
                            duration_seconds=round(server_elapsed, 2),
                            gross_wpm=gross_wpm,
                            net_wpm=net_wpm,
                            accuracy=accuracy,
                            consistency=server_consistency,
                            correct_chars=correct_chars,
                            incorrect_chars=incorrect_chars,
                            total_chars=total_chars,
                            timeline_json=server_timeline,
                            verified_competitive=True,
                            imported_from_guest=False,
                        )
                        db.add(res)
                        db.flush()
                        db.add(
                            LeaderboardEntry(
                                user_id=user_id,
                                result_id=res.id,
                                period="all",
                                mode="race",
                                net_wpm=net_wpm,
                                accuracy=accuracy,
                            )
                        )

                    all_parts = db.scalars(
                        select(RaceParticipant).where(RaceParticipant.room_id == room.id)
                    ).all()
                    if all(p.finished for p in all_parts):
                        room.status = "finished"

                    db.flush()
                    evaluate_achievements(db, user_id, notify=True)
                    db.commit()
                    snapshot = _serialize_room(db, room)
                await ws_manager.broadcast(room_id, {"type": "state", "room": snapshot})

            else:
                await websocket.send_json({"type": "error", "detail": "Unsupported message type."})

    except WebSocketDisconnect:
        ws_manager.disconnect(room_id, websocket)
    except Exception:
        logger.exception("Unhandled WebSocket error in room %s", room_id)
        ws_manager.disconnect(room_id, websocket)
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
