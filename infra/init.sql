CREATE EXTENSION IF NOT EXISTS postgis;
CREATE TABLE IF NOT EXISTS toll_plazas (
 id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, highway TEXT NOT NULL, state CHAR(2) NOT NULL,
 location GEOGRAPHY(POINT,4326) NOT NULL, source_name TEXT, source_url TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS toll_plazas_location_gix ON toll_plazas USING GIST(location);
CREATE TABLE IF NOT EXISTS toll_rates (
 id BIGSERIAL PRIMARY KEY, toll_plaza_id BIGINT NOT NULL REFERENCES toll_plazas(id) ON DELETE CASCADE,
 vehicle_category TEXT NOT NULL, amount_brl NUMERIC(12,2) NOT NULL CHECK(amount_brl >= 0),
 valid_from DATE NOT NULL, valid_until DATE, source_name TEXT NOT NULL, source_url TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CHECK(valid_until IS NULL OR valid_until >= valid_from)
);
CREATE INDEX IF NOT EXISTS toll_rates_lookup_idx ON toll_rates(toll_plaza_id,vehicle_category,valid_from,valid_until);
CREATE TABLE IF NOT EXISTS route_searches (
 id BIGSERIAL PRIMARY KEY, origin TEXT NOT NULL, destination TEXT NOT NULL, distance_km NUMERIC(10,2),
 vehicle_name TEXT NOT NULL, consumption_km_l NUMERIC(8,3) NOT NULL, fuel_price_brl NUMERIC(8,3) NOT NULL,
 fuel_liters NUMERIC(10,2), fuel_cost_brl NUMERIC(12,2), toll_total_brl NUMERIC(12,2),
 estimated_total_brl NUMERIC(12,2), routing_provider TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS route_tolls (
 id BIGSERIAL PRIMARY KEY, route_search_id BIGINT NOT NULL REFERENCES route_searches(id) ON DELETE CASCADE,
 toll_plaza_id BIGINT REFERENCES toll_plazas(id) ON DELETE SET NULL, toll_name_snapshot TEXT NOT NULL,
 amount_brl_snapshot NUMERIC(12,2) NOT NULL, tariff_source_snapshot TEXT,
 tariff_valid_from_snapshot DATE, tariff_valid_until_snapshot DATE
);
