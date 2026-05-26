"""create articles table

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-23

Table : articles — catalogue produits par société.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "articles",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("societe_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code_barre", sa.String(50), nullable=False),
        sa.Column("code_article", sa.String(50), nullable=False),
        sa.Column("libelle", sa.String(255), nullable=False),
        sa.Column("unite", sa.String(20), nullable=True),
        sa.Column("actif", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["societe_id"], ["societes.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_articles_societe_code_barre",
        "articles",
        ["societe_id", "code_barre"],
        unique=True,
    )
    op.create_index(
        "ix_articles_societe_actif",
        "articles",
        ["societe_id", "actif"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_articles_societe_actif", table_name="articles")
    op.drop_index("ix_articles_societe_code_barre", table_name="articles")
    op.drop_table("articles")
