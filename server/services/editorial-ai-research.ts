import { z } from 'zod';
import type { ResearchReport, DraftRequest } from '../../shared/editorial-ai';
import { EditorialModelError } from './editorial-ai-config';
import { retrieveEditorialSource, validateSourceUrl, EditorialSourceError, type SourceEvidence } from './editorial-ai-sources';
import { researchJson } from './editorial-research-http';
import { structuredResearchPlan, researchCoverage, sourceTopics } from './editorial-research-topics';
import { researchPhotos } from './editorial-research-photos';
import { cheeseIdentityContexts } from './editorial-cheese-identity';

export type ResearchIdentity = { title: string; nameOriginal?: string; country: string; region: string };
export type ResearchHit = { url: string; title: string; description: string };
export type ResearchDependencies = {
  search: (query: string) => Promise<ResearchHit[]>;
  source: (url: string) => Promise<SourceEvidence>;
};
const braveResponse = z.object({
  web: z.object({ results: z.array(z.object({
    url: z.string().max(2000), title: z.string().max(1000),
    description: z.string().max(10000).optional(),
  })) }).optional(),
  error: z.unknown().optional(),
});
export async function searchEditorialWeb(query: string, env = process.env, fetcher: typeof fetch = fetch): Promise<ResearchHit[]> {
  const key = env.BRAVE_API_KEY?.trim();
  if (!key) throw new EditorialModelError('Поиск не настроен: добавьте BRAVE_API_KEY в защищённые переменные Timeweb и перезапустите приложение.');
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.search = new URLSearchParams({ q: query.slice(0, 400), count: '5', result_filter: 'web',
    text_decorations: 'false', safesearch: 'moderate', operators: 'false' }).toString();
  try {
    const response = await fetcher(url, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': key },
      signal: AbortSignal.timeout(10_000), redirect: 'error',
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      const reason = response.status === 401 ? 'проверьте ключ'
        : response.status === 403 ? 'доступ запрещён; проверьте права плана и доступ с Timeweb'
        : response.status === 429 ? 'лимит запросов исчерпан'
        : response.status === 402 ? 'проверьте баланс и план' : 'ошибка сервиса поиска';
      throw new EditorialModelError(`Brave Search: HTTP ${response.status} — ${reason}. Автоматического повтора нет.`);
    }
    const parsed = braveResponse.parse(await researchJson(response));
    if (parsed.error) throw new Error('embedded provider error');
    return (parsed.web?.results || []).slice(0, 5).flatMap(item => {
      try {
        const url = validateSourceUrl(item.url); url.hash = '';
        return [{ url: url.href, title: item.title, description: item.description || '' }];
      } catch { return []; }
    });
  } catch (error) {
    if (error instanceof EditorialModelError) throw error;
    throw new EditorialModelError('Brave Search не ответил корректно: ошибка сети, TLS, тайм-аут или формат ответа. Нового запроса не было.');
  }
}
export const defaultResearchDependencies: ResearchDependencies = {
  search: query => searchEditorialWeb(query), source: retrieveEditorialSource,
};
export function editorialResearchQueries(cheese: ResearchIdentity): string[] {
  return structuredResearchPlan(cheese).map(item => item.query);
}
function mentionsIdentity(text: string, cheese: ResearchIdentity) {
  return cheeseIdentityContexts(text, cheese).length > 0;
}
export function editorialSourceCheeseMatch(source: SourceEvidence, cheese: ResearchIdentity): 'exact' | 'transcription' | undefined {
  // Match the actual article body, not a domain, search snippet or redirected URL.
  // This is a conservative topic check, not verification of facts or official status.
  const contexts = cheeseIdentityContexts(source.text, cheese).filter(context =>
    new RegExp('(?:^| )(?:cheese\\p{L}*|formagg\\p{L}*|fromag\\p{L}*|сыр\\p{L}*|kase\\p{L}*|queso\\p{L}*|queijo\\p{L}*)(?: |$)', 'u').test(context.text));
  return contexts.some(context => !context.transliterated) ? 'exact' : contexts.length ? 'transcription' : undefined;
}
export function editorialSourceMatchesCheese(source: SourceEvidence, cheese: ResearchIdentity) {
  return Boolean(editorialSourceCheeseMatch(source, cheese));
}
export const transcriptionWarning = 'Оригинальное название не заполнено. Связь с итальянским названием найдена по ограниченным правилам транскрипции и сырному контексту, а не проверкой фактов. Проверьте соответствие и заполните название на языке происхождения для более точного поиска.';
function isWikipediaArticle(value: string) {
  try {
    const url = new URL(value);
    return /^[a-z-]+\.wikipedia\.org$/.test(url.hostname)
      && url.pathname.startsWith('/wiki/') && url.pathname.length > 6
      && !decodeURIComponent(url.pathname.slice(6)).includes(':');
  } catch { return false; }
}
function priority(hit: ResearchHit) {
  // Ranking preference, NOT a declaration that a site is official.
  try {
    const url = new URL(hit.url);
    const institutional = /consorz|consorti|cooperativ|minister|regione|gouv|\.gov\b|europa\.eu/i
      .test(`${url.hostname} ${hit.title} ${hit.description}`);
    const specificPage = url.pathname.replace(/\/(?:it|en|fr|ru|es|de)\/?$/, '/').length > 1;
    return (institutional ? 2 : 0) + (specificPage ? 3 : 0);
  } catch { return 0; }
}
export async function researchEditorialSources(
  cheese: ResearchIdentity, manual: string[], deps: ResearchDependencies = defaultResearchDependencies,
  pause: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
  options: { intent?: DraftRequest['intent']; previousQueries?: string[]; previousSources?: string[] } = {},
): Promise<{ sources: SourceEvidence[]; report: ResearchReport }> {
  const report: ResearchReport = { provider: 'brave', queries: [], failures: [], searchedAt: new Date().toISOString(),
    warnings: ['Найденные страницы проверены на читаемость, но официальный статус, связь с сыром и каждый факт проверяет редактор.'] };
  let plan = structuredResearchPlan(cheese);
  if (options.intent?.mode === 'deepen') {
    const topic = options.intent.field === 'country' || options.intent.field === 'region' ? 'origin'
      : options.intent.field === 'description' ? undefined : options.intent.field;
    if (topic) plan = plan.filter(item => item.topic === topic);
    // Overview deepening still uses the bounded original topic plan.
    plan = plan.map(item => ({ ...item, query: `${item.query} documenti dettagli approfondimento`.slice(0, 400) }));
  }
  if (options.intent?.mode === 'alternative') {
    const previous = new Set(options.previousQueries || []);
    const variants = ['documentazione bibliografia approfondimento', 'consorzio archivio scheda tecnica',
      'tradizioni disciplinare patrimonio gastronomico', 'encyclopedia detailed references'];
    plan = plan.map(item => {
      let query = item.query;
      for (const variant of variants) {
        query = `${item.query.slice(0, 300)} ${variant}`;
        if (!previous.has(query)) break;
      }
      if (previous.has(query)) throw new EditorialModelError('Все подготовленные варианты поиска уже использованы. Уточните нужный раздел вместо повторения того же поиска.');
      return { ...item, query };
    });
    report.warnings.push('Повторный поиск использует другой план и предпочитает новые страницы. Новые результаты не гарантированы; совпадения отмечаются явно.');
  }
  report.queryPlan = plan;
  const hits: (ResearchHit & { topic: typeof plan[number]['topic'] })[] = [];
  for (const { query, topic } of plan) {
    if (report.queries.length) await pause(1100);
    report.queries.push(query);
    try { hits.push(...(await deps.search(query)).slice(0, 5).map(hit => ({ ...hit, topic }))); }
    catch (error) {
      report.warnings.push(error instanceof EditorialModelError ? error.message : 'Поиск прерван из-за ошибки сервиса.');
      // A provider failure is not permission to spend on more requests.
      break;
    }
  }
  if (!hits.length) report.warnings.push('Brave не вернул подходящих публичных https-страниц. Можно использовать вручную выбранные источники.');
  const relevantHits = hits.filter(hit => {
    // A consortium keyword alone must never make an unrelated result eligible.
    let address = hit.url;
    try { address = decodeURIComponent(address); } catch { /* retain encoded address */ }
    return mentionsIdentity(`${hit.title} ${hit.description} ${address}`, cheese);
  });
  if (relevantHits.length < hits.length) report.warnings.push('Часть результатов поиска исключена: в них не найдено название выбранного сыра. Дополнительных запросов не было.');
  const seen = new Set<string>();
  const oldSources = new Set(options.previousSources || []);
  const ranked = relevantHits.sort((a, b) =>
    (options.intent?.mode === 'alternative' ? Number(oldSources.has(a.url)) - Number(oldSources.has(b.url)) : 0)
    || priority(b) - priority(a));
  // Reserve room for each requested topic instead of letting a single consortium
  // or repeated homepage consume the whole reading budget.
  const topicFirst = plan.flatMap(item => ranked.find(hit => hit.topic === item.topic) || []);
  const candidateHits = [
    ...manual.map(url => ({ url, title: '', description: '' })),
    ...topicFirst,
    ...ranked.filter(hit => isWikipediaArticle(hit.url)).slice(0, 1),
    ...ranked,
  ];
  if (options.intent?.mode === 'alternative') candidateHits.sort((a, b) =>
    Number(oldSources.has(a.url)) - Number(oldSources.has(b.url)));
  const candidates = candidateHits.flatMap(hit => {
    try {
      const url = validateSourceUrl(hit.url); url.hash = '';
      if (seen.has(url.href)) return [];
      seen.add(url.href); return [url.href];
    } catch { return []; }
  }).slice(0, 9);
  const readable: SourceEvidence[] = [];
  // Bound source reading to three concurrent requests, nine candidates total.
  // Read at most nine once, then choose six for topic coverage, not response order.
  for (let start = 0; start < candidates.length; start += 3) {
    const batch = await Promise.all(candidates.slice(start, start + 3).map(async url => {
      try {
        const source = await deps.source(url);
        validateSourceUrl(source.finalUrl);
        const match = editorialSourceCheeseMatch(source, cheese);
        if (!match) {
          report.warnings.push(`Источник исключён — ${new URL(url).hostname}: в тексте не подтверждена связь с выбранным сыром. Проверьте страницу вручную.`);
          return null;
        }
        if (match === 'transcription' && !report.warnings.includes(transcriptionWarning)) report.warnings.push(transcriptionWarning);
        return source;
      } catch (error) {
        const reason = error instanceof EditorialSourceError
          ? error.message : 'Страница не прочитана; ошибка соединения или неподдерживаемый источник.';
        // Never include arbitrary dependency/provider errors.
        report.failures.push({ url, reason });
        return null;
      }
    }));
    for (const source of batch) if (source &&
      !readable.some(old => old.finalUrl === source.finalUrl)) readable.push(source);
  }
  const sources: SourceEvidence[] = [], covered = new Set<string>();
  if (options.intent?.mode === 'alternative' && readable.every(source =>
    oldSources.has(source.url) || oldSources.has(source.finalUrl)))
    report.warnings.push('Новых читаемых источников не найдено. Не считать эту заготовку независимой новой проверкой.');
  while (readable.length && sources.length < 6) {
    const score = (source: SourceEvidence) => sourceTopics(source).filter(topic => !covered.has(topic)).length * 10
      + (options.intent?.mode === 'alternative' && !oldSources.has(source.url) && !oldSources.has(source.finalUrl) ? 100 : 0)
      + (source.images?.length ? 0.5 : 0) + Math.min(source.text.length, 20_000) / 20_000;
    readable.sort((a, b) => score(b) - score(a));
    // Reserve one of the six evidence slots for a readable, cheese-matched
    // encyclopedia article, without adding search or source-read requests.
    const wikiIndex = sources.length === 1 && !sources.some(source => isWikipediaArticle(source.finalUrl))
      ? readable.findIndex(source => isWikipediaArticle(source.finalUrl)) : -1;
    const selected = wikiIndex >= 0 ? readable.splice(wikiIndex, 1)[0] : readable.shift()!;
    sources.push(selected);
    sourceTopics(selected).forEach(topic => covered.add(topic));
  }
  if (sources.some(source => isWikipediaArticle(source.finalUrl)))
    report.warnings.push('Wikipedia используется как дополнительный энциклопедический источник, а не официальный. Сверьте сведения с первичными источниками; наличие статьи не подтверждает права на фотографии.');
  report.coverage = researchCoverage(sources);
  report.photos = researchPhotos(sources);
  report.warnings.push('Покрытие тем определено по ключевым словам и фрагментам, а не проверкой фактов. Наличие фрагмента не гарантирует полноту или достоверность сведений.');
  if (!report.photos.length) report.warnings.push('Подходящих ссылок на фотографии в прочитанных страницах не найдено. Изображения не выдумываются.');
  else report.warnings.push('Фотографии взяты из ссылок на прочитанных страницах. Проверьте изображённый сыр и права использования; ссылка на лицензию сама по себе не подтверждает разрешение.');
  if (report.failures.length) report.warnings.push('Часть страниц не прочитана. Заготовка использует только доступные источники.');
  if (!sources.length) report.warnings.push('Нет читаемых источников с подтверждённой связью с выбранным сыром. Добавьте другую публичную страницу; текст не создаётся из догадок.');
  return { sources, report };
}
