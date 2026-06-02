import express, { type Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
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
  // Seed database with initial data (categories and products)
  // Skip seeding if it takes too long or fails
  const seedPromise = seedDatabase().catch((error) => {
    console.error('⚠️ Database seeding failed:', error);
    console.log('Continuing without seeding...');
  });
  
  // Don't wait more than 5 seconds for seeding
  await Promise.race([
    seedPromise,
    new Promise((resolve) => setTimeout(() => {
      console.log('⏱️ Seeding timeout - continuing without seed');
      resolve(undefined);
    }, 5000))
  ]);
  
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // Robust production detection — works on all Node.js versions and hosts.
  // Primary check: NODE_ENV=production (set by npm start script).
  // Fallback: detect whether the compiled client build exists next to this bundle.
  // This handles hosts (e.g. Timeweb) that run `node dist/index.js` directly
  // without setting NODE_ENV, and also handles Node.js < 21.2.0 where
  // import.meta.dirname is undefined (so we use fileURLToPath instead).
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

  if (!useProductionServing) {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    log(`serving ${hasClientBuild ? "compiled build" : "dev (Vite)"}`);
    log(getIntegrationsSummary());

    startAbandonedCartCron(60);
    startAnalyticsCron(15);
    startReengagementCron(24);
    startWelcomeCron(24);
  });
})();
