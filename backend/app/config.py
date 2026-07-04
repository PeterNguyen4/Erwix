from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE = Path(__file__).parent.parent / ".env"


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    model_config = SettingsConfigDict(
        env_file=_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore"
    )

    alpaca_api_key: str = ""
    alpaca_secret_key: str = ""
    alpaca_paper: bool = True

    database_url: str

    # CORS origins for the Next.js dev server
    cors_origins: list[str]

    # Clerk JWT verification
    clerk_jwks_url: str = ""

    @property
    def has_alpaca_creds(self) -> bool:
        return bool(self.alpaca_api_key and self.alpaca_secret_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
