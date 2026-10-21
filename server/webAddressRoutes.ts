import type { Express, RequestHandler } from 'express';
import { and, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { webAddresses } from '../shared/schema';
import type { db } from './db';

const patchAddressSchema = z.object({
  label: z.string().optional(),
  fullAddress: z.string().trim().min(5, 'Введите полный адрес').optional(),
  city: z.string().trim().min(2, 'Введите город').optional(),
  street: z.string().optional(),
  building: z.string().optional(),
  apartment: z.string().optional(),
  postalCode: z.string().optional(),
  notes: z.string().optional(),
  isDefault: z.boolean().optional(),
}).strict().refine(body => Object.keys(body).length > 0, 'Нет изменений')
  .refine(body => body.fullAddress === undefined || body.city !== undefined, 'Введите город');

export function registerWebAddressUpdate(app: Express, database: typeof db, requireAuth: RequestHandler) {
  app.patch('/web-api/addresses/:id', requireAuth, async (req, res) => {
    try {
      const body = patchAddressSchema.parse(req.body);
      const userId = (req as any).webUser.sub as string;
      const address = await database.transaction(async tx => {
        const [existing] = await tx.select().from(webAddresses).where(and(
          eq(webAddresses.id, req.params.id), eq(webAddresses.userId, userId),
        ));
        if (!existing) return undefined;

        // A changed manual address must not keep the previous building's metadata.
        // Apartment and courier notes are independent and survive omitted fields.
        const updates = body.fullAddress !== undefined && body.fullAddress !== existing.fullAddress
          ? { street: '', building: '', postalCode: '', ...body }
          : body;
        const [updated] = await tx.update(webAddresses).set(updates).where(and(
          eq(webAddresses.id, req.params.id), eq(webAddresses.userId, userId),
        )).returning();
        if (updated && body.isDefault === true) {
          await tx.update(webAddresses).set({ isDefault: false }).where(and(
            eq(webAddresses.userId, userId), ne(webAddresses.id, req.params.id),
          ));
        }
        return updated;
      });
      if (!address) return res.status(404).json({ error: 'Адрес не найден' });
      return res.json(address);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  });
}
