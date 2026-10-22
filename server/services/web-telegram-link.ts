import type { RequestHandler } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { webUsers } from '../../shared/schema';

interface LinkProfile { id: string; telegramUserId: string | null }
interface CodeDependencies {
  loadProfile: (id: string) => Promise<LinkProfile | undefined>;
  issueCode: (id: string) => Promise<{ code: string; botUrl: string; expiresAt: string }>;
}

export function telegramLinkCodeHandler(deps: CodeDependencies): RequestHandler {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const owner = (req as any).webUser?.sub;
      if (!owner) return res.status(401).json({ error: 'Требуется авторизация' });
      const profile = await deps.loadProfile(owner);
      if (!profile) return res.status(404).json({ error: 'Профиль не найден' });
      if (profile.telegramUserId) {
        return res.json({ linked: true, telegramUserId: profile.telegramUserId });
      }
      return res.json({ linked: false, ...await deps.issueCode(owner) });
    } catch {
      return res.status(500).json({ error: 'Не удалось проверить связь с Telegram. Попробуйте ещё раз.' });
    }
  };
}

export type TelegramLinkResult = 'linked' | 'already_linked' | 'profile_missing' | 'profile_conflict' | 'telegram_conflict';

export async function saveWebTelegramLink(owner: string, telegramId: string, database = db): Promise<TelegramLinkResult> {
  return database.transaction(async tx => {
    await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);
    await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`telegram-link-owner:${owner}`}, 0))`);
    const [profile] = await tx.select({ id: webUsers.id, telegramUserId: webUsers.telegramUserId })
      .from(webUsers).where(eq(webUsers.id, owner));
    if (!profile) return 'profile_missing';
    if (profile.telegramUserId) return profile.telegramUserId === telegramId ? 'already_linked' : 'profile_conflict';
    // Serialize claims of the same Telegram account, including across servers.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`telegram-link-recipient:${telegramId}`}, 0))`);
    const [existing] = await tx.select({ id: webUsers.id }).from(webUsers).where(eq(webUsers.telegramUserId, telegramId));
    if (existing && existing.id !== owner) return 'telegram_conflict';
    await tx.update(webUsers).set({ telegramUserId: telegramId, updatedAt: new Date() }).where(eq(webUsers.id, owner));
    return 'linked';
  });
}

export async function unlinkWebTelegram(owner: string, expectedOwner: unknown, database = db) {
  // An auth retry must not apply an old account's confirmation to a new login.
  if (expectedOwner !== owner) return 'owner_mismatch' as const;
  return database.transaction(async tx => {
    await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);
    await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`telegram-link-owner:${owner}`}, 0))`);
    const [updated] = await tx.update(webUsers).set({ telegramUserId: null, updatedAt: new Date() })
      .where(eq(webUsers.id, owner)).returning({ id: webUsers.id });
    return updated ? 'unlinked' as const : 'profile_missing' as const;
  });
}
