import type { CountryFeature } from '@shared/editorial-geography';

export const atlasRegionCountries = {
  IT: 'Италия', FR: 'Франция', ES: 'Испания', NL: 'Нидерланды', CH: 'Швейцария',
  DE: 'Германия', AT: 'Австрия', GR: 'Греция', PT: 'Португалия', GB: 'Великобритания',
} as const;

type AtlasRegionCountry = keyof typeof atlasRegionCountries;
export type AtlasRegion = CountryFeature & { properties: { id: string; name: string } };
const byCountryName = new Map<string, AtlasRegionCountry>(
  Object.entries(atlasRegionCountries).map(([code, name]) => [name, code as AtlasRegionCountry]),
);

export function atlasRegionCountry(feature: CountryFeature | null, countryName: string) {
  // The French feature has ISO_A2=-99 and uses ISO_A2_EH instead.
  for (const code of [feature?.properties.ISO_A2_EH, feature?.properties.ISO_A2]) {
    if (typeof code === 'string' && Object.hasOwn(atlasRegionCountries, code)) return code as AtlasRegionCountry;
  }
  return byCountryName.get(countryName);
}

export async function loadAtlasRegions(country: AtlasRegionCountry, signal?: AbortSignal): Promise<AtlasRegion[]> {
  const response = await fetch(`/editorial/regions-v1/${country}.geojson`, { signal });
  if (!response.ok) throw new Error(`Границы регионов недоступны: ${response.status}`);
  const result = await response.json();
  if (result?.type !== 'FeatureCollection' || !Array.isArray(result.features) || !result.features.length) {
    throw new Error('Не удалось прочитать границы регионов');
  }
  const regions: AtlasRegion[] = result.features.filter((feature: AtlasRegion) =>
    feature?.type === 'Feature' && typeof feature.properties?.id === 'string' &&
    typeof feature.properties?.name === 'string' &&
    (feature.geometry?.type === 'MultiPolygon' || feature.geometry?.type === 'Polygon') &&
    Array.isArray(feature.geometry.coordinates) && feature.geometry.coordinates.length > 0);
  if (regions.length !== result.features.length) throw new Error('Некорректные границы регионов');
  return regions.sort((left, right) => left.properties.name.localeCompare(right.properties.name, 'ru'));
}
