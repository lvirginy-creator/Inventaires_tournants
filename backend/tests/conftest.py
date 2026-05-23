"""Fixtures partagées pour les tests.

Prérequis : une instance PostgreSQL accessible via TEST_DATABASE_URL.
Lancement rapide avec Docker :
    docker run -d -e POSTGRES_PASSWORD=test -e POSTGRES_DB=inventaire_test \
        -p 5433:5432 postgres:16-alpine
"""

import os
import uuid
from datetime import UTC, datetime, timedelta

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.core.security import create_admin_access_token, hash_password
from app.main import app
from app.models import Magasin, Societe, Utilisateur
from app.models.tablette import TokenAppairage
from app.models.utilisateur import RoleAdmin

TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://inv_user:inv_pass@localhost:5433/inventaire_test",
)

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionLocal = async_sessionmaker(test_engine, expire_on_commit=False)


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_db():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await test_engine.dispose()


@pytest_asyncio.fixture
async def db() -> AsyncSession:
    async with TestSessionLocal() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db: AsyncSession) -> AsyncClient:
    app.dependency_overrides[get_db] = lambda: db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


# ── Helpers de création ────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def societe(db: AsyncSession) -> Societe:
    s = Societe(code=f"TST-{uuid.uuid4().hex[:4]}", nom="Société Test")
    db.add(s)
    await db.flush()
    return s


@pytest_asyncio.fixture
async def magasin(societe: Societe, db: AsyncSession) -> Magasin:
    m = Magasin(
        societe_id=societe.id,
        code=f"M-TST-{uuid.uuid4().hex[:4]}",
        nom="Magasin Test",
        email_responsable="test@g2c.fr",
        password_operateur_hash=hash_password("operateur123"),
        password_responsable_hash=hash_password("responsable123"),
    )
    db.add(m)
    await db.flush()
    return m


@pytest_asyncio.fixture
async def admin_user(db: AsyncSession) -> Utilisateur:
    u = Utilisateur(
        email=f"admin_{uuid.uuid4().hex[:6]}@test.fr",
        password_hash=hash_password("Admin1234!"),
        nom="Admin Test",
        role=RoleAdmin.admin,
    )
    db.add(u)
    await db.flush()
    return u


@pytest_asyncio.fixture
async def auth_headers(admin_user: Utilisateur) -> dict[str, str]:
    token = create_admin_access_token(admin_user.id, admin_user.role.value)
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def token_appairage(magasin: Magasin, db: AsyncSession) -> TokenAppairage:
    t = TokenAppairage(
        magasin_id=magasin.id,
        token=f"tok_{uuid.uuid4().hex}",
        expires_at=datetime.now(UTC) + timedelta(hours=24),
    )
    db.add(t)
    await db.flush()
    return t
