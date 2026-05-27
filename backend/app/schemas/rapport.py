import uuid
from decimal import Decimal

from pydantic import BaseModel

from app.models.campagne import StatutCampagne


class RapportLigne(BaseModel):
    article_id: uuid.UUID
    code_barre: str | None
    code_article: str
    libelle: str
    unite: str | None
    quantite_theorique: Decimal | None
    quantite_comptee: Decimal
    # None si aucune quantite_theorique renseignée
    ecart: Decimal | None
    ecart_pct: float | None  # None si qt_theo absente ou == 0


class ComptageHorsCampagne(BaseModel):
    article_id: uuid.UUID
    code_barre: str | None
    code_article: str
    libelle: str
    quantite_comptee: Decimal


class CampagneRapport(BaseModel):
    campagne_id: uuid.UUID
    campagne_nom: str
    magasin_id: uuid.UUID
    statut: StatutCampagne
    # ── Statistiques globales ──────────────────────────────────────────────────
    nb_articles: int
    nb_articles_comptes: int  # au moins 1 comptage enregistré
    nb_articles_ok: int  # |écart| == 0 (et théorique renseigné)
    nb_articles_en_ecart: int  # |écart| != 0 (et théorique renseigné)
    # ── Détail par article ────────────────────────────────────────────────────
    lignes: list[RapportLigne]
    # ── Articles comptés hors campagne (non prévus dans les lignes) ───────────
    hors_campagne: list[ComptageHorsCampagne] = []
