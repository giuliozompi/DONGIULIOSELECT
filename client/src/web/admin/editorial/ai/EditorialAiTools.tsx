import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, ChevronDown, ChevronUp, ExternalLink, FileSearch, History, LoaderCircle, RotateCcw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { editorialAiCountries, countryName, type CatalogItem, type EditorialAiRun, type AiField, type DraftResult, type CatalogResult, type ResearchRequest } from '@shared/editorial-ai';
import type { CheeseData, EditorialEntry } from '@shared/editorial';
import { editorialAiApi } from '../../lib/editorialAiApi';
import SourcesSuggestions from './SourcesSuggestions';
import OriginCoordinates from './OriginCoordinates';
import ResearchDiagnostics from './ResearchDiagnostics';
import IntegratedDraftPreview from './IntegratedDraftPreview';
import './editorial-ai.css';

const PAGE_SIZE = 10;
const AI_FIELDS: { key: AiField; label: string; prop: keyof CheeseData }[] = [
  { key: 'title', label: 'Название', prop: 'title' },
  { key: 'description', label: 'Описание', prop: 'description' },
  { key: 'country', label: 'Страна происхождения', prop: 'country' },
  { key: 'region', label: 'Регион', prop: 'region' },
  { key: 'history', label: 'История', prop: 'history' },
  { key: 'characteristics', label: 'Характеристики', prop: 'characteristics' },
  { key: 'culinaryUses', label: 'Кулинарное использование', prop: 'culinaryUses' },
];
type AppliedOptions = { openEditor: true };
const nativeSelect = 'ai-native-select';
let generationClaimed = false;
const GLOBAL_AI_LOCK_EVENT = 'editorial-ai-lock-change';
function setGenerationClaimed(value: boolean) {
  generationClaimed = value;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(GLOBAL_AI_LOCK_EVENT));
}
type EditorialAiHistory = Awaited<ReturnType<typeof editorialAiApi.history>>;
const draftHistoryForEntry = editorialAiApi.history as unknown as (
  kind: 'draft',
  page: number,
  entryId: string,
) => Promise<EditorialAiHistory>;
type ApplyDraftWithEdits = (
  run: EditorialAiRun,
  entry: EditorialEntry,
  fields: AiField[],
  edits?: Partial<Record<AiField, string>>,
  photos?: { photoIds: string[]; photoRightsConfirmed: boolean },
  origin?: { lookupId: string; candidateId: string },
) => Promise<EditorialEntry>;
const applyDraftWithEdits: ApplyDraftWithEdits = (run, entry, fields, edits, photos, origin) =>
  editorialAiApi.apply(run, entry, fields, edits, photos, origin);

function errorMessage(error: unknown) {
  return (error as { message?: string })?.message || 'Не удалось выполнить запрос. Повторите попытку.';
}
function isConflict(error: unknown) {
  const e = error as { status?: number; message?: string };
  return e?.status === 409 || /409|revision|stale|устарел|изменен/i.test(e?.message || '');
}
function running(run: EditorialAiRun | undefined) {
  return run?.status === 'running';
}
function prettyDate(value: string) {
  return new Date(value).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
}
function namesForRun(run: EditorialAiRun) {
  return run.kind === 'catalog'
    ? ((run.params as { countries?: string[] }).countries || []).map(countryName).join(', ')
    : 'Сырная статья';
}
function useRunPoll(runId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['/admin/editorial-ai/run', runId],
    queryFn: () => editorialAiApi.run(runId!),
    enabled: Boolean(runId && enabled),
    refetchInterval: query => query.state.data?.status === 'running' ? 2000 : false,
    retry: 1,
  });
}
function RunState({ run, error }: { run?: EditorialAiRun; error?: unknown }) {
  if (error) return <div role="alert" className="mt-3 flex gap-2 rounded border border-[#d79c89] bg-[#faeee9] p-3 text-sm text-[#8b4535]"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{errorMessage(error)}</div>;
  if (run?.status === 'failed') return <div role="alert" className="mt-3 rounded border border-[#d79c89] bg-[#faeee9] p-3 text-sm text-[#8b4535]"><strong>Генерация не завершилась.</strong> {run.error || 'Сервер не сообщил причину.'}</div>;
  if (run?.status === 'running') return <div className="mt-3 flex items-center gap-2 rounded bg-[#eef0e7] p-3 text-sm text-[#53675a]" role="status"><LoaderCircle className="h-4 w-4 animate-spin" />Задача выполняется. Каталог будет обновлён автоматически.</div>;
  return null;
}

export function EditorialAiCatalog({ onImported }: { onImported: () => void }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [countryCodes, setCountryCodes] = useState<string[]>(['IT']);
  const [catalogLimit, setCatalogLimit] = useState(12);
  const [run, setRun] = useState<EditorialAiRun>();
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState<string[]>([]);
  const [countryFilter, setCountryFilter] = useState('');
  const [notice, setNotice] = useState('');
  const [importResult, setImportResult] = useState<{ created: string[]; skipped: { title: string; entryId: string }[] } | null>(null);
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyOpen, setHistoryOpen] = useState(false);
  const claimRef = useRef(false);
  useEffect(() => () => {
    if (claimRef.current) { claimRef.current = false; setGenerationClaimed(false); }
  }, []);

  const history = useQuery({
    queryKey: ['/admin/editorial-ai/history', 'catalog', historyPage],
    queryFn: () => editorialAiApi.history('catalog', historyPage),
    enabled: expanded && historyOpen,
    retry: 1,
  });
  const pollingRunId = running(run) ? run?.id : undefined;
  const polled = useRunPoll(pollingRunId, Boolean(pollingRunId));
  const currentRun = polled.data || run;
  const activeRunId = running(currentRun) ? currentRun?.id : undefined;
  useEffect(() => {
    if (claimRef.current && currentRun && currentRun.status !== 'running') {
      claimRef.current = false;
      setGenerationClaimed(false);
      setBusy(false);
    }
  }, [currentRun?.id, currentRun?.status]);
  const result = currentRun?.status === 'ready' ? currentRun.result as CatalogResult | null : null;
  const items = result?.items || [];
  const regions = useMemo(() => Array.from(new Set(items.filter(item => ['IT', 'FR'].includes(item.countryCode)).flatMap(item => item.regions))).sort((a, b) => a.localeCompare(b, 'ru')), [items]);
  const visibleItems = useMemo(() => items.filter(item => {
    const haystack = `${item.titleRu} ${item.nameOriginal} ${countryName(item.countryCode)} ${item.regions.join(' ')}`.toLocaleLowerCase('ru');
    return (!query || haystack.includes(query.toLocaleLowerCase('ru')))
      && (!countryFilter || item.countryCode === countryFilter)
      && (!regionFilter.length || item.regions.some(region => regionFilter.includes(region)));
  }).sort((a, b) => a.country.localeCompare(b.country, 'ru') || b.importance - a.importance || a.titleRu.localeCompare(b.titleRu, 'ru')), [items, query, countryFilter, regionFilter]);
  const claim = () => {
    if (claimRef.current || generationClaimed) return false;
    claimRef.current = true;
    setGenerationClaimed(true);
    setBusy(true);
    return true;
  };
  const release = () => {
    claimRef.current = false;
    setGenerationClaimed(false);
    setBusy(false);
  };
  async function generate() {
    if (claimRef.current) return;
    if (countryCodes.length < 1 || countryCodes.length > 3 || !Number.isInteger(catalogLimit) || catalogLimit < countryCodes.length || catalogLimit > 30) return;
    if (!claim()) {
      setActionError('Уже выполняется другая AI-задача. Дождитесь её завершения.');
      return;
    }
    setActionError('');
    setNotice('');
    const requestId = crypto.randomUUID();
    try {
      const next = await editorialAiApi.catalog({ requestId, countries: countryCodes, limit: catalogLimit });
      setRun(next);
      setSelected([]);
      setRegionFilter([]);
      setCountryFilter('');
      setImportResult(null);
      if (next.status !== 'running') release();
    } catch (error) {
      setActionError(errorMessage(error));
      release();
    }
  }
  async function reopen(historyRun: EditorialAiRun) {
    if (busy || claimRef.current) return;
    setActionError('');
    setNotice('');
    setSelected([]);
    setRun(historyRun);
    setExpanded(true);
    setHistoryOpen(false);
    if (historyRun.status === 'running') {
      claimRef.current = true;
      setGenerationClaimed(true);
      setBusy(true);
    }
    if (historyRun.status !== 'running') {
      try { setRun(await editorialAiApi.run(historyRun.id)); }
      catch (error) { setActionError(errorMessage(error)); }
    }
  }
  async function saveRank(item: CatalogItem, value: number) {
    if (!currentRun || !result || value < 1 || value > 100) return;
    setActionError('');
    try {
      const next = await editorialAiApi.rank(currentRun, [{ id: item.id, importance: value }]);
      setRun(next);
      qc.setQueryData(['/admin/editorial-ai/run', next.id], next);
    } catch (error) { setActionError(errorMessage(error)); }
  }
  async function importSelected() {
    if (!currentRun || selected.length < 1 || selected.length > 10) return;
    setBusy(true);
    setActionError('');
    setNotice('');
    try {
      const imported = await editorialAiApi.import(currentRun, selected);
      const skipped = imported.skipped.length;
      setNotice(`${imported.created.length} черновиков создано${skipped ? ` · ${skipped} пропущено: уже есть совпадения` : ''}.`);
      setImportResult({
        created: imported.created.map(entry => (entry.data as CheeseData).title || 'Без названия'),
        skipped: imported.skipped.map(item => ({ title: item.title, entryId: item.entryId })),
      });
      setSelected([]);
      onImported();
      const refreshed = await editorialAiApi.run(currentRun.id);
      setRun(refreshed);
      qc.setQueryData(['/admin/editorial-ai/run', refreshed.id], refreshed);
      await qc.invalidateQueries({ queryKey: ['/web-api/admin/editorial'] });
    } catch (error) { setActionError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  function toggleCountry(code: string) {
    const nextCodes = countryCodes.includes(code)
      ? countryCodes.filter(item => item !== code)
      : countryCodes.length < 3 ? [...countryCodes, code] : countryCodes;
    setCountryCodes(nextCodes);
    setCatalogLimit(limit => Math.max(limit, nextCodes.length));
  }
  function toggleItem(id: string) {
    setSelected(current => current.includes(id)
      ? current.filter(item => item !== id)
      : current.length < 10 ? [...current, id] : current);
  }
  return <section data-testid="editorial-ai-catalog" className="editorial-ai mb-6 overflow-hidden rounded-md border border-[#d7d8cc] bg-[#f8f7f0]">
    <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between md:px-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e6ebe1] text-[#315647]"><Sparkles className="h-4 w-4" /></div>
        <div><p className="ai-kicker">Инструменты редакции · AI</p><h2 className="mt-1 font-serif text-xl">Каталог сыров по странам</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-[#69766d]">Модельные подсказки не являются рейтингом качества или продаж. Сверьте источники и факты до публикации.</p></div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="outline" size="sm" disabled={busy || Boolean(activeRunId)} onClick={() => { setExpanded(value => !value); }} aria-expanded={expanded}>{expanded ? 'Свернуть' : 'Открыть каталог'}<ChevronDown className="ml-2 h-4 w-4" /></Button>
      </div>
    </div>
    {expanded && <div className="border-t border-[#d8d9cc] px-4 py-4 md:px-5">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Страны · до трёх за запрос</legend>
          <div className="flex flex-wrap gap-2">
            {countryCodes.map(code => <span key={code} className="inline-flex items-center rounded-full border border-[#bcc7b9] bg-[#edf0e8] px-3 py-1 text-xs">{countryName(code)} <button className="ml-2 font-bold text-[#8b5842]" aria-label={`Удалить ${countryName(code)}`} onClick={() => toggleCountry(code)}>×</button></span>)}
            <select className={nativeSelect + ' max-w-xs'} aria-label="Добавить страну" value="" disabled={countryCodes.length >= 3} onChange={event => event.target.value && toggleCountry(event.target.value)}>
              <option value="">Добавить страну…</option>{editorialAiCountries.filter(country => !countryCodes.includes(country.code)).map(country => <option key={country.code} value={country.code}>{country.name}</option>)}
            </select>
          </div>
        </fieldset>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="w-32">
            <label htmlFor="ai-catalog-limit" className="mb-1 block text-xs font-semibold text-[#607066]">Сыров в ответе</label>
            <Input id="ai-catalog-limit" data-testid="ai-catalog-limit" type="number" inputMode="numeric" min={countryCodes.length || 1} max={30} step={1} value={catalogLimit} onChange={event => setCatalogLimit(Number(event.target.value))} aria-describedby="ai-catalog-limit-hint" />
            <p id="ai-catalog-limit-hint" className="mt-1 text-[11px] text-[#78837a]">От {countryCodes.length || 1} до 30</p>
          </div>
          <Button data-testid="ai-catalog-generate" className="bg-[#315647] text-[#f7f4e9] hover:bg-[#244537]" disabled={busy || Boolean(activeRunId) || countryCodes.length === 0 || catalogLimit < countryCodes.length || catalogLimit > 30 || !Number.isInteger(catalogLimit)} onClick={() => { void generate(); }}>
          {busy || activeRunId ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Сформировать каталог
          </Button>
        </div>
      </div>
      {actionError && <div role="alert" className="mt-3 rounded border border-[#d79c89] bg-[#faeee9] p-3 text-sm text-[#8b4535]">{actionError}</div>}
      {notice && <div role="status" className="mt-3 flex items-center gap-2 rounded bg-[#e8efe6] p-3 text-sm text-[#375b43]"><Check className="h-4 w-4" />{notice}</div>}
      <RunState run={currentRun} error={polled.isError && activeRunId ? polled.error : undefined} />
      {currentRun && <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#d8d9cc] pt-3 text-xs text-[#718075]">
        <span>{currentRun.status === 'ready' ? `Результат · ${namesForRun(currentRun)} · ${prettyDate(currentRun.createdAt)}` : `Запуск · ${namesForRun(currentRun)} · ${prettyDate(currentRun.createdAt)}`}</span>
        <span>Модель: {currentRun.model || 'не указана'} · результат требует проверки редактором</span>
      </div>}
      {importResult && <div className="mt-3 rounded border border-[#cbd4c8] bg-[#edf1e9] p-3 text-sm text-[#405a48]">
        <strong>Результат импорта</strong>
        {importResult.created.length > 0 && <p className="mt-1">Созданы черновики: {importResult.created.join(' · ')}.</p>}
        {importResult.skipped.length > 0 && <p className="mt-1">Пропущены как совпадения: {importResult.skipped.map((item, index) => <span key={item.entryId}>{index > 0 && ' · '}<a className="underline underline-offset-2" href={`#entry-${encodeURIComponent(item.entryId)}`}>{item.title}</a></span>)}.</p>}
      </div>}
      {result && <>
        {result.warnings.length > 0 && <div className="mt-3 rounded border border-[#dfc9b5] bg-[#f5ece2] p-3 text-sm text-[#75533e]"><strong>Замечания модели</strong><ul className="mt-1 list-inside list-disc">{result.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></div>}
        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_250px]">
          <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Поиск по сыру, стране или региону" aria-label="Поиск в каталоге" />
          <select className={nativeSelect} value={countryFilter} onChange={event => setCountryFilter(event.target.value)} aria-label="Фильтр страны">
            <option value="">Все страны запроса</option>{countryCodes.map(code => <option key={code} value={code}>{countryName(code)}</option>)}
          </select>
        </div>
        {regions.length > 0 && <div className="mt-2 max-w-sm"><label className="mb-1 block text-xs font-medium text-[#718075]" htmlFor="catalog-region-filter">Регион · Италия и Франция</label><select id="catalog-region-filter" className={nativeSelect} multiple value={regionFilter} onChange={event => setRegionFilter(Array.from(event.target.selectedOptions, option => option.value))} size={Math.min(4, Math.max(2, regions.length))}>
          {regions.map(region => <option key={region} value={region}>{region}</option>)}
        </select></div>}
        {regions.length > 0 && <p className="mt-1 text-xs text-[#7a857b]">Фильтр регионов Италии и Франции: можно выбрать несколько. Сыр может иметь несколько регионов происхождения.</p>}
        {visibleItems.length === 0 ? <div className="mt-4 rounded border border-dashed border-[#c9cbbf] p-7 text-center text-sm text-[#718075]"><FileSearch className="mx-auto mb-2 h-5 w-5" />По заданным условиям сыров не найдено.</div> :
          <div className="mt-4 space-y-2">
            {visibleItems.map((item, index) => <div key={item.id}>
              {(index === 0 || visibleItems[index - 1].countryCode !== item.countryCode) && <h3 className="mb-2 mt-4 font-serif text-lg text-[#315647]">{item.country}</h3>}
              <CatalogRow item={item} selected={selected.includes(item.id)} disabled={!selected.includes(item.id) && selected.length >= 10} onToggle={() => toggleItem(item.id)} onRank={value => { void saveRank(item, value); }} />
            </div>)}
          </div>}
        <div className="mt-4 flex flex-col gap-3 border-t border-[#d8d9cc] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[#718075]">Выбрано {selected.length} из 10 · каждый импорт создаёт отдельный черновик. Совпадения не импортируются молча.</p>
          <Button data-testid="ai-catalog-import" disabled={busy || selected.length < 1} onClick={() => { void importSelected(); }} className="bg-[#315647] hover:bg-[#244537]">Создать выбранные черновики</Button>
        </div>
      </>}
      <div className="mt-5 border-t border-[#d8d9cc] pt-3">
        <button data-testid="ai-catalog-history" disabled={busy || Boolean(activeRunId)} className="flex items-center gap-2 text-sm font-medium text-[#51665a] disabled:opacity-50" onClick={() => setHistoryOpen(value => !value)} aria-expanded={historyOpen}><History className="h-4 w-4" />История каталогов {historyOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
        {historyOpen && <div className="mt-3">
          {history.isLoading && <div className="space-y-2" aria-label="Загрузка истории">{[0, 1].map(index => <div key={index} className="h-12 animate-pulse rounded bg-[#e7e6dc]" />)}</div>}
          {history.isError && <div role="alert" className="flex items-center justify-between rounded border border-[#d79c89] bg-[#faeee9] p-3 text-sm text-[#8b4535]"><span>{errorMessage(history.error)}</span><Button variant="outline" size="sm" onClick={() => { void history.refetch(); }}><RotateCcw className="mr-2 h-3.5 w-3.5" />Повторить</Button></div>}
          {!history.isLoading && !history.isError && (history.data?.items.length || 0) === 0 && <p className="rounded border border-dashed border-[#c9cbbf] p-4 text-sm text-[#718075]">Запусков каталога пока нет.</p>}
          {!!history.data?.items.length && <div className="space-y-2">{history.data.items.map(historyRun => <div key={historyRun.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#e0dfd4] bg-[#fbfaf5] p-3 text-sm"><span>{prettyDate(historyRun.createdAt)} · {namesForRun(historyRun)} · {historyRun.status === 'ready' ? 'готово' : historyRun.status === 'running' ? 'выполняется' : 'ошибка'}</span><Button data-testid={`ai-catalog-history-run-${historyRun.id}`} size="sm" variant="outline" disabled={busy || Boolean(activeRunId)} onClick={() => { void reopen(historyRun); }}>Открыть</Button></div>)}</div>}
          {(history.data?.total || 0) > (history.data?.limit || PAGE_SIZE) && <div className="mt-3 flex justify-end gap-2"><Button variant="outline" size="sm" disabled={historyPage <= 1} onClick={() => setHistoryPage(page => page - 1)}>Назад</Button><span className="py-2 text-xs">Страница {historyPage}</span><Button variant="outline" size="sm" disabled={historyPage * (history.data?.limit || PAGE_SIZE) >= (history.data?.total || 0)} onClick={() => setHistoryPage(page => page + 1)}>Далее</Button></div>}
        </div>}
      </div>
    </div>}
  </section>;
}

function CatalogRow({ item, selected, disabled, onToggle, onRank }: { item: CatalogItem; selected: boolean; disabled: boolean; onToggle: () => void; onRank: (value: number) => void }) {
  const [rankText, setRankText] = useState(String(item.importance));
  return <article data-testid={`ai-catalog-item-${item.id}`} className="ai-run-card grid gap-3 rounded border border-[#e0dfd4] bg-[#fbfaf5] p-3 md:grid-cols-[auto_minmax(0,1fr)_180px] md:items-start">
    <input aria-label={`Выбрать ${item.titleRu}`} className="mt-1 h-4 w-4 accent-[#315647]" type="checkbox" checked={selected} disabled={disabled || item.matches.length > 0} onChange={onToggle} />
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><h3 className="font-serif text-lg">{item.titleRu}</h3><span className="text-xs italic text-[#778278]">{item.nameOriginal}</span></div>
      <p className="mt-1 text-xs text-[#66736a]">{item.country} · {item.regions.length ? item.regions.join(' · ') : 'регион не указан'}</p>
      <p className="mt-2 text-sm leading-5 text-[#526158]">{item.summary || item.importanceNote}</p>
      <p className="mt-2 text-xs text-[#78837a]">Модель объясняет значимость так: {item.importanceNote}</p>
      {item.matches.length > 0 && <div className="mt-2 rounded bg-[#f5ece2] px-2.5 py-2 text-xs text-[#78553d]"><strong>Возможные совпадения в редакции:</strong> {item.matches.map((match, index) => <span key={match.id}>{index > 0 && ', '}<a href={`/web/admin/cheeses?entry=${encodeURIComponent(match.id)}`} className="underline underline-offset-2">{match.title}</a></span>)}. Импорт заблокирован для проверки дубликата.</div>}
    </div>
    <div className="rounded bg-[#f0f0e8] p-2.5 text-xs">
      <div className="flex justify-between gap-2"><span>Модель</span><strong>{item.suggestedImportance}/100</strong></div>
      <label className="mt-2 block" htmlFor={`rank-${item.id}`}>Оценка оператора</label>
      <div className="mt-1 flex gap-1"><Input id={`rank-${item.id}`} className="h-8 bg-white" type="number" min={1} max={100} value={rankText} onChange={event => setRankText(event.target.value)} /><Button size="sm" className="h-8 px-2" disabled={Number(rankText) === item.importance || !Number.isInteger(Number(rankText)) || Number(rankText) < 1 || Number(rankText) > 100} onClick={() => onRank(Number(rankText))}>Сохранить</Button></div>
      <p className="mt-1 text-[11px] text-[#79847b]">Сейчас: {item.importance}/100 · сортировка по значимости</p>
    </div>
  </article>;
}

export function CheeseAiDraft({
  entry,
  onApplied,
  mode = 'editor',
  onProposalReady,
  onIdentitySave,
  actionsDisabled = false,
  onBusyChange,
}: {
  entry: EditorialEntry;
  onApplied: (saved?: EditorialEntry, options?: AppliedOptions) => void;
  mode?: 'research' | 'editor';
  onProposalReady?: (entry: EditorialEntry, run: EditorialAiRun, draft: DraftResult) => void;
  onIdentitySave?: (entry: EditorialEntry, identity: Pick<CheeseData, 'title' | 'nameOriginal' | 'country' | 'region'>) => Promise<EditorialEntry>;
  actionsDisabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const initialSources = ((entry.data as CheeseData).sources || []).filter(url => !/^https:\/\/www\.openstreetmap\.org\/(?:node|way|relation)\/\d+$/.test(url)).join('\n');
  const [open, setOpen] = useState(false);
  const [sourcesText, setSourcesText] = useState(initialSources);
  const [run, setRun] = useState<EditorialAiRun>();
  const [selectedFields, setSelectedFields] = useState<AiField[]>([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [photoRightsConfirmed, setPhotoRightsConfirmed] = useState(false);
  const [edits, setEdits] = useState<Partial<Record<AiField, string>>>({});
  const [revisionConflict, setRevisionConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [suggestionBusy, setSuggestionBusy] = useState(false);
  const [globalAiBusy, setGlobalAiBusy] = useState(generationClaimed);
  const [error, setError] = useState('');
  const [serverTransfer, setServerTransfer] = useState<CheeseData['aiResearch']>();
  const [identityEntry, setIdentityEntry] = useState(entry);
  const [identityForm, setIdentityForm] = useState(() => {
    const data = entry.data as CheeseData;
    return { title: data.title || '', nameOriginal: data.nameOriginal || '', country: data.country || '', region: data.region || '' };
  });
  const [identitySaving, setIdentitySaving] = useState(false);
  const [identityError, setIdentityError] = useState('');
  const [identityStale, setIdentityStale] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [transferConfirmation, setTransferConfirmation] = useState<{
    mode: 'apply' | 'photos';
    identity: string;
    run: EditorialAiRun;
    entry: EditorialEntry;
    fields: AiField[];
    photoIds: string[];
    edits: Partial<Record<AiField, string>>;
    origin?: { lookupId: string; candidateId: string; label: string; latitude: number; longitude: number; url: string };
  } | null>(null);
  const [selectedOriginId, setSelectedOriginId] = useState('');
  const [deepInstructions, setDeepInstructions] = useState<Partial<Record<AiField, string>>>({});
  const lock = useRef(false);
  const applyLock = useRef(false);
  const applyClaimedRef = useRef(false);
  const mountedRef = useRef(false);
  const activeEntry = mode === 'research' ? identityEntry : entry;
  const identity = `${activeEntry.id}:${activeEntry.revision}`;
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const photoIdentityRef = useRef(identity);
  const entryIdRef = useRef(entry.id);
  const identityEntryRef = useRef(activeEntry);
  const identitySavePendingRef = useRef(false);
  const identitySavedRevisionRef = useRef<number | null>(null);
  identityEntryRef.current = activeEntry;
  const runEntryIdRef = useRef<string>();
  const proposalNotifiedRef = useRef('');
  useEffect(() => () => {
    if (lock.current) { lock.current = false; setGenerationClaimed(false); }
    if (applyClaimedRef.current) {
      applyClaimedRef.current = false;
      applyLock.current = false;
      setGenerationClaimed(false);
    }
  }, []);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (lock.current) { lock.current = false; setGenerationClaimed(false); }
      if (applyClaimedRef.current) {
        applyClaimedRef.current = false;
        applyLock.current = false;
        setGenerationClaimed(false);
      }
    };
  }, []);
  useEffect(() => {
    const refreshLock = () => setGlobalAiBusy(generationClaimed);
    window.addEventListener(GLOBAL_AI_LOCK_EVENT, refreshLock);
    return () => window.removeEventListener(GLOBAL_AI_LOCK_EVENT, refreshLock);
  }, []);
  useEffect(() => {
    if (entryIdRef.current === entry.id) return;
    entryIdRef.current = entry.id;
    identityEntryRef.current = entry;
    setIdentityEntry(entry);
    const data = entry.data as CheeseData;
    setIdentityForm({ title: data.title || '', nameOriginal: data.nameOriginal || '', country: data.country || '', region: data.region || '' });
    setIdentityError('');
    runEntryIdRef.current = undefined;
    setServerTransfer(undefined);
    setRun(undefined);
    setSelectedFields([]);
    setEdits({});
    setSelectedOriginId('');
    setDeepInstructions({});
    setRevisionConflict(false);
    setError('');
    setHistoryOpen(false);
    setTransferConfirmation(null);
    const nextSources = ((entry.data as CheeseData).sources || []).filter(url => !/^https:\/\/www\.openstreetmap\.org\/(?:node|way|relation)\/\d+$/.test(url)).join('\n');
    setSourcesText(nextSources);
    sourceBaseline.current = nextSources;
  }, [entry.id, entry.data]);
  useEffect(() => {
    if (photoIdentityRef.current === identity) return;
    photoIdentityRef.current = identity;
    setSelectedPhotoIds([]);
    setPhotoRightsConfirmed(false);
  }, [identity]);
  useEffect(() => {
    if (transferConfirmation && transferConfirmation.identity !== identity) setTransferConfirmation(null);
  }, [identity, transferConfirmation]);
  const sourceBaseline = useRef(initialSources);
  const history = useQuery({
    queryKey: ['/admin/editorial-ai/history', 'draft', entry.id, historyPage],
    queryFn: () => draftHistoryForEntry('draft', historyPage, entry.id),
    enabled: open && historyOpen,
    retry: 1,
  });
  const visibleRun = runEntryIdRef.current === entry.id ? run : undefined;
  const pollingRunId = running(visibleRun) ? visibleRun?.id : undefined;
  const polled = useRunPoll(pollingRunId, Boolean(pollingRunId));
  // Applying a ready run updates local appliedTo immediately. The last poll can
  // still contain the same run's unapplied response, so keep that same-ID local
  // apply marker; a response for any other run remains authoritative.
  const current = visibleRun?.appliedTo?.entryId === entry.id && polled.data?.id === visibleRun.id
    ? visibleRun
    : polled.data || visibleRun;
  const activeId = running(current) ? current?.id : undefined;
  useEffect(() => {
    if (lock.current && current && current.status !== 'running') {
      lock.current = false;
      setGenerationClaimed(false);
      setBusy(false);
    }
  }, [current?.id, current?.status]);
  const draft = current?.status === 'ready' ? current.result as DraftResult | null : null;
  const runParams = current?.kind === 'draft' ? current.params as { entryId?: string; revision?: number } : undefined;
  const runStale = Boolean(current && (current.appliedTo
    ? current.appliedTo.entryId !== activeEntry.id || current.appliedTo.revision !== activeEntry.revision
    : runParams?.entryId !== activeEntry.id || runParams?.revision !== activeEntry.revision));
  const readyTextPendingApply = Boolean(draft && !current?.appliedTo
    && Object.values(draft.fields).some(value => typeof value === 'string' && value.trim().length > 0));
  const entryData = activeEntry.data as CheeseData;
  const researchMarker = entryData.aiResearch || serverTransfer;
  const entryRuns = history.data?.items || [];
  const previousSearchRunId = current?.kind === 'draft' && current.status !== 'running'
    ? current.id
    : entryRuns.find(item => item.kind === 'draft' && item.status !== 'running')?.id;
  const editedProposal = Object.keys(edits).some(key => edits[key as AiField] !== draft?.fields[key as AiField]);
  const hasUnsavedChanges = sourcesText !== sourceBaseline.current || (!current?.appliedTo && (
    editedProposal || selectedPhotoIds.length > 0 || selectedFields.length > 0 || Boolean(selectedOriginId)
  ));
  const identityDirty = identityForm.title !== (entryData.title || '') || identityForm.nameOriginal !== (entryData.nameOriginal || '')
    || identityForm.country !== (entryData.country || '') || identityForm.region !== (entryData.region || '');
  const componentBusy = busy || suggestionBusy || Boolean(activeId) || identitySaving || globalAiBusy;
  useEffect(() => {
    if (mode !== 'research' || identitySavePendingRef.current || entry.id !== identityEntry.id || entry.revision === identityEntry.revision) return;
    if (identitySavedRevisionRef.current === entry.revision) {
      identityEntryRef.current = entry;
      setIdentityEntry(entry);
      setIdentityStale(false);
      setIdentityError('');
      return;
    }
    if (identityDirty) {
      setIdentityStale(true);
      setIdentityError('Сохранённая запись изменилась. Обновите сведения перед новым исследованием.');
      return;
    }
    const latest = entry.data as CheeseData;
    identityEntryRef.current = entry;
    setIdentityEntry(entry);
    setIdentityForm({ title: latest.title || '', nameOriginal: latest.nameOriginal || '', country: latest.country || '', region: latest.region || '' });
    setIdentityStale(false);
  }, [mode, entry, identityEntry, identityDirty]);
  useEffect(() => {
    onBusyChange?.(componentBusy);
  }, [componentBusy, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);
  useEffect(() => {
    const params = current?.kind === 'draft' ? current.params as { fullDraft?: boolean; entryId?: string; revision?: number } : undefined;
    if (mode !== 'research' || !onProposalReady || !current || current.status !== 'ready' || !draft
      || !params?.fullDraft || params.entryId !== activeEntry.id || params.revision !== activeEntry.revision
      || proposalNotifiedRef.current === current.id) return;
    proposalNotifiedRef.current = current.id;
    onProposalReady(activeEntry, current, draft);
  }, [mode, onProposalReady, current?.id, current?.status, activeEntry, draft]);
  function tryClaimSuggestion() {
    if (actionsDisabled || generationClaimed) return false;
    setGenerationClaimed(true);
    return true;
  }
  function releaseSuggestionClaim() {
    setGenerationClaimed(false);
  }
  function confirmDiscardChanges(action: string) {
    if (!hasUnsavedChanges) return true;
    return window.confirm(`Есть несохранённые ссылки, правки текста или выбранные фотографии. ${action} и потерять их?`);
  }
  async function saveIdentity(): Promise<EditorialEntry | undefined> {
    if (!onIdentitySave || !identityDirty || identitySaving || componentBusy || actionsDisabled || identityStale) return;
    if (!identityForm.title.trim() || !identityForm.country.trim()) {
      setIdentityError('Укажите название по-русски и страну происхождения.');
      return undefined;
    }
    const target = identityEntryRef.current;
    identitySavePendingRef.current = true;
    setIdentitySaving(true);
    setIdentityError('');
    try {
      const saved = await onIdentitySave(target, identityForm);
      if (!mountedRef.current || entryIdRef.current !== saved.id) return;
      identitySavedRevisionRef.current = saved.revision;
      identityEntryRef.current = saved;
      identityRef.current = `${saved.id}:${saved.revision}`;
      setIdentityEntry(saved);
      setIdentityStale(false);
      setIdentityForm({
        title: (saved.data as CheeseData).title || '',
        nameOriginal: (saved.data as CheeseData).nameOriginal || '',
        country: (saved.data as CheeseData).country || '',
        region: (saved.data as CheeseData).region || '',
      });
      return saved;
    } catch (issue) {
      if (mountedRef.current && entryIdRef.current === target.id) {
        setIdentityError(errorMessage(issue));
        if (isConflict(issue)) setIdentityStale(true);
      }
      return undefined;
    } finally {
      identitySavePendingRef.current = false;
      if (mountedRef.current && entryIdRef.current === target.id) setIdentitySaving(false);
    }
  }
  async function startFullDraftResearch() {
    if (mode !== 'research' || actionsDisabled || componentBusy) return;
    const requestEntry = identityDirty ? await saveIdentity() : activeEntry;
    if (!requestEntry) return;
    await researchDraft({ fullDraft: true, entry: requestEntry });
  }
  async function generateDraft() {
    if (actionsDisabled || lock.current || generationClaimed || suggestionBusy) return;
    const sources = sourcesText.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    if (sources.length < 1 || sources.length > 3 || sources.some(url => !/^https:\/\/[^/\s?#]+/i.test(url))) {
      setError('Укажите от одной до трёх ссылок https, по одной на строку.');
      return;
    }
    if (hasUnsavedChanges && !confirmDiscardChanges('Создать новое предложение')) return;
    lock.current = true;
    setGenerationClaimed(true);
    setBusy(true);
    setError('');
    const requestIdentity = identity;
    try {
      const next = await editorialAiApi.draft({ requestId: crypto.randomUUID(), entryId: activeEntry.id, revision: activeEntry.revision, sources });
      if (!mountedRef.current || identityRef.current !== requestIdentity) {
        if (lock.current) { lock.current = false; setGenerationClaimed(false); }
        if (mountedRef.current) setBusy(false);
        return;
      }
      runEntryIdRef.current = activeEntry.id;
      setRun(next);
      setSelectedFields([]);
      setSelectedOriginId('');
      setSelectedPhotoIds([]);
      setPhotoRightsConfirmed(false);
      setEdits({});
      setRevisionConflict(false);
      sourceBaseline.current = sourcesText;
      if (next.status !== 'running') { lock.current = false; setGenerationClaimed(false); setBusy(false); }
    } catch (issue) {
      if (!mountedRef.current || identityRef.current !== requestIdentity) {
        if (lock.current) { lock.current = false; setGenerationClaimed(false); }
        if (mountedRef.current) setBusy(false);
        return;
      }
      setError(errorMessage(issue));
      lock.current = false;
      setGenerationClaimed(false);
      setBusy(false);
    }
  }
  async function researchDraft(options: {
    fullDraft?: boolean;
    intent?: NonNullable<ResearchRequest['intent']>;
    replacingCurrent?: boolean;
    entry?: EditorialEntry;
  } = {}) {
    if (actionsDisabled || lock.current || generationClaimed || suggestionBusy || applyLock.current) return;
    const requestEntry = options.entry || activeEntry;
    const workLabel = options.intent?.mode === 'deepen'
      ? `Углубить раздел «${AI_FIELDS.find(field => field.key === options.intent?.field)?.label || 'статьи'}»`
      : options.intent?.mode === 'alternative'
        ? 'Выполнить альтернативный поиск'
        : options.fullDraft ? 'Подготовить полный черновик с поиском' : 'Найти источники и подготовить текст';
    const replacementText = options.replacingCurrent
      ? '\n\nНовый альтернативный полный черновик заменит только текущий AI-предпросмотр. Сохранённая статья останется без изменений.'
      : '';
    if (mode !== 'research' && !window.confirm(`${workLabel}?\n\nЗапуск: не более 5 поисковых запросов Brave и 1 генерации. Результат останется предложением на проверку; публикации не будет.${replacementText}`)) return;
    const sources = sourcesText.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    if (sources.length > 3 || sources.some(url => !/^https:\/\/[^/\s?#]+/i.test(url))) {
      setError('Добавьте не более трёх публичных https-ссылок, по одной на строку.');
      return;
    }
    if (hasUnsavedChanges && !confirmDiscardChanges('Начать поиск источников')) return;
    lock.current = true;
    setGenerationClaimed(true);
    setBusy(true);
    setError('');
    const requestIdentity = `${requestEntry.id}:${requestEntry.revision}`;
    try {
      const next = await editorialAiApi.research({
        requestId: crypto.randomUUID(), entryId: requestEntry.id, revision: requestEntry.revision, sources,
        ...(options.fullDraft ? { fullDraft: true } : {}),
        ...(options.intent ? { intent: options.intent } : {}),
      });
      if (!mountedRef.current || identityRef.current !== requestIdentity) {
        if (lock.current) { lock.current = false; setGenerationClaimed(false); }
        if (mountedRef.current) setBusy(false);
        return;
      }
      runEntryIdRef.current = requestEntry.id;
      setRun(next);
      setSelectedFields([]);
      setSelectedOriginId('');
      setSelectedPhotoIds([]);
      setPhotoRightsConfirmed(false);
      setEdits({});
      setRevisionConflict(false);
      sourceBaseline.current = sourcesText;
      if (next.status !== 'running') { lock.current = false; setGenerationClaimed(false); setBusy(false); }
    } catch (issue) {
      if (!mountedRef.current || identityRef.current !== requestIdentity) {
        if (lock.current) { lock.current = false; setGenerationClaimed(false); }
        if (mountedRef.current) setBusy(false);
        return;
      }
      setError(errorMessage(issue));
      lock.current = false;
      setGenerationClaimed(false);
      setBusy(false);
    }
  }
  async function openHistoryRun(historyRun: EditorialAiRun) {
    if (busy || suggestionBusy || generationClaimed || lock.current || applyLock.current) return;
    if (!confirmDiscardChanges('Открыть другое предложение')) return;
    setError('');
    const requestIdentity = identity;
    try {
      const next = historyRun.status === 'running' ? historyRun : await editorialAiApi.run(historyRun.id);
      if (!mountedRef.current || identityRef.current !== requestIdentity
        || (next.params as { entryId?: string }).entryId !== entry.id) return;
      const historicSources = ((next.params as { sources?: string[] }).sources || []).filter(url => !/^https:\/\/www\.openstreetmap\.org\/(?:node|way|relation)\/\d+$/.test(url)).join('\n');
      runEntryIdRef.current = entry.id;
      setRun(next);
      setEdits({});
      setSelectedFields([]);
      setSelectedOriginId('');
      setSelectedPhotoIds([]);
      setPhotoRightsConfirmed(false);
      setRevisionConflict(false);
      setSourcesText(historicSources);
      sourceBaseline.current = historicSources;
      setHistoryOpen(false);
      if (next.status === 'running') {
        lock.current = true;
        setGenerationClaimed(true);
        setBusy(true);
      }
    } catch (issue) {
      if (!mountedRef.current || identityRef.current !== requestIdentity) return;
      setError(errorMessage(issue));
    }
  }
  async function applySelected() {
    const selectedPhotos = selectedPhotoIds.length > 0;
    const selectedOrigin = draft?.origin?.candidates.find(candidate => candidate.id === selectedOriginId);
    if (!current || current.status !== 'ready' || !draft || (selectedFields.length === 0 && !selectedPhotos && !selectedOrigin)
      || (selectedPhotos && !photoRightsConfirmed) || current.appliedTo || revisionConflict || runStale
      || actionsDisabled || busy || suggestionBusy || generationClaimed || applyLock.current || transferConfirmation) return;
    const selectedEdits = Object.fromEntries(selectedFields
      .filter(field => edits[field] !== undefined)
      .map(field => [field, edits[field]])) as Partial<Record<AiField, string>>;
    setTransferConfirmation({
      mode: 'apply',
      identity,
      run: current,
      entry,
      fields: [...selectedFields],
      photoIds: [...selectedPhotoIds],
      edits: selectedEdits,
      ...(selectedOrigin && draft.origin ? { origin: {
        lookupId: draft.origin.lookupId,
        candidateId: selectedOrigin.id,
        label: selectedOrigin.label,
        latitude: selectedOrigin.latitude,
        longitude: selectedOrigin.longitude,
        url: selectedOrigin.url,
      } } : {}),
    });
  }
  function releaseApplyClaim() {
    applyLock.current = false;
    if (applyClaimedRef.current) {
      applyClaimedRef.current = false;
      setGenerationClaimed(false);
    }
  }
  async function confirmSelectedTransfer() {
    const confirmation = transferConfirmation;
    if (!confirmation || confirmation.mode !== 'apply' || applyLock.current || !mountedRef.current
      || identityRef.current !== confirmation.identity
      || entryIdRef.current !== confirmation.entry.id
      || current?.id !== confirmation.run.id
      || actionsDisabled || current.appliedTo || revisionConflict || runStale || busy || suggestionBusy || generationClaimed) return;
    const photos = confirmation.photoIds.length > 0;
    if (!confirmation.fields.length && !photos && !confirmation.origin) return;
    if (photos && (!photoRightsConfirmed || confirmation.photoIds.some(id => !selectedPhotoIds.includes(id)))) {
      setTransferConfirmation(null);
      return;
    }
    if (confirmation.origin && (selectedOriginId !== confirmation.origin.candidateId
      || draft?.origin?.lookupId !== confirmation.origin.lookupId
      || !draft.origin.candidates.some(candidate => candidate.id === confirmation.origin?.candidateId))) {
      setTransferConfirmation(null);
      setError('Выбранная точка больше не совпадает с предпросмотром. Выберите её повторно и подтвердите перенос.');
      return;
    }
    applyLock.current = true;
    applyClaimedRef.current = true;
    setGenerationClaimed(true);
    setBusy(true);
    setError('');
    const requestIdentity = confirmation.identity;
    try {
      const updated = await applyDraftWithEdits(confirmation.run, confirmation.entry, confirmation.fields, confirmation.edits,
        photos ? { photoIds: confirmation.photoIds, photoRightsConfirmed: true } : undefined,
        confirmation.origin ? { lookupId: confirmation.origin.lookupId, candidateId: confirmation.origin.candidateId } : undefined);
      if (!mountedRef.current || identityRef.current !== requestIdentity || entryIdRef.current !== updated.id) return;
      setRun({ ...confirmation.run, appliedTo: { entryId: updated.id, revision: updated.revision } });
      setServerTransfer((updated.data as CheeseData).aiResearch);
      if (photos) {
        setSelectedPhotoIds([]);
        setPhotoRightsConfirmed(false);
      }
      setOpen(false);
      setTransferConfirmation(null);
      onApplied(updated, { openEditor: true });
    } catch (issue) {
      if (!mountedRef.current || identityRef.current !== requestIdentity) return;
      setTransferConfirmation(null);
      if (isConflict(issue)) setRevisionConflict(true);
      setError(isConflict(issue)
        ? 'Статья изменилась после создания предложения. Предпросмотр и правки сохранены. Обновите список и сформируйте новое предложение для актуальной версии.'
        : errorMessage(issue));
    } finally {
      releaseApplyClaim();
      if (mountedRef.current) setBusy(false);
    }
  }
  async function importSelectedPhotos() {
    const photoIds = [...selectedPhotoIds];
    if (!current || current.kind !== 'draft' || current.status !== 'ready' || !draft
      || runParams?.entryId !== entry.id || photoIds.length < 1 || photoIds.length > 3
      || actionsDisabled || !photoRightsConfirmed || busy || suggestionBusy || generationClaimed || applyLock.current) return;
    if (transferConfirmation) return;
    setTransferConfirmation({
      mode: 'photos',
      identity,
      run: current,
      entry,
      fields: [],
      photoIds,
      edits: {},
    });
  }
  async function confirmPhotoTransfer() {
    const confirmation = transferConfirmation;
    if (!confirmation || confirmation.mode !== 'photos' || confirmation.fields.length > 0 || !confirmation.photoIds.length
      || applyLock.current || !mountedRef.current || identityRef.current !== confirmation.identity
      || entryIdRef.current !== confirmation.entry.id || current?.id !== confirmation.run.id
      || actionsDisabled || busy || suggestionBusy || generationClaimed || !photoRightsConfirmed
      || confirmation.photoIds.some(id => !selectedPhotoIds.includes(id))) return;
    applyLock.current = true;
    applyClaimedRef.current = true;
    setGenerationClaimed(true);
    setBusy(true);
    setError('');
    const requestIdentity = confirmation.identity;
    try {
      const updated = await editorialAiApi.importPhotos(confirmation.run, confirmation.entry, confirmation.photoIds, true);
      if (!mountedRef.current || identityRef.current !== requestIdentity || entryIdRef.current !== updated.id) return;
      setSelectedPhotoIds([]);
      setPhotoRightsConfirmed(false);
      setServerTransfer((updated.data as CheeseData).aiResearch);
      setOpen(false);
      setTransferConfirmation(null);
      onApplied(updated, { openEditor: true });
    } catch (issue) {
      if (!mountedRef.current || identityRef.current !== requestIdentity || entryIdRef.current !== entry.id) return;
      setTransferConfirmation(null);
      if (isConflict(issue)) setRevisionConflict(true);
      setError(isConflict(issue)
        ? 'Статья изменилась во время импорта фотографий. Обновите список и повторите импорт для актуальной версии.'
        : errorMessage(issue));
    } finally {
      releaseApplyClaim();
      if (mountedRef.current) setBusy(false);
    }
  }
  function updateProposal(field: AiField, value: string) {
    setEdits(currentEdits => {
      const next = { ...currentEdits };
      if (value === (draft?.fields[field] || '')) delete next[field];
      else next[field] = value;
      return next;
    });
  }
  function toggleField(field: AiField) {
    setSelectedFields(currentFields => currentFields.includes(field) ? currentFields.filter(value => value !== field) : [...currentFields, field]);
  }
  function togglePhoto(id: string) {
    setSelectedPhotoIds(currentIds => {
      const next = currentIds.includes(id) ? currentIds.filter(value => value !== id) : currentIds.length < 3 ? [...currentIds, id] : currentIds;
      return next;
    });
    setPhotoRightsConfirmed(false);
  }
  function selectAllDraftFields() {
    if (!draft || current?.appliedTo || revisionConflict || runStale || busy || suggestionBusy || globalAiBusy || generationClaimed || Boolean(activeId) || applyLock.current) return;
    setSelectedFields(AI_FIELDS.filter(field => draft.fields[field.key] !== undefined).map(field => field.key));
  }
  if (mode === 'research') {
    return <section data-testid={`ai-draft-entry-${entry.id}`} className="editorial-ai mt-3 border-t border-[#e2e0d5] pt-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#8a654e]" htmlFor={`ai-cheese-title-${entry.id}`}>Сыр по-русски<Input id={`ai-cheese-title-${entry.id}`} value={identityForm.title} maxLength={200} disabled={componentBusy || actionsDisabled} onChange={event => setIdentityForm(current => ({ ...current, title: event.target.value }))} /></label>
        <label className="space-y-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#8a654e]" htmlFor={`ai-cheese-original-${entry.id}`}>Оригинальное название<Input id={`ai-cheese-original-${entry.id}`} value={identityForm.nameOriginal} maxLength={200} disabled={componentBusy || actionsDisabled} onChange={event => setIdentityForm(current => ({ ...current, nameOriginal: event.target.value }))} /></label>
        <label className="space-y-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#8a654e]" htmlFor={`ai-cheese-country-${entry.id}`}>Страна происхождения<Input id={`ai-cheese-country-${entry.id}`} value={identityForm.country} maxLength={100} disabled={componentBusy || actionsDisabled} onChange={event => setIdentityForm(current => ({ ...current, country: event.target.value }))} /></label>
        <label className="space-y-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#8a654e]" htmlFor={`ai-cheese-region-${entry.id}`}>Регион<Input id={`ai-cheese-region-${entry.id}`} value={identityForm.region} maxLength={2000} disabled={componentBusy || actionsDisabled} onChange={event => setIdentityForm(current => ({ ...current, region: event.target.value }))} /></label>
      </div>
      {identityError && <div role="alert" className="mt-2 rounded border border-[#d79c89] bg-[#faeee9] p-2.5 text-xs text-[#8b4535]">{identityError}</div>}
      <Button data-testid="ai-full-draft-research" className="mt-3 bg-[#315647] text-[#f7f4e9] hover:bg-[#244537]" disabled={busy || suggestionBusy || globalAiBusy || Boolean(activeId) || applyLock.current || identitySaving || identityStale || actionsDisabled} onClick={() => { void startFullDraftResearch(); }}>
        {busy || activeId || identitySaving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}{identitySaving ? 'Сохраняем сведения…' : 'Полный черновик…'}
      </Button>
      {error && <div role="alert" className="mt-3 rounded border border-[#d79c89] bg-[#faeee9] p-3 text-sm text-[#8b4535]">{error}</div>}
      <RunState run={current} error={polled.isError && activeId ? polled.error : undefined} />
      {current?.status === 'running' && <p role="status" className="mt-2 text-xs text-[#718075]">Ищем и готовим редакторское предложение. Запись не меняется до подтверждения в карточке.</p>}
      {current?.status === 'ready' && <p role="status" className="mt-2 text-xs text-[#365b42]">Черновик готов — открываем редакторскую проверку. Ничего не опубликовано.</p>}
    </section>;
  }
  return <fieldset disabled={actionsDisabled} data-testid={`ai-draft-entry-${entry.id}`} className="editorial-ai m-0 min-w-0 border-0 p-0 pt-3">
    {actionsDisabled && <p className="mb-2 rounded border border-[#dfc9b5] bg-[#f5ece2] p-2.5 text-xs leading-5 text-[#684b3d]">Сначала сохраните или отмените изменения статьи. Исследование работает только с сохранённой ревизией.</p>}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><p className="ai-kicker">Редакторская сверка источников</p><p className="mt-1 text-xs text-[#6f7b71]">Предложение по выбранным ссылкам · не автоматическая проверка истинности</p></div>
       <div className="flex flex-wrap items-center gap-2">
       {researchMarker && <span data-testid="ai-research-transferred" role="status" className="inline-flex flex-wrap items-center gap-1.5 rounded-full border border-[#b8c9b8] bg-[#edf3eb] px-2.5 py-1 text-xs font-medium text-[#365b42]"><Check className="h-3.5 w-3.5" /><span>Данные исследования перенесены</span><span className="font-normal text-[#627365]">· поиск {prettyDate(researchMarker.searchedAt)} · перенос {prettyDate(researchMarker.transferredAt)}</span></span>}
      <Button size="sm" variant="outline" disabled={actionsDisabled || busy || suggestionBusy || globalAiBusy || Boolean(activeId)} onClick={() => {
        if (lock.current || applyLock.current) return;
        if (!open) setOpen(true);
        else if (confirmDiscardChanges('Закрыть панель')) setOpen(false);
      }} aria-expanded={open} data-testid={`ai-research-toggle-${entry.id}`}><Sparkles className="mr-1.5 h-4 w-4" />{open ? 'Свернуть' : researchMarker ? 'Открыть исследование' : 'Подготовить с ИИ'}</Button>
       </div>
    </div>
     {open && <div className="mt-3 rounded border border-[#e0dfd4] bg-[#f8f7f0] p-3">
      <label className="block text-sm font-medium" htmlFor={`ai-sources-${entry.id}`}>Источники для анализа, только выбранные оператором</label>
        <textarea id={`ai-sources-${entry.id}`} className="mt-1 min-h-24 w-full rounded border border-[#d8d9cc] bg-[#fbfaf5] p-2 text-sm" value={sourcesText} onChange={event => setSourcesText(event.target.value)} maxLength={6000} disabled={actionsDisabled || busy || suggestionBusy || globalAiBusy || Boolean(activeId)} placeholder="https://… · до трёх ссылок, по одной на строку" />
       <p className="mt-1 text-xs text-[#78837a]">До трёх публичных https-ссылок, по одной на строку. Поиск выполняется только по отдельному нажатию.</p>
      <SourcesSuggestions
        entry={entry}
        sourcesText={sourcesText}
         disabled={busy || suggestionBusy || globalAiBusy || Boolean(activeId) || applyLock.current}
        tryClaim={tryClaimSuggestion}
        releaseClaim={releaseSuggestionClaim}
        onBusyChange={setSuggestionBusy}
        onAppend={urls => {
         const existing = sourcesText.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
         const additions = urls.filter(url => !existing.includes(url));
         const uniqueExisting = Array.from(new Set(existing));
         if (existing.length + additions.length > 3 || uniqueExisting.length + additions.length > 3) {
           setError('Можно использовать не более трёх уникальных ссылок. Удалите лишние строки в поле источников и повторите добавление.');
           return;
         }
         setSourcesText(current => `${current.trimEnd()}${current.trim() ? '\n' : ''}${additions.join('\n')}`);
         setError('');
        }}
      />
       <div className="mt-3 flex flex-wrap gap-2">
          <Button data-testid="ai-draft-research" size="sm" className="bg-[#315647] hover:bg-[#244537]" disabled={actionsDisabled || busy || suggestionBusy || globalAiBusy || Boolean(activeId) || applyLock.current} onClick={() => { void researchDraft(); }}><FileSearch className="mr-1.5 h-4 w-4" />Найти источники и подготовить текст</Button>
          <Button data-testid="ai-full-draft-research" size="sm" variant="outline" disabled={actionsDisabled || busy || suggestionBusy || globalAiBusy || Boolean(activeId) || applyLock.current} onClick={() => { void researchDraft({ fullDraft: true }); }}><Sparkles className="mr-1.5 h-4 w-4" />Полный черновик · фото и геоточка</Button>
          <Button data-testid="ai-alternative-full-draft" size="sm" variant="outline" disabled={actionsDisabled || busy || suggestionBusy || globalAiBusy || Boolean(activeId) || applyLock.current || !previousSearchRunId} onClick={() => {
            if (!previousSearchRunId) return;
            void researchDraft({
              fullDraft: true,
              replacingCurrent: true,
              intent: { mode: 'alternative', previousRunId: previousSearchRunId },
            });
          }}><RotateCcw className="mr-1.5 h-4 w-4" />Альтернативный поиск · полный черновик</Button>
          <Button data-testid="ai-draft-generate" size="sm" variant="outline" disabled={actionsDisabled || busy || suggestionBusy || globalAiBusy || Boolean(activeId) || applyLock.current} onClick={() => { void generateDraft(); }}><Sparkles className="mr-1.5 h-4 w-4" />Сформировать только по этим ссылкам</Button>
          <button data-testid="ai-draft-history" className="text-xs text-[#51665a] underline underline-offset-2 disabled:opacity-50" disabled={actionsDisabled || busy || suggestionBusy || globalAiBusy || Boolean(activeId)} onClick={() => setHistoryOpen(value => !value)}>История предложений</button>
       </div>
       {error && <div role="alert" className="mt-3 rounded border border-[#d79c89] bg-[#faeee9] p-3 text-sm text-[#8b4535]">{error}{isConflict({ status: 409, message: error }) && <button className="ml-2 underline" onClick={() => onApplied()}>Обновить список</button>}</div>}
      <RunState run={current} error={polled.isError && activeId ? polled.error : undefined} />
      {current && <p className="mt-3 text-xs text-[#718075]">{current.model} · {prettyDate(current.createdAt)} · статус: {current.status === 'ready' ? 'готово' : current.status === 'running' ? 'выполняется' : 'ошибка'}{current.appliedTo ? ' · уже применено' : ''}</p>}
        <SectionResearchControls
        instructions={deepInstructions}
        onInstructionsChange={setDeepInstructions}
        disabled={actionsDisabled || busy || suggestionBusy || globalAiBusy || Boolean(activeId) || applyLock.current}
        hasPreviousRun={Boolean(previousSearchRunId)}
        onResearch={(field, mode, instructions) => {
          const boundedInstructions = instructions.trim().slice(0, 500);
          void researchDraft({
            ...(mode === 'alternative' ? { fullDraft: true } : {}),
            intent: {
              mode,
              field,
              ...(previousSearchRunId ? { previousRunId: previousSearchRunId } : {}),
              ...(boundedInstructions ? { instructions: boundedInstructions } : {}),
            },
          });
        }}
      />
         {current?.kind === 'draft' && (current.result as DraftResult | null)?.research && <ResearchDiagnostics report={(current.result as DraftResult).research!} sources={(current.result as DraftResult).sources || []} missingContext={[
         !entryData.history?.trim() && 'История',
         !entryData.country?.trim() && 'Страна происхождения',
         !entryData.region?.trim() && 'Регион',
         !entryData.characteristics?.trim() && 'Характеристики',
         !entryData.culinaryUses?.trim() && 'Кулинарное использование',
         (entryData.latitude == null || entryData.longitude == null) && 'Координаты происхождения',
         ].filter((value): value is string => Boolean(value))} sourcesText={sourcesText} disabled={busy || suggestionBusy || globalAiBusy || Boolean(activeId) || applyLock.current} selectedPhotoIds={selectedPhotoIds} photoRightsConfirmed={photoRightsConfirmed} canSelectPhotos={current.status === 'ready' && runParams?.entryId === entry.id} canImportPhotos={current.status === 'ready' && runParams?.entryId === entry.id} onTogglePhoto={togglePhoto} onPhotoRightsChange={setPhotoRightsConfirmed} onImportPhotos={() => { void importSelectedPhotos(); }} onAppend={urls => {
         const existing = sourcesText.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
         const unique = Array.from(new Set(existing));
         const additions = urls.filter(url => !unique.includes(url));
         if (existing.length + additions.length > 3 || unique.length + additions.length > 3) {
           setError('Можно использовать не более трёх ссылок. Удалите лишние строки вручную и повторите добавление.');
           return;
         }
         setSourcesText(currentText => `${currentText.trimEnd()}${currentText.trim() ? '\n' : ''}${additions.join('\n')}`);
         setError('');
       }} />}
        <OriginCoordinates entry={entry} disabled={busy || suggestionBusy || globalAiBusy || Boolean(activeId) || applyLock.current} readyTextPendingApply={readyTextPendingApply} isGlobalBusy={() => generationClaimed} tryClaim={tryClaimSuggestion} releaseClaim={releaseSuggestionClaim} onBusyChange={setSuggestionBusy} onApplied={saved => onApplied(saved)} />
        {draft && <DraftPreview draft={draft} entryData={entryData} edits={edits} selectedFields={selectedFields} selectedPhotoIds={selectedPhotoIds} photoRightsConfirmed={photoRightsConfirmed} selectedOriginId={selectedOriginId} onOriginChange={setSelectedOriginId} applied={Boolean(current?.appliedTo)} stale={revisionConflict || runStale} onToggle={toggleField} onSelectAll={selectAllDraftFields} onEdit={updateProposal} onApply={() => { void applySelected(); }} busy={busy || suggestionBusy || globalAiBusy || Boolean(activeId) || applyLock.current} />}
      {historyOpen && <div className="mt-3 space-y-2">
        {history.isLoading && <div className="h-12 animate-pulse rounded bg-[#e7e6dc]" />}
        {history.isError && <div role="alert" className="flex justify-between rounded border border-[#d79c89] bg-[#faeee9] p-3 text-sm text-[#8b4535]">{errorMessage(history.error)}<Button size="sm" variant="outline" disabled={busy || suggestionBusy || globalAiBusy} onClick={() => { void history.refetch(); }}>Повторить</Button></div>}
        {!history.isLoading && !history.isError && entryRuns.length === 0 && <p className="rounded border border-dashed border-[#c9cbbf] p-3 text-sm text-[#718075]">Предложений для этой статьи пока нет.</p>}
        {entryRuns.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#e0dfd4] bg-[#fbfaf5] p-2 text-xs"><span>{prettyDate(item.createdAt)} · {item.status === 'ready' ? 'готово' : item.status === 'running' ? 'выполняется' : `ошибка: ${item.error || 'причина не указана'}`}</span><Button size="sm" variant="outline" disabled={busy || suggestionBusy || globalAiBusy || Boolean(activeId)} onClick={() => { void openHistoryRun(item); }}>Открыть</Button></div>)}
        {(history.data?.total || 0) > (history.data?.limit || PAGE_SIZE) && <div className="flex justify-end gap-2"><Button size="sm" variant="outline" disabled={busy || suggestionBusy || globalAiBusy || historyPage <= 1} onClick={() => setHistoryPage(page => page - 1)}>Назад</Button><span className="py-2 text-xs">Страница {historyPage}</span><Button size="sm" variant="outline" disabled={busy || suggestionBusy || globalAiBusy || historyPage * (history.data?.limit || PAGE_SIZE) >= (history.data?.total || 0)} onClick={() => setHistoryPage(page => page + 1)}>Далее</Button></div>}
      </div>}
    </div>}
    <Dialog open={Boolean(transferConfirmation)} onOpenChange={openDialog => {
      if (!openDialog && !actionsDisabled && !applyLock.current) setTransferConfirmation(null);
    }}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto border-[#d8d9cc] bg-[#fbfaf5] text-[#29352f] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Подтвердите перенос</DialogTitle>
          <DialogDescription className="text-[#68746b]">
            Проверьте выбранные данные для статьи. До подтверждения ничего не сохраняется.
          </DialogDescription>
        </DialogHeader>
        {transferConfirmation && <div className="space-y-4">
          <div className="rounded border border-[#deddd2] bg-[#f1f0e8] p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8a654e]">Статья</p>
            <p className="mt-1 font-serif text-lg">{(transferConfirmation.entry.data as CheeseData).title || 'Без названия'}</p>
            <p className="mt-1 text-xs text-[#718075]">Текущая версия · ревизия {transferConfirmation.entry.revision}</p>
          </div>
          {transferConfirmation.fields.length > 0 && <section aria-label="Текстовые поля к переносу">
            <h3 className="text-sm font-semibold">Текстовые поля</h3>
            <ul className="mt-2 space-y-2">
              {transferConfirmation.fields.map(key => {
                const field = AI_FIELDS.find(item => item.key === key);
                if (!field) return null;
                const value = transferConfirmation.edits[key] ?? (draft?.fields[key] || '');
                return <li key={key} className="rounded border border-[#e0dfd4] bg-white/70 p-3">
                  <p className="text-xs font-semibold text-[#526158]">{field.label}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-[#29352f]">{value || 'Пустое значение'}</p>
                </li>;
              })}
            </ul>
          </section>}
          {transferConfirmation.photoIds.length > 0 && <section aria-label="Фотографии к переносу">
            <h3 className="text-sm font-semibold">Фотографии · {transferConfirmation.photoIds.length}</h3>
            <ul className="mt-2 space-y-2">
              {transferConfirmation.photoIds.map(photoId => {
                const photo = draft?.research?.photos?.find(item => item.id === photoId);
                return <li key={photoId} className="rounded border border-[#e0dfd4] bg-white/70 p-3">
                  <p className="break-words text-sm font-medium">{photo?.label || `Фотография ${photoId}`}</p>
                  {photo?.sourceUrl && <p className="mt-1 break-all text-xs text-[#718075]">{photo.sourceUrl}</p>}
                  <p className="mt-1 text-xs text-[#718075]">Права использования подтверждены оператором</p>
                </li>;
              })}
            </ul>
          </section>}
          {transferConfirmation.origin && <section aria-label="Географическая точка к переносу" className="rounded border border-[#e0dfd4] bg-white/70 p-3">
            <h3 className="text-sm font-semibold">Точка происхождения · выбранный геопоиск</h3>
            <p className="mt-1 text-sm">{transferConfirmation.origin.label}</p>
            <p className="mt-1 text-xs text-[#718075]">Координаты: {transferConfirmation.origin.latitude}, {transferConfirmation.origin.longitude}. Это представительская точка, не адрес производителя.</p>
            <a className="mt-1 inline-flex items-center gap-1 text-xs underline" href={transferConfirmation.origin.url} target="_blank" rel="noopener noreferrer">Проверить объект в OpenStreetMap <ExternalLink className="h-3 w-3" /></a>
          </section>}
          <p className="rounded border-l-2 border-[#b66b48] bg-[#f5ece2] px-3 py-2 text-sm leading-5 text-[#684b3d]">
            После сохранения статья останется в статусе «Ожидает подтверждения». Публикации не будет.
          </p>
        </div>}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" disabled={busy || actionsDisabled} onClick={() => setTransferConfirmation(null)}>Отмена</Button>
          <Button
            type="button"
            data-testid="ai-transfer-confirm"
            disabled={busy || actionsDisabled || !transferConfirmation}
            onClick={() => {
              if (transferConfirmation?.mode === 'photos') void confirmPhotoTransfer();
              else void confirmSelectedTransfer();
            }}
            className="bg-[#315647] text-[#f7f4e9] hover:bg-[#244537]"
          >
            {busy ? 'Сохраняем…' : 'Вставить и открыть редактор'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </fieldset>;
}

type DeepResearchField = Extract<AiField, 'history' | 'characteristics' | 'culinaryUses' | 'description' | 'region'>;
const DEEP_RESEARCH_FIELDS: { key: DeepResearchField; label: string }[] = [
  { key: 'history', label: 'История' },
  { key: 'characteristics', label: 'Характеристики' },
  { key: 'culinaryUses', label: 'Кулинарное использование' },
  { key: 'description', label: 'Описание' },
  { key: 'region', label: 'Регион' },
];

function SectionResearchControls({
  instructions,
  onInstructionsChange,
  disabled,
  hasPreviousRun,
  onResearch,
}: {
  instructions: Partial<Record<AiField, string>>;
  onInstructionsChange: (next: Partial<Record<AiField, string>>) => void;
  disabled: boolean;
  hasPreviousRun: boolean;
  onResearch: (field: DeepResearchField, mode: 'deepen' | 'alternative', instructions: string) => void;
}) {
  return <section data-testid="ai-section-research-controls" className="mt-4 rounded border border-[#d8d9cc] bg-[#f1f0e8] p-3">
    <div>
      <p className="text-sm font-semibold text-[#43574a]">Точечно доработать раздел</p>
      <p className="mt-1 text-xs leading-5 text-[#78837a]">Доступно для пустого и заполненного текста, в том числе после переноса предыдущего предложения. Новый запуск учитывает текущую ревизию статьи; текущий сохранённый текст не меняется.</p>
    </div>
    <div className="mt-3 grid gap-2 md:grid-cols-2">
      {DEEP_RESEARCH_FIELDS.map(field => <details key={field.key} className="rounded border border-[#dedfd5] bg-[#fbfaf5] p-2.5">
        <summary className="cursor-pointer text-xs font-semibold text-[#51665a]">{field.label} · углубить или искать иначе</summary>
        <label className="mt-2 block text-xs text-[#66736a]" htmlFor={`ai-deepen-instructions-${field.key}`}>Необязательное уточнение · до 500 знаков</label>
        <textarea id={`ai-deepen-instructions-${field.key}`} data-testid={`ai-deepen-instructions-${field.key}`} className="mt-1 min-h-16 w-full rounded border border-[#d8d9cc] bg-[#fbfaf5] p-2 text-xs" maxLength={500} value={instructions[field.key] || ''} onChange={event => onInstructionsChange({ ...instructions, [field.key]: event.target.value })} disabled={disabled} placeholder="Контекст или тип источника для поиска" />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" data-testid={`ai-deepen-${field.key}`} disabled={disabled} onClick={() => onResearch(field.key, 'deepen', instructions[field.key] || '')}><FileSearch className="mr-1.5 h-3.5 w-3.5" />Углубить и дополнить с ИИ</Button>
          <Button type="button" size="sm" variant="outline" data-testid={`ai-alternative-${field.key}`} title={!hasPreviousRun ? 'Для альтернативного поиска сначала выполните исследование' : undefined} disabled={disabled || !hasPreviousRun} onClick={() => onResearch(field.key, 'alternative', instructions[field.key] || '')}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Искать альтернативные источники</Button>
        </div>
        <p className="mt-2 text-[11px] leading-4 text-[#78837a]">До 5 запросов Brave и 1 генерация. Для альтернативного поиска сервер получает ссылку на предыдущий запуск; новые источники не гарантированы.</p>
      </details>)}
    </div>
  </section>;
}

function DraftPreview({ draft, entryData, edits, selectedFields, selectedPhotoIds, photoRightsConfirmed, selectedOriginId, onOriginChange, applied, stale, onToggle, onSelectAll, onEdit, onApply, busy }: {
  draft: DraftResult;
  entryData: CheeseData;
  edits: Partial<Record<AiField, string>>;
  selectedFields: AiField[];
  selectedPhotoIds: string[];
  photoRightsConfirmed: boolean;
  selectedOriginId: string;
  onOriginChange: (id: string) => void;
  applied: boolean;
  stale: boolean;
  onToggle: (field: AiField) => void;
  onSelectAll: () => void;
  onEdit: (field: AiField, value: string) => void;
  onApply: () => void;
  busy: boolean;
}) {
  const availableFields = AI_FIELDS.filter(field => draft.fields[field.key] !== undefined);
  const statusId = useId();
  const selectedCount = availableFields.filter(field => selectedFields.includes(field.key)).length;
  const allSelected = availableFields.length > 0 && selectedCount === availableFields.length;
  const selectedOrigin = draft.origin?.candidates.find(item => item.id === selectedOriginId);
  const selectedPhotos = (draft.research?.photos || []).filter(photo => selectedPhotoIds.includes(photo.id));
  const integratedValues: Partial<Record<AiField, string>> = {
    title: entryData.title || '',
    description: entryData.description || '',
    country: entryData.country || '',
    region: entryData.region || '',
    history: entryData.history || '',
    characteristics: entryData.characteristics || '',
    culinaryUses: entryData.culinaryUses || '',
  };
  for (const field of selectedFields) integratedValues[field] = edits[field] ?? draft.fields[field] ?? '';
  const applyAction = selectedOrigin
    ? selectedPhotoIds.length && selectedCount ? '«Применить текст, фото и точку»'
      : selectedPhotoIds.length ? '«Применить фото и точку»'
        : selectedCount ? '«Применить текст и точку»' : '«Применить выбранную точку»'
    : selectedPhotoIds.length > 0
      ? selectedCount > 0 ? '«Применить выбранный текст и фото»' : '«Применить выбранные фото»'
      : '«Применить выбранные поля»';
  const selectionStatus = busy
    ? 'Выбор временно недоступен: выполняется другое действие. Дождитесь его завершения.'
    : applied
      ? 'Это предложение уже применено; повторный выбор и сохранение недоступны.'
      : stale
        ? 'Версия записи изменилась: выбор недоступен. Сформируйте новое предложение для актуальной версии.'
        : availableFields.length === 0
          ? 'В предложении нет текстовых полей для выбора.'
          : allSelected
            ? `Все доступные поля уже отмечены. Повторное нажатие безопасно. Выбор сам по себе ничего не сохраняет — для сохранения нажмите ${applyAction}.`
            : `Отметьте нужные поля или нажмите «Добавить всё». Выбор сам по себе ничего не сохраняет — для сохранения нажмите ${applyAction}.`;
  return <div className="mt-4 space-y-3">
    <div className="rounded border border-[#dfc9b5] bg-[#f5ece2] p-3 text-xs leading-5 text-[#75533e]"><strong>Проверка обязательна.</strong> Цитаты сопоставлены сервером с извлечённым текстом источников; это не семантическая верификация фактов. Оператор проверяет все утверждения.</div>
    {draft.warnings.length > 0 && <div className="rounded border border-[#dfc9b5] bg-[#f5ece2] p-3 text-sm text-[#75533e]"><strong>Замечания модели</strong><ul className="mt-1 list-inside list-disc">{draft.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></div>}
    <IntegratedDraftPreview values={integratedValues} originalName={entryData.nameOriginal} proposedFields={selectedFields} photos={selectedPhotos} savedPhotos={entryData.photos || []} savedSourceCount={entryData.sources?.length || 0} researchSourceCount={draft.sources.length} candidate={selectedOrigin} savedPoint={{ latitude: entryData.latitude, longitude: entryData.longitude }} hasOriginCandidate={Boolean(draft.origin?.candidates.length)} />
    {draft.origin && <section data-testid="ai-draft-origin-candidates" className="rounded border border-[#d8d9cc] bg-[#fbfaf5] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-semibold text-[#43574a]">Кандидаты точки происхождения</h3><p className="mt-1 text-xs leading-5 text-[#718075]">Результат серверного геопоиска. Ничего не выбрано по умолчанию: проверьте вариант и отметьте подходящую точку.</p></div><span className="text-[11px] text-[#78837a]">{draft.origin.candidates.length} найдено</span></div>
      {draft.origin.candidates.length ? <fieldset className="mt-3 space-y-2"><legend className="sr-only">Выберите точку для предпросмотра и переноса</legend>
        {draft.origin.candidates.map(item => <label key={item.id} className="flex cursor-pointer items-start gap-2 rounded border border-[#e0dfd4] bg-[#f8f7f0] p-2.5 text-xs">
          <input type="radio" name={`draft-origin-${draft.origin?.lookupId}`} className="mt-0.5 accent-[#315647]" checked={selectedOriginId === item.id} onChange={() => onOriginChange(item.id)} disabled={busy || applied || stale} />
          <span className="min-w-0 flex-1"><strong className="block text-sm text-[#43574a]">{item.label}</strong><span className="mt-1 block">Координаты: {item.latitude}, {item.longitude}</span><a href={item.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 break-all underline underline-offset-2">Проверить объект в OpenStreetMap <ExternalLink className="h-3 w-3" /></a></span>
        </label>)}
      </fieldset> : <p className="mt-2 rounded border border-dashed border-[#c9cbbf] p-3 text-xs text-[#718075]">Геопоиск не вернул кандидатов. Координаты останутся незаполненными.</p>}
      {selectedOriginId && <p className="mt-2 text-xs text-[#8b5d43]">Выбранная точка переносится после отдельного подтверждения — самостоятельно или вместе с отмеченным текстом и фото.</p>}
    </section>}
    <div className="flex flex-col gap-2 rounded border border-[#e0dfd4] bg-[#f1f0e8] p-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs leading-5 text-[#66736a]" aria-live="polite" aria-atomic="true" id={statusId}>Выбрано {selectedCount} из {availableFields.length}. {selectionStatus}</p>
      </div>
      <Button data-testid="ai-draft-select-all" size="sm" variant="outline" disabled={busy || applied || stale || availableFields.length === 0} onClick={onSelectAll} aria-describedby={statusId}>{allSelected ? 'Всё выбрано' : 'Добавить всё'}</Button>
    </div>
    <div className="space-y-2">{availableFields.map(field => {
      const proposal = draft.fields[field.key] || '';
      const current = String(entryData[field.prop] || '');
      const citations = draft.citations.filter(citation => citation.field === field.key);
      return <article key={field.key} className="rounded border border-[#e0dfd4] bg-[#fbfaf5] p-3">
        <label className="flex items-start gap-2"><input className="mt-1 accent-[#315647]" type="checkbox" checked={selectedFields.includes(field.key)} onChange={() => onToggle(field.key)} disabled={applied || stale || busy} /><span className="font-semibold">{field.label}</span></label>
        <div className="mt-2 grid gap-3 md:grid-cols-2"><div><p className="text-[10px] font-bold uppercase tracking-wider text-[#8a9188]">Сейчас</p><p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-[#6f7b71]">{current || 'Поле пустое'}</p></div><div><label className="text-[10px] font-bold uppercase tracking-wider text-[#a45f43]" htmlFor={`ai-proposal-${field.key}`}>Редактируемый вариант</label><textarea id={`ai-proposal-${field.key}`} data-testid={`ai-proposal-${field.key}`} className="mt-1 min-h-24 w-full rounded border border-[#d8d9cc] bg-white p-2 text-sm leading-5" value={edits[field.key] ?? proposal} onChange={event => onEdit(field.key, event.target.value)} disabled={applied || stale || busy} /></div></div>
        {edits[field.key] !== undefined && edits[field.key] !== proposal && <p className="mt-2 text-xs text-[#8b5d43]">Редакторская правка. Цитаты ниже относятся к исходному варианту AI, а не подтверждают добавленный вами текст.</p>}
         {citations.length > 0 && <div className="mt-2 space-y-1">{citations.map((citation, index) => {
           const source = draft.sources[citation.sourceIndex];
           return <blockquote key={`${citation.sourceIndex}-${index}`} className="border-l-2 border-[#b67b5a] pl-2 text-xs italic text-[#68746b]">«{citation.quote}» · {source ? <a className="underline underline-offset-2" href={source.finalUrl} target="_blank" rel="noopener noreferrer">источник {citation.sourceIndex + 1}: {source.title || source.finalUrl}</a> : `источник ${citation.sourceIndex + 1}`} · цитата исходного варианта</blockquote>;
         })}</div>}
      </article>;
    })}</div>
    {draft.sources.length > 0 && <div className="rounded border border-[#e0dfd4] bg-[#f1f0e8] p-3 text-xs"><strong>Полученные источники</strong><ul className="mt-1 space-y-1">{draft.sources.map((source, index) => <li key={`${source.sha256}-${index}`}><a className="break-all underline underline-offset-2" href={source.finalUrl} target="_blank" rel="noreferrer">{source.title || source.finalUrl}</a><span className="ml-1 text-[#7a857b]">· получен {prettyDate(source.retrievedAt)} · {source.characters.toLocaleString('ru-RU')} знаков · SHA-256 {source.sha256.slice(0, 12)}…{source.truncated ? ' · текст усечён' : ''}</span></li>)}</ul></div>}
    {selectedPhotoIds.length > 0 && <p className="text-xs text-[#8b5d43]">{photoRightsConfirmed ? 'Оператор подтвердил право использования отмеченных фотографий.' : 'Для переноса фото отдельно подтвердите право использования в блоке фотографий.'}</p>}
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-[#718075]">{stale ? 'Версия записи изменилась. Обновите запись и сформируйте новое предложение для актуальной версии.' : 'Применяются только отмеченные поля, выбранные фотографии и, если отмечена, точка. После переноса статья останется на проверке; публикации не будет.'}</p><Button data-testid="ai-draft-apply" disabled={busy || applied || stale || (selectedFields.length === 0 && selectedPhotoIds.length === 0 && !selectedOrigin) || (selectedPhotoIds.length > 0 && !photoRightsConfirmed)} onClick={onApply} className="bg-[#315647] hover:bg-[#244537]">{applied ? 'Уже применено' : selectedOrigin
      ? selectedPhotoIds.length && selectedFields.length ? 'Применить текст, фото и точку'
        : selectedPhotoIds.length ? 'Применить фото и точку'
          : selectedFields.length ? 'Применить текст и точку' : 'Применить выбранную точку'
      : selectedFields.length && selectedPhotoIds.length ? 'Применить выбранный текст и фото'
        : selectedPhotoIds.length ? 'Применить выбранные фото'
          : 'Применить выбранные поля'}</Button></div>
  </div>;
}
