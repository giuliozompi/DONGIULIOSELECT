import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, ArrowRight, Check, CircleHelp, FilePlus2, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { editorialApi } from '../lib/editorialApi';
import { adminApi } from '../lib/adminApi';
import { CheeseAiDraft, EditorialAiCatalog } from './ai/EditorialAiTools';
import MarketMonitor from './market/MarketMonitor';
import {
  editorialSchemas, pricePerKg,
  type CheeseData, type EditorialEntry, type EditorialKind, type PriceData, type VideoData,
} from '@shared/editorial';

const PAGE_SIZE = 20;
type FormData = any;
const nativeSelectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

const titles: Record<EditorialKind, string> = { video: 'Видео и материалы', cheese: 'Сырная энциклопедия', price: 'Цены в мире' };
const intros: Record<EditorialKind, string> = {
  video: 'Отдельная редакция: рецепты, интервью, обзоры и места. «Готово» означает внутреннюю готовность, а не публикацию.',
  cheese: 'Энциклопедия происхождения сыров: источники проверяет редактор, географию происхождения не смешиваем с местом производства.',
  price: 'Наблюдения за международными ценами. Эти данные не меняют цены и ассортимент каталога.',
};
const EMPTY_VIDEO: VideoData = { title: '', description: '', status: 'draft', sortOrder: 0, url: '', cover: '', category: 'recipe', cheeseIds: [] };
const EMPTY_CHEESE: CheeseData = { title: '', nameOriginal: '', description: '', status: 'draft', sortOrder: 0, photos: [], country: '', region: '', latitude: null, longitude: null, history: '', characteristics: '', culinaryUses: '', productionCountry: '', sources: [], productIds: [], videoIds: [], externalVideoUrls: [] };
const EMPTY_PRICE: FormData = { cheeseId: '', sourceType: 'internet', price: 0, currency: 'EUR', country: '', store: '', sourceUrl: '', observedOn: new Date().toISOString().slice(0, 10), packageQuantity: 1, packageUnit: 'kg', offerConditions: '', notes: '' };

function fresh(kind: EditorialKind): FormData {
  if (kind === 'video') return { ...EMPTY_VIDEO, cheeseIds: [] };
  if (kind === 'cheese') return { ...EMPTY_CHEESE, photos: [], sources: [], productIds: [], videoIds: [], externalVideoUrls: [] };
  return { ...EMPTY_PRICE };
}

function isRevisionConflict(error: unknown) {
  const e = error as { status?: number; message?: string };
  return /revision|stale|version|concurrent|устарел|ревиз|изменена другим/i.test(e?.message || '');
}
function errorText(error: unknown) {
  const e = error as { message?: string };
  if (isRevisionConflict(error)) return e?.message || 'Запись изменилась. Обновите список и откройте её заново.';
  return e?.message || 'Не удалось выполнить операцию. Попробуйте ещё раз.';
}
function dateLabel(value: string) {
  return new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}
function statusLabel(entry: EditorialEntry) {
  if (entry.kind === 'price') return entry.moderation === 'approved' ? 'Одобрено' : entry.moderation === 'rejected' ? 'Отклонено' : 'На проверке';
  if (entry.kind === 'cheese') {
    const state = (entry.data as CheeseData).status as string;
    const label = state === 'ready' ? 'Одобрена' : state === 'pending_review' ? 'Ожидает подтверждения' : 'В редакции';
    return entry.publication
      ? entry.publication.publishedRevision === entry.revision ? 'Опубликована' : `Опубликована · текущая версия: ${label.toLocaleLowerCase('ru')}`
      : label;
  }
  if (entry.publication) return entry.publication.publishedRevision === entry.revision ? 'Опубликовано' : 'Опубликовано · изменения не опубликованы';
  return (entry.data as VideoData | CheeseData).status === 'ready' ? 'Готово · не опубликовано' : 'Черновик';
}
function entryName(entry: EditorialEntry) {
  return (entry.data as FormData).title || 'Без названия';
}
function cheeseNameOriginal(entry: EditorialEntry) {
  return entry.kind === 'cheese' ? (entry.data as CheeseData).nameOriginal : '';
}
function productName(product: any) {
  return product.name || product.title || product.slug || 'Товар без названия';
}
function missingCheeseReadyRequirements(data: CheeseData) {
  const missing: string[] = [];
  const sources = Array.isArray(data.sources) ? data.sources : String(data.sources ?? '').split(/\r?\n/);
  const photos = Array.isArray(data.photos) ? data.photos : String(data.photos ?? '').split(/\r?\n/);
  if (!data.title.trim()) missing.push('Название');
  if (!data.country.trim()) missing.push('Страна происхождения');
  if (!data.history.trim()) missing.push('История');
  if (!data.characteristics.trim()) missing.push('Характеристики');
  if (!data.culinaryUses.trim()) missing.push('Кулинарное использование');
  if (!sources.some(value => value.trim())) missing.push('Источники');
  if (!photos.some(value => value.trim())) missing.push('Фотография');
  if (data.latitude === null || data.longitude === null) missing.push('Обе координаты происхождения');
  return missing;
}

export default function EditorialWorkspace({ kind }: { kind: EditorialKind }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [page, setPage] = useState(0);
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<EditorialEntry | null>(null);
  const [form, setForm] = useState<FormData>(() => fresh(kind));
  const [moderationTarget, setModerationTarget] = useState<EditorialEntry | null>(null);
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved');
  const [moderationNote, setModerationNote] = useState('');
  const [validation, setValidation] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [rawLines, setRawLines] = useState<Record<string, string>>({});
  const requestLock = useRef(false);
  const [requestBusy, setRequestBusy] = useState(false);

  const listKey = ['/web-api/admin/editorial', kind, page, PAGE_SIZE];
  const listQuery = useQuery({
    queryKey: listKey,
    queryFn: () => editorialApi.list(kind, page * PAGE_SIZE, PAGE_SIZE),
  });
  const linkedEntryId = new URLSearchParams(window.location.search).get('entry');
  const linkedPriceQuery = useQuery({
    queryKey: ['/web-api/admin/editorial', 'linked-price-entry', linkedEntryId],
    queryFn: () => editorialApi.all('price'),
    enabled: kind === 'price' && Boolean(linkedEntryId),
  });
  const cheeseQuery = useQuery({
    queryKey: ['/web-api/admin/editorial', 'all', 'cheese'],
    queryFn: () => editorialApi.all('cheese'),
    enabled: kind === 'video' || kind === 'price' || Boolean(new URLSearchParams(window.location.search).get('entry')),
  });
  const videoQuery = useQuery({
    queryKey: ['/web-api/admin/editorial', 'all', 'video'],
    queryFn: () => editorialApi.all('video'),
    enabled: kind === 'cheese',
  });
  const productsQuery = useQuery({
    queryKey: ['/web-api/admin/products'],
    queryFn: () => adminApi.getProducts(),
    enabled: kind === 'cheese',
  });

  const invalidateEditorial = async () => {
    await qc.invalidateQueries({ queryKey: ['/web-api/admin/editorial'] });
  };
  function handleAiEntryApplied(saved?: EditorialEntry) {
    if (saved) {
      qc.setQueriesData({ queryKey: ['/web-api/admin/editorial'] }, (cached: any) => {
        const replaceCurrent = (items: EditorialEntry[]) => items.map(item =>
          item.id === saved.id && saved.revision >= item.revision ? saved : item,
        );
        if (Array.isArray(cached)) return replaceCurrent(cached);
        if (cached && Array.isArray(cached.items)) return { ...cached, items: replaceCurrent(cached.items) };
        return cached;
      });
    }
    void invalidateEditorial();
  }
  const createMutation = useMutation({
    mutationFn: (data: FormData) => editorialApi.create(kind, data),
    onSuccess: async () => { await invalidateEditorial(); closeDialog(true); toast({ title: 'Запись создана' }); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ entry, data }: { entry: EditorialEntry; data: FormData }) => editorialApi.update(entry, data),
    onSuccess: async () => { await invalidateEditorial(); closeDialog(true); toast({ title: kind === 'price' ? 'Цена обновлена и отправлена на повторную проверку' : 'Изменения сохранены' }); },
  });
  const deleteMutation = useMutation({
    mutationFn: (entry: EditorialEntry) => editorialApi.remove(entry),
    onSuccess: async () => {
      if (listQuery.data?.items.length === 1 && page > 0) setPage(current => current - 1);
      await invalidateEditorial();
      toast({ title: 'Запись удалена' });
    },
  });
  const moderateMutation = useMutation({
    mutationFn: ({ entry, value, note }: { entry: EditorialEntry; value: 'approved' | 'rejected'; note: string }) => editorialApi.moderate(entry, value, note),
    onSuccess: async () => { await invalidateEditorial(); setModerationTarget(null); setModerationNote(''); toast({ title: decision === 'approved' ? 'Цена одобрена' : 'Цена отклонена' }); },
  });
  const publishMutation = useMutation({
    mutationFn: (entry: EditorialEntry) => editorialApi.publish(entry),
    onSuccess: async () => { await invalidateEditorial(); toast({ title: 'Материал опубликован' }); },
  });
  const unpublishMutation = useMutation({
    mutationFn: (entry: EditorialEntry) => editorialApi.unpublish(entry),
    onSuccess: async () => { await invalidateEditorial(); toast({ title: 'Материал снят с публикации' }); },
  });
  const saving = requestBusy || createMutation.isPending || updateMutation.isPending || uploading;
  const entries = listQuery.data?.items || [];
  const total = listQuery.data?.total || 0;
  const cheeses = cheeseQuery.data || [];
  const openedLinkedEntry = useRef(false);
  const linkedEntry = linkedEntryId;
  useEffect(() => {
    if (!linkedEntry || openedLinkedEntry.current) return;
    if (kind === 'cheese' && cheeseQuery.data) {
      const target = cheeseQuery.data.find(value => value.id === linkedEntry);
      if (target) { openedLinkedEntry.current = true; openEdit(target); }
    }
    if (kind === 'price' && (linkedPriceQuery.data || listQuery.data)) {
      const target = (linkedPriceQuery.data || listQuery.data?.items || []).find(value => value.id === linkedEntry);
      if (target) {
        openedLinkedEntry.current = true;
        if (target.moderation === 'pending') {
          setModerationTarget(target);
          setModerationNote('');
          setDecision('approved');
        } else {
          window.requestAnimationFrame(() => document.getElementById(`entry-${target.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        }
      }
    }
  }, [kind, linkedEntry, cheeseQuery.data, listQuery.data, linkedPriceQuery.data]);
  const videos = videoQuery.data || [];
  const products = productsQuery.data || [];
  const relationLoading = cheeseQuery.isLoading || videoQuery.isLoading || productsQuery.isLoading;
  const busyError = createMutation.error || updateMutation.error || deleteMutation.error || moderateMutation.error || publishMutation.error || unpublishMutation.error;

  function openCreate() {
    if (requestLock.current) return;
    createMutation.reset();
    updateMutation.reset();
    deleteMutation.reset();
    setEditing(null);
    setForm(fresh(kind));
    setRawLines({});
    setValidation([]);
    setDialog(true);
  }
  function openEdit(entry: EditorialEntry) {
    if (requestLock.current) return;
    createMutation.reset();
    updateMutation.reset();
    deleteMutation.reset();
    setEditing(entry);
    setForm(JSON.parse(JSON.stringify(entry.data)) as FormData);
    setRawLines({});
    setValidation([]);
    setDialog(true);
  }
  function closeDialog(force = false) {
    if (!force && (saving || requestLock.current)) return;
    if (!force && dirty && !window.confirm('Есть несохранённые изменения. Закрыть без сохранения?')) return;
    setDialog(false);
    setEditing(null);
    setValidation([]);
  }
  const dirty = useMemo(() => editing ? JSON.stringify(form) !== JSON.stringify(editing.data) : JSON.stringify(form) !== JSON.stringify(fresh(kind)), [editing, form, kind]);
  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((current: FormData) => ({ ...current, [key]: value } as FormData));
  }
  function submit() {
    if (requestLock.current) return;
    const schema = editorialSchemas[kind];
    const candidate = { ...form };
    for (const key of ['photos', 'sources', 'externalVideoUrls'] as const) {
      if (typeof candidate[key] === 'string') candidate[key] = candidate[key].split('\n').map((line: string) => line.trim()).filter(Boolean);
    }
    const result = schema.safeParse(candidate);
    if (!result.success) {
      setValidation(result.error.issues.map(issue => issue.message));
      return;
    }
    setValidation([]);
    requestLock.current = true;
    setRequestBusy(true);
    const request = editing
      ? updateMutation.mutateAsync({ entry: editing, data: result.data as FormData })
      : createMutation.mutateAsync(result.data as FormData);
    void request.catch(() => undefined).finally(() => {
      requestLock.current = false;
      setRequestBusy(false);
    });
  }
  async function uploadCover(file?: File) {
    if (!file || kind !== 'video') return;
    setUploading(true);
    try {
      const uploaded = await adminApi.uploadImage(file);
      set('cover' as keyof FormData, uploaded.path as FormData[keyof FormData]);
      toast({ title: 'Обложка загружена' });
    } catch (error) {
      toast({ title: 'Ошибка загрузки', description: errorText(error), variant: 'destructive' });
    } finally { setUploading(false); }
  }
  async function deleteEntry(entry: EditorialEntry, label = entryName(entry)) {
    if (requestLock.current || !window.confirm(`Удалить «${label}»? Это действие нельзя отменить.`)) return;
    deleteMutation.reset();
    requestLock.current = true;
    setRequestBusy(true);
    try { await deleteMutation.mutateAsync(entry); }
    catch { /* mutation error is shown in the workspace alert */ }
    finally { requestLock.current = false; setRequestBusy(false); }
  }
  async function saveModeration() {
    if (!moderationTarget || !moderationNote.trim() || requestLock.current) return;
    requestLock.current = true;
    setRequestBusy(true);
    try {
      await moderateMutation.mutateAsync({ entry: moderationTarget, value: decision, note: moderationNote.trim() });
    } catch { /* mutation error is shown in the moderation dialog */ }
    finally { requestLock.current = false; setRequestBusy(false); }
  }
  async function changePublication(entry: EditorialEntry, action: 'publish' | 'unpublish') {
    if (requestLock.current) return;
    const title = entryName(entry);
    const question = action === 'publish'
      ? `Опубликовать «${title}»?${entry.publication ? ' Текущая публичная версия будет заменена.' : ''}`
      : `Снять «${title}» с публикации?`;
    if (!window.confirm(question)) return;
    publishMutation.reset();
    unpublishMutation.reset();
    requestLock.current = true;
    setRequestBusy(true);
    try {
      if (action === 'publish') await publishMutation.mutateAsync(entry);
      else await unpublishMutation.mutateAsync(entry);
    } catch { /* mutation error is shown in the workspace alert */ }
    finally { requestLock.current = false; setRequestBusy(false); }
  }
  function updateListError(error: unknown) {
    toast({ title: 'Ошибка', description: errorText(error), variant: 'destructive' });
  }
  const toggleId = (key: 'cheeseIds' | 'videoIds' | 'productIds', id: string) => {
    const current = ((form as any)[key] || []) as string[];
    set(key as keyof FormData, (current.includes(id) ? current.filter(item => item !== id) : [...current, id]) as FormData[keyof FormData]);
  };
  const setLines = (key: 'photos' | 'sources' | 'externalVideoUrls', value: string) => {
    setRawLines(current => ({ ...current, [key]: value }));
    set(key, value);
  };
  const lineTextarea = (label: string, name: 'photos' | 'sources' | 'externalVideoUrls', value: string[], helper?: string) => (
    <div className="space-y-1.5" key={name}><Label htmlFor={`ed-${name}`}>{label}</Label><Textarea id={`ed-${name}`} value={rawLines[name] ?? (Array.isArray(form[name]) ? value.join('\n') : String(form[name] ?? ''))} rows={4} onChange={e => setLines(name, e.target.value)} />{helper && <p className="text-xs text-muted-foreground">{helper}</p>}</div>
  );
  const field = (label: string, name: keyof FormData, value: string | number, opts?: { type?: string; placeholder?: string; required?: boolean; min?: string; max?: string }) => (
    <div className="space-y-1.5" key={String(name)}>
      <Label htmlFor={`ed-${String(name)}`}>{label}{opts?.required ? ' *' : ''}</Label>
      <Input id={`ed-${String(name)}`} type={opts?.type || 'text'} value={value} min={opts?.min} max={opts?.max} placeholder={opts?.placeholder} onChange={e => set(name, (opts?.type === 'number' ? Number(e.target.value) : e.target.value) as FormData[keyof FormData])} />
    </div>
  );
  const textarea = (label: string, name: string, value = String(form[name] ?? ''), helper?: string) => (
    <div className="space-y-1.5" key={name}><Label htmlFor={`ed-${name}`}>{label}</Label><Textarea id={`ed-${name}`} value={value} rows={4} onChange={e => set(name, e.target.value)} />{helper && <p className="text-xs text-muted-foreground">{helper}</p>}</div>
  );
  const relations = (label: string, key: 'cheeseIds' | 'videoIds' | 'productIds', options: { id: string; label: string }[]) => (
    <fieldset className="space-y-2" key={key}><legend className="text-sm font-medium">{label}</legend>
      {relationLoading ? <p className="text-xs text-muted-foreground">Загрузка связанных записей…</p> :
        options.length ? <div className="max-h-44 overflow-auto rounded-md border p-2 space-y-1">
          {options.map(option => <label key={option.id} className="flex items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/60 cursor-pointer">
            <input type="checkbox" className="mt-1 accent-primary" checked={((form as any)[key] || []).includes(option.id)} onChange={() => toggleId(key, option.id)} />
            <span>{option.label}</span>
          </label>)}
        </div> : <p className="text-xs text-muted-foreground">Подходящих записей пока нет.</p>}
    </fieldset>
  );

  const videoForm = form as VideoData;
  const cheeseForm = form as CheeseData;
  const priceForm = form as PriceData;
  const cheesePhotos = (Array.isArray(cheeseForm.photos) ? cheeseForm.photos : String(cheeseForm.photos ?? '').split(/\r?\n/)).filter(value => value.trim());

  return (
    <div className="min-h-full bg-[#f5f3ed] text-[#29352f]">
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-9">
        <div className="mb-7 border-b border-[#d7d8cc] pb-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#a05d41]">Don Giulio Select · редакция</p>
              <h1 className="font-serif text-3xl tracking-tight md:text-4xl">{titles[kind]}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#68746b]">{intros[kind]}</p>
            </div>
            <Button onClick={openCreate} className="bg-[#315647] text-[#f7f4e9] hover:bg-[#244537]"><FilePlus2 className="mr-2 h-4 w-4" />Новая запись</Button>
          </div>
        </div>

        <div className="mb-6 flex gap-3 border border-[#d9d7ca] bg-[#eae9df] p-4 text-sm leading-5 text-[#59645d]">
          <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-[#a05d41]" />
          <p><strong className="font-semibold text-[#36483f]">Работа редакции.</strong> AI-каталог и черновые предложения по указанным оператором источникам доступны в DEVELOPMENT. Это непроверенные подсказки: оператор сверяет факты и цитаты, а публикация всегда выполняется отдельным действием. {kind === 'cheese' ? 'Статус «Одобрена» означает редакционную готовность, но не публикацию.' : 'Статус «Готово» означает редакционную готовность, но не публикацию.'}</p>
        </div>

        {kind === 'cheese' && <EditorialAiCatalog onImported={() => { void invalidateEditorial(); }} />}

        {kind === 'price' && <div className="mb-6 rounded-md border-l-4 border-[#b66b48] bg-[#f0e6d9] px-4 py-3 text-sm text-[#684b3d]">Рыночные наблюдения никогда не изменяют цену или доступность товара в каталоге. Новая и отредактированная запись цены всегда возвращается в очередь проверки.</div>}

        {kind === 'price' && <MarketMonitor />}

        {busyError && <div role="alert" className="mb-4 flex items-start gap-2 rounded-md border border-[#d79c89] bg-[#faeee9] p-3 text-sm text-[#8b4535]"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{errorText(busyError)} {isRevisionConflict(busyError) && <button className="underline underline-offset-2" onClick={() => listQuery.refetch()}>Обновить список и открыть заново</button>}</span></div>}

        {listQuery.isLoading ? <div className="space-y-3" aria-label="Загрузка записей">{[0, 1, 2].map(i => <div key={i} className="h-24 animate-pulse rounded-lg bg-[#e5e3d9]" />)}</div> :
          listQuery.isError ? <Card className="border-[#dfdcd0] bg-[#fbfaf6]"><CardContent className="flex flex-col items-center gap-3 py-12 text-center"><AlertCircle className="h-8 w-8 text-[#a05d41]" /><p className="font-medium">Не удалось загрузить записи</p><Button variant="outline" onClick={() => listQuery.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Повторить</Button></CardContent></Card> :
            entries.length === 0 ? <Card className="border-dashed border-[#c9cbbf] bg-[#fbfaf6]"><CardContent className="flex flex-col items-center py-16 text-center"><div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#e6ebe4] text-[#315647]"><FilePlus2 className="h-5 w-5" /></div><h2 className="font-serif text-xl">Пока нет записей</h2><p className="mt-1 max-w-sm text-sm text-muted-foreground">Создайте первую запись редакции. Публичные страницы доступны только в DEVELOPMENT-превью; публикация выполняется отдельно от {kind === 'cheese' ? 'статуса «Одобрена»' : 'статуса «Готово»'}.</p><Button className="mt-5 bg-[#315647] hover:bg-[#244537]" onClick={openCreate}>Создать запись</Button></CardContent></Card> :
              <div className="space-y-3">
                {entries.map(entry => {
                  const data = entry.data as FormData;
                  const price = entry.kind === 'price' ? entry.data as PriceData : null;
                  const relatedPriceCheese = price ? cheeses.find(item => item.id === price.cheeseId) : null;
                  const rowTitle = price
                    ? (relatedPriceCheese ? entryName(relatedPriceCheese) : 'Наблюдение цены')
                    : entryName(entry);
                  const relatedCheese = entry.kind === 'video' ? cheeses.find(item => item.id === (entry.data as VideoData).cheeseIds[0]) : null;
                  return <Card id={`entry-${entry.id}`} key={entry.id} className="overflow-hidden border-[#deddd2] bg-[#fbfaf6] shadow-[0_2px_10px_rgba(42,55,47,0.035)]">
                    <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:p-5">
                      {entry.kind === 'video' && (entry.data as VideoData).cover && <img src={(entry.data as VideoData).cover} alt="" className="h-20 w-28 rounded object-cover" />}
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2"><h2 className="font-serif text-lg">{rowTitle}</h2>
                          {entry.kind === 'cheese' && cheeseNameOriginal(entry) && <span className="text-sm italic text-[#778278]">{cheeseNameOriginal(entry)}</span>}
                          <Badge variant="outline" className="border-[#c7cec3] bg-[#eef1eb] text-[#486252]">{statusLabel(entry)}</Badge>
                          {price && <Badge variant="outline" className="border-[#dfc9b5] bg-[#f5ece2] text-[#84563e]">{price.sourceType === 'user' ? 'Сообщение пользователя' : 'Источник в интернете'}</Badge>}
                        </div>
                        <p className="text-sm text-[#6e776f]">{price ? `${price.country} · ${price.store} · ${price.price} ${price.currency} за ${price.packageQuantity} ${price.packageUnit}` : data.description || 'Без описания'}</p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#8a9188]">
                          <span>Изменено {dateLabel(entry.updatedAt)}</span>
                          {price && <span>Наблюдение {dateLabel(price.observedOn)}</span>}
                          {price && <span>{pricePerKg(price) === null ? 'Цена за кг: не рассчитывается для штучной фасовки' : `≈ ${pricePerKg(price)!.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${price.currency}/кг`}</span>}
                          {relatedCheese && <span>Связанный сыр: {entryName(relatedCheese)}</span>}
                          {entry.kind === 'cheese' && <span>Происхождение: {(entry.data as CheeseData).country}{(entry.data as CheeseData).productionCountry ? ` · производство: ${(entry.data as CheeseData).productionCountry}` : ''}</span>}
                        </div>
                        {entry.moderationNote && <p className="mt-2 text-xs text-[#6c625a]">Решение модерации: {entry.moderationNote}</p>}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {kind === 'price' && entry.moderation === 'pending' && <Button size="sm" variant="outline" disabled={requestBusy} onClick={() => { if (requestLock.current) return; moderateMutation.reset(); setModerationTarget(entry); setModerationNote(''); setDecision('approved'); }}><Check className="mr-1.5 h-4 w-4" />Проверить</Button>}
                        {entry.kind !== 'price' && entry.publication && <Button size="sm" variant="outline" disabled={requestBusy} onClick={() => { void changePublication(entry, 'unpublish'); }}>Снять с публикации</Button>}
                        {entry.kind !== 'price' && (entry.data as VideoData | CheeseData).status === 'ready' && (!entry.publication || entry.publication.publishedRevision !== entry.revision) && <Button size="sm" disabled={requestBusy} className="bg-[#315647] text-white hover:bg-[#244537]" onClick={() => { void changePublication(entry, 'publish'); }}>{entry.publication ? 'Опубликовать изменения' : 'Опубликовать'}</Button>}
                        <Button size="sm" variant="outline" disabled={requestBusy} onClick={() => openEdit(entry)}><Pencil className="mr-1.5 h-4 w-4" />Изменить</Button>
                        <Button size="icon" variant="ghost" className="text-[#9d4d3f] hover:bg-[#f7e9e4]" aria-label={`Удалить ${rowTitle}`} disabled={requestBusy} onClick={() => { void deleteEntry(entry, rowTitle); }}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </CardContent>
                     {kind === 'cheese' && <div className="px-4 pb-4 md:px-5"><CheeseAiDraft entry={entry} onApplied={handleAiEntryApplied} /></div>}
                  </Card>;
                })}
              </div>}

        {!listQuery.isLoading && !listQuery.isError && total > PAGE_SIZE && <div className="mt-5 flex items-center justify-between border-t border-[#d7d8cc] pt-4 text-sm"><span className="text-muted-foreground">Показаны {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} из {total}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}><ArrowLeft className="mr-1 h-4 w-4" />Назад</Button><Button size="sm" variant="outline" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)}>Далее<ArrowRight className="ml-1 h-4 w-4" /></Button></div></div>}

        <Dialog open={dialog} onOpenChange={open => !open && closeDialog()}>
          <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto border-[#d7d8cc] bg-[#fbfaf6]">
            <DialogHeader><DialogTitle className="font-serif text-2xl">{editing ? 'Редактирование' : 'Новая запись'} · {titles[kind]}</DialogTitle></DialogHeader>
            <div className="space-y-5 py-2">
              {kind !== 'price' && <>
                {kind === 'cheese' ? <div className="grid gap-4 sm:grid-cols-2">
                  {field('Название по-русски', 'title', cheeseForm.title, { required: true })}
                  {field('Оригинальное название', 'nameOriginal', cheeseForm.nameOriginal, { placeholder: 'Например, Parmigiano Reggiano' })}
                </div> : field('Заголовок', 'title', (form as VideoData).title, { required: true })}
                {textarea('Описание', 'description', (form as VideoData | CheeseData).description)}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label htmlFor="ed-status">{kind === 'cheese' ? 'Состояние статьи' : 'Внутренний статус'}</Label><select id="ed-status" className={nativeSelectClass} value={(form as VideoData | CheeseData).status} onChange={e => set('status', e.target.value)}>{kind === 'cheese' ? <><option value="draft">В редакции</option><option value="pending_review">Ожидает подтверждения</option><option value="ready">Одобрена</option></> : <><option value="draft">Черновик</option><option value="ready">Готово к редакционному этапу</option></>}</select>{kind === 'cheese' && <p className="text-xs text-muted-foreground">Публикация — отдельное действие; состояние текущей версии не означает, что она уже опубликована.</p>}</div>
                  {field('Порядок', 'sortOrder', (form as VideoData | CheeseData).sortOrder, { type: 'number', min: '0' })}
                </div>
              </>}
              {kind === 'video' && <>
                {field('Ссылка на видео / плейлист', 'url', videoForm.url, { required: true, placeholder: 'https://youtu.be/…' })}
                <div className="space-y-2"><Label htmlFor="ed-cover">Обложка — URL или путь</Label><Input id="ed-cover" value={videoForm.cover} placeholder="URL или путь загруженного изображения" onChange={e => set('cover', e.target.value)} /><Label htmlFor="ed-cover-file" className="text-xs text-muted-foreground">Загрузить файл</Label><Input id="ed-cover-file" type="file" accept="image/*" disabled={uploading} onChange={e => { void uploadCover(e.target.files?.[0]); e.currentTarget.value = ''; }} /><p className="text-xs text-muted-foreground">Можно указать ссылку или загрузить файл в хранилище.</p></div>
                <div className="space-y-1.5"><Label htmlFor="ed-category">Направление</Label><select id="ed-category" className={nativeSelectClass} value={videoForm.category} onChange={e => set('category', e.target.value as VideoData['category'])}><option value="recipe">Рецепт</option><option value="interview">Интервью</option><option value="review">Обзор</option><option value="places">Места</option></select></div>
                {relations('Связанные сырные статьи', 'cheeseIds', cheeses.map(entry => ({ id: entry.id, label: entryName(entry) })))}
              </>}
              {kind === 'cheese' && <>
                <div className="grid gap-4 sm:grid-cols-2">{field('Страна происхождения', 'country', cheeseForm.country, { required: true })}{field('Регион', 'region', cheeseForm.region)}</div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label htmlFor="ed-latitude">Широта</Label><Input id="ed-latitude" type="number" min="-90" max="90" value={cheeseForm.latitude ?? ''} onChange={e => set('latitude', e.target.value === '' ? null : Number(e.target.value))} /></div>
                  <div className="space-y-1.5"><Label htmlFor="ed-longitude">Долгота</Label><Input id="ed-longitude" type="number" min="-180" max="180" value={cheeseForm.longitude ?? ''} onChange={e => set('longitude', e.target.value === '' ? null : Number(e.target.value))} /></div>
                </div>
                <div className="space-y-1.5"><Label htmlFor="ed-productionCountry">Фактическая страна производства</Label><Input id="ed-productionCountry" value={cheeseForm.productionCountry} onChange={e => set('productionCountry', e.target.value)} /><p className="text-xs text-muted-foreground">Не подменяет географию происхождения сыра.</p></div>
                {textarea('История', 'history')}{textarea('Характеристики', 'characteristics')}{textarea('Кулинарное использование', 'culinaryUses')}
                <section data-testid="cheese-photo-editor" className="space-y-2 rounded-md border border-[#d9d7ca] bg-[#f5f3eb] p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Label htmlFor="ed-photos">Фотографии · обязательны для статуса «Одобрена»</Label>
                    <span className="text-xs text-[#718075]">{cheesePhotos.length} из 12</span>
                  </div>
                  {cheesePhotos.length === 0
                    ? <p className="text-sm text-[#79583f]">Фотографий пока нет. До сохранения как «Одобрена» выберите AI-фото, подтвердите права и нажмите «Импортировать фото отдельно» — в том числе после применения текста. Или добавьте URL вручную ниже.</p>
                    : <p className="text-sm text-[#526158]">Указано фотографий: {cheesePhotos.length}. Можно добавить или удалить URL вручную.</p>}
                  <Textarea id="ed-photos" value={rawLines.photos ?? (Array.isArray(cheeseForm.photos) ? cheeseForm.photos.join('\n') : String(cheeseForm.photos ?? ''))} rows={4} onChange={e => setLines('photos', e.target.value)} placeholder="https://… · по одному URL на строку" />
                  <p className="text-xs text-[#718075]">До 12 URL или путей изображений. Пустые строки игнорируются; редакция не загружает изображения с внешних сайтов автоматически.</p>
                </section>
                {lineTextarea('Источники — по одному http(s) URL на строку · обязательны для «Одобрена»', 'sources', cheeseForm.sources, 'До 30 источников.')}
                {relations('Связанные товары каталога', 'productIds', products.filter((product: any) => product.id != null).map((product: any) => ({ id: String(product.id), label: productName(product) })))}
                {relations('Связанные видео — необязательно', 'videoIds', videos.map(entry => ({ id: entry.id, label: entryName(entry) })))}
                {lineTextarea('Внешние видео-ссылки — необязательно', 'externalVideoUrls', cheeseForm.externalVideoUrls, 'Не обязательны для статуса «Одобрена». Ссылки YouTube или публичные посты Telegram.')}
                {editing && <div data-testid="cheese-saved-status" className="rounded-md border border-[#d9d7ca] bg-[#f2f0e7] px-3 py-2 text-sm text-[#53645a]">Сохранённое состояние: <strong>{statusLabel(editing)}</strong>{editing.publication && <span className="ml-1">· опубликованная версия {editing.publication.publishedRevision}</span>}</div>}
                {cheeseForm.status === 'ready' && <div data-testid="cheese-ready-requirements" aria-live="polite" className="rounded-md border border-[#dfc9b5] bg-[#f5ece2] p-3 text-sm text-[#684b3d]">
                  {(() => {
                    const missing = missingCheeseReadyRequirements(cheeseForm);
                    return missing.length
                      ? <><p className="font-semibold">Для статуса «Одобрена» ещё нужны:</p><ul className="mt-1 list-inside list-disc">{missing.map(item => <li key={item}>{item}</li>)}</ul></>
                      : <p className="font-semibold">Обязательные поля для «Одобрена» заполнены. Сохранение всё равно проверит формат ссылок и координат.</p>;
                  })()}
                  <p className="mt-2 text-xs">Регион, оригинальное название, связанные товары и видео — необязательны. Для черновика эти требования не блокируют сохранение.</p>
                </div>}
              </>}
              {kind === 'price' && <>
                <div className="space-y-1.5"><Label htmlFor="ed-cheeseId">Сырная статья *</Label><select id="ed-cheeseId" className={nativeSelectClass} value={priceForm.cheeseId} onChange={e => set('cheeseId', e.target.value)}><option value="">{cheeseQuery.isLoading ? 'Загрузка статей…' : 'Выберите сыр'}</option>{cheeses.map(entry => <option key={entry.id} value={entry.id}>{entryName(entry)}</option>)}</select></div>
                <div className="space-y-1.5"><Label htmlFor="ed-sourceType">Происхождение записи *</Label><select id="ed-sourceType" className={nativeSelectClass} value={priceForm.sourceType} onChange={e => set('sourceType', e.target.value as PriceData['sourceType'])}><option value="internet">Наблюдение в интернете</option><option value="user">Сообщение пользователя, зафиксированное вручную</option></select></div>
                <div className="grid gap-4 sm:grid-cols-3">{field('Цена упаковки', 'price', priceForm.price, { type: 'number', required: true, min: '0.01' })}{field('Валюта ISO 4217', 'currency', priceForm.currency, { required: true, placeholder: 'EUR' })}<div className="space-y-1.5"><Label htmlFor="ed-packageUnit">Единица *</Label><select id="ed-packageUnit" className={nativeSelectClass} value={priceForm.packageUnit} onChange={e => set('packageUnit', e.target.value as PriceData['packageUnit'])}><option value="kg">кг</option><option value="g">г</option><option value="piece">шт.</option></select></div></div>
                <div className="grid gap-4 sm:grid-cols-2">{field('Количество в упаковке', 'packageQuantity', priceForm.packageQuantity, { type: 'number', required: true, min: '0.001' })}{field('Дата наблюдения', 'observedOn', priceForm.observedOn, { type: 'date', required: true })}</div>
                <div className="grid gap-4 sm:grid-cols-2">{field('Страна', 'country', priceForm.country, { required: true })}{field('Магазин', 'store', priceForm.store, { required: true })}</div>
                {field('Ссылка на источник', 'sourceUrl', priceForm.sourceUrl, { required: priceForm.sourceType === 'internet', placeholder: 'https://…' })}
                {priceForm.sourceType === 'user' && <p className="text-xs text-muted-foreground">Для наблюдения в обычном магазине ссылка необязательна. Укажите магазин, дату и пояснение для модератора.</p>}
                {textarea('Условия предложения', 'offerConditions', String(form.offerConditions ?? ''), 'Условия цены, указанные продавцом. Это поле отображается публично после одобрения наблюдения.')}
                {textarea('Примечания', 'notes', priceForm.notes)}
                <div className="rounded-md bg-[#e9eee7] p-3 text-sm text-[#405b49]">{priceForm.packageUnit === 'piece' ? 'Цена за килограмм не рассчитывается: масса одной штуки неизвестна.' : `Расчётная цена за кг: ${pricePerKg(priceForm)!.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${priceForm.currency}/кг`}</div>
                <p className="text-xs text-[#7d6657]">После сохранения запись станет ожидающей модерации. При редактировании цена снова требует решения оператора.</p>
              </>}
              {validation.length > 0 && <div role="alert" className="rounded-md border border-[#d79c89] bg-[#faeee9] p-3 text-sm text-[#8b4535]"><p className="mb-1 font-medium">Проверьте поля:</p><ul className="list-inside list-disc">{validation.map((message, i) => <li key={`${message}-${i}`}>{message}</li>)}</ul></div>}
              {(createMutation.error || updateMutation.error) && <div role="alert" className="rounded-md border border-[#d79c89] bg-[#faeee9] p-3 text-sm text-[#8b4535]">{errorText(createMutation.error || updateMutation.error)} {isRevisionConflict(createMutation.error || updateMutation.error) && <button className="underline underline-offset-2" onClick={() => { void listQuery.refetch(); }}>Обновить список и открыть заново</button>}</div>}
              {editing && dirty && <p className="text-xs text-muted-foreground">Есть несохранённые изменения.</p>}
            </div>
            <DialogFooter className="gap-2 sm:gap-2"><Button variant="outline" disabled={saving} onClick={() => closeDialog()}>Отмена</Button><Button disabled={saving || relationLoading} onClick={submit} className="bg-[#315647] hover:bg-[#244537]">{saving ? 'Сохранение…' : 'Сохранить'}</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!moderationTarget} onOpenChange={open => { if (!open && !requestLock.current) setModerationTarget(null); }}>
          <DialogContent className="border-[#d7d8cc] bg-[#fbfaf6]">
            <DialogHeader><DialogTitle className="font-serif text-xl">Решение по наблюдению цены</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">{moderationTarget && (cheeses.find(entry => entry.id === (moderationTarget.data as PriceData).cheeseId) ? entryName(cheeses.find(entry => entry.id === (moderationTarget.data as PriceData).cheeseId)!) : 'Наблюдение цены')} · решение и пояснение будут сохранены.</p>
            <div className="space-y-2"><Label htmlFor="ed-moderation-decision">Решение</Label><select id="ed-moderation-decision" className={nativeSelectClass} value={decision} onChange={e => setDecision(e.target.value as 'approved' | 'rejected')}><option value="approved">Одобрить</option><option value="rejected">Отклонить</option></select></div>
            <div className="space-y-2"><Label htmlFor="ed-moderation-note">Примечание обязательно</Label><Textarea id="ed-moderation-note" value={moderationNote} onChange={e => setModerationNote(e.target.value)} maxLength={2000} placeholder="Почему наблюдение принято или отклонено?" /></div>
            {moderateMutation.error && <p role="alert" className="text-sm text-destructive">{errorText(moderateMutation.error)}</p>}
            <DialogFooter><Button variant="outline" disabled={requestBusy} onClick={() => setModerationTarget(null)}>Отмена</Button><Button disabled={requestBusy || !moderationNote.trim()} onClick={() => { void saveModeration(); }} className="bg-[#315647] hover:bg-[#244537]">{requestBusy ? 'Сохранение…' : 'Сохранить решение'}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
