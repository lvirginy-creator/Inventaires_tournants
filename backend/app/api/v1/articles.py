import csv
import io
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, status
from sqlalchemy import select, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin_role
from app.core.database import get_db, now_utc
from app.models.article import Article
from app.models.utilisateur import Utilisateur
from app.schemas.article import (
    ArticleCreate,
    ArticleImportResponse,
    ArticleRead,
    ArticleUpdate,
)

router = APIRouter(prefix="/articles", tags=["articles"])

REQUIRED_COLUMNS = {"code_article", "libelle"}


# ── Parseurs de fichier ─────────────────────────────────────────────────────────


def _parse_csv_bytes(content: bytes) -> list[dict]:
    """Parse CSV bytes, auto-détection d'encodage (UTF-8 BOM, UTF-8, latin-1)."""
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            text = content.decode(encoding)
            reader = csv.DictReader(io.StringIO(text))
            rows = []
            for row in reader:
                rows.append({k.strip(): v.strip() if v else "" for k, v in row.items()})
            return rows
        except UnicodeDecodeError:
            continue
    raise ValueError("Impossible de décoder le fichier CSV (UTF-8 ou latin-1 attendu)")


def _parse_xlsx_bytes(content: bytes) -> list[dict]:
    """Parse XLSX bytes via openpyxl (première feuille)."""
    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    ws = wb.active
    raw_rows = list(ws.iter_rows(values_only=True))
    wb.close()

    if not raw_rows:
        return []

    headers = [str(h).strip() if h is not None else "" for h in raw_rows[0]]
    rows = []
    for raw in raw_rows[1:]:
        if all(cell is None for cell in raw):
            continue  # sauter les lignes vides
        rows.append(
            {headers[i]: (str(v).strip() if v is not None else "") for i, v in enumerate(raw)}
        )
    return rows


# ── Endpoints ──────────────────────────────────────────────────────────────────


@router.get("", response_model=list[ArticleRead])
async def list_articles(
    societe_id: uuid.UUID | None = Query(None),
    actif: bool | None = Query(None),
    q: str | None = Query(None, description="Recherche dans libellé, code article, code barre"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    _: Utilisateur = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db),
) -> list[Article]:
    stmt = select(Article)
    if societe_id is not None:
        stmt = stmt.where(Article.societe_id == societe_id)
    if actif is not None:
        stmt = stmt.where(Article.actif == actif)  # noqa: E712
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            Article.libelle.ilike(like)
            | Article.code_article.ilike(like)
            | Article.code_barre.ilike(like)  # safe: ilike on nullable returns false for NULL
        )
    stmt = stmt.order_by(Article.libelle).offset(skip).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post("", response_model=ArticleRead, status_code=status.HTTP_201_CREATED)
async def create_article(
    payload: ArticleCreate,
    _: Utilisateur = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db),
) -> Article:
    existing = await db.execute(
        select(Article).where(
            Article.societe_id == payload.societe_id,
            Article.code_barre == payload.code_barre,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Article avec code barre '{payload.code_barre}' existe déjà pour cette société",
        )
    article = Article(**payload.model_dump())
    db.add(article)
    await db.commit()
    await db.refresh(article)
    return article


# ⚠ /import doit être défini AVANT /{article_id} pour éviter l'ambiguïté de routage
@router.post("/import", response_model=ArticleImportResponse)
async def import_articles(
    file: UploadFile,
    societe_id: uuid.UUID = Query(..., description="Société cible pour l'import"),
    replace: bool = Query(False, description="Désactive tous les articles existants avant l'import"),
    _: Utilisateur = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db),
) -> ArticleImportResponse:
    """Import CSV ou XLSX — upsert sur (societe_id, code_barre).

    Format CSV : séparateur virgule, en-têtes en première ligne.
    Format XLSX : première ligne = en-têtes, première feuille.
    Colonnes requises : code_barre, code_article, libelle.
    Colonne optionnelle : unite.

    Si replace=True : désactive d'abord tous les articles de la société,
    puis l'upsert réactive ceux présents dans le fichier et en crée de nouveaux.
    Les articles absents du nouveau fichier restent désactivés.
    """
    content = await file.read()
    filename = file.filename or ""

    is_xlsx = filename.lower().endswith(".xlsx") or file.content_type in (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
    )

    try:
        rows = _parse_xlsx_bytes(content) if is_xlsx else _parse_csv_bytes(content)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Erreur lecture fichier : {exc}",
        ) from exc

    if not rows:
        return ArticleImportResponse(created=0, updated=0, errors=[])

    # Valider les colonnes
    missing = REQUIRED_COLUMNS - set(rows[0].keys())
    if missing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Colonnes manquantes : {', '.join(sorted(missing))}",
        )

    # Mode remplacement : désactiver tous les articles existants de la société
    if replace:
        await db.execute(
            sa_update(Article)
            .where(Article.societe_id == societe_id)
            .values(actif=False, updated_at=now_utc())
        )

    created = updated = 0
    errors: list[str] = []

    for i, row in enumerate(rows, start=2):
        code_barre = row.get("code_barre", "").strip() or None
        code_article = row.get("code_article", "").strip()
        libelle = row.get("libelle", "").strip()
        unite = row.get("unite", "").strip() or None

        if not code_article or not libelle:
            errors.append(
                f"Ligne {i} : champs obligatoires manquants (code_article, libelle)"
            )
            continue

        result = await db.execute(
            select(Article).where(
                Article.societe_id == societe_id,
                Article.code_article == code_article,
            )
        )
        existing_art = result.scalars().first()

        if existing_art:
            existing_art.code_barre = code_barre or existing_art.code_barre
            existing_art.libelle = libelle
            existing_art.unite = unite
            existing_art.actif = True
            existing_art.updated_at = now_utc()
            updated += 1
        else:
            db.add(
                Article(
                    societe_id=societe_id,
                    code_barre=code_barre or None,
                    code_article=code_article,
                    libelle=libelle,
                    unite=unite,
                )
            )
            created += 1

    await db.commit()
    return ArticleImportResponse(created=created, updated=updated, errors=errors)


@router.get("/{article_id}", response_model=ArticleRead)
async def get_article(
    article_id: uuid.UUID,
    _: Utilisateur = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db),
) -> Article:
    result = await db.execute(select(Article).where(Article.id == article_id))
    article = result.scalar_one_or_none()
    if not article:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article introuvable")
    return article


@router.patch("/{article_id}", response_model=ArticleRead)
async def update_article(
    article_id: uuid.UUID,
    payload: ArticleUpdate,
    _: Utilisateur = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db),
) -> Article:
    result = await db.execute(select(Article).where(Article.id == article_id))
    article = result.scalar_one_or_none()
    if not article:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article introuvable")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(article, field, value)
    article.updated_at = now_utc()
    await db.commit()
    await db.refresh(article)
    return article


@router.delete("/{article_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_article(
    article_id: uuid.UUID,
    _: Utilisateur = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Désactivation logique (actif=False) — pas de suppression physique."""
    result = await db.execute(select(Article).where(Article.id == article_id))
    article = result.scalar_one_or_none()
    if not article:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article introuvable")
    article.actif = False
    article.updated_at = now_utc()
    await db.commit()
