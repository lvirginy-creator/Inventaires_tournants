import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, require_admin_role
from app.core.database import get_db
from app.core.security import hash_password
from app.models.utilisateur import Utilisateur
from app.schemas.utilisateur import (
    UtilisateurCreate,
    UtilisateurPasswordReset,
    UtilisateurResponse,
    UtilisateurUpdate,
)

router = APIRouter(prefix="/utilisateurs", tags=["utilisateurs"])


@router.get("", response_model=list[UtilisateurResponse])
async def list_utilisateurs(
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(get_current_admin),
) -> list[Utilisateur]:
    result = await db.execute(select(Utilisateur).order_by(Utilisateur.email))
    return list(result.scalars().all())


@router.post("", response_model=UtilisateurResponse, status_code=status.HTTP_201_CREATED)
async def create_utilisateur(
    payload: UtilisateurCreate,
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(require_admin_role),
) -> Utilisateur:
    existing = await db.execute(select(Utilisateur).where(Utilisateur.email == payload.email))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email déjà utilisé",
        )

    user = Utilisateur(
        email=payload.email,
        password_hash=hash_password(payload.password),
        nom=payload.nom,
        role=payload.role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/{utilisateur_id}", response_model=UtilisateurResponse)
async def get_utilisateur(
    utilisateur_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(get_current_admin),
) -> Utilisateur:
    result = await db.execute(select(Utilisateur).where(Utilisateur.id == utilisateur_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable")
    return user


@router.patch("/{utilisateur_id}", response_model=UtilisateurResponse)
async def update_utilisateur(
    utilisateur_id: uuid.UUID,
    payload: UtilisateurUpdate,
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(require_admin_role),
) -> Utilisateur:
    result = await db.execute(select(Utilisateur).where(Utilisateur.id == utilisateur_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable")

    if payload.nom is not None:
        user.nom = payload.nom
    if payload.role is not None:
        user.role = payload.role
    if payload.actif is not None:
        user.actif = payload.actif

    await db.commit()
    await db.refresh(user)
    return user


@router.post("/{utilisateur_id}/reset-password", response_model=UtilisateurResponse)
async def reset_password(
    utilisateur_id: uuid.UUID,
    payload: UtilisateurPasswordReset,
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(require_admin_role),
) -> Utilisateur:
    result = await db.execute(select(Utilisateur).where(Utilisateur.id == utilisateur_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable")
    user.password_hash = hash_password(payload.password)
    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/{utilisateur_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_utilisateur(
    utilisateur_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(require_admin_role),
) -> None:
    result = await db.execute(select(Utilisateur).where(Utilisateur.id == utilisateur_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable")
    await db.delete(user)
    await db.commit()
