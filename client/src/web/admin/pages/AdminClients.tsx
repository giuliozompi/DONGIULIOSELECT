import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../lib/adminApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Search, ChevronLeft, ShoppingCart, User, Bell, MapPin, Star } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

function fmtDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmt(n: string | number) {
  return `₽${parseFloat(String(n)).toFixed(0)}`;
}

const STATUS_RU: Record<string, string> = {
  pending: 'Ожидает',
  confirmed: 'Подтверждён',
  preparing: 'Готовится',
  ready: 'Готов',
  delivering: 'Доставляется',
  delivered: 'Доставлен',
  completed: 'Завершён',
  cancelled: 'Отменён',
};

const CHANNEL_LABELS: Record<string, string> = {
  telegram: 'Telegram',
  email: 'Email',
  whatsapp: 'WhatsApp',
};

function ClientNotifPrefs({ clientId, isMasterAdmin }: { clientId: string; isMasterAdmin: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: prefs = [], isLoading } = useQuery({
    queryKey: ['/web-api/admin/clients', clientId, 'notification-prefs'],
    queryFn: () => adminApi.getClientNotifPrefs(clientId),
    enabled: isMasterAdmin,
  });

  const { data: globalSettings = [] } = useQuery({
    queryKey: ['/web-api/admin/notification-settings'],
    queryFn: () => adminApi.getChannelSettings(),
    enabled: isMasterAdmin,
  });

  const toggleMut = useMutation({
    mutationFn: ({ channel, enabled }: { channel: string; enabled: boolean }) =>
      adminApi.setClientNotifPref(clientId, channel, enabled),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['/web-api/admin/clients', clientId, 'notification-prefs'] });
      toast({
        title: vars.enabled ? 'Уведомления включены' : 'Уведомления отключены',
        description: `${CHANNEL_LABELS[vars.channel] ?? vars.channel} — ${vars.enabled ? 'возобновлены' : 'приостановлены'} для этого клиента`,
      });
    },
    onError: (e: any) => toast({ title: 'Ошибка', description: e.message, variant: 'destructive' }),
  });

  if (!isMasterAdmin) return null;

  // channel → globally enabled (default true if not found)
  const globalEnabled = (ch: string) => {
    const row = (globalSettings as any[]).find((s: any) => s.channel === ch);
    return row ? row.enabled : true;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="h-4 w-4" />
          Уведомления клиента
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {isLoading && <p className="text-sm text-muted-foreground">Загрузка...</p>}
        <div className="space-y-3">
          {['telegram', 'whatsapp', 'email'].map(ch => {
            const row = prefs.find((p: any) => p.channel === ch);
            const clientEnabled = row?.enabled ?? true;
            const isGloballyOff = !globalEnabled(ch);
            const effectivelyEnabled = !isGloballyOff && clientEnabled;
            return (
              <div key={ch} className="flex items-center justify-between gap-3">
                <div>
                  <p className={`text-sm font-medium ${isGloballyOff ? 'text-muted-foreground' : ''}`}>
                    {CHANNEL_LABELS[ch]}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isGloballyOff
                      ? 'Отключено глобально в настройках'
                      : clientEnabled
                        ? 'Уведомления активны'
                        : 'Уведомления отключены для этого клиента'}
                  </p>
                </div>
                <Switch
                  checked={effectivelyEnabled}
                  onCheckedChange={v => toggleMut.mutate({ channel: ch, enabled: v })}
                  disabled={toggleMut.isPending || isGloballyOff}
                />
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
          Canali disabilitati globalmente non possono essere attivati per singolo cliente.
        </p>
      </CardContent>
    </Card>
  );
}

export default function AdminClients() {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: checkData } = useQuery({
    queryKey: ['/web-api/admin/check'],
    queryFn: () => adminApi.check(),
  });
  const isMasterAdmin = checkData?.isMasterAdmin ?? false;

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['/web-api/admin/clients'],
    queryFn: () => adminApi.getClients(),
  });

  const { data: client, isLoading: loadClient } = useQuery({
    queryKey: ['/web-api/admin/clients', selectedId],
    queryFn: () => adminApi.getClient(selectedId!),
    enabled: !!selectedId,
  });

  const filtered = clients.filter((c: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ').toLowerCase();
    return (
      fullName.includes(q) ||
      c.firstName?.toLowerCase().includes(q) ||
      c.lastName?.toLowerCase().includes(q) ||
      c.username?.toLowerCase().includes(q) ||
      String(c.telegramId)?.includes(q) ||
      c.phone?.includes(q)
    );
  });

  if (selectedId) {
    const cl = client;
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setSelectedId(null)}><ChevronLeft className="h-5 w-5" /></Button>
          <h1 className="text-lg font-bold">Профиль клиента</h1>
        </div>

        {loadClient && <div className="text-center py-8 text-muted-foreground">Загрузка...</div>}

        {cl && (
          <>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                    <User className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">{[cl.firstName, cl.lastName].filter(Boolean).join(' ') || 'Без имени'}</p>
                    {cl.username && <p className="text-sm text-muted-foreground">@{cl.username}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-muted-foreground">Telegram ID</p><p className="font-mono">{cl.telegramId}</p></div>
                  <div><p className="text-xs text-muted-foreground">Язык</p><p>{cl.languageCode || '—'}</p></div>
                  {cl.phone && <div><p className="text-xs text-muted-foreground">Телефон</p><p>{cl.phone}</p></div>}
                  <div><p className="text-xs text-muted-foreground">Зарегистрирован</p><p>{fmtDate(cl.createdAt)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Spin-токены</p><p>{cl.spinTokens ?? 0}</p></div>
                  <div><p className="text-xs text-muted-foreground">Активен</p><p>{cl.isActive ? 'Да' : 'Нет'}</p></div>
                </div>
                {cl.email && (
                  <div className="mt-3 text-sm">
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p>{cl.email}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <ClientNotifPrefs clientId={cl.id} isMasterAdmin={isMasterAdmin} />

            {/* Addresses: saved + from orders */}
            {((cl.savedAddresses && cl.savedAddresses.length > 0) || (cl.orderAddresses && cl.orderAddresses.length > 0)) && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Адреса ({(cl.savedAddresses?.length ?? 0) + (cl.orderAddresses?.length ?? 0)})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {(cl.savedAddresses ?? []).map((a: any) => (
                      <div key={a.id} className="p-3 flex items-start gap-2">
                        <Star className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium">{a.label}</p>
                            {a.isDefault && <Badge variant="secondary" className="text-xs">По умолчанию</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground break-words">{a.fullAddress}</p>
                          {a.phone && <p className="text-xs text-muted-foreground">{a.phone}</p>}
                        </div>
                      </div>
                    ))}
                    {(cl.orderAddresses ?? []).map((a: any) => (
                      <div key={a.orderId} className="p-3 flex items-start gap-2">
                        <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-xs text-muted-foreground">
                              Заказ #{a.orderId?.slice(-6).toUpperCase()} · {fmtDate(a.date)}
                            </p>
                            {a.method && <Badge variant="outline" className="text-xs">{a.method}</Badge>}
                          </div>
                          <p className="text-sm break-words">{a.address}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {cl.orders && cl.orders.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4" />
                    Заказы ({cl.orders.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {cl.orders.map((o: any) => (
                      <div key={o.id} className="flex items-center justify-between p-3 gap-3 flex-wrap">
                        <div>
                          <p className="font-mono text-xs text-muted-foreground">#{o.id?.slice(-6).toUpperCase()}</p>
                          <p className="text-xs text-muted-foreground">{fmtDate(o.createdAt)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">{fmt(o.amount)}</p>
                          <p className="text-xs text-muted-foreground">{STATUS_RU[o.status] || o.status}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Клиенты</h1>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Поиск по имени, username, телефону..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {isLoading && <div className="text-center py-8 text-muted-foreground">Загрузка...</div>}

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium">Клиент</th>
              <th className="text-left p-3 font-medium hidden md:table-cell">Username</th>
              <th className="text-left p-3 font-medium hidden lg:table-cell">Зарегистрирован</th>
              <th className="text-center p-3 font-medium">Токены</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((c: any) => (
              <tr key={c.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setSelectedId(c.id)}>
                <td className="p-3">
                  <p className="font-medium">{[c.firstName, c.lastName].filter(Boolean).join(' ') || 'Без имени'}</p>
                  <p className="text-xs text-muted-foreground font-mono">{c.telegramId}</p>
                </td>
                <td className="p-3 hidden md:table-cell text-muted-foreground">
                  {c.username ? `@${c.username}` : '—'}
                </td>
                <td className="p-3 hidden lg:table-cell text-muted-foreground text-xs">
                  {fmtDate(c.createdAt)}
                </td>
                <td className="p-3 text-center">
                  <Badge variant="secondary">{c.spinTokens ?? 0}</Badge>
                </td>
                <td className="p-3">
                  <Button size="icon" variant="ghost"><ChevronLeft className="h-3.5 w-3.5 rotate-180" /></Button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && !isLoading && (
              <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Клиенты не найдены</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
