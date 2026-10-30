import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { editorialToday } from '@shared/editorial';
import { priceSubmissionSchema } from '@shared/price-submissions';
import type { PriceSubmissionInput } from '@shared/price-submissions';
import { useWebAuth } from '../hooks/useWebAuth';
import WebAuthModal from '../components/WebAuthModal';
import { WebApiError } from '../lib/webApi';
import { priceSubmissionApi, type OwnPriceSubmission } from './priceSubmissionApi';

const PAGE_LIMIT = 10;
const ownKey = (userId: string, cheeseId: string, page: number) =>
  ['/web-api/editorial/own-price-submissions', userId, cheeseId, page] as const;
const knownCurrencies = [
  ['RUB', 'Российский рубль'], ['EUR', 'Евро'], ['USD', 'Доллар США'], ['GBP', 'Фунт стерлингов'],
  ['CHF', 'Швейцарский франк'], ['JPY', 'Японская иена'], ['CNY', 'Китайский юань'],
  ['TRY', 'Турецкая лира'], ['KZT', 'Казахстанский тенге'], ['AMD', 'Армянский драм'],
  ['GEL', 'Грузинский лари'], ['AED', 'Дирхам ОАЭ'], ['BYN', 'Белорусский рубль'],
  ['PLN', 'Польский злотый'], ['CZK', 'Чешская крона'], ['SEK', 'Шведская крона'],
  ['NOK', 'Норвежская крона'], ['DKK', 'Датская крона'], ['CAD', 'Канадский доллар'],
  ['AUD', 'Австралийский доллар'], ['INR', 'Индийская рупия'], ['KRW', 'Южнокорейская вона'],
] as const;
const currencies = (() => {
  const known = knownCurrencies.map(([code]) => code);
  try { return Array.from(new Set([...Intl.supportedValuesOf('currency'), ...known])).sort(); }
  catch { return known; }
})();
const currencyNames = Object.fromEntries(knownCurrencies);
type Draft = {
  channel: 'online' | 'shop'; price: string; currency: string; country: string;
  store: string; sourceUrl: string; observedOn: string; packageQuantity: string;
  packageUnit: 'kg' | 'g' | 'piece';
};
const blankDraft = (): Draft => ({
  channel: 'shop', price: '', currency: 'RUB', country: '', store: '', sourceUrl: '',
  observedOn: editorialToday(), packageQuantity: '', packageUnit: 'piece',
});
const statusLabels: Record<OwnPriceSubmission['status'], string> = {
  pending: 'На проверке', approved: 'Одобрена', rejected: 'Не одобрена', removed: 'Снята с публикации',
};
function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString('ru-RU');
}
function apiMessage(error: unknown) {
  if (error instanceof WebApiError) {
    const data = error.data as { message?: unknown; retryAfterSeconds?: unknown; nextAllowedAt?: unknown } | null;
    const base = typeof data?.message === 'string' ? data.message : error.message;
    if (error.status === 429 || (typeof data?.retryAfterSeconds === 'number' && data.retryAfterSeconds > 0)) {
      const wait = typeof data?.retryAfterSeconds === 'number' ? ` Попробуйте снова через ${Math.ceil(data.retryAfterSeconds / 60)} мин.` : '';
      const next = typeof data?.nextAllowedAt === 'string' ? ` Следующая отправка: ${dateLabel(data.nextAllowedAt)}.` : '';
      return `${base}${wait}${next}`;
    }
    if (error.status === 503) return `${base} Сервис временно недоступен; данные формы сохранены.`;
    if (error.status === 409) return `${base} Проверьте, не отправляли ли вы эту цену недавно.`;
    return base;
  }
  return error instanceof Error ? error.message : 'Не удалось отправить наблюдение. Данные формы сохранены.';
}
function limitTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : date.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}
function parseDecimal(value: string): number | null {
  const trimmed = value.trim();
  if (!/^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(trimmed)) return null;
  const parsed = Number(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

export default function CheesePriceSubmissions({ cheeseId }: { cheeseId: string }) {
  const { user, isAuthenticated, isLoading: authLoading } = useWebAuth();
  const queryClient = useQueryClient();
  const userId = isAuthenticated ? user?.id ?? null : null;
  const identity = `${userId ?? 'guest'}:${cheeseId}`;
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const mountedRef = useRef(true);
  const requestLock = useRef(false);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [page, setPage] = useState(1);
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setDraft(blankDraft());
    setPage(1);
    setSubmitError('');
    setFieldErrors({});
  }, [identity]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const history = useQuery({
    queryKey: userId ? ownKey(userId, cheeseId, page) : ['web-api/editorial/own-price-submissions', 'guest', cheeseId, page],
    queryFn: async ({ signal }) => {
      const currentUserId = () => {
        const auth = useWebAuth.getState();
        return auth.isAuthenticated ? auth.user?.id ?? null : null;
      };
      if (signal.aborted || !userId || currentUserId() !== userId) throw new Error('Сессия аккаунта изменилась. Обновите историю.');
      const result = await priceSubmissionApi.mine(cheeseId, page, PAGE_LIMIT);
      if (signal.aborted || currentUserId() !== userId) throw new Error('Сессия аккаунта изменилась. Обновите историю.');
      return result;
    },
    enabled: !!userId,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const items = userId && history.data ? history.data.items : [];
  const totalPages = history.data ? Math.max(1, Math.ceil(history.data.total / history.data.limit)) : 1;

  function change<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft(current => ({ ...current, [key]: value }));
    setFieldErrors(current => ({ ...current, [key]: '' }));
    setSubmitError('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId || requestLock.current) return;
    const submittedIdentity = identity;
    const price = parseDecimal(draft.price);
    const packageQuantity = parseDecimal(draft.packageQuantity);
    const numericErrors: Record<string, string> = {};
    if (price === null) numericErrors.price = 'Введите число, используя цифры и запятую или точку.';
    if (packageQuantity === null) numericErrors.packageQuantity = 'Введите число, используя цифры и запятую или точку.';
    if (Object.keys(numericErrors).length) {
      setFieldErrors(numericErrors);
      setSubmitError('Проверьте формат чисел.');
      return;
    }
    if (price === null || packageQuantity === null) return;
    const payload: PriceSubmissionInput = {
      channel: draft.channel,
      price,
      currency: draft.currency,
      country: draft.country.trim(),
      store: draft.store.trim(),
      sourceUrl: draft.channel === 'online' ? draft.sourceUrl.trim() : '',
      observedOn: draft.observedOn,
      packageQuantity,
      packageUnit: draft.packageUnit,
    };
    const parsed = priceSubmissionSchema.safeParse(payload);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      parsed.error.issues.forEach(issue => { if (!errors[issue.path[0]]) errors[String(issue.path[0])] = issue.message; });
      setFieldErrors(errors);
      setSubmitError('Проверьте отмеченные поля.');
      return;
    }
    requestLock.current = true;
    setSubmitting(true);
    setSubmitError('');
    setFieldErrors({});
    try {
      await priceSubmissionApi.submit(cheeseId, parsed.data);
      const authNow = useWebAuth.getState();
      if (!mountedRef.current || identityRef.current !== submittedIdentity ||
        !authNow.isAuthenticated || authNow.user?.id !== userId) return;
      setDraft(blankDraft());
      setPage(1);
      void queryClient.invalidateQueries({ queryKey: ownKey(userId, cheeseId, 1), exact: true });
      void queryClient.invalidateQueries({ queryKey: ['/web-api/editorial/cheese-prices', cheeseId] });
    } catch (error) {
      const authNow = useWebAuth.getState();
      if (mountedRef.current && identityRef.current === submittedIdentity &&
        authNow.isAuthenticated && authNow.user?.id === userId) setSubmitError(apiMessage(error));
    } finally {
      requestLock.current = false;
      if (mountedRef.current) setSubmitting(false);
    }
  }

  async function refreshHistory() {
    const refreshedIdentity = identity;
    await history.refetch();
    const authNow = useWebAuth.getState();
    if (identityRef.current === refreshedIdentity && authNow.isAuthenticated && authNow.user?.id === userId) {
      await queryClient.invalidateQueries({ queryKey: ['/web-api/editorial/cheese-prices', cheeseId] });
    }
  }

  return <section className="ed-price-contribute" aria-labelledby="ed-price-contribute-title" data-testid="cheese-price-submissions">
    <div className="ed-price-contribute-head">
      <div><div className="ed-kicker">Наблюдения читателей</div><h3 id="ed-price-contribute-title">Добавить цену</h3></div>
      <p>Цена в исходной валюте и упаковке. Непроверенные наблюдения не попадают в общий список.</p>
    </div>
    {authLoading ? <div className="ed-price-auth-skeleton" role="status" aria-label="Проверяем вход"><i /><i /></div> :
      !userId ? <div className="ed-price-auth-prompt">
        <p>Войдите или создайте аккаунт, чтобы сообщить о цене. После входа вы останетесь на этой статье.</p>
        <div><button type="button" onClick={() => { setAuthTab('login'); setAuthOpen(true); }} data-testid="cheese-price-login">Войти</button>
          <button type="button" className="ed-price-secondary" onClick={() => { setAuthTab('register'); setAuthOpen(true); }} data-testid="cheese-price-register">Создать аккаунт</button></div>
        <WebAuthModal open={authOpen} onClose={() => setAuthOpen(false)} defaultTab={authTab} />
      </div> :
      <>
        <div className="ed-price-policy"><span>Проверяются сотрудниками</span><span>Только одобренные цены видны всем</span><span>60 секунд между отправками · максимум 10 за скользящие 24 часа</span></div>
        <form className="ed-price-form" onSubmit={submit} noValidate data-testid="cheese-price-form">
          <label>Где нашли цену
            <select value={draft.channel} onChange={e => change('channel', e.target.value as Draft['channel'])} data-testid="price-channel">
              <option value="shop">В магазине</option><option value="online">В Интернете</option>
            </select>
          </label>
          <label>Цена
            <input type="text" required value={draft.price} onChange={e => change('price', e.target.value)} inputMode="decimal" pattern="(?:[0-9]+(?:[.,][0-9]+)?|[.,][0-9]+)" data-testid="price-amount" aria-invalid={!!fieldErrors.price} />
            {fieldErrors.price && <small className="ed-price-field-error">{fieldErrors.price}</small>}
          </label>
          <label>Валюта
            <select value={draft.currency} onChange={e => change('currency', e.target.value)} data-testid="price-currency">
              {currencies.map(code => <option key={code} value={code}>{code}{currencyNames[code] ? ` — ${currencyNames[code]}` : ''}</option>)}
            </select>
            {fieldErrors.currency && <small className="ed-price-field-error">{fieldErrors.currency}</small>}
          </label>
          <label>Страна наблюдения
            <input required maxLength={100} value={draft.country} onChange={e => change('country', e.target.value)} data-testid="price-country" aria-invalid={!!fieldErrors.country} />
            {fieldErrors.country && <small className="ed-price-field-error">{fieldErrors.country}</small>}
          </label>
          <label>Магазин или продавец
            <input required maxLength={200} value={draft.store} onChange={e => change('store', e.target.value)} data-testid="price-store" aria-invalid={!!fieldErrors.store} />
            {fieldErrors.store && <small className="ed-price-field-error">{fieldErrors.store}</small>}
          </label>
          {draft.channel === 'online' && <label className="ed-price-wide">Ссылка на источник
            <input type="url" required value={draft.sourceUrl} onChange={e => change('sourceUrl', e.target.value)} placeholder="https://" data-testid="price-source-url" aria-invalid={!!fieldErrors.sourceUrl} />
            {fieldErrors.sourceUrl && <small className="ed-price-field-error">{fieldErrors.sourceUrl}</small>}
          </label>}
          <label>Дата наблюдения
            <input type="date" required max={editorialToday()} value={draft.observedOn} onChange={e => change('observedOn', e.target.value)} data-testid="price-observed-on" aria-invalid={!!fieldErrors.observedOn} />
            {fieldErrors.observedOn && <small className="ed-price-field-error">{fieldErrors.observedOn}</small>}
          </label>
          <label>Количество в упаковке
            <input type="text" required value={draft.packageQuantity} onChange={e => change('packageQuantity', e.target.value)} inputMode="decimal" pattern="(?:[0-9]+(?:[.,][0-9]+)?|[.,][0-9]+)" data-testid="price-package-quantity" aria-invalid={!!fieldErrors.packageQuantity} />
            {fieldErrors.packageQuantity && <small className="ed-price-field-error">{fieldErrors.packageQuantity}</small>}
          </label>
          <label>Единица упаковки
            <select value={draft.packageUnit} onChange={e => change('packageUnit', e.target.value as Draft['packageUnit'])} data-testid="price-package-unit">
              <option value="piece">шт.</option><option value="kg">кг</option><option value="g">г</option>
            </select>
          </label>
          {submitError && <div className="ed-price-submit-error" role="alert" data-testid="price-submit-error">{submitError}</div>}
          <button className="ed-price-submit" type="submit" disabled={submitting} aria-busy={submitting} data-testid="price-submit">
            {submitting ? 'Отправляем…' : 'Отправить на проверку'}
          </button>
          <p className="ed-price-form-note">Исходная цена сохраняется без изменений. Рублёвый эквивалент одобренных иностранных цен — отдельная справочная оценка, не стоимость ввоза. Для упаковки «шт.» цена за килограмм не рассчитывается.</p>
        </form>
        <section className="ed-price-history" aria-labelledby="ed-price-history-title" data-testid="price-submission-history">
          <header><div><div className="ed-kicker">Только для вас</div><h4 id="ed-price-history-title">Мои наблюдения</h4></div>
            <button type="button" onClick={() => void refreshHistory()} disabled={history.isFetching} aria-label="Обновить мои наблюдения" data-testid="price-history-refresh"><RefreshCw size={15} className={history.isFetching ? 'is-refreshing' : ''} />Обновить</button>
          </header>
          {history.isLoading ? <div className="ed-price-history-skeleton" role="status"><i /><i /><i /></div> :
            history.isError ? <div className="ed-price-history-error" role="alert"><span>{apiMessage(history.error)}</span><button type="button" onClick={() => void history.refetch()}>Повторить</button></div> :
            <>
              <div className="ed-price-limits" data-testid="price-account-limits">
                <span>Доступно в лимите за 24 часа: <strong>{history.data?.limits.dailyRemaining ?? '—'}</strong></span>
                {history.data?.limits.nextAllowedAt && <span>Следующая отправка: <strong>{limitTime(history.data.limits.nextAllowedAt)}</strong></span>}
              </div>
              {!items.length ? <div className="ed-price-history-empty">Ваших наблюдений пока нет. После отправки запись появится здесь со статусом проверки.</div> :
                <div className="ed-price-own-list">{items.map(item => <article key={item.id} data-testid="price-submission-row">
                  <div className="ed-price-own-main"><strong>{item.data.price} {item.data.currency} · {item.data.packageQuantity} {item.data.packageUnit === 'kg' ? 'кг' : item.data.packageUnit === 'g' ? 'г' : 'шт.'}</strong>
                    <span>{item.data.country} · {item.data.store}</span>
                    <small>Наблюдение: {dateLabel(item.data.observedOn)} · отправлено {dateLabel(item.submittedAt)} · исходные данные наблюдения; редакционные исправления могут отличаться</small>
                  </div>
                  <span className={`ed-price-status status-${item.status}`} data-testid={`price-status-${item.status}`}>{statusLabels[item.status]}</span>
                </article>)}</div>}
              {history.data && history.data.total > history.data.limit && <nav className="ed-price-history-pager" aria-label="Страницы моих наблюдений">
                <span>Страница {history.data.page} из {totalPages} · {history.data.total} записей</span>
                <div><button type="button" disabled={page <= 1 || history.isFetching} onClick={() => setPage(value => Math.max(1, value - 1))}>Назад</button>
                  <button type="button" disabled={page >= totalPages || history.isFetching} onClick={() => setPage(value => Math.min(totalPages, value + 1))}>Далее</button></div>
              </nav>}
            </>}
        </section>
      </>}
  </section>;
}
