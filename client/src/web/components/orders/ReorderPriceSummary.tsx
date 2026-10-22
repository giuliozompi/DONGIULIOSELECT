import { summarizeReorderPrices, type ReorderPreviewItem } from '@shared/reorder';

const price = (value: number) => `${value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ₽`;
const difference = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${price(Math.abs(value))}`;
const labels = {
  increased: 'Цена выросла',
  decreased: 'Цена снизилась',
  unchanged: 'Цена не изменилась',
  unknown: 'Прежняя цена неизвестна',
};

export function ReorderPriceSummary({ items }: { items: ReorderPreviewItem[] }) {
  const totals = summarizeReorderPrices(items);
  return (
    <section className="min-w-0 space-y-4 text-sm" aria-label="Сравнение цен" data-testid="reorder-price-summary">
      <p className="text-neutral-600">
        Сравнение только добавленных товаров и их количества из этого заказа, не всей корзины.
        Скидки и доставка прежнего заказа не включены. Цены на вес приведены к 1 кг.
      </p>
      <ul className="space-y-3">
        {items.map((item, index) => (
          <li key={`${item.productId}-${index}`} className="min-w-0 break-words rounded border p-3">
            <p className="font-medium">{item.productName}</p>
            <p>{item.quantity.toLocaleString('ru-RU')} {item.unit}</p>
            <p>Было: {item.comparison.oldPrice === null ? 'нет данных' : `${price(item.comparison.oldPrice)} / ${item.comparison.unit}`}</p>
            <p>Сейчас: {price(item.comparison.newPrice)} / {item.comparison.unit}</p>
            <p>{labels[item.comparison.status]}</p>
            <p>Разница за это количество: {item.comparison.difference === null ? 'нет данных' : difference(item.comparison.difference)}</p>
          </li>
        ))}
      </ul>
      <div className="space-y-1 border-t pt-3" data-testid="reorder-product-totals">
        <p className="font-medium">Итого только товары</p>
        <p>Было: {totals.oldTotal === null ? 'нет полных данных' : price(totals.oldTotal)}</p>
        <p>Сейчас: {price(totals.newTotal)}</p>
        <p className="font-medium">Разница: {totals.difference === null ? 'неизвестна — нет прежней цены' : difference(totals.difference)}</p>
      </div>
    </section>
  );
}
