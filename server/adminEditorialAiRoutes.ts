import type { Express, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { pool } from './db';
import { EditorialError } from './services/editorial';
import { reserveAiRun, executeAiRun, getAiRun, aiHistory, defaultAiDependencies, type AiDependencies } from './services/editorial-ai';
import { rankAiCatalog, importAiCatalog, applyAiDraft } from './services/editorial-ai-changes';
import { suggestEditorialSources } from './services/editorial-ai-suggestions';
import { researchRequestSchema } from '../shared/editorial-ai';
import { lookupEditorialOrigin, applyEditorialOrigin } from './services/editorial-origin';

export function registerAdminEditorialAiRoutes(app: Express, guards: RequestHandler[],
  actor: (req: Request) => string | undefined, database = pool, deps: AiDependencies = defaultAiDependencies) {
  const base = '/web-api/admin/editorial-ai';
  const handle = (work: (req: Request, res: Response, operator: string) => Promise<unknown>): RequestHandler => async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    try {
      const operator = actor(req);
      if (!operator) return void res.status(401).json({ error: 'Требуется авторизация' });
      await work(req, res, operator);
    } catch (error) {
      if (error instanceof z.ZodError) return void res.status(400).json({ error: error.issues.map(issue => issue.message).join('; ') });
      if (error instanceof EditorialError) return void res.status(error.status).json({ error: error.message });
      console.error('Editorial AI database operation failed');
      res.status(503).json({ error: 'Не удалось выполнить операцию AI. Проверьте историю, прежде чем повторять действие.' });
    }
  };
  for (const kind of ['catalog', 'draft'] as const) {
    app.post(`${base}/${kind}`, ...guards, handle(async (req, res, operator) => {
      const { run, created } = await reserveAiRun(kind, req.body, operator, database);
      if (created) void executeAiRun(run.id, database, deps).catch(() => console.error('Editorial AI completion could not be recorded'));
      res.status(created ? 202 : 200).json(run);
    }));
  }
  app.post(`${base}/sources`, ...guards, handle(async (req, res, operator) => {
    res.json(await suggestEditorialSources(req.body, operator, database, deps));
  }));
  app.post(`${base}/research`, ...guards, handle(async (req, res, operator) => {
    const body = researchRequestSchema.parse(req.body);
    const { run, created } = await reserveAiRun('draft', { ...body, research: true }, operator, database);
    if (created) void executeAiRun(run.id, database, deps).catch(() => console.error('Editorial research completion could not be recorded'));
    res.status(created ? 202 : 200).json(run);
  }));
  app.post(`${base}/origin-geocoding`, ...guards, handle(async (req, res, operator) => {
    res.json(await lookupEditorialOrigin(req.body, operator, database));
  }));
  app.post(`${base}/origin-geocoding/apply`, ...guards, handle(async (req, res, operator) => {
    res.json(await applyEditorialOrigin(req.body, operator, database));
  }));
  app.get(`${base}/runs`, ...guards, handle(async (req, res) => {
    const query = z.object({ kind: z.enum(['catalog', 'draft']), page: z.coerce.number().int().min(1).max(100000).default(1), entryId: z.string().uuid().optional() }).strict().parse(req.query);
    if (query.entryId && query.kind !== 'draft') throw new EditorialError(400, 'Фильтр статьи доступен только для заготовок');
    res.json(await aiHistory(query.kind, query.page, database, query.entryId));
  }));
  const id = (req: Request) => z.string().uuid().parse(req.params.id);
  app.get(`${base}/runs/:id`, ...guards, handle(async (req, res) => { res.json(await getAiRun(id(req), database)); }));
  app.patch(`${base}/runs/:id/ranking`, ...guards, handle(async (req, res, operator) => { res.json(await rankAiCatalog(id(req), req.body, operator, database)); }));
  app.post(`${base}/runs/:id/import`, ...guards, handle(async (req, res, operator) => { res.json(await importAiCatalog(id(req), req.body, operator, database)); }));
  app.post(`${base}/runs/:id/apply`, ...guards, handle(async (req, res, operator) => { res.json(await applyAiDraft(id(req), req.body, operator, database)); }));
}
