export type GeoPosition = [number, number, ...number[]];
export type GeoPolygon = GeoPosition[][];
export type CountryGeometry =
  | { type: 'Polygon'; coordinates: GeoPolygon }
  | { type: 'MultiPolygon'; coordinates: GeoPolygon[] };
export type CountryFeature = {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: CountryGeometry;
};
export type CountryBounds = {
  south: number;
  north: number;
  west: number;
  east: number;
  centerLongitude: number;
  longitudeSpan: number;
};
export type MapFit = { latitude: number; longitude: number; zoom: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const MAX_MERCATOR_LATITUDE = 85.0511287798066;

function normalizeCountryName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('ru')
    .replace(/[ё]/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const explicitAliases: Record<string, string[]> = {
  [normalizeCountryName('РФ')]: ['RU'],
  [normalizeCountryName('Россия')]: ['RU'],
  [normalizeCountryName('Российская Федерация')]: ['RU'],
  [normalizeCountryName('UK')]: ['GB'],
  [normalizeCountryName('Великобритания')]: ['GB'],
  [normalizeCountryName('Соединённое Королевство')]: ['GB'],
  [normalizeCountryName('USA')]: ['US'],
  [normalizeCountryName('США')]: ['US'],
  [normalizeCountryName('Соединённые Штаты')]: ['US'],
};

function featureNames(feature: CountryFeature): Set<string> {
  const names = new Set<string>();
  for (const [key, raw] of Object.entries(feature.properties)) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    if (/^NAME(?:_|$)|^FORMAL_/i.test(key)) {
      names.add(normalizeCountryName(raw));
    }
  }
  return names;
}

function featureCodes(feature: CountryFeature): Set<string> {
  return new Set(Object.entries(feature.properties)
    .filter(([key, value]) => /^ISO_(?:A2|A3|N3)(?:_EH)?$/i.test(key) && typeof value === 'string')
    .map(([, value]) => String(value).trim().toUpperCase())
    .filter(value => value && value !== '-99'));
}

/** Exact normalized name/code matching only; no substring or fuzzy guesses. */
export function matchCountryFeature(features: CountryFeature[], country: string): CountryFeature | null {
  const normalized = normalizeCountryName(country);
  if (!normalized) return null;
  const aliases = explicitAliases[normalized] || [];
  const code = country.trim().toUpperCase();
  return features.find(feature =>
    featureNames(feature).has(normalized) ||
    featureCodes(feature).has(code) ||
    aliases.some(alias => featureCodes(feature).has(alias)),
  ) || null;
}

function allPolygons(feature: CountryFeature): GeoPolygon[] {
  if (feature.geometry.type === 'Polygon') return [feature.geometry.coordinates];
  if (feature.geometry.type === 'MultiPolygon') return feature.geometry.coordinates;
  return [];
}

function featureLabel(feature: CountryFeature): [number, number] | null {
  const x = Number(feature.properties.LABEL_X);
  const y = Number(feature.properties.LABEL_Y);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
}

function wrappedLongitudeDelta(a: number, b: number): number {
  return ((a - b + 540) % 360) - 180;
}

function polygonCenter(polygon: GeoPolygon): [number, number] | null {
  const points = polygon[0] || [];
  if (!points.length) return null;
  let lat = 0;
  let sin = 0;
  let cos = 0;
  for (const point of points) {
    lat += point[1];
    const radians = point[0] * Math.PI / 180;
    sin += Math.sin(radians);
    cos += Math.cos(radians);
  }
  return [Math.atan2(sin, cos) * 180 / Math.PI, lat / points.length];
}

function chooseCountryPolygons(feature: CountryFeature): GeoPolygon[] {
  const polygons = allPolygons(feature).filter(polygon => polygon[0]?.length);
  if (polygons.length <= 1) return polygons;
  const label = featureLabel(feature);
  if (!label) return [polygons.reduce((largest, current) =>
    current[0].length > largest[0].length ? current : largest)];

  const ranked = polygons.map(polygon => {
    const center = polygonCenter(polygon);
    if (!center) return { polygon, distance: Infinity, containsLabel: false };
    const xs = polygon[0].map(point => point[0]);
    const ys = polygon[0].map(point => point[1]);
    const containsLabel = label[0] >= Math.min(...xs) && label[0] <= Math.max(...xs) &&
      label[1] >= Math.min(...ys) && label[1] <= Math.max(...ys);
    const distance = Math.hypot(wrappedLongitudeDelta(center[0], label[0]) * Math.cos(label[1] * Math.PI / 180), center[1] - label[1]);
    return { polygon, distance: containsLabel ? 0 : distance, containsLabel };
  }).sort((a, b) => a.distance - b.distance);

  // Keep the label's landmass and nearby islands (Fiji), while excluding distant
  // overseas territories (for example French Guiana and Réunion from France).
  const selected = ranked.filter(item => item.containsLabel || item.distance <= 22).map(item => item.polygon);
  return selected.length ? selected : [ranked[0].polygon];
}

function minimalLongitudeArc(longitudes: number[]): { center: number; span: number; west: number; east: number } {
  const values = longitudes.map(value => ((value % 360) + 360) % 360).sort((a, b) => a - b);
  if (values.length === 1) {
    const longitude = ((values[0] + 180) % 360) - 180;
    return { center: longitude, span: 0, west: longitude, east: longitude };
  }
  let largestGap = -1;
  let gapIndex = 0;
  for (let index = 0; index < values.length; index += 1) {
    const next = index === values.length - 1 ? values[0] + 360 : values[index + 1];
    const gap = next - values[index];
    if (gap > largestGap) { largestGap = gap; gapIndex = index; }
  }
  const start = values[(gapIndex + 1) % values.length];
  const span = Math.max(0, 360 - largestGap);
  const center = ((start + span / 2 + 180) % 360) - 180;
  const west = ((start + 180) % 360) - 180;
  const east = ((start + span + 180) % 360) - 180;
  return { center, span, west, east };
}

/** Bounds use the minimal circular longitude arc and label-near land components. */
export function getCountryBounds(feature: CountryFeature): CountryBounds | null {
  const polygons = chooseCountryPolygons(feature);
  const positions = polygons.flatMap(polygon => polygon.flat());
  if (!positions.length) return null;
  const longitudes: number[] = [];
  let south = Infinity;
  let north = -Infinity;
  for (const [longitude, latitude] of positions) {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;
    longitudes.push(longitude);
    south = Math.min(south, latitude);
    north = Math.max(north, latitude);
  }
  if (!longitudes.length || !Number.isFinite(south) || !Number.isFinite(north)) return null;
  const arc = minimalLongitudeArc(longitudes);
  return {
    south,
    north,
    west: arc.west,
    east: arc.east,
    centerLongitude: arc.center,
    longitudeSpan: arc.span,
  };
}

function mercatorY(latitude: number): number {
  const safe = clamp(latitude, -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE) * Math.PI / 180;
  return (1 - Math.asinh(Math.tan(safe)) / Math.PI) / 2;
}

function inverseMercatorY(y: number): number {
  return Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI;
}

/** Fits a country into the available map area; integer OSM zoom never clips bounds. */
export function fitCountryBounds(
  bounds: CountryBounds,
  width: number,
  height: number,
  padding = 28,
  maxZoom = 9,
): MapFit {
  const availableWidth = Math.max(80, width - padding * 2);
  const availableHeight = Math.max(80, height - padding * 2);
  const xSpan = Math.max(bounds.longitudeSpan / 360, 1 / 256);
  const yTop = mercatorY(bounds.north);
  const yBottom = mercatorY(bounds.south);
  const ySpan = Math.max(Math.abs(yBottom - yTop), 1 / 256);
  const zoomX = Math.log2(availableWidth / (256 * xSpan));
  const zoomY = Math.log2(availableHeight / (256 * ySpan));
  const zoom = clamp(Math.floor(Math.min(zoomX, zoomY, maxZoom)), 0, maxZoom);
  const centerY = (yTop + yBottom) / 2;
  return {
    latitude: inverseMercatorY(centerY),
    longitude: bounds.centerLongitude,
    zoom,
  };
}

let worldFeaturesPromise: Promise<CountryFeature[]> | null = null;

/** Same-origin GeoJSON fetch, shared across editor instances; failures may be retried. */
export function loadWorldCountryFeatures(): Promise<CountryFeature[]> {
  if (!worldFeaturesPromise) {
    worldFeaturesPromise = fetch('/editorial/world.geojson')
      .then(response => {
        if (!response.ok) throw new Error(`GeoJSON недоступен: ${response.status}`);
        return response.json();
      })
      .then(data => {
        if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
          throw new Error('Некорректная коллекция стран');
        }
        return data.features.filter((feature: CountryFeature) =>
          feature?.type === 'Feature' && feature.properties && feature.geometry &&
          ['Polygon', 'MultiPolygon'].includes(feature.geometry.type),
        );
      })
      .catch(error => {
        worldFeaturesPromise = null;
        throw error;
      });
  }
  return worldFeaturesPromise;
}
