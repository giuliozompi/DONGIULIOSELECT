export type GeoPosition = [number, number, ...number[]];
export type GeoPolygon = GeoPosition[][];
export type CountryFeature = {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry:
    | { type: 'Polygon'; coordinates: GeoPolygon }
    | { type: 'MultiPolygon'; coordinates: GeoPolygon[] };
};

const diacritics = new RegExp('\\p{M}', 'gu');
const separators = new RegExp('[^\\p{L}\\p{N}]+', 'gu');
export function normalizeCountryName(value: string) {
  return value.normalize('NFKD').replace(diacritics, '').toLowerCase()
    .replace(separators, ' ').trim();
}

// Only names with an unambiguous present-day equivalent. A dissolved state
// with multiple successors (e.g. USSR) is resolved by the saved point instead.
const aliases: Record<string, string[]> = {
  RU: ['РФ', 'Российская Федерация', 'Russia', 'РСФСР', 'RSFSR'],
  GB: ['UK', 'Соединённое Королевство', 'United Kingdom'],
  NL: ['Голландия', 'Holland'],
  US: ['США', 'USA', 'Соединённые Штаты', 'United States of America'],
  CZ: ['Чешская Республика', 'Czech Republic', 'Repubblica Ceca'],
  DE: ['ФРГ', 'ГДР', 'Германская Демократическая Республика', 'East Germany', 'West Germany', 'DDR', 'RDT'],
  BY: ['Белоруссия', 'Белорусская ССР', 'Belorussia', 'Byelorussia'],
  UA: ['Украинская ССР'],
  GE: ['Грузинская ССР', 'Sakartvelo', 'Сакартвело'],
  AM: ['Армянская ССР'],
  AZ: ['Азербайджанская ССР'],
  KZ: ['Казахская ССР'],
  KG: ['Киргизская ССР', 'Киргизия'],
  MD: ['Молдавская ССР', 'Молдавия'],
  UZ: ['Узбекская ССР'],
  TJ: ['Таджикская ССР'],
  TM: ['Туркменская ССР', 'Туркмения'],
  EE: ['Эстонская ССР'],
  LV: ['Латвийская ССР'],
  LT: ['Литовская ССР'],
  LK: ['Цейлон', 'Ceylon', 'Ceylan'],
  MM: ['Бирма', 'Burma', 'Birmanie'],
  SZ: ['Свазиленд', 'Swaziland'],
  CD: ['Заир', 'Zaire', 'Congo-Kinshasa'],
  MK: ['Македония', 'FYROM', 'Бывшая югославская Республика Македония'],
  TH: ['Сиам', 'Siam'],
  IR: ['Персия', 'Persia', 'Perse'],
  TL: ['Тимор-Лешти', 'Timor-Leste', 'East Timor'],
  BF: ['Верхняя Вольта', 'Upper Volta', 'Haute-Volta', 'Alto Volta'],
  BJ: ['Дагомея', 'Dahomey'],
  KH: ['Кампучия', 'Kampuchea'],
  TR: ['Türkiye', 'Turkey'],
};

export function createCountryIndex(features: CountryFeature[]) {
  const names = new Map<string, CountryFeature>();
  const codes = new Map<string, CountryFeature>();
  for (const feature of features) {
    for (const [key, value] of Object.entries(feature.properties)) {
      if (typeof value !== 'string' || !value.trim() || value === '-99') continue;
      const normalized = normalizeCountryName(value);
      if (/^ISO_(?:A2|A3|N3)(?:_EH)?$/i.test(key)) codes.set(normalized, feature);
      if (/^NAME(?:_|$)|^FORMAL_/i.test(key) && !names.has(normalized)) names.set(normalized, feature);
    }
  }
  for (const [code, values] of Object.entries(aliases)) {
    const feature = codes.get(code.toLowerCase());
    if (feature) for (const value of values) names.set(normalizeCountryName(value), feature);
  }
  return (value: string) => {
    const key = normalizeCountryName(value);
    return codes.get(key) || names.get(key) || null;
  };
}

export const countryPolygons = (feature: CountryFeature): GeoPolygon[] =>
  feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;

type Point = { latitude: number; longitude: number };
export function createTodayCountryResolver(features: CountryFeature[]) {
  const match = createCountryIndex(features);
  // Precompute ring bounds once; a search needs ray casting only in nearby polygons.
  // The source splits polygons at the antimeridian, so ±180 are equivalent edges.
  const shapes = features.flatMap(feature => countryPolygons(feature).filter(polygon => polygon[0]?.length > 2)
    .map(polygon => {
      let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
      for (const [lon, lat] of polygon[0]) {
        west = Math.min(west, lon); east = Math.max(east, lon);
        south = Math.min(south, lat); north = Math.max(north, lat);
      }
      return { feature, polygon, west, east, south, north };
    }));
  const label = (feature: CountryFeature) => String(feature.properties.NAME_RU || feature.properties.NAME);
  return (storedCountry: string, point?: Point) => {
    const namedCountry = match(storedCountry);
    if (namedCountry) return label(namedCountry);
    if (!point || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)
      || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) return storedCountry;
    const { latitude, longitude } = point;
    const candidates = new Set<CountryFeature>();
    for (const { feature, polygon, west, east, south, north } of shapes) {
      if (latitude < south || latitude > north) continue;
      const longitudes = Math.abs(longitude) === 180 ? [-180, 180] : [longitude];
      if (longitudes.some(lon => lon >= west && lon <= east && insideRing(polygon[0], lon, latitude)
        && !polygon.slice(1).some(hole => insideRing(hole, lon, latitude)))) candidates.add(feature);
    }
    return candidates.size === 1 ? label(Array.from(candidates)[0]) : storedCountry;
  };
}

export function pointInGeoFeature(feature: CountryFeature, point: Point) {
  const { latitude, longitude } = point;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return false;
  const longitudes = Math.abs(longitude) === 180 ? [-180, 180] : [longitude];
  return countryPolygons(feature).some(polygon => polygon[0]?.length > 2 && longitudes.some(lon =>
    insideRing(polygon[0], lon, latitude) && !polygon.slice(1).some(hole => insideRing(hole, lon, latitude))));
}

function insideRing(ring: GeoPosition[], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j], [bx, by] = ring[i];
    const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
    if (Math.abs(cross) < 1e-10 && x >= Math.min(ax, bx) && x <= Math.max(ax, bx)
      && y >= Math.min(ay, by) && y <= Math.max(ay, by)) return true;
    if ((ay > y) !== (by > y) && x < ax + (bx - ax) * (y - ay) / (by - ay)) inside = !inside;
  }
  return inside;
}
