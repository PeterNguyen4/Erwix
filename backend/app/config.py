from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, loaded from environment / .env."""

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    alpaca_api_key: str = ""
    alpaca_secret_key: str = ""
    alpaca_paper: bool = True

    database_url: str = "postgresql+psycopg://entro:entro@localhost:5432/entro"

    # CORS origins for the Next.js dev server
    cors_origins: list[str] = ["http://localhost:3000"]

    @property
    def has_alpaca_creds(self) -> bool:
        return bool(self.alpaca_api_key and self.alpaca_secret_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
