import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Clock3, LoaderCircle, RefreshCw, Send, X } from 'lucide-react';
import type { PaymentLinkState, PaymentAttemptView } from '@shared/payment-link-attempts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function dateTime(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusText(status: PaymentAttemptView['status']) {
  return ({
    pending: 'Выполняется',
    sent: 'Принято сервисом',
    partial: 'Частично принято',
    failed: 'Ошибка',
    unknown: 'Результат неизвестен',
  })[status];
}

function channelName(channel: string) {
  return ({ email: 'Email', telegram: 'Telegram', whatsapp: 'WhatsApp' } as Record<string, string>)[channel] || channel;
}

function resultIcon(status: string) {
  if (status === 'sent') return <Check className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />;
  if (status === 'failed') return <X className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />;
  return <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground" aria-hidden="true" />;
}

export function PaymentLinkControls({
  state,
  orderId,
  sending,
  onResend,
  onRefresh,
  compact = false,
}: {
  state?: PaymentLinkState | null;
  orderId: string;
  sending: boolean;
  onResend: () => void;
  onRefresh?: () => void;
  compact?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!state?.retryAt) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [state?.retryAt]);

  const serverOffset = useMemo(() => state?.serverNow ? new Date(state.serverNow).getTime() - Date.now() : 0, [state?.serverNow]);
  const retryMs = state?.retryAt ? new Date(state.retryAt).getTime() - (now + serverOffset) : 0;
  const countdown = retryMs > 0
    ? `${Math.floor(retryMs / 60_000)}:${String(Math.floor((retryMs % 60_000) / 1000)).padStart(2, '0')}`
    : null;
  const latestHistory = state?.history?.[0];
  const latestAttempt = state?.history?.find(item => !item.legacy);

  const resend = () => {
    if (!state?.canSend || sending) return;
    const caution = latestAttempt?.status === 'unknown' ? '\nПредыдущий сервис мог принять сообщение. Проверьте сообщения перед повторной отправкой.' : '';
    if (window.confirm(`Повторно отправить ссылку на оплату заказа №${orderId.slice(-6).toUpperCase()}?${caution}`)) onResend();
  };

  const action = (
    <div className={`flex ${compact ? 'flex-col items-stretch' : 'flex-col sm:flex-row sm:items-center'} gap-2`}>
      <Button size="sm" variant="outline" aria-label="Повторно отправить ссылку на оплату" onClick={event => { event.stopPropagation(); resend(); }} disabled={!state?.canSend || sending}>
        {sending ? <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
        {sending ? 'Отправка…' : compact ? 'Отправить повторно' : 'Повторно отправить ссылку'}
      </Button>
      {onRefresh && (
        <Button type="button" variant="ghost" size="sm" onClick={event => { event.stopPropagation(); onRefresh(); }} aria-label="Обновить состояние отправки">
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />Обновить
        </Button>
      )}
    </div>
  );

  if (!state) {
    return (
      <div className="rounded-md border border-amber-300/70 bg-amber-50/60 p-3 text-sm dark:bg-amber-950/20">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Состояние отправки недоступно</p>
            <p className="mt-0.5 text-xs text-muted-foreground">История не загружена — нельзя определить, отправлялась ли ссылка.</p>
          </div>
          {onRefresh && <Button type="button" variant="ghost" size="sm" onClick={event => { event.stopPropagation(); onRefresh(); }}>Обновить</Button>}
        </div>
      </div>
    );
  }

  const summary = (
    <div className="space-y-1 text-xs">
      <p>
        {latestHistory?.legacy
          ? <>Последняя запись журнала: <strong>{latestHistory.status === 'sent' ? 'отмечена отправка' : statusText(latestHistory.status)}</strong>, {dateTime(latestHistory.at)} <span className="text-muted-foreground">(не подтверждение доставки)</span></>
          : latestAttempt
            ? <>Последняя попытка: <span className="font-medium">{statusText(latestAttempt.status)}</span>, {dateTime(latestAttempt.at)}</>
            : 'Записей о попытках нет в доступной истории'}
      </p>
      <p className="text-muted-foreground">
        Попыток за час: {state.attemptsInHour} из {state.limit}
        {countdown && <span> · Повторно через {countdown}</span>}
        {!countdown && state.retryAt && <span> · Можно после {dateTime(state.retryAt)}</span>}
      </p>
      {!state.canSend && state.reason && <p className="text-amber-800 dark:text-amber-300">{state.reason}</p>}
      {sending && <p className="flex items-center gap-1.5 text-muted-foreground"><LoaderCircle className="h-3 w-3 animate-spin" />Запрос отправляется…</p>}
    </div>
  );

  if (compact) {
    return <div className="min-w-44 space-y-2">{summary}{action}</div>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">Ссылка на оплату</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Состояние и журнал отправки</p>
        </div>
        {action}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md bg-muted/40 p-3">{summary}</div>
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium"><Clock3 className="h-4 w-4" />Недавняя история</h3>
          {!state.history?.length ? (
            <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">В доступной истории нет записей.</p>
          ) : (
            <ol className="space-y-3">
              {state.history.slice(0, 8).map(item => (
                <li key={item.id} className="rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{item.legacy ? `Старый журнал: ${item.status === 'sent' ? 'отмечена отправка' : statusText(item.status)}` : statusText(item.status)}</span>
                    <time className="text-xs text-muted-foreground">{dateTime(item.at)}</time>
                  </div>
                  {item.legacy ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {channelName(item.channel || 'канал')}: {item.error || 'Запись журнала не подтверждает доставку ссылки.'}
                      {' '}Старый журнал не является подтверждением доставки.
                    </p>
                  ) : (
                    <>
                      {item.summary?.channels?.length ? (
                        <ul className="mt-2 space-y-1">
                          {item.summary.channels.map((channel, index) => (
                            <li key={`${item.id}-${channel.channel}-${index}`} className="flex items-start gap-1.5 text-xs">
                              <span className="mt-0.5">{resultIcon(channel.status)}</span>
                              <span><strong>{channelName(channel.channel)}:</strong> {channel.status === 'sent' ? 'принято сервисом' : channel.status === 'failed' ? 'ошибка' : 'пропущено'}{channel.detail ? ` — ${channel.detail}` : ''}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {item.summary?.warning && <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">{item.summary.warning}</p>}
                      {item.error && <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{item.error}</p>}
                    </>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
