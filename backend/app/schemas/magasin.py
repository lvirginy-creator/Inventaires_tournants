import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class MagasinCreate(BaseModel):
    societe_id: uuid.UUID
    code: str = Field(min_length=1, max_length=20)
    nom: str = Field(min_length=1, max_length=200)
    email_responsable: EmailStr | None = None
    password_operateur: str = Field(min_length=6)
    password_responsable: str = Field(min_length=6)


class MagasinUpdate(BaseModel):
    societe_id: uuid.UUID | None = None
    nom: str | None = Field(default=None, min_length=1, max_length=200)
    email_responsable: EmailStr | None = None
    actif: bool | None = None
    password_operateur: str | None = Field(default=None, min_length=6)
    password_responsable: str | None = Field(default=None, min_length=6)


class MagasinPasswordReset(BaseModel):
    password_operateur: str | None = Field(default=None, min_length=6)
    password_responsable: str | None = Field(default=None, min_length=6)


class MagasinResponse(BaseModel):
    id: uuid.UUID
    societe_id: uuid.UUID
    code: str
    nom: str
    email_responsable: str | None
    actif: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
