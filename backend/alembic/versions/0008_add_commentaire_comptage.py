"""comptages: ajout colonne commentaire (optionnelle)

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-28
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("comptages", sa.Column("commentaire", sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column("comptages", "commentaire")
