import { MapContainer, TileLayer, Polyline } from 'react-leaflet'
import type { PlannedRoute } from './services/api'

export default function RouteMap({ route }: { route: PlannedRoute }) {
  const positions = route.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude] as [number, number])
  return <MapContainer center={positions[0]} zoom={7} className="route-map">
    <TileLayer attribution="OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    <Polyline positions={positions} pathOptions={{ color: '#5d7416', weight: 5 }} />
  </MapContainer>
}
