from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

INSECURE_SECRET_KEYS = {
    "",
    "dev-insecure-change-me-in-production-keysprint-secret",
    "replace-with-a-secure-random-secret-in-production",
    "change-me-in-production",
    "change-me-to-a-64-char-random-secret-key",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_NAME: str = "KeySprint API"
    ENVIRONMENT: str = "development"
    SECRET_KEY: str = "dev-insecure-change-me-in-production-keysprint-secret"
    DATABASE_URL: str = "sqlite:///./keysprint.db"
    REDIS_URL: str | None = None
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"
    COOKIE_SECURE: bool = False
    SESSION_MAX_AGE_SECONDS: int = 60 * 60 * 24 * 14  # 14 days
    RATE_LIMIT_REQUESTS: int = 120
    RATE_LIMIT_WINDOW_SECONDS: int = 60

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        if self.ENVIRONMENT.strip().lower() == "production":
            if self.SECRET_KEY.strip() in INSECURE_SECRET_KEYS or len(self.SECRET_KEY.strip()) < 32:
                raise ValueError(
                    "SECRET_KEY must be set to a strong random value (at least 32 characters) in production."
                )
            if not self.COOKIE_SECURE:
                raise ValueError(
                    "COOKIE_SECURE must be True when ENVIRONMENT=production."
                )
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
