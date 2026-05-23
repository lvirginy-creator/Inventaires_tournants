import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Magasin
from app.models.tablette import Tablette


@pytest.mark.asyncio
async def test_list_tablettes_ok(
    client: AsyncClient,
    auth_headers: dict,
) -> None:
    r = await client.get("/api/v1/tablettes", headers=auth_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


@pytest.mark.asyncio
async def test_create_token_appairage_ok(
    client: AsyncClient,
    auth_headers: dict,
    magasin: Magasin,
) -> None:
    r = await client.post(
        "/api/v1/tablettes/tokens-appairage",
        json={"magasin_id": str(magasin.id)},
        headers=auth_headers,
    )
    assert r.status_code == 201
    data = r.json()
    assert data["magasin_id"] == str(magasin.id)
    assert not data["used"]
    assert len(data["token"]) == 64


@pytest.mark.asyncio
async def test_create_token_appairage_invalid_magasin(
    client: AsyncClient,
    auth_headers: dict,
) -> None:
    import uuid

    r = await client.post(
        "/api/v1/tablettes/tokens-appairage",
        json={"magasin_id": str(uuid.uuid4())},
        headers=auth_headers,
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_get_tablette_ok(
    client: AsyncClient,
    auth_headers: dict,
    magasin: Magasin,
    db: AsyncSession,
) -> None:
    tablette = Tablette(magasin_id=magasin.id, nom="Tab-Test")
    db.add(tablette)
    await db.flush()

    r = await client.get(f"/api/v1/tablettes/{tablette.id}", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["nom"] == "Tab-Test"


@pytest.mark.asyncio
async def test_delete_tablette_ok(
    client: AsyncClient,
    auth_headers: dict,
    db: AsyncSession,
) -> None:
    import uuid

    from app.core.security import hash_password
    from app.models import Magasin, Societe

    soc = Societe(code=f"S-{uuid.uuid4().hex[:4]}", nom="Soc del")
    db.add(soc)
    await db.flush()
    mag = Magasin(
        societe_id=soc.id,
        code=f"M-TDL-{uuid.uuid4().hex[:4]}",
        nom="Mag del",
        password_operateur_hash=hash_password("op"),
        password_responsable_hash=hash_password("rs"),
    )
    db.add(mag)
    await db.flush()
    tab = Tablette(magasin_id=mag.id, nom="Tab del")
    db.add(tab)
    await db.flush()

    r = await client.delete(f"/api/v1/tablettes/{tab.id}", headers=auth_headers)
    assert r.status_code == 204

    r = await client.get(f"/api/v1/tablettes/{tab.id}", headers=auth_headers)
    assert r.status_code == 404
