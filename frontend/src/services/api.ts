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

const ROUTE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000

export async function planRoute(payload: { origin: string; destination: string; vehicle_name: string }): Promise<PlannedRoute> {
  const cacheKey = 'qualp-route-v1:' + JSON.stringify([
    payload.origin.trim().toLocaleLowerCase('pt-BR'),
    payload.destination.trim().toLocaleLowerCase('pt-BR'),
    payload.vehicle_name.trim().toLocaleLowerCase('pt-BR'),
  ])
  try {
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      const parsed = JSON.parse(cached) as { savedAt: number; route: PlannedRoute }
      if (Date.now() - parsed.savedAt < ROUTE_CACHE_TTL_MS && parsed.route?.geometry?.coordinates?.length) {
        return { ...parsed.route, distance_km: Math.round(parsed.route.distance_km) }
      }
      localStorage.removeItem(cacheKey)
    }
  } catch {
    // Se o armazenamento local estiver indisponível, continua com a consulta normal.
  }

  const response = await fetch(`${API_URL}/api/v1/routes/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.detail ?? 'Não foi possível planejar a rota.')
  }
  const route = await response.json() as PlannedRoute
  route.distance_km = Math.round(route.distance_km)
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), route }))
  } catch {
    // Cache é opcional; a rota calculada continua válida nesta consulta.
  }
  return route
}


export type CitySuggestion = {
  ibge_id: number
  name: string
  state: string
  label: string
}

let ibgeCitiesPromise: Promise<CitySuggestion[]> | null = null

function normalizeCitySearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim()
}

async function getIbgeCities(): Promise<CitySuggestion[]> {
  if (!ibgeCitiesPromise) {
    ibgeCitiesPromise = fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome')
      .then(async response => {
        if (!response.ok) throw new Error('O IBGE não respondeu à consulta de municípios.')
        const rows = await response.json()
        return rows.map((city: any) => {
          const uf = city.microrregiao?.mesorregiao?.UF ?? city['regiao-imediata']?.['regiao-intermediaria']?.UF
          return { ibge_id: Number(city.id), name: String(city.nome ?? ''), state: String(uf?.sigla ?? ''), label: String(city.nome ?? '') + ' - ' + String(uf?.sigla ?? '') } as CitySuggestion
        }).filter((city: CitySuggestion) => city.name && city.state)
      })
      .catch(error => { ibgeCitiesPromise = null; throw error })
  }
  return ibgeCitiesPromise
}

export async function searchCities(query: string): Promise<CitySuggestion[]> {
  const rawTerm = query.trim()
  if (rawTerm.length < 2) return []
  const cityTerm = rawTerm.split(' - ', 1)[0].trim()
  const normalized = normalizeCitySearch(cityTerm)
  if (normalized.length < 2) return []
  // Normaliza antes de pesquisar para ignorar maiúsculas, minúsculas e acentos.
  try {
    const response = await fetch(API_URL + '/api/v1/cities?query=' + encodeURIComponent(normalized) + '&limit=12')
    if (response.ok) {
      const data = await response.json()
      if (Array.isArray(data.items) && data.items.length > 0) return data.items
    }
  } catch {
    // Se a API ou o banco estiverem indisponíveis, consulta a lista oficial do IBGE.
  }
  const cities = await getIbgeCities()
  return cities.filter(city => normalizeCitySearch(city.name).includes(normalized)).slice(0, 12)
}


export async function importTollsCsv(file: File, adminToken: string): Promise<{ success: boolean; inserted_rates: number; duplicate_rates_skipped: number; message: string }> {
  const form = new FormData()
  form.append('file', file)
  const response = await fetch(`${API_URL}/api/v1/tolls/import-csv`, {
    method: 'POST',
    headers: { 'X-Admin-Token': adminToken },
    body: form,
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.detail ?? 'Não foi possível importar o arquivo de pedágios.')
  return body
}
