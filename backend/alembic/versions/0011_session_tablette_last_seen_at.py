"""sessions_tablette: ajout de last_seen_at

Revision ID: 0011
Revises: 0010
Create Date: 2026-08-03
"""

import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sessions_tablette",
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("sessions_tablette", "last_seen_at")
