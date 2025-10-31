const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_API_URL = 'https://api.resend.com/emails';

export interface EmailParams {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn('⚠️ RESEND_API_KEY not configured - email not sent');
    console.log('Email would be sent to:', params.to);
    console.log('Subject:', params.subject);
    return false;
  }

  try {
    const from = params.from || 'Don Giulio Select <onboarding@resend.dev>';
    const to = Array.isArray(params.to) ? params.to : [params.to];

    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        subject: params.subject,
        html: params.html,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Resend API error:', data);
      return false;
    }

    console.log('✅ Email sent successfully via Resend:', data.id);
    return true;
  } catch (error) {
    console.error('❌ Error sending email:', error);
    return false;
  }
}

export async function sendPaymentLinkEmail(
  email: string,
  orderId: string,
  customerName: string,
  amount: string,
  paymentUrl: string
): Promise<boolean> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
        .content { background-color: #f9f9f9; padding: 20px; }
        .button { display: inline-block; padding: 12px 24px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #999; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Ваш заказ готов к оплате!</h1>
        </div>
        <div class="content">
          <p>Здравствуйте, ${customerName}!</p>
          <p>Ваш заказ <strong>#${orderId}</strong> подготовлен и готов к оплате.</p>
          <p><strong>Сумма к оплате:</strong> ${amount} ₽</p>
          <p>Пожалуйста, оплатите заказ по кнопке ниже:</p>
          <p style="text-align: center;">
            <a href="${paymentUrl}" class="button">Оплатить заказ</a>
          </p>
          <p><small>Ссылка действительна в течение 15 минут.</small></p>
          <p>Если кнопка не работает, скопируйте эту ссылку в браузер:</p>
          <p><a href="${paymentUrl}">${paymentUrl}</a></p>
        </div>
        <div class="footer">
          <p>Это автоматическое письмо, пожалуйста, не отвечайте на него.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: `Заказ #${orderId} готов к оплате`,
    html,
  });
}

interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  priceAtAdd: string;
  unit?: string;
}

export async function sendNewOrderNotificationToManagers(
  orderId: string,
  customerName: string,
  customerPhone: string,
  customerEmail: string,
  deliveryAddress: string,
  deliveryMethod: string,
  paymentMethod: string,
  items: OrderItem[],
  totalAmount: string,
  deliveryNotes?: string
): Promise<boolean> {
  const MANAGER_EMAILS = process.env.MANAGER_EMAILS;
  
  if (!MANAGER_EMAILS) {
    console.warn('⚠️ MANAGER_EMAILS not configured - manager notification not sent');
    return false;
  }

  const managerEmailList = MANAGER_EMAILS.split(',').map(email => email.trim()).filter(Boolean);
  
  if (managerEmailList.length === 0) {
    console.warn('⚠️ No valid manager emails found');
    return false;
  }

  const deliveryMethodLabels: Record<string, string> = {
    'yandex_go': 'Yandex Go',
    'cdek': 'CDEK',
    'don_giulio_courier': 'Курьер Don Giulio',
    'pickup': 'Самовывоз',
  };

  const paymentMethodLabels: Record<string, string> = {
    'yookassa': 'Онлайн оплата (YooKassa)',
    'cash_on_delivery': 'Наличными при получении',
  };

  const formatPrice = (price: string | number) => {
    const numPrice = typeof price === 'string' ? parseFloat(price) : price;
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(numPrice);
  };

  const formatQuantity = (qty: number, unit?: string) => {
    const rounded = Number(qty.toFixed(3));
    if (unit === 'кг') {
      return `${rounded} кг`;
    }
    return `${rounded} шт.`;
  };

  const itemsHtml = items.map(item => {
    const itemTotal = parseFloat(item.priceAtAdd) * item.quantity;
    return `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.productName}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${formatQuantity(item.quantity, item.unit)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${formatPrice(item.priceAtAdd)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;"><strong>${formatPrice(itemTotal)}</strong></td>
      </tr>
    `;
  }).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 700px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2481cc; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background-color: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
        .section { background-color: white; padding: 15px; margin-bottom: 15px; border-radius: 4px; border: 1px solid #ddd; }
        .section-title { font-size: 16px; font-weight: bold; margin-bottom: 10px; color: #2481cc; }
        .info-row { margin-bottom: 8px; }
        .info-label { font-weight: bold; color: #666; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { background-color: #f5f5f5; padding: 10px; text-align: left; border-bottom: 2px solid #ddd; }
        .total-row { background-color: #f0f8ff; font-weight: bold; font-size: 18px; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #999; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🛒 Новый заказ!</h1>
          <p style="margin: 5px 0;">Заказ #${orderId.slice(0, 13)}</p>
        </div>
        <div class="content">
          
          <div class="section">
            <div class="section-title">👤 Информация о клиенте</div>
            <div class="info-row"><span class="info-label">Имя:</span> ${customerName}</div>
            <div class="info-row"><span class="info-label">Телефон:</span> ${customerPhone}</div>
            <div class="info-row"><span class="info-label">Email:</span> ${customerEmail}</div>
          </div>

          <div class="section">
            <div class="section-title">🚚 Информация о доставке</div>
            <div class="info-row"><span class="info-label">Адрес:</span> ${deliveryAddress}</div>
            <div class="info-row"><span class="info-label">Способ доставки:</span> ${deliveryMethodLabels[deliveryMethod] || deliveryMethod}</div>
            <div class="info-row"><span class="info-label">Способ оплаты:</span> ${paymentMethodLabels[paymentMethod] || paymentMethod}</div>
            ${deliveryNotes ? `<div class="info-row"><span class="info-label">Комментарий:</span> ${deliveryNotes}</div>` : ''}
          </div>

          <div class="section">
            <div class="section-title">📦 Состав заказа</div>
            <table>
              <thead>
                <tr>
                  <th>Товар</th>
                  <th style="text-align: center;">Количество</th>
                  <th style="text-align: right;">Цена</th>
                  <th style="text-align: right;">Сумма</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
                <tr class="total-row">
                  <td colspan="3" style="padding: 12px; text-align: right;">ИТОГО:</td>
                  <td style="padding: 12px; text-align: right;">${formatPrice(totalAmount)}</td>
                </tr>
              </tbody>
            </table>
          </div>

        </div>
        <div class="footer">
          <p>Это автоматическое уведомление о новом заказе в системе Don Giulio Select.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: managerEmailList,
    subject: `🛒 Новый заказ #${orderId.slice(0, 13)} от ${customerName}`,
    html,
  });
}
