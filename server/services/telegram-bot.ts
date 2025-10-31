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

interface OrderItem {
  productName: string;
  quantity: number;
  price: string;
  unit?: string;
}

export async function sendOrderCreatedNotification(
  chatId: string,
  orderId: string,
  customerName: string,
  customerPhone: string,
  deliveryAddress: string,
  deliveryMethod: string,
  paymentMethod: string,
  items: OrderItem[],
  totalAmount: string,
  createdAt: Date
): Promise<boolean> {
  const deliveryMethodLabels: Record<string, string> = {
    'yandex_go': 'Яндекс Go',
    'yandex_dostavka': 'Яндекс Доставка',
    'cdek': 'CDEK',
    'don_giulio_courier': 'Курьер Don Giulio',
    'pickup': 'Самовывоз',
  };

  const paymentMethodLabels: Record<string, string> = {
    'yookassa': 'Онлайн оплата (ЮКасса)',
    'cash_on_delivery': 'Наличными при получении',
  };

  const formatDate = (date: Date) => {
    const months = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
    ];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${day} ${month} ${year} г. в ${hours}:${minutes}`;
  };

  const formatPrice = (price: string | number) => {
    const numPrice = typeof price === 'string' ? parseFloat(price) : price;
    return new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(numPrice);
  };

  const formatQuantity = (qty: number, unit?: string) => {
    const rounded = Number(qty.toFixed(3));
    if (unit === 'кг') {
      return `${rounded} кг`;
    }
    return `${rounded} шт`;
  };

  const itemsText = items.map(item => {
    const itemTotal = parseFloat(item.price) * item.quantity;
    return `<b>${item.productName}</b>

${formatQuantity(item.quantity, item.unit)} × ${formatPrice(item.price)} ₽

<b>${formatPrice(itemTotal)} ₽</b>`;
  }).join('\n\n');

  const paymentNote = paymentMethod === 'yookassa' 
    ? '\n\nСсылка на оплату будет отправлена, когда заказ будет готов к отправке'
    : '';

  const message = `
<b>Статус заказа</b>

<b>Оформлен</b>
<b>Дата создания:</b>
${formatDate(createdAt)}
<b>Способ доставки:</b>
${deliveryMethodLabels[deliveryMethod] || deliveryMethod}
<b>Способ оплаты:</b>
${paymentMethodLabels[paymentMethod] || paymentMethod}
<b>Твой заказ в работе!</b>

Мы создаём 50 оттенков твоего наслаждения${paymentNote}

<b>Состав заказа</b>
${itemsText}

<b>Данные доставки</b>
<b>Получатель:</b>

${customerName}

<b>Телефон:</b>

${customerPhone}

<b>Адрес доставки:</b>

${deliveryAddress}

<b>Итого к оплате:</b>

<b>${formatPrice(totalAmount)} ₽</b>
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
