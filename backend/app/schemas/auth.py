import uuid

from pydantic import BaseModel, EmailStr

# ── Admin siège ────────────────────────────────────────────────────────────────


class AdminLoginRequest(BaseModel):
    email: EmailStr
    password: str


class AdminRefreshRequest(BaseModel):
    refresh_token: str


class AdminTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: uuid.UUID
    email: str
    nom: str
    role: str


# ── Tablette : appairage ───────────────────────────────────────────────────────


class TabletteAppairageRequest(BaseModel):
    token: str
    nom: str
    device_id: str | None = None


class TabletteAppairageResponse(BaseModel):
    tablette_id: uuid.UUID
    magasin_id: uuid.UUID
    magasin_nom: str
    magasin_code: str


# ── Tablette : login de session ────────────────────────────────────────────────


class TabletteLoginRequest(BaseModel):
    tablette_id: uuid.UUID
    password: str


class TabletteTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    tablette_id: uuid.UUID
    magasin_id: uuid.UUID
    magasin_nom: str
    session_id: uuid.UUID
    role: str
