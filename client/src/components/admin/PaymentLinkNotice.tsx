import React from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { PaymentNotificationFields } from '@shared/payment-link-delivery';

export function PaymentLinkNotice({ notice }: { notice?: PaymentNotificationFields | null }) {
  if (!notice?.warning && !notice?.paymentDelivery) return null;
  return (
    <Alert variant={notice.warning ? 'destructive' : 'default'} data-testid="payment-link-notice">
      <AlertTitle>{notice.warning ? 'Проверьте отправку ссылки на оплату' : 'Ссылка передана сервису уведомлений'}</AlertTitle>
      <AlertDescription>
        {notice.warning && <p>{notice.warning}</p>}
        {notice.error && <p>{notice.error}</p>}
        <ul className="mt-2 space-y-1">
          {notice.paymentDelivery?.channels.map(result => (
            <li key={result.channel}>
              <strong>{result.channel === 'email' ? 'Email' : result.channel === 'telegram' ? 'Telegram' : 'WhatsApp'}: </strong>
              {result.status === 'sent' ? 'Принято сервисом' : result.status === 'failed' ? 'Ошибка' : 'Не отправлялось'}
              {' — '}{result.detail}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
