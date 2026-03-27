from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class UISettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="GITPULSE_UI_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    api_base_url: str = Field(default="http://127.0.0.1:7467")
    host: str = Field(default="127.0.0.1")
    port: int = Field(default=8001)
    app_name: str = Field(default="GitPulse")


@lru_cache(maxsize=1)
def get_settings() -> UISettings:
    return UISettings()
