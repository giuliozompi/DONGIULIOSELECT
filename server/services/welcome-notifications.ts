import { sendTelegramMessage } from './telegram-bot';
import { sendEmail } from './email';

const SHOP_LINK = 'https://t.me/dongiuliocatalog_bot/DGSCatalog';
const DISCOUNT_PERCENT = 10;
const MIN_ORDER_AMOUNT = 5000;

export interface WelcomeParams {
  userId: string;
  telegramChatId: string;
  email: string | null;
  firstName: string;
  discountCode: string;
  expiresAt: Date;
}

export async function sendWelcomeNotification(
  params: WelcomeParams
): Promise<{ telegram: boolean; email: boolean }> {
  const hasEmail = typeof params.email === 'string' && params.email.trim().length > 0;

  if (!hasEmail) {
    console.log(`[Welcome] No email for user ${params.userId} — Telegram only`);
  }

  const [telegram, emailResult] = await Promise.allSettled([
    sendTelegramWelcome(params),
    hasEmail ? sendEmailWelcome(params) : Promise.resolve(false),
  ]);

  return {
    telegram: telegram.status === 'fulfilled' ? telegram.value : false,
    email: emailResult.status === 'fulfilled' ? emailResult.value : false,
  };
}

async function sendTelegramWelcome(params: WelcomeParams): Promise<boolean> {
  const { telegramChatId, firstName, discountCode, expiresAt } = params;

  const expiryStr = expiresAt.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Moscow',
  });

  const text =
    `<b>Здравствуйте, ${firstName}!</b>\n\n` +
    `Мы заметили, что вы заглянули в наш магазин, но ещё не сделали заказ.\n\n` +
    `<b>Хотим предложить вам скидку ${DISCOUNT_PERCENT}% на первый заказ!</b>\n\n` +
    `Ваш персональный промокод:\n` +
    `<code>${discountCode}</code>\n\n` +
    `<b>Условия:</b>\n` +
    `• Скидка ${DISCOUNT_PERCENT}% на заказ от ${MIN_ORDER_AMOUNT.toLocaleString('ru-RU')} ₽\n` +
    `• Одноразовый, не суммируется с другими скидками\n` +
    `• Действует до ${expiryStr}\n\n` +
    `Попробуйте наши итальянские деликатесы — уверены, вам понравится!\n\n` +
    `<a href="${SHOP_LINK}">Открыть каталог</a>`;

  try {
    await sendTelegramMessage(telegramChatId, text);
    return true;
  } catch (error) {
    console.error(`[Welcome] Telegram send failed for user ${params.userId}:`, error);
    return false;
  }
}

async function sendEmailWelcome(params: WelcomeParams): Promise<boolean> {
  const { email, firstName, discountCode, expiresAt } = params;
  if (!email || typeof email !== 'string' || !email.trim()) return false;

  const expiryStr = expiresAt.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Moscow',
  });

  const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
  <h2 style="color:#1a1a1a;">Здравствуйте, ${firstName}!</h2>
  <p style="color:#444;line-height:1.6;">
    Мы заметили, что вы заглянули в наш магазин Don Giulio Select, но ещё не сделали заказ.
  </p>
  <p style="color:#444;line-height:1.6;">
    Хотим предложить вам <strong>скидку ${DISCOUNT_PERCENT}% на первый заказ</strong> в подарок!
  </p>
  <div style="background:#f8f4ef;border-radius:8px;padding:20px;text-align:center;margin:24px 0;">
    <p style="margin:0 0 8px;color:#666;font-size:14px;">Ваш персональный промокод</p>
    <p style="margin:0;font-family:monospace;font-size:28px;font-weight:bold;color:#2d1f1f;letter-spacing:2px;">${discountCode}</p>
  </div>
  <ul style="color:#444;line-height:1.8;padding-left:20px;">
    <li>Скидка ${DISCOUNT_PERCENT}% на заказ <strong>от ${MIN_ORDER_AMOUNT.toLocaleString('ru-RU')} ₽</strong></li>
    <li>Одноразовый, не суммируется с другими скидками</li>
    <li>Действует до <strong>${expiryStr}</strong></li>
  </ul>
  <div style="text-align:center;margin:32px 0;">
    <a href="${SHOP_LINK}" style="background:#2d1f1f;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-size:16px;">
      Открыть каталог
    </a>
  </div>
  <p style="color:#999;font-size:12px;text-align:center;">
    Don Giulio Select — итальянские деликатесы с доставкой по России
  </p>
</div>`;

  try {
    await sendEmail({
      to: email,
      subject: `Скидка ${DISCOUNT_PERCENT}% на ваш первый заказ — промокод внутри`,
      html,
    });
    return true;
  } catch (error) {
    console.error(`[Welcome] Email send failed for user ${params.userId}:`, error);
    return false;
  }
}
