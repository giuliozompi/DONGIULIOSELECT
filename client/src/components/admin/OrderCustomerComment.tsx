export function OrderCustomerComment({ notes }: { notes?: string | null }) {
  if (!notes?.trim()) return null;
  return (
    <section aria-label="Комментарий покупателя" className="min-w-0 space-y-1 rounded-md border bg-muted/50 p-4 text-sm" data-testid="order-customer-comment">
      <h3 className="font-semibold">Комментарий покупателя</h3>
      <p className="whitespace-pre-wrap [overflow-wrap:anywhere]" data-testid="order-customer-comment-text">{notes}</p>
    </section>
  );
}
