"""articles: code_barre VARCHAR(50) -> TEXT

Revision ID: 0010
Revises: 0009
Create Date: 2026-07-15

Les exports ERP peuvent contenir des codes-barres longs (GTIN-128, etc.).
- code_barre passe de VARCHAR(50) à TEXT
- L'index unique partiel est recréé sur le type TEXT
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_articles_societe_code_barre"))
    op.alter_column(
        "articles",
        "code_barre",
        type_=sa.Text(),
        existing_type=sa.String(50),
        existing_nullable=True,
    )
    op.execute(sa.text(
        "CREATE UNIQUE INDEX ix_articles_societe_code_barre "
        "ON articles (societe_id, code_barre) "
        "WHERE code_barre IS NOT NULL"
    ))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_articles_societe_code_barre"))
    op.execute(sa.text("UPDATE articles SET code_barre = LEFT(code_barre, 50)"))
    op.alter_column(
        "articles",
        "code_barre",
        type_=sa.String(50),
        existing_type=sa.Text(),
        existing_nullable=True,
    )
    op.execute(sa.text(
        "CREATE UNIQUE INDEX ix_articles_societe_code_barre "
        "ON articles (societe_id, code_barre) "
        "WHERE code_barre IS NOT NULL"
    ))
