import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../lib/adminApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Search, Eye, Trash2, Plus, Minus, X, Percent, ChevronLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const STATUSES = [
  { value: 'all', label: 'Все' },
  { value: 'ОФОРМЛЕН', label: 'Оформлен' },
  { value: 'СОБРАН', label: 'Собран' },
  { value: 'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ', label: 'Ссылка отправлена' },
  { value: 'ОПЛАЧЕН', label: 'Оплачен' },
  { value: 'ВЫЗВАН КУРЬЕР', label: 'Курьер вызван' },
  { value: 'ПОЛУЧЕН', label: 'Получен' },
  { value: 'ВОЗВРАТ', label: 'Возврат' },
  { value: 'УДАЛЕНО', label: 'Удалён' },
];

const STATUS_COLORS: Record<string, string> = {
  'ОФОРМЛЕН': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  'СОБРАН': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'ОПЛАЧЕН': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  'ВЫЗВАН КУРЬЕР': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  'ПОЛУЧЕН': 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
  'ВОЗВРАТ': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  'УДАЛЕНО': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

function fmt(n: string | number) {
  return `₽${parseFloat(String(n)).toFixed(0)}`;
}

function fmtDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function AdminOrders() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [discountDialog, setDiscountDialog] = useState(false);
  const [discType, setDiscType] = useState('percentage');
  const [discValue, setDiscValue] = useState('');
  const [addProdDialog, setAddProdDialog] = useState(false);
  const [addProdId, setAddProdId] = useState('');
  const [addProdQty, setAddProdQty] = useState('1');

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['/web-api/admin/orders', statusFilter, search],
    queryFn: () => adminApi.getOrders(statusFilter !== 'all' ? statusFilter : undefined, search || undefined),
  });

  const { data: order, isLoading: loadOrder } = useQuery({
    queryKey: ['/web-api/admin/orders', selectedId],
    queryFn: () => adminApi.getOrder(selectedId!),
    enabled: !!selectedId,
  });

  const { data: allProducts = [] } = useQuery({
    queryKey: ['/web-api/admin/products'],
    queryFn: () => adminApi.getProducts(),
    enabled: addProdDialog,
  });

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['/web-api/admin/orders'] });
  };

  const statusMut = useMutation({
    mutationFn: ({ status }: any) => adminApi.updateOrderStatus(selectedId!, status),
    onSuccess: (updated: any) => { inv(); qc.setQueryData(['/web-api/admin/orders', selectedId], updated); toast({ title: 'Статус обновлён' }); },
    onError: (e: any) => toast({ title: 'Ошибка', description: e.message, variant: 'destructive' }),
  });

  const qtyMut = useMutation({
    mutationFn: ({ productId, newQuantity }: any) => adminApi.updateQuantity(selectedId!, productId, newQuantity),
    onSuccess: (updated: any) => { inv(); qc.setQueryData(['/web-api/admin/orders', selectedId], updated); },
    onError: (e: any) => toast({ title: 'Ошибка', description: e.message, variant: 'destructive' }),
  });

  const removeProdMut = useMutation({
    mutationFn: (productId: string) => adminApi.removeProduct(selectedId!, productId),
    onSuccess: (updated: any) => { inv(); qc.setQueryData(['/web-api/admin/orders', selectedId], updated); },
    onError: (e: any) => toast({ title: 'Ошибка', description: e.message, variant: 'destructive' }),
  });

  const discountMut = useMutation({
    mutationFn: () => adminApi.applyDiscount(selectedId!, discType, discValue),
    onSuccess: (updated: any) => { inv(); qc.setQueryData(['/web-api/admin/orders', selectedId], updated); setDiscountDialog(false); toast({ title: 'Скидка применена' }); },
    onError: (e: any) => toast({ title: 'Ошибка', description: e.message, variant: 'destructive' }),
  });

  const addProdMut = useMutation({
    mutationFn: () => {
      const product = allProducts.find((p: any) => p.id === addProdId);
      const qty = product?.unit === 'кг' ? parseFloat(addProdQty) || 0.2 : parseFloat(addProdQty) || 1;
      return adminApi.addProduct(selectedId!, addProdId, qty);
    },
    onSuccess: (updated: any) => { inv(); qc.setQueryData(['/web-api/admin/orders', selectedId], updated); setAddProdDialog(false); setAddProdId(''); setAddProdQty('1'); toast({ title: 'Товар добавлен' }); },
    onError: (e: any) => toast({ title: 'Ошибка', description: e.message, variant: 'destructive' }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteOrder(id),
    onSuccess: () => { inv(); setSelectedId(null); toast({ title: 'Заказ удалён' }); },
    onError: (e: any) => toast({ title: 'Ошибка', description: e.message, variant: 'destructive' }),
  });

  function stepQty(item: any, delta: number) {
    const isKg = item.unit === 'кг';
    const step = isKg ? 0.1 : 1;
    const min = isKg ? 0.2 : 1;
    const newQty = Math.max(min, parseFloat((item.quantity + delta * step).toFixed(1)));
    qtyMut.mutate({ productId: item.productId, newQuantity: newQty });
  }

  if (selectedId && (loadOrder || order)) {
    const o = order;
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setSelectedId(null)}><ChevronLeft className="h-5 w-5" /></Button>
          <div>
            <h1 className="text-lg font-bold">Заказ #{o?.id?.slice(-6).toUpperCase()}</h1>
            <p className="text-xs text-muted-foreground">{fmtDate(o?.createdAt)}</p>
          </div>
          {o && <Badge className={`ml-auto ${STATUS_COLORS[o.status] || ''}`}>{STATUSES.find(s => s.value === o.status)?.label || o.status}</Badge>}
        </div>

        {loadOrder && <div className="text-center py-8 text-muted-foreground">Загрузка...</div>}

        {o && (
          <>
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="font-medium text-sm">Статус заказа</p>
                  <Select value={o.status} onValueChange={status => statusMut.mutate({ status })}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.filter(s => s.value !== 'all').map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-muted-foreground text-xs">Клиент</p><p className="font-medium">{o.customerName || '—'}</p></div>
                  <div><p className="text-muted-foreground text-xs">Телефон</p><p className="font-medium">{o.customerPhone || '—'}</p></div>
                  <div><p className="text-muted-foreground text-xs">Оплата</p><p className="font-medium capitalize">{o.paymentMethod || '—'}</p></div>
                  <div><p className="text-muted-foreground text-xs">Доставка</p><p className="font-medium capitalize">{o.deliveryType || '—'}</p></div>
                  {o.deliveryAddress && <div className="col-span-2"><p className="text-muted-foreground text-xs">Адрес</p><p className="font-medium">{o.deliveryAddress}</p></div>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Товары</CardTitle>
                  <Button size="sm" variant="outline" onClick={() => setAddProdDialog(true)}><Plus className="h-3.5 w-3.5 mr-1" />Добавить</Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {(o.items || []).map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 p-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{item.productName}</p>
                        <p className="text-xs text-muted-foreground">{fmt(item.price)} / {item.unit}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button size="icon" variant="outline" onClick={() => stepQty(item, -1)} disabled={qtyMut.isPending}><Minus className="h-3 w-3" /></Button>
                        <span className="w-12 text-center text-sm font-mono">{item.quantity} {item.unit}</span>
                        <Button size="icon" variant="outline" onClick={() => stepQty(item, 1)} disabled={qtyMut.isPending}><Plus className="h-3 w-3" /></Button>
                      </div>
                      <p className="font-medium text-sm shrink-0 w-20 text-right">{fmt(parseFloat(item.price) * item.quantity)}</p>
                      <Button size="icon" variant="ghost" className="text-destructive shrink-0" onClick={() => { if (confirm('Удалить товар из заказа?')) removeProdMut.mutate(item.productId); }}><X className="h-3.5 w-3.5" /></Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Подытог</span>
                  <span>{fmt((o.items || []).reduce((s: number, i: any) => s + parseFloat(i.price) * i.quantity, 0))}</span>
                </div>
                {parseFloat(o.discount || '0') > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Скидка {o.discountType === 'percentage' ? `(${o.discountValue}%)` : '(фиксированная)'}</span>
                    <span>− {fmt(o.discount)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-bold">
                  <span>Итого</span>
                  <span>{fmt(o.amount)}</span>
                </div>
                <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => { setDiscType('percentage'); setDiscValue(''); setDiscountDialog(true); }}>
                  <Percent className="h-3.5 w-3.5 mr-1" />Применить скидку
                </Button>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button variant="destructive" size="sm" onClick={() => { if (confirm('Удалить заказ навсегда?')) deleteMut.mutate(o.id); }}>
                <Trash2 className="h-3.5 w-3.5 mr-1" />Удалить заказ
              </Button>
            </div>
          </>
        )}

        <Dialog open={discountDialog} onOpenChange={setDiscountDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Применить скидку</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label>Тип</Label>
                <Select value={discType} onValueChange={setDiscType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Процент (%)</SelectItem>
                    <SelectItem value="fixed">Фиксированный (₽)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Значение</Label>
                <Input type="number" value={discValue} onChange={e => setDiscValue(e.target.value)} placeholder={discType === 'percentage' ? 'напр. 10' : 'напр. 500'} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDiscountDialog(false)}>Отмена</Button>
              <Button onClick={() => discountMut.mutate()} disabled={!discValue || discountMut.isPending}>Применить</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={addProdDialog} onOpenChange={setAddProdDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Добавить товар</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label>Товар</Label>
                <Select value={addProdId} onValueChange={setAddProdId}>
                  <SelectTrigger><SelectValue placeholder="Выберите товар..." /></SelectTrigger>
                  <SelectContent>
                    {allProducts.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Количество</Label>
                <Input type="number" step={allProducts.find((p: any) => p.id === addProdId)?.unit === 'кг' ? '0.1' : '1'} min={allProducts.find((p: any) => p.id === addProdId)?.unit === 'кг' ? '0.2' : '1'} value={addProdQty} onChange={e => setAddProdQty(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddProdDialog(false)}>Отмена</Button>
              <Button onClick={() => addProdMut.mutate()} disabled={!addProdId || addProdMut.isPending}>Добавить</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Заказы</h1>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Поиск по имени, телефону, ID..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <div className="text-center py-8 text-muted-foreground">Загрузка...</div>}

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium">ID</th>
              <th className="text-left p-3 font-medium hidden md:table-cell">Клиент</th>
              <th className="text-left p-3 font-medium hidden md:table-cell">Дата</th>
              <th className="text-right p-3 font-medium">Сумма</th>
              <th className="text-center p-3 font-medium">Статус</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {orders.map((o: any) => (
              <tr key={o.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setSelectedId(o.id)}>
                <td className="p-3 font-mono text-xs">{o.id?.slice(-6).toUpperCase()}</td>
                <td className="p-3 hidden md:table-cell">{o.customerName || '—'}</td>
                <td className="p-3 hidden md:table-cell text-muted-foreground text-xs">{fmtDate(o.createdAt)}</td>
                <td className="p-3 text-right font-medium">{fmt(o.amount)}</td>
                <td className="p-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[o.status] || 'bg-muted text-muted-foreground'}`}>
                    {STATUSES.find(s => s.value === o.status)?.label || o.status}
                  </span>
                </td>
                <td className="p-3">
                  <Button size="icon" variant="ghost" onClick={e => { e.stopPropagation(); setSelectedId(o.id); }}><Eye className="h-3.5 w-3.5" /></Button>
                </td>
              </tr>
            ))}
            {orders.length === 0 && !isLoading && (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Заказы не найдены</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
