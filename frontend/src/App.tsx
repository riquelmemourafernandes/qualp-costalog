import { useEffect, useState, type FormEvent } from 'react'
import { Calculator, Fuel, MapPin, Route, Truck, CircleAlert, ArrowRight, RefreshCw } from 'lucide-react'
import { calculateEstimate, createVehicle, getRouteHistory, getVehicles, planRoute, type EstimateResponse, type RouteHistoryItem, type PlannedRoute, searchCities, type CitySuggestion } from './services/api'
import RouteMap from './RouteMap'

const defaultVehicles = [
  { name: 'Caminhão 2 eixos', consumption: 3.0, axles: 2 },
  { name: 'Carreta 6 eixos', consumption: 2.2, axles: 6 },
  { name: 'LS', consumption: 2.0, axles: 6 },
  { name: 'Rodotrem', consumption: 1.6, axles: 9 },
  { name: 'Personalizado', consumption: 2.5, axles: 6 },
]

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type AnttCargo = 'conteinerizada' | 'geral'
type AnttCoefficient = { ccd: number; cc: number }
const anttAxles = [2, 3, 4, 5, 6, 7, 9]
const anttTableA: Record<AnttCargo, Partial<Record<number, AnttCoefficient>>> = {
  conteinerizada: {
    3: { ccd: 5.2282, cc: 544.75 }, 4: { ccd: 5.8755, cc: 577.15 },
    5: { ccd: 6.7910, cc: 647.29 }, 6: { ccd: 7.4986, cc: 662.01 },
    7: { ccd: 8.2292, cc: 819.69 }, 9: { ccd: 9.3486, cc: 886.05 },
  },
  geral: {
    2: { ccd: 4.0738, cc: 451.84 }, 3: { ccd: 5.2177, cc: 541.86 },
    4: { ccd: 5.9180, cc: 588.86 }, 5: { ccd: 6.8284, cc: 657.56 },
    6: { ccd: 7.5347, cc: 671.93 }, 7: { ccd: 8.2727, cc: 831.66 },
    9: { ccd: 9.4114, cc: 903.32 },
  },
}


export default function App() {
  const [origin, setOrigin] = useState('Santos, SP')
  const [destination, setDestination] = useState('Campinas, SP')
  const [originSuggestions, setOriginSuggestions] = useState<CitySuggestion[]>([])
  const [destinationSuggestions, setDestinationSuggestions] = useState<CitySuggestion[]>([])
  const [selectedOrigin, setSelectedOrigin] = useState<CitySuggestion | null>(null)
  const [selectedDestination, setSelectedDestination] = useState<CitySuggestion | null>(null)
  const [roundTrip, setRoundTrip] = useState(false)
  const [emptyReturn, setEmptyReturn] = useState(false)
  const [emptyReturnDistance, setEmptyReturnDistance] = useState('180')
  const [distance, setDistance] = useState('180')
  const [vehicleOptions, setVehicleOptions] = useState(defaultVehicles)
  const [vehicle, setVehicle] = useState(defaultVehicles[1].name)
  const [consumption, setConsumption] = useState('2.2')
  const [fuelPrice, setFuelPrice] = useState('6.20')
  const [tolls, setTolls] = useState('0')
  const [result, setResult] = useState<EstimateResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<RouteHistoryItem[]>([])
  const [historyMessage, setHistoryMessage] = useState('O histórico será carregado após a primeira consulta.')
  const [plannedRoute, setPlannedRoute] = useState<PlannedRoute | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeError, setRouteError] = useState('')
  const [showVehicleForm, setShowVehicleForm] = useState(false)
  const [vehicleNameInput, setVehicleNameInput] = useState('')
  const [vehicleTypeInput, setVehicleTypeInput] = useState('carreta')
  const [vehicleAxlesInput, setVehicleAxlesInput] = useState('6')
  const [vehicleConsumptionInput, setVehicleConsumptionInput] = useState('2.2')
  const [vehicleSaveLoading, setVehicleSaveLoading] = useState(false)
  const [vehicleMessage, setVehicleMessage] = useState('')
  const [anttCargo, setAnttCargo] = useState<AnttCargo>('conteinerizada')
  const [anttAxleCount, setAnttAxleCount] = useState('6')

  useEffect(() => {
    getVehicles().then(records => {
      const options = records.map(item => ({ name: item.name, consumption: Number(item.consumption_km_l), axles: item.axles }))
      setVehicleOptions([...options, { name: 'Personalizado', consumption: 2.5, axles: 6 }])
      if (options.length > 0) {
        setVehicle(current => options.some(item => item.name === current) ? current : options[0].name)
      }
    }).catch(() => { /* Mantém o catálogo local se a API ou o banco ainda não estiverem disponíveis. */ })
    getRouteHistory().then(items => {
      setHistory(items)
      setHistoryMessage(items.length ? '' : 'Nenhuma consulta salva ainda.')
    }).catch(() => setHistoryMessage('Histórico indisponível: confira a conexão do banco de dados.'))
  }, [])


  async function updateOriginSuggestions(value: string) {
    if (value.trim().length < 2) { setOriginSuggestions([]); return }
    try { setOriginSuggestions(await searchCities(value)) } catch { setOriginSuggestions([]) }
  }

  async function updateDestinationSuggestions(value: string) {
    if (value.trim().length < 2) { setDestinationSuggestions([]); return }
    try { setDestinationSuggestions(await searchCities(value)) } catch { setDestinationSuggestions([]) }
  }

  function cityAddress(city: CitySuggestion) {
    return `${city.name}, ${city.state}, Brasil`
  }

  function chooseVehicle(name: string) {
    setVehicle(name)
    const selected = vehicleOptions.find(item => item.name === name)
    if (selected && name !== 'Personalizado') setConsumption(String(selected.consumption))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedOrigin || !selectedDestination) {
      setError('Selecione a origem e o destino na lista de municípios sugeridos antes de calcular.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const estimate = await calculateEstimate({
        origin: selectedOrigin.label, destination: selectedDestination.label, distance_km: Number(distance),
        consumption_km_l: Number(consumption), fuel_price_brl: Number(fuelPrice),
        toll_total_brl: Number(tolls), vehicle_name: vehicle,
      })
      setResult(estimate)
      try {
        setHistory(await getRouteHistory())
        setHistoryMessage('')
      } catch {
        setHistoryMessage('O histórico depende da conexão com o banco de dados.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro inesperado ao calcular.')
    } finally {
      setLoading(false)
    }
  }

  async function saveVehicle() {
    setVehicleSaveLoading(true)
    setVehicleMessage('')
    try {
      const saved = await createVehicle({
        name: vehicleNameInput.trim(),
        vehicle_type: vehicleTypeInput,
        axles: Number(vehicleAxlesInput),
        consumption_km_l: Number(vehicleConsumptionInput),
      })
      const option = { name: saved.name, consumption: Number(saved.consumption_km_l), axles: saved.axles }
      setVehicleOptions(current => [...current.filter(item => item.name !== option.name && item.name !== 'Personalizado'), option, { name: 'Personalizado', consumption: 2.5, axles: 6 }])
      setVehicle(saved.name)
      setConsumption(String(saved.consumption_km_l))
      setVehicleMessage('Veículo salvo no banco de dados.')
      setVehicleNameInput('')
      setShowVehicleForm(false)
    } catch (e) {
      setVehicleMessage(e instanceof Error ? e.message : 'Não foi possível salvar o veículo.')
    } finally {
      setVehicleSaveLoading(false)
    }
  }

  async function requestRoute() {
    if (!selectedOrigin || !selectedDestination) {
      setRouteError('Selecione a origem e o destino na lista de municípios sugeridos antes de buscar a rota.')
      return
    }
    setRouteLoading(true)
    setRouteError('')
    try {
      const outbound = await planRoute({ origin: cityAddress(selectedOrigin), destination: cityAddress(selectedDestination), vehicle_name: vehicle })
      let route = outbound
      if (roundTrip) {
        const returning = await planRoute({ origin: cityAddress(selectedDestination), destination: cityAddress(selectedOrigin), vehicle_name: vehicle })
        route = {
          ...outbound,
          distance_km: Math.round((outbound.distance_km + returning.distance_km) * 100) / 100,
          duration_minutes: outbound.duration_minutes + returning.duration_minutes,
          geometry: { type: 'LineString', coordinates: [...outbound.geometry.coordinates, ...returning.geometry.coordinates.slice(1)] },
          tolls: [...outbound.tolls, ...returning.tolls],
          toll_count: outbound.tolls.length + returning.tolls.length,
          note: 'Ida e volta calculadas separadamente para veículo pesado. ' + outbound.note,
        }
      }
      setPlannedRoute(route)
      setDistance(String(route.distance_km))
      setEmptyReturnDistance(String(outbound.distance_km))
      setTolls(String(route.tolls.reduce((sum, toll) => sum + Number(toll.amount_brl), 0)))
      setResult(null)
      setHistoryMessage('Rota calculada. Faça o cálculo de custos para salvar esta consulta no histórico.')
    } catch (e) {
      setRouteError(e instanceof Error ? e.message : 'Não foi possível planejar a rota.')
    } finally {
      setRouteLoading(false)
    }
  }

  const anttCoefficient = anttTableA[anttCargo][Number(anttAxleCount)]
  const anttDistance = Number(distance) > 0 ? Number(distance) / (roundTrip && plannedRoute ? 2 : 1) : 0
  const emptyDistance = Number(emptyReturnDistance)
  const emptyReturnCost = emptyReturn && anttCoefficient && emptyDistance > 0 ? anttCoefficient.ccd * 0.92 * emptyDistance : 0
  const anttFloorBase = anttCoefficient && anttDistance > 0 ? anttCoefficient.ccd * anttDistance + anttCoefficient.cc : null
  const anttFloor = anttFloorBase === null ? null : anttFloorBase + emptyReturnCost

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-icon"><Route size={23} /></div><div><strong>QUALP <span>COSTALOG</span></strong><small>PLATAFORMA OPERACIONAL</small></div></div>
        <div className="side-label">FERRAMENTAS</div>
        <div className="nav-item active"><Calculator size={18} /> Consulta de custos</div>
        <div className="nav-item muted"><MapPin size={18} /> Rotas e pedágios <span className="soon">MVP</span></div>
        <div className="nav-item muted"><Truck size={18} /> Veículos</div>
        <div className="sidebar-footer"><span className="status-dot" /> Ambiente de desenvolvimento <small>Versão 1.0.0 · MVP</small></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div><div className="eyebrow">COSTALOG / OPERAÇÃO</div><h1>Consulta de custos</h1><p>Estime combustível e pedágios para sua operação.</p></div><div className="top-tag"><span className="status-dot" /> SISTEMA EM DESENVOLVIMENTO</div></header>
        <div className="notice"><CircleAlert size={19} /><div><strong>Confira os dados antes de usar na operação</strong><p>A rota é calculada para veículo pesado. A base de pedágios ainda depende de tarifas cadastradas com fonte e vigência; confira o percurso e informe o total confirmado antes de calcular os custos.</p></div></div>

        <div className="workspace">
          <section className="panel form-panel">
            <div className="panel-heading"><div className="heading-icon"><Route size={18} /></div><div><h2>Dados da viagem</h2><p>Preencha o trajeto e os dados do veículo.</p></div></div>
            <form onSubmit={submit}>
              <label>ORIGEM</label><div className="input-wrap"><MapPin size={17} /><input autoComplete="off" value={origin} onChange={e => { setOrigin(e.target.value); setSelectedOrigin(null); void updateOriginSuggestions(e.target.value) }} required placeholder="Digite o município..." /></div>
              {originSuggestions.length > 0 && <div className="city-suggestions" role="listbox" aria-label="Sugestões de municípios de origem">{originSuggestions.map(city => <button type="button" role="option" key={city.ibge_id} className="city-suggestion" onClick={() => { setOrigin(city.label); setSelectedOrigin(city); setOriginSuggestions([]) }}><strong>{city.name}</strong><span>{city.state} · Código IBGE {city.ibge_id}</span></button>)}</div>}
              <label>DESTINO</label><div className="input-wrap"><MapPin size={17} /><input autoComplete="off" value={destination} onChange={e => { setDestination(e.target.value); setSelectedDestination(null); void updateDestinationSuggestions(e.target.value) }} required placeholder="Digite o município..." /></div>
              {destinationSuggestions.length > 0 && <div className="city-suggestions" role="listbox" aria-label="Sugestões de municípios de destino">{destinationSuggestions.map(city => <button type="button" role="option" key={city.ibge_id} className="city-suggestion" onClick={() => { setDestination(city.label); setSelectedDestination(city); setDestinationSuggestions([]) }}><strong>{city.name}</strong><span>{city.state} · Código IBGE {city.ibge_id}</span></button>)}</div>}
              <small className="city-help">Escolha uma das sugestões oficiais do IBGE. O sistema não usará um município aproximado automaticamente.</small>
              <label className="trip-toggle"><input type="checkbox" checked={roundTrip} onChange={e => { setRoundTrip(e.target.checked); setPlannedRoute(null) }} /><span><strong>Calcular ida e volta</strong><small>Traça os dois sentidos separadamente e soma distância, tempo e pedágios encontrados.</small></span></label>
              <button className="route-button" type="button" onClick={requestRoute} disabled={routeLoading}>{routeLoading ? 'Buscando rota para veículo pesado...' : 'Planejar rota real para caminhão'}</button>
              {routeError && <p className="error-message">{routeError}</p>}
              <div className="field-row"><div className="field"><label>DISTÂNCIA (KM)</label><input type="number" min="0.1" step="0.1" value={distance} onChange={e => setDistance(e.target.value)} required /></div><div className="field"><label>VEÍCULO</label><select value={vehicle} onChange={e => chooseVehicle(e.target.value)}>{vehicleOptions.map(item => <option key={item.name}>{item.name}</option>)}</select></div></div>
              <div className="vehicle-meta"><span>Configuração selecionada</span><strong>{vehicleOptions.find(item => item.name === vehicle)?.axles ?? 6} eixos</strong><button type="button" className="text-button" onClick={() => { setShowVehicleForm(v => !v); setVehicleMessage('') }}>{showVehicleForm ? 'Cancelar' : '+ Cadastrar veículo'}</button></div>
              {showVehicleForm && <div className="vehicle-form">
                <label>NOME DO VEÍCULO</label><input value={vehicleNameInput} onChange={e => setVehicleNameInput(e.target.value)} required minLength={2} maxLength={80} placeholder="Ex.: Carreta 7 eixos" />
                <div className="field-row"><div className="field"><label>TIPO</label><select value={vehicleTypeInput} onChange={e => setVehicleTypeInput(e.target.value)}><option value="truck">Caminhão</option><option value="carreta">Carreta</option><option value="LS">LS</option><option value="rodotrem">Rodotrem</option><option value="outro">Outro</option></select></div><div className="field"><label>NÚMERO DE EIXOS</label><input type="number" min="2" max="12" step="1" value={vehicleAxlesInput} onChange={e => setVehicleAxlesInput(e.target.value)} required /></div></div>
                <label>CONSUMO MÉDIO (KM/L)</label><input type="number" min="0.1" max="20" step="0.1" value={vehicleConsumptionInput} onChange={e => setVehicleConsumptionInput(e.target.value)} required />
                <button className="route-button" type="button" disabled={vehicleSaveLoading || !vehicleNameInput.trim()} onClick={() => saveVehicle()}>{vehicleSaveLoading ? 'Salvando...' : 'Salvar veículo'}</button>
              </div>}
              {vehicleMessage && <p className={vehicleMessage.includes('salvo') ? 'success-message' : 'error-message'}>{vehicleMessage}</p>}
              <div className="field-row"><div className="field"><label>CONSUMO (KM/L)</label><input type="number" min="0.1" step="0.1" value={consumption} onChange={e => setConsumption(e.target.value)} required /></div><div className="field"><label>DIESEL (R$/L)</label><input type="number" min="0.01" step="0.01" value={fuelPrice} onChange={e => setFuelPrice(e.target.value)} required /></div></div>
              <label>PEDÁGIOS TOTAIS (R$)</label><div className="input-wrap"><span className="currency-prefix">R$</span><input type="number" min="0" step="0.01" value={tolls} onChange={e => setTolls(e.target.value)} required /></div>
              <button className="submit-button" type="submit" disabled={loading}>{loading ? <RefreshCw size={18} className="spin" /> : <Calculator size={18} />}{loading ? 'Calculando...' : 'Calcular estimativa'}<ArrowRight size={17} /></button>
              {error && <p className="error-message">{error}</p>}
            </form>
          </section>

          <section className="results-column">
            {plannedRoute && <div className="panel map-panel"><div className="panel-heading"><div className="heading-icon"><MapPin size={18} /></div><div><h2>Traçado da rota</h2><p>{plannedRoute.distance_km} km · {Math.floor(plannedRoute.duration_minutes / 60)} h {plannedRoute.duration_minutes % 60} min estimados</p></div></div><RouteMap route={plannedRoute} /><p className="route-note">{plannedRoute.note}</p><div className="route-summary"><div><span>ORIGEM</span><strong>{plannedRoute.origin}</strong></div><div><span>DESTINO</span><strong>{plannedRoute.destination}</strong></div><div><span>DISTÂNCIA</span><strong>{plannedRoute.distance_km.toLocaleString('pt-BR')} km</strong></div><div><span>TEMPO ESTIMADO</span><strong>{Math.floor(plannedRoute.duration_minutes / 60)}h {plannedRoute.duration_minutes % 60}min</strong></div></div><div className="toll-list"><strong>Pedágios encontrados na base local: {plannedRoute.toll_count}</strong>{plannedRoute.tolls.length === 0 ? <p>Nenhuma tarifa local vigente foi encontrada perto do traçado. Isso não garante que o percurso não tenha pedágios.</p> : plannedRoute.tolls.map((toll, index) => <div className="history-item" key={toll.id + toll.vehicle_category + index}><div><strong>{toll.name} · {toll.highway}</strong><p>{toll.vehicle_category} · Fonte: {toll.source_name}</p></div><strong>{money(Number(toll.amount_brl))}</strong></div>)}</div></div>}
            <div className="panel result-panel"><div className="panel-heading"><div className="heading-icon green"><Fuel size={18} /></div><div><h2>Resumo de custos</h2><p>{result ? `${result.origin} → ${result.destination}` : 'O resultado aparecerá após o cálculo.'}</p></div></div>
              <div className="total-card"><span>CUSTO ESTIMADO TOTAL</span><strong>{result ? money(result.estimated_total_brl) : 'R$ —'}</strong><small>Combustível + pedágios informados</small></div>
              <div className="cost-line"><div><span className="cost-dot fuel-dot" /><span>Combustível</span></div><strong>{result ? money(result.fuel_cost_brl) : '—'}</strong></div>
              <div className="cost-line"><div><span className="cost-dot toll-dot" /><span>Pedágios</span></div><strong>{result ? money(result.toll_total_brl) : '—'}</strong></div>
              <div className="metrics"><div><span>DISTÂNCIA</span><strong>{result ? `${result.distance_km} km` : '—'}</strong></div><div><span>COMBUSTÍVEL</span><strong>{result ? `${result.fuel_liters.toLocaleString('pt-BR')} L` : '—'}</strong></div></div>
            </div>
            <div className="panel next-panel"><div className="panel-heading"><div className="heading-icon"><MapPin size={18} /></div><div><h2>Próximas etapas</h2><p>O que falta para uma consulta completa.</p></div></div><ul><li><span>01</span><div><strong>Roteamento rodoviário</strong><p>Obter distância e traçado de uma fonte adequada a veículos pesados.</p></div></li><li><span>02</span><div><strong>Base nacional de pedágios</strong><p>Importar tarifas oficiais por categoria e vigência.</p></div></li><li><span>03</span><div><strong>Histórico e cadastros</strong><p>Persistir veículos, consultas e auditoria no banco.</p></div></li></ul></div>

            <div className="panel next-panel antt-panel">
              <div className="panel-heading"><div className="heading-icon green"><Calculator size={18} /></div><div><h2>Piso mínimo de frete · ANTT</h2><p>Estimativa integrada à distância desta viagem.</p></div></div>
              <p>Referência da Tabela A — carga lotação, contratação do caminhão/composição completa — conforme Portaria SUROC nº 22/2026, vigente desde 30/09/2026.</p>
              <div className="antt-calculator">
                <div className="field"><label>TIPO DE CARGA</label><select value={anttCargo} onChange={e => setAnttCargo(e.target.value as AnttCargo)}><option value="conteinerizada">Conteinerizada</option><option value="geral">Carga geral</option></select></div>
                <div className="field"><label>EIXOS CARREGADOS</label><select value={anttAxleCount} onChange={e => setAnttAxleCount(e.target.value)}>{anttAxles.filter(axles => anttTableA[anttCargo][axles]).map(axles => <option key={axles} value={axles}>{axles} eixos</option>)}</select></div>
                <div className="antt-distance"><span>DISTÂNCIA CONSIDERADA</span><strong>{anttDistance > 0 ? anttDistance.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' km' : 'Informe a distância'}</strong><small>O cálculo acompanha a distância do formulário; planeje a rota para preencher a distância rodoviária.</small></div>
                <div className="antt-result"><span>FRETE MÍNIMO ESTIMADO (CCD × km + CC)</span><strong>{anttFloor === null ? '—' : money(anttFloor)}</strong><small>{anttCoefficient ? 'CCD: R$ ' + anttCoefficient.ccd.toFixed(4).replace('.', ',') + '/km · CC (carga/descarga): ' + money(anttCoefficient.cc) : 'Configuração não disponível na tabela selecionada.'}</small></div>
              </div>
              <a className="route-button antt-link" href="https://calculadorafrete.antt.gov.br/" target="_blank" rel="noreferrer">Conferir no calculador oficial da ANTT <ArrowRight size={16} /></a>
              <label className="trip-toggle antt-empty-toggle"><input type="checkbox" checked={emptyReturn} onChange={e => setEmptyReturn(e.target.checked)} /><span><strong>Considerar retorno vazio no piso mínimo</strong><small>Use somente quando aplicável pela regra da ANTT (ex.: transporte de contêiner ou frota dedicada/fidelizada elegível).</small></span></label>
              {emptyReturn && <div className="field antt-return-distance"><label>DISTÂNCIA DO RETORNO VAZIO (KM)</label><input type="number" min="0.1" step="0.1" value={emptyReturnDistance} onChange={e => setEmptyReturnDistance(e.target.value)} required /><small>Calculado como 92% do CCD × distância de retorno, somado ao piso da ida.</small></div>}
              <p className="antt-footnote">Estimativa da Tabela A para carga conteinerizada ou geral. O retorno vazio é somado apenas quando a hipótese normativa se aplica: 92% do CCD × distância de retorno. A ida e volta operacional não significa, por si só, retorno vazio obrigatório. Não inclui Tabelas B, C e D. Confirme os dados no calculador oficial da ANTT.</p>
            </div>
            <div className="panel next-panel">
              <div className="panel-heading"><div className="heading-icon"><RefreshCw size={18} /></div><div><h2>Consultas recentes</h2><p>Histórico salvo no banco de dados.</p></div></div>
              {history.length === 0 ? <p className="history-empty">{historyMessage || 'Nenhuma consulta salva ainda.'}</p> : <div className="history-list">{history.map(item => <div className="history-item" key={item.id}><div><strong>{item.origin} → {item.destination}</strong><p>{item.vehicle_name} · {item.distance_km ?? '—'} km</p></div><strong>{money(Number(item.estimated_total_brl ?? 0))}</strong></div>)}</div>}
            </div>
          </section>
        </div>
        <footer>QUALP COSTALOG · Ferramenta interna em desenvolvimento <span>Valores estimados, sujeitos à validação.</span></footer>
      </main>
    </div>
  )
}
