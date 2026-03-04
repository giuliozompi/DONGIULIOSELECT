import { db } from '../db';
import { users, orders, fortuneSpinTokens, prizes, reengagementNotifications, products } from '@shared/schema';
import { and, eq, lt, gt, gte, lte, desc, max, inArray, sql, isNotNull } from 'drizzle-orm';
import { sendReengagementNotification, type ReengagementParams } from './reengagement-notifications';

const INACTIVITY_DAYS = 21;
const COOLDOWN_DAYS = 30;

function getMoscowHour(): number {
  const now = new Date();
  const moscow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
  return moscow.getHours();
}

function isAllowedTime(): boolean {
  const hour = getMoscowHour();
  return hour >= 10 && hour < 20;
}

export async function checkAndSendReengagementNotifications(): Promise<void> {
  console.log('[Reengagement Cron] Starting check...');

  if (!isAllowedTime()) {
    console.log('[Reengagement Cron] Outside allowed hours (10:00-20:00 MSK). Skipping.');
    return;
  }

  try {
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - INACTIVITY_DAYS * 24 * 60 * 60 * 1000);
    const cooldownDate = new Date(now.getTime() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000);

    // Trova l'ultima data di ordine per ogni utente
    const lastOrdersByUser = await db
      .select({
        userId: orders.userId,
        lastOrderAt: max(orders.createdAt),
      })
      .from(orders)
      .groupBy(orders.userId);

    // Filtra utenti inattivi da 21+ giorni
    const inactiveUserIds = lastOrdersByUser
      .filter(row => row.lastOrderAt && new Date(row.lastOrderAt) < cutoffDate)
      .map(row => ({ userId: row.userId, lastOrderAt: new Date(row.lastOrderAt!) }));

    if (inactiveUserIds.length === 0) {
      console.log('[Reengagement Cron] No inactive users found.');
      return;
    }

    console.log(`[Reengagement Cron] Found ${inactiveUserIds.length} potentially inactive users.`);

    // Trova utenti che hanno già ricevuto un re-engagement negli ultimi COOLDOWN_DAYS giorni
    const recentlyNotified = await db
      .select({ userId: reengagementNotifications.userId })
      .from(reengagementNotifications)
      .where(gte(reengagementNotifications.sentAt, cooldownDate));

    const notifiedSet = new Set(recentlyNotified.map(r => r.userId));

    // Filtra utenti che NON hanno ricevuto notifica di recente
    const eligibleEntries = inactiveUserIds.filter(entry => !notifiedSet.has(entry.userId));

    if (eligibleEntries.length === 0) {
      console.log('[Reengagement Cron] All inactive users already notified recently. Skipping.');
      return;
    }

    console.log(`[Reengagement Cron] ${eligibleEntries.length} eligible users to notify.`);

    const eligibleIds = eligibleEntries.map(e => e.userId);

    // Carica i dati utente
    const userRecords = await db
      .select()
      .from(users)
      .where(inArray(users.id, eligibleIds));

    const userMap = new Map(userRecords.map(u => [u.id, u]));

    for (const entry of eligibleEntries) {
      const user = userMap.get(entry.userId);
      if (!user) continue;

      if (!user.id) {
        console.warn(`[Reengagement Cron] User ${entry.userId} has no contact info, skipping.`);
        continue;
      }

      try {
        const daysSince = Math.floor((now.getTime() - entry.lastOrderAt.getTime()) / (24 * 60 * 60 * 1000));

        // Carica gli ultimi 4 ordini dell'utente per trovare i prodotti
        const recentOrders = await db
          .select()
          .from(orders)
          .where(eq(orders.userId, entry.userId))
          .orderBy(desc(orders.createdAt))
          .limit(4);

        // Estrai product IDs unici dagli ordini recenti
        const productIdSet = new Set<string>();
        for (const order of recentOrders) {
          for (const item of order.items || []) {
            productIdSet.add(item.productId);
            if (productIdSet.size >= 4) break;
          }
          if (productIdSet.size >= 4) break;
        }

        // Carica i prodotti con immagini
        let productDetails: Array<{ productId: string; productName: string; images: string[] }> = [];
        if (productIdSet.size > 0) {
          const productRecords = await db
            .select({ id: products.id, name: products.name, images: products.images })
            .from(products)
            .where(inArray(products.id, Array.from(productIdSet)));

          // Mantieni il nome dal carrello come fallback
          const productMap = new Map(productRecords.map(p => [p.id, p]));
          for (const order of recentOrders) {
            for (const item of order.items || []) {
              const prod = productMap.get(item.productId);
              if (prod && !productDetails.find(p => p.productId === item.productId)) {
                productDetails.push({
                  productId: item.productId,
                  productName: prod.name,
                  images: prod.images || [],
                });
              }
              if (productDetails.length >= 4) break;
            }
            if (productDetails.length >= 4) break;
          }
        }

        // Carica spin tokens
        const spinRecord = await db
          .select()
          .from(fortuneSpinTokens)
          .where(eq(fortuneSpinTokens.userId, entry.userId))
          .limit(1);
        const spinTokens = spinRecord[0]?.tokens ?? 0;

        // Carica premi non riscattati
        const unclaimedPrizes = await db
          .select({ name: prizes.name, type: prizes.type, value: prizes.value })
          .from(prizes)
          .where(and(eq(prizes.userId, entry.userId), eq(prizes.claimed, false)))
          .limit(5);

        const params: ReengagementParams = {
          userId: entry.userId,
          telegramChatId: user.id,
          email: user.email || null,
          firstName: user.firstName || 'Дорогой клиент',
          daysSinceLastOrder: daysSince,
          products: productDetails,
          spinTokens,
          prizes: unclaimedPrizes,
        };

        const result = await sendReengagementNotification(params);

        // Registra nel DB
        await db.insert(reengagementNotifications).values({
          userId: entry.userId,
          status: result.telegram || result.email ? 'sent' : 'failed',
          telegramSent: result.telegram,
          emailSent: result.email,
          daysSinceLastOrder: daysSince,
        });

        console.log(
          `[Reengagement Cron] User ${entry.userId} (${user.firstName}): Telegram=${result.telegram}, Email=${result.email}, daysSince=${daysSince}`
        );

        // Pausa tra le notifiche per non sovraccaricare le API
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (error) {
        console.error(`[Reengagement Cron] Error for user ${entry.userId}:`, error);

        await db.insert(reengagementNotifications).values({
          userId: entry.userId,
          status: 'failed',
          telegramSent: false,
          emailSent: false,
          error: error instanceof Error ? error.message : String(error),
          daysSinceLastOrder: null,
        }).catch(() => {});
      }
    }

    console.log('[Reengagement Cron] Finished.');
  } catch (error) {
    console.error('[Reengagement Cron] Fatal error:', error);
  }
}

export function startReengagementCron(intervalHours: number = 24): NodeJS.Timeout {
  console.log(`[Reengagement Cron] Starting with ${intervalHours}h interval (runs 10:00-20:00 MSK)`);

  checkAndSendReengagementNotifications();

  return setInterval(() => {
    checkAndSendReengagementNotifications();
  }, intervalHours * 60 * 60 * 1000);
}
