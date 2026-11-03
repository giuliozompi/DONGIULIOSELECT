import { z } from 'zod';
import type { ResearchReport } from '../../shared/editorial-ai';
import { EditorialModelError } from './editorial-ai-config';
import { retrieveEditorialSource, validateSourceUrl, EditorialSourceError, type SourceEvidence } from './editorial-ai-sources';
import { researchJson } from './editorial-research-http';

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
  const identity = `${(cheese.nameOriginal || cheese.title).slice(0, 160)} ${cheese.country.slice(0, 80)}`.trim();
  return [
    `${identity} cheese formaggio fromage official consortium consorzio`,
    `${identity} cheese formaggio fromage history origins storia histoire`,
    `${identity} cheese formaggio fromage production area specification zona produzione`,
  ].map(query => query.slice(0, 400));
}
function normalized(text: string) {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
function identityNames(cheese: ResearchIdentity) {
  return [cheese.nameOriginal || '', cheese.title].map(name => normalized(name)
    .split(' ').filter(word => !/^(dop|dpo|pdo|aop|aoc|igp|pgi|cheese|formaggio|fromage|сыр)$/.test(word)).join(' '))
    .filter(name => name.length >= 3);
}
function mentionsIdentity(text: string, cheese: ResearchIdentity) {
  const haystack = ` ${normalized(text)} `;
  return identityNames(cheese).some(name => haystack.includes(` ${name} `));
}
export function editorialSourceMatchesCheese(source: SourceEvidence, cheese: ResearchIdentity) {
  // Match the actual article body, not a domain, search snippet or redirected URL.
  // This is a conservative topic check, not verification of facts or official status.
  const body = normalized(source.text);
  return identityNames(cheese).some(name => {
    const needle = ` ${name} `, padded = ` ${body} `;
    let start = padded.indexOf(needle);
    while (start !== -1) {
      const context = padded.slice(Math.max(0, start - 450), start + needle.length + 450);
      if (/(?:^| )(?:cheese\p{L}*|formagg\p{L}*|fromag\p{L}*|сыр\p{L}*|kase\p{L}*|queso\p{L}*|queijo\p{L}*)(?: |$)/u.test(context)) return true;
      start = padded.indexOf(needle, start + needle.length);
    }
    return false;
  });
}
function priority(hit: ResearchHit) {
  // Ranking preference, NOT a declaration that a site is official.
  try {
    return /consorz|consorti|cooperativ|minister|regione|gouv|\.gov\b|europa\.eu/i
      .test(`${new URL(hit.url).hostname} ${hit.title} ${hit.description}`) ? 1 : 0;
  } catch { return 0; }
}
export async function researchEditorialSources(
  cheese: ResearchIdentity, manual: string[], deps: ResearchDependencies = defaultResearchDependencies,
  pause: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
): Promise<{ sources: SourceEvidence[]; report: ResearchReport }> {
  const report: ResearchReport = { provider: 'brave', queries: [], failures: [], searchedAt: new Date().toISOString(),
    warnings: ['Найденные страницы проверены на читаемость, но официальный статус, связь с сыром и каждый факт проверяет редактор.'] };
  const hits: ResearchHit[] = [];
  for (const query of editorialResearchQueries(cheese)) {
    if (report.queries.length) await pause(1100);
    report.queries.push(query);
    try { hits.push(...await deps.search(query)); }
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
  const candidates = [
    ...manual.map(url => ({ url, title: '', description: '' })),
    ...relevantHits.sort((a, b) => priority(b) - priority(a)),
  ].flatMap(hit => {
    try {
      const url = validateSourceUrl(hit.url); url.hash = '';
      if (seen.has(url.href)) return [];
      seen.add(url.href); return [url.href];
    } catch { return []; }
  }).slice(0, 9);
  const sources: SourceEvidence[] = [];
  // Bound source reading to three concurrent requests, nine candidates total.
  // Stop at six readable pages; one bad source must not discard the others.
  for (let start = 0; start < candidates.length && sources.length < 6; start += 3) {
    const batch = await Promise.all(candidates.slice(start, start + 3).map(async url => {
      try {
        const source = await deps.source(url);
        validateSourceUrl(source.finalUrl);
        if (!editorialSourceMatchesCheese(source, cheese)) {
          report.warnings.push(`Источник исключён — ${new URL(url).hostname}: в тексте не подтверждена связь с выбранным сыром. Проверьте страницу вручную.`);
          return null;
        }
        return source;
      } catch (error) {
        const reason = error instanceof EditorialSourceError
          ? error.message : 'Страница не прочитана; ошибка соединения или неподдерживаемый источник.';
        // Never include arbitrary dependency/provider errors.
        report.failures.push({ url, reason });
        return null;
      }
    }));
    for (const source of batch) if (source && sources.length < 6 &&
      !sources.some(old => old.finalUrl === source.finalUrl)) sources.push(source);
  }
  if (report.failures.length) report.warnings.push('Часть страниц не прочитана. Заготовка использует только доступные источники.');
  if (!sources.length) report.warnings.push('Нет читаемых источников с подтверждённой связью с выбранным сыром. Добавьте другую публичную страницу; текст не создаётся из догадок.');
  return { sources, report };
}
