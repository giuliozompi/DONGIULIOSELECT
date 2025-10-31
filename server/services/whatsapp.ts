/**
 * WhatsApp Business API Integration (Meta Cloud API)
 * 
 * Setup Instructions:
 * 1. Create Meta Business Account at business.facebook.com
 * 2. Create WhatsApp App at developers.facebook.com/apps
 * 3. Get Phone Number ID and Access Token from WhatsApp > API Setup
 * 4. Add secrets to Replit:
 *    - WHATSAPP_PHONE_NUMBER_ID: Your WhatsApp Phone Number ID
 *    - WHATSAPP_ACCESS_TOKEN: Your permanent access token
 * 5. Create and approve message templates in WhatsApp Manager
 */

const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_API_VERSION = 'v21.0';
const WHATSAPP_API_URL = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;

interface WhatsAppMessage {
  messaging_product: 'whatsapp';
  recipient_type?: 'individual';
  to: string;
  type: 'template';
  template: {
    name: string;
    language: {
      code: string;
    };
    components?: Array<{
      type: string;
      parameters: Array<{
        type: string;
        text: string;
      }>;
    }>;
  };
}

/**
 * Send WhatsApp message using Meta Cloud API
 */
async function sendWhatsAppMessage(message: WhatsAppMessage): Promise<boolean> {
  if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_ACCESS_TOKEN) {
    console.warn('⚠️ WhatsApp credentials not configured - message not sent');
    console.log('Message would be sent to:', message.to);
    console.log('Template:', message.template.name);
    return false;
  }

  try {
    const url = `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ WhatsApp API error:', data);
      if (data.error) {
        console.error('Error details:', {
          message: data.error.message,
          type: data.error.type,
          code: data.error.code,
          error_subcode: data.error.error_subcode,
          fbtrace_id: data.error.fbtrace_id,
        });
      }
      return false;
    }

    console.log('✅ WhatsApp message sent successfully:', {
      message_id: data.messages?.[0]?.id,
      recipient: message.to,
      template: message.template.name,
    });
    return true;
  } catch (error) {
    console.error('❌ Error sending WhatsApp message:', error);
    return false;
  }
}

/**
 * Format phone number to WhatsApp format (international format without + or spaces)
 * Example: +7 (999) 123-45-67 -> 79991234567
 */
function formatPhoneNumber(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  // If starts with 8, replace with 7 (Russia)
  if (digits.startsWith('8') && digits.length === 11) {
    return '7' + digits.slice(1);
  }
  
  // If already has country code, return as is
  if (digits.startsWith('7') && digits.length === 11) {
    return digits;
  }
  
  // If 10 digits, assume Russia and add 7
  if (digits.length === 10) {
    return '7' + digits;
  }
  
  return digits;
}

interface OrderItem {
  productName: string;
  quantity: number;
  price: string;
  unit?: string;
}

/**
 * Send order confirmation notification via WhatsApp
 * Template name: order_confirmation
 * 
 * Template must be created and approved in Meta Business Manager:
 * https://business.facebook.com/wa/manage/message-templates/
 */
export async function sendOrderConfirmationWhatsApp(
  phoneNumber: string,
  orderId: string,
  customerName: string,
  items: OrderItem[],
  totalAmount: string,
  deliveryMethod: string,
  paymentMethod: string
): Promise<boolean> {
  const formattedPhone = formatPhoneNumber(phoneNumber);
  
  // Format items for display
  const itemsList = items.map(item => {
    const qty = Number(item.quantity.toFixed(2));
    const unit = item.unit === 'кг' ? 'кг' : 'шт';
    return `${item.productName} (${qty} ${unit})`;
  }).join(', ');

  const deliveryLabels: Record<string, string> = {
    'yandex_go': 'Яндекс Go',
    'yandex_dostavka': 'Яндекс Доставка',
    'cdek': 'CDEK',
    'don_giulio_courier': 'Курьер Don Giulio',
    'pickup': 'Самовывоз',
  };

  const paymentLabels: Record<string, string> = {
    'yookassa': 'Онлайн оплата',
    'cash_on_delivery': 'Наличными при получении',
  };

  // Build WhatsApp template message
  const message: WhatsAppMessage = {
    messaging_product: 'whatsapp',
    to: formattedPhone,
    type: 'template',
    template: {
      name: 'order_confirmation',
      language: {
        code: 'ru',
      },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: customerName },
            { type: 'text', text: orderId.slice(0, 13) },
            { type: 'text', text: itemsList },
            { type: 'text', text: totalAmount },
            { type: 'text', text: deliveryLabels[deliveryMethod] || deliveryMethod },
            { type: 'text', text: paymentLabels[paymentMethod] || paymentMethod },
          ],
        },
      ],
    },
  };

  return sendWhatsAppMessage(message);
}

/**
 * Send order status update notification via WhatsApp
 * Template name: order_status_update
 */
export async function sendOrderStatusUpdateWhatsApp(
  phoneNumber: string,
  orderId: string,
  customerName: string,
  status: string
): Promise<boolean> {
  const formattedPhone = formatPhoneNumber(phoneNumber);

  const statusLabels: Record<string, string> = {
    'ОФОРМЛЕН': 'оформлен',
    'СОБРАН': 'собран и готов к отправке',
    'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ': 'готов к оплате',
    'ОПЛАЧЕН': 'оплачен',
    'В ПУТИ': 'в пути',
    'ДОСТАВЛЕН': 'доставлен',
    'ОТМЕНЕН': 'отменен',
  };

  const message: WhatsAppMessage = {
    messaging_product: 'whatsapp',
    to: formattedPhone,
    type: 'template',
    template: {
      name: 'order_status_update',
      language: {
        code: 'ru',
      },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: customerName },
            { type: 'text', text: orderId.slice(0, 13) },
            { type: 'text', text: statusLabels[status] || status.toLowerCase() },
          ],
        },
      ],
    },
  };

  return sendWhatsAppMessage(message);
}

/**
 * Send payment link notification via WhatsApp
 * Template name: payment_link
 */
export async function sendPaymentLinkWhatsApp(
  phoneNumber: string,
  orderId: string,
  customerName: string,
  amount: string,
  paymentUrl: string
): Promise<boolean> {
  const formattedPhone = formatPhoneNumber(phoneNumber);

  const message: WhatsAppMessage = {
    messaging_product: 'whatsapp',
    to: formattedPhone,
    type: 'template',
    template: {
      name: 'payment_link',
      language: {
        code: 'ru',
      },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: customerName },
            { type: 'text', text: orderId.slice(0, 13) },
            { type: 'text', text: amount },
          ],
        },
        {
          type: 'button',
          index: 0,
          parameters: [
            { type: 'text', text: paymentUrl },
          ],
        } as any, // WhatsApp button component type
      ],
    },
  };

  return sendWhatsAppMessage(message);
}

/**
 * Send delivery notification via WhatsApp
 * Template name: delivery_update
 */
export async function sendDeliveryUpdateWhatsApp(
  phoneNumber: string,
  orderId: string,
  customerName: string,
  deliveryInfo: string
): Promise<boolean> {
  const formattedPhone = formatPhoneNumber(phoneNumber);

  const message: WhatsAppMessage = {
    messaging_product: 'whatsapp',
    to: formattedPhone,
    type: 'template',
    template: {
      name: 'delivery_update',
      language: {
        code: 'ru',
      },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: customerName },
            { type: 'text', text: orderId.slice(0, 13) },
            { type: 'text', text: deliveryInfo },
          ],
        },
      ],
    },
  };

  return sendWhatsAppMessage(message);
}
