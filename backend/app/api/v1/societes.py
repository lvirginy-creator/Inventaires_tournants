import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, require_admin_role
from app.core.database import get_db
from app.models.article import Article
from app.models.campagne import Campagne, LigneCampagne
from app.models.comptage import Comptage
from app.models.magasin import Magasin
from app.models.societe import Societe
from app.models.tablette import SessionTablette, Tablette, TokenAppairage
from app.models.utilisateur import Utilisateur
from app.schemas.societe import SocieteCreate, SocieteResponse, SocieteUpdate

router = APIRouter(prefix="/societes", tags=["societes"])


@router.get("", response_model=list[SocieteResponse])
async def list_societes(
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(get_current_admin),
) -> list[Societe]:
    result = await db.execute(select(Societe).order_by(Societe.code))
    return list(result.scalars().all())


@router.post("", response_model=SocieteResponse, status_code=status.HTTP_201_CREATED)
async def create_societe(
    payload: SocieteCreate,
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(require_admin_role),
) -> Societe:
    existing = await db.execute(select(Societe).where(Societe.code == payload.code))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Code société déjà utilisé",
        )
    societe = Societe(code=payload.code, nom=payload.nom)
    db.add(societe)
    await db.commit()
    await db.refresh(societe)
    return societe


@router.get("/{societe_id}", response_model=SocieteResponse)
async def get_societe(
    societe_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(get_current_admin),
) -> Societe:
    result = await db.execute(select(Societe).where(Societe.id == societe_id))
    societe = result.scalar_one_or_none()
    if not societe:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Société introuvable")
    return societe


@router.patch("/{societe_id}", response_model=SocieteResponse)
async def update_societe(
    societe_id: uuid.UUID,
    payload: SocieteUpdate,
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(require_admin_role),
) -> Societe:
    result = await db.execute(select(Societe).where(Societe.id == societe_id))
    societe = result.scalar_one_or_none()
    if not societe:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Société introuvable")

    if payload.nom is not None:
        societe.nom = payload.nom
    if payload.actif is not None:
        societe.actif = payload.actif

    await db.commit()
    await db.refresh(societe)
    return societe


@router.delete("/{societe_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_societe(
    societe_id: uuid.UUID,
    force: bool = Query(False, description="Supprime en cascade tous les magasins et leurs données"),
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(require_admin_role),
) -> None:
    result = await db.execute(select(Societe).where(Societe.id == societe_id))
    societe = result.scalar_one_or_none()
    if not societe:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Société introuvable")

    if force:
        # Récupérer les IDs des magasins de cette société
        mag_ids_subq = select(Magasin.id).where(Magasin.societe_id == societe_id).scalar_subquery()
        camp_ids_subq = select(Campagne.id).where(Campagne.magasin_id.in_(mag_ids_subq)).scalar_subquery()
        # Cascade dans l'ordre des FK
        await db.execute(delete(Comptage).where(Comptage.magasin_id.in_(mag_ids_subq)))
        await db.execute(delete(LigneCampagne).where(LigneCampagne.campagne_id.in_(camp_ids_subq)))
        await db.execute(delete(Campagne).where(Campagne.magasin_id.in_(mag_ids_subq)))
        await db.execute(delete(SessionTablette).where(SessionTablette.magasin_id.in_(mag_ids_subq)))
        await db.execute(delete(TokenAppairage).where(TokenAppairage.magasin_id.in_(mag_ids_subq)))
        await db.execute(delete(Tablette).where(Tablette.magasin_id.in_(mag_ids_subq)))
        await db.execute(delete(Magasin).where(Magasin.societe_id == societe_id))
        # Les articles sont liés directement à la société (articles.societe_id)
        await db.execute(delete(Article).where(Article.societe_id == societe_id))
        await db.delete(societe)
        await db.commit()
        return

    try:
        await db.delete(societe)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Impossible de supprimer cette société : des magasins y sont associés",
        )
