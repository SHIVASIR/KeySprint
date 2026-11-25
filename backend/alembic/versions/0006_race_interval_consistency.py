"""Add server-recorded progress intervals to race_participants for verified race consistency

Revision ID: 0006_race_interval_consistency
Revises: 0005_challenge_checkpoints
Create Date: 2026-11-26 00:32:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0006_race_interval_consistency"
down_revision: Union[str, None] = "0005_challenge_checkpoints"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("race_participants") as batch_op:
        batch_op.add_column(
            sa.Column(
                "progress_intervals_json",
                sa.JSON(),
                nullable=False,
                server_default="[]",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("race_participants") as batch_op:
        batch_op.drop_column("progress_intervals_json")
