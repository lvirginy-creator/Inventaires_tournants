import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class ComptageCreate(BaseModel):
    campagne_id: uuid.UUID
    article_id: uuid.UUID
    quantite: Decimal = Field(..., ge=0)
    client_uuid: str = Field(..., min_length=36, max_length=36)
    counted_at: datetime


class ComptageRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    campagne_id: uuid.UUID
    article_id: uuid.UUID
    magasin_id: uuid.UUID
    session_id: uuid.UUID
    quantite: Decimal
    client_uuid: str
    counted_at: datetime
    created_at: datetime


class BatchComptageRequest(BaseModel):
    comptages: list[ComptageCreate] = Field(..., min_length=1, max_length=500)


class BatchComptageResponse(BaseModel):
    created: int
    duplicates: int
