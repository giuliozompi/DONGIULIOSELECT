import { useMemo, useState, type MouseEvent } from 'react';
import { MapPin, Plus, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CheeseData } from '@shared/editorial';

type Point = { id: string; label: string; latitude: number; longitude: number };
type GeoData = CheeseData & { productionPoints?: Point[] };
type Marker = { kind: 'origin' } | { kind: 'production'; id: string };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const MAX_MERCATOR_LATITUDE = 85.0511287798066;
function wrappedTileX(x: number, zoom: number) {
  const scale = 2 ** zoom;
  return ((x % scale) + scale) % scale;
}
function tilePoint(latitude: number, longitude: number, zoom: number) {
  const scale = 2 ** zoom;
  const x = ((longitude + 180) / 360) * scale;
  const safeLatitude = clamp(latitude, -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE);
  const sin = Math.sin((safeLatitude * Math.PI) / 180);
  const y = clamp((0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale, 0, scale);
  return { x, y };
}
function coordinates(x: number, y: number, zoom: number) {
  const scale = 2 ** zoom;
  const wrappedX = wrappedTileX(x, zoom);
  return {
    latitude: clamp((Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / scale))) * 180) / Math.PI, -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE),
    longitude: (wrappedX / scale) * 360 - 180,
  };
}

export default function CheeseGeoEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: GeoData;
  onChange: (next: GeoData) => void;
  disabled?: boolean;
}) {
  const points = value.productionPoints || [];
  const [zoom, setZoom] = useState(4);
  const [selected, setSelected] = useState<Marker>({ kind: 'origin' });
  const center = useMemo(() => {
    const selectedPoint = selected.kind === 'production' ? points.find(point => point.id === selected.id) : undefined;
    const marker = selectedPoint || (selected.kind === 'origin' && value.latitude != null && value.longitude != null
      ? { latitude: value.latitude, longitude: value.longitude }
      : points[0] || { latitude: 42, longitude: 12 });
    return tilePoint(marker.latitude, marker.longitude, zoom);
  }, [points, selected, value.latitude, value.longitude, zoom]);
  const tileX = Math.floor(center.x);
  const tileY = Math.floor(center.y);
  const centerOffsetX = (center.x - tileX + 1) * 256;
  const centerOffsetY = (center.y - tileY + 1) * 256;
  const origin = value.latitude != null && value.longitude != null
    ? tilePoint(value.latitude, value.longitude, zoom)
    : null;
  const markerPoints = points.map(point => ({ point, projected: tilePoint(point.latitude, point.longitude, zoom) }));

  function moveMarker(marker: Marker, latitude: number, longitude: number) {
    if (marker.kind === 'origin') onChange({ ...value, latitude, longitude });
    else onChange({ ...value, productionPoints: points.map(point => point.id === marker.id ? { ...point, latitude, longitude } : point) });
  }
  function mapClick(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = center.x + (event.clientX - rect.left - rect.width / 2) / 256;
    const y = center.y + (event.clientY - rect.top - rect.height / 2) / 256;
    const location = coordinates(x, y, zoom);
    moveMarker(selected, location.latitude, location.longitude);
  }

  return <section className="min-w-0 max-w-full space-y-3 overflow-hidden rounded-md border border-[#d9d7ca] bg-[#f5f3eb] p-3" data-testid="cheese-geo-editor">
    <div className="flex items-start justify-between gap-3">
      <div><h3 className="font-serif text-lg">География сыра</h3><p className="text-xs leading-5 text-[#718075]">Происхождение и места производства — разные точки. Выберите точку, затем нажмите на карту или введите координаты.</p></div>
      <div className="flex shrink-0 gap-2"><Button type="button" size="icon" variant="outline" aria-label="Уменьшить масштаб карты" title="Уменьшить масштаб" disabled={disabled || zoom <= 2} onClick={() => setZoom(current => Math.max(2, current - 1))}><ZoomOut className="h-4 w-4" /></Button><Button type="button" size="icon" variant="outline" aria-label="Увеличить масштаб карты" title="Увеличить масштаб" disabled={disabled || zoom >= 19} onClick={() => setZoom(current => Math.min(19, current + 1))}><ZoomIn className="h-4 w-4" /></Button><Button type="button" size="sm" variant="outline" disabled={disabled || points.length >= 20} onClick={() => {
        const point = { id: crypto.randomUUID(), label: `Производство ${points.length + 1}`, latitude: value.latitude ?? 42, longitude: value.longitude ?? 12 };
        onChange({ ...value, productionPoints: [...points, point] });
        setSelected({ kind: 'production', id: point.id });
      }}><Plus className="mr-1 h-4 w-4" />Точка производства</Button></div>
    </div>
    <div className="flex flex-wrap gap-2 text-xs">
      <button type="button" disabled={disabled} onClick={() => setSelected({ kind: 'origin' })} className={`rounded-full border px-3 py-1.5 ${selected.kind === 'origin' ? 'border-[#315647] bg-[#315647] text-white' : 'border-[#c9cbbf] bg-[#fbfaf6] text-[#53645a]'}`}>Происхождение</button>
      {points.map((point, index) => <button key={point.id} type="button" disabled={disabled} onClick={() => setSelected({ kind: 'production', id: point.id })} className={`rounded-full border px-3 py-1.5 ${selected.kind === 'production' && selected.id === point.id ? 'border-[#a05d41] bg-[#a05d41] text-white' : 'border-[#c9cbbf] bg-[#fbfaf6] text-[#53645a]'}`}>Производство {index + 1}</button>)}
    </div>
    <div role="application" aria-label="Карта координат. Нажмите, чтобы переместить выбранную точку." aria-disabled={disabled} tabIndex={disabled ? -1 : 0} onClick={disabled ? undefined : mapClick} onKeyDown={event => {
      if (disabled) return;
      const step = event.shiftKey ? 1 : 0.1;
      const active = selected.kind === 'origin'
        ? value.latitude == null || value.longitude == null ? null : { latitude: value.latitude, longitude: value.longitude }
        : points.find(point => point.id === selected.id);
      if (!active) return;
      const delta = { ArrowUp: [step, 0], ArrowDown: [-step, 0], ArrowLeft: [0, -step], ArrowRight: [0, step] }[event.key];
      if (delta) { event.preventDefault(); moveMarker(selected, clamp(active.latitude + delta[0], -90, 90), clamp(active.longitude + delta[1], -180, 180)); }
    }} className={`relative h-56 overflow-hidden rounded border border-[#c9cbbf] bg-[#e6e7d9] outline-none focus-visible:ring-2 focus-visible:ring-[#315647] ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-crosshair'}`}>
      <div className="absolute grid h-[768px] w-[768px] grid-cols-3 grid-rows-3" style={{ left: `calc(50% - ${centerOffsetX}px)`, top: `calc(50% - ${centerOffsetY}px)` }} aria-hidden="true">
        {Array.from({ length: 9 }, (_, index) => {
          const rawX = tileX + (index % 3) - 1;
          const x = wrappedTileX(rawX, zoom);
          const y = tileY + Math.floor(index / 3) - 1;
          return y < 0 || y >= 2 ** zoom
            ? <div key={`${rawX}-${y}`} className="bg-[#e6e7d9]" style={{ width: 256, height: 256 }} />
            : <img key={`${rawX}-${y}`} data-map-tile="true" draggable={false} className="max-w-none" style={{ width: 256, height: 256 }} src={`https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`} alt="" />;
        })}
      </div>
      <div className="absolute inset-0 cursor-crosshair">
        {origin && <button type="button" disabled={disabled} title="Точка происхождения" aria-label="Выбрать точку происхождения" onClick={event => { event.stopPropagation(); setSelected({ kind: 'origin' }); }} className="absolute z-10 -translate-x-1/2 -translate-y-full text-[#315647]" style={{ left: `calc(50% + ${(origin.x - center.x) * 256}px)`, top: `calc(50% + ${(origin.y - center.y) * 256}px)` }}><MapPin className="h-7 w-7 fill-[#f7f4e9] drop-shadow" /></button>}
        {markerPoints.map(({ point, projected }, index) => <button key={point.id} type="button" disabled={disabled} title={point.label} aria-label={`Выбрать точку производства ${point.label}`} onClick={event => { event.stopPropagation(); setSelected({ kind: 'production', id: point.id }); }} className="absolute z-10 -translate-x-1/2 -translate-y-full text-[#a05d41]" style={{ left: `calc(50% + ${(projected.x - center.x) * 256}px)`, top: `calc(50% + ${(projected.y - center.y) * 256}px)` }}><MapPin className="h-7 w-7 fill-[#fbfaf6] drop-shadow" /><span className="absolute left-1/2 top-1 -translate-x-1/2 text-[9px] font-bold text-[#a05d41]">{index + 1}</span></button>)}
      </div>
      <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-[#fbfaf6]/90 px-1.5 py-1 text-[10px] text-[#53645a]"><a className="pointer-events-auto underline underline-offset-2" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()}>© OpenStreetMap contributors</a> · нажмите на карту для переноса выбранной точки</span>
    </div>
    <div className="space-y-3">
      <CoordinateRow label="Происхождение" latitude={value.latitude} longitude={value.longitude} disabled={disabled} onChange={(latitude, longitude) => onChange({ ...value, latitude, longitude })} />
      {points.map(point => <div key={point.id} className="space-y-2 rounded border border-[#deddd2] bg-[#fbfaf6] p-2.5">
        <div className="flex gap-2"><Input aria-label="Название точки производства" value={point.label} maxLength={200} disabled={disabled} onChange={event => onChange({ ...value, productionPoints: points.map(item => item.id === point.id ? { ...item, label: event.target.value } : item) })} /><Button type="button" size="icon" variant="ghost" disabled={disabled} aria-label={`Удалить ${point.label}`} onClick={() => { onChange({ ...value, productionPoints: points.filter(item => item.id !== point.id) }); if (selected.kind === 'production' && selected.id === point.id) setSelected({ kind: 'origin' }); }}><Trash2 className="h-4 w-4 text-[#9d4d3f]" /></Button></div>
        <CoordinateRow label="Производство" latitude={point.latitude} longitude={point.longitude} disabled={disabled} onChange={(latitude, longitude) => {
          if (latitude !== null && longitude !== null) onChange({ ...value, productionPoints: points.map(item => item.id === point.id ? { ...item, latitude, longitude } : item) });
        }} />
      </div>)}
    </div>
  </section>;
}

function CoordinateRow({ label, latitude, longitude, onChange, disabled = false }: { label: string; latitude: number | null; longitude: number | null; onChange: (latitude: number | null, longitude: number | null) => void; disabled?: boolean }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(90px,.7fr)_1fr_1fr] sm:items-end">
    <span className="col-span-2 text-xs font-medium text-[#53645a] sm:col-span-1 sm:pb-2">{label}</span>
    <label className="space-y-1 text-[10px] font-medium text-[#718075]">Широта<Input aria-label={`${label}: широта`} type="number" step="any" min="-90" max="90" value={latitude ?? ''} disabled={disabled} onChange={event => onChange(event.target.value === '' ? null : clamp(Number(event.target.value), -90, 90), longitude)} /></label>
    <label className="space-y-1 text-[10px] font-medium text-[#718075]">Долгота<Input aria-label={`${label}: долгота`} type="number" step="any" min="-180" max="180" value={longitude ?? ''} disabled={disabled} onChange={event => onChange(latitude, event.target.value === '' ? null : clamp(Number(event.target.value), -180, 180))} /></label>
  </div>;
}
