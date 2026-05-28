"""Permettre plusieurs tablettes par magasin — supprime la contrainte unique sur tablettes.magasin_id

Revision ID: 0009
Revises: 0008
Create Date: 2026-05-28
"""

from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("tablettes_magasin_id_key", "tablettes", type_="unique")


def downgrade() -> None:
    op.create_unique_constraint("tablettes_magasin_id_key", "tablettes", ["magasin_id"])
