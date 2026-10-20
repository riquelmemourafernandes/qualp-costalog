import os
from dataclasses import dataclass


PRODUCTION_ORIGINS = ["https://qualp-costalog.vercel.app"]


@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv("DATABASE_URL", "postgresql+psycopg://qualp:change-me-local@localhost:5432/qualp_costalog")
    cors_origins: list[str] = None

    def __post_init__(self):
        configured_origins = [
            origin.strip()
            for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
            if origin.strip()
        ]
        # Always allow the deployed frontend, even if CORS_ORIGINS was set previously
        # to a local development URL only.
        origins = list(dict.fromkeys(configured_origins + PRODUCTION_ORIGINS))
        object.__setattr__(self, "cors_origins", origins)


settings = Settings()
