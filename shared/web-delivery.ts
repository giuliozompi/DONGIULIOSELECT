import { z } from 'zod';

export const MOSCOW_DELIVERY_RUB = 1000;
export const MOSCOW_SAME_DAY_CUTOFF = 16;
export const WEB_PICKUP = {
  label: 'Магазин Don Giulio',
  address: 'г. Москва, ул. Покровка, 27, стр. 1',
};
export const WEB_MOSCOW_DELIVERY_TEXT =
  `Заказ по Москве, оформленный до ${MOSCOW_SAME_DAY_CUTOFF}:00 по московскому времени, можно получить в тот же день или в другой удобный день.`;
export const WEB_REGIONAL_DELIVERY_TEXT =
  'Стоимость доставки по Московской области и регионам зависит от тарифов курьерской службы: менеджер согласует сумму до оплаты.';
export const WEB_DELIVERY_LABELS = {
  web_moscow: 'Курьерская доставка по Москве',
  web_regional: 'Курьерская доставка по Московской области и регионам',
  web_unconfirmed: 'Курьерская доставка — адрес уточняется',
  web_pickup: 'Самовывоз',
} as const;
export type WebDeliveryMethod = keyof typeof WEB_DELIVERY_LABELS;
export type WebDeliveryQuote = {
  method: WebDeliveryMethod;
  fee: string | null;
};

export function deliveryMethodLabel(method?: string | null) {
  if (!method) return 'Не указан';
  const legacy: Record<string, string> = {
    pickup: 'Самовывоз', yandex_go: 'Яндекс Go', cdek: 'СДЭК', don_giulio_courier: 'Курьер Don Giulio',
    yandex_delivery: 'Яндекс Доставка',
  };
  return (WEB_DELIVERY_LABELS as Record<string, string>)[method] ?? legacy[method] ?? method;
}

export function isWebsiteDelivery(method?: string | null): boolean {
  return !!method && Object.hasOwn(WEB_DELIVERY_LABELS, method);
}

const moscowClock = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', hourCycle: 'h23',
});

export function moscowDeliveryDates(now = new Date()) {
  const parts = Object.fromEntries(moscowClock.formatToParts(now).map(({ type, value }) => [type, value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const next = new Date(`${today}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return { today, nextDay: next.toISOString().slice(0, 10), beforeCutoff: Number(parts.hour) < MOSCOW_SAME_DAY_CUTOFF };
}

export const desiredDeliveryDateSchema = z.string().date('Укажите корректную дату получения.').optional().or(z.literal(''));

export function desiredDateError(date: string | undefined, method: WebDeliveryMethod, now = new Date()) {
  if (!date) return null;
  const { today, beforeCutoff } = moscowDeliveryDates(now);
  if (date < today) return 'Желаемая дата получения не может быть в прошлом.';
  if (date === today && method === 'web_moscow' && !beforeCutoff) {
    return 'Доставка по Москве в день заказа возможна только до 16:00 по московскому времени. Выберите другую дату.';
  }
  return null;
}

export function formatDesiredDate(date: string) {
  const [year, month, day] = date.split('-');
  return `${day}.${month}.${year}`;
}
