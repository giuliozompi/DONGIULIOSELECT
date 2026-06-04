import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../lib/adminApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp, ShoppingCart, Users, Banknote, RotateCcw } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar,
} from 'recharts';

const RANGES = [
  { label: '7 дней', days: 7 },
  { label: '30 дней', days: 30 },
  { label: '90 дней', days: 90 },
];

function dateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function fmt(n: string | number) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(Number(n));
}

export default function AdminDashboard() {
  const [rangeIdx, setRangeIdx] = useState(1);
  const range = RANGES[rangeIdx];
  const endDate = dateStr(new Date());
  const startDate = dateStr(new Date(Date.now() - range.days * 86400000));

  const { data: summary, isLoading: loadSum } = useQuery({
    queryKey: ['/web-api/admin/analytics/summary', startDate, endDate],
    queryFn: () => adminApi.analyticsSummary(startDate, endDate),
  });
  const { data: timeseries = [], isLoading: loadTs } = useQuery({
    queryKey: ['/web-api/admin/analytics/timeseries', startDate, endDate],
    queryFn: () => adminApi.analyticsTimeseries(startDate, endDate),
  });
  const { data: topProducts = [], isLoading: loadTop } = useQuery({
    queryKey: ['/web-api/admin/analytics/top-products', startDate, endDate],
    queryFn: () => adminApi.analyticsTopProducts(startDate, endDate),
  });

  const kpis = [
    { label: 'Всего заказов', value: summary?.totalOrders ?? 0, icon: ShoppingCart, color: 'text-blue-500' },
    { label: 'Завершённых заказов', value: summary?.completedOrders ?? 0, icon: TrendingUp, color: 'text-green-500' },
    { label: 'Выручка (брутто)', value: fmt(summary?.grossRevenue ?? 0), icon: Banknote, color: 'text-emerald-500' },
    { label: 'Выручка (нетто)', value: fmt(summary?.netRevenue ?? 0), icon: Banknote, color: 'text-teal-500' },
    { label: 'Общие скидки', value: fmt(summary?.totalDiscounts ?? 0), icon: RotateCcw, color: 'text-orange-500' },
    { label: 'Брошенных корзин', value: summary?.abandonedCarts ?? 0, icon: ShoppingCart, color: 'text-red-500' },
    { label: 'Отправлено напоминаний', value: summary?.cartRemindersSent ?? 0, icon: Users, color: 'text-purple-500' },
    { label: 'Восстановление корзины', value: `${summary?.conversionRate ?? 0}%`, icon: TrendingUp, color: 'text-indigo-500' },
  ];

  const loading = loadSum || loadTs || loadTop;

  const tsData = timeseries.map((r: any) => ({
    date: r.date?.slice(5),
    Заказы: r.orders ?? 0,
    Выручка: Math.round(parseFloat(r.revenue ?? '0')),
  }));

  const topData = topProducts.slice(0, 10).map((p: any) => ({
    name: (p.productName || '').slice(0, 20),
    Количество: Math.round(p.totalQuantity ?? 0),
    Выручка: Math.round(p.totalRevenue ?? 0),
  }));

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Дашборд</h1>
        <div className="flex gap-2">
          {RANGES.map((r, i) => (
            <Button
              key={r.label}
              variant={rangeIdx === i ? 'default' : 'outline'}
              size="sm"
              onClick={() => setRangeIdx(i)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {kpis.map(k => {
              const Icon = k.icon;
              return (
                <Card key={k.label}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">{k.label}</p>
                        <p className="text-xl font-bold">{k.value}</p>
                      </div>
                      <Icon className={`h-5 w-5 shrink-0 ${k.color}`} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {tsData.length > 0 && (
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Заказы по времени</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={tsData}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="Заказы" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Выручка (₽)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={tsData}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => [`₽${v}`, 'Выручка']} />
                      <Line type="monotone" dataKey="Выручка" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}

          {topData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Топ-10 товаров</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={topData} layout="vertical" margin={{ left: 8, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="Количество" fill="hsl(var(--primary))" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {tsData.length === 0 && topData.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Нет данных за выбранный период.
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
