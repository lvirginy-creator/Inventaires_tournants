import hashlib
import uuid
from datetime import UTC, datetime, timedelta

from jose import jwt
from passlib.context import CryptContext

from app.core.config import get_settings

settings = get_settings()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_jwt(token: str) -> str:
    """SHA-256 du token JWT — stocké en DB pour invalidation lors du logout."""
    return hashlib.sha256(token.encode()).hexdigest()


def create_admin_access_token(user_id: uuid.UUID, role: str) -> str:
    """JWT d'accès admin siège (1h)."""
    expire = datetime.now(UTC) + timedelta(minutes=settings.JWT_ADMIN_ACCESS_MINUTES)
    payload = {
        "sub": str(user_id),
        "type": "access_admin",
        "role": role,
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_admin_refresh_token(user_id: uuid.UUID) -> str:
    """JWT de refresh admin (8h)."""
    expire = datetime.now(UTC) + timedelta(hours=settings.JWT_ADMIN_REFRESH_HOURS)
    payload = {
        "sub": str(user_id),
        "type": "refresh_admin",
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_tablette_token(
    session_id: uuid.UUID,
    tablette_id: uuid.UUID,
    magasin_id: uuid.UUID,
    role: str,
) -> str:
    """JWT de session tablette (12h).

    Contient tablette_id, magasin_id, session_id, role pour que chaque
    endpoint tablette puisse vérifier les accès sans aller en DB.
    """
    expire = datetime.now(UTC) + timedelta(hours=settings.JWT_TABLETTE_HOURS)
    payload = {
        "sub": str(session_id),
        "type": "access_tablette",
        "tablette_id": str(tablette_id),
        "magasin_id": str(magasin_id),
        "session_id": str(session_id),
        "role": role,
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """Décode et valide la signature + l'expiration du JWT.

    Raises:
        jose.JWTError: si le token est invalide ou expiré.
    """
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
