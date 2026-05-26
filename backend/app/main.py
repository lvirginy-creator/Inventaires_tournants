from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.v1 import (
    articles,
    auth,
    campagne_active,
    campagnes,
    catalogue,
    comptages,
    magasins,
    societes,
    tablettes,
    utilisateurs,
)
from app.core.config import get_settings
from app.core.exceptions import add_exception_handlers
from app.core.limiter import limiter

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Démarrage — environnement: {settings.ENVIRONMENT}")
    yield
    logger.info("Arrêt de l'application")


app = FastAPI(
    title="Inventaire Tournant G2C — API",
    version="0.1.0",
    description="API de gestion des inventaires tournants hebdomadaires",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exception handlers globaux (après le middleware de rate limiting)
add_exception_handlers(app)

# Routers
app.include_router(auth.router, prefix="/api/v1")
app.include_router(societes.router, prefix="/api/v1")
app.include_router(magasins.router, prefix="/api/v1")
app.include_router(tablettes.router, prefix="/api/v1")
app.include_router(utilisateurs.router, prefix="/api/v1")
app.include_router(articles.router, prefix="/api/v1")
app.include_router(catalogue.router, prefix="/api/v1")
app.include_router(campagnes.router, prefix="/api/v1")
app.include_router(campagne_active.router, prefix="/api/v1")
app.include_router(comptages.router, prefix="/api/v1")


@app.get("/health", tags=["monitoring"])
async def health() -> dict:
    return {"status": "ok", "environment": settings.ENVIRONMENT}
