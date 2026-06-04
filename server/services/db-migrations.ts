/**
 * Runtime DB migrations — creates tables that may not exist yet.
 * Uses CREATE TABLE IF NOT EXISTS to be safe on repeated startups.
 */
import { db } from '../db';
import { sql } from 'drizzle-orm';

export async function runMigrations(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS notification_channel_settings (
        channel TEXT PRIMARY KEY,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_by VARCHAR
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_notification_preferences (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL,
        channel TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, channel)
      )
    `);
    // Change units_sold from INTEGER to NUMERIC(10,3) to support kg quantities
    await db.execute(sql`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'analytics_top_products'
            AND column_name = 'units_sold'
            AND data_type = 'integer'
        ) THEN
          ALTER TABLE analytics_top_products
            ALTER COLUMN units_sold TYPE NUMERIC(10,3) USING units_sold::numeric;
        END IF;
      END $$;
    `);
    console.log('✅ DB migrations applied (notification settings tables ready)');
  } catch (error) {
    console.error('⚠️ DB migration error (non-fatal):', error);
  }
}
