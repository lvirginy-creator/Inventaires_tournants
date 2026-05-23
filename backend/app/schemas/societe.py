import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class SocieteCreate(BaseModel):
    code: str = Field(min_length=1, max_length=20)
    nom: str = Field(min_length=1, max_length=200)


class SocieteUpdate(BaseModel):
    nom: str | None = Field(default=None, min_length=1, max_length=200)
    actif: bool | None = None


class SocieteResponse(BaseModel):
    id: uuid.UUID
    code: str
    nom: str
    actif: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
