import pytest
from httpx import AsyncClient

from app.models import Magasin, Societe


@pytest.mark.asyncio
async def test_list_magasins_ok(
    client: AsyncClient,
    auth_headers: dict,
    magasin: Magasin,
) -> None:
    r = await client.get("/api/v1/magasins", headers=auth_headers)
    assert r.status_code == 200
    assert any(m["id"] == str(magasin.id) for m in r.json())


@pytest.mark.asyncio
async def test_create_magasin_ok(
    client: AsyncClient,
    auth_headers: dict,
    societe: Societe,
) -> None:
    import uuid

    r = await client.post(
        "/api/v1/magasins",
        json={
            "societe_id": str(societe.id),
            "code": f"M-NEW-{uuid.uuid4().hex[:4]}",
            "nom": "Nouveau Magasin",
            "email_responsable": "resp@test.fr",
            "password_operateur": "operateur99",
            "password_responsable": "responsable99",
        },
        headers=auth_headers,
    )
    assert r.status_code == 201
    assert r.json()["societe_id"] == str(societe.id)
    assert "password_operateur_hash" not in r.json()


@pytest.mark.asyncio
async def test_create_magasin_duplicate_code(
    client: AsyncClient,
    auth_headers: dict,
    magasin: Magasin,
    societe: Societe,
) -> None:
    r = await client.post(
        "/api/v1/magasins",
        json={
            "societe_id": str(societe.id),
            "code": magasin.code,
            "nom": "Doublon",
            "password_operateur": "op123456",
            "password_responsable": "rs123456",
        },
        headers=auth_headers,
    )
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_get_magasin_ok(
    client: AsyncClient,
    auth_headers: dict,
    magasin: Magasin,
) -> None:
    r = await client.get(f"/api/v1/magasins/{magasin.id}", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["code"] == magasin.code


@pytest.mark.asyncio
async def test_update_magasin_ok(
    client: AsyncClient,
    auth_headers: dict,
    magasin: Magasin,
) -> None:
    r = await client.patch(
        f"/api/v1/magasins/{magasin.id}",
        json={"nom": "Magasin Modifié", "actif": False},
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["nom"] == "Magasin Modifié"
    assert r.json()["actif"] is False


@pytest.mark.asyncio
async def test_reset_passwords_ok(
    client: AsyncClient,
    auth_headers: dict,
    magasin: Magasin,
) -> None:
    r = await client.post(
        f"/api/v1/magasins/{magasin.id}/reset-passwords",
        json={"password_operateur": "newop123", "password_responsable": "newrs123"},
        headers=auth_headers,
    )
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_reset_passwords_no_field(
    client: AsyncClient,
    auth_headers: dict,
    magasin: Magasin,
) -> None:
    r = await client.post(
        f"/api/v1/magasins/{magasin.id}/reset-passwords",
        json={},
        headers=auth_headers,
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_delete_magasin_ok(
    client: AsyncClient,
    auth_headers: dict,
    societe: Societe,
) -> None:
    import uuid

    r = await client.post(
        "/api/v1/magasins",
        json={
            "societe_id": str(societe.id),
            "code": f"M-DEL-{uuid.uuid4().hex[:4]}",
            "nom": "À supprimer",
            "password_operateur": "op123456",
            "password_responsable": "rs123456",
        },
        headers=auth_headers,
    )
    assert r.status_code == 201
    magasin_id = r.json()["id"]

    r = await client.delete(f"/api/v1/magasins/{magasin_id}", headers=auth_headers)
    assert r.status_code == 204

    r = await client.get(f"/api/v1/magasins/{magasin_id}", headers=auth_headers)
    assert r.status_code == 404
