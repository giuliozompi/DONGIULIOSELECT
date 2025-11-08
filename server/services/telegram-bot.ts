import { createHmac } from 'crypto';
import { formatMoscowDateForNotification } from '../utils/date-formatter';

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

  // Usa formattazione UTC+3 (Mosca) per tutte le date
  const formatDate = (date: Date) => {
    return formatMoscowDateForNotification(date);
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
    return `• <b>${item.productName}</b>\n  ${formatQuantity(item.quantity, item.unit)} × ${formatPrice(item.price)} ₽ = <b>${formatPrice(itemTotal)} ₽</b>`;
  }).join('\n');

  const paymentNote = paymentMethod === 'yookassa' 
    ? '\n💳 <i>Ссылка на оплату будет отправлена, когда заказ будет готов к отправке</i>'
    : '';

  const message = `
✅ <b>ЗАКАЗ ОФОРМЛЕН</b>

🗓 ${formatDate(createdAt)}
🚚 ${deliveryMethodLabels[deliveryMethod] || deliveryMethod}
💰 ${paymentMethodLabels[paymentMethod] || paymentMethod}

🔴 <b><u>Подожди еще немножко!</u></b>
🔴 <b><u>Мы создаём 50 оттенков твоего наслаждения</u></b>${paymentNote}

━━━━━━━━━━━━━━━
📦 <b>СОСТАВ ЗАКАЗА</b>

${itemsText}

━━━━━━━━━━━━━━━
🏠 <b>ДОСТАВКА</b>

👤 ${customerName}
📞 ${customerPhone}
📍 ${deliveryAddress}

━━━━━━━━━━━━━━━
💵 <b>ПРЕДВАРИТЕЛЬНАЯ СТОИМОСТЬ ЗАКАЗА*</b>
<b>${formatPrice(totalAmount)} ₽</b>

<i>(*) Окончательная стоимость будет доступна, когда заказ будет готов. Нарезка сыров и колбасных изделий может привести к небольшим отклонениям в весе от заказанного количества.</i>
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

export async function sendNewOrderNotificationToManagers(
  orderId: string,
  customerName: string,
  customerPhone: string,
  deliveryAddress: string,
  deliveryMethod: string,
  paymentMethod: string,
  items: OrderItem[],
  totalAmount: string,
  createdAt: Date,
  deliveryNotes?: string
): Promise<boolean> {
  const MANAGER_CHAT_IDS = process.env.MANAGER_TELEGRAM_CHAT_IDS;
  
  if (!MANAGER_CHAT_IDS) {
    console.warn('⚠️ MANAGER_TELEGRAM_CHAT_IDS not configured - manager notifications disabled');
    return false;
  }

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
    return formatMoscowDateForNotification(date);
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
    return `• <b>${item.productName}</b>\n  ${formatQuantity(item.quantity, item.unit)} × ${formatPrice(item.price)} ₽ = <b>${formatPrice(itemTotal)} ₽</b>`;
  }).join('\n');

  const notesSection = deliveryNotes 
    ? `\n📝 <b>ПРИМЕЧАНИЯ К ДОСТАВКЕ</b>\n${deliveryNotes}\n\n━━━━━━━━━━━━━━━`
    : '';

  const message = `
🔔 <b>НОВЫЙ ЗАКАЗ</b>

🆔 <code>${orderId}</code>
🗓 ${formatDate(createdAt)}
🚚 ${deliveryMethodLabels[deliveryMethod] || deliveryMethod}
💰 ${paymentMethodLabels[paymentMethod] || paymentMethod}

━━━━━━━━━━━━━━━
📦 <b>СОСТАВ ЗАКАЗА</b>

${itemsText}

━━━━━━━━━━━━━━━
🏠 <b>ДОСТАВКА</b>

👤 ${customerName}
📞 ${customerPhone}
📍 ${deliveryAddress}${notesSection}

━━━━━━━━━━━━━━━
💵 <b>ПРЕДВАРИТЕЛЬНАЯ СТОИМОСТЬ</b>
<b>${formatPrice(totalAmount)} ₽</b>
  `.trim();

  const chatIds = MANAGER_CHAT_IDS.split(',').map(id => id.trim());
  const results = await Promise.all(
    chatIds.map(chatId => 
      sendTelegramMessage({
        chatId,
        text: message,
        parseMode: 'HTML',
      })
    )
  );

  const successCount = results.filter(r => r).length;
  console.log(`📤 Manager notifications: ${successCount}/${chatIds.length} sent successfully`);

  return successCount > 0;
}

export async function sendOrderPaidNotificationToManagers(
  orderId: string,
  customerName: string,
  customerPhone: string,
  totalAmount: string,
  paymentMethod: string
): Promise<boolean> {
  const MANAGER_CHAT_IDS = process.env.MANAGER_TELEGRAM_CHAT_IDS;
  
  if (!MANAGER_CHAT_IDS) {
    console.warn('⚠️ MANAGER_TELEGRAM_CHAT_IDS not configured - payment notification not sent');
    return false;
  }

  const paymentMethodLabels: Record<string, string> = {
    'yookassa': 'Онлайн оплата (ЮКасса)',
    'cash_on_delivery': 'Наличными при получении',
  };

  const formatPrice = (price: string | number) => {
    const numPrice = typeof price === 'string' ? parseFloat(price) : price;
    return new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(numPrice);
  };

  const message = `
💰 <b>ЗАКАЗ ОПЛАЧЕН</b>

🆔 <code>${orderId}</code>

━━━━━━━━━━━━━━━
👤 <b>КЛИЕНТ</b>

👤 ${customerName}
📞 ${customerPhone}

━━━━━━━━━━━━━━━
💳 <b>ОПЛАТА</b>

${paymentMethodLabels[paymentMethod] || paymentMethod}

━━━━━━━━━━━━━━━
💵 <b>СУММА</b>
<b>${formatPrice(totalAmount)} ₽</b>

✅ <b>Заказ можно готовить к отправке</b>
  `.trim();

  const chatIds = MANAGER_CHAT_IDS.split(',').map(id => id.trim());
  const results = await Promise.all(
    chatIds.map(chatId => 
      sendTelegramMessage({
        chatId,
        text: message,
        parseMode: 'HTML',
      })
    )
  );

  const successCount = results.filter(r => r).length;
  console.log(`📤 Payment notifications to managers: ${successCount}/${chatIds.length} sent successfully`);

  return successCount > 0;
}

export async function sendDeliveryStartedNotificationToManagers(
  orderId: string,
  customerName: string,
  customerPhone: string,
  deliveryAddress: string,
  courierService: string,
  totalAmount: string
): Promise<boolean> {
  const MANAGER_CHAT_IDS = process.env.MANAGER_TELEGRAM_CHAT_IDS;
  
  if (!MANAGER_CHAT_IDS) {
    console.warn('⚠️ MANAGER_TELEGRAM_CHAT_IDS not configured - delivery notification not sent');
    return false;
  }

  const courierServiceLabels: Record<string, string> = {
    'yandex_go': 'Яндекс Go',
    'yandex_delivery': 'Яндекс Доставка',
    'cdek': 'CDEK',
    'don_giulio_courier': 'Курьер Don Giulio',
  };

  const formatPrice = (price: string | number) => {
    const numPrice = typeof price === 'string' ? parseFloat(price) : price;
    return new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(numPrice);
  };

  const message = `
🚚 <b>КУРЬЕР ВЫЗВАН</b>

🆔 <code>${orderId}</code>

━━━━━━━━━━━━━━━
👤 <b>КЛИЕНТ</b>

👤 ${customerName}
📞 ${customerPhone}

━━━━━━━━━━━━━━━
🚚 <b>ДОСТАВКА</b>

📍 ${deliveryAddress}
🚗 ${courierServiceLabels[courierService] || courierService}

━━━━━━━━━━━━━━━
💵 <b>СУММА</b>
<b>${formatPrice(totalAmount)} ₽</b>

📦 <b>Заказ в пути к клиенту</b>
  `.trim();

  const chatIds = MANAGER_CHAT_IDS.split(',').map(id => id.trim());
  const results = await Promise.all(
    chatIds.map(chatId => 
      sendTelegramMessage({
        chatId,
        text: message,
        parseMode: 'HTML',
      })
    )
  );

  const successCount = results.filter(r => r).length;
  console.log(`📤 Delivery notifications to managers: ${successCount}/${chatIds.length} sent successfully`);

  return successCount > 0;
}
