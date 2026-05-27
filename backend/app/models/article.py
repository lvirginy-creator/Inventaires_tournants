import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, now_utc

if TYPE_CHECKING:
    from app.models.societe import Societe


class Article(Base):
    __tablename__ = "articles"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    societe_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("societes.id"), nullable=False)
    code_barre: Mapped[str | None] = mapped_column(String(50), nullable=True)
    code_article: Mapped[str] = mapped_column(String(50), nullable=False)
    libelle: Mapped[str] = mapped_column(String(255), nullable=False)
    unite: Mapped[str | None] = mapped_column(String(20), nullable=True)
    actif: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, onupdate=now_utc
    )

    societe: Mapped["Societe"] = relationship()

    __table_args__ = (
        Index("ix_articles_societe_code_barre", "societe_id", "code_barre", unique=True),
        Index("ix_articles_societe_actif", "societe_id", "actif"),
    )
