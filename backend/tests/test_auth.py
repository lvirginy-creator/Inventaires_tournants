"""Tests unitaires du module d'authentification."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import Magasin, Utilisateur
from app.models.tablette import SessionTablette, Tablette, TokenAppairage

# ── Admin login ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_admin_login_ok(client: AsyncClient, admin_user: Utilisateur) -> None:
    resp = await client.post(
        "/api/v1/auth/admin/login",
        json={"email": admin_user.email, "password": "Admin1234!"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["role"] == "admin"
    assert data["email"] == admin_user.email


@pytest.mark.asyncio
async def test_admin_login_wrong_password(client: AsyncClient, admin_user: Utilisateur) -> None:
    resp = await client.post(
        "/api/v1/auth/admin/login",
        json={"email": admin_user.email, "password": "mauvais_mdp"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_admin_login_unknown_email(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/admin/login",
        json={"email": "inconnu@test.fr", "password": "n'importe"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_admin_refresh_ok(client: AsyncClient, admin_user: Utilisateur) -> None:
    login = await client.post(
        "/api/v1/auth/admin/login",
        json={"email": admin_user.email, "password": "Admin1234!"},
    )
    refresh_token = login.json()["refresh_token"]

    resp = await client.post(
        "/api/v1/auth/admin/refresh",
        json={"refresh_token": refresh_token},
    )
    assert resp.status_code == 200
    assert "access_token" in resp.json()


@pytest.mark.asyncio
async def test_admin_refresh_invalid_token(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/admin/refresh",
        json={"refresh_token": "token.invalide.ici"},
    )
    assert resp.status_code == 401


# ── Appairage tablette ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_appairage_ok(
    client: AsyncClient, token_appairage: TokenAppairage, db: AsyncSession
) -> None:
    resp = await client.post(
        "/api/v1/auth/tablette/appairer",
        json={
            "token": token_appairage.token,
            "nom": "Tablette Caisse 1",
            "device_id": "ABC123",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "tablette_id" in data
    assert data["magasin_id"] == str(token_appairage.magasin_id)


@pytest.mark.asyncio
async def test_appairage_token_invalide(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/tablette/appairer",
        json={"token": "token_inexistant_abc", "nom": "Tablette X"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_appairage_token_expire(
    client: AsyncClient, magasin: Magasin, db: AsyncSession
) -> None:
    expired = TokenAppairage(
        magasin_id=magasin.id,
        token=f"expired_{uuid.uuid4().hex}",
        expires_at=datetime.now(UTC) - timedelta(hours=1),
    )
    db.add(expired)
    await db.flush()

    resp = await client.post(
        "/api/v1/auth/tablette/appairer",
        json={"token": expired.token, "nom": "Tablette Y"},
    )
    assert resp.status_code == 400
    assert "expiré" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_appairage_token_deja_utilise(
    client: AsyncClient, token_appairage: TokenAppairage, db: AsyncSession
) -> None:
    # Premier appairage
    await client.post(
        "/api/v1/auth/tablette/appairer",
        json={"token": token_appairage.token, "nom": "Tablette A"},
    )
    # Deuxième tentative avec le même token
    resp = await client.post(
        "/api/v1/auth/tablette/appairer",
        json={"token": token_appairage.token, "nom": "Tablette B"},
    )
    assert resp.status_code == 400
    assert "déjà utilisé" in resp.json()["detail"]


# ── Login tablette ─────────────────────────────────────────────────────────────


async def _create_tablette(magasin: Magasin, db: AsyncSession) -> Tablette:
    t = Tablette(magasin_id=magasin.id, nom="Tablette Test")
    db.add(t)
    await db.flush()
    return t


@pytest.mark.asyncio
async def test_tablette_login_role_operateur(
    client: AsyncClient, magasin: Magasin, db: AsyncSession
) -> None:
    tablette = await _create_tablette(magasin, db)
    resp = await client.post(
        "/api/v1/auth/tablette/login",
        json={"tablette_id": str(tablette.id), "password": "operateur123"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["role"] == "operateur"
    assert "access_token" in data
    assert data["magasin_id"] == str(magasin.id)


@pytest.mark.asyncio
async def test_tablette_login_role_responsable(
    client: AsyncClient, magasin: Magasin, db: AsyncSession
) -> None:
    tablette = await _create_tablette(magasin, db)
    resp = await client.post(
        "/api/v1/auth/tablette/login",
        json={"tablette_id": str(tablette.id), "password": "responsable123"},
    )
    assert resp.status_code == 200
    assert resp.json()["role"] == "responsable_depot"


@pytest.mark.asyncio
async def test_tablette_login_mauvais_password(
    client: AsyncClient, magasin: Magasin, db: AsyncSession
) -> None:
    tablette = await _create_tablette(magasin, db)
    resp = await client.post(
        "/api/v1/auth/tablette/login",
        json={"tablette_id": str(tablette.id), "password": "mauvais_mdp"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_tablette_login_tablette_inexistante(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/tablette/login",
        json={"tablette_id": str(uuid.uuid4()), "password": "operateur123"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_tablette_session_creee_en_db(
    client: AsyncClient, magasin: Magasin, db: AsyncSession
) -> None:
    tablette = await _create_tablette(magasin, db)
    resp = await client.post(
        "/api/v1/auth/tablette/login",
        json={"tablette_id": str(tablette.id), "password": "responsable123"},
    )
    assert resp.status_code == 200
    session_id = uuid.UUID(resp.json()["session_id"])

    from sqlalchemy import select

    result = await db.execute(select(SessionTablette).where(SessionTablette.id == session_id))
    session = result.scalar_one_or_none()
    assert session is not None
    assert session.actif is True
    assert session.role.value == "responsable_depot"


# ── Renouvellement token tablette ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_tablette_renouveler_ok(
    client: AsyncClient, session_tablette: SessionTablette, db: AsyncSession
) -> None:
    token = session_tablette._token  # type: ignore[attr-defined]
    resp = await client.post(
        "/api/v1/auth/tablette/renouveler",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["access_token"] != token  # nouveau token émis
    assert data["session_id"] == str(session_tablette.id)

    await db.refresh(session_tablette)
    assert session_tablette.last_seen_at is not None


@pytest.mark.asyncio
async def test_tablette_renouveler_session_inactive(
    client: AsyncClient, session_tablette: SessionTablette, db: AsyncSession
) -> None:
    session_tablette.actif = False
    await db.flush()

    token = session_tablette._token  # type: ignore[attr-defined]
    resp = await client.post(
        "/api/v1/auth/tablette/renouveler",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_tablette_renouveler_token_expire(
    client: AsyncClient, session_tablette: SessionTablette, db: AsyncSession
) -> None:
    settings = get_settings()
    payload = {
        "sub": str(session_tablette.id),
        "type": "access_tablette",
        "tablette_id": str(session_tablette.tablette_id),
        "magasin_id": str(session_tablette.magasin_id),
        "session_id": str(session_tablette.id),
        "role": session_tablette.role.value,
        "exp": datetime.now(UTC) - timedelta(seconds=1),
    }
    expired_token = jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

    resp = await client.post(
        "/api/v1/auth/tablette/renouveler",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_tablette_renouveler_mauvais_type_token(
    client: AsyncClient, admin_user: Utilisateur
) -> None:
    from app.core.security import create_admin_access_token

    admin_token = create_admin_access_token(admin_user.id, admin_user.role.value)
    resp = await client.post(
        "/api/v1/auth/tablette/renouveler",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 401


# ── Logout tablette ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_tablette_logout(client: AsyncClient, magasin: Magasin, db: AsyncSession) -> None:
    tablette = await _create_tablette(magasin, db)
    login_resp = await client.post(
        "/api/v1/auth/tablette/login",
        json={"tablette_id": str(tablette.id), "password": "operateur123"},
    )
    token = login_resp.json()["access_token"]
    session_id = uuid.UUID(login_resp.json()["session_id"])

    resp = await client.post(
        "/api/v1/auth/tablette/logout",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 204

    from sqlalchemy import select

    result = await db.execute(select(SessionTablette).where(SessionTablette.id == session_id))
    session = result.scalar_one_or_none()
    assert session is not None
    assert session.actif is False
    assert session.date_fin is not None
