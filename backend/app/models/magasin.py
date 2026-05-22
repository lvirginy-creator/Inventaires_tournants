import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, now_utc

if TYPE_CHECKING:
    from app.models.societe import Societe
    from app.models.tablette import SessionTablette, Tablette


class Magasin(Base):
    __tablename__ = "magasins"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    societe_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("societes.id"), nullable=False)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    nom: Mapped[str] = mapped_column(String(200), nullable=False)
    email_responsable: Mapped[str | None] = mapped_column(String(500), nullable=True)
    password_operateur_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    password_responsable_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    actif: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, onupdate=now_utc
    )

    societe: Mapped["Societe"] = relationship(back_populates="magasins")
    tablette: Mapped[Optional["Tablette"]] = relationship(back_populates="magasin", uselist=False)
    sessions: Mapped[list["SessionTablette"]] = relationship(back_populates="magasin")
