from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Base de données
    DATABASE_URL: str = "postgresql+asyncpg://inv_user:inv_pass@localhost:5432/inventaire"

    # JWT
    JWT_SECRET: str = "change_me_in_production_minimum_32_chars"
    JWT_ALGORITHM: str = "HS256"
    JWT_ADMIN_ACCESS_MINUTES: int = 60
    JWT_ADMIN_REFRESH_HOURS: int = 8
    JWT_TABLETTE_HOURS: int = 12
    TOKEN_APPAIRAGE_HOURS: int = 24

    # CORS — reçu soit en JSON, soit en liste Python
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:5174"]

    # Application
    LOG_LEVEL: str = "INFO"
    ENVIRONMENT: str = "production"

    # SMTP
    # Port 587 (STARTTLS) : SMTP_USE_TLS=false, SMTP_STARTTLS=true  (défaut)
    # Port 465 (SSL)      : SMTP_USE_TLS=true,  SMTP_STARTTLS=false
    # Port 25/1025 (plain): SMTP_USE_TLS=false, SMTP_STARTTLS=false
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_USE_TLS: bool = False
    SMTP_STARTTLS: bool = True
    MAIL_FROM_ADDRESS: str = ""
    MAIL_FROM_NAME: str = "Inventaire G2C"
    MAIL_REPLY_TO: str = ""

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT == "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()
