import uuid
from datetime import UTC
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, get_current_session, require_admin_role
from app.core.database import get_db, now_utc
from app.models.article import Article
from app.models.campagne import Campagne, LigneCampagne, StatutCampagne
from app.models.comptage import Comptage
from app.models.tablette import SessionTablette, Tablette
from app.models.utilisateur import Utilisateur
from app.schemas.comptage import (
    BatchComptageRequest,
    BatchComptageResponse,
    ComptageAdminCreate,
    ComptageCreate,
    ComptageDetail,
    ComptageRead,
    ComptagesCampagneResponse,
    ComptagesParArticle,
)

router = APIRouter(prefix="/comptages", tags=["comptages"])
# Routes admin sur /campagnes/{id}/comptages
admin_router = APIRouter(prefix="/campagnes", tags=["comptages-admin"])


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


async def _is_campagne_active(
    campagne_id: uuid.UUID, magasin_id: uuid.UUID, db: AsyncSession
) -> bool:
    """Retourne True si la campagne est en cours pour ce magasin (sans lever d'exception)."""
    result = await db.execute(
        select(Campagne).where(
            Campagne.id == campagne_id,
            Campagne.magasin_id == magasin_id,
            Campagne.statut == StatutCampagne.en_cours,
        )
    )
    return result.scalar_one_or_none() is not None


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
    skipped = 0

    # Cache des campagnes vérifiées pour éviter une requête par comptage
    campagne_cache: dict[uuid.UUID, bool] = {}

    for item in payload.comptages:
        if item.client_uuid in existing_uuids:
            continue

        if item.campagne_id not in campagne_cache:
            campagne_cache[item.campagne_id] = await _is_campagne_active(
                item.campagne_id, session.magasin_id, db
            )
        if not campagne_cache[item.campagne_id]:
            skipped += 1
            continue

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


# ── Admin : suppression d'un comptage ─────────────────────────────────────────


@router.delete("/{comptage_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comptage(
    comptage_id: uuid.UUID,
    _: Utilisateur = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Supprime un comptage individuel (correction d'une erreur de saisie).

    Interdit si la campagne est déjà validée (intégrité du rapport validé).
    """
    result = await db.execute(select(Comptage).where(Comptage.id == comptage_id))
    comptage = result.scalar_one_or_none()
    if not comptage:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comptage introuvable")

    # Vérifier le statut de la campagne
    camp_result = await db.execute(select(Campagne).where(Campagne.id == comptage.campagne_id))
    campagne = camp_result.scalar_one_or_none()
    if campagne and campagne.statut == StatutCampagne.validee:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Impossible de modifier les comptages d'une campagne validée",
        )

    await db.delete(comptage)
    await db.commit()


# ── Admin : GET /campagnes/{id}/comptages ─────────────────────────────────────


@admin_router.get("/{campagne_id}/comptages", response_model=ComptagesCampagneResponse)
async def list_comptages_campagne(
    campagne_id: uuid.UUID,
    _: Utilisateur = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> ComptagesCampagneResponse:
    """Liste tous les comptages d'une campagne, groupés par article.

    Disponible pour les statuts : en_cours, terminee, validee.
    Inclut le nom de la tablette source et le flag saisie_admin.
    """
    camp_result = await db.execute(select(Campagne).where(Campagne.id == campagne_id))
    campagne = camp_result.scalar_one_or_none()
    if not campagne:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campagne introuvable")
    if campagne.statut == StatutCampagne.brouillon:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Aucun comptage pour une campagne en brouillon",
        )

    # Jointure : comptages → articles, sessions_tablette → tablettes
    stmt = (
        select(
            Comptage.id,
            Comptage.article_id,
            Comptage.quantite,
            Comptage.counted_at,
            Comptage.created_at,
            Comptage.saisie_admin,
            Article.code_barre,
            Article.code_article,
            Article.libelle,
            Tablette.nom.label("tablette_nom"),
        )
        .join(Article, Article.id == Comptage.article_id)
        .outerjoin(SessionTablette, SessionTablette.id == Comptage.session_id)
        .outerjoin(Tablette, Tablette.id == SessionTablette.tablette_id)
        .where(Comptage.campagne_id == campagne_id)
        .order_by(Article.code_barre, Comptage.counted_at)
    )
    rows = (await db.execute(stmt)).all()

    # Grouper par article
    articles_map: dict[uuid.UUID, ComptagesParArticle] = {}
    for row in rows:
        if row.article_id not in articles_map:
            articles_map[row.article_id] = ComptagesParArticle(
                article_id=row.article_id,
                code_barre=row.code_barre,
                code_article=row.code_article,
                libelle=row.libelle,
                nb_comptages=0,
                total=Decimal(0),
                comptages=[],
            )
        detail = ComptageDetail(
            id=row.id,
            article_id=row.article_id,
            code_barre=row.code_barre,
            libelle=row.libelle,
            quantite=Decimal(str(row.quantite)),
            counted_at=row.counted_at,
            created_at=row.created_at,
            tablette_nom=row.tablette_nom,
            saisie_admin=row.saisie_admin,
        )
        articles_map[row.article_id].comptages.append(detail)
        articles_map[row.article_id].nb_comptages += 1
        articles_map[row.article_id].total += Decimal(str(row.quantite))

    articles = list(articles_map.values())
    return ComptagesCampagneResponse(
        campagne_id=campagne_id,
        nb_comptages=sum(a.nb_comptages for a in articles),
        articles=articles,
    )


# ── Admin : POST /campagnes/{id}/comptages/admin ──────────────────────────────


@admin_router.post(
    "/{campagne_id}/comptages/admin",
    response_model=ComptageRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_comptage_admin(
    campagne_id: uuid.UUID,
    payload: ComptageAdminCreate,
    user: Utilisateur = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db),
) -> ComptageRead:
    """Ajoute un comptage manuel depuis l'interface admin (article non scannable ou correction).

    Autorisé pour les statuts : en_cours, terminee.
    """
    camp_result = await db.execute(select(Campagne).where(Campagne.id == campagne_id))
    campagne = camp_result.scalar_one_or_none()
    if not campagne:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campagne introuvable")
    if campagne.statut not in {StatutCampagne.en_cours, StatutCampagne.terminee}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Saisie admin impossible — statut : {campagne.statut.value}",
        )

    # Vérifier que l'article est dans la campagne
    ligne_result = await db.execute(
        select(LigneCampagne).where(
            LigneCampagne.campagne_id == campagne_id,
            LigneCampagne.article_id == payload.article_id,
        )
    )
    if not ligne_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Article non présent dans cette campagne",
        )

    comptage = Comptage(
        campagne_id=campagne_id,
        article_id=payload.article_id,
        magasin_id=campagne.magasin_id,
        session_id=None,  # pas de session tablette pour les saisies admin
        quantite=payload.quantite,
        client_uuid=f"admin-{uuid.uuid4()}",
        counted_at=now_utc(),
        saisie_admin=True,
    )
    db.add(comptage)
    await db.commit()
    await db.refresh(comptage)
    return ComptageRead.model_validate(comptage)
