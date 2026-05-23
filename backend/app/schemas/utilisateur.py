import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models.utilisateur import RoleAdmin


class UtilisateurCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    nom: str = Field(min_length=1, max_length=200)
    role: RoleAdmin = RoleAdmin.superviseur


class UtilisateurUpdate(BaseModel):
    nom: str | None = Field(default=None, min_length=1, max_length=200)
    role: RoleAdmin | None = None
    actif: bool | None = None


class UtilisateurPasswordReset(BaseModel):
    password: str = Field(min_length=8)


class UtilisateurResponse(BaseModel):
    id: uuid.UUID
    email: str
    nom: str
    role: RoleAdmin
    actif: bool
    created_at: datetime

    model_config = {"from_attributes": True}
