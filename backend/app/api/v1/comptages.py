import uuid
from datetime import UTC

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_session
from app.core.database import get_db
from app.models.campagne import Campagne, StatutCampagne
from app.models.comptage import Comptage
from app.models.tablette import SessionTablette
from app.schemas.comptage import (
    BatchComptageRequest,
    BatchComptageResponse,
    ComptageCreate,
    ComptageRead,
)

router = APIRouter(prefix="/comptages", tags=["comptages"])


async def _check_campagne_active(
    campagne_id: uuid.UUID, magasin_id: uuid.UUID, db: AsyncSession
) -> None:
    """Vérifie que la campagne est en cours et appartient au magasin."""
    result = await db.execute(
        select(Campagne).where(
            Campagne.id == campagne_id,
            Campagne.magasin_id == magasin_id,
            Campagne.statut == StatutCampagne.en_cours,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Campagne introuvable, inactive ou n'appartenant pas à ce magasin",
        )


@router.post("", response_model=ComptageRead, status_code=status.HTTP_201_CREATED)
async def submit_comptage(
    payload: ComptageCreate,
    session: SessionTablette = Depends(get_current_session),
    db: AsyncSession = Depends(get_db),
) -> ComptageRead:
    """Soumettre un comptage unique.

    Idempotent : si `client_uuid` déjà présent, retourne le comptage existant (200).
    """
    # Vérifier doublon avant insertion
    existing = await db.execute(select(Comptage).where(Comptage.client_uuid == payload.client_uuid))
    dup = existing.scalar_one_or_none()
    if dup:
        return ComptageRead.model_validate(dup)

    await _check_campagne_active(payload.campagne_id, session.magasin_id, db)

    # Normaliser counted_at en UTC si naïf
    counted_at = payload.counted_at
    if counted_at.tzinfo is None:
        counted_at = counted_at.replace(tzinfo=UTC)

    comptage = Comptage(
        campagne_id=payload.campagne_id,
        article_id=payload.article_id,
        magasin_id=session.magasin_id,
        session_id=session.id,
        quantite=payload.quantite,
        client_uuid=payload.client_uuid,
        counted_at=counted_at,
    )
    db.add(comptage)
    try:
        await db.commit()
        await db.refresh(comptage)
    except IntegrityError:
        # Race condition : client_uuid inséré entre le check et l'INSERT
        await db.rollback()
        res = await db.execute(select(Comptage).where(Comptage.client_uuid == payload.client_uuid))
        comptage = res.scalar_one()
    return ComptageRead.model_validate(comptage)


@router.post("/batch", response_model=BatchComptageResponse)
async def submit_batch(
    payload: BatchComptageRequest,
    session: SessionTablette = Depends(get_current_session),
    db: AsyncSession = Depends(get_db),
) -> BatchComptageResponse:
    """Soumettre plusieurs comptages d'un coup (synchronisation offline).

    Chaque entrée est traitée de manière idempotente via `client_uuid`.
    Retourne le nombre de créations et de doublons ignorés.
    """
    # Récupérer les client_uuids déjà présents en une seule requête
    all_uuids = [c.client_uuid for c in payload.comptages]
    existing_res = await db.execute(
        select(Comptage.client_uuid).where(Comptage.client_uuid.in_(all_uuids))
    )
    existing_uuids = {row[0] for row in existing_res.all()}

    created = 0
    duplicates = len(existing_uuids)

    for item in payload.comptages:
        if item.client_uuid in existing_uuids:
            continue

        await _check_campagne_active(item.campagne_id, session.magasin_id, db)

        counted_at = item.counted_at
        if counted_at.tzinfo is None:
            counted_at = counted_at.replace(tzinfo=UTC)

        db.add(
            Comptage(
                campagne_id=item.campagne_id,
                article_id=item.article_id,
                magasin_id=session.magasin_id,
                session_id=session.id,
                quantite=item.quantite,
                client_uuid=item.client_uuid,
                counted_at=counted_at,
            )
        )
        created += 1

    if created:
        await db.commit()

    return BatchComptageResponse(created=created, duplicates=duplicates)


@router.get("", response_model=list[ComptageRead])
async def list_comptages(
    campagne_id: uuid.UUID | None = Query(None),
    session: SessionTablette = Depends(get_current_session),
    db: AsyncSession = Depends(get_db),
) -> list[ComptageRead]:
    """Liste les comptages du magasin de la session, optionnellement filtrés par campagne."""
    stmt = select(Comptage).where(Comptage.magasin_id == session.magasin_id)
    if campagne_id is not None:
        stmt = stmt.where(Comptage.campagne_id == campagne_id)
    stmt = stmt.order_by(Comptage.counted_at.desc())
    result = await db.execute(stmt)
    return [ComptageRead.model_validate(c) for c in result.scalars().all()]
