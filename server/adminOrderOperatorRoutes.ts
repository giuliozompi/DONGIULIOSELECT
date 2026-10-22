import type { Express, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { storage } from './storage';
import { changeOrderPaymentMethod, OrderPaymentMethodError } from './services/order-payment-method';
import { renderOrderPrintDocument } from './services/order-print-document';

type Operator = (req: Request) => string | undefined;

export function registerAdminOrderOperatorRoutes(
  app: Express, prefix: '/api' | '/web-api', guards: RequestHandler[], operator: Operator,
) {
  const path = `${prefix}/admin/orders/:id`;
  app.patch(`${path}/payment-method`, ...guards, async (req: Request, res: Response) => {
    try {
      const actor = operator(req);
      if (!actor) return res.status(401).json({ error: 'Требуется авторизация оператора.' });
      const { paymentMethod } = z.object({
        paymentMethod: z.enum(['yookassa', 'cash_on_delivery']),
      }).strict().parse(req.body);
      const change = await changeOrderPaymentMethod(req.params.id, paymentMethod, actor);
      const updated = await storage.getOrderById(req.params.id);
      if (!updated) return res.status(404).json({ error: 'Заказ не найден.' });
      res.set('Cache-Control', 'no-store');
      res.json({ ...updated, paymentMethodChanged: change.changed });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: 'Выберите доступный способ оплаты.' });
      if (err instanceof OrderPaymentMethodError) return res.status(err.status).json({ error: err.message });
      console.error('Could not change order payment method:', err);
      return res.status(500).json({ error: 'Не удалось сохранить изменение и запись в журнале. Попробуйте ещё раз.' });
    }
  });
  app.get(`${path}/print`, ...guards, async (req: Request, res: Response) => {
    try {
      const { format } = z.object({
        format: z.enum(['packing-list', 'label']),
      }).parse(req.query);
      const order = await storage.getOrderById(req.params.id);
      if (!order) return res.status(404).json({ error: 'Заказ не найден.' });
      res.set('Cache-Control', 'no-store');
      return res.json({ html: await renderOrderPrintDocument(order, format) });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: 'Неизвестный формат печати.' });
      if (err instanceof Error && /Нельзя напечатать|Некорректное количество/.test(err.message)) {
        return res.status(409).json({ error: err.message });
      }
      console.error('Could not prepare order print document:', err);
      return res.status(500).json({ error: 'Не удалось подготовить заказ к печати.' });
    }
  });
}
