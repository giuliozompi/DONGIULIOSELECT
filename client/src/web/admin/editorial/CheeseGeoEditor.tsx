import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { LocateFixed, MapPin, Minus, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CheeseData } from '@shared/editorial';
import CheeseMapSearch, { localityZoom, type MapPlace } from './CheeseMapSearch';
import {
  fitCountryBounds,
  getCountryBounds,
  loadWorldCountryFeatures,
  matchCountryFeature,
  type CountryBounds,
  type MapFit,
} from './cheeseCountryMap';

type Point = { id: string; label: string; latitude: number; longitude: number };
type GeoData = CheeseData & { productionPoints?: Point[] };
type Marker = { kind: 'origin' } | { kind: 'production'; id: string };
type CountryFocusState = 'idle' | 'loading' | 'available' | 'not-found' | 'error';

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
function wrappedTileDelta(value: number, center: number, zoom: number) {
  const scale = 2 ** zoom;
  return ((value - center + scale / 2 + scale) % scale) - scale / 2;
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
  const [view, setView] = useState<MapFit>(() => {
    const savedPoint = value.latitude != null && value.longitude != null
      ? { latitude: value.latitude, longitude: value.longitude }
      : points[0] || null;
    return savedPoint ? { ...savedPoint, zoom: 1 } : { latitude: 20, longitude: 0, zoom: 1 };
  });
  const [selected, setSelected] = useState<Marker>({ kind: 'origin' });
  const [focusedPlace, setFocusedPlace] = useState<MapPlace | null>(null);
  const [mapSize, setMapSize] = useState({ width: 320, height: 224 });
  const [countryBounds, setCountryBounds] = useState<CountryBounds | null>(null);
  const [focusState, setFocusState] = useState<CountryFocusState>('idle');
  const [retryCount, setRetryCount] = useState(0);
  const mapRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ pointerId: number; x: number; y: number; center: { x: number; y: number }; zoom: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [panning, setPanning] = useState(false);
  const requestSequence = useRef(0);
  const interactionSequence = useRef(0);
  const fitMode = useRef<'country' | 'manual'>('manual');
  const normalizedCountry = value.country?.trim() || '';
  const savedPoint = value.latitude != null && value.longitude != null
    ? { latitude: value.latitude, longitude: value.longitude }
    : points[0] || null;

  useEffect(() => {
    const element = mapRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) {
        setMapSize({ width: rect.width, height: rect.height });
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!countryBounds || fitMode.current !== 'country') return;
    setView(current => {
      const next = fitCountryBounds(countryBounds, mapSize.width, mapSize.height);
      return { ...next, zoom: next.zoom };
    });
  }, [countryBounds, mapSize]);

  useEffect(() => {
    const requestId = ++requestSequence.current;
    const interactionAtStart = interactionSequence.current;
    setCountryBounds(null);
    setFocusedPlace(null);
    if (!normalizedCountry) {
      setFocusState('idle');
      fitMode.current = 'manual';
      if (interactionSequence.current === interactionAtStart && savedPoint) {
        setView(current => ({ ...current, ...savedPoint }));
      }
      return;
    }
    fitMode.current = 'country';
    setFocusState('loading');
    loadWorldCountryFeatures().then(features => {
      if (requestSequence.current !== requestId) return;
      const feature = matchCountryFeature(features, normalizedCountry);
      const bounds = feature ? getCountryBounds(feature) : null;
      if (!bounds) {
        setCountryBounds(null);
        setFocusState('not-found');
        fitMode.current = 'manual';
        if (interactionSequence.current === interactionAtStart && savedPoint) {
          setView(current => ({ ...current, ...savedPoint }));
        }
        return;
      }
      setCountryBounds(bounds);
      setFocusState('available');
      if (interactionSequence.current !== interactionAtStart) return;
      const next = fitCountryBounds(bounds, mapSize.width, mapSize.height);
      setView(next);
    }).catch(() => {
      if (requestSequence.current !== requestId) return;
      setCountryBounds(null);
      setFocusState('error');
      fitMode.current = 'manual';
      if (interactionSequence.current === interactionAtStart && savedPoint) {
        setView(current => ({ ...current, ...savedPoint }));
      }
    });
    return () => { requestSequence.current += 1; };
    // Moving/editing a marker must not restart the country lookup or reset zoom.
  }, [normalizedCountry, retryCount]);

  const center = useMemo(() => tilePoint(view.latitude, view.longitude, view.zoom), [view]);
  const tileX = Math.floor(center.x);
  const tileY = Math.floor(center.y);
  const centerOffsetX = (center.x - tileX + 1) * 256;
  const centerOffsetY = (center.y - tileY + 1) * 256;
  const origin = value.latitude != null && value.longitude != null
    ? tilePoint(value.latitude, value.longitude, view.zoom)
    : null;
  const markerPoints = points.map(point => ({ point, projected: tilePoint(point.latitude, point.longitude, view.zoom) }));
  const searchPoint = focusedPlace && tilePoint(focusedPlace.latitude, focusedPlace.longitude, view.zoom);

  function markManualInteraction() {
    interactionSequence.current += 1;
    fitMode.current = 'manual';
  }

  function adjustZoom(step: 1 | -1) {
    markManualInteraction();
    setView(current => ({ ...current, zoom: clamp(current.zoom + step, 0, 19) }));
  }

  function moveMarker(marker: Marker, latitude: number, longitude: number) {
    markManualInteraction();
    if (marker.kind === 'origin') onChange({ ...value, latitude, longitude });
    else onChange({ ...value, productionPoints: points.map(point => point.id === marker.id ? { ...point, latitude, longitude } : point) });
  }

  function mapClick(event: MouseEvent<HTMLDivElement>) {
    // The browser also emits click after a drag. Never treat that as a new
    // geographical position; only a fresh stationary click may move a marker.
    if (suppressClick.current) { suppressClick.current = false; return; }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = center.x + (event.clientX - rect.left - rect.width / 2) / 256;
    const y = center.y + (event.clientY - rect.top - rect.height / 2) / 256;
    const location = coordinates(x, y, view.zoom);
    moveMarker(selected, location.latitude, location.longitude);
  }

  function startPan(event: PointerEvent<HTMLDivElement>) {
    if (disabled || !event.isPrimary || event.button !== 0 || (event.target as HTMLElement).closest('button,a')) return;
    markManualInteraction();
    suppressClick.current = false;
    gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, center, zoom: view.zoom, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pan(event: PointerEvent<HTMLDivElement>) {
    const active = gesture.current;
    if (disabled || !active || active.pointerId !== event.pointerId) return;
    const dx = event.clientX - active.x, dy = event.clientY - active.y;
    if (!active.moved && Math.hypot(dx, dy) < 5) return;
    active.moved = true;
    suppressClick.current = true;
    setPanning(true);
    setView({ ...coordinates(active.center.x - dx / 256, active.center.y - dy / 256, active.zoom), zoom: active.zoom });
  }

  function endPan(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    suppressClick.current = active.moved || cancelled;
    gesture.current = null;
    setPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  useEffect(() => {
    if (!disabled || !gesture.current) return;
    const id = gesture.current.pointerId;
    gesture.current = null;
    suppressClick.current = true;
    setPanning(false);
    if (mapRef.current?.hasPointerCapture(id)) mapRef.current.releasePointerCapture(id);
  }, [disabled]);

  function focusCountry() {
    if (!countryBounds) return;
    markManualInteraction();
    setFocusedPlace(null);
    fitMode.current = 'country';
    setView(fitCountryBounds(countryBounds, mapSize.width, mapSize.height));
  }

  function focusMarker(marker: Marker) {
    markManualInteraction();
    setFocusedPlace(null);
    setSelected(marker);
    const point = marker.kind === 'origin'
      ? value.latitude != null && value.longitude != null ? { latitude: value.latitude, longitude: value.longitude } : null
      : points.find(item => item.id === marker.id) || null;
    if (point) setView(current => ({ ...current, latitude: point.latitude, longitude: point.longitude }));
  }

  function focusPlace(place: MapPlace) {
    if (disabled) return;
    markManualInteraction();
    setFocusedPlace(place);
    setView({ latitude: clamp(place.latitude, -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE),
      longitude: place.longitude, zoom: localityZoom(place.type) });
    mapRef.current?.scrollIntoView({ block: 'nearest' });
  }

  const diagnosticCountry = normalizedCountry || '';
  const statusMessage = focusState === 'loading'
    ? `Ищем страну «${normalizedCountry}» в локальной карте…`
    : focusState === 'not-found'
      ? `Страна «${normalizedCountry}» не найдена в локальной карте. Существующие координаты не изменены.`
      : focusState === 'error'
        ? 'Не удалось загрузить локальную карту стран. Координаты и маркеры сохранены без изменений.'
        : '';

  return <section className="min-w-0 max-w-full space-y-3 overflow-hidden rounded-md border border-[#d9d7ca] bg-[#f5f3eb] p-3" data-testid="cheese-geo-editor">
    <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
      <div className="min-w-0"><h3 className="font-serif text-lg">География сыра</h3><p className="text-xs leading-5 text-[#718075]">Перетаскивайте карту и меняйте масштаб кнопками + и −: координаты точек не изменятся. Чтобы перенести точку, выберите её и нажмите на карту или введите координаты. Alt + стрелки перемещают карту.</p></div>
      <div className="flex shrink-0 flex-wrap justify-start gap-2 sm:justify-end">
        <Button type="button" size="sm" variant="outline" disabled={disabled || points.length >= 20} onClick={() => {
          const point = {
            id: crypto.randomUUID(),
            label: `Производство ${points.length + 1}`,
            latitude: value.latitude ?? view.latitude,
            longitude: value.longitude ?? view.longitude,
          };
          markManualInteraction();
          onChange({ ...value, productionPoints: [...points, point] });
          setSelected({ kind: 'production', id: point.id });
          setView(current => ({ ...current, latitude: point.latitude, longitude: point.longitude }));
        }}><Plus className="mr-1 h-4 w-4" />Точка производства</Button>
      </div>
    </div>
    <div className="flex flex-wrap gap-2 text-xs">
      <button type="button" disabled={disabled} onClick={() => focusMarker({ kind: 'origin' })} className={`rounded-full border px-3 py-1.5 ${selected.kind === 'origin' ? 'border-[#315647] bg-[#315647] text-white' : 'border-[#c9cbbf] bg-[#fbfaf6] text-[#53645a]'}`}>Происхождение</button>
      {points.map((point, index) => <button key={point.id} type="button" disabled={disabled} onClick={() => focusMarker({ kind: 'production', id: point.id })} className={`rounded-full border px-3 py-1.5 ${selected.kind === 'production' && selected.id === point.id ? 'border-[#a05d41] bg-[#a05d41] text-white' : 'border-[#c9cbbf] bg-[#fbfaf6] text-[#53645a]'}`}>Производство {index + 1}</button>)}
    </div>
    {statusMessage && <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#d9d7ca] bg-[#fbfaf6] px-3 py-2 text-xs text-[#53645a]" role={focusState === 'loading' ? 'status' : 'alert'}>
      <span>{statusMessage}</span>
      {focusState === 'error' && <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setRetryCount(count => count + 1)}>Повторить</Button>}
    </div>}
    <CheeseMapSearch disabled={disabled} focusedId={focusedPlace?.id} onFocus={focusPlace} />
    <div ref={mapRef} role="application" aria-label="Карта координат. Перетаскивайте для просмотра. Нажмите, чтобы переместить выбранную точку. Alt и стрелки перемещают карту." aria-disabled={disabled} tabIndex={disabled ? -1 : 0}
      onPointerDown={startPan} onPointerMove={pan} onPointerUp={event => endPan(event)}
      onPointerCancel={event => endPan(event, true)} onLostPointerCapture={event => endPan(event, true)}
      style={{ touchAction: 'none' }} onClick={disabled ? undefined : mapClick} onKeyDown={event => {
      if (disabled || event.target !== event.currentTarget) return;
      if (event.altKey) {
        const delta = { ArrowUp: [0, -64], ArrowDown: [0, 64], ArrowLeft: [-64, 0], ArrowRight: [64, 0] }[event.key];
        if (delta) {
          event.preventDefault();
          markManualInteraction();
          setView({ ...coordinates(center.x + delta[0] / 256, center.y + delta[1] / 256, view.zoom), zoom: view.zoom });
        }
        return;
      }
      const step = event.shiftKey ? 1 : 0.1;
      const active = selected.kind === 'origin'
        ? value.latitude == null || value.longitude == null ? null : { latitude: value.latitude, longitude: value.longitude }
        : points.find(point => point.id === selected.id);
      if (!active) return;
      const delta = { ArrowUp: [step, 0], ArrowDown: [-step, 0], ArrowLeft: [0, -step], ArrowRight: [0, step] }[event.key];
      if (delta) { event.preventDefault(); moveMarker(selected, clamp(active.latitude + delta[0], -90, 90), clamp(active.longitude + delta[1], -180, 180)); }
    }} className={`relative isolate h-56 select-none overflow-hidden rounded border border-[#c9cbbf] bg-[#e6e7d9] outline-none focus-visible:ring-2 focus-visible:ring-[#315647] ${disabled ? 'cursor-not-allowed opacity-60' : panning ? 'cursor-grabbing' : 'cursor-grab'}`}
      data-testid="cheese-map-country-focus"
      data-country={diagnosticCountry}
      data-center-latitude={view.latitude}
      data-center-longitude={view.longitude}
      data-zoom={view.zoom}
      data-country-focus-state={focusState}>
      <div className="absolute grid h-[768px] w-[768px] grid-cols-3 grid-rows-3" style={{ left: `calc(50% - ${centerOffsetX}px)`, top: `calc(50% - ${centerOffsetY}px)` }} aria-hidden="true">
        {Array.from({ length: 9 }, (_, index) => {
          const rawX = tileX + (index % 3) - 1;
          const x = wrappedTileX(rawX, view.zoom);
          const y = tileY + Math.floor(index / 3) - 1;
          return y < 0 || y >= 2 ** view.zoom
            ? <div key={`${rawX}-${y}`} className="bg-[#e6e7d9]" style={{ width: 256, height: 256 }} />
            : <img key={`${rawX}-${y}`} data-map-tile="true" draggable={false} className="max-w-none" style={{ width: 256, height: 256 }} src={`https://tile.openstreetmap.org/${view.zoom}/${x}/${y}.png`} alt="" />;
        })}
      </div>
      <div className="absolute inset-0">
        {searchPoint && <span aria-hidden="true" data-testid="cheese-map-located-place" className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1 text-[#395b87] shadow" style={{
          left: `calc(50% + ${wrappedTileDelta(searchPoint.x, center.x, view.zoom) * 256}px)`,
          top: `calc(50% + ${(searchPoint.y - center.y) * 256}px)`,
        }}><LocateFixed className="h-4 w-4" /></span>}
        {origin && <button type="button" disabled={disabled} title="Точка происхождения" aria-label="Выбрать точку происхождения" onClick={event => { event.stopPropagation(); focusMarker({ kind: 'origin' }); }} className="absolute z-10 -translate-x-1/2 -translate-y-full text-[#315647]" style={{ left: `calc(50% + ${wrappedTileDelta(origin.x, center.x, view.zoom) * 256}px)`, top: `calc(50% + ${(origin.y - center.y) * 256}px)` }}><MapPin className="h-7 w-7 fill-[#f7f4e9] drop-shadow" /></button>}
        {markerPoints.map(({ point, projected }, index) => <button key={point.id} type="button" disabled={disabled} title={point.label} aria-label={`Выбрать точку производства ${point.label}`} onClick={event => { event.stopPropagation(); focusMarker({ kind: 'production', id: point.id }); }} className="absolute z-10 -translate-x-1/2 -translate-y-full text-[#a05d41]" style={{ left: `calc(50% + ${wrappedTileDelta(projected.x, center.x, view.zoom) * 256}px)`, top: `calc(50% + ${(projected.y - center.y) * 256}px)` }}><MapPin className="h-7 w-7 fill-[#fbfaf6] drop-shadow" /><span className="absolute left-1/2 top-1 -translate-x-1/2 text-[9px] font-bold text-[#a05d41]">{index + 1}</span></button>)}
      </div>
      <div role="group" aria-label="Масштаб карты" data-testid="cheese-map-zoom"
        className="absolute left-2 top-2 z-20 flex cursor-default flex-col rounded-md border border-[#c9cbbf] bg-white text-[#315647] shadow-sm"
        onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
        <button type="button" aria-label="Увеличить масштаб карты" title="Увеличить масштаб карты"
          disabled={disabled || view.zoom >= 19} onClick={() => adjustZoom(1)}
          className="grid h-11 w-11 touch-manipulation place-items-center rounded-t-md hover:bg-[#eef2ec] focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#315647] disabled:opacity-40">
          <Plus className="h-5 w-5" aria-hidden="true" />
        </button>
        <button type="button" aria-label="Уменьшить масштаб карты" title="Уменьшить масштаб карты"
          disabled={disabled || view.zoom <= 0} onClick={() => adjustZoom(-1)}
          className="grid h-11 w-11 touch-manipulation place-items-center rounded-b-md border-t border-[#d9d7ca] hover:bg-[#eef2ec] focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#315647] disabled:opacity-40">
          <Minus className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-[#fbfaf6]/90 px-1.5 py-1 text-[10px] text-[#53645a]"><a className="pointer-events-auto underline underline-offset-2" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()}>© OpenStreetMap contributors</a> · перетаскивайте карту для просмотра; нажмите для переноса точки</span>
    </div>
    {countryBounds && focusState === 'available' && <div className="flex justify-end">
      <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={focusCountry}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Вернуться к стране происхождения</Button>
    </div>}
    <div className="space-y-3">
      <CoordinateRow label="Происхождение" latitude={value.latitude} longitude={value.longitude} disabled={disabled} onChange={(latitude, longitude) => {
        markManualInteraction();
        onChange({ ...value, latitude, longitude });
      }} />
      {points.map(point => <div key={point.id} className="space-y-2 rounded border border-[#deddd2] bg-[#fbfaf6] p-2.5">
        <div className="flex gap-2"><Input aria-label="Название точки производства" value={point.label} maxLength={200} disabled={disabled} onChange={event => onChange({ ...value, productionPoints: points.map(item => item.id === point.id ? { ...item, label: event.target.value } : item) })} /><Button type="button" size="icon" variant="ghost" disabled={disabled} aria-label={`Удалить ${point.label}`} onClick={() => { onChange({ ...value, productionPoints: points.filter(item => item.id !== point.id) }); if (selected.kind === 'production' && selected.id === point.id) setSelected({ kind: 'origin' }); }}><Trash2 className="h-4 w-4 text-[#9d4d3f]" /></Button></div>
        <CoordinateRow label="Производство" latitude={point.latitude} longitude={point.longitude} disabled={disabled} onChange={(latitude, longitude) => {
          if (latitude !== null && longitude !== null) {
            markManualInteraction();
            onChange({ ...value, productionPoints: points.map(item => item.id === point.id ? { ...item, latitude, longitude } : item) });
          }
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
