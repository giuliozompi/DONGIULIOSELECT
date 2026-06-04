/**
 * Notification Settings Service
 * Checks global channel toggles and per-user preferences before sending notifications.
 * Uses a 60-second in-memory cache to avoid DB hit on every notification.
 */
import { db } from '../db';
import { notificationChannelSettings, userNotificationPreferences } from '@shared/schema';
import { and, eq } from 'drizzle-orm';

export type NotifChannel = 'telegram' | 'email' | 'whatsapp';

// ── In-memory cache (60s TTL) ──────────────────────────────────────────────
const globalCache = new Map<string, { enabled: boolean; ts: number }>();
const CACHE_TTL = 60_000;

function clearCache() { globalCache.clear(); }

async function isGloballyEnabled(channel: NotifChannel): Promise<boolean> {
  const cached = globalCache.get(channel);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.enabled;
  try {
    const [row] = await db.select({ enabled: notificationChannelSettings.enabled })
      .from(notificationChannelSettings)
      .where(eq(notificationChannelSettings.channel, channel));
    const enabled = row?.enabled ?? true; // default: enabled
    globalCache.set(channel, { enabled, ts: Date.now() });
    return enabled;
  } catch {
    return true; // fail open — allow sending if table doesn't exist yet
  }
}

async function isEnabledForUser(channel: NotifChannel, userId: string): Promise<boolean> {
  try {
    const [row] = await db.select({ enabled: userNotificationPreferences.enabled })
      .from(userNotificationPreferences)
      .where(and(
        eq(userNotificationPreferences.userId, userId),
        eq(userNotificationPreferences.channel, channel)
      ));
    return row?.enabled ?? true; // default: enabled (no row = not opted out)
  } catch {
    return true; // fail open
  }
}

/**
 * Returns true if the notification should be sent.
 * Checks: global channel enabled AND (no userId OR user hasn't opted out).
 */
export async function canNotify(channel: NotifChannel, userId?: string | null): Promise<boolean> {
  const globalOk = await isGloballyEnabled(channel);
  if (!globalOk) return false;
  if (userId) {
    const userOk = await isEnabledForUser(channel, userId);
    if (!userOk) return false;
  }
  return true;
}

// ── DB helpers (used by admin API) ─────────────────────────────────────────
export async function getAllChannelSettings(): Promise<{ channel: string; enabled: boolean }[]> {
  const channels: NotifChannel[] = ['telegram', 'email', 'whatsapp'];
  try {
    const rows = await db.select().from(notificationChannelSettings);
    return channels.map(ch => {
      const row = rows.find(r => r.channel === ch);
      return { channel: ch, enabled: row?.enabled ?? true };
    });
  } catch {
    return channels.map(ch => ({ channel: ch, enabled: true }));
  }
}

export async function setChannelEnabled(
  channel: NotifChannel, enabled: boolean, updatedBy?: string
): Promise<void> {
  await db.insert(notificationChannelSettings)
    .values({ channel, enabled, updatedBy: updatedBy || null, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: notificationChannelSettings.channel,
      set: { enabled, updatedBy: updatedBy || null, updatedAt: new Date() },
    });
  clearCache();
}

export async function getUserPreferences(userId: string): Promise<{ channel: string; enabled: boolean }[]> {
  const channels: NotifChannel[] = ['telegram', 'email', 'whatsapp'];
  try {
    const rows = await db.select()
      .from(userNotificationPreferences)
      .where(eq(userNotificationPreferences.userId, userId));
    return channels.map(ch => {
      const row = rows.find(r => r.channel === ch);
      return { channel: ch, enabled: row?.enabled ?? true };
    });
  } catch {
    return channels.map(ch => ({ channel: ch, enabled: true }));
  }
}

export async function setUserPreference(
  userId: string, channel: NotifChannel, enabled: boolean
): Promise<void> {
  const { randomUUID } = await import('crypto');
  await db.insert(userNotificationPreferences)
    .values({ id: randomUUID(), userId, channel, enabled })
    .onConflictDoUpdate({
      target: [userNotificationPreferences.userId, userNotificationPreferences.channel],
      set: { enabled },
    });
}
