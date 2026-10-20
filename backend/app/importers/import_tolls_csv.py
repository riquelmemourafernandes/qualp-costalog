"""Importa tarifas de pedágio a partir de CSV com fonte e vigência explícitas.

Uso (no backend/container): python -m app.importers.import_tolls_csv /caminho/tarifas.csv
Não cria tarifas estimadas: cada linha deve trazer fonte, categoria e início de vigência.
"""
import csv
import sys
from decimal import Decimal, InvalidOperation
from datetime import date
from pathlib import Path
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from app.db import engine


REQUIRED = {
    "name", "highway", "state", "latitude", "longitude",
    "vehicle_category", "amount_brl", "valid_from", "valid_until",
    "source_name", "source_url",
}


def import_csv(path: Path) -> tuple[int, int]:
    created_rates = 0
    skipped_rates = 0
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        missing = REQUIRED - set(reader.fieldnames or [])
        if missing:
            raise ValueError("Colunas ausentes no CSV: " + ", ".join(sorted(missing)))
        with engine.begin() as connection:
            for line_number, row in enumerate(reader, start=2):
                try:
                    amount = Decimal(row["amount_brl"].strip().replace(",", "."))
                    latitude = float(row["latitude"])
                    longitude = float(row["longitude"])
                    valid_from = date.fromisoformat(row["valid_from"].strip())
                    valid_until_raw = row["valid_until"].strip()
                    valid_until = date.fromisoformat(valid_until_raw) if valid_until_raw else None
                except (ValueError, InvalidOperation) as exc:
                    raise ValueError(f"Linha {line_number}: valor, coordenada ou data inválida.") from exc
                if amount < 0 or not (-34 <= latitude <= 6) or not (-74 <= longitude <= -34):
                    raise ValueError(f"Linha {line_number}: valor ou coordenada fora do intervalo permitido.")
                if valid_until and valid_until < valid_from:
                    raise ValueError(f"Linha {line_number}: fim da vigência anterior ao início.")
                for field in ("name", "highway", "state", "vehicle_category", "source_name"):
                    if not row[field].strip():
                        raise ValueError(f"Linha {line_number}: campo obrigatório vazio: {field}.")
                plaza_id = connection.execute(text("""
                    SELECT id FROM toll_plazas
                    WHERE LOWER(name) = LOWER(:name)
                      AND LOWER(highway) = LOWER(:highway)
                      AND state = :state
                      AND ST_DWithin(
                        location,
                        ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography,
                        50
                      )
                    ORDER BY id LIMIT 1
                """), {
                    "name": row["name"].strip(), "highway": row["highway"].strip(),
                    "state": row["state"].strip().upper(), "longitude": longitude, "latitude": latitude,
                }).scalar_one_or_none()
                if plaza_id is None:
                    plaza_id = connection.execute(text("""
                        INSERT INTO toll_plazas (name, highway, state, location, source_name, source_url)
                        VALUES (:name, :highway, :state,
                                ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography,
                                :source_name, :source_url)
                        RETURNING id
                    """), {
                        "name": row["name"].strip(), "highway": row["highway"].strip(),
                        "state": row["state"].strip().upper(), "longitude": longitude, "latitude": latitude,
                        "source_name": row["source_name"].strip(), "source_url": row["source_url"].strip() or None,
                    }).scalar_one()
                exists = connection.execute(text("""
                    SELECT id FROM toll_rates
                    WHERE toll_plaza_id = :plaza_id
                      AND vehicle_category = :vehicle_category
                      AND amount_brl = :amount
                      AND valid_from = :valid_from
                      AND valid_until IS NOT DISTINCT FROM :valid_until
                      AND source_name = :source_name
                    LIMIT 1
                """), {
                    "plaza_id": plaza_id, "vehicle_category": row["vehicle_category"].strip(),
                    "amount": amount, "valid_from": valid_from, "valid_until": valid_until,
                    "source_name": row["source_name"].strip(),
                }).scalar_one_or_none()
                if exists:
                    skipped_rates += 1
                    continue
                connection.execute(text("""
                    INSERT INTO toll_rates
                        (toll_plaza_id, vehicle_category, amount_brl, valid_from, valid_until, source_name, source_url)
                    VALUES (:plaza_id, :vehicle_category, :amount, :valid_from, :valid_until, :source_name, :source_url)
                """), {
                    "plaza_id": plaza_id, "vehicle_category": row["vehicle_category"].strip(),
                    "amount": amount, "valid_from": valid_from, "valid_until": valid_until,
                    "source_name": row["source_name"].strip(), "source_url": row["source_url"].strip() or None,
                })
                created_rates += 1
    return created_rates, skipped_rates


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Uso: python -m app.importers.import_tolls_csv arquivo.csv")
    path = Path(sys.argv[1])
    if not path.is_file():
        raise SystemExit(f"Arquivo não encontrado: {path}")
    try:
        created, skipped = import_csv(path)
    except (ValueError, SQLAlchemyError) as exc:
        raise SystemExit(f"Importação cancelada: {exc}") from exc
    print(f"Importação concluída. Tarifas inseridas: {created}; duplicadas ignoradas: {skipped}.")


if __name__ == "__main__":
    main()
