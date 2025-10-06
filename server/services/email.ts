export interface EmailParams {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  console.log('Email would be sent to:', params.to);
  console.log('Subject:', params.subject);
  console.log('HTML:', params.html);
  
  return true;
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
