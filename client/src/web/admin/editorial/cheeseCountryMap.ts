import { countryPolygons, createCountryIndex, type CountryFeature, type GeoPolygon } from '../../../../../shared/editorial-geography';
export type { CountryFeature, GeoPosition } from '../../../../../shared/editorial-geography';
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

const indexes = new WeakMap<CountryFeature[], ReturnType<typeof createCountryIndex>>();
export function matchCountryFeature(features: CountryFeature[], country: string): CountryFeature | null {
  let match = indexes.get(features);
  if (!match) { match = createCountryIndex(features); indexes.set(features, match); }
  return match(country);
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
  const polygons = countryPolygons(feature).filter(polygon => polygon[0]?.length);
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

/** France focuses on metropolitan territory, including Corsica, in both maps. */
function isFrance(feature: CountryFeature) {
  return feature.properties.ISO_A2_EH === 'FR' || feature.properties.ISO_A2 === 'FR';
}

/** The atlas fits the entire country except France's overseas territories. */
export function getCountryBounds(feature: CountryFeature, includeAllTerritories = false): CountryBounds | null {
  const polygons = isFrance(feature)
    ? countryPolygons(feature).filter(polygon => polygon[0]?.length && polygon[0].every(
      ([longitude, latitude]) => longitude >= -6 && longitude <= 10 && latitude >= 41 && latitude <= 52))
    : includeAllTerritories ? countryPolygons(feature) : chooseCountryPolygons(feature);
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
