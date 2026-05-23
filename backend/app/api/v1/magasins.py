import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, require_admin_role
from app.core.database import get_db
from app.core.security import hash_password
from app.models.magasin import Magasin
from app.models.societe import Societe
from app.models.utilisateur import Utilisateur
from app.schemas.magasin import (
    MagasinCreate,
    MagasinPasswordReset,
    MagasinResponse,
    MagasinUpdate,
)

router = APIRouter(prefix="/magasins", tags=["magasins"])


@router.get("", response_model=list[MagasinResponse])
async def list_magasins(
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(get_current_admin),
) -> list[Magasin]:
    result = await db.execute(select(Magasin).order_by(Magasin.code))
    return list(result.scalars().all())


@router.post("", response_model=MagasinResponse, status_code=status.HTTP_201_CREATED)
async def create_magasin(
    payload: MagasinCreate,
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(require_admin_role),
) -> Magasin:
    societe = await db.execute(
        select(Societe).where(Societe.id == payload.societe_id, Societe.actif == True)  # noqa: E712
    )
    if not societe.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Société introuvable ou désactivée",
        )

    existing = await db.execute(select(Magasin).where(Magasin.code == payload.code))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Code magasin déjà utilisé",
        )

    magasin = Magasin(
        societe_id=payload.societe_id,
        code=payload.code,
        nom=payload.nom,
        email_responsable=payload.email_responsable,
        password_operateur_hash=hash_password(payload.password_operateur),
        password_responsable_hash=hash_password(payload.password_responsable),
    )
    db.add(magasin)
    await db.commit()
    await db.refresh(magasin)
    return magasin


@router.get("/{magasin_id}", response_model=MagasinResponse)
async def get_magasin(
    magasin_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(get_current_admin),
) -> Magasin:
    result = await db.execute(select(Magasin).where(Magasin.id == magasin_id))
    magasin = result.scalar_one_or_none()
    if not magasin:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Magasin introuvable")
    return magasin


@router.patch("/{magasin_id}", response_model=MagasinResponse)
async def update_magasin(
    magasin_id: uuid.UUID,
    payload: MagasinUpdate,
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(require_admin_role),
) -> Magasin:
    result = await db.execute(select(Magasin).where(Magasin.id == magasin_id))
    magasin = result.scalar_one_or_none()
    if not magasin:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Magasin introuvable")

    if payload.nom is not None:
        magasin.nom = payload.nom
    if payload.email_responsable is not None:
        magasin.email_responsable = payload.email_responsable
    if payload.actif is not None:
        magasin.actif = payload.actif

    await db.commit()
    await db.refresh(magasin)
    return magasin


@router.post("/{magasin_id}/reset-passwords", response_model=MagasinResponse)
async def reset_passwords(
    magasin_id: uuid.UUID,
    payload: MagasinPasswordReset,
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(require_admin_role),
) -> Magasin:
    if payload.password_operateur is None and payload.password_responsable is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Au moins un mot de passe requis",
        )

    result = await db.execute(select(Magasin).where(Magasin.id == magasin_id))
    magasin = result.scalar_one_or_none()
    if not magasin:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Magasin introuvable")

    if payload.password_operateur is not None:
        magasin.password_operateur_hash = hash_password(payload.password_operateur)
    if payload.password_responsable is not None:
        magasin.password_responsable_hash = hash_password(payload.password_responsable)

    await db.commit()
    await db.refresh(magasin)
    return magasin


@router.delete("/{magasin_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_magasin(
    magasin_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(require_admin_role),
) -> None:
    result = await db.execute(select(Magasin).where(Magasin.id == magasin_id))
    magasin = result.scalar_one_or_none()
    if not magasin:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Magasin introuvable")
    await db.delete(magasin)
    await db.commit()
