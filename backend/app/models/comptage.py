import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, now_utc

if TYPE_CHECKING:
    from app.models.article import Article
    from app.models.campagne import Campagne
    from app.models.magasin import Magasin
    from app.models.tablette import SessionTablette


class Comptage(Base):
    """Saisie de comptage physique effectuée par un opérateur sur tablette."""

    __tablename__ = "comptages"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campagne_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("campagnes.id"), nullable=False)
    article_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("articles.id"), nullable=False)
    magasin_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("magasins.id"), nullable=False)
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("sessions_tablette.id"), nullable=False
    )
    quantite: Mapped[float] = mapped_column(Numeric(12, 3), nullable=False)
    # Identifiant unique généré côté tablette — garantit l'idempotence du sync
    client_uuid: Mapped[str] = mapped_column(String(36), unique=True, nullable=False)
    # Horodatage côté tablette (peut différer du created_at serveur)
    counted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    campagne: Mapped["Campagne"] = relationship()
    article: Mapped["Article"] = relationship()
    magasin: Mapped["Magasin"] = relationship()
    session: Mapped["SessionTablette"] = relationship()

    __table_args__ = (
        Index("ix_comptages_campagne_article", "campagne_id", "article_id"),
        Index("ix_comptages_magasin", "magasin_id"),
    )
