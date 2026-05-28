import csv
import io
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_admin, require_admin_role
from app.core.database import get_db, now_utc
from app.models.article import Article
from app.models.campagne import Campagne, LigneCampagne, StatutCampagne
from app.models.comptage import Comptage
from app.models.magasin import Magasin
from app.models.utilisateur import Utilisateur
from app.schemas.campagne import (
    CampagneCreate,
    CampagneRead,
    CampagneSummary,
    CampagneUpdate,
    LigneCampagneCreate,
    LigneCampagneRead,
    LigneImportResponse,
)
from app.services.email import send_validation_email

router = APIRouter(prefix="/campagnes", tags=["campagnes"])

# Transitions autorisées
_TRANSITIONS: dict[StatutCampagne, StatutCampagne] = {
    StatutCampagne.brouillon: StatutCampagne.en_cours,
    StatutCampagne.en_cours: StatutCampagne.terminee,
}

# Statuts où les lignes sont modifiables
_STATUTS_EDITABLES = {StatutCampagne.brouillon}


# ── Helpers ────────────────────────────────────────────────────────────────────


async def _get_campagne_or_404(campagne_id: uuid.UUID, db: AsyncSession) -> Campagne:
    result = await db.execute(
        select(Campagne)
        .options(selectinload(Campagne.lignes).selectinload(LigneCampagne.article))
        .where(Campagne.id == campagne_id)
    )
    campagne = result.scalar_one_or_none()
    if not campagne:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campagne introuvable")
    return campagne


def _require_statut(campagne: Campagne, *statuts: StatutCampagne) -> None:
    if campagne.statut not in statuts:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Action impossible — statut actuel : {campagne.statut.value}",
        )


async def _get_societe_id_magasin(magasin_id: uuid.UUID, db: AsyncSession) -> uuid.UUID:
    result = await db.execute(select(Magasin).where(Magasin.id == magasin_id))
    magasin = result.scalar_one_or_none()
    if not magasin:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Magasin introuvable")
    return magasin.societe_id


def _parse_import_bytes(content: bytes, filename: str) -> list[dict]:
    """Parse CSV (UTF-8/latin-1) ou XLSX selon l'extension."""
    if filename.lower().endswith(".xlsx"):
        import openpyxl

        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        ws = wb.active
        raw = list(ws.iter_rows(values_only=True))
        wb.close()
        if not raw:
            return []
        headers = [str(h).strip() if h is not None else "" for h in raw[0]]
        return [
            {headers[i]: (str(v).strip() if v is not None else "") for i, v in enumerate(row)}
            for row in raw[1:]
            if not all(cell is None for cell in row)
        ]

    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            text = content.decode(enc)
            reader = csv.DictReader(io.StringIO(text))
            return [{k.strip(): v.strip() for k, v in row.items()} for row in reader]
        except UnicodeDecodeError:
            continue
    raise ValueError("Impossible de décoder le fichier")


# ── CRUD ───────────────────────────────────────────────────────────────────────


@router.get("", response_model=list[CampagneSummary])
async def list_campagnes(
    magasin_id: uuid.UUID | None = Query(None),
    statut: StatutCampagne | None = Query(None),
    _: Utilisateur = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> list[CampagneSummary]:
    stmt = select(Campagne).order_by(Campagne.created_at.desc())
    if magasin_id is not None:
        stmt = stmt.where(Campagne.magasin_id == magasin_id)
    if statut is not None:
        stmt = stmt.where(Campagne.statut == statut)
    result = await db.execute(stmt)
    campagnes = list(result.scalars().all())

    summaries = []
    for c in campagnes:
        # Compter les lignes sans charger les objets Article
        count_result = await db.execute(
            select(LigneCampagne).where(LigneCampagne.campagne_id == c.id)
        )
        nb = len(count_result.scalars().all())
        s = CampagneSummary.model_validate(c)
        s.nb_articles = nb
        summaries.append(s)
    return summaries


@router.post("", response_model=CampagneRead, status_code=status.HTTP_201_CREATED)
async def create_campagne(
    payload: CampagneCreate,
    user: Utilisateur = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db),
) -> CampagneRead:
    # Vérifier que le magasin existe
    await _get_societe_id_magasin(payload.magasin_id, db)

    campagne = Campagne(
        magasin_id=payload.magasin_id,
        nom=payload.nom,
        created_by=user.id,
    )
    db.add(campagne)
    await db.commit()
    result = await db.execute(
        select(Campagne)
        .options(selectinload(Campagne.lignes).selectinload(LigneCampagne.article))
        .where(Campagne.id == campagne.id)
    )
    campagne = result.scalar_one()
    return CampagneRead.model_validate(campagne)


@router.get("/{campagne_id}", response_model=CampagneRead)
async def get_campagne(
    campagne_id: uuid.UUID,
    _: Utilisateur = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> CampagneRead:
    campagne = await _get_campagne_or_404(campagne_id, db)
    return CampagneRead.model_validate(campagne)


@router.patch("/{campagne_id}", response_model=CampagneRead)
async def update_campagne(
    campagne_id: uuid.UUID,
    payload: CampagneUpdate,
    _: Utilisateur = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db),
) -> CampagneRead:
    campagne = await _get_campagne_or_404(campagne_id, db)
    _require_statut(campagne, StatutCampagne.brouillon)
    if payload.nom is not None:
        campagne.nom = payload.nom
    campagne.updated_at = now_utc()
    await db.commit()
    return CampagneRead.model_validate(campagne)


@router.delete("/{campagne_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_campagne(
    campagne_id: uuid.UUID,
    _: Utilisateur = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db),
) -> None:
    campagne = await _get_campagne_or_404(campagne_id, db)
    _require_statut(campagne, StatutCampagne.brouillon)
    await db.delete(campagne)
    await db.commit()


# ── Transitions de statut ──────────────────────────────────────────────────────


@router.post("/{campagne_id}/demarrer", response_model=CampagneRead)
async def demarrer_campagne(
    campagne_id: uuid.UUID,
    _: Utilisateur = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db),
) -> CampagneRead:
    campagne = await _get_campagne_or_404(campagne_id, db)
    _require_statut(campagne, StatutCampagne.brouillon)

    # Vérifier qu'il n'y a pas déjà une campagne en cours pour ce magasin
    existing = await db.execute(
        select(Campagne).where(
            Campagne.magasin_id == campagne.magasin_id,
            Campagne.statut == StatutCampagne.en_cours,
            Campagne.id != campagne_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ce magasin a déjà une campagne en cours",
        )

    campagne.statut = StatutCampagne.en_cours
    campagne.date_debut = now_utc()
    campagne.updated_at = now_utc()
    await db.commit()
    return CampagneRead.model_validate(campagne)


@router.post("/{campagne_id}/cloturer", response_model=CampagneRead)
async def cloturer_campagne(
    campagne_id: uuid.UUID,
    _: Utilisateur = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db),
) -> CampagneRead:
    campagne = await _get_campagne_or_404(campagne_id, db)
    _require_statut(campagne, StatutCampagne.en_cours)

    campagne.statut = StatutCampagne.terminee
    campagne.date_fin = now_utc()
    campagne.updated_at = now_utc()
    await db.commit()
    return CampagneRead.model_validate(campagne)


@router.post("/{campagne_id}/valider", response_model=CampagneRead)
async def valider_campagne(
    campagne_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    _: Utilisateur = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db),
) -> CampagneRead:
    """Valide une campagne terminée et envoie un e-mail récapitulatif au responsable du magasin."""
    campagne = await _get_campagne_or_404(campagne_id, db)
    _require_statut(campagne, StatutCampagne.terminee)

    # ── Charger le magasin ──────────────────────────────────────────────────────
    mag_result = await db.execute(select(Magasin).where(Magasin.id == campagne.magasin_id))
    magasin = mag_result.scalar_one()

    # ── Agréger les comptages par article ────────────────────────────────────────
    agg_result = await db.execute(
        select(Comptage.article_id, func.sum(Comptage.quantite).label("total"))
        .where(Comptage.campagne_id == campagne_id)
        .group_by(Comptage.article_id)
    )
    comptages_par_article: dict[uuid.UUID, float] = {
        row.article_id: float(row.total) for row in agg_result
    }

    # ── Charger les lignes et les articles en bulk ───────────────────────────────
    lignes_result = await db.execute(
        select(LigneCampagne).where(LigneCampagne.campagne_id == campagne_id)
    )
    lignes = list(lignes_result.scalars().all())

    article_ids = [lg.article_id for lg in lignes]
    arts_result = await db.execute(select(Article).where(Article.id.in_(article_ids)))
    articles_map: dict[uuid.UUID, Article] = {a.id: a for a in arts_result.scalars().all()}

    # ── Construire le tableau d'écarts pour l'e-mail (groupé par code_article) ────
    groups: dict[str, dict] = {}
    for ligne in lignes:
        art = articles_map.get(ligne.article_id)
        if art is None:
            continue
        key = art.code_article
        qt_theo = float(ligne.quantite_theorique) if ligne.quantite_theorique is not None else None
        qt_compte = comptages_par_article.get(ligne.article_id, 0.0)
        if key not in groups:
            groups[key] = {
                "code_article": key,
                "libelle": art.libelle,
                "qt_theo": qt_theo,
                "qt_compte": qt_compte,
            }
        else:
            if qt_theo is not None:
                groups[key]["qt_theo"] = (groups[key]["qt_theo"] or 0.0) + qt_theo
            groups[key]["qt_compte"] += qt_compte

    lignes_email: list[dict] = []
    for g in groups.values():
        qt_theo = g["qt_theo"]
        qt_compte = g["qt_compte"]
        ecart = (qt_compte - qt_theo) if qt_theo is not None else None
        ecart_pct = (ecart / qt_theo * 100) if (qt_theo and qt_theo != 0) else None
        lignes_email.append(
            {
                "code_article": g["code_article"],
                "libelle": g["libelle"],
                "qt_theo": qt_theo,
                "qt_compte": qt_compte,
                "ecart": ecart,
                "ecart_pct": ecart_pct,
            }
        )

    # ── Transition terminee → validee ────────────────────────────────────────────
    campagne.statut = StatutCampagne.validee
    campagne.updated_at = now_utc()
    await db.commit()

    # ── E-mail en tâche de fond (ne bloque pas la réponse) ──────────────────────
    if magasin.email_responsable:
        background_tasks.add_task(
            send_validation_email,
            to=magasin.email_responsable,
            campagne_nom=campagne.nom,
            magasin_nom=magasin.nom,
            lignes=lignes_email,
        )

    return CampagneRead.model_validate(campagne)


# ── Gestion des articles (lignes) ──────────────────────────────────────────────


@router.post(
    "/{campagne_id}/articles",
    response_model=LigneCampagneRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_article(
    campagne_id: uuid.UUID,
    payload: LigneCampagneCreate,
    _: Utilisateur = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db),
) -> LigneCampagneRead:
    campagne = await _get_campagne_or_404(campagne_id, db)
    _require_statut(campagne, *_STATUTS_EDITABLES)

    # Vérifier que l'article existe et appartient à la même société
    societe_id = await _get_societe_id_magasin(campagne.magasin_id, db)
    art_result = await db.execute(
        select(Article).where(
            Article.id == payload.article_id,
            Article.societe_id == societe_id,
            Article.actif == True,  # noqa: E712
        )
    )
    article = art_result.scalar_one_or_none()
    if not article:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Article introuvable ou n'appartenant pas à la société du magasin",
        )

    # Doublon par code_article (un seul code article par campagne, tous codes-barres confondus)
    dup = await db.execute(
        select(LigneCampagne)
        .join(Article, Article.id == LigneCampagne.article_id)
        .where(
            LigneCampagne.campagne_id == campagne_id,
            Article.code_article == article.code_article,
        )
    )
    if dup.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Un article avec ce code article est déjà dans la campagne",
        )

    ligne = LigneCampagne(
        campagne_id=campagne_id,
        article_id=payload.article_id,
        quantite_theorique=payload.quantite_theorique,
    )
    db.add(ligne)
    await db.commit()
    await db.refresh(ligne)
    return LigneCampagneRead.model_validate(ligne)


@router.delete(
    "/{campagne_id}/articles/{article_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_article(
    campagne_id: uuid.UUID,
    article_id: uuid.UUID,
    _: Utilisateur = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db),
) -> None:
    campagne = await _get_campagne_or_404(campagne_id, db)
    _require_statut(campagne, *_STATUTS_EDITABLES)

    result = await db.execute(
        select(LigneCampagne).where(
            LigneCampagne.campagne_id == campagne_id,
            LigneCampagne.article_id == article_id,
        )
    )
    ligne = result.scalar_one_or_none()
    if not ligne:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Article non présent dans la campagne",
        )
    await db.delete(ligne)
    await db.commit()


# ── Import CSV/XLSX de codes barres ───────────────────────────────────────────


@router.post("/{campagne_id}/articles/import", response_model=LigneImportResponse)
async def import_articles_campagne(
    campagne_id: uuid.UUID,
    file: UploadFile,
    _: Utilisateur = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db),
) -> LigneImportResponse:
    """Importe une liste de codes barres (CSV ou XLSX) dans la campagne.

    Colonnes : code_barre (requise), quantite_theorique (optionnelle).
    Les codes barres déjà présents sont ignorés (skipped).
    """
    campagne = await _get_campagne_or_404(campagne_id, db)
    _require_statut(campagne, *_STATUTS_EDITABLES)

    content = await file.read()
    filename = file.filename or ""

    try:
        rows = _parse_import_bytes(content, filename)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Erreur lecture fichier : {exc}",
        ) from exc

    if not rows:
        return LigneImportResponse(added=0, skipped=0, errors=[])

    if "code_barre" not in rows[0]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Colonne 'code_barre' manquante",
        )

    societe_id = await _get_societe_id_magasin(campagne.magasin_id, db)

    added = skipped = 0
    errors: list[str] = []

    for i, row in enumerate(rows, start=2):
        code_barre = row.get("code_barre", "").strip()
        if not code_barre:
            errors.append(f"Ligne {i} : code_barre vide")
            continue

        qt_raw = row.get("quantite_theorique", "").strip()
        try:
            qt: float | None = float(qt_raw) if qt_raw else None
        except ValueError:
            qt = None

        # Lookup article
        art_res = await db.execute(
            select(Article).where(
                Article.code_barre == code_barre,
                Article.societe_id == societe_id,
                Article.actif == True,  # noqa: E712
            )
        )
        article = art_res.scalar_one_or_none()
        if not article:
            errors.append(f"Ligne {i} : code barre '{code_barre}' introuvable dans le catalogue")
            continue

        # Doublon par code_article (une seule ligne par code article dans la campagne)
        dup = await db.execute(
            select(LigneCampagne)
            .join(Article, Article.id == LigneCampagne.article_id)
            .where(
                LigneCampagne.campagne_id == campagne_id,
                Article.code_article == article.code_article,
            )
        )
        if dup.scalar_one_or_none():
            skipped += 1
            continue

        db.add(
            LigneCampagne(
                campagne_id=campagne_id,
                article_id=article.id,
                quantite_theorique=qt,
            )
        )
        added += 1

    await db.commit()
    return LigneImportResponse(added=added, skipped=skipped, errors=errors)
