"""comptages: ajout de hors_delai

Revision ID: 0012
Revises: 0011
Create Date: 2026-08-03
"""

import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "comptages",
        sa.Column(
            "hors_delai",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )


def downgrade() -> None:
    op.drop_column("comptages", "hors_delai")
