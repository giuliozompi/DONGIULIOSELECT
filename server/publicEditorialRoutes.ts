import type { Express, Request, RequestHandler } from 'express';
import { z } from 'zod';
import { pool } from './db';
import { EditorialError } from './services/editorial';
import { publicEditorialList, publicCheeseMap, publicVideoDetail, publicCheeseDetail, publicCheesePrices } from './services/public-editorial';

const pagination = { page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(12) };
const filters = z.object({ search: z.string().trim().max(200).default(''),
  country: z.string().trim().max(100).optional(),
  category: z.enum(['recipe', 'interview', 'review', 'places']).optional(), ...pagination }).strict();
const id = (req: Request) => z.string().uuid().parse(req.params.id);
export function registerPublicEditorialRoutes(app: Express, database = pool) {
  const base = '/web-api/editorial';
  const route = (work: (req: Request) => Promise<unknown>): RequestHandler => async (req, res) => {
    // Withdrawal and moderation changes must not be hidden by stale browser/proxy data.
    res.set('Cache-Control', 'no-store');
    try { res.json(await work(req)); }
    catch (error) {
      if (error instanceof z.ZodError) return void res.status(400).json({ error: 'Некорректные параметры запроса' });
      if (error instanceof EditorialError) return void res.status(error.status).json({ error: error.message });
      console.error('Public editorial read failed:', error instanceof Error ? error.message : 'unknown');
      res.status(503).json({ error: 'Раздел временно недоступен. Попробуйте ещё раз позже.' });
    }
  };
  app.get(`${base}/videos`, route(req => publicEditorialList('video', filters.parse(req.query), database)));
  app.get(`${base}/videos/:id`, route(req => publicVideoDetail(id(req), database)));
  app.get(`${base}/cheeses`, route(req => publicEditorialList('cheese', filters.parse(req.query), database)));
  app.get(`${base}/map`, route(req => publicCheeseMap(filters.parse(req.query), database)));
  app.get(`${base}/cheeses/:id/prices`, route(req => {
    const query = z.object(pagination).strict().parse(req.query);
    return publicCheesePrices(id(req), query.page, query.limit, database);
  }));
  app.get(`${base}/cheeses/:id`, route(req => publicCheeseDetail(id(req), database)));
}
