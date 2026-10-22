import type { Express } from 'express';

declare const __RELEASE_ID__: string;
export const buildId = typeof __RELEASE_ID__ === 'undefined' ? 'development' : __RELEASE_ID__;

export const startup = {
  routes: 'starting',
  frontend: 'starting',
  migrations: 'starting',
  seed: 'starting',
};

export function registerReleaseHealth(app: Express, checkDatabase: () => Promise<unknown>) {
  // Registered before route setup, so a partial startup cannot masquerade as healthy.
  app.get('/healthz', async (_req, res) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let reachable = false;
    try {
      await Promise.race([
        checkDatabase(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), 4000);
        }),
      ]);
      reachable = true;
    } catch {
      // Never expose raw database errors, connection details or environment values.
    } finally {
      clearTimeout(timer);
    }
    const ok = reachable && Object.values(startup).every(value => value === 'ready');
    res.set('Cache-Control', 'no-store').status(ok ? 200 : 503).json({
      status: ok ? 'ok' : 'degraded', server: 'up', buildId,
      db: reachable ? 'reachable' : 'unreachable',
      startup: { ...startup }, uptimeSeconds: Math.round(process.uptime()),
    });
  });
}
