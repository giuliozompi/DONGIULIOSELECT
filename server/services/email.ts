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

export async function sendOrderConfirmationToCustomer(
  customerEmail: string,
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

  const itemsHtml = items.map(item => {
    const itemTotal = parseFloat(item.priceAtAdd) * item.quantity;
    return `
      <tr>
        <td style="padding: 12px 8px; border-bottom: 1px solid #e0e0e0;">
          <strong>${item.productName}</strong>
        </td>
        <td style="padding: 12px 8px; border-bottom: 1px solid #e0e0e0; text-align: center;">
          ${formatQuantity(item.quantity, item.unit)} × ${formatPrice(item.priceAtAdd)} ₽
        </td>
        <td style="padding: 12px 8px; border-bottom: 1px solid #e0e0e0; text-align: right;">
          <strong>${formatPrice(itemTotal)} ₽</strong>
        </td>
      </tr>
    `;
  }).join('');

  const paymentNote = paymentMethod === 'yookassa'
    ? '<p style="margin: 15px 0; padding: 15px; background-color: #fff3cd; border-left: 4px solid #ffc107; color: #856404;">Ссылка на оплату будет отправлена, когда заказ будет готов к отправке</p>'
    : '';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 700px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2481cc; color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 28px; }
        .status-badge { display: inline-block; background-color: #4caf50; color: white; padding: 8px 16px; border-radius: 4px; margin: 15px 0; font-weight: bold; }
        .content { background-color: #f9f9f9; padding: 30px 20px; }
        .section { background-color: white; padding: 20px; margin-bottom: 20px; border-radius: 8px; border: 1px solid #e0e0e0; }
        .section-title { font-size: 18px; font-weight: bold; margin-bottom: 15px; color: #2481cc; border-bottom: 2px solid #2481cc; padding-bottom: 8px; }
        .info-row { margin-bottom: 12px; line-height: 1.8; }
        .info-label { font-weight: bold; color: #666; display: inline-block; min-width: 150px; }
        .motivational { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
        .motivational p { margin: 8px 0; font-size: 16px; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th { background-color: #f5f5f5; padding: 12px; text-align: left; border-bottom: 2px solid #ddd; font-weight: bold; }
        .total-section { background-color: #e8f5e9; padding: 20px; border-radius: 8px; margin-top: 20px; text-align: center; }
        .total-amount { font-size: 32px; font-weight: bold; color: #2481cc; margin: 10px 0; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #999; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🛒 Ваш заказ оформлен!</h1>
          <div class="status-badge">Оформлен</div>
          <p style="margin: 10px 0; font-size: 14px;">Заказ #${orderId.slice(0, 13)}</p>
        </div>
        <div class="content">
          
          <div class="section">
            <div class="info-row"><span class="info-label">Дата создания:</span> ${formatDate(createdAt)}</div>
            <div class="info-row"><span class="info-label">Способ доставки:</span> ${deliveryMethodLabels[deliveryMethod] || deliveryMethod}</div>
            <div class="info-row"><span class="info-label">Способ оплаты:</span> ${paymentMethodLabels[paymentMethod] || paymentMethod}</div>
          </div>

          <div class="motivational">
            <p><strong>Твой заказ в работе!</strong></p>
            <p>Мы создаём 50 оттенков твоего наслаждения</p>
          </div>

          ${paymentNote}

          <div class="section">
            <div class="section-title">📦 Состав заказа</div>
            <table>
              <thead>
                <tr>
                  <th>Товар</th>
                  <th style="text-align: center;">Количество и цена</th>
                  <th style="text-align: right;">Сумма</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>
          </div>

          <div class="section">
            <div class="section-title">🚚 Данные доставки</div>
            <div class="info-row"><span class="info-label">Получатель:</span> ${customerName}</div>
            <div class="info-row"><span class="info-label">Телефон:</span> ${customerPhone}</div>
            <div class="info-row"><span class="info-label">Адрес доставки:</span> ${deliveryAddress}</div>
          </div>

          <div class="total-section">
            <p style="margin: 5px 0; font-size: 18px; color: #666;">Предварительная стоимость заказа*</p>
            <div class="total-amount">${formatPrice(totalAmount)} ₽</div>
            <p style="margin: 15px 0 0 0; font-size: 12px; color: #666; line-height: 1.5;">
              <strong>(*)</strong> Окончательная стоимость будет доступна, когда заказ будет готов.<br>
              Нарезка сыров и колбасных изделий может привести к небольшим отклонениям в весе от заказанного количества.
            </p>
          </div>

        </div>
        <div class="footer">
          <p>Это автоматическое письмо с подтверждением вашего заказа в Don Giulio Select.</p>
          <p>Вы можете отследить статус заказа в нашем приложении Telegram.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: customerEmail,
    subject: `🛒 Заказ #${orderId.slice(0, 13)} оформлен - Don Giulio Select`,
    html,
  });
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
