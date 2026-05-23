import uuid

import pytest
from httpx import AsyncClient

from app.models import Utilisateur
from app.models.utilisateur import RoleAdmin


@pytest.mark.asyncio
async def test_list_utilisateurs_ok(
    client: AsyncClient,
    auth_headers: dict,
    admin_user: Utilisateur,
) -> None:
    r = await client.get("/api/v1/utilisateurs", headers=auth_headers)
    assert r.status_code == 200
    assert any(u["id"] == str(admin_user.id) for u in r.json())


@pytest.mark.asyncio
async def test_create_utilisateur_ok(
    client: AsyncClient,
    auth_headers: dict,
) -> None:
    r = await client.post(
        "/api/v1/utilisateurs",
        json={
            "email": f"new_{uuid.uuid4().hex[:6]}@test.fr",
            "password": "Password1!",
            "nom": "Nouvel Admin",
            "role": "superviseur",
        },
        headers=auth_headers,
    )
    assert r.status_code == 201
    assert r.json()["role"] == "superviseur"
    assert "password_hash" not in r.json()


@pytest.mark.asyncio
async def test_create_utilisateur_duplicate_email(
    client: AsyncClient,
    auth_headers: dict,
    admin_user: Utilisateur,
) -> None:
    r = await client.post(
        "/api/v1/utilisateurs",
        json={
            "email": admin_user.email,
            "password": "Password1!",
            "nom": "Doublon",
        },
        headers=auth_headers,
    )
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_get_utilisateur_ok(
    client: AsyncClient,
    auth_headers: dict,
    admin_user: Utilisateur,
) -> None:
    r = await client.get(f"/api/v1/utilisateurs/{admin_user.id}", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["email"] == admin_user.email


@pytest.mark.asyncio
async def test_get_utilisateur_not_found(
    client: AsyncClient,
    auth_headers: dict,
) -> None:
    r = await client.get(f"/api/v1/utilisateurs/{uuid.uuid4()}", headers=auth_headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_update_utilisateur_ok(
    client: AsyncClient,
    auth_headers: dict,
    admin_user: Utilisateur,
) -> None:
    r = await client.patch(
        f"/api/v1/utilisateurs/{admin_user.id}",
        json={"nom": "Admin Modifié", "role": "superviseur"},
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["nom"] == "Admin Modifié"


@pytest.mark.asyncio
async def test_reset_password_ok(
    client: AsyncClient,
    auth_headers: dict,
    admin_user: Utilisateur,
) -> None:
    r = await client.post(
        f"/api/v1/utilisateurs/{admin_user.id}/reset-password",
        json={"password": "NewPass99!"},
        headers=auth_headers,
    )
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_delete_utilisateur_ok(
    client: AsyncClient,
    auth_headers: dict,
) -> None:
    r = await client.post(
        "/api/v1/utilisateurs",
        json={
            "email": f"del_{uuid.uuid4().hex[:6]}@test.fr",
            "password": "Password1!",
            "nom": "À supprimer",
        },
        headers=auth_headers,
    )
    assert r.status_code == 201
    user_id = r.json()["id"]

    r = await client.delete(f"/api/v1/utilisateurs/{user_id}", headers=auth_headers)
    assert r.status_code == 204

    r = await client.get(f"/api/v1/utilisateurs/{user_id}", headers=auth_headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_superviseur_cannot_manage_users(
    client: AsyncClient,
    admin_user: Utilisateur,
) -> None:
    from app.core.security import create_admin_access_token

    token = create_admin_access_token(admin_user.id, RoleAdmin.superviseur.value)
    r = await client.post(
        "/api/v1/utilisateurs",
        json={
            "email": f"blocked_{uuid.uuid4().hex[:6]}@test.fr",
            "password": "Password1!",
            "nom": "Bloqué",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403
