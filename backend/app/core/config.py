import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv("DATABASE_URL", "postgresql+psycopg://qualp:change-me-local@localhost:5432/qualp_costalog")
    cors_origins: list[str] = None

    def __post_init__(self):
        object.__setattr__(
            self,
            "cors_origins",
            [origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if origin.strip()],
        )


settings = Settings()
