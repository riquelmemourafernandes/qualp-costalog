import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet'
import { useEffect } from 'react'
import L from 'leaflet'
import type { PlannedRoute } from './services/api'

function FitRoute({ positions }: { positions: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (positions.length > 1) map.fitBounds(L.latLngBounds(positions), { padding: [28, 28] })
  }, [map, positions])
  return null
}

export default function RouteMap({ route }: { route: PlannedRoute }) {
  const positions = route.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude] as [number, number])
  return <MapContainer center={positions[0]} zoom={7} className="route-map">
    <TileLayer attribution="OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    <FitRoute positions={positions} />
    <Polyline positions={positions} pathOptions={{ color: '#5d7416', weight: 5, opacity: 0.9 }} />
    <CircleMarker center={positions[0]} radius={8} pathOptions={{ color: '#ffffff', fillColor: '#247a4b', fillOpacity: 1, weight: 3 }}>
      <Popup><strong>Origem</strong><br />{route.origin}</Popup>
    </CircleMarker>
    <CircleMarker center={positions[positions.length - 1]} radius={8} pathOptions={{ color: '#ffffff', fillColor: '#c54a3b', fillOpacity: 1, weight: 3 }}>
      <Popup><strong>Destino</strong><br />{route.destination}</Popup>
    </CircleMarker>
    {route.tolls.map((toll, index) => <CircleMarker key={toll.id + toll.vehicle_category + index} center={[toll.latitude, toll.longitude]} radius={6} pathOptions={{ color: '#ffffff', fillColor: '#d2a21c', fillOpacity: 1, weight: 2 }}>
      <Popup><strong>{toll.name}</strong><br />{toll.highway} · {toll.state}<br />{toll.vehicle_category}: {Number(toll.amount_brl).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}<br />Fonte: {toll.source_name}</Popup>
    </CircleMarker>)}
  </MapContainer>
}
