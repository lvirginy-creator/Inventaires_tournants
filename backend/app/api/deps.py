import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token
from app.models.tablette import RoleTablette, SessionTablette
from app.models.utilisateur import RoleAdmin, Utilisateur

bearer_scheme = HTTPBearer()


async def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> Utilisateur:
    """Vérifie le JWT admin et retourne l'utilisateur actif.

    Raises:
        HTTPException 401: token invalide, expiré, ou utilisateur inactif.
    """
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access_admin":
            raise ValueError("type incorrect")
        user_id = uuid.UUID(payload["sub"])
    except (JWTError, ValueError, KeyError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide"
        ) from None

    result = await db.execute(
        select(Utilisateur).where(Utilisateur.id == user_id, Utilisateur.actif == True)  # noqa: E712
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Utilisateur introuvable"
        )
    return user


def require_admin_role(user: Utilisateur = Depends(get_current_admin)) -> Utilisateur:
    """Restreint l'accès au rôle admin (pas superviseur).

    Raises:
        HTTPException 403: rôle insuffisant.
    """
    if user.role != RoleAdmin.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux administrateurs",
        )
    return user


async def get_current_session(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> SessionTablette:
    """Vérifie le JWT tablette et retourne la session active.

    Raises:
        HTTPException 401: token invalide, expiré, ou session clôturée.
    """
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access_tablette":
            raise ValueError("type incorrect")
        session_id = uuid.UUID(payload["sub"])
    except (JWTError, ValueError, KeyError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide"
        ) from None

    result = await db.execute(
        select(SessionTablette).where(
            SessionTablette.id == session_id,
            SessionTablette.actif == True,  # noqa: E712
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expirée ou déconnectée",
        )
    return session


def require_responsable_depot(
    session: SessionTablette = Depends(get_current_session),
) -> SessionTablette:
    """Restreint l'accès au rôle responsable_depot.

    Raises:
        HTTPException 403: rôle insuffisant (opérateur ne peut pas valider).
    """
    if session.role != RoleTablette.responsable_depot:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Action réservée au responsable dépôt",
        )
    return session
