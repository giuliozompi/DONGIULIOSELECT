import type { Express, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { editorialKinds, editorialRegionMaxLength } from '../shared/editorial';
import { cheeseEditorialStages } from '../shared/editorial-stages';
import { pool } from './db';
import { EditorialError, listEditorial, saveEditorial, deleteEditorial, moderateEditorial, approveDraftCheeses } from './services/editorial';
import { changePublication, publishApprovedCheeses } from './services/editorial-publication';

const kind = z.enum(editorialKinds);
const idSchema = z.string().uuid();
const revision = z.number().int().positive();
export function registerAdminEditorialRoutes(app: Express, guards: RequestHandler[], actor: (req: Request) => string | undefined, database = pool) {
  const base = '/web-api/admin/editorial';
  const handle = (run: (req: Request, res: Response, operator: string) => Promise<unknown>): RequestHandler =>
    async (req, res) => {
      res.set('Cache-Control', 'no-store');
      try {
        const operator = actor(req);
        if (!operator) return void res.status(401).json({ error: 'Требуется авторизация' });
        await run(req, res, operator);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return void res.status(400).json({ error: error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '), issues: error.issues });
        }
        if (error instanceof EditorialError) return void res.status(error.status).json({ error: error.message });
        console.error('Editorial operation failed:', error instanceof Error ? error.message : 'unknown');
        res.status(503).json({ error: 'Не удалось выполнить операцию. Проверьте доступность редакционного раздела и попробуйте ещё раз.' });
      }
    };
  app.get(base, ...guards, handle(async (req, res) => {
    const query = z.object({ kind, offset: z.coerce.number().int().min(0).default(0),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      stage: z.enum(cheeseEditorialStages).optional(),
      originCountry: z.string().trim().min(1).max(100).optional(),
      originRegion: z.string().trim().max(editorialRegionMaxLength).optional() }).strict().parse(req.query);
    res.json(await listEditorial(query.kind, query.offset, query.limit, database, query.stage, {
      originCountry: query.originCountry, originRegion: query.originRegion,
    }));
  }));
  app.post(base, ...guards, handle(async (req, res, operator) => {
    const body = z.object({ kind, data: z.unknown(), publish: z.boolean().default(false) }).strict().parse(req.body);
    res.status(201).json(await saveEditorial(body.kind, body.data, operator, undefined, database, body.publish));
  }));
  app.post(`${base}/cheese/approve-batch`, ...guards, handle(async (req, res, operator) => {
    res.json(await approveDraftCheeses(req.body, operator, database));
  }));
  app.post(`${base}/cheese/publish-batch`, ...guards, handle(async (req, res, operator) => {
    res.json(await publishApprovedCheeses(req.body, operator, database));
  }));
  app.patch(`${base}/:id`, ...guards, handle(async (req, res, operator) => {
    const body = z.object({ kind, data: z.unknown(), revision, publish: z.boolean().default(false) }).strict().parse(req.body);
    res.json(await saveEditorial(body.kind, body.data, operator, { id: idSchema.parse(req.params.id), revision: body.revision }, database, body.publish));
  }));
  app.post(`${base}/:id/moderate`, ...guards, handle(async (req, res, operator) => {
    const body = z.object({ revision, decision: z.enum(['approved', 'rejected']),
      note: z.string().trim().min(1).max(2000) }).strict().parse(req.body);
    res.json(await moderateEditorial(idSchema.parse(req.params.id), body.revision, body.decision, body.note, operator, database));
  }));
  for (const [action, publish] of [['publish', true], ['unpublish', false]] as const) {
    app.post(`${base}/:id/${action}`, ...guards, handle(async (req, res, operator) => {
      const body = z.object({ revision }).strict().parse(req.body);
      res.json(await changePublication(idSchema.parse(req.params.id), body.revision, publish, operator, database));
    }));
  }
  app.delete(`${base}/:id`, ...guards, handle(async (req, res, operator) => {
    const body = z.object({ revision: z.coerce.number().int().positive() }).strict().parse(req.query);
    await deleteEditorial(idSchema.parse(req.params.id), body.revision, operator, database);
    res.status(204).end();
  }));
}
