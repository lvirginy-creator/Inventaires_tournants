import uuid
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, now_utc

if TYPE_CHECKING:
    from app.models.magasin import Magasin


class RoleTablette(StrEnum):
    operateur = "operateur"
    responsable_depot = "responsable_depot"


class Tablette(Base):
    __tablename__ = "tablettes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    magasin_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("magasins.id"), nullable=False
    )
    nom: Mapped[str] = mapped_column(String(100), nullable=False)
    device_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    derniere_sync: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    magasin: Mapped["Magasin"] = relationship(back_populates="tablettes")
    sessions: Mapped[list["SessionTablette"]] = relationship(back_populates="tablette")


class TokenAppairage(Base):
    """Token à usage unique généré par l'admin pour appairer une tablette physique."""

    __tablename__ = "tokens_appairage"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    magasin_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("magasins.id"), nullable=False)
    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    magasin: Mapped["Magasin"] = relationship()


class SessionTablette(Base):
    """Session active d'un opérateur ou responsable sur une tablette."""

    __tablename__ = "sessions_tablette"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tablette_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tablettes.id"), nullable=False)
    magasin_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("magasins.id"), nullable=False)
    role: Mapped[RoleTablette] = mapped_column(Enum(RoleTablette), nullable=False)
    jwt_token_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    date_debut: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    date_fin: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    actif: Mapped[bool] = mapped_column(Boolean, default=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    tablette: Mapped["Tablette"] = relationship(back_populates="sessions")
    magasin: Mapped["Magasin"] = relationship(back_populates="sessions")
