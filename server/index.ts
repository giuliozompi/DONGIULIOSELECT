import express, { type Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { seedDatabase } from "./seed";
import { startAbandonedCartCron } from "./services/abandoned-cart-cron";
import { startAnalyticsCron } from "./services/analytics-cron";
import { startReengagementCron } from "./services/reengagement-cron";
import { startWelcomeCron } from "./services/welcome-cron";
import { getIntegrationsSummary } from "./integrations-status";

// Configura timezone UTC+3 (Mosca) per tutto il server
process.env.TZ = 'Europe/Moscow';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Minimal liveness probe — registered before everything else so it responds
// even if seeding or route-registration is still in progress.
app.get("/ping", (_req, res) => res.type("text/plain").send("pong"));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // ── Seed (non-blocking, best-effort) ────────────────────────────────────
  const seedPromise = seedDatabase().catch((error) => {
    console.error('⚠️ Database seeding failed:', error);
  });
  await Promise.race([
    seedPromise,
    new Promise((resolve) => setTimeout(() => {
      console.log('⏱️ Seeding timeout - continuing without seed');
      resolve(undefined);
    }, 5000))
  ]);

  // ── Routes ──────────────────────────────────────────────────────────────
  let server: ReturnType<typeof createServer>;
  try {
    server = await registerRoutes(app);
  } catch (err) {
    console.error('❌ registerRoutes failed — starting in API-only degraded mode:', err);
    server = createServer(app);
  }

  // ── Error middleware ─────────────────────────────────────────────────────
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    // Do NOT re-throw — re-throwing inside Express error middleware terminates
    // the process on the first route error.
    console.error(`[error] ${status} ${message}`, err.stack ?? "");
    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  });

  // ── Static / Vite ────────────────────────────────────────────────────────
  // Primary check: NODE_ENV=production (set by npm start).
  // Fallback: detect whether the compiled client build exists next to this bundle.
  // This handles hosts (e.g. Timeweb) that run `node dist/index.js` directly
  // without setting NODE_ENV, and Node.js < 21.2.0 where import.meta.dirname
  // is undefined (so we use fileURLToPath instead).
  const isProductionEnv = process.env.NODE_ENV === "production";
  let hasClientBuild = false;
  try {
    const bundleDir = path.dirname(fileURLToPath(import.meta.url));
    hasClientBuild = fs.existsSync(path.join(bundleDir, "public"));
  } catch {
    hasClientBuild = fs.existsSync(path.join(process.cwd(), "dist", "public"));
  }
  const useProductionServing = isProductionEnv || hasClientBuild;
  console.log(`[server] mode=${useProductionServing ? "production" : "development"} NODE_ENV=${process.env.NODE_ENV ?? "unset"} hasClientBuild=${hasClientBuild}`);

  try {
    if (!useProductionServing) {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }
  } catch (err) {
    console.error('❌ Static/Vite setup failed — frontend unavailable, API still running:', err);
  }

  // ── Listen ───────────────────────────────────────────────────────────────
  // Default to 3000 — Timeweb Docker deployments expose port 3000 by default.
  // Replit injects PORT=5000; other hosts inject their own value.
  const port = parseInt(process.env.PORT || '3000', 10);
  server.listen({ port, host: "0.0.0.0" }, () => {
    log(`serving on port ${port}`);
    log(`serving ${hasClientBuild ? "compiled build" : "dev (Vite)"}`);
    log(getIntegrationsSummary());

    startAbandonedCartCron(60);
    startAnalyticsCron(15);
    startReengagementCron(24);
    startWelcomeCron(24);
  });
})().catch((fatalErr) => {
  // Last-resort catch: if the async IIFE itself throws unexpectedly, log it.
  // The process may exit but at least we get a useful message in the logs.
  console.error('💥 Fatal server startup error:', fatalErr);
  process.exit(1);
});
