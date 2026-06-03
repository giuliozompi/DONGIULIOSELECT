import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL ?? "";

if (!DATABASE_URL) {
  console.error(
    "❌ FATAL: DATABASE_URL environment variable is not set. " +
    "All database operations will fail. " +
    "Set DATABASE_URL in your hosting environment variables."
  );
}

export const pool = new Pool({
  connectionString: DATABASE_URL || "postgresql://localhost/placeholder",
  ssl: DATABASE_URL ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export const db = drizzle({ client: pool, schema });
