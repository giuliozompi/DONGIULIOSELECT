import { AlertCircle, Check, Clock3, Package, Truck } from 'lucide-react';
import { DELIVERY_METHOD_LABELS, PAYMENT_METHOD_LABELS } from '@shared/schema';
import { formatOrderQuantity } from '@shared/order-quantity';

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  price: string;
  unit: string;
}

export interface CustomerOrder {
  id: string;
  status: string;
  amount: string;
  discount?: string | null;
  paymentMethod: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  deliveryAddress: string;
  deliveryNotes?: string | null;
  deliveryMethod?: string | null;
  createdAt: string;
  items: OrderItem[];
}

const STATUS_PRESENTATION: Record<string, { label: string; tone: string; icon: typeof Clock3 }> = {
  'ОФОРМЛЕН': { label: 'Оформлен', tone: 'blue', icon: Clock3 },
  'СОБРАН': { label: 'Собран', tone: 'amber', icon: Package },
  'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ': { label: 'Ссылка отправлена', tone: 'amber', icon: AlertCircle },
  'ОПЛАЧЕН': { label: 'Оплачен', tone: 'green', icon: Check },
  'ВЫЗВАН КУРЬЕР': { label: 'Вызван курьер', tone: 'slate', icon: Truck },
  'ПОЛУЧЕН': { label: 'Получен', tone: 'slate', icon: Check },
  'УДАЛЕНО': { label: 'Отменён', tone: 'red', icon: AlertCircle },
  'ВОЗВРАТ': { label: 'Возврат', tone: 'red', icon: AlertCircle },
};

const STATUS_TONES: Record<string, string> = {
  blue: 'bg-sky-50 text-sky-800 ring-sky-200',
  amber: 'bg-amber-50 text-amber-900 ring-amber-200',
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  slate: 'bg-stone-100 text-stone-700 ring-stone-200',
  red: 'bg-rose-50 text-rose-800 ring-rose-200',
  neutral: 'bg-stone-100 text-stone-700 ring-stone-200',
};

export function getOrderReference(id: string): string {
  return id.slice(-6).toUpperCase();
}

export function formatOrderMoney(value: string | number): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${value} ₽`;
  return `${new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)} ₽`;
}

export function formatOrderDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Дата не указана';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function OrderStatus({ status }: { status: string }) {
  const presentation = STATUS_PRESENTATION[status];
  const Icon = presentation?.icon ?? Clock3;
  const tone = STATUS_TONES[presentation?.tone ?? 'neutral'];
  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ${tone}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{presentation?.label ?? status}</span>
    </span>
  );
}

export function OrderItems({ order }: { order: CustomerOrder }) {
  return (
    <div className="divide-y divide-[#e8e1d5]">
      {order.items.map((item, index) => {
        const lineTotal = Number(item.price) * item.quantity;
        return (
          <div key={`${item.productId}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 py-4 first:pt-0 last:pb-0">
            <p className="min-w-0 break-words font-medium leading-snug text-[#302b24]">{item.productName}</p>
            <p className="row-span-2 self-center whitespace-nowrap text-right font-semibold tabular-nums text-[#302b24]">
              {formatOrderMoney(lineTotal)}
            </p>
            <p className="min-w-0 break-words text-sm text-[#797367]">
              {formatOrderQuantity(item.quantity, item.unit)} {item.unit} <span aria-hidden="true">·</span> {formatOrderMoney(item.price)} / {item.unit}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function PaymentGuidance({ order }: { order: CustomerOrder }) {
  const isOnline = order.paymentMethod === 'yookassa';
  const wasLinkSent = order.status === 'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ';
  const isPaid = order.status === 'ОПЛАЧЕН';
  const isCancelled = order.status === 'УДАЛЕНО';
  const awaitingManagerConfirmation = ['ОФОРМЛЕН', 'СОБРАН'].includes(order.status);
  const message = isCancelled
    ? null
    : isOnline && wasLinkSent
      ? 'По статусу заказа ссылка отправлена. Проверьте сообщения от магазина; если ссылки нет, свяжитесь с менеджером.'
      : isOnline && !isPaid && awaitingManagerConfirmation
        ? 'Ссылку на онлайн-оплату отправят после подтверждения заказа менеджером.'
        : isOnline && isPaid
          ? 'Оплата отмечена в заказе как полученная.'
          : order.paymentMethod === 'cash_on_delivery'
            ? 'Вы выбрали оплату наличными при получении.'
            : null;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.13em] text-[#8b806b]">Оплата</p>
      <p className="mt-1.5 font-medium text-[#302b24]">
        {PAYMENT_METHOD_LABELS[order.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS] ?? order.paymentMethod}
      </p>
      {message && <p className="mt-2 text-sm leading-relaxed text-[#766e5e]">{message}</p>}
    </div>
  );
}

export function DeliveryMethodLabel({ method }: { method?: string | null }) {
  if (!method) return null;
  return (
    <p className="mt-1.5 font-medium leading-relaxed text-[#302b24]">
      {DELIVERY_METHOD_LABELS[method as keyof typeof DELIVERY_METHOD_LABELS] ?? method}
    </p>
  );
}
