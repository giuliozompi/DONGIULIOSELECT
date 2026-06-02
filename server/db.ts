import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

// DATABASE_URL is required. We defer the hard crash to the first actual DB
// call so that the HTTP server (and /ping, /healthz) can start up and give
// a diagnostic response even when the env-var is missing.
const DATABASE_URL = process.env.DATABASE_URL ?? "";

if (!DATABASE_URL) {
  console.error(
    "❌ FATAL: DATABASE_URL environment variable is not set. " +
    "All database operations will fail. " +
    "Set DATABASE_URL in your hosting environment variables."
  );
}

export const pool = new Pool({ connectionString: DATABASE_URL || "postgresql://localhost/placeholder" });
export const db = drizzle({ client: pool, schema });
