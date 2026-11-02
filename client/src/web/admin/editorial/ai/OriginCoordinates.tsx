import { useEffect, useRef, useState } from 'react';
import { ExternalLink, LoaderCircle, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EditorialEntry } from '@shared/editorial';
import type { OriginLookup } from '@shared/editorial-ai';
import { editorialAiApi } from '../../lib/editorialAiApi';

function errorMessage(error: unknown) {
  return (error as { message?: string })?.message || 'Не удалось найти варианты места. Повторите попытку.';
}

export default function OriginCoordinates({ entry, disabled, isGlobalBusy, tryClaim, releaseClaim, onBusyChange, onApplied }: {
  entry: EditorialEntry; disabled: boolean; isGlobalBusy: () => boolean;
  tryClaim: () => boolean; releaseClaim: () => void; onBusyChange: (busy: boolean) => void; onApplied: (saved: EditorialEntry) => void;
}) {
  const data = entry.data as { region?: string; latitude?: number | null; longitude?: number | null };
  const [place, setPlace] = useState(data.region || '');
  const [lookup, setLookup] = useState<OriginLookup>();
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const mounted = useRef(false);
  const requestSeq = useRef(0);
  const requestIdentity = `${entry.id}:${entry.revision}`;
  const identityRef = useRef(requestIdentity);
  identityRef.current = requestIdentity;
  const busyRef = useRef(false);
  const ownsClaim = useRef(false);
  const tryClaimRef = useRef(tryClaim);
  const releaseClaimRef = useRef(releaseClaim);
  const busyChangeRef = useRef(onBusyChange);
  tryClaimRef.current = tryClaim;
  releaseClaimRef.current = releaseClaim;
  busyChangeRef.current = onBusyChange;
  const busy = disabled || loading || saving;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestSeq.current += 1;
      finishClaim();
    };
  }, []);
  useEffect(() => {
    requestSeq.current += 1;
    setLoading(false);
    setSaving(false);
    setLookup(undefined);
    setSelectedId('');
    setError('');
    setNotice('');
    setPlace(((entry.data as { region?: string }).region || ''));
  }, [entry.id, entry.revision]);

  function finishClaim() {
    if (!ownsClaim.current) return;
    ownsClaim.current = false;
    releaseClaimRef.current();
    busyChangeRef.current(false);
  }
  function startClaim() {
    if (ownsClaim.current || isGlobalBusy() || !tryClaimRef.current()) return false;
    ownsClaim.current = true;
    busyChangeRef.current(true);
    return true;
  }

  async function findCandidates() {
    if (busyRef.current || disabled || isGlobalBusy()) return;
    const publicPlace = place.trim();
    if (publicPlace.length < 2) { setError('Укажите публичное название региона или населённого пункта.'); return; }
    if (!startClaim()) return;
    const requestId = requestIdentity;
    const seq = ++requestSeq.current;
    busyRef.current = true;
    setLoading(true);
    setError('');
    setNotice('');
    setLookup(undefined);
    setSelectedId('');
    try {
      const result = await editorialAiApi.originLookup(entry, publicPlace);
      if (!mounted.current || identityRef.current !== requestId || requestSeq.current !== seq) return;
      setLookup(result);
      if (!result.candidates.length) setNotice('Подходящих вариантов не найдено. Координаты не изменены.');
    } catch (issue) {
      if (mounted.current && identityRef.current === requestId && requestSeq.current === seq) setError(errorMessage(issue));
    } finally {
      busyRef.current = false;
      finishClaim();
      if (mounted.current && identityRef.current === requestId && requestSeq.current === seq) setLoading(false);
    }
  }
  async function saveCandidate() {
    if (busyRef.current || disabled || isGlobalBusy() || !lookup || !selectedId) return;
    const candidate = lookup.candidates.find(item => item.id === selectedId);
    if (!candidate) return;
    busyRef.current = true;
    if (!window.confirm(`Сохранить точку «${candidate.label}» как координаты происхождения статьи? Это будет черновик, а не место производства товара.`)) {
      busyRef.current = false;
      return;
    }
    if (!startClaim()) {
      busyRef.current = false;
      return;
    }
    const requestId = requestIdentity;
    const seq = ++requestSeq.current;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const saved = await editorialAiApi.originApply(entry, lookup.lookupId, candidate.id);
      if (!mounted.current || identityRef.current !== requestId || requestSeq.current !== seq) return;
      setNotice('Точка сохранена в черновике статьи.');
      finishClaim();
      onApplied(saved);
    } catch (issue) {
      if (mounted.current && identityRef.current === requestId && requestSeq.current === seq) setError(errorMessage(issue));
    } finally {
      busyRef.current = false;
      finishClaim();
      if (mounted.current && identityRef.current === requestId && requestSeq.current === seq) setSaving(false);
    }
  }
  return <section data-testid="ai-origin-coordinates" className="mt-4 rounded border border-[#d8d9cc] bg-[#f8f7f0] p-3" aria-label="Координаты происхождения">
    <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#a45f43]" /><div><h3 className="text-sm font-semibold">Точка происхождения</h3><p className="mt-1 text-xs leading-5 text-[#718075]">Это представительская точка региона или населённого пункта, не фабрика и не граница всей географической области. Не указывайте адрес покупателя. Поиск выполняется только по запросу.</p></div></div>
    <div className="mt-3 flex flex-col gap-2 sm:flex-row"><label className="min-w-0 flex-1"><span className="mb-1 block text-xs font-medium">Публичное название места</span><input data-testid="ai-origin-place" className="w-full rounded border border-[#d8d9cc] bg-[#fbfaf5] px-3 py-2 text-sm" value={place} onChange={event => setPlace(event.target.value)} maxLength={200} disabled={busy} placeholder="Например, Эмилия-Романья" /></label><Button data-testid="ai-origin-lookup" size="sm" variant="outline" className="self-end" disabled={busy || disabled || place.trim().length < 2} onClick={() => { void findCandidates(); }}>{loading ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : <MapPin className="mr-1.5 h-4 w-4" />}{loading ? 'Ищем варианты…' : 'Найти координаты'}</Button></div>
    <p className="mt-1 text-[11px] text-[#78837a]">Свежие запросы глобально ограничены интервалом 15 секунд; сохранённые варианты могут быть возвращены из 30-дневного серверного кэша.</p>
    {(data.latitude != null || data.longitude != null) && <p className="mt-2 text-xs text-[#68766d]">Сохранено: {data.latitude ?? '—'}, {data.longitude ?? '—'}. Новый вариант не заменит координаты без выбора и сохранения.</p>}
    {error && <div role="alert" className="mt-3 rounded border border-[#d79c89] bg-[#faeee9] p-2.5 text-sm text-[#8b4535]">{error}</div>}
    {notice && <p role="status" className="mt-2 text-xs text-[#45634e]">{notice}</p>}
    {lookup && <div className="mt-3 rounded border border-[#e0dfd4] bg-[#fbfaf5] p-3">
      <p className="text-xs text-[#68766d]">Варианты для «{lookup.query}»{lookup.cached ? ' · из кэша' : ''}. Ничего не выбрано автоматически.</p>
      {lookup.candidates.length === 0 ? <p className="mt-2 text-sm text-[#718075]">Нет вариантов. Существующие координаты сохранены без изменений.</p> : <fieldset className="mt-2 space-y-2"><legend className="sr-only">Выберите вариант координат</legend>{lookup.candidates.slice(0, 3).map(candidate => <label key={candidate.id} className="flex cursor-pointer items-start gap-2 rounded border border-[#e0dfd4] p-2.5 text-xs">
        <input type="radio" name={`origin-candidate-${entry.id}`} className="mt-0.5 accent-[#315647]" checked={selectedId === candidate.id} onChange={() => setSelectedId(candidate.id)} disabled={busy || disabled} />
        <span className="min-w-0 flex-1"><strong className="block text-sm text-[#43574a]">{candidate.label}</strong><span className="mt-1 block">Тип: {candidate.type} · {candidate.latitude}, {candidate.longitude}</span><a className="mt-1 inline-flex items-center gap-1 break-all text-[#66756b] underline" href={candidate.url} target="_blank" rel="noopener noreferrer">Открыть OpenStreetMap <ExternalLink className="h-3 w-3" /></a></span>
      </label>)}</fieldset>}
      {lookup.candidates.length > 0 && <Button data-testid="ai-origin-apply" size="sm" className="mt-3 bg-[#315647] hover:bg-[#244537]" disabled={busy || disabled || !selectedId} onClick={() => { void saveCandidate(); }}>{saving ? 'Сохраняем черновик…' : 'Сохранить выбранную точку'}</Button>}
      <p className="mt-2 text-[11px] text-[#78837a]">© OpenStreetMap contributors · <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">условия атрибуции</a>{lookup.cached ? ' · сохранённые поисковые варианты могут кэшироваться до 30 дней' : ''}</p>
    </div>}
    {disabled && <p className="mt-2 text-xs text-[#8b5d43]">Сначала завершите текущую AI-задачу и примените готовый текстовый вариант: применение меняет ревизию статьи.</p>}
  </section>;
}
