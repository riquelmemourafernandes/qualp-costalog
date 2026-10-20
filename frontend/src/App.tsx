import { useEffect, useState, type FormEvent } from 'react'
import { Calculator, Fuel, MapPin, Route, Truck, CircleAlert, ArrowRight, RefreshCw } from 'lucide-react'
import { calculateEstimate, getRouteHistory, getVehicles, type EstimateResponse, type RouteHistoryItem } from './services/api'

const defaultVehicles = [
  { name: 'Caminhão 2 eixos', consumption: 3.0, axles: 2 },
  { name: 'Carreta 6 eixos', consumption: 2.2, axles: 6 },
  { name: 'LS', consumption: 2.0, axles: 6 },
  { name: 'Rodotrem', consumption: 1.6, axles: 9 },
  { name: 'Personalizado', consumption: 2.5, axles: 6 },
]

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function App() {
  const [origin, setOrigin] = useState('Santos, SP')
  const [destination, setDestination] = useState('Campinas, SP')
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

  useEffect(() => {
    getVehicles().then(records => {
      const options = records.map(item => ({ name: item.name, consumption: Number(item.consumption_km_l), axles: item.axles }))
      setVehicleOptions([...options, { name: 'Personalizado', consumption: 2.5, axles: 6 }])
      if (options.length > 0) {
        setVehicle(current => options.some(item => item.name === current) ? current : options[0].name)
      }
    }).catch(() => { /* Mantém o catálogo local se a API ou o banco ainda não estiverem disponíveis. */ })
  }, [])

  function chooseVehicle(name: string) {
    setVehicle(name)
    const selected = vehicleOptions.find(item => item.name === name)
    if (selected && name !== 'Personalizado') setConsumption(String(selected.consumption))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const estimate = await calculateEstimate({
        origin, destination, distance_km: Number(distance),
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
        <div className="notice"><CircleAlert size={19} /><div><strong>Versão inicial — confira os dados antes de usar</strong><p>A distância e os pedágios são informados manualmente. O sistema ainda não calcula rotas reais nem contém uma base nacional validada de tarifas.</p></div></div>

        <div className="workspace">
          <section className="panel form-panel">
            <div className="panel-heading"><div className="heading-icon"><Route size={18} /></div><div><h2>Dados da viagem</h2><p>Preencha o trajeto e os dados do veículo.</p></div></div>
            <form onSubmit={submit}>
              <label>ORIGEM</label><div className="input-wrap"><MapPin size={17} /><input value={origin} onChange={e => setOrigin(e.target.value)} required placeholder="Cidade de origem" /></div>
              <label>DESTINO</label><div className="input-wrap"><MapPin size={17} /><input value={destination} onChange={e => setDestination(e.target.value)} required placeholder="Cidade de destino" /></div>
              <div className="field-row"><div className="field"><label>DISTÂNCIA (KM)</label><input type="number" min="0.1" step="0.1" value={distance} onChange={e => setDistance(e.target.value)} required /></div><div className="field"><label>VEÍCULO</label><select value={vehicle} onChange={e => chooseVehicle(e.target.value)}>{vehicleOptions.map(item => <option key={item.name}>{item.name}</option>)}</select></div></div>
              <div className="field-row"><div className="field"><label>CONSUMO (KM/L)</label><input type="number" min="0.1" step="0.1" value={consumption} onChange={e => setConsumption(e.target.value)} required /></div><div className="field"><label>DIESEL (R$/L)</label><input type="number" min="0.01" step="0.01" value={fuelPrice} onChange={e => setFuelPrice(e.target.value)} required /></div></div>
              <label>PEDÁGIOS TOTAIS (R$)</label><div className="input-wrap"><span className="currency-prefix">R$</span><input type="number" min="0" step="0.01" value={tolls} onChange={e => setTolls(e.target.value)} required /></div>
              <button className="submit-button" type="submit" disabled={loading}>{loading ? <RefreshCw size={18} className="spin" /> : <Calculator size={18} />}{loading ? 'Calculando...' : 'Calcular estimativa'}<ArrowRight size={17} /></button>
              {error && <p className="error-message">{error}</p>}
            </form>
          </section>

          <section className="results-column">
            <div className="panel result-panel"><div className="panel-heading"><div className="heading-icon green"><Fuel size={18} /></div><div><h2>Resumo de custos</h2><p>{result ? `${result.origin} → ${result.destination}` : 'O resultado aparecerá após o cálculo.'}</p></div></div>
              <div className="total-card"><span>CUSTO ESTIMADO TOTAL</span><strong>{result ? money(result.estimated_total_brl) : 'R$ —'}</strong><small>Combustível + pedágios informados</small></div>
              <div className="cost-line"><div><span className="cost-dot fuel-dot" /><span>Combustível</span></div><strong>{result ? money(result.fuel_cost_brl) : '—'}</strong></div>
              <div className="cost-line"><div><span className="cost-dot toll-dot" /><span>Pedágios</span></div><strong>{result ? money(result.toll_total_brl) : '—'}</strong></div>
              <div className="metrics"><div><span>DISTÂNCIA</span><strong>{result ? `${result.distance_km} km` : '—'}</strong></div><div><span>COMBUSTÍVEL</span><strong>{result ? `${result.fuel_liters.toLocaleString('pt-BR')} L` : '—'}</strong></div></div>
            </div>
            <div className="panel next-panel"><div className="panel-heading"><div className="heading-icon"><MapPin size={18} /></div><div><h2>Próximas etapas</h2><p>O que falta para uma consulta completa.</p></div></div><ul><li><span>01</span><div><strong>Roteamento rodoviário</strong><p>Obter distância e traçado de uma fonte adequada a veículos pesados.</p></div></li><li><span>02</span><div><strong>Base nacional de pedágios</strong><p>Importar tarifas oficiais por categoria e vigência.</p></div></li><li><span>03</span><div><strong>Histórico e cadastros</strong><p>Persistir veículos, consultas e auditoria no banco.</p></div></li></ul></div>
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
