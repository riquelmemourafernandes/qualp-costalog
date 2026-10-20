const API_URL = (import.meta.env.VITE_API_URL || 'https://qualp-costalog.onrender.com').replace(/\/$/, '')

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


export type RouteHistoryItem = {
  id: number
  origin: string
  destination: string
  distance_km: number | string | null
  vehicle_name: string
  estimated_total_brl: number | string | null
  created_at: string
}

export async function getRouteHistory(): Promise<RouteHistoryItem[]> {
  const response = await fetch(`${API_URL}/api/v1/routes/history?limit=10`)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.detail ?? 'Não foi possível consultar o histórico.')
  }
  const data = await response.json()
  return data.items ?? []
}


export type VehicleRecord = {
  id: number
  name: string
  vehicle_type: string
  axles: number
  consumption_km_l: number | string
}

export async function createVehicle(payload: Omit<VehicleRecord, 'id'>): Promise<VehicleRecord> {
  const response = await fetch(`${API_URL}/api/v1/vehicles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.detail ?? 'Não foi possível salvar o veículo.')
  }
  return response.json()
}

export async function getVehicles(): Promise<VehicleRecord[]> {
  const response = await fetch(`${API_URL}/api/v1/vehicles`)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.detail ?? 'Não foi possível carregar os veículos.')
  }
  return response.json()
}


export type PlannedToll = {
  id: number
  name: string
  highway: string
  state: string
  latitude: number
  longitude: number
  vehicle_category: string
  amount_brl: number | string
  valid_from: string
  valid_until: string | null
  source_name: string
  source_url: string | null
}

export type PlannedRoute = {
  origin: string
  destination: string
  vehicle_name: string
  distance_km: number
  duration_minutes: number
  geometry: { type: 'LineString'; coordinates: [number, number][] }
  tolls: PlannedToll[]
  toll_count: number
  routing_provider: string
  note: string
}

export async function planRoute(payload: { origin: string; destination: string; vehicle_name: string }): Promise<PlannedRoute> {
  const response = await fetch(`${API_URL}/api/v1/routes/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.detail ?? 'Não foi possível planejar a rota.')
  }
  return response.json()
}
