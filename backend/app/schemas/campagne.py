import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.campagne import StatutCampagne

# ── Article imbriqué dans une ligne ───────────────────────────────────────────


class ArticleResume(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    code_barre: str | None
    code_article: str
    libelle: str
    unite: str | None


# ── Lignes campagne ────────────────────────────────────────────────────────────


class LigneCampagneCreate(BaseModel):
    article_id: uuid.UUID
    quantite_theorique: Decimal | None = Field(None, ge=0)


class LigneCampagneRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    campagne_id: uuid.UUID
    article_id: uuid.UUID
    quantite_theorique: Decimal | None
    created_at: datetime
    article: ArticleResume


class LigneImportResponse(BaseModel):
    added: int
    skipped: int
    errors: list[str]


# ── Campagne ───────────────────────────────────────────────────────────────────


class CampagneCreate(BaseModel):
    magasin_id: uuid.UUID
    nom: str = Field(..., min_length=1, max_length=200)


class CampagneUpdate(BaseModel):
    nom: str | None = Field(None, min_length=1, max_length=200)


class CampagneSummary(BaseModel):
    """Vue allégée pour les listes (sans les lignes)."""

    model_config = {"from_attributes": True}

    id: uuid.UUID
    magasin_id: uuid.UUID
    nom: str
    statut: StatutCampagne
    date_debut: datetime | None
    date_fin: datetime | None
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
    nb_articles: int = 0


class CampagneRead(BaseModel):
    """Vue complète avec les lignes."""

    model_config = {"from_attributes": True}

    id: uuid.UUID
    magasin_id: uuid.UUID
    nom: str
    statut: StatutCampagne
    date_debut: datetime | None
    date_fin: datetime | None
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
    lignes: list[LigneCampagneRead]
