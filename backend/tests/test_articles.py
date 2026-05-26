"""Tests d'intégration — Articles & catalogue.

Couvre :
- CRUD admin (créer, lister, détail, modifier, désactiver)
- Import CSV (création, upsert, ligne malformée)
- Import XLSX (création, upsert, colonne manquante)
- GET /catalogue (tablette)
- GET /catalogue/sync (tablette, filtre since)
"""

import io
import uuid
from datetime import UTC, datetime, timedelta

import openpyxl
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.article import Article
from app.models.magasin import Magasin
from app.models.societe import Societe
from app.models.tablette import SessionTablette

# ── Helpers ────────────────────────────────────────────────────────────────────


def make_csv(rows: list[dict], sep: str = ",") -> bytes:
    if not rows:
        return b""
    headers = list(rows[0].keys())
    lines = [sep.join(headers)]
    for row in rows:
        lines.append(sep.join(str(row.get(h, "")) for h in headers))
    return "\n".join(lines).encode("utf-8")


def make_xlsx(rows: list[dict]) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    if not rows:
        buf = io.BytesIO()
        wb.save(buf)
        return buf.getvalue()
    headers = list(rows[0].keys())
    ws.append(headers)
    for row in rows:
        ws.append([row.get(h, "") for h in headers])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ── CRUD admin ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_article(client: AsyncClient, auth_headers: dict, societe: Societe):
    resp = await client.post(
        "/api/v1/articles",
        json={
            "societe_id": str(societe.id),
            "code_barre": "3760001234567",
            "code_article": "ART001",
            "libelle": "Eau Minérale 1L",
            "unite": "PCE",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["code_barre"] == "3760001234567"
    assert data["libelle"] == "Eau Minérale 1L"
    assert data["actif"] is True


@pytest.mark.asyncio
async def test_create_article_duplicate_code_barre(
    client: AsyncClient, auth_headers: dict, article: Article, societe: Societe
):
    resp = await client.post(
        "/api/v1/articles",
        json={
            "societe_id": str(societe.id),
            "code_barre": article.code_barre,
            "code_article": "DUP001",
            "libelle": "Doublon",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_list_articles(
    client: AsyncClient, auth_headers: dict, article: Article, societe: Societe
):
    resp = await client.get(
        f"/api/v1/articles?societe_id={societe.id}&actif=true",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    ids = [a["id"] for a in resp.json()]
    assert str(article.id) in ids


@pytest.mark.asyncio
async def test_list_articles_search(
    client: AsyncClient, auth_headers: dict, article: Article, societe: Societe
):
    resp = await client.get(
        f"/api/v1/articles?q=Article+Test&societe_id={societe.id}",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert any(a["id"] == str(article.id) for a in resp.json())


@pytest.mark.asyncio
async def test_get_article(client: AsyncClient, auth_headers: dict, article: Article):
    resp = await client.get(f"/api/v1/articles/{article.id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == str(article.id)


@pytest.mark.asyncio
async def test_get_article_not_found(client: AsyncClient, auth_headers: dict):
    resp = await client.get(f"/api/v1/articles/{uuid.uuid4()}", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_article(
    client: AsyncClient, auth_headers: dict, article: Article, db: AsyncSession
):
    resp = await client.patch(
        f"/api/v1/articles/{article.id}",
        json={"libelle": "Libellé Modifié", "unite": "KG"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["libelle"] == "Libellé Modifié"
    assert data["unite"] == "KG"


@pytest.mark.asyncio
async def test_deactivate_article(
    client: AsyncClient, auth_headers: dict, article: Article, db: AsyncSession
):
    resp = await client.delete(f"/api/v1/articles/{article.id}", headers=auth_headers)
    assert resp.status_code == 204

    await db.refresh(article)
    assert article.actif is False


# ── Import CSV ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_import_csv_creation(client: AsyncClient, auth_headers: dict, societe: Societe):
    rows = [
        {
            "code_barre": f"CSV{uuid.uuid4().hex[:8]}",
            "code_article": "C001",
            "libelle": "Jus Orange",
            "unite": "L",
        },
        {
            "code_barre": f"CSV{uuid.uuid4().hex[:8]}",
            "code_article": "C002",
            "libelle": "Lait Entier",
            "unite": "L",
        },
    ]
    content = make_csv(rows)
    resp = await client.post(
        f"/api/v1/articles/import?societe_id={societe.id}",
        headers=auth_headers,
        files={"file": ("articles.csv", content, "text/csv")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["created"] == 2
    assert data["updated"] == 0
    assert data["errors"] == []


@pytest.mark.asyncio
async def test_import_csv_upsert(
    client: AsyncClient, auth_headers: dict, article: Article, societe: Societe
):
    rows = [
        {
            "code_barre": article.code_barre,
            "code_article": article.code_article,
            "libelle": "Libellé mis à jour via import",
            "unite": "KG",
        }
    ]
    content = make_csv(rows)
    resp = await client.post(
        f"/api/v1/articles/import?societe_id={societe.id}",
        headers=auth_headers,
        files={"file": ("articles.csv", content, "text/csv")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["created"] == 0
    assert data["updated"] == 1


@pytest.mark.asyncio
async def test_import_csv_partial_errors(client: AsyncClient, auth_headers: dict, societe: Societe):
    """Lignes valides passent, lignes malformées remontent dans errors."""
    rows = [
        {"code_barre": f"OK{uuid.uuid4().hex[:8]}", "code_article": "OK001", "libelle": "Valide"},
        {"code_barre": "", "code_article": "BAD001", "libelle": ""},  # champs manquants
    ]
    content = make_csv(rows)
    resp = await client.post(
        f"/api/v1/articles/import?societe_id={societe.id}",
        headers=auth_headers,
        files={"file": ("articles.csv", content, "text/csv")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["created"] == 1
    assert len(data["errors"]) == 1


@pytest.mark.asyncio
async def test_import_csv_missing_columns(
    client: AsyncClient, auth_headers: dict, societe: Societe
):
    """Colonnes manquantes → 422."""
    content = b"code_barre,libelle\n1234,Test\n"
    resp = await client.post(
        f"/api/v1/articles/import?societe_id={societe.id}",
        headers=auth_headers,
        files={"file": ("articles.csv", content, "text/csv")},
    )
    assert resp.status_code == 422
    assert "code_article" in resp.json()["detail"]


# ── Import XLSX ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_import_xlsx_creation(client: AsyncClient, auth_headers: dict, societe: Societe):
    rows = [
        {
            "code_barre": f"XL{uuid.uuid4().hex[:8]}",
            "code_article": "X001",
            "libelle": "Café Moulu",
            "unite": "KG",
        },
        {"code_barre": f"XL{uuid.uuid4().hex[:8]}", "code_article": "X002", "libelle": "Thé Vert"},
    ]
    content = make_xlsx(rows)
    resp = await client.post(
        f"/api/v1/articles/import?societe_id={societe.id}",
        headers=auth_headers,
        files={
            "file": (
                "articles.xlsx",
                content,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["created"] == 2
    assert data["updated"] == 0


@pytest.mark.asyncio
async def test_import_xlsx_upsert(
    client: AsyncClient, auth_headers: dict, article: Article, societe: Societe
):
    rows = [
        {
            "code_barre": article.code_barre,
            "code_article": article.code_article,
            "libelle": "Libellé XLSX mis à jour",
        }
    ]
    content = make_xlsx(rows)
    resp = await client.post(
        f"/api/v1/articles/import?societe_id={societe.id}",
        headers=auth_headers,
        files={
            "file": (
                "articles.xlsx",
                content,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["updated"] == 1


@pytest.mark.asyncio
async def test_import_xlsx_missing_column(
    client: AsyncClient, auth_headers: dict, societe: Societe
):
    """Colonne code_article manquante → 422."""
    rows = [{"code_barre": "1234", "libelle": "Test sans code_article"}]
    content = make_xlsx(rows)
    resp = await client.post(
        f"/api/v1/articles/import?societe_id={societe.id}",
        headers=auth_headers,
        files={
            "file": (
                "articles.xlsx",
                content,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert resp.status_code == 422


# ── Catalogue tablette ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_catalogue(
    client: AsyncClient,
    tablette_headers: dict,
    article: Article,
    societe: Societe,
    session_tablette: SessionTablette,
    magasin: Magasin,
    db: AsyncSession,
):
    """GET /catalogue retourne les articles actifs de la société du magasin."""
    # S'assurer que l'article appartient à la même société que le magasin
    assert article.societe_id == societe.id
    assert magasin.societe_id == societe.id

    resp = await client.get("/api/v1/catalogue", headers=tablette_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "last_sync" in data
    assert "articles" in data
    ids = [a["id"] for a in data["articles"]]
    assert str(article.id) in ids


@pytest.mark.asyncio
async def test_catalogue_excludes_inactive(
    client: AsyncClient,
    tablette_headers: dict,
    article: Article,
    db: AsyncSession,
):
    """Les articles désactivés n'apparaissent pas dans /catalogue."""
    article.actif = False
    await db.flush()

    resp = await client.get("/api/v1/catalogue", headers=tablette_headers)
    assert resp.status_code == 200
    ids = [a["id"] for a in resp.json()["articles"]]
    assert str(article.id) not in ids


@pytest.mark.asyncio
async def test_catalogue_sync_since(
    client: AsyncClient,
    tablette_headers: dict,
    article: Article,
    societe: Societe,
    db: AsyncSession,
):
    """GET /catalogue/sync?since= filtre par updated_at."""
    # Référence avant la modification
    past = (datetime.now(UTC) - timedelta(seconds=5)).isoformat()

    article.libelle = "Modifié pour sync"
    article.updated_at = datetime.now(UTC)
    await db.flush()

    resp = await client.get(
        f"/api/v1/catalogue/sync?since={past}",
        headers=tablette_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    ids = [a["id"] for a in data["articles"]]
    assert str(article.id) in ids


@pytest.mark.asyncio
async def test_catalogue_sync_since_excludes_old(
    client: AsyncClient,
    tablette_headers: dict,
    article: Article,
):
    """GET /catalogue/sync?since=futur → liste vide."""
    future = (datetime.now(UTC) + timedelta(hours=1)).isoformat()
    resp = await client.get(
        f"/api/v1/catalogue/sync?since={future}",
        headers=tablette_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["articles"] == []


@pytest.mark.asyncio
async def test_catalogue_requires_auth(client: AsyncClient):
    """Sans token, /catalogue retourne 403."""
    resp = await client.get("/api/v1/catalogue")
    assert resp.status_code in (401, 403)
