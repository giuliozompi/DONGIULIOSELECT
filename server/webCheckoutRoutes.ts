import type { Express, RequestHandler } from 'express';
import { randomUUID } from 'crypto';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { products, orders, webUsers, welcomeNotifications, abandonedCartNotifications } from '../shared/schema';
import { createOrderSchema, quoteItems, promoError, applyQuoteDiscount, quoteChanged, CheckoutError } from '../shared/checkout';
import type { db } from './db';

export function registerWebCheckout(app: Express, database: typeof db, requireAuth: RequestHandler) {
  app.post('/web-api/orders', requireAuth, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const body = createOrderSchema.parse(req.body);
      const sub = (req as any).webUser.sub as string;
      const result = await database.transaction(async tx => {
        // Hold catalogue prices/availability stable through insertion; lock promos
        // exclusively so concurrent checkouts cannot spend the same code twice.
        const catalogue = await tx.select().from(products)
          .where(inArray(products.id, body.items.map(i => i.productId))).for('share');
        let quote = quoteItems(body.items, catalogue);
        const code = body.promoCode?.toUpperCase();
        const table = code?.startsWith('BENVENUTO-') ? welcomeNotifications : abandonedCartNotifications;
        let promoId: string | undefined;
        if (code) {
          const [user] = await tx.select().from(webUsers).where(eq(webUsers.id, sub));
          const owners = [`web:${sub}`, ...(user?.telegramUserId ? [user.telegramUserId] : [])];
          const [promo] = await tx.select().from(table).where(eq(table.discountCode, code)).for('update');
          const error = promoError(promo, owners, Number(quote.subtotal));
          if (error) quote.message = `${error}. Скидка удалена; проверьте итог и подтвердите заказ ещё раз.`;
          else {
            quote = applyQuoteDiscount(quote, promo.discountPercent, code);
            promoId = promo.id;
          }
        }
        if (quoteChanged(body, quote)) return { status: 409, data: {
          code: 'CHECKOUT_CHANGED', error: 'Условия заказа изменились. Проверьте обновлённый итог.',
          quote,
        } };
        const [order] = await tx.insert(orders).values({
          id: randomUUID(), userId: `web:${sub}`, items: quote.items,
          amount: quote.amount, discount: quote.discount,
          discountType: quote.discountPercent ? 'percentage' : null,
          discountValue: quote.discountPercent ? `${quote.discountPercent}%` : null,
          customerName: body.customerName, customerPhone: body.customerPhone,
          customerEmail: body.customerEmail || null, deliveryAddress: body.deliveryAddress,
          deliveryNotes: body.deliveryNotes || null, paymentMethod: body.paymentMethod,
          status: 'ОФОРМЛЕН', spinTokensAwarded: false,
        }).returning();
        if (promoId) await tx.update(table).set({ status: 'used', usedInOrderId: order.id }).where(eq(table.id, promoId));
        return { status: 201, data: order };
      });
      return res.status(result.status).json(result.data);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      if (err instanceof CheckoutError) return res.status(err.status).json({ error: err.message });
      console.error('[WebOrders] Create error:', err instanceof Error ? err.message : 'Unknown error');
      return res.status(500).json({ error: 'Ошибка создания заказа' });
    }
  });
  app.post('/web-api/promo/validate', requireAuth, async (req, res) => {
    try {
      const { code } = z.object({ code: z.string().trim().min(1).max(100) }).parse(req.body);
      const sub = (req as any).webUser.sub as string;
      const [user] = await database.select().from(webUsers).where(eq(webUsers.id, sub));
      const table = code.toUpperCase().startsWith('BENVENUTO-') ? welcomeNotifications : abandonedCartNotifications;
      const [promo] = await database.select().from(table).where(eq(table.discountCode, code.toUpperCase()));
      // Minimum spend is checked against authoritative subtotal on order creation.
      const error = promoError(promo, [`web:${sub}`, ...(user?.telegramUserId ? [user.telegramUserId] : [])], Infinity);
      return res.json(error ? { valid: false, message: error } : { valid: true, discountPercent: promo.discountPercent });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      return res.status(500).json({ error: 'Ошибка проверки промокода' });
    }
  });
}
