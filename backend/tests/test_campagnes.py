"""Tests d'intégration — Campagnes d'inventaire.

Couvre :
- CRUD campagnes (créer, lister, détail, modifier, supprimer)
- Gestion des articles (ajouter, doublon, retirer, import CSV/XLSX)
- Transitions de statut (démarrer, clôturer, conflits)
- Endpoint tablette /campagne-active
"""

import io
import uuid

import openpyxl
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.article import Article
from app.models.campagne import Campagne, StatutCampagne
from app.models.magasin import Magasin
from app.models.utilisateur import Utilisateur

# ── Helpers ────────────────────────────────────────────────────────────────────


def make_csv_cb(rows: list[dict]) -> bytes:
    if not rows:
        return b""
    headers = list(rows[0].keys())
    lines = [",".join(headers)]
    for row in rows:
        lines.append(",".join(str(row.get(h, "")) for h in headers))
    return "\n".join(lines).encode("utf-8")


def make_xlsx_cb(rows: list[dict]) -> bytes:
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


# ── CRUD de base ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_campagne(client: AsyncClient, auth_headers: dict, magasin: Magasin):
    resp = await client.post(
        "/api/v1/campagnes",
        json={"magasin_id": str(magasin.id), "nom": "Inventaire Semaine 21"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["nom"] == "Inventaire Semaine 21"
    assert data["statut"] == "brouillon"
    assert data["lignes"] == []


@pytest.mark.asyncio
async def test_list_campagnes(
    client: AsyncClient, auth_headers: dict, campagne: Campagne, magasin: Magasin
):
    resp = await client.get(
        f"/api/v1/campagnes?magasin_id={magasin.id}",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    ids = [c["id"] for c in resp.json()]
    assert str(campagne.id) in ids


@pytest.mark.asyncio
async def test_list_campagnes_filtre_statut(
    client: AsyncClient, auth_headers: dict, campagne: Campagne
):
    resp = await client.get(
        "/api/v1/campagnes?statut=brouillon",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert all(c["statut"] == "brouillon" for c in resp.json())


@pytest.mark.asyncio
async def test_get_campagne(client: AsyncClient, auth_headers: dict, campagne: Campagne):
    resp = await client.get(f"/api/v1/campagnes/{campagne.id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == str(campagne.id)


@pytest.mark.asyncio
async def test_update_campagne_nom(client: AsyncClient, auth_headers: dict, campagne: Campagne):
    resp = await client.patch(
        f"/api/v1/campagnes/{campagne.id}",
        json={"nom": "Nom mis à jour"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["nom"] == "Nom mis à jour"


@pytest.mark.asyncio
async def test_delete_campagne_brouillon(
    client: AsyncClient, auth_headers: dict, magasin: Magasin, admin_user: Utilisateur
):
    # Créer une campagne dédiée pour ce test
    resp = await client.post(
        "/api/v1/campagnes",
        json={"magasin_id": str(magasin.id), "nom": "A supprimer"},
        headers=auth_headers,
    )
    cid = resp.json()["id"]
    resp = await client.delete(f"/api/v1/campagnes/{cid}", headers=auth_headers)
    assert resp.status_code == 204


# ── Gestion des articles ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_add_article(
    client: AsyncClient, auth_headers: dict, campagne: Campagne, article: Article
):
    resp = await client.post(
        f"/api/v1/campagnes/{campagne.id}/articles",
        json={"article_id": str(article.id), "quantite_theorique": 15.5},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["article_id"] == str(article.id)
    assert float(data["quantite_theorique"]) == 15.5
    assert data["article"]["code_barre"] == article.code_barre


@pytest.mark.asyncio
async def test_add_article_doublon(
    client: AsyncClient,
    auth_headers: dict,
    campagne: Campagne,
    article: Article,
):
    # Premier ajout
    await client.post(
        f"/api/v1/campagnes/{campagne.id}/articles",
        json={"article_id": str(article.id)},
        headers=auth_headers,
    )
    # Doublon
    resp = await client.post(
        f"/api/v1/campagnes/{campagne.id}/articles",
        json={"article_id": str(article.id)},
        headers=auth_headers,
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_remove_article(
    client: AsyncClient,
    auth_headers: dict,
    campagne: Campagne,
    article: Article,
):
    await client.post(
        f"/api/v1/campagnes/{campagne.id}/articles",
        json={"article_id": str(article.id)},
        headers=auth_headers,
    )
    resp = await client.delete(
        f"/api/v1/campagnes/{campagne.id}/articles/{article.id}",
        headers=auth_headers,
    )
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_import_articles_csv(
    client: AsyncClient,
    auth_headers: dict,
    campagne: Campagne,
    article: Article,
):
    rows = [{"code_barre": article.code_barre, "quantite_theorique": "5"}]
    content = make_csv_cb(rows)
    resp = await client.post(
        f"/api/v1/campagnes/{campagne.id}/articles/import",
        headers=auth_headers,
        files={"file": ("articles.csv", content, "text/csv")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["added"] == 1
    assert data["skipped"] == 0
    assert data["errors"] == []


@pytest.mark.asyncio
async def test_import_articles_xlsx(
    client: AsyncClient,
    auth_headers: dict,
    campagne: Campagne,
    article: Article,
):
    rows = [{"code_barre": article.code_barre}]
    content = make_xlsx_cb(rows)
    resp = await client.post(
        f"/api/v1/campagnes/{campagne.id}/articles/import",
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
    assert resp.json()["added"] == 1


@pytest.mark.asyncio
async def test_import_code_barre_inconnu(
    client: AsyncClient, auth_headers: dict, campagne: Campagne
):
    rows = [{"code_barre": "9999999999999"}]
    content = make_csv_cb(rows)
    resp = await client.post(
        f"/api/v1/campagnes/{campagne.id}/articles/import",
        headers=auth_headers,
        files={"file": ("articles.csv", content, "text/csv")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["added"] == 0
    assert len(data["errors"]) == 1


@pytest.mark.asyncio
async def test_import_doublon_skipped(
    client: AsyncClient,
    auth_headers: dict,
    campagne: Campagne,
    article: Article,
):
    """Un article déjà présent est compté dans skipped, pas errors."""
    # Ajouter d'abord
    await client.post(
        f"/api/v1/campagnes/{campagne.id}/articles",
        json={"article_id": str(article.id)},
        headers=auth_headers,
    )
    rows = [{"code_barre": article.code_barre}]
    content = make_csv_cb(rows)
    resp = await client.post(
        f"/api/v1/campagnes/{campagne.id}/articles/import",
        headers=auth_headers,
        files={"file": ("articles.csv", content, "text/csv")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["added"] == 0
    assert data["skipped"] == 1


# ── Transitions de statut ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_demarrer_campagne(
    client: AsyncClient,
    auth_headers: dict,
    campagne: Campagne,
    db: AsyncSession,
):
    resp = await client.post(
        f"/api/v1/campagnes/{campagne.id}/demarrer",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["statut"] == "en_cours"
    assert data["date_debut"] is not None


@pytest.mark.asyncio
async def test_demarrer_campagne_deja_en_cours(
    client: AsyncClient,
    auth_headers: dict,
    campagne: Campagne,
    magasin: Magasin,
    admin_user: Utilisateur,
    db: AsyncSession,
):
    """Deux campagnes en cours pour le même magasin → 409."""
    # Démarrer la première
    await client.post(
        f"/api/v1/campagnes/{campagne.id}/demarrer",
        headers=auth_headers,
    )
    # Créer et tenter de démarrer une seconde
    resp2 = await client.post(
        "/api/v1/campagnes",
        json={"magasin_id": str(magasin.id), "nom": "Seconde campagne"},
        headers=auth_headers,
    )
    cid2 = resp2.json()["id"]
    resp = await client.post(
        f"/api/v1/campagnes/{cid2}/demarrer",
        headers=auth_headers,
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_cloturer_campagne(
    client: AsyncClient,
    auth_headers: dict,
    campagne: Campagne,
):
    await client.post(f"/api/v1/campagnes/{campagne.id}/demarrer", headers=auth_headers)
    resp = await client.post(
        f"/api/v1/campagnes/{campagne.id}/cloturer",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["statut"] == "terminee"
    assert data["date_fin"] is not None


@pytest.mark.asyncio
async def test_delete_campagne_en_cours_interdit(
    client: AsyncClient,
    auth_headers: dict,
    campagne: Campagne,
):
    await client.post(f"/api/v1/campagnes/{campagne.id}/demarrer", headers=auth_headers)
    resp = await client.delete(f"/api/v1/campagnes/{campagne.id}", headers=auth_headers)
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_remove_article_campagne_en_cours_interdit(
    client: AsyncClient,
    auth_headers: dict,
    campagne: Campagne,
    article: Article,
):
    await client.post(
        f"/api/v1/campagnes/{campagne.id}/articles",
        json={"article_id": str(article.id)},
        headers=auth_headers,
    )
    await client.post(f"/api/v1/campagnes/{campagne.id}/demarrer", headers=auth_headers)
    resp = await client.delete(
        f"/api/v1/campagnes/{campagne.id}/articles/{article.id}",
        headers=auth_headers,
    )
    assert resp.status_code == 409


# ── Endpoint tablette ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_campagne_active(
    client: AsyncClient,
    auth_headers: dict,
    tablette_headers: dict,
    campagne: Campagne,
    article: Article,
):
    # Ajouter un article et démarrer
    await client.post(
        f"/api/v1/campagnes/{campagne.id}/articles",
        json={"article_id": str(article.id)},
        headers=auth_headers,
    )
    await client.post(f"/api/v1/campagnes/{campagne.id}/demarrer", headers=auth_headers)

    resp = await client.get("/api/v1/campagne-active", headers=tablette_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["statut"] == "en_cours"
    assert len(data["lignes"]) == 1
    assert data["lignes"][0]["article"]["code_barre"] == article.code_barre


@pytest.mark.asyncio
async def test_get_campagne_active_aucune(
    client: AsyncClient,
    tablette_headers: dict,
    campagne: Campagne,
):
    """Campagne en brouillon → 404."""
    assert campagne.statut == StatutCampagne.brouillon
    resp = await client.get("/api/v1/campagne-active", headers=tablette_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_campagne_active_requiert_auth(client: AsyncClient):
    resp = await client.get("/api/v1/campagne-active")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_get_campagne_not_found(client: AsyncClient, auth_headers: dict):
    resp = await client.get(f"/api/v1/campagnes/{uuid.uuid4()}", headers=auth_headers)
    assert resp.status_code == 404
