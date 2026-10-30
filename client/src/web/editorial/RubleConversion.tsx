import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { RUB_IMPORT_NOTICE, rubleEquivalent, priceObservationAgeDays, type FxRates } from '@shared/editorial-market';
import { webApi } from '../lib/webApi';
import type { PublicMarketPrice } from '@shared/public-editorial';

const fxKey = ['/web-api/editorial/fx-rates'];
const rubleForeign = (country: string) => !['ru', 'russia', 'россия'].includes(country.trim().toLocaleLowerCase('ru-RU'));
const fmt = (amount: number, currency: string) => `${amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
const day = (value: string | null) => value ? new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'не указана';

export default function RubleConversion({ prices }: { prices: PublicMarketPrice[] }) {
  const foreign = prices.some(price => rubleForeign(price.country));
  const fx = useQuery<FxRates>({
    queryKey: fxKey,
    queryFn: () => webApi.get<FxRates>('/editorial/fx-rates'),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
  });
  if (!prices.length) return null;
  return <div className="ed-ruble-area">
    {foreign && <aside className="ed-ruble-notice"><strong>Как читать рублёвый эквивалент</strong><p>{RUB_IMPORT_NOTICE}</p></aside>}
    {foreign && fx.data?.status === 'stale' && <div className="ed-ruble-warning" role="status"><AlertTriangle size={16} />Курс в кеше устарел — рублёвые значения не показываются как актуальные.</div>}
    {foreign && fx.isError && <div className="ed-ruble-warning" role="status"><AlertTriangle size={16} />Не удалось получить курс. Исходные цены остаются доступны без пересчёта.</div>}
    {prices.map(price => {
      const foreign = rubleForeign(price.country);
      const needsFx = foreign && price.currency !== 'RUB';
      const equivalent = needsFx && fx.data?.status === 'fresh' ? rubleEquivalent(price.price, price.currency, fx.data) : null;
      const alreadyRuble = foreign && price.currency === 'RUB';
      const rubleAmount = alreadyRuble ? price.price : equivalent;
      const perKg = alreadyRuble ? price.pricePerKg : needsFx && fx.data?.status === 'fresh' && price.pricePerKg !== null
        ? rubleEquivalent(price.pricePerKg, price.currency, fx.data) : null;
      const unavailableReason = !needsFx ? '' : fx.data?.status === 'stale' ? 'Курс устарел' : fx.isLoading ? 'Загружаем курс ЦБ РФ' : !fx.data || fx.data.status === 'unavailable' ? 'Курс недоступен' : !fx.data.rates[price.currency] ? `Нет курса для ${price.currency}` : '';
      const offerConditions = (price as PublicMarketPrice & { offerConditions?: string }).offerConditions;
      const hasRates = needsFx && (fx.data?.status === 'fresh' || fx.data?.status === 'stale');
      return <article className="ed-ruble-row" key={price.id} data-testid={`foreign-price-${price.id}`}>
        <div className="ed-ruble-top"><div><span className="ed-ruble-country">{price.country} · {price.store}</span><strong className="ed-ruble-original">{fmt(price.price, price.currency)} <small>за {price.packageQuantity} {price.packageUnit}</small></strong></div>
          {foreign && rubleAmount !== null && <div className="ed-ruble-converted"><span>{alreadyRuble ? 'ИСХОДНАЯ ЦЕНА В RUB' : 'СПРАВОЧНЫЙ ЭКВИВАЛЕНТ'}</span><strong>{fmt(rubleAmount, '₽')}</strong>{perKg !== null && <small>{fmt(perKg, '₽')}/кг · по указанной фасовке</small>}</div>}
          {unavailableReason && <div className="ed-ruble-unavailable">{unavailableReason}</div>}
        </div>
        {price.pricePerKg !== null && <div className="ed-ruble-perkg">Цена за кг: {fmt(price.pricePerKg, price.currency)}{perKg !== null && <span> · {fmt(perKg, '₽')}/кг справочно</span>}</div>}
        {offerConditions?.trim() && <p className="ed-ruble-conditions"><strong>Условия предложения:</strong> {offerConditions}</p>}
        <div className="ed-ruble-dates"><span>Цена наблюдалась: {day(price.observedOn)}</span>{hasRates && fx.data?.effectiveOn && <span>Курс ЦБ РФ действует на: {day(fx.data.effectiveOn)}</span>}{hasRates && fx.data?.fetchedAt && <span>Курс получен: {new Date(fx.data.fetchedAt).toLocaleString('ru-RU')}</span>}</div>
        {(priceObservationAgeDays(price.observedOn) || 0) > 7 && <p className="ed-fx-warning"><AlertTriangle size={16} />Цена наблюдалась более недели назад и могла измениться. Уточните её у продавца; обновление курса не обновляет цену товара.</p>}
        {price.sourceUrl && <a className="ed-ruble-source" href={price.sourceUrl} target="_blank" rel="noopener noreferrer">Страница продавца <ExternalLink size={13} /></a>}
      </article>;
    })}
    {foreign && <a className="ed-ruble-cbr" href={fx.data?.sourceUrl || 'https://www.cbr.ru/currency_base/daily/'} target="_blank" rel="noopener noreferrer">Официальные курсы Банка России <ExternalLink size={13} /></a>}
  </div>;
}
