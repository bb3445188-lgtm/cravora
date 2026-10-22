import os
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "CRAVORA — Pizza & More API"
    APP_ENV: str = "development"
    APP_VERSION: str = "1.0.0"

    # Database: Defaults to local SQLite file if PostgreSQL server is not running locally,
    # or uses DATABASE_URL (e.g. postgresql+psycopg://cravora:cravora_secret@localhost:5432/cravora)
    DATABASE_URL: str = "sqlite:///./cravora.db"

    # Security & JWT
    JWT_SECRET_KEY: str = "cravora-super-secret-jwt-signing-key-change-in-production-2026"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # CORS
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000"

    # Tax & Loyalty Policies
    TAX_RATE_PERCENT: int = 16  # Standard GST %
    LOYALTY_POINTS_PER_100_PKR: int = 5  # Earn 5 pts per Rs. 100 spent
    LOYALTY_PKR_PER_POINT: int = 1  # 1 point = Rs. 1 discount when redeemed

    # AI Provider Settings (Server-side only)
    LLM_PROVIDER: str = "openai"  # 'openai' or 'gemini'
    LLM_MODEL: str = "gpt-4o-mini"
    OPENAI_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    AI_TIMEOUT_SECONDS: float = 20.0
    AI_MAX_RETRIES: int = 2

    # Maps Provider Settings
    MAPS_PROVIDER: str = "osm_nominatim"  # 'google', 'mapbox', or 'osm_nominatim'
    GOOGLE_MAPS_SERVER_API_KEY: str = ""
    MAPBOX_ACCESS_TOKEN: str = ""

    # Payment Gateway Settings
    SAFEPAY_MERCHANT_KEY: str = ""
    SAFEPAY_WEBHOOK_SECRET: str = "cravora-webhook-hmac-secret-dev"
    JAZZCASH_MERCHANT_ID: str = ""
    EASYPAISA_STORE_ID: str = ""

    # Notification Provider Settings
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMS_API_KEY: str = ""
    WHATSAPP_BUSINESS_TOKEN: str = ""

    # Support & Escalation Contact Info
    SUPPORT_PHONE: str = "+92 (51) 111-272-867"
    SUPPORT_EMAIL: str = "care@cravora.pk"
    SUPPORT_WHATSAPP: str = "+92 300 1112728"

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def normalized_database_url(self) -> str:
        url = self.DATABASE_URL
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+psycopg://", 1)
        return url

    @property
    def ai_live_key_configured(self) -> bool:
        if self.LLM_PROVIDER.lower() == "gemini":
            return bool(self.GEMINI_API_KEY.strip())
        return bool(self.OPENAI_API_KEY.strip())


settings = Settings()
