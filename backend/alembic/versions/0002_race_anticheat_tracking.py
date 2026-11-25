"""Add race participant anti-cheat tracking fields

Revision ID: 0002_race_anticheat_tracking
Revises: 0001_initial_schema
Create Date: 2026-11-25 22:45:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002_race_anticheat_tracking"
down_revision: Union[str, None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "race_participants",
        sa.Column("chars_typed", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "race_participants",
        sa.Column("progress_updates_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "race_participants",
        sa.Column("last_progress_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("race_participants", "last_progress_at")
    op.drop_column("race_participants", "progress_updates_count")
    op.drop_column("race_participants", "chars_typed")
