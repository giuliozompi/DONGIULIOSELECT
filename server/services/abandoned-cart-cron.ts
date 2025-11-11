import { db } from '../db';
import { carts, users, abandonedCartNotifications, products } from '@shared/schema';
import { and, lte, eq, sql, gt, inArray, lt } from 'drizzle-orm';
import { generateRandomDiscountCode, isAllowedNotificationTime, getNextAllowedCheckTime, generateFirstReminderDelay, generateSecondReminderDelay } from './abandoned-cart';
import { sendAbandonedCartReminder } from './abandoned-cart-notifications';

export async function checkAndSendAbandonedCartReminders(): Promise<void> {
  console.log('[Abandoned Cart Cron] Starting check for abandoned carts...');

  try {
    // Verifica se siamo in orario consentito (08:00-22:30 Moscow time)
    if (!isAllowedNotificationTime()) {
      const nextCheck = getNextAllowedCheckTime();
      console.log('[Abandoned Cart Cron] Outside allowed hours (22:30-08:00 Moscow). Next check:', nextCheck);
      
      // Posticipa tutti i carrelli che avevano un check previsto ora
      const now = new Date();
      await db
        .update(carts)
        .set({ nextReminderCheckAt: nextCheck })
        .where(
          and(
            lte(carts.nextReminderCheckAt, now),
            lt(carts.reminderCount, 2), // Max 2 reminder
            gt(sql`jsonb_array_length(${carts.items})`, 0)
          )
        );
      
      console.log('[Abandoned Cart Cron] Carts postponed to next allowed time window');
      return;
    }

    const now = new Date();

    const eligibleCarts = await db
      .select({
        cart: carts,
        user: users,
      })
      .from(carts)
      .innerJoin(users, eq(carts.userId, users.id))
      .where(
        and(
          lte(carts.nextReminderCheckAt, now),
          lt(carts.reminderCount, 2), // Max 2 reminder
          gt(sql`jsonb_array_length(${carts.items})`, 0)
        )
      );

    console.log(`[Abandoned Cart Cron] Found ${eligibleCarts.length} eligible carts`);

    for (const { cart, user } of eligibleCarts) {
      try {
        const reminderNumber = cart.reminderCount + 1; // 1 o 2
        const discountData = generateRandomDiscountCode();
        const sentAt = new Date();

        const productIds = cart.items.map(item => item.productId);
        const productDetails = await db
          .select()
          .from(products)
          .where(inArray(products.id, productIds));
        
        const productMap = new Map(productDetails.map(p => [p.id, p.name]));

        const cartSnapshot = cart.items.map(item => ({
          productId: item.productId,
          productName: productMap.get(item.productId) || 'Unknown Product',
          quantity: item.quantity,
          priceAtAdd: item.priceAtAdd,
        }));

        const notification = await db
          .insert(abandonedCartNotifications)
          .values({
            userId: user.id,
            cartSnapshot,
            discountCode: discountData.code,
            discountPercent: discountData.percent,
            reminderNumber, // 1 o 2
            channel: 'telegram',
            expiresAt: discountData.expiresAt,
            sentAt,
            status: 'sent',
          })
          .returning();

        const telegramChatId = user.id;
        const email = user.email;

        if (!telegramChatId && !email) {
          console.warn(
            `[Abandoned Cart Cron] User ${user.id} has no contact info - skipping notification`
          );
          await db
            .update(abandonedCartNotifications)
            .set({
              status: 'failed',
              error: 'No contact info available',
            })
            .where(eq(abandonedCartNotifications.id, notification[0].id));
          continue;
        }

        const result = await sendAbandonedCartReminder({
          userId: user.id,
          telegramChatId,
          email: email || '',
          firstName: user.firstName || 'Cliente',
          discountCode: discountData.code,
          discountPercent: discountData.percent,
          expiresAt: discountData.expiresAt,
          reminderNumber, // 1 o 2
        });

        if (!result.telegram && !result.email) {
          console.error(
            `[Abandoned Cart Cron] Both channels failed for user ${user.id} - will retry later`
          );
          await db
            .update(abandonedCartNotifications)
            .set({
              status: 'failed',
              error: 'Both Telegram and Email failed',
            })
            .where(eq(abandonedCartNotifications.id, notification[0].id));
          continue;
        }

        // Aggiorna contatore e pianifica prossimo reminder (se < 2)
        const updateData: any = {
          reminderCount: reminderNumber,
        };
        
        if (reminderNumber === 1) {
          // Dopo 1ª notifica: programma 2ª tra 16-24h
          updateData.nextReminderCheckAt = generateSecondReminderDelay();
        } else {
          // Dopo 2ª notifica: stop (max 2 reminder)
          updateData.nextReminderCheckAt = null;
        }
        
        await db
          .update(carts)
          .set(updateData)
          .where(eq(carts.userId, user.id));

        console.log(
          `[Abandoned Cart Cron] Sent reminder #${reminderNumber} to user ${user.id} - Telegram: ${result.telegram}, Email: ${result.email}`
        );
      } catch (error) {
        console.error(
          `[Abandoned Cart Cron] Error processing cart for user ${user.id}:`,
          error
        );
      }
    }

    console.log('[Abandoned Cart Cron] Finished processing abandoned carts');
  } catch (error) {
    console.error('[Abandoned Cart Cron] Fatal error:', error);
  }
}

export function startAbandonedCartCron(intervalMinutes: number = 60): NodeJS.Timeout {
  console.log(
    `[Abandoned Cart Cron] Starting cron job with ${intervalMinutes} minute interval`
  );

  checkAndSendAbandonedCartReminders();

  return setInterval(() => {
    checkAndSendAbandonedCartReminders();
  }, intervalMinutes * 60 * 1000);
}
