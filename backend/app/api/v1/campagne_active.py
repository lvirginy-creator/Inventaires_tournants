from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_session
from app.core.database import get_db
from app.models.campagne import Campagne, StatutCampagne
from app.models.tablette import SessionTablette
from app.schemas.campagne import CampagneRead

router = APIRouter(prefix="/campagne-active", tags=["campagne-active"])


@router.get("", response_model=CampagneRead)
async def get_campagne_active(
    session: SessionTablette = Depends(get_current_session),
    db: AsyncSession = Depends(get_db),
) -> CampagneRead:
    """Retourne la campagne en cours pour le magasin de la session tablette.

    Utilisé au démarrage de la tablette pour charger la liste des articles
    à compter (stockée localement dans IndexedDB via Dexie).

    Raises:
        HTTPException 404: aucune campagne active pour ce magasin.
    """
    result = await db.execute(
        select(Campagne)
        .options(selectinload(Campagne.lignes))
        .where(
            Campagne.magasin_id == session.magasin_id,
            Campagne.statut == StatutCampagne.en_cours,
        )
    )
    campagne = result.scalar_one_or_none()
    if not campagne:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aucune campagne active pour ce magasin",
        )
    return CampagneRead.model_validate(campagne)
