from fastapi import Request
from slowapi import Limiter


def _get_real_ip(request: Request) -> str:
    """Lit le vrai IP client depuis X-Forwarded-For (ajouté par NPM/proxy)."""
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


limiter = Limiter(key_func=_get_real_ip)
