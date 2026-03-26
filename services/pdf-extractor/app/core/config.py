from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "dev"
    app_name: str = "pdf-extractor"
    db_url: str | None = None

    model_config = SettingsConfigDict(env_prefix="PDF_EXTRACTOR_")


settings = Settings()
