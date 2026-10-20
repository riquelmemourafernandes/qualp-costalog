import os
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://qualp:change-me-local@localhost:5432/qualp_costalog",
)

engine: Engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_timeout=3)


def ensure_app_tables() -> None:
    """Create application-owned tables; existing PostGIS toll tables remain managed by init.sql."""
    statements = [
        """
        CREATE TABLE IF NOT EXISTS vehicle_profiles (
            id BIGSERIAL PRIMARY KEY,
            name VARCHAR(80) NOT NULL UNIQUE,
            vehicle_type VARCHAR(40) NOT NULL,
            axles INTEGER NOT NULL CHECK (axles BETWEEN 2 AND 12),
            consumption_km_l NUMERIC(8,3) NOT NULL CHECK (consumption_km_l > 0),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
    ]
    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))
