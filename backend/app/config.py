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

    database_url: str

    cors_origins: list[str]

    clerk_jwks_url: str = ""

    alpaca_api_key: str = ""
    alpaca_secret_key: str = ""
    alpaca_paper: bool = True

    # Embeddings for RAG
    voyage_api_key: str = ""

    # Analyst Agent
    llm_provider: str = "ollama"  # "anthropic" | "ollama"
    anthropic_api_key: str = ""
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.1"

    # Background weekly debrief job
    debrief_poll_interval_minutes: int = 15
    debrief_step_estimate_seconds: int = 20

    @property
    def has_alpaca_creds(self) -> bool:
        return bool(self.alpaca_api_key and self.alpaca_secret_key)

    @property
    def has_voyage_creds(self) -> bool:
        return bool(self.voyage_api_key)

    @property
    def has_anthropic_creds(self) -> bool:
        return bool(self.anthropic_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
