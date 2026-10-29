import type { Express, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { pool } from './db';
import { EditorialError } from './services/editorial';
import { ownPriceSubmissions, submitPrice, PriceSubmissionLimitError } from './services/price-submissions';

export function registerPriceSubmissionRoutes(app: Express, guard: RequestHandler,
  actor: (req: Request) => string | undefined, database = pool) {
  const base = '/web-api/editorial/cheeses/:id/price-submissions';
  const handle = (run: (req: Request, res: Response, userId: string, cheeseId: string) => Promise<unknown>): RequestHandler =>
    async (req, res) => {
      res.set('Cache-Control', 'private, no-store');
      try {
        const userId = actor(req);
        if (!userId) return void res.status(401).json({ error: 'Требуется авторизация' });
        await run(req, res, userId, z.string().uuid().parse(req.params.id));
      } catch (error) {
        if (error instanceof z.ZodError)
          return void res.status(400).json({ error: error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '), issues: error.issues });
        if (error instanceof PriceSubmissionLimitError) {
          res.set('Retry-After', String(error.retryAfterSeconds));
          return void res.status(429).json({ error: error.message, retryAfterSeconds: error.retryAfterSeconds, nextAllowedAt: error.nextAllowedAt });
        }
        if (error instanceof EditorialError) return void res.status(error.status).json({ error: error.message });
        console.error('Customer price submission failed:', error instanceof Error ? error.message : 'unknown');
        res.status(503).json({ error: 'Не удалось обработать сведения о цене. Данные не подтверждены. Попробуйте позже.' });
      }
    };
  const noCache: RequestHandler = (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); };
  app.post(base, noCache, guard, handle(async (req, res, userId, cheeseId) => {
    res.status(201).json(await submitPrice(cheeseId, req.body, userId, database));
  }));
  app.get(`${base}/mine`, noCache, guard, handle(async (req, res, userId, cheeseId) => {
    const query = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1),
      limit: z.coerce.number().int().min(1).max(20).default(10) }).strict().parse(req.query);
    res.json(await ownPriceSubmissions(cheeseId, userId, query.page, query.limit, database));
  }));
}
