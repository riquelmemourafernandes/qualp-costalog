from fastapi import APIRouter, HTTPException, Query
import json
import unicodedata
from urllib.request import Request, urlopen
from app.schemas import RouteCalculateRequest, RouteCalculateResponse, VehicleCreate
from app.db import engine, ensure_app_tables
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError, OperationalError


router = APIRouter()


def _normalize_city(value: str) -> str:
    return "".join(ch for ch in unicodedata.normalize("NFKD", value.casefold()) if not unicodedata.combining(ch))


def _ensure_cities_loaded() -> None:
    """Populate the local municipality catalog once from the official IBGE API."""
    with engine.connect() as connection:
        exists = connection.execute(text("SELECT to_regclass('public.brazil_cities')")).scalar()
        if exists:
            count = connection.execute(text("SELECT COUNT(*) FROM brazil_cities")).scalar_one()
            if count:
                return
    request = Request(
        "https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome",
        headers={"User-Agent": "QualP-Costalog/1.0"},
    )
    try:
        with urlopen(request, timeout=25) as response:
            municipalities = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Não foi possível carregar a lista oficial de municípios do IBGE. Tente novamente em instantes.") from exc
    rows = []
    for city in municipalities:
        micro = city.get("microrregiao") or {}
        meso = micro.get("mesorregiao") or {}
        uf = meso.get("UF") or {}
        if not uf:
            immediate = city.get("regiao-imediata") or {}
            intermediate = immediate.get("regiao-intermediaria") or {}
            uf = intermediate.get("UF") or {}
        name = city.get("nome", "").strip()
        state = uf.get("sigla", "").strip()
        if name and state:
            rows.append({"ibge_id": int(city["id"]), "name": name, "state": state, "normalized": _normalize_city(name)})
    try:
        with engine.begin() as connection:
            connection.execute(text("""
                CREATE TABLE IF NOT EXISTS brazil_cities (
                    ibge_id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    state CHAR(2) NOT NULL,
                    name_normalized TEXT NOT NULL
                )
            """))
            connection.execute(text("""
                INSERT INTO brazil_cities (ibge_id, name, state, name_normalized)
                VALUES (:ibge_id, :name, :state, :normalized)
                ON CONFLICT (ibge_id) DO UPDATE SET
                    name = EXCLUDED.name, state = EXCLUDED.state,
                    name_normalized = EXCLUDED.name_normalized
            """), rows)
            connection.execute(text("CREATE INDEX IF NOT EXISTS brazil_cities_normalized_idx ON brazil_cities (name_normalized)"))
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="A lista de municípios foi obtida, mas não pôde ser gravada no banco. Confira DATABASE_URL e as permissões do PostgreSQL.") from exc



@router.get("/cities", tags=["localidades"])
def search_cities(query: str = Query(default="", min_length=0, max_length=100), limit: int = Query(default=12, ge=1, le=30)):
    """Search Brazilian municipalities, importing the official IBGE list on first use."""
    try:
        _ensure_cities_loaded()
        raw_term = query.strip()
        # If a user edits a previously selected "Município - UF" label, search by municipality name.
        term = _normalize_city(raw_term.split(" - ", 1)[0].strip())
        if len(term) < 2:
            return {"items": [], "count": 0, "source": "IBGE"}
        with engine.connect() as connection:
            rows = connection.execute(text("""
                SELECT ibge_id, name, state, name || ' - ' || state AS label
                FROM brazil_cities
                WHERE name_normalized LIKE :pattern
                ORDER BY CASE WHEN name_normalized LIKE :prefix THEN 0 ELSE 1 END, name, state
                LIMIT :limit
            """), {"pattern": f"%{term}%", "prefix": f"{term}%", "limit": limit}).mappings().all()
        return {"items": [dict(row) for row in rows], "count": len(rows), "source": "IBGE"}
    except HTTPException:
        raise
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="Banco indisponível ao consultar os municípios.") from exc


@router.get("/vehicles", tags=["vehicles"])
def list_vehicles():
    try:
        ensure_app_tables()
        defaults = [
            {"name": "Caminhão 2 eixos", "vehicle_type": "truck", "axles": 2, "consumption_km_l": 3.0},
            {"name": "Carreta 6 eixos", "vehicle_type": "carreta", "axles": 6, "consumption_km_l": 2.2},
            {"name": "LS", "vehicle_type": "LS", "axles": 6, "consumption_km_l": 2.0},
            {"name": "Rodotrem", "vehicle_type": "rodotrem", "axles": 9, "consumption_km_l": 1.6},
        ]
        with engine.begin() as connection:
            for item in defaults:
                connection.execute(text("""
                    INSERT INTO vehicle_profiles (name, vehicle_type, axles, consumption_km_l)
                    VALUES (:name, :vehicle_type, :axles, :consumption_km_l)
                    ON CONFLICT (name) DO NOTHING
                """), item)
            rows = connection.execute(text("SELECT id, name, vehicle_type, axles, consumption_km_l FROM vehicle_profiles ORDER BY name")).mappings().all()
        if rows:
            return [dict(row) for row in rows]
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="Banco indisponível. Confira DATABASE_URL.") from exc
    return [
        {"id": 1, "name": "Caminhão 2 eixos", "vehicle_type": "truck", "axles": 2, "consumption_km_l": 3.0},
        {"id": 2, "name": "Carreta 6 eixos", "vehicle_type": "carreta", "axles": 6, "consumption_km_l": 2.2},
        {"id": 3, "name": "LS", "vehicle_type": "LS", "axles": 6, "consumption_km_l": 2.0},
        {"id": 4, "name": "Rodotrem", "vehicle_type": "rodotrem", "axles": 9, "consumption_km_l": 1.6},
    ]


@router.post("/vehicles", tags=["vehicles"], status_code=201)
def create_vehicle(vehicle: VehicleCreate):
    try:
        ensure_app_tables()
        with engine.begin() as connection:
            row = connection.execute(text("""
                INSERT INTO vehicle_profiles (name, vehicle_type, axles, consumption_km_l)
                VALUES (:name, :vehicle_type, :axles, :consumption_km_l)
                RETURNING id, name, vehicle_type, axles, consumption_km_l
            """), vehicle.model_dump()).mappings().one()
        return dict(row)
    except SQLAlchemyError as exc:
        message = str(exc).lower()
        if "unique" in message or "duplicate" in message:
            raise HTTPException(status_code=409, detail="Já existe um veículo com esse nome.") from exc
        if isinstance(exc, OperationalError):
            raise HTTPException(
                status_code=503,
                detail="O banco de dados não está acessível. No Render, confira se DATABASE_URL está configurada com a URL interna do PostgreSQL e se o serviço do banco está ativo.",
            ) from exc
        raise HTTPException(
            status_code=503,
            detail="O banco recusou o cadastro. Confira as tabelas/permissões do PostgreSQL no Render e os logs do serviço da API.",
        ) from exc


@router.post("/routes/calculate", response_model=RouteCalculateResponse, tags=["routes"])
def calculate_route(request: RouteCalculateRequest):
    liters = request.distance_km / request.consumption_km_l
    fuel_cost = liters * request.fuel_price_brl
    total = fuel_cost + request.toll_total_brl
    result = RouteCalculateResponse(
        origin=request.origin,
        destination=request.destination,
        distance_km=round(request.distance_km, 2),
        vehicle_name=request.vehicle_name,
        consumption_km_l=request.consumption_km_l,
        fuel_price_brl=request.fuel_price_brl,
        fuel_liters=round(liters, 2),
        fuel_cost_brl=round(fuel_cost, 2),
        toll_total_brl=round(request.toll_total_brl, 2),
        estimated_total_brl=round(total, 2),
        note="Estimativa de combustível. Distância e pedágios são informados manualmente; não representa rota calculada nem base nacional validada de tarifas.",
    )
    try:
        with engine.begin() as connection:
            connection.execute(text("""
                INSERT INTO route_searches
                    (origin, destination, distance_km, vehicle_name, consumption_km_l,
                     fuel_price_brl, fuel_liters, fuel_cost_brl, toll_total_brl,
                     estimated_total_brl, routing_provider)
                VALUES
                    (:origin, :destination, :distance_km, :vehicle_name, :consumption_km_l,
                     :fuel_price_brl, :fuel_liters, :fuel_cost_brl, :toll_total_brl,
                     :estimated_total_brl, 'manual')
            """), {
                **request.model_dump(), "fuel_liters": round(liters, 2),
                "fuel_cost_brl": round(fuel_cost, 2), "estimated_total_brl": round(total, 2),
            })
    except SQLAlchemyError:
        result.note += " O histórico não foi salvo porque o banco está indisponível."
    return result


@router.get("/tolls", tags=["tolls"])
def list_tolls():
    return {"items": [], "count": 0, "note": "Nenhuma praça foi importada. Cadastre somente dados com fonte e vigência verificáveis."}


@router.get("/routes/history", tags=["routes"])
def route_history(limit: int = 50):
    if limit < 1 or limit > 200:
        raise HTTPException(status_code=422, detail="O limite deve ficar entre 1 e 200.")
    try:
        with engine.connect() as connection:
            rows = connection.execute(text("""
                SELECT id, origin, destination, distance_km, vehicle_name,
                       consumption_km_l, fuel_price_brl, fuel_liters, fuel_cost_brl,
                       toll_total_brl, estimated_total_brl, routing_provider, created_at
                FROM route_searches ORDER BY created_at DESC LIMIT :limit
            """), {"limit": limit}).mappings().all()
        return {"items": [dict(row) for row in rows], "count": len(rows)}
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="Banco indisponível ou tabela de histórico não inicializada.") from exc
