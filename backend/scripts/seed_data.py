"""Seed data de développement.

Usage :
    cd backend
    DATABASE_URL=postgresql+asyncpg://... python -m scripts.seed_data
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.core.security import hash_password
from app.models import Base, Magasin, Societe, Utilisateur
from app.models.utilisateur import RoleAdmin

settings = get_settings()

SEED_ADMIN_EMAIL = "admin@g2c.fr"
SEED_ADMIN_PASSWORD = "Admin1234!"
SEED_OPERATEUR_PASSWORD = "operateur123"
SEED_RESPONSABLE_PASSWORD = "responsable123"


async def seed() -> None:
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as db:
        # Société
        societe = Societe(
            code="G2C-GP",
            nom="Groupe G2C Guadeloupe",
        )
        db.add(societe)
        await db.flush()

        # Magasins
        magasin_1 = Magasin(
            societe_id=societe.id,
            code="M-ABYMES-01",
            nom="G2C Les Abymes",
            email_responsable="responsable.abymes@g2c.fr",
            password_operateur_hash=hash_password(SEED_OPERATEUR_PASSWORD),
            password_responsable_hash=hash_password(SEED_RESPONSABLE_PASSWORD),
        )
        magasin_2 = Magasin(
            societe_id=societe.id,
            code="M-POINTE-01",
            nom="G2C Pointe-à-Pitre",
            email_responsable="responsable.pap@g2c.fr",
            password_operateur_hash=hash_password(SEED_OPERATEUR_PASSWORD),
            password_responsable_hash=hash_password(SEED_RESPONSABLE_PASSWORD),
        )
        db.add_all([magasin_1, magasin_2])

        # Utilisateur admin siège
        admin = Utilisateur(
            email=SEED_ADMIN_EMAIL,
            password_hash=hash_password(SEED_ADMIN_PASSWORD),
            nom="Administrateur G2C",
            role=RoleAdmin.admin,
        )
        db.add(admin)

        await db.commit()

    await engine.dispose()

    print("Seed terminé :")
    print("  Société : G2C-GP")
    print("  Magasins : M-ABYMES-01, M-POINTE-01")
    print(f"  Admin : {SEED_ADMIN_EMAIL} / {SEED_ADMIN_PASSWORD}")
    print(f"  Mot de passe opérateur : {SEED_OPERATEUR_PASSWORD}")
    print(f"  Mot de passe responsable : {SEED_RESPONSABLE_PASSWORD}")
    print("  (créer les tokens d'appairage via l'API admin)")


if __name__ == "__main__":
    asyncio.run(seed())
