import uuid
from datetime import datetime

from pydantic import BaseModel


class TabletteAdminResponse(BaseModel):
    id: uuid.UUID
    magasin_id: uuid.UUID
    nom: str
    device_id: str | None
    derniere_sync: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenAppairageCreate(BaseModel):
    magasin_id: uuid.UUID


class TokenAppairageResponse(BaseModel):
    id: uuid.UUID
    magasin_id: uuid.UUID
    token: str
    expires_at: datetime
    used: bool
    created_at: datetime

    model_config = {"from_attributes": True}
