import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BarChart3, TrendingUp, ShoppingCart, Target, RefreshCw, AlertCircle } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface AnalyticsSummary {
  totalOrders: number;
  completedOrders: number;
  paidOrders: number;
  grossRevenue: string;
  netRevenue: string;
  totalDiscounts: string;
  totalRefunds: string;
  abandonedCarts: number;
  cartRemindersSent: number;
  cartRecoveryOrders: number;
  conversionRate: number | string;
}

interface TimeseriesData {
  snapshotDate: string;
  totalOrders: number;
  netRevenue: string;
  cartRemindersSent: number;
  cartRecoveryOrders: number;
}

interface TopProduct {
  productId: string;
  productName: string;
  totalUnitsSold: number;
  totalRevenue: string;
}

export default function AnalyticsManager() {
  const { toast } = useToast();
  const today = new Date();
  const lastWeek = new Date(today);
  lastWeek.setDate(today.getDate() - 7);

  const [startDate, setStartDate] = useState(lastWeek.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);

  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useQuery<AnalyticsSummary>({
    queryKey: ['/api/admin/analytics/summary', { startDate, endDate }],
    enabled: !!startDate && !!endDate,
  });

  const { data: timeseries, isLoading: timeseriesLoading, refetch: refetchTimeseries } = useQuery<TimeseriesData[]>({
    queryKey: ['/api/admin/analytics/timeseries', { startDate, endDate }],
    enabled: !!startDate && !!endDate,
  });

  const { data: topProducts, isLoading: topProductsLoading, refetch: refetchTopProducts } = useQuery<TopProduct[]>({
    queryKey: ['/api/admin/analytics/top-products', { startDate, endDate, limit: '10' }],
    enabled: !!startDate && !!endDate,
  });

  const backfillMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/admin/analytics/backfill', {
        method: 'POST',
        body: JSON.stringify({ startDate, endDate }),
      });
    },
    onSuccess: () => {
      toast({ title: 'Данные обновлены', description: 'Статистика за выбранный период пересчитана.' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/analytics/summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/analytics/timeseries'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/analytics/top-products'] });
    },
    onError: () => {
      toast({ title: 'Ошибка', description: 'Не удалось обновить данные.', variant: 'destructive' });
    },
  });

  const isLoading = summaryLoading || timeseriesLoading || topProductsLoading;
  const hasNoData = !isLoading && summary?.totalOrders === 0 && (!timeseries || timeseries.length === 0);

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="analytics-manager">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Аналитика</h1>
          <p className="text-muted-foreground">
            Метрики продаж и конверсии
          </p>
        </div>
        <Button
          onClick={() => backfillMutation.mutate()}
          disabled={backfillMutation.isPending}
          data-testid="button-refresh-analytics"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${backfillMutation.isPending ? 'animate-spin' : ''}`} />
          {backfillMutation.isPending ? 'Обновление...' : 'Обновить данные'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Период анализа</CardTitle>
          <CardDescription>Выберите диапазон дат для отчета</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start-date">Дата начала</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                data-testid="input-start-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">Дата окончания</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                data-testid="input-end-date"
              />
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => {
                  const last30Days = new Date();
                  last30Days.setDate(today.getDate() - 30);
                  setStartDate(last30Days.toISOString().split('T')[0]);
                  setEndDate(today.toISOString().split('T')[0]);
                }}
                data-testid="button-last-30-days"
              >
                Последние 30 дней
              </Button>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => {
                  const jan1 = new Date(today.getFullYear(), 0, 1);
                  setStartDate(jan1.toISOString().split('T')[0]);
                  setEndDate(today.toISOString().split('T')[0]);
                }}
                data-testid="button-this-year"
              >
                С начала года
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center p-12" data-testid="loading-analytics">
          <p className="text-lg text-muted-foreground">Загрузка данных...</p>
        </div>
      ) : (
        <>
          {hasNoData && (
            <Card className="border-dashed" data-testid="card-no-data-warning">
              <CardContent className="flex flex-col items-center gap-3 py-8">
                <AlertCircle className="h-8 w-8 text-muted-foreground" />
                <p className="text-muted-foreground text-center">
                  Нет данных за выбранный период. Нажмите «Обновить данные», чтобы рассчитать статистику.
                </p>
                <Button
                  onClick={() => backfillMutation.mutate()}
                  disabled={backfillMutation.isPending}
                  data-testid="button-refresh-analytics-empty"
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${backfillMutation.isPending ? 'animate-spin' : ''}`} />
                  {backfillMutation.isPending ? 'Обновление...' : 'Обновить данные'}
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card data-testid="card-total-orders">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Всего заказов</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary?.totalOrders || 0}</div>
                <p className="text-xs text-muted-foreground">
                  Оплачено: {summary?.paidOrders || 0}
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-revenue">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Выручка</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {parseFloat(summary?.netRevenue || '0').toFixed(0)} ₽
                </div>
                <p className="text-xs text-muted-foreground">
                  Брутто: {parseFloat(summary?.grossRevenue || '0').toFixed(0)} ₽
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-abandoned-carts">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Напоминания</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary?.cartRemindersSent || 0}</div>
                <p className="text-xs text-muted-foreground">
                  Восстановлено: {summary?.cartRecoveryOrders || 0}
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-conversion">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Конверсия</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {typeof summary?.conversionRate === 'number'
                    ? `${summary.conversionRate.toFixed(1)}%`
                    : `${summary?.conversionRate || 0}%`
                  }
                </div>
                <p className="text-xs text-muted-foreground">
                  Из {summary?.cartRemindersSent || 0} напоминаний
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Динамика выручки</CardTitle>
                <CardDescription>Чистая выручка по дням</CardDescription>
              </CardHeader>
              <CardContent>
                {timeseries && timeseries.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={timeseries}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="snapshotDate" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="netRevenue"
                        stroke="hsl(var(--primary))"
                        name="Выручка (₽)"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px]">
                    <p className="text-muted-foreground">Нет данных за выбранный период</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Динамика заказов</CardTitle>
                <CardDescription>Количество заказов по дням</CardDescription>
              </CardHeader>
              <CardContent>
                {timeseries && timeseries.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={timeseries}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="snapshotDate" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="totalOrders"
                        stroke="hsl(var(--primary))"
                        name="Заказы"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px]">
                    <p className="text-muted-foreground">Нет данных за выбранный период</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Топ-10 продуктов</CardTitle>
              <CardDescription>Самые продаваемые товары за период</CardDescription>
            </CardHeader>
            <CardContent>
              {topProducts && topProducts.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={topProducts} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="productName" type="category" width={150} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="totalUnitsSold" fill="hsl(var(--primary))" name="Продано (шт)" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[400px]">
                  <p className="text-muted-foreground">Нет данных за выбранный период</p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
