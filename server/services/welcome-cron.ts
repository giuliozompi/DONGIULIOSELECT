import { db } from '../db';
import { users, orders, welcomeNotifications, abandonedCartNotifications } from '@shared/schema';
import { and, eq, inArray, notInArray, sql, isNotNull } from 'drizzle-orm';
import { sendWelcomeNotification, type WelcomeParams } from './welcome-notifications';
import { randomBytes } from 'crypto';

const DISCOUNT_PERCENT = 10;
const MIN_ORDER_AMOUNT = 5000;
const EXPIRES_DAYS = 30;

function getMoscowHour(): number {
  const now = new Date();
  const moscow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
  return moscow.getHours();
}

function isAllowedTime(): boolean {
  const hour = getMoscowHour();
  return hour >= 10 && hour < 20;
}

function generateWelcomeCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'BENVENUTO-';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function checkAndSendWelcomeNotifications(): Promise<void> {
  console.log('[Welcome Cron] Starting check...');

  if (!isAllowedTime()) {
    console.log('[Welcome Cron] Outside allowed hours (10:00-20:00 MSK). Skipping.');
    return;
  }

  try {
    // 1. Users who have already placed at least one order
    const usersWithOrders = await db
      .select({ userId: orders.userId })
      .from(orders)
      .groupBy(orders.userId);
    const orderedUserIds = new Set(usersWithOrders.map(r => r.userId));

    // 2. Users who have already received a welcome notification
    const alreadyWelcomed = await db
      .select({ userId: welcomeNotifications.userId })
      .from(welcomeNotifications);
    const welcomedUserIds = new Set(alreadyWelcomed.map(r => r.userId));

    // 3. Users who have added something to cart (have abandonedCartNotification record)
    const usersWithCart = await db
      .select({ userId: abandonedCartNotifications.userId })
      .from(abandonedCartNotifications)
      .groupBy(abandonedCartNotifications.userId);
    const cartUserIds = new Set(usersWithCart.map(r => r.userId));

    // 4. All registered users with Telegram ID
    const allUsers = await db
      .select()
      .from(users)
      .where(isNotNull(users.id));

    // 5. Filter: never ordered, never welcomed, never added to cart
    const eligible = allUsers.filter(u =>
      !orderedUserIds.has(u.id) &&
      !welcomedUserIds.has(u.id) &&
      !cartUserIds.has(u.id)
    );

    if (eligible.length === 0) {
      console.log('[Welcome Cron] No eligible users found.');
      return;
    }

    console.log(`[Welcome Cron] Found ${eligible.length} eligible users to welcome.`);

    const expiresAt = new Date(Date.now() + EXPIRES_DAYS * 24 * 60 * 60 * 1000);

    for (const user of eligible) {
      try {
        const discountCode = generateWelcomeCode();

        // Insert welcome notification record FIRST (to avoid duplicates on retry)
        await db.insert(welcomeNotifications).values({
          userId: user.id,
          discountCode,
          discountPercent: DISCOUNT_PERCENT,
          minOrderAmount: MIN_ORDER_AMOUNT,
          status: 'sent',
          telegramSent: false,
          emailSent: false,
          expiresAt,
        });

        // Normalize email: only pass if it's a non-empty string
        const userEmail = typeof user.email === 'string' && user.email.trim()
          ? user.email.trim()
          : null;

        if (!userEmail) {
          console.log(`[Welcome Cron] User ${user.id}: no email registered — will send Telegram only (expected for new users)`);
        }

        const params: WelcomeParams = {
          userId: user.id,
          telegramChatId: user.id,
          email: userEmail,
          firstName: user.firstName || 'Дорогой гость',
          discountCode,
          expiresAt,
        };

        const result = await sendWelcomeNotification(params);

        // Status: 'sent' if at least Telegram was delivered (email is optional)
        // A user without email but with successful Telegram is a success, not a failure
        const finalStatus = result.telegram
          ? 'sent'
          : (result.email ? 'sent' : 'failed');

        await db
          .update(welcomeNotifications)
          .set({
            telegramSent: result.telegram,
            emailSent: result.email,
            status: finalStatus,
          })
          .where(eq(welcomeNotifications.userId, user.id));

        console.log(
          `[Welcome Cron] User ${user.id} (${user.firstName || '—'}): code=${discountCode}, Telegram=${result.telegram}, Email=${result.email}${!userEmail ? ' (no email registered)' : ''}`
        );

        await new Promise(resolve => setTimeout(resolve, 1200));
      } catch (error) {
        console.error(`[Welcome Cron] Error for user ${user.id}:`, error);

        await db
          .update(welcomeNotifications)
          .set({
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          })
          .where(eq(welcomeNotifications.userId, user.id))
          .catch(() => {});
      }
    }

    console.log('[Welcome Cron] Finished.');
  } catch (error) {
    console.error('[Welcome Cron] Fatal error:', error);
  }
}

export function startWelcomeCron(intervalHours: number = 24): NodeJS.Timeout {
  console.log(`[Welcome Cron] Starting with ${intervalHours}h interval (runs 10:00-20:00 MSK)`);

  checkAndSendWelcomeNotifications();

  return setInterval(() => {
    checkAndSendWelcomeNotifications();
  }, intervalHours * 60 * 60 * 1000);
}
