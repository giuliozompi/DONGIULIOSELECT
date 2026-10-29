import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, ChevronDown, ChevronUp, FileSearch, History, LoaderCircle, RotateCcw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { editorialAiCountries, countryName, type CatalogItem, type EditorialAiRun, type AiField, type DraftResult, type CatalogResult } from '@shared/editorial-ai';
import type { CheeseData, EditorialEntry } from '@shared/editorial';
import { editorialAiApi } from '../../lib/editorialAiApi';
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
const nativeSelect = 'ai-native-select';
let generationClaimed = false;
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
) => Promise<EditorialEntry>;
const applyDraftWithEdits = editorialAiApi.apply as unknown as ApplyDraftWithEdits;

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
    if (claimRef.current) { claimRef.current = false; generationClaimed = false; }
  }, []);

  const history = useQuery({
    queryKey: ['/admin/editorial-ai/history', 'catalog', historyPage],
    queryFn: () => editorialAiApi.history('catalog', historyPage),
    enabled: expanded && historyOpen,
    retry: 1,
  });
  const activeRunId = running(run) ? run?.id : undefined;
  const polled = useRunPoll(activeRunId, Boolean(activeRunId));
  const currentRun = polled.data || run;
  useEffect(() => {
    if (claimRef.current && currentRun && currentRun.status !== 'running') {
      claimRef.current = false;
      generationClaimed = false;
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
    generationClaimed = true;
    setBusy(true);
    return true;
  };
  const release = () => {
    claimRef.current = false;
    generationClaimed = false;
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
      generationClaimed = true;
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

export function CheeseAiDraft({ entry, onApplied }: { entry: EditorialEntry; onApplied: () => void }) {
  const initialSources = ((entry.data as CheeseData).sources || []).join('\n');
  const [open, setOpen] = useState(false);
  const [sourcesText, setSourcesText] = useState(initialSources);
  const [run, setRun] = useState<EditorialAiRun>();
  const [selectedFields, setSelectedFields] = useState<AiField[]>([]);
  const [edits, setEdits] = useState<Partial<Record<AiField, string>>>({});
  const [revisionConflict, setRevisionConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const lock = useRef(false);
  const applyLock = useRef(false);
  useEffect(() => () => {
    if (lock.current) { lock.current = false; generationClaimed = false; }
  }, []);
  const sourceBaseline = useRef(initialSources);
  const history = useQuery({
    queryKey: ['/admin/editorial-ai/history', 'draft', entry.id, historyPage],
    queryFn: () => draftHistoryForEntry('draft', historyPage, entry.id),
    enabled: open && historyOpen,
    retry: 1,
  });
  const activeId = running(run) ? run?.id : undefined;
  const polled = useRunPoll(activeId, Boolean(activeId));
  const current = polled.data || run;
  useEffect(() => {
    if (lock.current && current && current.status !== 'running') {
      lock.current = false;
      generationClaimed = false;
      setBusy(false);
    }
  }, [current?.id, current?.status]);
  const draft = current?.status === 'ready' ? current.result as DraftResult | null : null;
  const entryData = entry.data as CheeseData;
  const entryRuns = history.data?.items || [];
  const editedProposal = Object.keys(edits).some(key => edits[key as AiField] !== draft?.fields[key as AiField]);
  const hasUnsavedChanges = sourcesText !== sourceBaseline.current || editedProposal;
  function confirmDiscardChanges(action: string) {
    if (!hasUnsavedChanges) return true;
    return window.confirm(`Есть несохранённые ссылки или правки текста предложения. ${action} и потерять их?`);
  }
  async function generateDraft() {
    if (lock.current || generationClaimed) return;
    const sources = sourcesText.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    if (sources.length < 1 || sources.length > 3 || sources.some(url => !/^https:\/\/[^/\s?#]+/i.test(url))) {
      setError('Укажите от одной до трёх ссылок https, по одной на строку.');
      return;
    }
    if (editedProposal && !confirmDiscardChanges('Создать новое предложение')) return;
    lock.current = true;
    generationClaimed = true;
    setBusy(true);
    setError('');
    try {
      const next = await editorialAiApi.draft({ requestId: crypto.randomUUID(), entryId: entry.id, revision: entry.revision, sources });
      setRun(next);
      setSelectedFields([]);
      setEdits({});
      setRevisionConflict(false);
      sourceBaseline.current = sourcesText;
      if (next.status !== 'running') { lock.current = false; generationClaimed = false; setBusy(false); }
    } catch (issue) {
      setError(errorMessage(issue));
      lock.current = false;
      generationClaimed = false;
      setBusy(false);
    }
  }
  async function openHistoryRun(historyRun: EditorialAiRun) {
    if (busy || lock.current || applyLock.current) return;
    if (!confirmDiscardChanges('Открыть другое предложение')) return;
    setError('');
    try {
      const next = historyRun.status === 'running' ? historyRun : await editorialAiApi.run(historyRun.id);
      const historicSources = ((next.params as { sources?: string[] }).sources || []).join('\n');
      setRun(next);
      setEdits({});
      setRevisionConflict(false);
      setSourcesText(historicSources);
      sourceBaseline.current = historicSources;
      setHistoryOpen(false);
      if (next.status === 'running') {
        lock.current = true;
        generationClaimed = true;
        setBusy(true);
      }
    } catch (issue) {
      setError(errorMessage(issue));
    }
  }
  async function applySelected() {
    if (!current || !draft || selectedFields.length === 0 || current.appliedTo || revisionConflict || busy || applyLock.current) return;
    applyLock.current = true;
    const fieldsLabel = selectedFields.map(key => AI_FIELDS.find(field => field.key === key)?.label).join(', ');
    if (!window.confirm(`Применить выбранные поля (${fieldsLabel}) к текущей версии статьи? Фото, координаты, видео, товары и фактическая страна производства не изменятся. Запись останется черновиком.`)) {
      applyLock.current = false;
      return;
    }
    setBusy(true);
    setError('');
    const selectedEdits = Object.fromEntries(selectedFields
      .filter(field => edits[field] !== undefined)
      .map(field => [field, edits[field]])) as Partial<Record<AiField, string>>;
    try {
      const updated = await applyDraftWithEdits(current, entry, selectedFields, selectedEdits);
      setRun({ ...current, appliedTo: { entryId: updated.id, revision: updated.revision } });
      onApplied();
    } catch (issue) {
      if (isConflict(issue)) setRevisionConflict(true);
      setError(isConflict(issue)
        ? 'Статья изменилась после создания предложения. Предпросмотр и правки сохранены. Обновите список и сформируйте новое предложение для актуальной версии.'
        : errorMessage(issue));
    } finally {
      applyLock.current = false;
      setBusy(false);
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
  return <div data-testid={`ai-draft-entry-${entry.id}`} className="editorial-ai mt-3 border-t border-[#e2e0d5] pt-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><p className="ai-kicker">Редакторская сверка источников</p><p className="mt-1 text-xs text-[#6f7b71]">Предложение по выбранным ссылкам · не автоматическая проверка истинности</p></div>
      <Button size="sm" variant="outline" disabled={busy || Boolean(activeId)} onClick={() => {
        if (lock.current || applyLock.current) return;
        if (!open) setOpen(true);
        else if (confirmDiscardChanges('Закрыть панель')) setOpen(false);
      }} aria-expanded={open}><Sparkles className="mr-1.5 h-4 w-4" />{open ? 'Свернуть' : 'Подготовить с ИИ'}</Button>
    </div>
    {open && <div className="mt-3 rounded border border-[#e0dfd4] bg-[#f8f7f0] p-3">
      <label className="block text-sm font-medium" htmlFor={`ai-sources-${entry.id}`}>Источники для анализа, только выбранные оператором</label>
      <textarea id={`ai-sources-${entry.id}`} className="mt-1 min-h-24 w-full rounded border border-[#d8d9cc] bg-[#fbfaf5] p-2 text-sm" value={sourcesText} onChange={event => setSourcesText(event.target.value)} maxLength={6000} placeholder="https://… · до трёх ссылок, по одной на строку" />
      <p className="mt-1 text-xs text-[#78837a]">Укажите 1–3 публичные https-ссылки. Поиск в интернете не выполняется.</p>
      <div className="mt-3 flex flex-wrap gap-2"><Button data-testid="ai-draft-generate" size="sm" className="bg-[#315647] hover:bg-[#244537]" disabled={busy || Boolean(activeId)} onClick={() => { void generateDraft(); }}><Sparkles className="mr-1.5 h-4 w-4" />Сформировать предложение</Button><button data-testid="ai-draft-history" className="text-xs text-[#51665a] underline underline-offset-2 disabled:opacity-50" disabled={busy || Boolean(activeId)} onClick={() => setHistoryOpen(value => !value)}>История предложений</button></div>
      {error && <div role="alert" className="mt-3 rounded border border-[#d79c89] bg-[#faeee9] p-3 text-sm text-[#8b4535]">{error}{isConflict({ status: 409, message: error }) && <button className="ml-2 underline" onClick={onApplied}>Обновить список</button>}</div>}
      <RunState run={current} error={polled.isError && activeId ? polled.error : undefined} />
      {current && <p className="mt-3 text-xs text-[#718075]">{current.model} · {prettyDate(current.createdAt)} · статус: {current.status === 'ready' ? 'готово' : current.status === 'running' ? 'выполняется' : 'ошибка'}{current.appliedTo ? ' · уже применено' : ''}</p>}
      {draft && <DraftPreview draft={draft} entryData={entryData} edits={edits} selectedFields={selectedFields} applied={Boolean(current?.appliedTo)} stale={revisionConflict} onToggle={toggleField} onEdit={updateProposal} onApply={() => { void applySelected(); }} busy={busy} />}
      {historyOpen && <div className="mt-3 space-y-2">
        {history.isLoading && <div className="h-12 animate-pulse rounded bg-[#e7e6dc]" />}
        {history.isError && <div role="alert" className="flex justify-between rounded border border-[#d79c89] bg-[#faeee9] p-3 text-sm text-[#8b4535]">{errorMessage(history.error)}<Button size="sm" variant="outline" onClick={() => { void history.refetch(); }}>Повторить</Button></div>}
        {!history.isLoading && !history.isError && entryRuns.length === 0 && <p className="rounded border border-dashed border-[#c9cbbf] p-3 text-sm text-[#718075]">Предложений для этой статьи пока нет.</p>}
        {entryRuns.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#e0dfd4] bg-[#fbfaf5] p-2 text-xs"><span>{prettyDate(item.createdAt)} · {item.status === 'ready' ? 'готово' : item.status === 'running' ? 'выполняется' : `ошибка: ${item.error || 'причина не указана'}`}</span><Button size="sm" variant="outline" disabled={busy || Boolean(activeId)} onClick={() => { void openHistoryRun(item); }}>Открыть</Button></div>)}
        {(history.data?.total || 0) > (history.data?.limit || PAGE_SIZE) && <div className="flex justify-end gap-2"><Button size="sm" variant="outline" disabled={historyPage <= 1} onClick={() => setHistoryPage(page => page - 1)}>Назад</Button><span className="py-2 text-xs">Страница {historyPage}</span><Button size="sm" variant="outline" disabled={historyPage * (history.data?.limit || PAGE_SIZE) >= (history.data?.total || 0)} onClick={() => setHistoryPage(page => page + 1)}>Далее</Button></div>}
      </div>}
    </div>}
  </div>;
}

function DraftPreview({ draft, entryData, edits, selectedFields, applied, stale, onToggle, onEdit, onApply, busy }: {
  draft: DraftResult; entryData: CheeseData; edits: Partial<Record<AiField, string>>; selectedFields: AiField[]; applied: boolean; stale: boolean;
  onToggle: (field: AiField) => void; onEdit: (field: AiField, value: string) => void; onApply: () => void; busy: boolean;
}) {
  return <div className="mt-4 space-y-3">
    <div className="rounded border border-[#dfc9b5] bg-[#f5ece2] p-3 text-xs leading-5 text-[#75533e]"><strong>Проверка обязательна.</strong> Цитаты сопоставлены сервером с извлечённым текстом источников; это не семантическая верификация фактов. Оператор проверяет все утверждения.</div>
    {draft.warnings.length > 0 && <div className="rounded border border-[#dfc9b5] bg-[#f5ece2] p-3 text-sm text-[#75533e]"><strong>Замечания модели</strong><ul className="mt-1 list-inside list-disc">{draft.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></div>}
    <div className="space-y-2">{AI_FIELDS.filter(field => draft.fields[field.key] !== undefined).map(field => {
      const proposal = draft.fields[field.key] || '';
      const current = String(entryData[field.prop] || '');
      const citations = draft.citations.filter(citation => citation.field === field.key);
      return <article key={field.key} className="rounded border border-[#e0dfd4] bg-[#fbfaf5] p-3">
        <label className="flex items-start gap-2"><input className="mt-1 accent-[#315647]" type="checkbox" checked={selectedFields.includes(field.key)} onChange={() => onToggle(field.key)} disabled={applied || busy} /><span className="font-semibold">{field.label}</span></label>
        <div className="mt-2 grid gap-3 md:grid-cols-2"><div><p className="text-[10px] font-bold uppercase tracking-wider text-[#8a9188]">Сейчас</p><p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-[#6f7b71]">{current || 'Поле пустое'}</p></div><div><label className="text-[10px] font-bold uppercase tracking-wider text-[#a45f43]" htmlFor={`ai-proposal-${field.key}`}>Редактируемый вариант</label><textarea id={`ai-proposal-${field.key}`} data-testid={`ai-proposal-${field.key}`} className="mt-1 min-h-24 w-full rounded border border-[#d8d9cc] bg-white p-2 text-sm leading-5" value={edits[field.key] ?? proposal} onChange={event => onEdit(field.key, event.target.value)} disabled={applied || stale || busy} /></div></div>
        {edits[field.key] !== undefined && edits[field.key] !== proposal && <p className="mt-2 text-xs text-[#8b5d43]">Редакторская правка. Цитаты ниже относятся к исходному варианту AI, а не подтверждают добавленный вами текст.</p>}
        {citations.length > 0 && <div className="mt-2 space-y-1">{citations.map((citation, index) => <blockquote key={`${citation.sourceIndex}-${index}`} className="border-l-2 border-[#b67b5a] pl-2 text-xs italic text-[#68746b]">«{citation.quote}» · источник {citation.sourceIndex + 1} · цитата исходного варианта</blockquote>)}</div>}
      </article>;
    })}</div>
    {draft.sources.length > 0 && <div className="rounded border border-[#e0dfd4] bg-[#f1f0e8] p-3 text-xs"><strong>Полученные источники</strong><ul className="mt-1 space-y-1">{draft.sources.map((source, index) => <li key={`${source.sha256}-${index}`}><a className="break-all underline underline-offset-2" href={source.finalUrl} target="_blank" rel="noreferrer">{source.title || source.finalUrl}</a><span className="ml-1 text-[#7a857b]">· получен {prettyDate(source.retrievedAt)} · {source.characters.toLocaleString('ru-RU')} знаков · SHA-256 {source.sha256.slice(0, 12)}…{source.truncated ? ' · текст усечён' : ''}</span></li>)}</ul></div>}
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-[#718075]">{stale ? 'Версия записи изменилась. Обновите запись и сформируйте новое предложение; текущий предпросмотр сохранён.' : 'Текст можно отредактировать. Применяются только отмеченные поля; запись останется черновиком.'}</p><Button data-testid="ai-draft-apply" disabled={busy || applied || stale || selectedFields.length === 0} onClick={onApply} className="bg-[#315647] hover:bg-[#244537]">{applied ? 'Уже применено' : 'Применить выбранные поля'}</Button></div>
  </div>;
}
