const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export type EstimateRequest = {
  origin: string
  destination: string
  distance_km: number
  consumption_km_l: number
  fuel_price_brl: number
  toll_total_brl: number
  vehicle_name: string
}

export type EstimateResponse = EstimateRequest & {
  fuel_liters: number
  fuel_cost_brl: number
  estimated_total_brl: number
  note: string
}

export async function calculateEstimate(payload: EstimateRequest): Promise<EstimateResponse> {
  const response = await fetch(`${API_URL}/api/v1/routes/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.detail ?? 'Não foi possível calcular a estimativa.')
  }
  return response.json()
}
