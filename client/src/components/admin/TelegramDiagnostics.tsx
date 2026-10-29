import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { TelegramDiagnosticCategory, TelegramDiagnosticResult } from '@shared/telegram-diagnostics';

const labels: Record<TelegramDiagnosticCategory, string> = {
  ok: 'Соединение установлено',
  dns: 'Ошибка DNS',
  tls: 'Ошибка защищённого соединения TLS',
  timeout: 'Истекло время ожидания',
  refused: 'Соединение прервано или запрос отклонён',
  invalid_token: 'Недействительный токен бота',
  not_configured: 'Токен бота не настроен',
  invalid_response: 'Некорректный ответ Telegram',
  unavailable: 'Не удалось проверить соединение',
};

export function TelegramDiagnostics({ run }: { run: () => Promise<TelegramDiagnosticResult> }) {
  const locked = useRef(false);
  const [running, setRunning] = useState(false);
  const probe = useMutation({ mutationFn: run, retry: false });
  const check = async () => {
    if (locked.current) return;
    locked.current = true;
    setRunning(true);
    try {
      probe.reset();
      await probe.mutateAsync();
    } catch {
      // Show only fixed local copy, never a raw response or exception.
    } finally {
      locked.current = false;
      setRunning(false);
    }
  };
  return (
    <Card>
      <CardHeader><CardTitle>Соединение с Telegram</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Ручная проверка getMe с сервера, который обслуживает эту страницу. Сообщения клиентам не отправляются.
          Для проверки Timeweb откройте админ-панель сайта на Timeweb. Результат из workspace не проверяет Timeweb.
        </p>
        <Button onClick={check} disabled={running} data-testid="button-telegram-diagnostics">
          {running ? 'Проверка...' : 'Проверить соединение'}
        </Button>
        <div role="status" aria-live="polite" aria-busy={running} className="text-sm">
          {!running && probe.data && (
            <p>{labels[probe.data.category] ?? labels.unavailable} · {probe.data.durationMs} мс</p>
          )}
          {!running && probe.isError && <p>Проверка недоступна. Проверьте авторизацию и соединение с сервером и повторите вручную.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
