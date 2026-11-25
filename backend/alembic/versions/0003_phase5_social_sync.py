"""Phase 5 social ecosystem, challenges, notifications, privacy, and cloud sync fields

Revision ID: 0003_phase5_social_sync
Revises: 0002_race_anticheat_tracking
Create Date: 2026-11-25 23:40:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003_phase5_social_sync"
down_revision: Union[str, None] = "0002_race_anticheat_tracking"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "profiles",
        sa.Column("show_stats", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "profiles",
        sa.Column("show_achievements", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "profiles",
        sa.Column("show_race_history", sa.Boolean(), nullable=False, server_default=sa.true()),
    )

    op.add_column(
        "learning_progress",
        sa.Column("draft_typed_text", sa.Text(), nullable=True),
    )
    op.add_column(
        "learning_progress",
        sa.Column("draft_elapsed_ms", sa.Integer(), nullable=False, server_default="0"),
    )

    op.add_column(
        "practice_sessions",
        sa.Column("bigrams_json", sa.JSON(), nullable=False, server_default="{}"),
    )
    op.add_column(
        "practice_sessions",
        sa.Column("mistakes_json", sa.JSON(), nullable=False, server_default="{}"),
    )

    op.add_column(
        "challenges",
        sa.Column("difficulty", sa.String(length=16), nullable=False, server_default="medium"),
    )

    op.add_column(
        "race_rooms",
        sa.Column("difficulty", sa.String(length=16), nullable=False, server_default="medium"),
    )
    op.add_column(
        "race_rooms",
        sa.Column("is_private", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "race_rooms",
        sa.Column("rematch_room_id", sa.String(length=36), nullable=True),
    )

    op.add_column(
        "race_participants",
        sa.Column("is_ready", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "race_participants",
        sa.Column("placement", sa.Integer(), nullable=True),
    )

    op.create_table(
        "challenge_completions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("challenge_id", sa.String(length=36), sa.ForeignKey("challenges.id", ondelete="CASCADE"), nullable=False),
        sa.Column("result_id", sa.String(length=36), sa.ForeignKey("test_results.id", ondelete="CASCADE"), nullable=False),
        sa.Column("net_wpm", sa.Float(), nullable=False),
        sa.Column("accuracy", sa.Float(), nullable=False),
        sa.Column("consistency", sa.Float(), nullable=False, server_default="0"),
        sa.Column("passed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_challenge_comp_user", "challenge_completions", ["user_id", "challenge_id"])
    op.create_index("ix_challenge_comp_board", "challenge_completions", ["challenge_id", "net_wpm"])

    op.create_table(
        "friendships",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("requester_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("addressee_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("requester_id", "addressee_id", name="uq_friend_pair"),
    )
    op.create_index("ix_friendships_requester", "friendships", ["requester_id"])
    op.create_index("ix_friendships_addressee_status", "friendships", ["addressee_id", "status"])

    op.create_table(
        "notifications",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("message", sa.String(length=280), nullable=False),
        sa.Column("link", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("reference_id", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_notifications_user_unread", "notifications", ["user_id", "is_read", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_notifications_user_unread", table_name="notifications")
    op.drop_table("notifications")

    op.drop_index("ix_friendships_addressee_status", table_name="friendships")
    op.drop_index("ix_friendships_requester", table_name="friendships")
    op.drop_table("friendships")

    op.drop_index("ix_challenge_comp_board", table_name="challenge_completions")
    op.drop_index("ix_challenge_comp_user", table_name="challenge_completions")
    op.drop_table("challenge_completions")

    op.drop_column("race_participants", "placement")
    op.drop_column("race_participants", "is_ready")

    op.drop_column("race_rooms", "rematch_room_id")
    op.drop_column("race_rooms", "is_private")
    op.drop_column("race_rooms", "difficulty")

    op.drop_column("challenges", "difficulty")

    op.drop_column("practice_sessions", "mistakes_json")
    op.drop_column("practice_sessions", "bigrams_json")

    op.drop_column("learning_progress", "draft_elapsed_ms")
    op.drop_column("learning_progress", "draft_typed_text")

    op.drop_column("profiles", "show_race_history")
    op.drop_column("profiles", "show_achievements")
    op.drop_column("profiles", "show_stats")
