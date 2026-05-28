from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_session
from app.core.database import get_db, now_utc
from app.models.campagne import Campagne, LigneCampagne, StatutCampagne
from app.models.comptage import Comptage
from app.models.tablette import SessionTablette
from app.schemas.campagne import CampagneRead

router = APIRouter(prefix="/campagne-active", tags=["campagne-active"])


@router.get("", response_model=CampagneRead)
async def get_campagne_active(
    session: SessionTablette = Depends(get_current_session),
    db: AsyncSession = Depends(get_db),
) -> CampagneRead:
    """Retourne la campagne en cours pour le magasin de la session tablette."""
    result = await db.execute(
        select(Campagne)
        .options(selectinload(Campagne.lignes).selectinload(LigneCampagne.article))
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


@router.post("/cloturer")
async def cloturer_campagne_active(
    session: SessionTablette = Depends(get_current_session),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Clôture la campagne active du magasin (tablette → statut terminee)."""
    result = await db.execute(
        select(Campagne).where(
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
    campagne.statut = StatutCampagne.terminee
    campagne.date_fin = now_utc()
    campagne.updated_at = now_utc()
    await db.commit()
    return {"detail": "Campagne clôturée"}


@router.delete("/comptages/{client_uuid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comptage_tablet(
    client_uuid: str,
    session: SessionTablette = Depends(get_current_session),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Supprime un comptage depuis la tablette, identifié par son client_uuid.

    Refusé si la campagne est déjà validée.
    """
    result = await db.execute(select(Comptage).where(Comptage.client_uuid == client_uuid))
    comptage = result.scalar_one_or_none()
    if not comptage:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comptage introuvable")
    if comptage.magasin_id != session.magasin_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accès refusé")

    camp_result = await db.execute(select(Campagne).where(Campagne.id == comptage.campagne_id))
    campagne = camp_result.scalar_one_or_none()
    if campagne and campagne.statut == StatutCampagne.validee:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Impossible de supprimer un comptage d'une campagne validée",
        )

    await db.delete(comptage)
    await db.commit()
