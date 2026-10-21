import type { Express, RequestHandler } from 'express';
import { and, eq, inArray } from 'drizzle-orm';
import { orders, products } from '../shared/schema';
import { buildReorderPreview, getReorderProductIds } from '../shared/reorder';
import type { db } from './db';

export function registerWebReorder(app: Express, database: typeof db, requireAuth: RequestHandler) {
  // Read-only: repeating an order never creates an order, payment or notification.
  app.get('/web-api/orders/:id/reorder', requireAuth, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const userId = (req as any).webUser.sub as string;
      const [order] = await database.select().from(orders)
        .where(and(eq(orders.id, req.params.id), eq(orders.userId, `web:${userId}`)));
      if (!order) return res.status(404).json({ error: 'Заказ не найден' });
      const ids = getReorderProductIds(order.items);
      const catalogue = ids.length
        ? await database.select().from(products).where(inArray(products.id, ids))
        : [];
      return res.json(buildReorderPreview(order.items, catalogue));
    } catch {
      return res.status(500).json({ error: 'Не удалось проверить товары и текущие цены. Попробуйте ещё раз.' });
    }
  });
}
