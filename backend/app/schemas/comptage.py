import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class ComptageCreate(BaseModel):
    campagne_id: uuid.UUID
    article_id: uuid.UUID
    quantite: Decimal = Field(..., ge=0)
    client_uuid: str = Field(..., min_length=36, max_length=36)
    counted_at: datetime
    commentaire: str | None = Field(None, max_length=500)


class ComptageRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    campagne_id: uuid.UUID
    article_id: uuid.UUID
    magasin_id: uuid.UUID
    session_id: uuid.UUID | None
    quantite: Decimal
    client_uuid: str
    counted_at: datetime
    created_at: datetime
    saisie_admin: bool = False
    commentaire: str | None = None


class BatchComptageRequest(BaseModel):
    comptages: list[ComptageCreate] = Field(..., min_length=1, max_length=500)


class BatchComptageItemResult(BaseModel):
    client_uuid: str
    status: Literal["created", "duplicate", "rejected"]
    motif: str | None = None


class BatchComptageResponse(BaseModel):
    results: list[BatchComptageItemResult]
    created: int
    duplicates: int
    rejected: int


# ── Schémas admin — réconciliation multi-comptages ─────────────────────────────


class ComptageAdminCreate(BaseModel):
    """Saisie manuelle d'un comptage depuis l'interface admin."""

    article_id: uuid.UUID
    quantite: Decimal = Field(..., ge=0)


class ComptageDetail(BaseModel):
    """Détail d'un comptage individuel (admin)."""

    id: uuid.UUID
    article_id: uuid.UUID
    code_barre: str | None  # None si l'article n'existe plus en base
    libelle: str | None
    quantite: Decimal
    counted_at: datetime
    created_at: datetime
    tablette_nom: str | None  # None pour les saisies admin
    saisie_admin: bool
    commentaire: str | None = None


class ComptagesParArticle(BaseModel):
    """Tous les comptages d'un article pour une campagne."""

    article_id: uuid.UUID
    code_barre: str | None
    code_article: str  # code article ou str(article_id) si article inconnu
    libelle: str | None
    nb_comptages: int
    total: Decimal
    comptages: list[ComptageDetail]


class ComptagesCampagneResponse(BaseModel):
    """Réponse complète : tous les comptages d'une campagne, groupés par article."""

    campagne_id: uuid.UUID
    nb_comptages: int
    articles: list[ComptagesParArticle]
