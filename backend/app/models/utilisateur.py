import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import Boolean, DateTime, Enum, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, now_utc


class RoleAdmin(StrEnum):
    admin = "admin"
    superviseur = "superviseur"


class Utilisateur(Base):
    """Compte admin siège uniquement. Les tablettes n'ont pas de compte utilisateur."""

    __tablename__ = "utilisateurs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    nom: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[RoleAdmin] = mapped_column(Enum(RoleAdmin), nullable=False)
    actif: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
