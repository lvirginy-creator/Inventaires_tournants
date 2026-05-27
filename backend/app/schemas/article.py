import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ArticleCreate(BaseModel):
    societe_id: uuid.UUID
    code_barre: str | None = Field(None, max_length=50)
    code_article: str = Field(..., max_length=50)
    libelle: str = Field(..., max_length=255)
    unite: str | None = Field(None, max_length=20)


class ArticleUpdate(BaseModel):
    libelle: str | None = Field(None, max_length=255)
    code_article: str | None = Field(None, max_length=50)
    unite: str | None = Field(None, max_length=20)
    actif: bool | None = None


class ArticleRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    societe_id: uuid.UUID
    code_barre: str | None
    code_article: str
    libelle: str
    unite: str | None
    actif: bool
    created_at: datetime
    updated_at: datetime


class ArticleImportResponse(BaseModel):
    created: int
    updated: int
    errors: list[str]


class CatalogueResponse(BaseModel):
    last_sync: datetime
    articles: list[ArticleRead]
