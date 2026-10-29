import type { Express, RequestHandler } from 'express';
import { probeTelegramApi } from './services/telegram-api';

export function registerAdminTelegramDiagnostics(
  app: Express,
  prefix: '/api' | '/web-api',
  auth: RequestHandler[],
  probe: typeof probeTelegramApi = probeTelegramApi,
) {
  app.post(`${prefix}/admin/telegram/diagnostics`,
    // Do not allow the Mini App's development-only implicit admin bypass.
    (req, res, next) => {
      res.set('Cache-Control', 'no-store');
      if (prefix === '/api' && !req.headers['x-telegram-init-data']) {
        res.status(401).json({ error: 'Требуется авторизация Telegram' });
        return;
      }
      next();
    },
    ...auth,
    async (_req, res) => {
      const result = await probe();
      res.json({ ok: result.ok, durationMs: result.durationMs, category: result.category });
    },
  );
}
