import type { Express, Request, RequestHandler } from 'express';
import { z } from 'zod';
import { pool } from './db';
import { EditorialError } from './services/editorial';
import { getEditorialFx } from './services/editorial-fx';
import {
  listPriceWatches, createPriceWatch, setPriceWatchActive, reserveMarketCheck, executeMarketCheck,
  getMarketCheck, marketHistory, applyMarketCheck, marketDeps, type MarketDeps,
} from './services/editorial-market';
export function registerEditorialMarketRoutes(app: Express, guards: RequestHandler[],
  actor: (req: Request) => string | undefined, database = pool, deps: MarketDeps = marketDeps) {
  app.get('/web-api/editorial/fx-rates', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try { res.json(await getEditorialFx(database)); }
    catch { res.status(503).json({ error: 'Курс временно недоступен. Цена в исходной валюте не изменена.' }); }
  });
  const base = '/web-api/admin/editorial-market';
  const wrap = (work: (req: Request, actor: string) => Promise<unknown>, status = 200): RequestHandler => async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    try {
      const operator = actor(req);
      if (!operator) return void res.status(401).json({ error: 'Требуется авторизация' });
      res.status(status).json(await work(req, operator));
    } catch (error) {
      if (error instanceof z.ZodError) return void res.status(400).json({ error: error.issues.map(issue => issue.message).join('; ') });
      if (error instanceof EditorialError) return void res.status(error.status).json({ error: error.message });
      console.error('Editorial market operation failed');
      res.status(503).json({ error: 'Не удалось выполнить операцию. Проверьте историю перед повторением.' });
    }
  };
  const id = (req: Request) => z.string().uuid().parse(req.params.id);
  const page = (req: Request) => z.object({ page: z.coerce.number().int().min(1).max(100000).default(1) }).strict().parse(req.query).page;
  app.get(`${base}/watches`, ...guards, wrap(req => listPriceWatches(page(req), database)));
  app.post(`${base}/watches`, ...guards, wrap((req, actor) => createPriceWatch(req.body, actor, database), 201));
  app.patch(`${base}/watches/:id`, ...guards, wrap((req, actor) => setPriceWatchActive(id(req), req.body, actor, database)));
  app.post(`${base}/watches/:id/check`, ...guards, wrap(async (req, actor) => {
    const body = z.object({ requestId: z.string().uuid() }).strict().parse(req.body);
    const { check, created } = await reserveMarketCheck(id(req), body.requestId, actor, database);
    if (created) void executeMarketCheck(check.id, database, deps).catch(() => console.error('Price check completion could not be recorded'));
    return check;
  }, 202));
  app.get(`${base}/watches/:id/checks`, ...guards, wrap(req => marketHistory(id(req), page(req), database)));
  app.get(`${base}/checks/:id`, ...guards, wrap(req => getMarketCheck(id(req), database)));
  app.post(`${base}/checks/:id/apply`, ...guards, wrap((req, actor) => applyMarketCheck(id(req), req.body, actor, database)));
}
