import { sendTelegramMessage } from './telegram-bot';
import { sendEmail } from './email';
import { formatMoscowDateForNotification } from '../utils/date-formatter';

export interface AbandonedCartReminderParams {
  userId: string;
  telegramChatId: string;
  email: string;
  firstName: string;
  discountCode: string;
  discountPercent: number;
  expiresAt: Date;
}

function calculateTimeRemaining(expiresAt: Date): string {
  const now = new Date();
  const diff = expiresAt.getTime() - now.getTime();

  if (diff <= 0) {
    return 'scaduto';
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours} ${hours === 1 ? 'ora' : 'ore'} e ${minutes} ${minutes === 1 ? 'minuto' : 'minuti'}`;
  }
  
  return `${minutes} ${minutes === 1 ? 'minuto' : 'minuti'}`;
}

export async function sendAbandonedCartReminder(
  params: AbandonedCartReminderParams
): Promise<{ telegram: boolean; email: boolean }> {
  const { telegramChatId, email, firstName, discountCode, discountPercent, expiresAt } = params;

  const formattedExpiry = formatMoscowDateForNotification(expiresAt);
  const timeRemaining = calculateTimeRemaining(expiresAt);

  const telegramSuccess = await sendTelegramNotification({
    chatId: telegramChatId,
    firstName,
    discountCode,
    discountPercent,
    formattedExpiry,
    timeRemaining,
  });

  const emailSuccess = await sendEmailNotification({
    email,
    firstName,
    discountCode,
    discountPercent,
    formattedExpiry,
    timeRemaining,
  });

  return {
    telegram: telegramSuccess,
    email: emailSuccess,
  };
}

interface TelegramNotificationParams {
  chatId: string;
  firstName: string;
  discountCode: string;
  discountPercent: number;
  formattedExpiry: string;
  timeRemaining: string;
}

async function sendTelegramNotification(
  params: TelegramNotificationParams
): Promise<boolean> {
  const { chatId, firstName, discountCode, discountPercent, formattedExpiry, timeRemaining } = params;

  const text = `
<b>Hai dimenticato qualcosa nel carrello!</b>

Ciao ${firstName},

Abbiamo notato che hai lasciato alcuni prodotti nel carrello.
Per ringraziarti dell'interesse, ti offriamo uno <b>sconto speciale del ${discountPercent}%</b>!

<b>Codice sconto:</b> <code>${discountCode}</code>

<b>Scade tra:</b> ${timeRemaining}
<b>Valido fino a:</b> ${formattedExpiry}

Non perdere questa opportunità! Completa il tuo ordine ora e risparmia.

<a href="${process.env.VITE_TELEGRAM_BOT_URL || 'https://t.me/DonGiulioSelectBot'}">Completa l'ordine</a>
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
}

async function sendEmailNotification(
  params: EmailNotificationParams
): Promise<boolean> {
  const { email, firstName, discountCode, discountPercent, formattedExpiry, timeRemaining } = params;

  const subject = `Hai dimenticato qualcosa! Sconto del ${discountPercent}% ti aspetta`;

  const html = `
<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Carrello Abbandonato</title>
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
                Hai dimenticato qualcosa!
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; color: #333333; line-height: 1.6;">
                Ciao <strong>${firstName}</strong>,
              </p>
              
              <p style="margin: 0 0 20px 0; font-size: 16px; color: #333333; line-height: 1.6;">
                Abbiamo notato che hai lasciato alcuni prodotti nel carrello.
                Per ringraziarti dell'interesse, ti offriamo uno <strong style="color: #667eea;">sconto speciale del ${discountPercent}%</strong>!
              </p>
              
              <!-- Discount Code Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td style="background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; border-radius: 4px;">
                    <p style="margin: 0 0 10px 0; font-size: 14px; color: #666666; text-transform: uppercase; letter-spacing: 0.5px;">
                      Codice Sconto
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
                      <strong>Scade tra:</strong> ${timeRemaining}
                    </p>
                    <p style="margin: 0; font-size: 14px; color: #856404;">
                      <strong>Valido fino a:</strong> ${formattedExpiry}
                    </p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 20px 0; font-size: 16px; color: #333333; line-height: 1.6;">
                Non perdere questa opportunità! Completa il tuo ordine ora e risparmia.
              </p>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="${process.env.VITE_TELEGRAM_BOT_URL || 'https://t.me/DonGiulioSelectBot'}" 
                       style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 50px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);">
                      Completa l'Ordine
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
                Don Giulio Select - Delicatezze Italiane Premium<br>
                Questo è un messaggio automatico, per favore non rispondere.
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
