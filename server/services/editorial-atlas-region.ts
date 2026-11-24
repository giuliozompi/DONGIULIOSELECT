import { readFile } from 'node:fs/promises';
import { atlasRegionCountries, type AtlasRegionCountry } from '../../shared/editorial-atlas-regions';
import type { CountryFeature } from '../../shared/editorial-geography';
import { EditorialError } from './editorial';

const cache = new Map<AtlasRegionCountry, Promise<CountryFeature[]>>();
export async function atlasRegionFeature(country: CountryFeature | null, id: string) {
  const code = [country?.properties.ISO_A2_EH, country?.properties.ISO_A2]
    .find(value => typeof value === 'string' && Object.hasOwn(atlasRegionCountries, value)) as AtlasRegionCountry | undefined;
  if (!code) throw new EditorialError(400, 'Для выбранной страны региональный фильтр недоступен.');
  let pending = cache.get(code);
  if (!pending) {
    pending = readFile(new URL(`./public/editorial/regions-v1/${code}.geojson`, import.meta.url), 'utf8')
      .catch(error => {
        if (error.code !== 'ENOENT') throw error;
        return readFile(new URL(`../../client/public/editorial/regions-v1/${code}.geojson`, import.meta.url), 'utf8');
      }).then(text => {
        const data = JSON.parse(text);
        if (data.type !== 'FeatureCollection' || !Array.isArray(data.features) || !data.features.length ||
          data.features.some((feature: CountryFeature) => feature?.type !== 'Feature'
            || typeof feature.properties?.id !== 'string'
            || !['Polygon', 'MultiPolygon'].includes(feature.geometry?.type)
            || !Array.isArray(feature.geometry.coordinates) || !feature.geometry.coordinates.length))
          throw new Error('Invalid atlas region boundaries');
        return data.features as CountryFeature[];
      }).catch(error => { cache.delete(code); throw error; });
    cache.set(code, pending);
  }
  const feature = (await pending).find(feature => feature.properties.id === id);
  if (!feature) throw new EditorialError(400, 'Регион не найден в выбранной стране.');
  return feature;
}
