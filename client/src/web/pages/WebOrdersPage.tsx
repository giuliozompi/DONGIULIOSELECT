import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, ArrowRight, ChevronRight, Package, RotateCcw } from 'lucide-react';
import { useLocation, useParams } from 'wouter';
import { Button } from '@/components/ui/button';
import { useWebAuth } from '../hooks/useWebAuth';
import { webApi } from '../lib/webApi';
import { OrderDetail } from '../components/orders/OrderDetail';
import {
  formatOrderDate,
  formatOrderMoney,
  getOrderReference,
  OrderStatus,
} from '../components/orders/order-view';
import type { CustomerOrder } from '../components/orders/order-view';

function EmptyState({ onCatalog }: { onCatalog: () => void }) {
  return (
    <section data-testid="orders-empty" className="rounded-[1.5rem] border border-dashed border-[#d9ceb9] bg-[#fbf8f1] px-6 py-14 text-center">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eee5d5] text-[#907747]">
        <Package className="h-7 w-7" aria-hidden="true" />
      </div>
      <h2 className="text-xl font-semibold tracking-tight text-[#302b24]">Пока нет заказов</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[#766e5e]">Когда оформите покупку, здесь появятся её состав и детали доставки.</p>
      <Button onClick={onCatalog} className="mt-6 bg-[#75613d] text-[#fffdf8] hover:bg-[#5f4e31]">Открыть каталог</Button>
    </section>
  );
}

function OrdersSkeleton({ detail = false }: { detail?: boolean }) {
  return (
    <div className="space-y-3" aria-label="Загрузка заказов" aria-busy="true">
      {detail ? (
        <div className="h-[30rem] animate-pulse rounded-[1.5rem] border border-[#e4dccd] bg-[#f6f1e7]" />
      ) : [1, 2, 3].map(item => (
        <div key={item} className="h-36 animate-pulse rounded-[1.25rem] border border-[#e4dccd] bg-[#f6f1e7]" />
      ))}
    </div>
  );
}

function ErrorState({ onRetry, notFound = false }: { onRetry: () => void; notFound?: boolean }) {
  return (
    <section
      data-testid={notFound ? 'order-not-found' : 'orders-error'}
      role="alert"
      className="rounded-[1.5rem] border border-[#e4dccd] bg-[#fbf8f1] px-6 py-12 text-center"
    >
      <AlertCircle className="mx-auto h-8 w-8 text-[#a15d42]" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-semibold text-[#302b24]">{notFound ? 'Заказ не найден' : 'Не удалось загрузить заказы'}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#766e5e]">
        {notFound ? 'Проверьте номер заказа или вернитесь к списку своих заказов.' : 'Проверьте соединение и попробуйте ещё раз.'}
      </p>
      {!notFound && (
        <Button data-testid="orders-retry" variant="outline" onClick={onRetry} className="mt-5 border-[#cfc2a9] text-[#5f4e31] hover:bg-[#f1eadc]">
          <RotateCcw className="mr-2 h-4 w-4" /> Повторить
        </Button>
      )}
    </section>
  );
}

function OrderCard({ order, onOpen }: { order: CustomerOrder; onOpen: () => void }) {
  return (
    <article data-testid={`card-order-${order.id}`} className="rounded-[1.25rem] border border-[#e4dccd] bg-[#fffdf8] transition-colors hover:border-[#cdbd9c]">
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-sm font-semibold tracking-wide text-[#514936]">№ {getOrderReference(order.id)}</p>
            <p className="mt-1 text-xs text-[#8b806b]">{formatOrderDate(order.createdAt)}</p>
          </div>
          <OrderStatus status={order.status} />
        </div>
        <div className="flex flex-col gap-4 border-t border-[#eee8dc] pt-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="line-clamp-2 text-sm leading-relaxed text-[#655e51]">
              {order.items.map(item => item.productName).join(' · ')}
            </p>
            <p className="mt-1 text-xs text-[#928977]">{order.items.length} {order.items.length === 1 ? 'позиция' : order.items.length >= 2 && order.items.length <= 4 ? 'позиции' : 'позиций'}</p>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-4 sm:justify-end">
            <span className="text-lg font-semibold tabular-nums text-[#302b24]">{formatOrderMoney(order.amount)}</span>
            <Button
              data-testid={`open-order-${order.id}`}
              variant="ghost"
              size="sm"
              onClick={onOpen}
              className="min-h-11 px-3 text-[#75613d] hover:bg-[#f4eee2] hover:text-[#514329]"
              aria-label={`Открыть заказ № ${getOrderReference(order.id)}`}
            >
              <span>Подробнее</span>
              <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function WebOrdersPage() {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id?: string }>();
  const { isAuthenticated, isLoading: isAuthLoading } = useWebAuth();
  const isDetail = Boolean(id);

  const listQuery = useQuery({
    queryKey: ['/web-api/orders'],
    queryFn: () => webApi.get<CustomerOrder[]>('/orders'),
    enabled: isAuthenticated && !isDetail,
  });
  const detailQuery = useQuery({
    queryKey: ['/web-api/orders', id],
    queryFn: () => webApi.get<CustomerOrder>(`/orders/${encodeURIComponent(id!)}`),
    enabled: isAuthenticated && Boolean(id),
    retry: false,
  });

  if (isAuthLoading) {
    return <div className="mx-auto min-h-[50vh] max-w-4xl px-4 py-8 sm:px-6"><OrdersSkeleton detail={isDetail} /></div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
        <p className="mb-5 text-[#766e5e]">Войдите в аккаунт, чтобы просматривать заказы.</p>
        <Button onClick={() => setLocation('/web')} className="bg-[#75613d] text-[#fffdf8] hover:bg-[#5f4e31]">На главную</Button>
      </div>
    );
  }

  const goToList = () => setLocation('/web/account/orders');
  const errorText = detailQuery.error instanceof Error ? detailQuery.error.message : '';
  const notFound = /404|not found|не найден/i.test(errorText);

  return (
    <div className="min-h-[55vh] bg-[#f8f5ed]">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={isDetail ? goToList : () => setLocation('/web/account')}
            className="text-[#75613d] hover:bg-[#eee7d9] hover:text-[#514329]"
            data-testid={isDetail ? 'back-to-orders' : 'back-to-account'}
          >
            {isDetail ? <ArrowLeft className="mr-2 h-4 w-4" /> : <ArrowLeft className="mr-2 h-4 w-4" />}
            {isDetail ? 'Все заказы' : 'Аккаунт'}
          </Button>
          {!isDetail && <span className="text-xs font-medium uppercase tracking-[0.14em] text-[#928977]">Личный кабинет</span>}
        </div>

        {isDetail ? (
          detailQuery.isLoading ? <OrdersSkeleton detail /> :
            detailQuery.isError ? (
              <ErrorState notFound={notFound} onRetry={() => void detailQuery.refetch()} />
            ) : detailQuery.data ? (
              <OrderDetail order={detailQuery.data} />
            ) : <ErrorState notFound onRetry={() => void detailQuery.refetch()} />
        ) : (
          <>
            <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#8b806b]">Покупки</p>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#302b24]">Мои заказы</h1>
              </div>
              {!listQuery.isLoading && listQuery.data && listQuery.data.length > 0 && (
                <span className="text-sm text-[#817969]">{listQuery.data.length} заказов</span>
              )}
            </header>
            {listQuery.isLoading ? <OrdersSkeleton /> :
              listQuery.isError ? (
                <ErrorState onRetry={() => void listQuery.refetch()} />
              ) : listQuery.data?.length ? (
                <div className="space-y-3">
                  {listQuery.data.map(order => (
                    <OrderCard key={order.id} order={order} onOpen={() => setLocation(`/web/orders/${encodeURIComponent(order.id)}`)} />
                  ))}
                </div>
              ) : (
                <EmptyState onCatalog={() => setLocation('/web/catalog')} />
              )}
          </>
        )}
        {isDetail && (
          <div className="mt-5 text-center">
            <Button variant="ghost" onClick={goToList} className="text-[#75613d]">
              <ArrowRight className="mr-2 h-4 w-4 rotate-180" /> Вернуться ко всем заказам
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
