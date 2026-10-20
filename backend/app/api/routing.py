import os
import tempfile
from pathlib import Path
from datetime import date
import httpx
from fastapi import APIRouter, Header, HTTPException, File, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from app.db import engine
from app.schemas import TollCreate
from app.importers.import_tolls_csv import import_csv

router = APIRouter()
ORS_BASE = "https://api.openrouteservice.org"


class RoutePlanRequest(BaseModel):
    origin: str = Field(min_length=2, max_length=200)
    destination: str = Field(min_length=2, max_length=200)
    vehicle_name: str = Field(default="Veículo personalizado", max_length=100)


@router.post("/routes/plan", tags=["routes"])
def plan_route(request: RoutePlanRequest):
    """Plan a heavy-goods-vehicle route through ORS. Requires a server-side API key."""
    api_key = os.getenv("OPENROUTESERVICE_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Roteamento de caminhões não configurado. Cadastre OPENROUTESERVICE_API_KEY nas variáveis de ambiente da API.",
        )
    try:
        with httpx.Client(timeout=25.0) as client:
            points = []
            for address in (request.origin, request.destination):
                response = client.get(
                    f"{ORS_BASE}/geocode/search",
                    params={"text": address, "boundary.country": "BR", "size": 1, "api_key": api_key},
                )
                response.raise_for_status()
                features = response.json().get("features", [])
                if not features:
                    raise HTTPException(status_code=422, detail=f"Não foi possível localizar o endereço: {address}")
                points.append(features[0]["geometry"]["coordinates"])
            response = client.post(
                f"{ORS_BASE}/v2/directions/driving-hgv/geojson",
                headers={"Authorization": api_key, "Content-Type": "application/json"},
                json={"coordinates": points, "instructions": True, "geometry": True},
            )
            response.raise_for_status()
            data = response.json()
    except HTTPException:
        raise
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        if status in (401, 403):
            raise HTTPException(status_code=502, detail="A chave do provedor de rotas foi recusada. Confira OPENROUTESERVICE_API_KEY.") from exc
        raise HTTPException(status_code=502, detail="O provedor de rotas não conseguiu calcular esse trajeto para veículo pesado.") from exc
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Falha ao consultar o provedor de rotas. Tente novamente mais tarde.") from exc

    features = data.get("features", [])
    if not features:
        raise HTTPException(status_code=502, detail="O provedor não retornou uma rota para esse trajeto.")
    feature = features[0]
    properties = feature.get("properties", {})
    summary = properties.get("summary", {})
    geometry = feature.get("geometry", {})
    if geometry.get("type") != "LineString" or not geometry.get("coordinates"):
        raise HTTPException(status_code=502, detail="A rota retornada não contém geometria válida.")
    tolls = []
    try:
        geojson_line = __import__("json").dumps(geometry)
        with engine.connect() as connection:
            rows = connection.execute(text("""
                SELECT p.id, p.name, p.highway, p.state, ST_AsGeoJSON(p.location::geometry) AS point_geojson, r.vehicle_category,
                       r.amount_brl, r.valid_from, r.valid_until, r.source_name, r.source_url
                FROM toll_plazas p
                JOIN toll_rates r ON r.toll_plaza_id = p.id
                WHERE ST_DWithin(
                    p.location,
                    ST_SetSRID(ST_GeomFromGeoJSON(:line), 4326)::geography,
                    1500
                )
                AND r.valid_from <= CURRENT_DATE
                AND (r.valid_until IS NULL OR r.valid_until >= CURRENT_DATE)
                ORDER BY ST_Distance(
                    p.location,
                    ST_SetSRID(ST_GeomFromGeoJSON(:line), 4326)::geography
                ), p.name
            """), {"line": geojson_line}).mappings().all()
        tolls = []
        for row in rows:
            item = dict(row)
            point = __import__("json").loads(item.pop("point_geojson"))
            item["longitude"], item["latitude"] = point["coordinates"]
            tolls.append(item)
    except SQLAlchemyError:
        # Routing remains useful when PostGIS/toll tables have not been provisioned yet.
        tolls = []
    return {
        "origin": request.origin,
        "destination": request.destination,
        "vehicle_name": request.vehicle_name,
        "distance_km": round(float(summary.get("distance", 0)) / 1000, 2),
        "duration_minutes": round(float(summary.get("duration", 0)) / 60),
        "geometry": geometry,
        "tolls": tolls,
        "toll_count": len(tolls),
        "routing_provider": "openrouteservice-driving-hgv",
        "note": "Rota calculada no perfil de veículo pesado. Pedágios exibidos apenas quando existem tarifas cadastradas e vigentes na base local; confira restrições, obras e tarifas antes da viagem.",
    }


@router.get("/tolls", tags=["tolls"])
def list_tolls(limit: int = 200):
    if limit < 1 or limit > 1000:
        raise HTTPException(status_code=422, detail="O limite deve ficar entre 1 e 1000.")
    try:
        with engine.connect() as connection:
            rows = connection.execute(text("""
                SELECT p.id, p.name, p.highway, p.state,
                       ST_Y(p.location::geometry) AS latitude,
                       ST_X(p.location::geometry) AS longitude,
                       p.source_name AS plaza_source, p.source_url AS plaza_source_url,
                       COALESCE(json_agg(json_build_object(
                           'id', r.id, 'vehicle_category', r.vehicle_category,
                           'amount_brl', r.amount_brl, 'valid_from', r.valid_from,
                           'valid_until', r.valid_until, 'source_name', r.source_name,
                           'source_url', r.source_url
                       )) FILTER (WHERE r.id IS NOT NULL), '[]'::json) AS rates
                FROM toll_plazas p LEFT JOIN toll_rates r ON r.toll_plaza_id = p.id
                GROUP BY p.id ORDER BY p.state, p.highway, p.name LIMIT :limit
            """), {"limit": limit}).mappings().all()
        return {"items": [dict(row) for row in rows], "count": len(rows)}
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="Banco/PostGIS indisponível ou tabelas de pedágio não inicializadas.") from exc


@router.post("/tolls", tags=["tolls"], status_code=201)
def create_toll(toll: TollCreate, x_admin_token: str | None = Header(default=None)):
    expected = os.getenv("ADMIN_API_TOKEN", "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="Cadastro administrativo desabilitado. Configure ADMIN_API_TOKEN na API.")
    if not x_admin_token or x_admin_token != expected:
        raise HTTPException(status_code=401, detail="Token administrativo inválido.")
    try:
        with engine.begin() as connection:
            plaza = connection.execute(text("""
                INSERT INTO toll_plazas (name, highway, state, location, source_name, source_url)
                VALUES (:name, :highway, :state,
                        ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography,
                        :source_name, :source_url)
                RETURNING id
            """), {
                "name": toll.name, "highway": toll.highway, "state": toll.state.upper(),
                "longitude": toll.longitude, "latitude": toll.latitude,
                "source_name": toll.rates[0].source_name if toll.rates else "Fonte não informada",
                "source_url": toll.rates[0].source_url if toll.rates else None,
            }).scalar_one()
            for rate in toll.rates:
                connection.execute(text("""
                    INSERT INTO toll_rates
                        (toll_plaza_id, vehicle_category, amount_brl, valid_from, valid_until, source_name, source_url)
                    VALUES (:plaza_id, :vehicle_category, :amount_brl, :valid_from, :valid_until, :source_name, :source_url)
                """), {**rate.model_dump(), "plaza_id": plaza})
        return {"id": plaza, "name": toll.name, "rates_created": len(toll.rates)}
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="Não foi possível salvar a praça e suas tarifas. Confira o banco/PostGIS.") from exc



@router.post("/tolls/import-csv", tags=["tolls"])
def import_tolls_csv(file: UploadFile = File(...), x_admin_token: str | None = Header(default=None)):
    """Import toll plazas and effective tariffs from an audited CSV file."""
    expected = os.getenv("ADMIN_API_TOKEN", "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="Importação administrativa desabilitada. Configure ADMIN_API_TOKEN na API.")
    if not x_admin_token or x_admin_token != expected:
        raise HTTPException(status_code=401, detail="Token administrativo inválido.")
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=422, detail="Envie um arquivo CSV.")
    content = file.file.read()
    if not content or len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=422, detail="O CSV está vazio ou excede o limite de 10 MB.")
    try:
        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as temp:
            temp.write(content)
            temp_path = Path(temp.name)
        try:
            from app.importers.import_tolls_csv import import_csv
            created, skipped = import_csv(temp_path)
        finally:
            temp_path.unlink(missing_ok=True)
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=422, detail=f"CSV inválido: {exc}") from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="Não foi possível importar. Confira o banco PostgreSQL/PostGIS e as tabelas de pedágio.") from exc
    finally:
        file.file.close()
    return {"success": True, "inserted_rates": created, "duplicate_rates_skipped": skipped,
            "message": f"Importação concluída: {created} tarifas inseridas; {skipped} duplicadas ignoradas."}
