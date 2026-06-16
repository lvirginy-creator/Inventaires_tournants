import secrets
import string
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, require_admin_role
from app.core.config import get_settings
from app.core.database import get_db
from app.models.magasin import Magasin
from app.models.tablette import Tablette, TokenAppairage
from app.models.utilisateur import Utilisateur
from app.schemas.tablette_admin import (
    TabletteAdminResponse,
    TokenAppairageCreate,
    TokenAppairageResponse,
)

router = APIRouter(prefix="/tablettes", tags=["tablettes"])

settings = get_settings()


@router.get("", response_model=list[TabletteAdminResponse])
async def list_tablettes(
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(get_current_admin),
) -> list[Tablette]:
    result = await db.execute(select(Tablette).order_by(Tablette.created_at))
    return list(result.scalars().all())


@router.get("/{tablette_id}", response_model=TabletteAdminResponse)
async def get_tablette(
    tablette_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(get_current_admin),
) -> Tablette:
    result = await db.execute(select(Tablette).where(Tablette.id == tablette_id))
    tablette = result.scalar_one_or_none()
    if not tablette:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tablette introuvable")
    return tablette


@router.delete("/{tablette_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tablette(
    tablette_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(require_admin_role),
) -> None:
    from sqlalchemy import delete as sa_delete, update as sa_update

    from app.models.comptage import Comptage
    from app.models.tablette import SessionTablette

    result = await db.execute(select(Tablette).where(Tablette.id == tablette_id))
    tablette = result.scalar_one_or_none()
    if not tablette:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tablette introuvable")

    # Récupère les IDs de sessions pour pouvoir les détacher des comptages
    sessions_result = await db.execute(
        select(SessionTablette.id).where(SessionTablette.tablette_id == tablette_id)
    )
    session_ids = [row[0] for row in sessions_result.all()]

    # Détache les comptages de ces sessions (session_id nullable)
    if session_ids:
        await db.execute(
            sa_update(Comptage)
            .where(Comptage.session_id.in_(session_ids))
            .values(session_id=None)
        )

    # Supprime les sessions puis la tablette
    await db.execute(sa_delete(SessionTablette).where(SessionTablette.tablette_id == tablette_id))
    await db.delete(tablette)
    await db.commit()
    logger.info(f"Tablette supprimée: {tablette_id}")


@router.post("/tokens-appairage", response_model=TokenAppairageResponse, status_code=201)
async def create_token_appairage(
    payload: TokenAppairageCreate,
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(require_admin_role),
) -> TokenAppairage:
    """Génère un token d'appairage à usage unique pour un magasin."""
    magasin = await db.execute(
        select(Magasin).where(Magasin.id == payload.magasin_id, Magasin.actif == True)  # noqa: E712
    )
    if not magasin.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Magasin introuvable ou désactivé",
        )

    token = TokenAppairage(
        magasin_id=payload.magasin_id,
        token="".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(4)),
        expires_at=datetime.now(UTC) + timedelta(hours=settings.TOKEN_APPAIRAGE_HOURS),
    )
    db.add(token)
    await db.commit()
    await db.refresh(token)
    logger.info(f"Token appairage créé pour magasin {payload.magasin_id}")
    return token
