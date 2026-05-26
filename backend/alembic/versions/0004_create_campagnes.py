"""create campagnes and lignes_campagne tables

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-23

Tables : campagnes, lignes_campagne.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ENUM statut campagne
    statut_enum = postgresql.ENUM(
        "brouillon",
        "en_cours",
        "terminee",
        "validee",
        name="statutcampagne",
    )
    statut_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "campagnes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("magasin_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("nom", sa.String(200), nullable=False),
        sa.Column(
            "statut",
            sa.Enum("brouillon", "en_cours", "terminee", "validee", name="statutcampagne"),
            nullable=False,
            server_default="brouillon",
        ),
        sa.Column("date_debut", sa.DateTime(timezone=True), nullable=True),
        sa.Column("date_fin", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["magasin_id"], ["magasins.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["utilisateurs.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_campagnes_magasin_statut", "campagnes", ["magasin_id", "statut"], unique=False
    )

    op.create_table(
        "lignes_campagne",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("campagne_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("article_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("quantite_theorique", sa.Numeric(12, 3), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["campagne_id"], ["campagnes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["article_id"], ["articles.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_lignes_campagne_unique", "lignes_campagne", ["campagne_id", "article_id"], unique=True
    )


def downgrade() -> None:
    op.drop_index("ix_lignes_campagne_unique", table_name="lignes_campagne")
    op.drop_table("lignes_campagne")
    op.drop_index("ix_campagnes_magasin_statut", table_name="campagnes")
    op.drop_table("campagnes")
    postgresql.ENUM(name="statutcampagne").drop(op.get_bind())
