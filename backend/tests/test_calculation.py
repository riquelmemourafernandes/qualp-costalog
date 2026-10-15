from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_calculate_fuel_and_tolls():
    response = client.post("/api/v1/routes/calculate", json={
        "origin": "Santos, SP",
        "destination": "Campinas, SP",
        "distance_km": 300,
        "consumption_km_l": 2.5,
        "fuel_price_brl": 6.2,
        "toll_total_brl": 100,
        "vehicle_name": "Carreta teste"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["fuel_liters"] == 120
    assert data["fuel_cost_brl"] == 744
    assert data["estimated_total_brl"] == 844


def test_reject_invalid_consumption():
    response = client.post("/api/v1/routes/calculate", json={
        "origin": "Santos, SP",
        "destination": "Campinas, SP",
        "distance_km": 300,
        "consumption_km_l": 0,
        "fuel_price_brl": 6.2
    })
    assert response.status_code == 422
