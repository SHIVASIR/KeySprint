"""Phase 5.1 security and data integrity closure

Revision ID: 0004_phase5_1_security_closure
Revises: 0003_phase5_social_sync
Create Date: 2026-11-25 23:58:00.000000
"""
import secrets
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0004_phase5_1_security_closure"
down_revision: Union[str, None] = "0003_phase5_social_sync"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    # 1. Expand race_rooms.code and add cryptographically random invite_token
    with op.batch_alter_table("race_rooms") as batch_op:
        batch_op.alter_column(
            "code",
            existing_type=sa.String(length=12),
            type_=sa.String(length=24),
            existing_nullable=False,
        )
        batch_op.add_column(sa.Column("invite_token", sa.String(length=64), nullable=True))

    existing_rooms = bind.execute(sa.text("SELECT id FROM race_rooms")).fetchall()
    for (room_id,) in existing_rooms:
        bind.execute(
            sa.text("UPDATE race_rooms SET invite_token = :tok WHERE id = :rid"),
            {"tok": secrets.token_urlsafe(24), "rid": room_id},
        )

    with op.batch_alter_table("race_rooms") as batch_op:
        batch_op.alter_column(
            "invite_token",
            existing_type=sa.String(length=64),
            nullable=False,
        )
        batch_op.create_unique_constraint("uq_race_rooms_invite_token", ["invite_token"])
        batch_op.create_index("ix_race_rooms_invite_token", ["invite_token"])

    # 2. Add direction-agnostic pair_key on friendships
    with op.batch_alter_table("friendships") as batch_op:
        batch_op.add_column(sa.Column("pair_key", sa.String(length=73), nullable=True))

    existing_friends = bind.execute(
        sa.text("SELECT id, requester_id, addressee_id FROM friendships")
    ).fetchall()
    for fid, req_id, add_id in existing_friends:
        pair_key = f"{min(req_id, add_id)}:{max(req_id, add_id)}"
        bind.execute(
            sa.text("UPDATE friendships SET pair_key = :pk WHERE id = :fid"),
            {"pk": pair_key, "fid": fid},
        )

    with op.batch_alter_table("friendships") as batch_op:
        batch_op.alter_column(
            "pair_key",
            existing_type=sa.String(length=73),
            nullable=False,
        )
        batch_op.create_unique_constraint("uq_friend_pair_key", ["pair_key"])

    # 3. Add attempt_jti & result_id uniqueness on challenge_completions
    with op.batch_alter_table("challenge_completions") as batch_op:
        batch_op.add_column(sa.Column("attempt_jti", sa.String(length=64), nullable=True))
        batch_op.create_unique_constraint("uq_challenge_attempt_jti", ["attempt_jti"])
        batch_op.create_unique_constraint("uq_challenge_completion_result", ["result_id"])

    # 4. Enforce result_id + period uniqueness on leaderboard_entries
    with op.batch_alter_table("leaderboard_entries") as batch_op:
        batch_op.create_unique_constraint(
            "uq_leaderboard_result_period", ["result_id", "period"]
        )


def downgrade() -> None:
    with op.batch_alter_table("leaderboard_entries") as batch_op:
        batch_op.drop_constraint("uq_leaderboard_result_period", type_="unique")

    with op.batch_alter_table("challenge_completions") as batch_op:
        batch_op.drop_constraint("uq_challenge_completion_result", type_="unique")
        batch_op.drop_constraint("uq_challenge_attempt_jti", type_="unique")
        batch_op.drop_column("attempt_jti")

    with op.batch_alter_table("friendships") as batch_op:
        batch_op.drop_constraint("uq_friend_pair_key", type_="unique")
        batch_op.drop_column("pair_key")

    with op.batch_alter_table("race_rooms") as batch_op:
        batch_op.drop_index("ix_race_rooms_invite_token")
        batch_op.drop_constraint("uq_race_rooms_invite_token", type_="unique")
        batch_op.drop_column("invite_token")
        batch_op.alter_column(
            "code",
            existing_type=sa.String(length=24),
            type_=sa.String(length=12),
            existing_nullable=False,
        )
