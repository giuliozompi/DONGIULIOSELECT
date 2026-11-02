import { useEffect, useRef, useState } from 'react';
import { ExternalLink, LoaderCircle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EditorialEntry } from '@shared/editorial';
import { editorialSourceUrl, type SourceSuggestions } from '@shared/editorial-ai';
import { editorialAiApi } from '../../lib/editorialAiApi';

const sourceKindLabels: Record<SourceSuggestions['sources'][number]['kind'], string> = {
  consortium: 'Консорциум',
  cooperative: 'Кооператив',
  producer: 'Производитель',
  institution: 'Институция',
};

function errorMessage(error: unknown) {
  return (error as { message?: string })?.message || 'Не удалось выполнить запрос. Повторите попытку.';
}

type SourcesSuggestionsProps = {
  entry: EditorialEntry;
  sourcesText: string;
  disabled: boolean;
  onAppend: (urls: string[]) => void;
  tryClaim: () => boolean;
  releaseClaim: () => void;
  onBusyChange: (busy: boolean) => void;
};

export default function SourcesSuggestions({
  entry,
  sourcesText,
  disabled,
  onAppend,
  tryClaim,
  releaseClaim,
  onBusyChange,
}: SourcesSuggestionsProps) {
  const identity = `${entry.id}:${entry.revision}`;
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const mounted = useRef(false);
  const requestLock = useRef(false);
  const ownsClaim = useRef(false);
  const sequence = useRef(0);
  const appendRef = useRef(onAppend);
  const releaseRef = useRef(releaseClaim);
  appendRef.current = onAppend;
  releaseRef.current = releaseClaim;
  const [items, setItems] = useState<SourceSuggestions['sources']>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      sequence.current += 1;
    };
  }, []);
  useEffect(() => {
    sequence.current += 1;
    setItems([]);
    setWarnings([]);
    setSelected([]);
    setError('');
    setNotice('');
    setLoading(false);
  }, [entry.id, entry.revision]);

  const currentSources = sourcesText.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  const uniqueCurrentSources = Array.from(new Set(currentSources));
  const uniqueCount = uniqueCurrentSources.length;
  const newSelectedCount = selected.filter(url => !uniqueCurrentSources.includes(url)).length;
  const selectionExceedsLimit = uniqueCount > 3
    || uniqueCount + newSelectedCount > 3
    || currentSources.length + newSelectedCount > 3;
  const interactionDisabled = disabled || loading || requestLock.current;

  async function suggest() {
    if (requestLock.current || disabled || !tryClaim()) return;
    ownsClaim.current = true;
    requestLock.current = true;
    const requestIdentity = identity;
    const requestSequence = ++sequence.current;
    onBusyChange(true);
    setItems([]);
    setWarnings([]);
    setSelected([]);
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const result = await editorialAiApi.suggestSources(entry);
      if (!mounted.current || identityRef.current !== requestIdentity || sequence.current !== requestSequence) return;
      const safeSources = result.sources.filter(source => editorialSourceUrl.safeParse(source.url).success);
      setItems(safeSources.slice(0, 3));
      setWarnings(result.warnings);
      if (safeSources.length < result.sources.length) {
        setWarnings(current => [...current, 'Некоторые ссылки не показаны: они не прошли проверку безопасного HTTPS-адреса.']);
      }
      if (safeSources.length === 0) setNotice('Подходящие безопасные ссылки не найдены.');
    } catch (issue) {
      if (mounted.current && identityRef.current === requestIdentity && sequence.current === requestSequence) {
        setError(errorMessage(issue));
      }
    } finally {
      requestLock.current = false;
      if (ownsClaim.current) {
        ownsClaim.current = false;
        releaseRef.current();
        onBusyChange(false);
      }
      if (mounted.current && identityRef.current === requestIdentity && sequence.current === requestSequence) setLoading(false);
    }
  }

  function toggle(url: string) {
    if (interactionDisabled || requestLock.current) return;
    setSelected(current => current.includes(url) ? current.filter(value => value !== url) : [...current, url]);
    setError('');
    setNotice('');
  }

  function appendSelected() {
    if (interactionDisabled || requestLock.current || selected.length === 0 || selectionExceedsLimit) return;
    const adding = selected.filter(url => !uniqueCurrentSources.includes(url));
    if (!adding.length) {
      setNotice('Выбранные ссылки уже есть в поле источников.');
      setSelected([]);
      return;
    }
    appendRef.current(adding);
    setNotice(`${adding.length} ${adding.length === 1 ? 'ссылка добавлена' : 'ссылки добавлены'} в поле источников.`);
    setSelected([]);
  }

  return <section className="mt-3 rounded border border-[#d8d9cc] bg-[#f1f0e8] p-3" aria-label="Предложенные источники">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-[#43574a]">Подсказки редактору</p>
        <p className="mt-0.5 text-xs text-[#78837a]">Приоритет — консорциумы, кооперативы и известные производители. Запрос выполняется только по нажатию.</p>
      </div>
      <Button data-testid="ai-suggest-sources" size="sm" variant="outline" disabled={interactionDisabled} onClick={() => { void suggest(); }}>
        {loading ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
        {loading ? 'Ищем источники…' : 'Предложить 3 источника'}
      </Button>
    </div>
    <p className="mt-2 text-[11px] leading-4 text-[#7b6b58]">Непроверенные предложения: проверьте принадлежность организации, актуальность страницы и её связь с сыром. Выбор ничего не изменит, пока вы отдельно не добавите ссылки.</p>
    {loading && <div className="mt-3 space-y-2" aria-label="Загрузка предложений">{[0, 1, 2].map(index => <div key={index} className="h-12 animate-pulse rounded bg-[#e2e2d8]" />)}</div>}
    {error && <div className="mt-3 rounded border border-[#d79c89] bg-[#faeee9] p-2.5 text-sm text-[#8b4535]" role="alert">{error}</div>}
    {notice && <p role="status" className="mt-2 text-xs text-[#45634e]">{notice}</p>}
    {warnings.length > 0 && <div className="mt-3 rounded border border-[#dfc9b5] bg-[#f5ece2] p-2.5 text-xs text-[#75533e]"><strong>Замечания</strong><ul className="mt-1 list-inside list-disc">{warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></div>}
    {!loading && items.length > 0 && <div className="mt-3 space-y-2">
      {items.map((source, index) => {
        const checkboxId = `ai-source-${entry.id}-${index}`;
        const checked = selected.includes(source.url);
        const alreadyIncluded = uniqueCurrentSources.includes(source.url);
        const selectionFull = !checked && !alreadyIncluded
          && (uniqueCount + newSelectedCount >= 3 || currentSources.length + newSelectedCount >= 3);
        return <div key={`${source.url}-${index}`} className="flex items-start gap-2 rounded border border-[#e0dfd4] bg-[#fbfaf5] p-2.5 text-sm">
          <input id={checkboxId} className="mt-1 accent-[#315647]" type="checkbox" checked={checked} disabled={interactionDisabled || selectionFull} onChange={() => toggle(source.url)} aria-label={`Выбрать источник ${source.label}`} />
          <div className="min-w-0 flex-1">
            <label htmlFor={checkboxId} className={`flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-[#43574a] ${interactionDisabled || selectionFull ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
              {source.label}<span className="rounded-full bg-[#e7ebe3] px-2 py-0.5 text-[10px] font-semibold text-[#68776a]">{sourceKindLabels[source.kind]}</span>
            </label>
            <a className="mt-1 flex min-w-0 items-start gap-1 break-all text-xs text-[#66756b] underline underline-offset-2" href={source.url} target="_blank" rel="noopener noreferrer">{source.url}<ExternalLink className="mt-0.5 h-3 w-3 shrink-0" /></a>
          </div>
        </div>;
      })}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-[#78837a]">Уникальных ссылок: {uniqueCount}; строк ссылок: {currentSources.length} из 3. Отметки сняты по умолчанию.</p>
        <Button size="sm" variant="outline" disabled={interactionDisabled || selected.length === 0 || selectionExceedsLimit} onClick={appendSelected}>Добавить выбранные в источники</Button>
      </div>
    </div>}
  </section>;
}
