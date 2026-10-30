// Explicit research command only; never invoked by startup, build or deployment.
// Keeps retrieved source texts outside Git. No database writes or AI calls.
import { writeFile } from 'node:fs/promises';
import { retrieveEditorialSource, sourcePlainText } from '../../server/services/editorial-ai-sources.ts';
export const candidates = [
  { key: 'parmigiano', title: 'Пармиджано Реджано', original: 'Parmigiano Reggiano', region: 'Эмилия-Романья и Ломбардия', latitude: 44.80, longitude: 10.33,
    sources: ['https://www.parmigianoreggiano.com/faq', 'https://en.wikipedia.org/wiki/Parmigiano_Reggiano'], match: 'Пармиджано Реджано 24 месяца' },
  { key: 'gorgonzola', title: 'Горгонзола', original: 'Gorgonzola', region: 'Ломбардия и Пьемонт', latitude: 45.53, longitude: 9.40,
    sources: ['https://www.gorgonzola.com/', 'https://en.wikipedia.org/wiki/Gorgonzola'], match: 'Горгонзола Дольче' },
  { key: 'mozzarella', title: 'Моцарелла ди буфала кампана', original: 'Mozzarella di bufala', region: 'Кампания и соседние территории', latitude: 41.07, longitude: 14.33,
    sources: ['https://www.mozzarelladop.it/', 'https://en.wikipedia.org/wiki/Mozzarella_di_bufala'], match: 'Моцарелла Буффало' },
  { key: 'ricotta', title: 'Рикотта', original: 'Ricotta', region: '', latitude: 42.5, longitude: 12.5,
    sources: ['https://it.wikipedia.org/wiki/Ricotta', 'https://en.wikipedia.org/wiki/Ricotta'], match: 'Рикотта Фреска' },
  { key: 'grana', title: 'Грана Падано', original: 'Grana Padano', region: 'Северная Италия, Паданская равнина', latitude: 45.47, longitude: 10.54,
    sources: ['https://www.granapadano.it/', 'https://en.wikipedia.org/wiki/Grana_Padano'] },
  { key: 'taleggio', title: 'Таледжо', original: 'Taleggio', region: 'Ломбардия, Пьемонт и Венето', latitude: 45.89, longitude: 9.56,
    sources: ['https://www.taleggio.it/', 'https://en.wikipedia.org/wiki/Taleggio_cheese'] },
  { key: 'fontina', title: 'Фонтина', original: 'Fontina', region: 'Валле-д’Аоста', latitude: 45.74, longitude: 7.32,
    sources: ['https://www.regione.vda.it/agricoltura/prodotti_tipici/prodotti_dop/fontina_i.asp', 'https://en.wikipedia.org/wiki/Fontina'] },
  { key: 'asiago', title: 'Азиаго', original: 'Asiago cheese', region: 'Венето и Трентино-Альто-Адидже', latitude: 45.88, longitude: 11.51,
    sources: ['https://www.asiagocheese.it/', 'https://en.wikipedia.org/wiki/Asiago_cheese'] },
  { key: 'pecorino', title: 'Пекорино Романо', original: 'Pecorino romano', region: 'Сардиния, Лацио и провинция Гроссето', latitude: 41.90, longitude: 12.50,
    sources: ['https://www.pecorinoromano.com/', 'https://en.wikipedia.org/wiki/Pecorino_romano'] },
  { key: 'provolone', title: 'Проволоне', original: 'Provolone', region: '', latitude: 41.9, longitude: 12.3,
    sources: ['https://en.wikipedia.org/wiki/Provolone'] },
];
const clean = value => sourcePlainText(String(value || '')).replace(/\s+/g, ' ').trim();
async function photograph(term) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({ action: 'query', format: 'json', generator: 'search',
    gsrsearch: `"${term}" filetype:bitmap`, gsrnamespace: '6', gsrlimit: '5', prop: 'imageinfo',
    iiprop: 'url|extmetadata|mime|size', iiurlwidth: '800' });
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'DonGiulioEditorialPilot/1.0' } });
  if (!response.ok) throw Error(`Commons HTTP ${response.status}`);
  const data = await response.json();
  const choices = Object.values(data.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0)).flatMap(page => {
    const info = page.imageinfo?.[0], meta = info?.extmetadata || {};
    const license = clean(meta.LicenseShortName?.value), author = clean(meta.Artist?.value || meta.Attribution?.value);
    if (!info || !/^image\/(jpeg|png|webp)$/.test(info.mime) ||
      !/^(CC BY(?:-SA)? [1-4]\.0|CC0|Public domain)$/.test(license) || (/^CC BY/.test(license) && !author)) return [];
    const image = new URL(info.thumburl || info.url); image.search = '';
    return [{ title: page.title, imageUrl: image.href, sourceUrl: info.descriptionurl, license,
      licenseUrl: meta.LicenseUrl?.value || 'https://creativecommons.org/publicdomain/zero/1.0/',
      author: author || 'Автор не указан; общественное достояние', description: clean(meta.ImageDescription?.value), width: info.width }];
  });
  if (!choices.length) throw Error('No photograph with usable verified license metadata');
  return choices;
}
async function main() {
  const results = [];
  for (let index = 0; index < candidates.length; index += 2) {
    const batch = await Promise.all(candidates.slice(index, index + 2).map(async item => {
      const evidence = [], errors = [];
      for (const url of item.sources) {
        try { evidence.push(await retrieveEditorialSource(url)); }
        catch (error) { errors.push({ url, error: error.message }); }
      }
      let photos = [];
      try { photos = await photograph(item.original); } catch (error) { errors.push({ photo: error.message }); }
      console.log(JSON.stringify({ key: item.key, sources: evidence.length, photos: photos.length, errors }));
      return { ...item, evidence, photos, errors };
    }));
    results.push(...batch);
    await writeFile('/tmp/editorial-pilot-research.json', JSON.stringify(results));
  }
}
if (process.argv[1]?.endsWith('/research.mjs')) await main();
