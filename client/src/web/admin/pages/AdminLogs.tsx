import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../lib/adminApi';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';

function fmtDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

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
      {logs.map((log: any, i: number) => (
        <Card key={i}>
          <CardContent className="p-3">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs shrink-0">{log.notificationType || log.eventType}</Badge>
                  {log.channel && <Badge variant="secondary" className="text-xs shrink-0">{log.channel}</Badge>}
                  <span className="text-xs text-muted-foreground">{fmtDate(log.sentAt)}</span>
                </div>
                {log.orderId && <p className="text-xs mt-1 text-muted-foreground">Заказ #{String(log.orderId).slice(-6)}</p>}
                {log.errorMessage && <p className="text-xs mt-1 text-destructive">{log.errorMessage}</p>}
              </div>
              <Badge variant={log.success ? 'default' : 'destructive'} className="text-xs shrink-0">
                {log.success ? 'OK' : 'Ошибка'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))}
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
