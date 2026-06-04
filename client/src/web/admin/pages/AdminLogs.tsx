import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../lib/adminApi';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';

function fmtDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

const EVENT_LABELS: Record<string, string> = {
  order_created: 'Новый заказ',
  order_paid: 'Оплата',
  status_change: 'Смена статуса',
  payment_link: 'Ссылка оплаты',
};

const CHANNEL_COLORS: Record<string, string> = {
  telegram: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  email: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  whatsapp: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
};

const RECIPIENT_LABELS: Record<string, string> = {
  customer: 'клиенту',
  managers: 'менеджерам',
};

function ActionLogsTab() {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['/web-api/admin/action-logs'],
    queryFn: () => adminApi.getActionLogs(),
  });

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">Загрузка...</div>;

  return (
    <div className="space-y-2 mt-3">
      {logs.length === 0 && <p className="text-center py-8 text-muted-foreground">Логи не найдены</p>}
      {logs.map((log: any) => (
        <Card key={log.id}>
          <CardContent className="p-3">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs shrink-0">{log.action}</Badge>
                  <span className="text-xs text-muted-foreground shrink-0">{fmtDate(log.createdAt)}</span>
                </div>
                {log.entityType && (
                  <p className="text-xs mt-1 text-muted-foreground">
                    {log.entityType} {log.entityId ? `#${String(log.entityId).slice(-6)}` : ''}
                  </p>
                )}
                {log.details && (
                  <p className="text-xs mt-1 text-foreground/70 font-mono break-all">
                    {typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}
                  </p>
                )}
              </div>
              <div className="text-xs text-muted-foreground shrink-0">
                {log.adminUserId ? `Адм.: ${String(log.adminUserId).slice(-6)}` : ''}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function OrderNotifLogsTab() {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['/web-api/admin/notification-logs/order'],
    queryFn: () => adminApi.getOrderNotifLogs(),
  });

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">Загрузка...</div>;

  return (
    <div className="space-y-2 mt-3">
      {logs.length === 0 && <p className="text-center py-8 text-muted-foreground">Логи не найдены</p>}
      {logs.map((log: any, i: number) => {
        const isFailed = log.status === 'failed';
        return (
          <Card key={log.id || i} className={isFailed ? 'border-destructive/30' : ''}>
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0 flex-1 space-y-1.5">
                  {/* Row 1: channel badge + event + recipient + time */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${CHANNEL_COLORS[log.channel] || 'bg-muted text-muted-foreground'}`}>
                      {log.channel}
                    </span>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {EVENT_LABELS[log.event] || log.event}
                    </Badge>
                    {log.recipient && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        → {RECIPIENT_LABELS[log.recipient] || log.recipient}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground shrink-0">{fmtDate(log.sentAt)}</span>
                  </div>

                  {/* Row 2: order + customer info */}
                  <div className="flex items-center gap-3 flex-wrap">
                    {log.orderId && (
                      <span className="text-xs text-muted-foreground">
                        Заказ #{String(log.orderId).slice(-6).toUpperCase()}
                      </span>
                    )}
                    {log.customerName && (
                      <span className="text-xs text-muted-foreground">{log.customerName}</span>
                    )}
                    {log.customerPhone && (
                      <span className="text-xs text-muted-foreground font-mono">{log.customerPhone}</span>
                    )}
                  </div>

                  {/* Row 3: error details (only when failed and details is an error string) */}
                  {isFailed && log.details && !['pending', 'confirmed', 'preparing', 'ready', 'delivering', 'delivered', 'completed', 'cancelled'].includes(log.details) && (
                    <p className="text-xs text-destructive bg-destructive/5 rounded px-2 py-1 font-mono break-all">
                      {log.details}
                    </p>
                  )}

                  {/* Row 3b: details when it's a status or amount (not an error) */}
                  {log.details && (isFailed ? ['pending', 'confirmed', 'preparing', 'ready', 'delivering', 'delivered', 'completed', 'cancelled'].includes(log.details) : true) && !isFailed && log.details && (
                    <p className="text-xs text-muted-foreground">
                      {log.details}
                    </p>
                  )}
                </div>

                {/* Status badge */}
                <Badge
                  variant={isFailed ? 'destructive' : 'default'}
                  className="text-xs shrink-0"
                >
                  {isFailed ? 'Ошибка' : 'OK'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default function AdminLogs() {
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Системные логи</h1>
      <Tabs defaultValue="actions">
        <TabsList>
          <TabsTrigger value="actions">Действия адм.</TabsTrigger>
          <TabsTrigger value="notifications">Уведомления заказов</TabsTrigger>
        </TabsList>
        <TabsContent value="actions"><ActionLogsTab /></TabsContent>
        <TabsContent value="notifications"><OrderNotifLogsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
