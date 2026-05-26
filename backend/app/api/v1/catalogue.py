from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_session
from app.core.database import get_db, now_utc
from app.models.article import Article
from app.models.magasin import Magasin
from app.models.tablette import SessionTablette
from app.schemas.article import ArticleRead, CatalogueResponse

router = APIRouter(prefix="/catalogue", tags=["catalogue"])


async def _get_societe_id(session: SessionTablette, db: AsyncSession) -> str:
    """Résout le societe_id à partir de la session tablette."""
    result = await db.execute(select(Magasin).where(Magasin.id == session.magasin_id))
    magasin = result.scalar_one_or_none()
    if not magasin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Magasin introuvable",
        )
    return magasin.societe_id


@router.get("", response_model=CatalogueResponse)
async def get_catalogue(
    session: SessionTablette = Depends(get_current_session),
    db: AsyncSession = Depends(get_db),
) -> CatalogueResponse:
    """Retourne tous les articles actifs de la société du magasin."""
    societe_id = await _get_societe_id(session, db)

    result = await db.execute(
        select(Article)
        .where(
            Article.societe_id == societe_id,
            Article.actif == True,  # noqa: E712
        )
        .order_by(Article.libelle)
    )
    articles = list(result.scalars().all())

    return CatalogueResponse(
        last_sync=now_utc(),
        articles=[ArticleRead.model_validate(a) for a in articles],
    )


@router.get("/sync", response_model=CatalogueResponse)
async def sync_catalogue(
    since: datetime | None = Query(
        None,
        description=(
            "ISO datetime UTC — retourne uniquement les articles modifiés depuis cette date"
        ),
    ),
    session: SessionTablette = Depends(get_current_session),
    db: AsyncSession = Depends(get_db),
) -> CatalogueResponse:
    """Synchronisation incrémentale : retourne les articles modifiés depuis `since`.

    Retourne tous les articles (actifs ou non) modifiés, pour que la tablette
    puisse aussi supprimer localement les articles désactivés.
    """
    societe_id = await _get_societe_id(session, db)

    stmt = select(Article).where(Article.societe_id == societe_id)

    if since is not None:
        # Normaliser en UTC si naive
        if since.tzinfo is None:
            since = since.replace(tzinfo=UTC)
        stmt = stmt.where(Article.updated_at >= since)

    stmt = stmt.order_by(Article.libelle)
    result = await db.execute(stmt)
    articles = list(result.scalars().all())

    return CatalogueResponse(
        last_sync=now_utc(),
        articles=[ArticleRead.model_validate(a) for a in articles],
    )
