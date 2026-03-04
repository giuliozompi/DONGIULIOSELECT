import { sendTelegramMessage } from './telegram-bot';
import { sendEmail } from './email';
import { formatMoscowDateForNotification } from '../utils/date-formatter';

export interface AbandonedCartReminderParams {
  userId: string;
  telegramChatId: string;
  email: string | null;
  firstName: string;
  discountCode: string;
  discountPercent: number;
  expiresAt: Date;
  reminderNumber?: number; // 1 o 2 (per personalizzare il messaggio)
}

function isValidEmail(email: string | null | undefined): email is string {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  return trimmed.length > 0 && trimmed.includes('@') && trimmed.includes('.');
}

function calculateTimeRemaining(expiresAt: Date): string {
  const now = new Date();
  const diff = expiresAt.getTime() - now.getTime();

  if (diff <= 0) {
    return 'истёк';
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  // Russian pluralization rules
  const getHourWord = (n: number) => {
    if (n % 10 === 1 && n % 100 !== 11) return 'час';
    if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'часа';
    return 'часов';
  };
  
  const getMinuteWord = (n: number) => {
    if (n % 10 === 1 && n % 100 !== 11) return 'минута';
    if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'минуты';
    return 'минут';
  };

  if (hours > 0) {
    return `${hours} ${getHourWord(hours)} и ${minutes} ${getMinuteWord(minutes)}`;
  }
  
  return `${minutes} ${getMinuteWord(minutes)}`;
}

export async function sendAbandonedCartReminder(
  params: AbandonedCartReminderParams
): Promise<{ telegram: boolean; email: boolean }> {
  const { telegramChatId, email, firstName, discountCode, discountPercent, expiresAt, reminderNumber = 1 } = params;

  const formattedExpiry = formatMoscowDateForNotification(expiresAt);
  const timeRemaining = calculateTimeRemaining(expiresAt);

  const hasValidEmail = isValidEmail(email);
  if (!hasValidEmail) {
    console.log(`[Abandoned Cart] No valid email for user ${params.userId} — Telegram only`);
  }

  const [telegramResult, emailResult] = await Promise.allSettled([
    sendTelegramNotification({
      chatId: telegramChatId,
      firstName,
      discountCode,
      discountPercent,
      formattedExpiry,
      timeRemaining,
      reminderNumber,
    }),
    hasValidEmail
      ? sendEmailNotification({
          email: email as string,
          firstName,
          discountCode,
          discountPercent,
          formattedExpiry,
          timeRemaining,
          reminderNumber,
        })
      : Promise.resolve(false),
  ]);

  return {
    telegram: telegramResult.status === 'fulfilled' ? telegramResult.value : false,
    email: emailResult.status === 'fulfilled' ? emailResult.value : false,
  };
}

interface TelegramNotificationParams {
  chatId: string;
  firstName: string;
  discountCode: string;
  discountPercent: number;
  formattedExpiry: string;
  timeRemaining: string;
  reminderNumber: number;
}

async function sendTelegramNotification(
  params: TelegramNotificationParams
): Promise<boolean> {
  const { chatId, firstName, discountCode, discountPercent, formattedExpiry, timeRemaining, reminderNumber } = params;

  // Telegram Mini App link with deep link to cart
  // Format: https://t.me/BotUsername/AppShortName?startapp=cart
  const miniAppUrl = process.env.TELEGRAM_MINI_APP_URL || 'https://t.me/dongiuliocatalog_bot/DGSCatalog?startapp=cart';

  // Personalizza messaggio in base al numero di reminder
  const header = reminderNumber === 1 
    ? '<b>Вы забыли что-то в корзине!</b>'
    : '<b>Последний шанс! Ваша скидка истекает</b>';
    
  const intro = reminderNumber === 1
    ? `Привет, ${firstName}!\n\nМы заметили, что вы оставили несколько товаров в корзине.\nВ благодарность за ваш интерес мы предлагаем вам <b>специальную скидку ${discountPercent}%</b>!`
    : `${firstName}, товары в вашей корзине всё ещё ждут!\n\nЭто последнее напоминание — ваша <b>персональная скидка ${discountPercent}%</b> скоро истечёт.`;
    
  const urgency = reminderNumber === 1
    ? 'Не упустите эту возможность! Оформите заказ сейчас и сэкономьте.'
    : '⚡ <b>Успейте оформить заказ!</b> Скидка действует ограниченное время.';

  const text = `
${header}

${intro}

<b>Код скидки:</b> <code>${discountCode}</code>

<b>Истекает через:</b> ${timeRemaining}
<b>Действителен до:</b> ${formattedExpiry}

${urgency}

<a href="${miniAppUrl}">Оформить заказ</a>
`.trim();

  return sendTelegramMessage({
    chatId,
    text,
    parseMode: 'HTML',
  });
}

interface EmailNotificationParams {
  email: string;
  firstName: string;
  discountCode: string;
  discountPercent: number;
  formattedExpiry: string;
  timeRemaining: string;
  reminderNumber: number;
}

async function sendEmailNotification(
  params: EmailNotificationParams
): Promise<boolean> {
  const { email, firstName, discountCode, discountPercent, formattedExpiry, timeRemaining, reminderNumber } = params;

  if (!isValidEmail(email)) return false;

  // Telegram Mini App link with deep link to cart
  const miniAppUrl = process.env.TELEGRAM_MINI_APP_URL || 'https://t.me/dongiuliocatalog_bot/DGSCatalog?startapp=cart';

  const subject = reminderNumber === 1
    ? `Вы забыли что-то! Скидка ${discountPercent}% ждёт вас`
    : `⚡ Последний шанс! Скидка ${discountPercent}% истекает`;

  const html = `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Забытая корзина</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">
                Вы забыли что-то!
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; color: #333333; line-height: 1.6;">
                Привет, <strong>${firstName}</strong>!
              </p>
              
              <p style="margin: 0 0 20px 0; font-size: 16px; color: #333333; line-height: 1.6;">
                Мы заметили, что вы оставили несколько товаров в корзине.
                В благодарность за ваш интерес мы предлагаем вам <strong style="color: #667eea;">специальную скидку ${discountPercent}%</strong>!
              </p>
              
              <!-- Discount Code Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td style="background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; border-radius: 4px;">
                    <p style="margin: 0 0 10px 0; font-size: 14px; color: #666666; text-transform: uppercase; letter-spacing: 0.5px;">
                      Код скидки
                    </p>
                    <p style="margin: 0; font-size: 24px; color: #667eea; font-weight: 700; font-family: 'Courier New', monospace;">
                      ${discountCode}
                    </p>
                  </td>
                </tr>
              </table>
              
              <!-- Countdown & Expiry Info -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0;">
                <tr>
                  <td style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; border-radius: 4px;">
                    <p style="margin: 0 0 8px 0; font-size: 16px; color: #856404; font-weight: 600;">
                      <strong>Истекает через:</strong> ${timeRemaining}
                    </p>
                    <p style="margin: 0; font-size: 14px; color: #856404;">
                      <strong>Действителен до:</strong> ${formattedExpiry}
                    </p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 20px 0; font-size: 16px; color: #333333; line-height: 1.6;">
                Не упустите эту возможность! Оформите заказ сейчас и сэкономьте.
              </p>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="${miniAppUrl}" 
                       style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 50px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);">
                      Оформить заказ
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px 30px; text-align: center; border-top: 1px solid #e9ecef;">
              <p style="margin: 0; font-size: 12px; color: #6c757d; line-height: 1.5;">
                Don Giulio Select - Премиальные итальянские деликатесы<br>
                Это автоматическое сообщение, пожалуйста, не отвечайте на него.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

  return sendEmail({
    to: email,
    subject,
    html,
  });
}
