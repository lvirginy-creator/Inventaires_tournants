import uuid
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, now_utc

if TYPE_CHECKING:
    from app.models.article import Article
    from app.models.magasin import Magasin
    from app.models.utilisateur import Utilisateur


class StatutCampagne(StrEnum):
    brouillon = "brouillon"
    en_cours = "en_cours"
    terminee = "terminee"
    validee = "validee"


class Campagne(Base):
    """Campagne d'inventaire tournant pour un magasin."""

    __tablename__ = "campagnes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    magasin_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("magasins.id"), nullable=False)
    nom: Mapped[str] = mapped_column(String(200), nullable=False)
    statut: Mapped[StatutCampagne] = mapped_column(
        Enum(StatutCampagne), nullable=False, default=StatutCampagne.brouillon
    )
    date_debut: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    date_fin: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("utilisateurs.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, onupdate=now_utc
    )

    magasin: Mapped["Magasin"] = relationship()
    createur: Mapped["Utilisateur"] = relationship()
    lignes: Mapped[list["LigneCampagne"]] = relationship(
        back_populates="campagne", cascade="all, delete-orphan"
    )

    __table_args__ = (Index("ix_campagnes_magasin_statut", "magasin_id", "statut"),)


class LigneCampagne(Base):
    """Article rattaché à une campagne d'inventaire."""

    __tablename__ = "lignes_campagne"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campagne_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campagnes.id", ondelete="CASCADE"), nullable=False
    )
    article_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("articles.id"), nullable=False)
    quantite_theorique: Mapped[float | None] = mapped_column(Numeric(12, 3), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    campagne: Mapped["Campagne"] = relationship(back_populates="lignes")
    article: Mapped["Article"] = relationship()

    __table_args__ = (Index("ix_lignes_campagne_unique", "campagne_id", "article_id", unique=True),)
