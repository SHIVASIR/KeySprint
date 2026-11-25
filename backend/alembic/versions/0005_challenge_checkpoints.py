"""Phase 5.2 server-recorded challenge checkpoints and consistency verification

Revision ID: 0005_challenge_checkpoints
Revises: 0004_phase5_1_security_closure
Create Date: 2026-11-26 00:20:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0005_challenge_checkpoints"
down_revision: Union[str, None] = "0004_phase5_1_security_closure"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "challenge_attempts",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("attempt_jti", sa.String(length=64), nullable=False, unique=True),
        sa.Column(
            "user_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "challenge_id",
            sa.String(length=36),
            sa.ForeignKey("challenges.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_chars_typed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_checkpoint_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("checkpoints_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("checkpoints_json", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="active"),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_challenge_attempts_jti", "challenge_attempts", ["attempt_jti"])
    op.create_index("ix_challenge_attempts_user", "challenge_attempts", ["user_id"])
    op.create_index("ix_challenge_attempts_challenge", "challenge_attempts", ["challenge_id"])
    op.create_index(
        "ix_challenge_attempt_user_ch",
        "challenge_attempts",
        ["user_id", "challenge_id", "status"],
    )

    # Historical ChallengeCompletion rows default to consistency_verified=False
    with op.batch_alter_table("challenge_completions") as batch_op:
        batch_op.add_column(
            sa.Column(
                "consistency_verified",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("challenge_completions") as batch_op:
        batch_op.drop_column("consistency_verified")

    op.drop_index("ix_challenge_attempt_user_ch", table_name="challenge_attempts")
    op.drop_index("ix_challenge_attempts_challenge", table_name="challenge_attempts")
    op.drop_index("ix_challenge_attempts_user", table_name="challenge_attempts")
    op.drop_index("ix_challenge_attempts_jti", table_name="challenge_attempts")
    op.drop_table("challenge_attempts")
