import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from jose import JWTError
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db, now_utc
from app.core.limiter import limiter
from app.core.security import (
    create_admin_access_token,
    create_admin_refresh_token,
    create_tablette_token,
    decode_token,
    hash_jwt,
    verify_password,
)
from app.models.magasin import Magasin
from app.models.tablette import RoleTablette, SessionTablette, Tablette, TokenAppairage
from app.models.utilisateur import Utilisateur
from app.schemas.auth import (
    AdminLoginRequest,
    AdminRefreshRequest,
    AdminTokenResponse,
    TabletteAppairageRequest,
    TabletteAppairageResponse,
    TabletteLoginRequest,
    TabletteTokenResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Admin siège ────────────────────────────────────────────────────────────────


@router.post("/admin/login", response_model=AdminTokenResponse)
@limiter.limit("5/15minutes")
async def login_admin(
    request: Request,
    payload: AdminLoginRequest,
    db: AsyncSession = Depends(get_db),
) -> AdminTokenResponse:
    result = await db.execute(
        select(Utilisateur).where(
            Utilisateur.email == payload.email,
            Utilisateur.actif == True,  # noqa: E712
        )
    )
    user = result.scalar_one_or_none()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Identifiants invalides"
        )

    access_token = create_admin_access_token(user.id, user.role.value)
    refresh_token = create_admin_refresh_token(user.id)
    logger.info(f"Admin login: {user.email} ({user.role.value})")
    return AdminTokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=user.id,
        email=user.email,
        nom=user.nom,
        role=user.role.value,
    )


@router.post("/admin/refresh", response_model=AdminTokenResponse)
async def refresh_admin(
    payload: AdminRefreshRequest,
    db: AsyncSession = Depends(get_db),
) -> AdminTokenResponse:
    try:
        data = decode_token(payload.refresh_token)
        if data.get("type") != "refresh_admin":
            raise ValueError
        user_id = uuid.UUID(data["sub"])
    except (JWTError, ValueError, KeyError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token invalide"
        ) from None

    result = await db.execute(
        select(Utilisateur).where(Utilisateur.id == user_id, Utilisateur.actif == True)  # noqa: E712
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Utilisateur introuvable"
        )

    access_token = create_admin_access_token(user.id, user.role.value)
    refresh_token = create_admin_refresh_token(user.id)
    return AdminTokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=user.id,
        email=user.email,
        nom=user.nom,
        role=user.role.value,
    )


@router.post("/admin/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout_admin() -> None:
    # JWT stateless — le client supprime le token localement
    return


# ── Tablette : appairage ───────────────────────────────────────────────────────


@router.post("/tablette/appairer", response_model=TabletteAppairageResponse)
async def appairer_tablette(
    payload: TabletteAppairageRequest,
    db: AsyncSession = Depends(get_db),
) -> TabletteAppairageResponse:
    """Consomme un token d'appairage à usage unique et crée la ligne Tablette.

    Raises:
        HTTPException 400: token invalide, expiré ou déjà utilisé.
        HTTPException 409: une tablette est déjà associée à ce magasin.
    """
    result = await db.execute(select(TokenAppairage).where(TokenAppairage.token == payload.token))
    token_obj = result.scalar_one_or_none()

    if not token_obj:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Token d'appairage invalide"
        )
    if token_obj.used:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Token d'appairage déjà utilisé"
        )
    if token_obj.expires_at < datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Token d'appairage expiré"
        )

    # Vérifie qu'aucune tablette n'est déjà associée à ce magasin
    existing = await db.execute(select(Tablette).where(Tablette.magasin_id == token_obj.magasin_id))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ce magasin a déjà une tablette associée",
        )

    result_magasin = await db.execute(select(Magasin).where(Magasin.id == token_obj.magasin_id))
    magasin = result_magasin.scalar_one_or_none()
    if not magasin or not magasin.actif:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Magasin introuvable")

    tablette = Tablette(
        magasin_id=token_obj.magasin_id,
        nom=payload.nom,
        device_id=payload.device_id,
    )
    token_obj.used = True
    db.add(tablette)
    await db.commit()
    await db.refresh(tablette)

    logger.info(f"Tablette appairée: {tablette.id} → magasin {magasin.code}")
    return TabletteAppairageResponse(
        tablette_id=tablette.id,
        magasin_id=magasin.id,
        magasin_nom=magasin.nom,
        magasin_code=magasin.code,
    )


# ── Tablette : login de session ────────────────────────────────────────────────


@router.post("/tablette/login", response_model=TabletteTokenResponse)
@limiter.limit("5/15minutes")
async def login_tablette(
    request: Request,
    payload: TabletteLoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TabletteTokenResponse:
    """Détermine le rôle à partir du mot de passe et crée une session.

    Le mot de passe est testé contre password_operateur_hash puis
    password_responsable_hash du magasin associé à la tablette.

    Raises:
        HTTPException 404: tablette introuvable.
        HTTPException 401: mot de passe incorrect.
    """
    result = await db.execute(select(Tablette).where(Tablette.id == payload.tablette_id))
    tablette = result.scalar_one_or_none()
    if not tablette:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tablette introuvable")

    result_magasin = await db.execute(
        select(Magasin).where(Magasin.id == tablette.magasin_id, Magasin.actif == True)  # noqa: E712
    )
    magasin = result_magasin.scalar_one_or_none()
    if not magasin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Magasin introuvable ou désactivé"
        )

    # Détermine le rôle selon le hash qui correspond
    if verify_password(payload.password, magasin.password_operateur_hash):
        role = RoleTablette.operateur
    elif verify_password(payload.password, magasin.password_responsable_hash):
        role = RoleTablette.responsable_depot
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Mot de passe incorrect"
        )

    session_id = uuid.uuid4()
    token = create_tablette_token(session_id, tablette.id, magasin.id, role.value)
    token_hash = hash_jwt(token)

    session = SessionTablette(
        id=session_id,
        tablette_id=tablette.id,
        magasin_id=magasin.id,
        role=role,
        jwt_token_hash=token_hash,
    )
    db.add(session)
    await db.commit()

    logger.info(
        f"Session tablette ouverte: {session_id} — magasin {magasin.code} — rôle {role.value}"
    )
    return TabletteTokenResponse(
        access_token=token,
        tablette_id=tablette.id,
        magasin_id=magasin.id,
        magasin_nom=magasin.nom,
        session_id=session_id,
        role=role.value,
    )


@router.post("/tablette/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout_tablette(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Clôture la session tablette identifiée par le token Bearer.

    Si le token est absent ou invalide, répond quand même 204 (idempotent).
    """
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return

    token = auth.removeprefix("Bearer ")
    try:
        payload = decode_token(token)
        if payload.get("type") != "access_tablette":
            return
        session_id = uuid.UUID(payload["sub"])
    except (JWTError, ValueError):
        return

    result = await db.execute(
        select(SessionTablette).where(
            SessionTablette.id == session_id,
            SessionTablette.actif == True,  # noqa: E712
        )
    )
    session = result.scalar_one_or_none()
    if session:
        session.actif = False
        session.date_fin = now_utc()
        await db.commit()
        logger.info(f"Session tablette clôturée: {session_id}")
