from datetime import date
from pydantic import BaseModel, Field, field_validator


class VehicleCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    vehicle_type: str = Field(description="Ex.: truck, carreta, LS, rodotrem")
    axles: int = Field(ge=2, le=12)
    consumption_km_l: float = Field(gt=0, le=20)


class Vehicle(VehicleCreate):
    id: int


class TollRateInput(BaseModel):
    amount_brl: float = Field(ge=0)
    vehicle_category: str = Field(min_length=1, max_length=80)
    valid_from: date
    valid_until: date | None = None
    source_name: str = Field(min_length=2, max_length=200)
    source_url: str | None = None


class TollCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    highway: str = Field(min_length=1, max_length=30)
    state: str = Field(min_length=2, max_length=2)
    latitude: float = Field(ge=-34, le=6)
    longitude: float = Field(ge=-74, le=-34)
    rates: list[TollRateInput] = Field(default_factory=list)


class RouteCalculateRequest(BaseModel):
    origin: str = Field(min_length=2, max_length=200)
    destination: str = Field(min_length=2, max_length=200)
    distance_km: float = Field(gt=0, le=10000, description="Distância informada ou obtida por roteador validado")
    consumption_km_l: float = Field(gt=0, le=20)
    fuel_price_brl: float = Field(gt=0, le=20)
    toll_total_brl: float = Field(default=0, ge=0)
    vehicle_name: str = Field(default="Veículo personalizado", max_length=100)

    @field_validator("origin", "destination")
    @classmethod
    def strip_locations(cls, value: str) -> str:
        return value.strip()


class RouteCalculateResponse(BaseModel):
    origin: str
    destination: str
    distance_km: float
    vehicle_name: str
    consumption_km_l: float
    fuel_price_brl: float
    fuel_liters: float
    fuel_cost_brl: float
    toll_total_brl: float
    estimated_total_brl: float
    note: str
