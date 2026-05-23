"""Initial schema — Jalon 1

Revision ID: 0001
Revises:
Create Date: 2026-05-22

Tables : societes, magasins, utilisateurs, tablettes, tokens_appairage, sessions_tablette
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Types ENUM ────────────────────────────────────────────────────────────
    role_admin = postgresql.ENUM("admin", "superviseur", name="roleadmin")
    role_admin.create(op.get_bind(), checkfirst=True)

    role_tablette = postgresql.ENUM("operateur", "responsable_depot", name="roletablette")
    role_tablette.create(op.get_bind(), checkfirst=True)

    # ── societes ──────────────────────────────────────────────────────────────
    op.create_table(
        "societes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(20), nullable=False),
        sa.Column("nom", sa.String(200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )

    # ── magasins ──────────────────────────────────────────────────────────────
    op.create_table(
        "magasins",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("societe_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(20), nullable=False),
        sa.Column("nom", sa.String(200), nullable=False),
        sa.Column("email_responsable", sa.String(500), nullable=True),
        sa.Column("password_operateur_hash", sa.String(255), nullable=False),
        sa.Column("password_responsable_hash", sa.String(255), nullable=False),
        sa.Column("actif", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["societe_id"], ["societes.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )

    # ── utilisateurs (admin siège) ────────────────────────────────────────────
    op.create_table(
        "utilisateurs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(200), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("nom", sa.String(200), nullable=False),
        sa.Column(
            "role",
            postgresql.ENUM("admin", "superviseur", name="roleadmin", create_type=False),
            nullable=False,
        ),
        sa.Column("actif", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )

    # ── tablettes ─────────────────────────────────────────────────────────────
    op.create_table(
        "tablettes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("magasin_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("nom", sa.String(100), nullable=False),
        sa.Column("device_id", sa.String(100), nullable=True),
        sa.Column("derniere_sync", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["magasin_id"], ["magasins.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("magasin_id"),
    )

    # ── tokens_appairage ──────────────────────────────────────────────────────
    op.create_table(
        "tokens_appairage",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("magasin_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["magasin_id"], ["magasins.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
    )

    # ── sessions_tablette ─────────────────────────────────────────────────────
    op.create_table(
        "sessions_tablette",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tablette_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("magasin_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "role",
            postgresql.ENUM(
                "operateur", "responsable_depot", name="roletablette", create_type=False
            ),
            nullable=False,
        ),
        sa.Column("jwt_token_hash", sa.String(255), nullable=False),
        sa.Column("date_debut", sa.DateTime(timezone=True), nullable=False),
        sa.Column("date_fin", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actif", sa.Boolean(), nullable=False, server_default="true"),
        sa.ForeignKeyConstraint(["magasin_id"], ["magasins.id"]),
        sa.ForeignKeyConstraint(["tablette_id"], ["tablettes.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sessions_tablette_actif", "sessions_tablette", ["actif"])


def downgrade() -> None:
    op.drop_index("ix_sessions_tablette_actif", table_name="sessions_tablette")
    op.drop_table("sessions_tablette")
    op.drop_table("tokens_appairage")
    op.drop_table("tablettes")
    op.drop_table("utilisateurs")
    op.drop_table("magasins")
    op.drop_table("societes")

    op.execute("DROP TYPE IF EXISTS roletablette")
    op.execute("DROP TYPE IF EXISTS roleadmin")
