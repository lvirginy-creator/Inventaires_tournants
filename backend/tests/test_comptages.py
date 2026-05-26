"""Tests d'intégration — Comptages (endpoint tablette).

Couvre :
- POST /comptages (unitaire, idempotent)
- POST /comptages/batch (multi, doublons)
- GET /comptages (filtre campagne)
- Rejet si campagne non en_cours
"""

import uuid
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient

from app.models.article import Article
from app.models.campagne import Campagne

# ── Helpers ────────────────────────────────────────────────────────────────────


def _payload(campagne: Campagne, article: Article, quantite: float = 5.0) -> dict:
    return {
        "campagne_id": str(campagne.id),
        "article_id": str(article.id),
        "quantite": quantite,
        "client_uuid": str(uuid.uuid4()),
        "counted_at": datetime.now(UTC).isoformat(),
    }


# ── Tests unitaires ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_submit_comptage(
    client: AsyncClient,
    auth_headers: dict,
    tablette_headers: dict,
    campagne: Campagne,
    article: Article,
):
    # Démarrer la campagne
    await client.post(f"/api/v1/campagnes/{campagne.id}/demarrer", headers=auth_headers)

    resp = await client.post(
        "/api/v1/comptages",
        json=_payload(campagne, article, 12.0),
        headers=tablette_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert float(data["quantite"]) == 12.0
    assert data["campagne_id"] == str(campagne.id)
    assert data["article_id"] == str(article.id)


@pytest.mark.asyncio
async def test_submit_comptage_idempotent(
    client: AsyncClient,
    auth_headers: dict,
    tablette_headers: dict,
    campagne: Campagne,
    article: Article,
):
    """Même client_uuid → retourne l'existant sans doublon."""
    await client.post(f"/api/v1/campagnes/{campagne.id}/demarrer", headers=auth_headers)

    payload = _payload(campagne, article)
    resp1 = await client.post("/api/v1/comptages", json=payload, headers=tablette_headers)
    assert resp1.status_code == 201

    resp2 = await client.post("/api/v1/comptages", json=payload, headers=tablette_headers)
    # Idempotent : même réponse, pas d'erreur
    assert resp2.status_code in (200, 201)
    assert resp2.json()["client_uuid"] == payload["client_uuid"]


@pytest.mark.asyncio
async def test_submit_comptage_campagne_non_active(
    client: AsyncClient,
    tablette_headers: dict,
    campagne: Campagne,
    article: Article,
):
    """Campagne en brouillon → 409."""
    resp = await client.post(
        "/api/v1/comptages",
        json=_payload(campagne, article),
        headers=tablette_headers,
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_submit_batch(
    client: AsyncClient,
    auth_headers: dict,
    tablette_headers: dict,
    campagne: Campagne,
    article: Article,
):
    await client.post(f"/api/v1/campagnes/{campagne.id}/demarrer", headers=auth_headers)

    entries = [_payload(campagne, article, q) for q in [1.0, 2.0, 3.0]]
    resp = await client.post(
        "/api/v1/comptages/batch",
        json={"comptages": entries},
        headers=tablette_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["created"] == 3
    assert data["duplicates"] == 0


@pytest.mark.asyncio
async def test_submit_batch_with_duplicates(
    client: AsyncClient,
    auth_headers: dict,
    tablette_headers: dict,
    campagne: Campagne,
    article: Article,
):
    """3 entrées dont 1 doublon → created=2, duplicates=1."""
    await client.post(f"/api/v1/campagnes/{campagne.id}/demarrer", headers=auth_headers)

    entries = [_payload(campagne, article) for _ in range(3)]
    # Soumettre d'abord la première
    await client.post(
        "/api/v1/comptages/batch",
        json={"comptages": [entries[0]]},
        headers=tablette_headers,
    )
    # Soumettre les 3 (dont la 1ère en doublon)
    resp = await client.post(
        "/api/v1/comptages/batch",
        json={"comptages": entries},
        headers=tablette_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["created"] == 2
    assert data["duplicates"] == 1


@pytest.mark.asyncio
async def test_list_comptages(
    client: AsyncClient,
    auth_headers: dict,
    tablette_headers: dict,
    campagne: Campagne,
    article: Article,
):
    await client.post(f"/api/v1/campagnes/{campagne.id}/demarrer", headers=auth_headers)
    payload = _payload(campagne, article, 7.0)
    await client.post("/api/v1/comptages", json=payload, headers=tablette_headers)

    resp = await client.get(
        f"/api/v1/comptages?campagne_id={campagne.id}",
        headers=tablette_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    assert any(c["client_uuid"] == payload["client_uuid"] for c in data)


@pytest.mark.asyncio
async def test_comptages_requires_auth(client: AsyncClient):
    resp = await client.get("/api/v1/comptages")
    assert resp.status_code in (401, 403)
