"""add actif to societes

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-23
"""

import sqlalchemy as sa

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "societes",
        sa.Column("actif", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column("societes", "actif")
