import { readFile } from 'node:fs/promises';
import { createCountryIndex, createTodayCountryResolver, normalizeCountryName, pointInGeoFeature, type CountryFeature } from '../../shared/editorial-geography';
import { atlasRegionFeature } from './editorial-atlas-region';
import type { pool } from '../db';

type CountryRow = { id: string; country: string; latitude: string | null; longitude: string | null };
let geography: Promise<{ match: ReturnType<typeof createCountryIndex>; resolve: ReturnType<typeof createTodayCountryResolver> }> | undefined;

function loadGeography() {
  geography ??= readFile(new URL('./public/editorial/world.geojson', import.meta.url), 'utf8')
    .catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return readFile(new URL('../../client/public/editorial/world.geojson', import.meta.url), 'utf8');
    })
    .then(text => {
      const data = JSON.parse(text);
      if (data.type !== 'FeatureCollection' || !Array.isArray(data.features) || !data.features.length)
        throw new Error('Invalid atlas country boundaries');
      const features: CountryFeature[] = data.features;
      return { match: createCountryIndex(features), resolve: createTodayCountryResolver(features) };
    })
    .catch(error => { geography = undefined; throw error; });
  return geography;
}

export async function atlasCountryScope(database: typeof pool, country: string, search: string, region?: string) {
  const [{ resolve, match }, { rows }] = await Promise.all([
    loadGeography(),
    database.query<CountryRow>(`SELECT entry_id AS id, data->>'country' AS country,
      data->>'latitude' AS latitude, data->>'longitude' AS longitude
      FROM editorial_publications WHERE kind='cheese'`),
  ]);
  const chosen = normalizeCountryName(resolve(country));
  const boundary = region ? await atlasRegionFeature(match(resolve(country)), region) : undefined;
  const historicalFilter = Boolean(country && !match(country));
  const query = normalizeCountryName(search);
  const groupById = new Map<string, string>();
  const matchingCountryIds: string[] = [];
  const matchingSearchIds: string[] = [];
  for (const row of rows) {
    const group = resolve(row.country, row.latitude !== null && row.longitude !== null
      ? { latitude: Number(row.latitude), longitude: Number(row.longitude) } : undefined);
    groupById.set(row.id, group);
    // Current names group renamed countries; historical labels can still be
    // queried directly, and remain searchable even after a state was dissolved.
    const normalizedGroup = normalizeCountryName(group);
    const withinRegion = !boundary || (row.latitude !== null && row.longitude !== null &&
      pointInGeoFeature(boundary, { latitude: Number(row.latitude), longitude: Number(row.longitude) }));
    if (country && withinRegion && (normalizedGroup === chosen
      || (historicalFilter && normalizeCountryName(row.country) === chosen))) matchingCountryIds.push(row.id);
    if (query && normalizedGroup.includes(query)) matchingSearchIds.push(row.id);
  }
  return {
    groupById, matchingCountryIds: country ? matchingCountryIds : null, matchingSearchIds,
    countries: Array.from(new Set(groupById.values())).filter(Boolean).sort((a, b) => a.localeCompare(b, 'ru')),
  };
}
