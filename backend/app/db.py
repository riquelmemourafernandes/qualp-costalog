import os
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

raw_database_url = os.getenv("DATABASE_URL", "").strip()
if not raw_database_url:
    raw_database_url = "postgresql+psycopg://qualp:change-me-local@localhost:5432/qualp_costalog"
elif raw_database_url.startswith("postgres://"):
    # Render and some PostgreSQL hosts still provide the legacy postgres:// scheme.
    raw_database_url = raw_database_url.replace("postgres://", "postgresql+psycopg://", 1)
elif raw_database_url.startswith("postgresql://"):
    # Use the psycopg v3 driver explicitly; psycopg2 is not installed in this project.
    raw_database_url = raw_database_url.replace("postgresql://", "postgresql+psycopg://", 1)

DATABASE_URL = raw_database_url
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
        """
        CREATE TABLE IF NOT EXISTS route_searches (
            id BIGSERIAL PRIMARY KEY,
            origin TEXT NOT NULL,
            destination TEXT NOT NULL,
            distance_km NUMERIC(10,2),
            vehicle_name TEXT NOT NULL,
            consumption_km_l NUMERIC(8,3) NOT NULL,
            fuel_price_brl NUMERIC(8,3) NOT NULL,
            fuel_liters NUMERIC(10,2),
            fuel_cost_brl NUMERIC(12,2),
            toll_total_brl NUMERIC(12,2),
            estimated_total_brl NUMERIC(12,2),
            routing_provider TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
    ]
    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))
