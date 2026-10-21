import type { Express, RequestHandler } from 'express';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq } from 'drizzle-orm';
import { products, webWishlists } from '../shared/schema';

// Separate registration keeps the real handlers testable against an isolated database.
export function registerWebWishlistRoutes(
  app: Express,
  db: NodePgDatabase<any>,
  requireWebAuth: RequestHandler,
) {
  app.get('/web-api/wishlist', requireWebAuth, async (req, res) => {
    try {
      const { sub } = (req as any).webUser as { sub: string };
      const items = await db.select({
        id: webWishlists.id,
        productId: webWishlists.productId,
        createdAt: webWishlists.createdAt,
        product: products,
      }).from(webWishlists)
        .leftJoin(products, eq(webWishlists.productId, products.id))
        .where(eq(webWishlists.userId, sub));
      return res.json(items);
    } catch {
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  app.put('/web-api/wishlist/:productId', requireWebAuth, async (req, res) => {
    try {
      const { sub } = (req as any).webUser as { sub: string };
      // The database constraint arbitrates concurrent adds, including other processes.
      await db.insert(webWishlists).values({ userId: sub, productId: req.params.productId })
        .onConflictDoNothing({ target: [webWishlists.userId, webWishlists.productId] });
      return res.json({ inWishlist: true });
    } catch (error) {
      if ((error as { code?: string }).code === '23503') {
        return res.status(404).json({ error: 'Пользователь или товар не найден' });
      }
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  app.delete('/web-api/wishlist/:productId', requireWebAuth, async (req, res) => {
    try {
      const { sub } = (req as any).webUser as { sub: string };
      await db.delete(webWishlists).where(and(
        eq(webWishlists.userId, sub), eq(webWishlists.productId, req.params.productId),
      ));
      return res.json({ inWishlist: false });
    } catch {
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  });

  // Never retain the unsafe toggle for old tabs/clients: they must refresh.
  app.post('/web-api/wishlist/:productId', requireWebAuth, (_req, res) => {
    res.set('Allow', 'PUT, DELETE');
    return res.status(405).json({ error: 'Обновите страницу и попробуйте ещё раз' });
  });
}
