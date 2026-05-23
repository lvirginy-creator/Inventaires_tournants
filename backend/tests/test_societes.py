import pytest
from httpx import AsyncClient

from app.models import Societe, Utilisateur


@pytest.mark.asyncio
async def test_list_societes_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/api/v1/societes")
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_list_societes_ok(
    client: AsyncClient,
    auth_headers: dict,
    societe: Societe,
) -> None:
    r = await client.get("/api/v1/societes", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert any(s["id"] == str(societe.id) for s in data)


@pytest.mark.asyncio
async def test_create_societe_ok(
    client: AsyncClient,
    auth_headers: dict,
) -> None:
    r = await client.post(
        "/api/v1/societes",
        json={"code": "TEST-CRE", "nom": "Société Créée"},
        headers=auth_headers,
    )
    assert r.status_code == 201
    assert r.json()["code"] == "TEST-CRE"
    assert r.json()["actif"] is True


@pytest.mark.asyncio
async def test_create_societe_duplicate_code(
    client: AsyncClient,
    auth_headers: dict,
    societe: Societe,
) -> None:
    r = await client.post(
        "/api/v1/societes",
        json={"code": societe.code, "nom": "Doublon"},
        headers=auth_headers,
    )
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_get_societe_ok(
    client: AsyncClient,
    auth_headers: dict,
    societe: Societe,
) -> None:
    r = await client.get(f"/api/v1/societes/{societe.id}", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["id"] == str(societe.id)


@pytest.mark.asyncio
async def test_get_societe_not_found(
    client: AsyncClient,
    auth_headers: dict,
) -> None:
    import uuid

    r = await client.get(f"/api/v1/societes/{uuid.uuid4()}", headers=auth_headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_update_societe_ok(
    client: AsyncClient,
    auth_headers: dict,
    societe: Societe,
) -> None:
    r = await client.patch(
        f"/api/v1/societes/{societe.id}",
        json={"nom": "Nouveau Nom", "actif": False},
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["nom"] == "Nouveau Nom"
    assert r.json()["actif"] is False


@pytest.mark.asyncio
async def test_delete_societe_ok(
    client: AsyncClient,
    auth_headers: dict,
) -> None:
    r = await client.post(
        "/api/v1/societes",
        json={"code": "TST-DEL", "nom": "À supprimer"},
        headers=auth_headers,
    )
    assert r.status_code == 201
    societe_id = r.json()["id"]

    r = await client.delete(f"/api/v1/societes/{societe_id}", headers=auth_headers)
    assert r.status_code == 204

    r = await client.get(f"/api/v1/societes/{societe_id}", headers=auth_headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_superviseur_cannot_create(
    client: AsyncClient,
    admin_user: Utilisateur,
) -> None:
    from app.core.security import create_admin_access_token
    from app.models.utilisateur import RoleAdmin

    admin_user.role = RoleAdmin.superviseur
    token = create_admin_access_token(admin_user.id, RoleAdmin.superviseur.value)
    r = await client.post(
        "/api/v1/societes",
        json={"code": "TST-SUP", "nom": "Superviseur"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403
