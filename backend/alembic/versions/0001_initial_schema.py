"""Initial KeySprint schema

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-11-25 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("username", sa.String(length=32), nullable=False, unique=True),
        sa.Column("email", sa.String(length=255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_username", "users", ["username"])
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "profiles",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("display_name", sa.String(length=64), nullable=False),
        sa.Column("bio", sa.String(length=240), nullable=False, server_default=""),
        sa.Column("preferred_layout", sa.String(length=32), nullable=False, server_default="qwerty-ansi"),
        sa.Column("is_public", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "user_preferences",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("theme", sa.String(length=16), nullable=False, server_default="dark"),
        sa.Column("settings_json", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "test_results",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_record_id", sa.String(length=64), nullable=False),
        sa.Column("mode", sa.String(length=24), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=False),
        sa.Column("difficulty", sa.String(length=16), nullable=False),
        sa.Column("language", sa.String(length=32), nullable=True),
        sa.Column("duration_seconds", sa.Float(), nullable=False),
        sa.Column("gross_wpm", sa.Float(), nullable=False),
        sa.Column("net_wpm", sa.Float(), nullable=False),
        sa.Column("accuracy", sa.Float(), nullable=False),
        sa.Column("consistency", sa.Float(), nullable=False, server_default="0"),
        sa.Column("correct_chars", sa.Integer(), nullable=False),
        sa.Column("incorrect_chars", sa.Integer(), nullable=False),
        sa.Column("total_chars", sa.Integer(), nullable=False),
        sa.Column("correct_words", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("incorrect_words", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("timeline_json", sa.JSON(), nullable=False),
        sa.Column("verified_competitive", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("imported_from_guest", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "client_record_id", name="uq_user_client_record"),
    )
    op.create_index("ix_test_results_user_created", "test_results", ["user_id", "created_at"])
    op.create_index("ix_test_results_leaderboard", "test_results", ["verified_competitive", "net_wpm"])

    op.create_table(
        "learning_progress",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lesson_id", sa.String(length=64), nullable=False),
        sa.Column("completed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("best_wpm", sa.Float(), nullable=False, server_default="0"),
        sa.Column("best_accuracy", sa.Float(), nullable=False, server_default="0"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "lesson_id", name="uq_user_lesson"),
    )

    op.create_table(
        "practice_sessions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("key_stats_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "achievements",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("earned_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "code", name="uq_user_achievement"),
    )

    op.create_table(
        "leaderboard_entries",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("result_id", sa.String(length=36), sa.ForeignKey("test_results.id", ondelete="CASCADE"), nullable=False),
        sa.Column("period", sa.String(length=16), nullable=False),
        sa.Column("mode", sa.String(length=24), nullable=False),
        sa.Column("net_wpm", sa.Float(), nullable=False),
        sa.Column("accuracy", sa.Float(), nullable=False),
        sa.Column("achieved_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_leaderboard_period_score", "leaderboard_entries", ["period", "net_wpm"])

    op.create_table(
        "challenges",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("slug", sa.String(length=64), nullable=False, unique=True),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("period", sa.String(length=16), nullable=False),
        sa.Column("prompt_text", sa.Text(), nullable=False),
        sa.Column("target_wpm", sa.Integer(), nullable=False, server_default="50"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "race_rooms",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("code", sa.String(length=12), nullable=False, unique=True),
        sa.Column("host_user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="waiting"),
        sa.Column("prompt_text", sa.Text(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "race_participants",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("room_id", sa.String(length=36), sa.ForeignKey("race_rooms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("wpm", sa.Float(), nullable=False, server_default="0"),
        sa.Column("accuracy", sa.Float(), nullable=False, server_default="0"),
        sa.Column("finished", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("room_id", "user_id", name="uq_room_participant"),
    )


def downgrade() -> None:
    op.drop_table("race_participants")
    op.drop_table("race_rooms")
    op.drop_table("challenges")
    op.drop_index("ix_leaderboard_period_score", table_name="leaderboard_entries")
    op.drop_table("leaderboard_entries")
    op.drop_table("achievements")
    op.drop_table("practice_sessions")
    op.drop_table("learning_progress")
    op.drop_index("ix_test_results_leaderboard", table_name="test_results")
    op.drop_index("ix_test_results_user_created", table_name="test_results")
    op.drop_table("test_results")
    op.drop_table("user_preferences")
    op.drop_table("profiles")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_table("users")
