import { createHmac } from 'crypto';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

export interface TelegramMessage {
  chatId: string;
  text: string;
  parseMode?: 'HTML' | 'Markdown';
}

export async function sendTelegramMessage(params: TelegramMessage): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN not configured');
    return false;
  }

  try {
    const response = await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: params.chatId,
        text: params.text,
        parse_mode: params.parseMode || 'HTML',
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      console.error('Telegram API error:', data);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error sending Telegram message:', error);
    return false;
  }
}

export async function sendPaymentLink(
  chatId: string,
  orderId: string,
  amount: string,
  paymentUrl: string
): Promise<boolean> {
  const message = `
🛒 <b>Ваш заказ готов к оплате!</b>

📦 Заказ: <code>${orderId}</code>
💰 Сумма: <b>${amount} ₽</b>

Пожалуйста, оплатите заказ по ссылке ниже:
${paymentUrl}

Ссылка действительна в течение 15 минут.
  `.trim();

  return sendTelegramMessage({
    chatId,
    text: message,
    parseMode: 'HTML',
  });
}

export async function sendOrderStatusNotification(
  chatId: string,
  orderId: string,
  status: string,
  customerName: string
): Promise<boolean> {
  const statusMessages: Record<string, { emoji: string; title: string; description: string }> = {
    'ОФОРМЛЕН': {
      emoji: '✅',
      title: 'Заказ оформлен',
      description: 'Ваш заказ успешно оформлен и принят в работу.'
    },
    'СОБРАН': {
      emoji: '📦',
      title: 'Заказ собран',
      description: 'Ваш заказ собран и готов к отправке.'
    },
    'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ': {
      emoji: '💳',
      title: 'Отправлена ссылка на оплату',
      description: 'Вам отправлена ссылка для оплаты заказа.'
    },
    'ОПЛАЧЕН': {
      emoji: '✅',
      title: 'Заказ оплачен',
      description: 'Ваш заказ успешно оплачен. Спасибо!'
    },
    'ВЫЗВАН КУРЬЕР': {
      emoji: '🚚',
      title: 'Курьер в пути',
      description: 'Курьер выехал к вам с заказом.'
    },
    'ПОЛУЧЕН': {
      emoji: '🎉',
      title: 'Заказ получен',
      description: 'Заказ успешно доставлен. Приятного аппетита!'
    }
  };

  const statusInfo = statusMessages[status] || {
    emoji: '📋',
    title: 'Обновление статуса заказа',
    description: `Статус вашего заказа изменен: ${status}`
  };

  const message = `
${statusInfo.emoji} <b>${statusInfo.title}</b>

Здравствуйте, ${customerName}!

${statusInfo.description}

📦 Заказ: <code>${orderId.slice(0, 13)}</code>

Вы можете отследить ваш заказ в разделе "Мои заказы" нашего приложения.
  `.trim();

  return sendTelegramMessage({
    chatId,
    text: message,
    parseMode: 'HTML',
  });
}
