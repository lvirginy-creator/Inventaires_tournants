from fastapi import Request
from jose import JWTError
from slowapi import Limiter


def _get_real_ip(request: Request) -> str:
    """Lit le vrai IP client depuis X-Forwarded-For (ajouté par NPM/proxy)."""
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _get_tablette_id(request: Request) -> str:
    """Extrait le tablette_id du JWT Bearer pour le rate-limiting par tablette.

    Retombe sur l'IP si le token est absent ou invalide.
    """
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            from app.core.security import decode_token  # import local pour éviter la circularité

            data = decode_token(auth.removeprefix("Bearer "))
            if tid := data.get("tablette_id"):
                return f"tid:{tid}"
        except (JWTError, Exception):
            pass
    return _get_real_ip(request)


limiter = Limiter(key_func=_get_real_ip)
