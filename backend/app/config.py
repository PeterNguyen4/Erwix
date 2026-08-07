from functools import lru_cache
from pathlib import Path

from pydantic import field_validator, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE = Path(__file__).parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore"
    )

    secret_key: SecretStr
    algorithm: str = ""
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    cookie_secure: bool = False

    database_url: str

    cors_origins: list[str]

    alpaca_api_key: str = ""
    alpaca_secret_key: str = ""
    alpaca_paper: bool = True

    # Alpaca Connection per user
    alpaca_oauth_client_id: str = ""
    alpaca_oauth_client_secret: str = ""
    alpaca_oauth_redirect_uri: str = ""
    frontend_base_url: str = ""

    token_encryption_key: SecretStr = SecretStr("")

    resend_api_key: str = ""
    resend_from_email: str = "Entro <onboarding@resend.dev>"
    password_reset_token_expire_minutes: int = 30

    # Embeddings for RAG
    voyage_api_key: str = ""

    # Analyst Agent
    llm_provider: str = "ollama"  # "anthropic" | "ollama" | "openrouter"
    anthropic_api_key: str = ""
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.1"
    openrouter_api_key: str = ""
    openrouter_model: str = "anthropic/claude-sonnet-4.5"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"

    # Background weekly debrief job
    debrief_poll_interval_minutes: int = 15
    debrief_step_estimate_seconds: int = 20

    redis_url: str = "redis://localhost:6379/0"
    rate_limit_fail_open: bool = False

    @property
    def has_alpaca_creds(self) -> bool:
        return bool(self.alpaca_api_key and self.alpaca_secret_key)

    @property
    def has_alpaca_oauth_creds(self) -> bool:
        return bool(
            self.alpaca_oauth_client_id
            and self.alpaca_oauth_client_secret
            and self.alpaca_oauth_redirect_uri
            and self.token_encryption_key.get_secret_value()
        )

    @property
    def has_voyage_creds(self) -> bool:
        return bool(self.voyage_api_key)

    @property
    def has_anthropic_creds(self) -> bool:
        return bool(self.anthropic_api_key)

    @property
    def has_openrouter_creds(self) -> bool:
        return bool(self.openrouter_api_key)

    @property
    def has_resend_creds(self) -> bool:
        return bool(self.resend_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
