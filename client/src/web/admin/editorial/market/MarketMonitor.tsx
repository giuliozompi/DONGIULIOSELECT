import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Clock3, ExternalLink, Globe2, History, Pause, Play, Plus, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import type { CheeseData } from '@shared/editorial';
import type { MarketCheck, MarketImport, PriceWatch } from '@shared/editorial-market';
import { editorialMarketApi } from '../../lib/editorialMarketApi';
import { editorialApi } from '../../lib/editorialApi';
import './market.css';

const pageSize = 10;
const dateText = (value?: string | null) => value ? new Date(value).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const marketError = (error: unknown) => error instanceof Error ? error.message : 'Не удалось выполнить действие.';
type ImportFields = { price: string; currency: string; store: string; packageQuantity: string; packageUnit: '' | 'kg' | 'g' | 'piece'; offerConditions: string; notes: string };
const blankFields: ImportFields = { price: '', currency: '', store: '', packageQuantity: '', packageUnit: '', offerConditions: '', notes: '' };

export default function MarketMonitor() {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<PriceWatch | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [cheeseId, setCheeseId] = useState('');
  const [country, setCountry] = useState('');
  const [store, setStore] = useState('');
  const [url, setUrl] = useState('');
  const [applyCheck, setApplyCheck] = useState<MarketCheck | null>(null);
  const [applyWatch, setApplyWatch] = useState<PriceWatch | null>(null);
  const [fields, setFields] = useState<ImportFields>(blankFields);
  const [error, setError] = useState('');
  const lock = useRef(false);

  const watches = useQuery({ queryKey: ['/web-api/admin/editorial-market/watches', page], queryFn: () => editorialMarketApi.list(page) });
  const cheeses = useQuery({
    queryKey: ['/web-api/admin/editorial', 'all', 'cheese'],
    queryFn: () => editorialApi.all('cheese'),
    select: entries => entries.map(entry => ({ id: entry.id, title: (entry.data as CheeseData).title })),
  });
  const checks = useQuery({
    queryKey: ['/web-api/admin/editorial-market/history', selected?.id, historyPage],
    queryFn: () => editorialMarketApi.history(selected!.id, historyPage),
    enabled: !!selected,
  });
  const activeRuns = useMemo(() => (watches.data?.items || []).flatMap(watch => watch.latest?.status === 'running' ? [watch.latest.id] : []), [watches.data?.items]);
  const runOptions: UseQueryOptions<MarketCheck>[] = activeRuns.map(id => ({
    queryKey: ['/web-api/admin/editorial-market/run', id],
    queryFn: () => editorialMarketApi.run(id),
    refetchInterval: query => query.state.data?.status === 'running' ? 2000 : false,
  }));
  const runQueries = useQueries({ queries: runOptions });
  const runState = runQueries.map(query => `${query.data?.id || ''}:${query.data?.status || ''}`).join('|');
  useEffect(() => {
    if (runState && runQueries.some(query => query.data && query.data.status !== 'running'))
      void client.invalidateQueries({ queryKey: ['/web-api/admin/editorial-market/watches'] });
  }, [runState, client]);

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['/web-api/admin/editorial-market/watches'] });
    if (selected) void client.invalidateQueries({ queryKey: ['/web-api/admin/editorial-market/history', selected.id] });
  };
  const createMutation = useMutation({ mutationFn: () => editorialMarketApi.create({ cheeseId, country: country.trim(), store: store.trim(), sourceUrl: url.trim() }), onSuccess: () => { setCreating(false); setCheeseId(''); setCountry(''); setStore(''); setUrl(''); setError(''); refresh(); } });
  const activeMutation = useMutation({ mutationFn: ({ watch, active }: { watch: PriceWatch; active: boolean }) => editorialMarketApi.active(watch, active), onSuccess: refresh, onError: e => setError(marketError(e)) });
  const checkMutation = useMutation({ mutationFn: (watch: PriceWatch) => editorialMarketApi.check(watch, crypto.randomUUID()), onSuccess: refresh, onError: e => setError(marketError(e)) });
  const applyMutation = useMutation({
    mutationFn: ({ check, data }: { check: MarketCheck; data: MarketImport }) => editorialMarketApi.apply(check.id, data),
    onSuccess: result => {
      setApplyCheck(null); setApplyWatch(null); setFields(blankFields); setError('');
      void client.invalidateQueries({ queryKey: ['/web-api/admin/editorial-market/history'] });
      void client.invalidateQueries({ queryKey: ['/web-api/admin/editorial-market/watches'] });
      window.location.href = `/web/admin/market-prices?entry=${encodeURIComponent(result.entry.id)}`;
    },
    onError: e => setError(marketError(e)),
  });
  const busy = lock.current || createMutation.isPending || activeMutation.isPending || checkMutation.isPending || applyMutation.isPending;
  function openApply(check: MarketCheck, watch: PriceWatch) {
    const proposal = check.proposal;
    if (!proposal) return;
    setApplyWatch(watch);
    setFields({
      price: proposal.price == null ? '' : String(proposal.price),
      currency: proposal.currency || '',
      store: proposal.store || watch.store || '',
      packageQuantity: proposal.packageQuantity == null ? '' : String(proposal.packageQuantity),
      packageUnit: proposal.packageUnit || '',
      offerConditions: proposal.conditions || '',
      notes: proposal.warnings.join('\n'),
    });
    setApplyCheck(check);
  }
  async function runCheck(watch: PriceWatch) {
    if (lock.current) return;
    lock.current = true; setError('');
    try { await checkMutation.mutateAsync(watch); }
    catch (cause) { setError(marketError(cause)); }
    finally { lock.current = false; }
  }
  async function toggle(watch: PriceWatch) {
    if (lock.current) return;
    lock.current = true; setError('');
    try { await activeMutation.mutateAsync({ watch, active: !watch.active }); }
    catch (cause) { setError(marketError(cause)); }
    finally { lock.current = false; }
  }
  async function apply() {
    if (!applyCheck || lock.current) return;
    const price = Number(fields.price), quantity = Number(fields.packageQuantity);
    if (!fields.price.trim() || !fields.currency.trim() || !fields.packageQuantity.trim() || !fields.packageUnit ||
      !Number.isFinite(price) || price <= 0 || !Number.isFinite(quantity) || quantity <= 0 || !/^[A-Z]{3}$/.test(fields.currency)) {
      setError('Заполните цену, код валюты и количество фасовки корректными значениями. Источник не указал значения автоматически — не подменяйте их догадкой.');
      return;
    }
    lock.current = true; setError('');
    try {
      await applyMutation.mutateAsync({ check: applyCheck, data: {
        price, currency: fields.currency, store: fields.store, packageQuantity: quantity, packageUnit: fields.packageUnit,
        offerConditions: fields.offerConditions, notes: fields.notes,
      } as MarketImport });
    } catch (cause) { setError(marketError(cause)); }
    finally { lock.current = false; }
  }
  const items = watches.data?.items || [];

  return <section className="market-monitor" aria-labelledby="market-monitor-title">
    <header className="mm-head">
      <div><span className="mm-eyebrow">SOURCE DESK · DON GIULIO SELECT</span><h2 id="market-monitor-title">Монитор источников</h2><p>Проверяем страницы продавцов. Любое найденное значение остаётся предложением до ручной сверки.</p></div>
      <button className="mm-primary" onClick={() => { setCreating(true); setError(''); }} data-testid="market-watch-create-open"><Plus size={17} />Добавить источник</button>
    </header>
    <div className="mm-rule"><ShieldCheck size={19} /><p>Курс валюты — только справочный пересчёт. Он не равен стоимости ввоза; наблюдения рынка не меняют каталог.</p></div>
    {error && <div className="mm-error" role="alert"><AlertTriangle size={17} /><span>{error}</span><button onClick={() => setError('')} aria-label="Скрыть ошибку">Скрыть</button></div>}

    {creating && <form className="mm-create" onSubmit={event => { event.preventDefault(); if (!lock.current) { lock.current = true; createMutation.mutate(undefined, { onSettled: () => { lock.current = false; } }); } }}>
      <div className="mm-create-title"><div><span className="mm-eyebrow">НОВОЕ НАБЛЮДЕНИЕ</span><h3>Новый источник</h3></div><button type="button" className="mm-text-button" disabled={busy} data-testid="market-watch-create-cancel" onClick={() => setCreating(false)}>Закрыть</button></div>
      <div className="mm-form-grid">
        <label className="mm-field mm-span-two">Сыр из редакционной энциклопедии<select required value={cheeseId} onChange={e => setCheeseId(e.target.value)} data-testid="market-watch-cheese"><option value="">Выберите сыр</option>{(cheeses.data || []).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>{cheeses.isError && <small>Список сыров не загрузился. Повторите позже.</small>}</label>
        <label className="mm-field">Страна продажи<input required maxLength={100} value={country} onChange={e => setCountry(e.target.value)} placeholder="Например, Италия" data-testid="market-watch-country" /></label>
        <label className="mm-field">Магазин / продавец<input maxLength={200} value={store} onChange={e => setStore(e.target.value)} placeholder="Название продавца" data-testid="market-watch-store" /></label>
        <label className="mm-field mm-span-two">HTTPS-страница товара<input type="url" required pattern="https://.+" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" data-testid="market-watch-url" /></label>
      </div>
      <div className="mm-create-foot"><p><Clock3 size={14} />Проверка раз в неделю · ближайшие 7 дней. Пауза остановит будущие запуски, но не отменит уже начатую проверку.</p><button className="mm-primary" type="submit" disabled={busy || !cheeses.data?.length} data-testid="market-watch-create-submit">{createMutation.isPending ? 'Сохраняем…' : 'Сохранить наблюдение'}</button></div>
      {createMutation.error && <p className="mm-inline-error" role="alert">{marketError(createMutation.error)}</p>}
    </form>}

    {watches.isLoading ? <div className="mm-skeletons" aria-label="Загрузка источников">{[0,1,2].map(i => <i key={i} />)}</div> : watches.isError ?
      <div className="mm-empty mm-empty-error"><strong>Не удалось загрузить источники</strong><p>{marketError(watches.error)}</p><button onClick={() => watches.refetch()} data-testid="market-watch-retry"><RefreshCw size={15} />Повторить</button></div> :
      !items.length ? <div className="mm-empty"><Globe2 size={25} /><strong>Источников пока нет</strong><p>Добавьте страницу продавца, чтобы начать проверку рыночной цены.</p><button onClick={() => setCreating(true)}>Добавить первый источник</button></div> :
      <div className="mm-watch-list">{items.map(watch => <article className={`mm-watch ${selected?.id === watch.id ? 'is-selected' : ''}`} key={watch.id}>
        <div className="mm-watch-main">
          <div className="mm-watch-title"><span className={`mm-state ${watch.active ? 'active' : ''}`}>{watch.active ? 'Активно' : 'На паузе'}</span><h3>{watch.cheeseTitle}</h3></div>
          <p className="mm-watch-meta">{watch.country}{watch.store ? ` · ${watch.store}` : ''}</p>
          <a className="mm-source" href={watch.sourceUrl} target="_blank" rel="noopener noreferrer">{watch.sourceUrl}<ExternalLink size={13} /></a>
          <div className="mm-watch-dates"><span>Следующая проверка: {dateText(watch.nextCheckAt)}</span><span>Последняя: {dateText(watch.lastCheckAt)}</span></div>
          {watch.latest && <div className={`mm-latest mm-${watch.latest.status}`}><strong>{watch.latest.status === 'running' ? 'Проверка выполняется' : watch.latest.status === 'ready' ? 'Найдено предложение' : 'Проверка не завершена'}</strong><span>{dateText(watch.latest.startedAt)}{watch.latest.error ? ` · ${watch.latest.error}` : ''}</span>
            {watch.latest.status === 'ready' && <button className="mm-text-button" onClick={() => openApply(watch.latest!, watch)} disabled={!watch.latest.proposal} data-testid={`market-apply-${watch.id}`}>Сверить и перенести</button>}
          </div>}
        </div>
        <div className="mm-watch-actions">
          <button className="mm-icon-button" aria-label={watch.active ? 'Приостановить наблюдение' : 'Возобновить наблюдение'} title={watch.active ? 'Приостановить' : 'Возобновить'} disabled={busy} onClick={() => void toggle(watch)} data-testid={`market-watch-toggle-${watch.id}`}>{watch.active ? <Pause size={16} /> : <Play size={16} />}{watch.active ? 'Пауза' : 'Возобновить'}</button>
          <button className="mm-outline-button" disabled={busy || watch.latest?.status === 'running'} onClick={() => void runCheck(watch)} data-testid={`market-watch-check-${watch.id}`}><Search size={15} />Проверить сейчас</button>
          <button className="mm-outline-button" onClick={() => { setSelected(selected?.id === watch.id ? null : watch); setHistoryPage(1); }} data-testid={`market-watch-history-${watch.id}`}><History size={15} />История</button>
        </div>
        {selected?.id === watch.id && <div className="mm-history">
          <div className="mm-history-head"><h4>История проверок</h4><span>{checks.data?.total ?? ''} запусков</span></div>
          {checks.isLoading ? <div className="mm-history-skeleton" /> : checks.isError ? <div className="mm-inline-error">{marketError(checks.error)} <button onClick={() => checks.refetch()}>Повторить</button></div> :
            !(checks.data?.items.length) ? <p className="mm-muted">Для этого источника ещё нет завершённых проверок.</p> : checks.data.items.map(item => <div className="mm-history-row" key={item.id}>
              <div><strong>{item.status === 'ready' ? 'Предложение найдено' : item.status === 'running' ? 'В процессе' : 'Ошибка'}</strong><span>Наблюдение {dateText(item.observedOn)} · запрос {dateText(item.startedAt)}</span>{item.error && <small>{item.error}</small>}</div>
              {item.status === 'ready' && <button className="mm-text-button" onClick={() => openApply(item, watch)} disabled={!item.proposal}>Открыть предложение</button>}
            </div>)}
          {checks.data && checks.data.total > checks.data.limit && <div className="mm-pager"><button disabled={historyPage <= 1} onClick={() => setHistoryPage(p => p - 1)}><ArrowLeft size={14} />Назад</button><span>Страница {checks.data.page}</span><button disabled={historyPage * checks.data.limit >= checks.data.total} onClick={() => setHistoryPage(p => p + 1)}>Далее<ArrowRight size={14} /></button></div>}
        </div>}
      </article>)}</div>}
    {watches.data && watches.data.total > watches.data.limit && <div className="mm-pager"><span>{(page - 1) * watches.data.limit + 1}–{Math.min(page * watches.data.limit, watches.data.total)} из {watches.data.total}</span><div><button disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ArrowLeft size={14} />Назад</button><button disabled={page * watches.data.limit >= watches.data.total} onClick={() => setPage(p => p + 1)}>Далее<ArrowRight size={14} /></button></div></div>}

    {applyCheck?.proposal && <div className="mm-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) { setApplyCheck(null); setApplyWatch(null); } }}>
      <section className="mm-apply" role="dialog" aria-modal="true" aria-labelledby="mm-apply-title">
        <header><span className="mm-eyebrow">РУЧНАЯ СВЕРКА · БЕЗ АВТОПУБЛИКАЦИИ</span><button className="mm-text-button" onClick={() => { setApplyCheck(null); setApplyWatch(null); }} disabled={busy} data-testid="market-apply-close">Закрыть</button></header>
        <h3 id="mm-apply-title">{applyCheck.proposal.productName}</h3>
        <div className="mm-proof">
          <strong>Цитата источника</strong><p>{applyCheck.evidence?.priceQuote || 'Цитата цены не предоставлена.'}</p>
          <strong>Фасовка</strong><p>{applyCheck.evidence?.packageQuote || 'Цитата фасовки не предоставлена.'}</p>
          {applyCheck.proposal.conditions && <><strong>Условия</strong><p>{applyCheck.proposal.conditions}</p></>}
          {applyCheck.proposal.warnings.length > 0 && <><strong>Предупреждения</strong><ul>{applyCheck.proposal.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></>}
        </div>
        {applyCheck.source?.url && <a className="mm-source" href={applyCheck.source.url} target="_blank" rel="noopener noreferrer">Открыть проверенную страницу <ExternalLink size={14} /></a>}
        <div className="mm-bound"><span>Страна: {applyWatch?.country} · URL: {applyWatch?.sourceUrl}</span><span>Дата наблюдения: {dateText(applyCheck.observedOn)}</span><span>Сыр: {applyWatch?.cheeseTitle || 'Сыр наблюдения'}</span></div>
        <div className="mm-form-grid mm-import-grid">
          <label className="mm-field">Цена<input type="number" min="0.01" step="any" value={fields.price} onChange={e => setFields(s => ({ ...s, price: e.target.value }))} data-testid="market-import-price" /></label>
          <label className="mm-field">Валюта, код ISO<input maxLength={3} value={fields.currency} onChange={e => setFields(s => ({ ...s, currency: e.target.value.toUpperCase() }))} placeholder="EUR" data-testid="market-import-currency" /></label>
          <label className="mm-field">Продавец<input value={fields.store} onChange={e => setFields(s => ({ ...s, store: e.target.value }))} data-testid="market-import-store" /></label>
          <div className="mm-field"><label htmlFor="mm-quantity">Количество в упаковке</label><div className="mm-inline-fields"><input id="mm-quantity" type="number" min="0.001" step="any" value={fields.packageQuantity} onChange={e => setFields(s => ({ ...s, packageQuantity: e.target.value }))} data-testid="market-import-quantity" /><select value={fields.packageUnit} onChange={e => setFields(s => ({ ...s, packageUnit: e.target.value as ImportFields['packageUnit'] }))} data-testid="market-import-unit"><option value="">Выберите единицу</option><option value="kg">кг</option><option value="g">г</option><option value="piece">шт.</option></select></div></div>
          <label className="mm-field mm-span-two">Условия предложения<textarea rows={3} value={fields.offerConditions} onChange={e => setFields(s => ({ ...s, offerConditions: e.target.value }))} data-testid="market-import-offer-conditions" /><small>Публичное поле: условия исходного предложения сохранятся отдельно и будут видны после одобрения.</small></label>
          <label className="mm-field mm-span-two">Внутренняя заметка редактору<textarea rows={3} value={fields.notes} onChange={e => setFields(s => ({ ...s, notes: e.target.value }))} data-testid="market-import-notes" /><small>Приватное поле: предупреждения проверки и заметки оператора не публикуются.</small></label>
        </div>
        <p className="mm-pending-note"><Check size={15} />Создаст новую запись со статусом «На проверке». Публикация и одобрение остаются отдельными действиями.</p>
        {error && <p className="mm-inline-error" role="alert">{error}</p>}
        <footer><button className="mm-outline-button" onClick={() => { setApplyCheck(null); setApplyWatch(null); }} disabled={busy}>Отмена</button><button className="mm-primary" onClick={() => void apply()} disabled={busy} data-testid="market-apply-submit">{applyMutation.isPending ? 'Сохраняем…' : 'Сохранить как ожидающую модерации'}</button></footer>
      </section>
    </div>}
  </section>;
}
