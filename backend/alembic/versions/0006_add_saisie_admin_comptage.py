"""add saisie_admin to comptages + session_id nullable

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-26

Modifications :
- comptages.session_id devient nullable (les saisies admin n'ont pas de session tablette)
- comptages.saisie_admin BOOLEAN DEFAULT FALSE (marque les ajouts manuels admin)
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # session_id devient nullable pour les saisies admin (pas de session tablette)
    op.alter_column("comptages", "session_id", existing_type=sa.UUID(as_uuid=True), nullable=True)
    # Colonne de traçabilité : True = ajout manuel depuis l'interface admin
    op.add_column(
        "comptages",
        sa.Column(
            "saisie_admin",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("comptages", "saisie_admin")
    op.alter_column("comptages", "session_id", existing_type=sa.UUID(as_uuid=True), nullable=False)
