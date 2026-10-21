import { MapPin, Phone, UserRound } from 'lucide-react';
import {
  DeliveryMethodLabel,
  formatOrderDate,
  formatOrderMoney,
  getOrderReference,
  OrderItems,
  OrderStatus,
  PaymentGuidance,
} from './order-view';
import type { CustomerOrder } from './order-view';

export function OrderDetail({ order }: { order: CustomerOrder }) {
  const discount = Number(order.discount ?? 0);
  const courierWasCalled = order.status === 'ВЫЗВАН КУРЬЕР';

  return (
    <article data-testid="order-detail" className="overflow-hidden rounded-[1.5rem] border border-[#e4dccd] bg-[#fffdf8] shadow-[0_16px_50px_-34px_rgba(65,48,22,0.4)]">
      <header className="border-b border-[#e8e1d5] bg-[#f6f1e7] px-5 py-6 sm:px-8 sm:py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#8c806a]">Заказ</p>
            <h1 className="mt-1 font-mono text-2xl font-semibold tracking-tight text-[#302b24] sm:text-3xl">
              № {getOrderReference(order.id)}
            </h1>
            <p className="mt-2 text-sm text-[#766e5e]">{formatOrderDate(order.createdAt)}</p>
          </div>
          <OrderStatus status={order.status} />
        </div>
        {courierWasCalled && (
          <p className="mt-5 max-w-2xl border-l-2 border-[#b79d69] pl-3 text-sm leading-relaxed text-[#766e5e]">
            Магазин оформил вызов курьера. Этот статус сам по себе не подтверждает, что заказ уже забран или находится в пути.
          </p>
        )}
      </header>

      <div className="grid lg:grid-cols-[1.35fr_0.85fr]">
        <section className="px-5 py-6 sm:px-8 sm:py-8" aria-labelledby="order-items-heading">
          <div className="mb-5 flex items-end justify-between gap-3">
            <h2 id="order-items-heading" className="text-lg font-semibold tracking-tight text-[#302b24]">Состав заказа</h2>
            <span className="text-sm text-[#817969]">{order.items.length} {order.items.length === 1 ? 'позиция' : order.items.length >= 2 && order.items.length <= 4 ? 'позиции' : 'позиций'}</span>
          </div>
          <OrderItems order={order} />
          <div className="mt-6 border-t border-[#e8e1d5] pt-4">
            {discount > 0 && (
              <div className="mb-2 flex justify-between gap-4 text-sm text-[#766e5e]">
                <span>Скидка</span><span className="tabular-nums">−{formatOrderMoney(discount)}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-semibold text-[#302b24]">Итого</span>
              <span className="text-xl font-semibold tabular-nums tracking-tight text-[#302b24]">{formatOrderMoney(order.amount)}</span>
            </div>
          </div>
        </section>

        <aside className="space-y-6 border-t border-[#e8e1d5] bg-[#fbf8f1] px-5 py-6 sm:px-8 sm:py-8 lg:border-l lg:border-t-0">
          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.13em] text-[#8b806b]">Получатель</p>
            <div className="mt-2 flex items-start gap-2.5 text-[#302b24]">
              <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-[#a18d62]" aria-hidden="true" />
              <span className="min-w-0 break-words font-medium">{order.customerName}</span>
            </div>
            <div className="mt-2 flex items-center gap-2.5 text-sm text-[#625b4e]">
              <Phone className="h-4 w-4 shrink-0 text-[#a18d62]" aria-hidden="true" />
              <a className="underline decoration-[#d2c6af] underline-offset-4 hover:text-[#302b24] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#907747]" href={`tel:${order.customerPhone}`}>
                {order.customerPhone}
              </a>
            </div>
            {order.customerEmail && <p className="mt-2 break-all pl-[26px] text-sm text-[#766e5e]">{order.customerEmail}</p>}
          </section>
          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.13em] text-[#8b806b]">Доставка</p>
            <div className="mt-2 flex items-start gap-2.5">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#a18d62]" aria-hidden="true" />
              <p className="min-w-0 break-words font-medium leading-relaxed text-[#302b24]">{order.deliveryAddress}</p>
            </div>
            <DeliveryMethodLabel method={order.deliveryMethod} />
            {order.deliveryNotes && <p className="mt-3 border-l-2 border-[#d9ccb4] pl-3 text-sm leading-relaxed text-[#766e5e]">{order.deliveryNotes}</p>}
          </section>
          <section className="border-t border-[#e8e1d5] pt-5">
            <PaymentGuidance order={order} />
          </section>
        </aside>
      </div>
    </article>
  );
}
