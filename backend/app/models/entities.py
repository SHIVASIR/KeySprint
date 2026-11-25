import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    username: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    profile: Mapped["Profile"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    preferences: Mapped["UserPreference"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    results: Mapped[list["TestResult"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    learning_progress: Mapped[list["LearningProgress"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    practice_sessions: Mapped[list["PracticeSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    achievements: Mapped[list["Achievement"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    display_name: Mapped[str] = mapped_column(String(64), nullable=False)
    bio: Mapped[str] = mapped_column(String(240), default="", nullable=False)
    preferred_layout: Mapped[str] = mapped_column(String(32), default="qwerty-ansi", nullable=False)
    is_public: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    show_stats: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    show_achievements: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    show_race_history: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="profile")


class UserPreference(Base):
    __tablename__ = "user_preferences"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    theme: Mapped[str] = mapped_column(String(16), default="dark", nullable=False)
    settings_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="preferences")


class TestResult(Base):
    __tablename__ = "test_results"
    __table_args__ = (
        UniqueConstraint("user_id", "client_record_id", name="uq_user_client_record"),
        Index("ix_test_results_user_created", "user_id", "created_at"),
        Index("ix_test_results_leaderboard", "verified_competitive", "net_wpm"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    client_record_id: Mapped[str] = mapped_column(String(64), nullable=False)
    mode: Mapped[str] = mapped_column(String(24), nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    difficulty: Mapped[str] = mapped_column(String(16), nullable=False)
    language: Mapped[str | None] = mapped_column(String(32), nullable=True)
    duration_seconds: Mapped[float] = mapped_column(Float, nullable=False)
    gross_wpm: Mapped[float] = mapped_column(Float, nullable=False)
    net_wpm: Mapped[float] = mapped_column(Float, nullable=False)
    accuracy: Mapped[float] = mapped_column(Float, nullable=False)
    consistency: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    correct_chars: Mapped[int] = mapped_column(Integer, nullable=False)
    incorrect_chars: Mapped[int] = mapped_column(Integer, nullable=False)
    total_chars: Mapped[int] = mapped_column(Integer, nullable=False)
    correct_words: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    incorrect_words: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    timeline_json: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    verified_competitive: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    imported_from_guest: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    user: Mapped["User"] = relationship(back_populates="results")


class LearningProgress(Base):
    __tablename__ = "learning_progress"
    __table_args__ = (UniqueConstraint("user_id", "lesson_id", name="uq_user_lesson"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    lesson_id: Mapped[str] = mapped_column(String(64), nullable=False)
    completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    best_wpm: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    best_accuracy: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    draft_typed_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    draft_elapsed_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="learning_progress")


class PracticeSession(Base):
    __tablename__ = "practice_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    key_stats_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    bigrams_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    mistakes_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    user: Mapped["User"] = relationship(back_populates="practice_sessions")


class Achievement(Base):
    __tablename__ = "achievements"
    __table_args__ = (UniqueConstraint("user_id", "code", name="uq_user_achievement"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    earned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    user: Mapped["User"] = relationship(back_populates="achievements")


class LeaderboardEntry(Base):
    __tablename__ = "leaderboard_entries"
    __table_args__ = (
        Index("ix_leaderboard_period_score", "period", "net_wpm"),
        UniqueConstraint("result_id", "period", name="uq_leaderboard_result_period"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    result_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("test_results.id", ondelete="CASCADE"), nullable=False
    )
    period: Mapped[str] = mapped_column(String(16), nullable=False)  # all, daily, weekly, monthly
    mode: Mapped[str] = mapped_column(String(24), nullable=False)
    net_wpm: Mapped[float] = mapped_column(Float, nullable=False)
    accuracy: Mapped[float] = mapped_column(Float, nullable=False)
    achieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class Challenge(Base):
    __tablename__ = "challenges"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    period: Mapped[str] = mapped_column(String(16), nullable=False)  # daily / weekly
    difficulty: Mapped[str] = mapped_column(String(16), default="medium", nullable=False)
    prompt_text: Mapped[str] = mapped_column(Text, nullable=False)
    target_wpm: Mapped[int] = mapped_column(Integer, default=50, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class ChallengeAttempt(Base):
    __tablename__ = "challenge_attempts"
    __table_args__ = (
        Index("ix_challenge_attempt_user_ch", "user_id", "challenge_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    attempt_jti: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    challenge_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("challenges.id", ondelete="CASCADE"), nullable=False, index=True
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    last_chars_typed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_checkpoint_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    checkpoints_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    checkpoints_json: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="active", nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class ChallengeCompletion(Base):
    __tablename__ = "challenge_completions"
    __table_args__ = (
        Index("ix_challenge_comp_user", "user_id", "challenge_id"),
        Index("ix_challenge_comp_board", "challenge_id", "net_wpm"),
        UniqueConstraint("result_id", name="uq_challenge_completion_result"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    challenge_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("challenges.id", ondelete="CASCADE"), nullable=False, index=True
    )
    result_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("test_results.id", ondelete="CASCADE"), nullable=False
    )
    attempt_jti: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    net_wpm: Mapped[float] = mapped_column(Float, nullable=False)
    accuracy: Mapped[float] = mapped_column(Float, nullable=False)
    consistency: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    consistency_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    passed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class Friendship(Base):
    __tablename__ = "friendships"
    __table_args__ = (
        UniqueConstraint("requester_id", "addressee_id", name="uq_friend_pair"),
        UniqueConstraint("pair_key", name="uq_friend_pair_key"),
        Index("ix_friendships_addressee_status", "addressee_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    requester_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    addressee_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    pair_key: Mapped[str] = mapped_column(String(73), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="pending", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_user_unread", "user_id", "is_read", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    message: Mapped[str] = mapped_column(String(280), nullable=False)
    link: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reference_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class RaceRoom(Base):
    __tablename__ = "race_rooms"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    code: Mapped[str] = mapped_column(String(24), unique=True, nullable=False, index=True)
    invite_token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    host_user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(16), default="waiting", nullable=False)
    difficulty: Mapped[str] = mapped_column(String(16), default="medium", nullable=False)
    is_private: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    rematch_room_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    prompt_text: Mapped[str] = mapped_column(Text, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    participants: Mapped[list["RaceParticipant"]] = relationship(
        back_populates="room", cascade="all, delete-orphan"
    )


class RaceParticipant(Base):
    __tablename__ = "race_participants"
    __table_args__ = (UniqueConstraint("room_id", "user_id", name="uq_room_participant"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    room_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("race_rooms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    is_ready: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    chars_typed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    progress_updates_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    progress_intervals_json: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    last_progress_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    wpm: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    accuracy: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    finished: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    placement: Mapped[int | None] = mapped_column(Integer, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    room: Mapped["RaceRoom"] = relationship(back_populates="participants")
