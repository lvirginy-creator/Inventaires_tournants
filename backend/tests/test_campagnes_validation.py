"""Tests d'intégration — Validation de campagne et envoi e-mail.

Couvre :
- Validation OK (terminee → validee)
- Rejet si statut incorrect (brouillon, en_cours, déjà validee)
- E-mail envoyé si email_responsable présent
- Aucun e-mail si email_responsable absent
"""

from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import now_utc
from app.core.security import hash_password
from app.models.campagne import Campagne, StatutCampagne
from app.models.comptage import Comptage
from app.models.magasin import Magasin
from app.models.tablette import RoleTablette, SessionTablette, Tablette
from app.models.utilisateur import Utilisateur

# ── Helpers ────────────────────────────────────────────────────────────────────


async def _make_campagne_terminee(
    client: AsyncClient,
    auth_headers: dict,
    magasin: Magasin,
    admin_user: Utilisateur,
    db: AsyncSession,
) -> str:
    """Crée une campagne et la fait passer en terminee via les endpoints."""
    r = await client.post(
        "/api/v1/campagnes",
        json={"magasin_id": str(magasin.id), "nom": f"Camp-{uuid.uuid4().hex[:6]}"},
        headers=auth_headers,
    )
    assert r.status_code == 201
    cid = r.json()["id"]

    await client.post(f"/api/v1/campagnes/{cid}/demarrer", headers=auth_headers)
    await client.post(f"/api/v1/campagnes/{cid}/cloturer", headers=auth_headers)
    return cid


async def _add_comptage(
    campagne_id: str,
    article_id: str,
    magasin_id: str,
    db: AsyncSession,
) -> None:
    """Insère un comptage directement en base (simulation de saisie tablette)."""
    # Créer une tablette et session minimales pour le FK session_id
    tablette = Tablette(
        magasin_id=uuid.UUID(magasin_id),
        nom="Tablette Validation Test",
        device_id=f"dev-val-{uuid.uuid4().hex[:6]}",
    )
    db.add(tablette)
    await db.flush()

    from app.core.security import create_tablette_token, hash_jwt

    session_id = uuid.uuid4()
    token = create_tablette_token(session_id, tablette.id, uuid.UUID(magasin_id), "operateur")
    sess = SessionTablette(
        id=session_id,
        tablette_id=tablette.id,
        magasin_id=uuid.UUID(magasin_id),
        role=RoleTablette.operateur,
        jwt_token_hash=hash_jwt(token),
    )
    db.add(sess)
    await db.flush()

    comptage = Comptage(
        campagne_id=uuid.UUID(campagne_id),
        article_id=uuid.UUID(article_id),
        magasin_id=uuid.UUID(magasin_id),
        session_id=session_id,
        quantite=5,
        client_uuid=str(uuid.uuid4()),
        counted_at=now_utc(),
    )
    db.add(comptage)
    await db.flush()


# ── Tests ──────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_valider_campagne_ok(
    client: AsyncClient,
    auth_headers: dict,
    magasin: Magasin,
    admin_user: Utilisateur,
    db: AsyncSession,
):
    """terminee → validee : statut mis à jour, e-mail planifié."""
    cid = await _make_campagne_terminee(client, auth_headers, magasin, admin_user, db)

    with patch("app.api.v1.campagnes.send_validation_email_background") as mock_send:
        resp = await client.post(f"/api/v1/campagnes/{cid}/valider", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["statut"] == "validee"
    # magasin.email_responsable = "test@g2c.fr" (voir conftest)
    mock_send.assert_called_once()
    call_kwargs = mock_send.call_args
    assert call_kwargs.kwargs["to"] == magasin.email_responsable


@pytest.mark.asyncio
async def test_valider_campagne_avec_ecarts(
    client: AsyncClient,
    auth_headers: dict,
    magasin: Magasin,
    admin_user: Utilisateur,
    article,  # fixture conftest
    db: AsyncSession,
):
    """Vérifie que les écarts sont calculés et transmis au service e-mail."""
    # Créer campagne, ajouter article, démarrer, ajouter comptage, clôturer
    r = await client.post(
        "/api/v1/campagnes",
        json={"magasin_id": str(magasin.id), "nom": "Camp-Ecarts"},
        headers=auth_headers,
    )
    cid = r.json()["id"]
    await client.post(
        f"/api/v1/campagnes/{cid}/articles",
        json={"article_id": str(article.id), "quantite_theorique": 10},
        headers=auth_headers,
    )
    await client.post(f"/api/v1/campagnes/{cid}/demarrer", headers=auth_headers)
    await _add_comptage(cid, str(article.id), str(magasin.id), db)
    await client.post(f"/api/v1/campagnes/{cid}/cloturer", headers=auth_headers)

    with patch("app.api.v1.campagnes.send_validation_email_background") as mock_send:
        resp = await client.post(f"/api/v1/campagnes/{cid}/valider", headers=auth_headers)

    assert resp.status_code == 200
    mock_send.assert_called_once()
    lignes_arg = mock_send.call_args.kwargs["lignes"]
    assert len(lignes_arg) == 1
    ligne = lignes_arg[0]
    assert ligne["qt_theo"] == 10.0
    assert ligne["qt_compte"] == 5.0
    assert ligne["ecart"] == -5.0


@pytest.mark.asyncio
async def test_valider_campagne_sans_email(
    client: AsyncClient,
    auth_headers: dict,
    admin_user: Utilisateur,
    societe,  # fixture conftest
    db: AsyncSession,
):
    """Pas d'email_responsable → validation OK mais send non appelé."""
    mag_sans_email = Magasin(
        societe_id=societe.id,
        code=f"M-SE-{uuid.uuid4().hex[:4]}",
        nom="Magasin sans email",
        email_responsable=None,
        password_operateur_hash=hash_password("op123456"),
        password_responsable_hash=hash_password("re123456"),
    )
    db.add(mag_sans_email)
    await db.flush()

    cid = await _make_campagne_terminee(client, auth_headers, mag_sans_email, admin_user, db)

    with patch("app.api.v1.campagnes.send_validation_email_background") as mock_send:
        resp = await client.post(f"/api/v1/campagnes/{cid}/valider", headers=auth_headers)

    assert resp.status_code == 200
    assert resp.json()["statut"] == "validee"
    mock_send.assert_not_called()


@pytest.mark.asyncio
async def test_valider_campagne_statut_incorrect_brouillon(
    client: AsyncClient,
    auth_headers: dict,
    campagne: Campagne,
):
    """Campagne en brouillon → 409."""
    assert campagne.statut == StatutCampagne.brouillon
    resp = await client.post(
        f"/api/v1/campagnes/{campagne.id}/valider",
        headers=auth_headers,
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_valider_campagne_statut_incorrect_en_cours(
    client: AsyncClient,
    auth_headers: dict,
    campagne: Campagne,
):
    """Campagne en cours → 409."""
    await client.post(f"/api/v1/campagnes/{campagne.id}/demarrer", headers=auth_headers)
    resp = await client.post(
        f"/api/v1/campagnes/{campagne.id}/valider",
        headers=auth_headers,
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_valider_campagne_deja_validee(
    client: AsyncClient,
    auth_headers: dict,
    magasin: Magasin,
    admin_user: Utilisateur,
    db: AsyncSession,
):
    """Campagne déjà validée → 409."""
    cid = await _make_campagne_terminee(client, auth_headers, magasin, admin_user, db)

    with patch("app.api.v1.campagnes.send_validation_email_background"):
        await client.post(f"/api/v1/campagnes/{cid}/valider", headers=auth_headers)

    # Deuxième appel
    resp = await client.post(f"/api/v1/campagnes/{cid}/valider", headers=auth_headers)
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_valider_campagne_non_autorise(
    client: AsyncClient,
    tablette_headers: dict,
    magasin: Magasin,
    admin_user: Utilisateur,
    auth_headers: dict,
    db: AsyncSession,
):
    """JWT tablette → 401 (seul l'admin peut valider)."""
    cid = await _make_campagne_terminee(client, auth_headers, magasin, admin_user, db)
    resp = await client.post(f"/api/v1/campagnes/{cid}/valider", headers=tablette_headers)
    assert resp.status_code in (401, 403)
