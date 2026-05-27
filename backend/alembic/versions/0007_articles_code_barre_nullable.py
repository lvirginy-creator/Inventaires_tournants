"""articles: code_barre nullable

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-27

Certains articles n'ont pas de code barre (identifiés uniquement par code_article).
- code_barre devient nullable
- L'index unique (societe_id, code_barre) devient partiel (WHERE code_barre IS NOT NULL)
- Ajout d'un index (societe_id, code_article) pour les lookups tablette
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("articles", "code_barre", nullable=True)

    op.drop_index("ix_articles_societe_code_barre", table_name="articles")
    op.execute(sa.text(
        "CREATE UNIQUE INDEX ix_articles_societe_code_barre "
        "ON articles (societe_id, code_barre) "
        "WHERE code_barre IS NOT NULL"
    ))

    op.create_index(
        "ix_articles_societe_code_article",
        "articles",
        ["societe_id", "code_article"],
    )


def downgrade() -> None:
    op.drop_index("ix_articles_societe_code_article", table_name="articles")
    op.execute(sa.text("DROP INDEX IF EXISTS ix_articles_societe_code_barre"))
    op.create_index(
        "ix_articles_societe_code_barre",
        "articles",
        ["societe_id", "code_barre"],
        unique=True,
    )
    op.alter_column("articles", "code_barre", nullable=False)
