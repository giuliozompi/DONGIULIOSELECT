import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import type { TelegramSendResult } from './telegram-api';

// Telegram does not say whether a 429 is chat-specific or bot-wide.
// Conservatively pause this bot's outgoing notifications, never other channels.
// Use the bot identity (not its credential) so token rotation preserves the pause.
function keyFor(token: string) {
  const identity = token.split(':')[0];
  return `telegram-pause:${createHash('sha256').update(identity).digest('hex')}`;
}

type Executor = Pick<typeof db, 'execute'>;
async function readPause(executor: Executor, key: string): Promise<string | undefined> {
  const result = await executor.execute(sql`
    SELECT details FROM order_notification_logs
    WHERE id = ${key} AND event = 'telegram_rate_limit'
  `);
  const details = result.rows[0]?.details;
  if (!details) return;
  // Invalid persisted state fails closed instead of silently ignoring a pause.
  const retryAt = JSON.parse(String(details)).retryAt;
  if (typeof retryAt !== 'string' || !Number.isFinite(Date.parse(retryAt))) {
    throw new Error('Invalid Telegram pause');
  }
  return retryAt;
}

export async function getTelegramRetryAt(database = db, token = process.env.TELEGRAM_BOT_TOKEN) {
  return token ? readPause(database, keyFor(token)) : undefined;
}

export async function withTelegramRateLimit(
  token: string | undefined, send: () => Promise<TelegramSendResult>, database = db,
): Promise<TelegramSendResult> {
  if (!token) return send(); // Common API returns the missing-token diagnostic.
  try {
    return await database.transaction(async tx => {
      await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);
      // Includes the bounded provider request (albums have a 30s deadline).
      await tx.execute(sql`SET LOCAL statement_timeout = '40s'`);
      const key = keyFor(token);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
      const existing = await readPause(tx, key);
      if (existing && Date.parse(existing) > Date.now()) return {
        sent: false, deferred: true, retryAt: existing,
        error: `Telegram: отправка приостановлена до ${existing}. Другие каналы доступны.`,
      };
      const result = await send();
      if (!result.retryAfterSeconds) return result;
      const retryAt = new Date(Date.now() + result.retryAfterSeconds * 1000).toISOString();
      // One independent durable row per bot, not tied to order history or its limit.
      await tx.execute(sql`
        INSERT INTO order_notification_logs (id, event, channel, recipient, status, details)
        VALUES (${key}, 'telegram_rate_limit', 'telegram', 'system', 'paused', ${JSON.stringify({ retryAt })})
        ON CONFLICT (id) DO UPDATE SET details = EXCLUDED.details, sent_at = now()
      `);
      return { ...result, retryAt };
    });
  } catch {
    // Never send if coordination/persistence failed, and never retry a POST.
    return { sent: false, error: 'Telegram: не удалось проверить или сохранить паузу отправки. Повторите вручную после проверки журнала.' };
  }
}

export const telegramRateLimits = { send: withTelegramRateLimit };
