"""create comptages table

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-23

Table : comptages — saisies de comptage physique (offline-first, idempotentes).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "comptages",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("campagne_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("article_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("magasin_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("quantite", sa.Numeric(12, 3), nullable=False),
        sa.Column("client_uuid", sa.String(36), nullable=False),
        sa.Column("counted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["campagne_id"], ["campagnes.id"]),
        sa.ForeignKeyConstraint(["article_id"], ["articles.id"]),
        sa.ForeignKeyConstraint(["magasin_id"], ["magasins.id"]),
        sa.ForeignKeyConstraint(["session_id"], ["sessions_tablette.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("client_uuid", name="uq_comptages_client_uuid"),
    )
    op.create_index(
        "ix_comptages_campagne_article",
        "comptages",
        ["campagne_id", "article_id"],
        unique=False,
    )
    op.create_index("ix_comptages_magasin", "comptages", ["magasin_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_comptages_magasin", table_name="comptages")
    op.drop_index("ix_comptages_campagne_article", table_name="comptages")
    op.drop_table("comptages")
