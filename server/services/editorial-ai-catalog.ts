import type { pool } from '../db';
import { editorialAiCountries, type CatalogResult } from '../../shared/editorial-ai';

const diacritics = new RegExp('\\p{M}', 'gu');
const separators = new RegExp('[^\\p{L}\\p{N}]+', 'gu');
export const normalizedCheeseName = (text: string) => text.normalize('NFKD').replace(diacritics, '')
  .toLocaleLowerCase('ru-RU').replace(separators, ' ').trim();

const english = new Intl.DisplayNames(['en'], { type: 'region' });
const countryCodes = new Map(editorialAiCountries.flatMap(({ code, name }) =>
  [code, name, english.of(code) ?? code].map(alias => [normalizedCheeseName(alias), code] as const)));

type CatalogIdentity = {
  id: string;
  title: string;
  nameOriginal: string;
  country: string;
  nameKeys: string[];
};

async function catalogIdentities(database: Pick<typeof pool, 'query'>) {
  // Read every editorial state. Keep the published identity too: an editor
  // can rename the working copy without changing its live publication.
  const { rows } = await database.query<CatalogIdentity>(`
    SELECT id, data->>'title' AS title, COALESCE(data->>'nameOriginal', '') AS "nameOriginal",
      data->>'country' AS country, '[]'::jsonb AS "nameKeys"
      FROM editorial_entries WHERE kind='cheese'
    UNION ALL
    SELECT entry_id, data->>'title', COALESCE(data->>'nameOriginal', ''),
      data->>'country', '[]'::jsonb FROM editorial_publications WHERE kind='cheese'
    UNION ALL
    SELECT e.id, e.data->>'title', '', i.country_code, i.name_keys
      FROM editorial_ai_imports i JOIN editorial_entries e ON e.id=i.entry_id
  `);
  return rows;
}

export async function catalogExclusions(countries: string[], database: Pick<typeof pool, 'query'>) {
  const selected = new Set(countries);
  const exclusions = new Set<string>();
  const limit = 10_000; // Bound prompt size; database matching below is never capped.
  let size = 0;
  const groups = (await catalogIdentities(database)).map(row => ({
    row, code: countryCodes.get(normalizedCheeseName(row.country)),
  }));
  const relevant = [...groups.filter(group => group.code && selected.has(group.code)),
    ...groups.filter(group => !group.code)]; // Historical origins, after the selected countries.
  for (const { row } of relevant) {
    for (const raw of [row.title, row.nameOriginal, ...row.nameKeys]) {
      const name = raw?.trim();
      if (!name || !normalizedCheeseName(name) || exclusions.has(name) || name.length > 200
          || size + JSON.stringify(name).length + 1 > limit) continue;
      exclusions.add(name);
      size += JSON.stringify(name).length + 1;
    }
  }
  return Array.from(exclusions);
}

export async function catalogMatches(result: CatalogResult, database: Pick<typeof pool, 'query'>): Promise<CatalogResult> {
  if (!result.items.length) return result;
  const rows = (await catalogIdentities(database)).map(row => ({
    id: row.id,
    title: row.title,
    countryCode: countryCodes.get(normalizedCheeseName(row.country)),
    original: normalizedCheeseName(row.nameOriginal),
    keys: [row.title, row.nameOriginal, ...row.nameKeys].filter(Boolean).map(normalizedCheeseName).filter(Boolean),
  }));
  return { ...result, items: result.items.map(item => {
    const original = normalizedCheeseName(item.nameOriginal);
    const keys = [original, normalizedCheeseName(item.titleRu)].filter(Boolean);
    const matches = new Map<string, { id: string; title: string }>();
    for (const row of rows) {
      // The same original designation is already represented, even if its
      // origin is recorded under an obsolete name or disputed. Localized
      // homonyms alone are not enough to match entries from distinct countries.
      if ((original && row.original === original) ||
          ((!row.countryCode || row.countryCode === item.countryCode) && row.keys.some(key => keys.includes(key)))) {
        if (!matches.has(row.id)) matches.set(row.id, { id: row.id, title: row.title });
      }
    }
    return { ...item, matches: Array.from(matches.values()) };
  }) };
}
