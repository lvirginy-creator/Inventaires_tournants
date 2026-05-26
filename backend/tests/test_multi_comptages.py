"""Tests d'intégration — Multi-comptages et réconciliation admin.

Couvre :
- GET /campagnes/{id}/comptages : groupé par article, total correct
- DELETE /comptages/{id} : OK, et interdit si validée
- POST /campagnes/{id}/comptages/admin : saisie manuelle
- POST comptage admin article hors campagne → 404
- POST comptage admin campagne validée → 409
"""

from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import now_utc
from app.core.security import create_tablette_token, hash_jwt
from app.models.campagne import Campagne, StatutCampagne
from app.models.comptage import Comptage
from app.models.magasin import Magasin
from app.models.tablette import RoleTablette, SessionTablette, Tablette

# ── Helpers ────────────────────────────────────────────────────────────────────


async def _make_session(magasin_id: uuid.UUID, db: AsyncSession) -> SessionTablette:
    t = Tablette(
        magasin_id=magasin_id,
        nom=f"Tab-MC-{uuid.uuid4().hex[:4]}",
        device_id=f"dev-mc-{uuid.uuid4().hex[:4]}",
    )
    db.add(t)
    await db.flush()
    sid = uuid.uuid4()
    tok = create_tablette_token(sid, t.id, magasin_id, "operateur")
    s = SessionTablette(
        id=sid,
        tablette_id=t.id,
        magasin_id=magasin_id,
        role=RoleTablette.operateur,
        jwt_token_hash=hash_jwt(tok),
    )
    db.add(s)
    await db.flush()
    return s


async def _add_comptage(
    campagne_id: uuid.UUID,
    article_id: uuid.UUID,
    session: SessionTablette,
    quantite: float,
    db: AsyncSession,
) -> Comptage:
    c = Comptage(
        campagne_id=campagne_id,
        article_id=article_id,
        magasin_id=session.magasin_id,
        session_id=session.id,
        quantite=quantite,
        client_uuid=str(uuid.uuid4()),
        counted_at=now_utc(),
    )
    db.add(c)
    await db.flush()
    return c


# ── Tests GET /campagnes/{id}/comptages ───────────────────────────────────────


@pytest.mark.asyncio
async def test_get_comptages_campagne(
    client: AsyncClient,
    auth_headers: dict,
    campagne: Campagne,
    article,
    magasin: Magasin,
    db: AsyncSession,
):
    """Le GET retourne les comptages groupés par article avec le bon total."""
    await client.post(
        f"/api/v1/campagnes/{campagne.id}/articles",
        json={"article_id": str(article.id)},
        headers=auth_headers,
    )
    await client.post(f"/api/v1/campagnes/{campagne.id}/demarrer", headers=auth_headers)

    sess = await _make_session(magasin.id, db)
    await _add_comptage(campagne.id, article.id, sess, 3.0, db)
    await _add_comptage(campagne.id, article.id, sess, 5.0, db)

    resp = await client.get(
        f"/api/v1/campagnes/{campagne.id}/comptages",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["nb_comptages"] == 2
    assert len(data["articles"]) == 1
    art = data["articles"][0]
    assert art["nb_comptages"] == 2
    assert float(art["total"]) == 8.0
    assert len(art["comptages"]) == 2
    # Comptages via session tablette → tablette_nom renseigné
    assert art["comptages"][0]["tablette_nom"] is not None
    assert not art["comptages"][0]["saisie_admin"]


@pytest.mark.asyncio
async def test_get_comptages_brouillon_interdit(
    client: AsyncClient,
    auth_headers: dict,
    campagne: Campagne,
):
    """Campagne brouillon → 409."""
    assert campagne.statut == StatutCampagne.brouillon
    resp = await client.get(
        f"/api/v1/campagnes/{campagne.id}/comptages",
        headers=auth_headers,
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_get_comptages_auth_required(client: AsyncClient, campagne: Campagne):
    resp = await client.get(f"/api/v1/campagnes/{campagne.id}/comptages")
    assert resp.status_code in (401, 403)


# ── Tests DELETE /comptages/{id} ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_delete_comptage_ok(
    client: AsyncClient,
    auth_headers: dict,
    campagne: Campagne,
    article,
    magasin: Magasin,
    db: AsyncSession,
):
    """Supprimer un comptage → 204 ; le rapport met à jour le total."""
    await client.post(
        f"/api/v1/campagnes/{campagne.id}/articles",
        json={"article_id": str(article.id), "quantite_theorique": 10},
        headers=auth_headers,
    )
    await client.post(f"/api/v1/campagnes/{campagne.id}/demarrer", headers=auth_headers)

    sess = await _make_session(magasin.id, db)
    c1 = await _add_comptage(campagne.id, article.id, sess, 4.0, db)
    await _add_comptage(campagne.id, article.id, sess, 6.0, db)

    # Vérifier le rapport avant suppression : total = 10
    r = await client.get(f"/api/v1/campagnes/{campagne.id}/rapport", headers=auth_headers)
    assert float(r.json()["lignes"][0]["quantite_comptee"]) == 10.0

    # Supprimer le premier comptage (4)
    resp = await client.delete(f"/api/v1/comptages/{c1.id}", headers=auth_headers)
    assert resp.status_code == 204

    # Rapport mis à jour : total = 6
    r2 = await client.get(f"/api/v1/campagnes/{campagne.id}/rapport", headers=auth_headers)
    assert float(r2.json()["lignes"][0]["quantite_comptee"]) == 6.0


@pytest.mark.asyncio
async def test_delete_comptage_campagne_validee_interdit(
    client: AsyncClient,
    auth_headers: dict,
    campagne: Campagne,
    article,
    magasin: Magasin,
    db: AsyncSession,
):
    """Suppression interdite si campagne validée."""
    await client.post(
        f"/api/v1/campagnes/{campagne.id}/articles",
        json={"article_id": str(article.id)},
        headers=auth_headers,
    )
    await client.post(f"/api/v1/campagnes/{campagne.id}/demarrer", headers=auth_headers)

    sess = await _make_session(magasin.id, db)
    c = await _add_comptage(campagne.id, article.id, sess, 5.0, db)

    await client.post(f"/api/v1/campagnes/{campagne.id}/cloturer", headers=auth_headers)
    with patch("app.api.v1.campagnes.send_validation_email_background"):
        await client.post(f"/api/v1/campagnes/{campagne.id}/valider", headers=auth_headers)

    resp = await client.delete(f"/api/v1/comptages/{c.id}", headers=auth_headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_delete_comptage_not_found(client: AsyncClient, auth_headers: dict):
    resp = await client.delete(f"/api/v1/comptages/{uuid.uuid4()}", headers=auth_headers)
    assert resp.status_code == 404


# ── Tests POST /campagnes/{id}/comptages/admin ────────────────────────────────


@pytest.mark.asyncio
async def test_add_comptage_admin_ok(
    client: AsyncClient,
    auth_headers: dict,
    campagne: Campagne,
    article,
    db: AsyncSession,
):
    """Saisie admin OK : saisie_admin=True, session_id=None."""
    await client.post(
        f"/api/v1/campagnes/{campagne.id}/articles",
        json={"article_id": str(article.id), "quantite_theorique": 20},
        headers=auth_headers,
    )
    await client.post(f"/api/v1/campagnes/{campagne.id}/demarrer", headers=auth_headers)

    resp = await client.post(
        f"/api/v1/campagnes/{campagne.id}/comptages/admin",
        json={"article_id": str(article.id), "quantite": 7},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["saisie_admin"] is True
    assert data["session_id"] is None
    assert float(data["quantite"]) == 7.0

    # Vérifiable dans le rapport
    r = await client.get(f"/api/v1/campagnes/{campagne.id}/rapport", headers=auth_headers)
    assert float(r.json()["lignes"][0]["quantite_comptee"]) == 7.0


@pytest.mark.asyncio
async def test_add_comptage_admin_article_hors_campagne(
    client: AsyncClient,
    auth_headers: dict,
    campagne: Campagne,
    article,
    db: AsyncSession,
):
    """Article non présent dans la campagne → 404."""
    await client.post(f"/api/v1/campagnes/{campagne.id}/demarrer", headers=auth_headers)

    resp = await client.post(
        f"/api/v1/campagnes/{campagne.id}/comptages/admin",
        json={"article_id": str(article.id), "quantite": 5},
        headers=auth_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_add_comptage_admin_campagne_validee(
    client: AsyncClient,
    auth_headers: dict,
    campagne: Campagne,
    article,
    magasin: Magasin,
    db: AsyncSession,
):
    """Saisie admin interdite sur campagne validée → 409."""
    await client.post(
        f"/api/v1/campagnes/{campagne.id}/articles",
        json={"article_id": str(article.id)},
        headers=auth_headers,
    )
    await client.post(f"/api/v1/campagnes/{campagne.id}/demarrer", headers=auth_headers)
    await client.post(f"/api/v1/campagnes/{campagne.id}/cloturer", headers=auth_headers)
    with patch("app.api.v1.campagnes.send_validation_email_background"):
        await client.post(f"/api/v1/campagnes/{campagne.id}/valider", headers=auth_headers)

    resp = await client.post(
        f"/api/v1/campagnes/{campagne.id}/comptages/admin",
        json={"article_id": str(article.id), "quantite": 3},
        headers=auth_headers,
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_add_comptage_admin_sur_terminee(
    client: AsyncClient,
    auth_headers: dict,
    campagne: Campagne,
    article,
    db: AsyncSession,
):
    """Saisie admin autorisée sur campagne terminée (avant validation)."""
    await client.post(
        f"/api/v1/campagnes/{campagne.id}/articles",
        json={"article_id": str(article.id)},
        headers=auth_headers,
    )
    await client.post(f"/api/v1/campagnes/{campagne.id}/demarrer", headers=auth_headers)
    await client.post(f"/api/v1/campagnes/{campagne.id}/cloturer", headers=auth_headers)

    resp = await client.post(
        f"/api/v1/campagnes/{campagne.id}/comptages/admin",
        json={"article_id": str(article.id), "quantite": 12},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["saisie_admin"] is True
