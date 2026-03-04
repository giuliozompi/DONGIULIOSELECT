import { sendTelegramMessage, sendMediaGroup } from './telegram-bot';
import { sendEmail } from './email';
import { formatMoscowDateForNotification } from '../utils/date-formatter';

const APP_URL = process.env.APP_PUBLIC_URL || 'https://don-giulio-catalog.replit.app';
const FORTUNE_LINK = 'https://t.me/dongiuliocatalog_bot/DGSCatalog?startapp=fortune';
const SHOP_LINK = 'https://t.me/dongiuliocatalog_bot/DGSCatalog';

export interface ReengagementProduct {
  productId: string;
  productName: string;
  images: string[];
}

export interface ReengagementParams {
  userId: string;
  telegramChatId: string;
  email: string | null;
  firstName: string;
  daysSinceLastOrder: number;
  products: ReengagementProduct[];
  spinTokens: number;
  prizes: Array<{ name: string; type: string; value: string }>;
}

function buildPublicImageUrl(imagePath: string): string {
  if (!imagePath) return '';
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  const path = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
  return `${APP_URL}${path}`;
}

function getPrizeTypeLabel(type: string): string {
  switch (type) {
    case 'discount': return 'скидка';
    case 'delivery_coupon': return 'бесплатная доставка';
    case 'gift': return 'подарок';
    default: return 'приз';
  }
}

export async function sendReengagementNotification(
  params: ReengagementParams
): Promise<{ telegram: boolean; email: boolean }> {
  const { telegramChatId, email } = params;

  const telegramSuccess = await sendTelegramNotification(params);
  const emailSuccess = email ? await sendEmailNotification(params) : false;

  return { telegram: telegramSuccess, email: emailSuccess };
}

async function sendTelegramNotification(params: ReengagementParams): Promise<boolean> {
  const { telegramChatId, firstName, daysSinceLastOrder, products, spinTokens, prizes } = params;

  // Raccoglie fino a 3 foto dai prodotti acquistati precedentemente
  const photoUrls: string[] = [];
  for (const product of products.slice(0, 3)) {
    if (product.images && product.images.length > 0) {
      const url = buildPublicImageUrl(product.images[0]);
      if (url) photoUrls.push(url);
    }
    if (photoUrls.length >= 3) break;
  }

  // Sezione prodotti acquistati
  const productLines = products
    .slice(0, 5)
    .map(p => `• ${p.productName}`)
    .join('\n');

  // Sezione premi
  let prizesSection = '';
  if (prizes.length > 0) {
    const prizeLines = prizes.map(p => `• ${p.name} (${getPrizeTypeLabel(p.type)}: ${p.value})`).join('\n');
    prizesSection = `\n\n<b>У вас есть призы, которые ждут вас:</b>\n${prizeLines}`;
  }

  // Sezione ruota fortuna
  let fortuneSection = '';
  if (spinTokens > 0) {
    const tokenWord = spinTokens === 1 ? 'попытка' : spinTokens < 5 ? 'попытки' : 'попыток';
    fortuneSection = `\n\n<b>У вас ${spinTokens} ${tokenWord} на Колесо Фортуны!</b>\nКрутите и выигрывайте скидки, подарки и бонусы.`;
  } else {
    fortuneSection = `\n\n<b>Сделайте новый заказ</b> — и получите попытки на Колесо Фортуны с призами!`;
  }

  const text = `
<b>Соскучились по вас, ${firstName}!</b>

Прошло уже ${daysSinceLastOrder} дней с вашего последнего заказа.

<b>Вы покупали у нас:</b>
${productLines}${prizesSection}${fortuneSection}

<a href="${FORTUNE_LINK}">Крутить Колесо Фортуны</a>
<a href="${SHOP_LINK}">Сделать новый заказ</a>
`.trim();

  try {
    if (photoUrls.length >= 2) {
      // Invia galleria foto (senza caption) + poi testo separato
      const mediaOk = await sendMediaGroup(telegramChatId, photoUrls);
      const textOk = await sendTelegramMessage({ chatId: telegramChatId, text, parseMode: 'HTML' });
      return textOk;
    } else if (photoUrls.length === 1) {
      // Invia singola foto + poi testo separato
      const { sendPhotoMessage } = await import('./telegram-bot');
      await sendPhotoMessage(telegramChatId, photoUrls[0]);
      return await sendTelegramMessage({ chatId: telegramChatId, text, parseMode: 'HTML' });
    } else {
      // Nessuna foto disponibile: solo testo
      return await sendTelegramMessage({ chatId: telegramChatId, text, parseMode: 'HTML' });
    }
  } catch (error) {
    console.error('[Reengagement] Telegram error:', error);
    return false;
  }
}

async function sendEmailNotification(params: ReengagementParams): Promise<boolean> {
  const { email, firstName, daysSinceLastOrder, products, spinTokens, prizes } = params;
  if (!email) return false;

  const productCards = products
    .slice(0, 4)
    .map(p => {
      const imgUrl = p.images && p.images.length > 0 ? buildPublicImageUrl(p.images[0]) : '';
      return `
        <td style="width:160px; padding:8px; text-align:center; vertical-align:top;">
          ${imgUrl ? `<img src="${imgUrl}" alt="${p.productName}" style="width:140px; height:140px; object-fit:cover; border-radius:8px; display:block; margin:0 auto 8px;">` : ''}
          <p style="margin:0; font-size:13px; color:#333; font-weight:500;">${p.productName}</p>
        </td>
      `;
    })
    .join('');

  let prizesHtml = '';
  if (prizes.length > 0) {
    const prizeItems = prizes
      .map(p => `<li style="margin-bottom:6px; color:#333;">${p.name} — <strong>${getPrizeTypeLabel(p.type)}: ${p.value}</strong></li>`)
      .join('');
    prizesHtml = `
      <div style="background:#fff8e7; border-left:4px solid #f59e0b; padding:16px 20px; border-radius:4px; margin:24px 0;">
        <p style="margin:0 0 10px 0; font-size:16px; font-weight:700; color:#b45309;">Ваши призы ждут вас!</p>
        <ul style="margin:0; padding-left:20px; font-size:14px;">${prizeItems}</ul>
      </div>
    `;
  }

  let fortuneHtml = '';
  if (spinTokens > 0) {
    const tokenWord = spinTokens === 1 ? 'попытка' : spinTokens < 5 ? 'попытки' : 'попыток';
    fortuneHtml = `
      <div style="background:#f0fdf4; border-left:4px solid #22c55e; padding:16px 20px; border-radius:4px; margin:24px 0;">
        <p style="margin:0 0 8px 0; font-size:16px; font-weight:700; color:#15803d;">У вас ${spinTokens} ${tokenWord} на Колесо Фортуны!</p>
        <p style="margin:0; font-size:14px; color:#166534;">Крутите колесо и выигрывайте скидки, подарки и приятные сюрпризы!</p>
      </div>
    `;
  } else {
    fortuneHtml = `
      <div style="background:#f0fdf4; border-left:4px solid #22c55e; padding:16px 20px; border-radius:4px; margin:24px 0;">
        <p style="margin:0 0 8px 0; font-size:16px; font-weight:700; color:#15803d;">Колесо Фортуны ждет вас!</p>
        <p style="margin:0; font-size:14px; color:#166534;">Сделайте новый заказ — и получите попытки на Колесо Фортуны с призами и скидками.</p>
      </div>
    `;
  }

  const html = `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Соскучились по вас!</title>
</head>
<body style="margin:0; padding:0; font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif; background-color:#f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4; padding:20px;">
    <tr>
      <td align="center">
        <table width="620" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a1a2e 0%,#4a1942 100%); padding:40px 30px; text-align:center;">
              <p style="margin:0 0 6px 0; font-size:13px; color:#d4a04a; letter-spacing:2px; text-transform:uppercase;">Don Giulio Select</p>
              <h1 style="margin:0; color:#ffffff; font-size:26px; font-weight:700;">Соскучились по вас, ${firstName}!</h1>
              <p style="margin:12px 0 0 0; color:#e0c080; font-size:15px;">Прошло ${daysSinceLastOrder} дней с вашего последнего заказа</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:32px 30px 0;">
              <p style="margin:0 0 20px 0; font-size:16px; color:#333; line-height:1.6;">
                Мы помним ваши любимые продукты и хотим напомнить о себе. Загляните — у нас много нового!
              </p>

              <!-- Product photos -->
              ${productCards ? `
              <p style="margin:0 0 14px 0; font-size:15px; font-weight:700; color:#333;">Вы покупали у нас:</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
                <tr>${productCards}</tr>
              </table>
              ` : ''}

              ${prizesHtml}
              ${fortuneHtml}

              <!-- CTA Buttons -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
                <tr>
                  <td align="center" style="padding:0 4px;">
                    <a href="${FORTUNE_LINK}"
                       style="display:inline-block; padding:14px 28px; background:linear-gradient(135deg,#7c3aed,#a855f7); color:#fff; text-decoration:none; border-radius:50px; font-size:15px; font-weight:600; margin:4px;">
                      Крутить Колесо Фортуны
                    </a>
                  </td>
                  <td align="center" style="padding:0 4px;">
                    <a href="${SHOP_LINK}"
                       style="display:inline-block; padding:14px 28px; background:linear-gradient(135deg,#1a1a2e,#4a1942); color:#d4a04a; text-decoration:none; border-radius:50px; font-size:15px; font-weight:600; margin:4px;">
                      Сделать заказ
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8f9fa; padding:20px 30px; text-align:center; border-top:1px solid #e9ecef;">
              <p style="margin:0; font-size:12px; color:#6c757d; line-height:1.5;">
                Don Giulio Select — Премиальные итальянские деликатесы<br>
                Это автоматическое сообщение. Чтобы отписаться, напишите нам.
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
    subject: `${firstName}, соскучились по вас! Ваши призы и любимые продукты ждут`,
    html,
  });
}
