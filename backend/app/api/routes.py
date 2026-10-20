from fastapi import APIRouter, HTTPException
from app.schemas import RouteCalculateRequest, RouteCalculateResponse, VehicleCreate
from app.db import engine, ensure_app_tables
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

router = APIRouter()


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
        if "unique" in str(exc).lower() or "duplicate" in str(exc).lower():
            raise HTTPException(status_code=409, detail="Já existe um veículo com esse nome.") from exc
        raise HTTPException(status_code=503, detail="Não foi possível salvar o veículo no banco.") from exc


@router.post("/routes/calculate", response_model=RouteCalculateResponse, tags=["routes"])
def calculate_route(request: RouteCalculateRequest):
    liters = request.distance_km / request.consumption_km_l
    fuel_cost = liters * request.fuel_price_brl
    total = fuel_cost + request.toll_total_brl
    return RouteCalculateResponse(
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


@router.get("/tolls", tags=["tolls"])
def list_tolls():
    return {"items": [], "count": 0, "note": "Nenhuma praça foi importada. Cadastre somente dados com fonte e vigência verificáveis."}


@router.get("/routes/history", tags=["routes"])
def route_history():
    return {"items": [], "count": 0, "note": "Histórico persistente será habilitado quando o banco e as tabelas de aplicação estiverem conectados."}
