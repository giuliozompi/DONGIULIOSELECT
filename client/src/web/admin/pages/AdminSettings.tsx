import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../lib/adminApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Shield, MapPin, Link2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

function AdminsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [isMaster, setIsMaster] = useState(false);
  const [dialog, setDialog] = useState(false);

  const { data: admins = [], isLoading } = useQuery({
    queryKey: ['/web-api/admin/admins'],
    queryFn: () => adminApi.getAdmins(),
  });

  const promoteMut = useMutation({
    mutationFn: () => adminApi.promoteAdmin(email, isMaster),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/web-api/admin/admins'] });
      setDialog(false); setEmail(''); setIsMaster(false);
      toast({ title: 'Администратор добавлен' });
    },
    onError: (e: any) => toast({ title: 'Ошибка', description: e.message, variant: 'destructive' }),
  });

  const demoteMut = useMutation({
    mutationFn: (id: string) => adminApi.demoteAdmin(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/web-api/admin/admins'] }); toast({ title: 'Администратор удалён' }); },
    onError: (e: any) => toast({ title: 'Ошибка', description: e.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-4 mt-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setDialog(true)}><Plus className="h-4 w-4 mr-1" />Добавить адм.</Button>
      </div>

      {isLoading && <div className="text-center py-6 text-muted-foreground">Загрузка...</div>}

      <div className="space-y-2">
        {admins.map((a: any) => (
          <Card key={a.id}>
            <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <Shield className={`h-4 w-4 shrink-0 ${a.isMasterAdmin ? 'text-yellow-500' : 'text-primary'}`} />
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{[a.firstName, a.lastName].filter(Boolean).join(' ') || a.email}</p>
                  <p className="text-xs text-muted-foreground truncate">{a.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {a.isMasterAdmin && <Badge>Master</Badge>}
                <Button size="icon" variant="ghost" className="text-destructive" onClick={() => { if (confirm('Удалить доступ администратора?')) demoteMut.mutate(a.id); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {admins.length === 0 && !isLoading && <p className="text-center py-6 text-muted-foreground">Нет администраторов</p>}
      </div>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Добавить администратора</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Email (зарегистрированный пользователь)</Label>
              <Input type="email" placeholder="имя@пример.com" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={isMaster} onCheckedChange={setIsMaster} />
              <Label>Master Admin (может удалять заказы и управлять администраторами)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>Отмена</Button>
            <Button onClick={() => promoteMut.mutate()} disabled={!email || promoteMut.isPending}>
              {promoteMut.isPending ? 'Сохранение...' : 'Добавить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const ADDR_EMPTY = { label: '', fullAddress: '', city: '', contactName: '', contactPhone: '', isDefault: false };

function PickupAddressesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<{ open: boolean; editing: any | null }>({ open: false, editing: null });
  const [form, setForm] = useState<any>(ADDR_EMPTY);

  const { data: addresses = [], isLoading } = useQuery({
    queryKey: ['/web-api/admin/pickup-addresses'],
    queryFn: () => adminApi.getPickupAddresses(),
  });

  const inv = () => qc.invalidateQueries({ queryKey: ['/web-api/admin/pickup-addresses'] });

  const saveMut = useMutation({
    mutationFn: (d: any) => dialog.editing ? adminApi.updatePickupAddress(dialog.editing.id, d) : adminApi.createPickupAddress(d),
    onSuccess: () => { inv(); setDialog({ open: false, editing: null }); toast({ title: 'Адрес сохранён' }); },
    onError: (e: any) => toast({ title: 'Ошибка', description: e.message, variant: 'destructive' }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deletePickupAddress(id),
    onSuccess: () => { inv(); toast({ title: 'Адрес удалён' }); },
    onError: (e: any) => toast({ title: 'Ошибка', description: e.message, variant: 'destructive' }),
  });

  function openDialog(addr?: any) {
    setForm(addr ? { label: addr.label || '', fullAddress: addr.fullAddress || '', city: addr.city || '', contactName: addr.contactName || '', contactPhone: addr.contactPhone || '', isDefault: addr.isDefault ?? false } : ADDR_EMPTY);
    setDialog({ open: true, editing: addr || null });
  }
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4 mt-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => openDialog()}><Plus className="h-4 w-4 mr-1" />Новый адрес</Button>
      </div>

      {isLoading && <div className="text-center py-6 text-muted-foreground">Загрузка...</div>}

      <div className="space-y-2">
        {addresses.map((a: any) => (
          <Card key={a.id}>
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary shrink-0" />
                    <p className="font-medium text-sm">{a.label}</p>
                    {a.isDefault && <Badge variant="default" className="text-xs">Основной</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 ml-6">{a.fullAddress}</p>
                  {a.contactName && <p className="text-xs text-muted-foreground ml-6">Контакт: {a.contactName} {a.contactPhone}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => openDialog(a)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => { if (confirm('Удалить?')) deleteMut.mutate(a.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {addresses.length === 0 && !isLoading && <p className="text-center py-6 text-muted-foreground">Нет адресов</p>}
      </div>

      <Dialog open={dialog.open} onOpenChange={v => !v && setDialog({ open: false, editing: null })}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{dialog.editing ? 'Редактировать адрес' : 'Новый адрес'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Название</Label><Input value={form.label} onChange={e => set('label', e.target.value)} placeholder="напр. Главный склад" /></div>
            <div className="space-y-1.5"><Label>Полный адрес</Label><Input value={form.fullAddress} onChange={e => set('fullAddress', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Город</Label><Input value={form.city} onChange={e => set('city', e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Имя контакта</Label><Input value={form.contactName} onChange={e => set('contactName', e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Телефон контакта</Label><Input value={form.contactPhone} onChange={e => set('contactPhone', e.target.value)} /></div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.isDefault} onCheckedChange={v => set('isDefault', v)} />
              <Label>Основной адрес</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false, editing: null })}>Отмена</Button>
            <Button onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}>{saveMut.isPending ? 'Сохранение...' : 'Сохранить'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AssociationsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');

  const { data: assocs = [], isLoading: loadAssocs } = useQuery({
    queryKey: ['/web-api/admin/product-associations'],
    queryFn: () => adminApi.getAssociations(),
  });
  const { data: products = [] } = useQuery({
    queryKey: ['/web-api/admin/products'],
    queryFn: () => adminApi.getProducts(),
  });

  const inv = () => qc.invalidateQueries({ queryKey: ['/web-api/admin/product-associations'] });

  const createMut = useMutation({
    mutationFn: () => adminApi.createAssociation(sourceId, targetId),
    onSuccess: () => { inv(); setSourceId(''); setTargetId(''); toast({ title: 'Связь создана' }); },
    onError: (e: any) => toast({ title: 'Ошибка', description: e.message, variant: 'destructive' }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteAssociation(id),
    onSuccess: () => inv(),
  });

  const prodName = (id: string) => products.find((p: any) => p.id === id)?.name || id;

  return (
    <div className="space-y-4 mt-3">
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-medium">Новая связь</p>
          <div className="grid grid-cols-2 gap-2">
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger><SelectValue placeholder="Исходный товар" /></SelectTrigger>
              <SelectContent>{products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger><SelectValue placeholder="Связанный товар" /></SelectTrigger>
              <SelectContent>{products.filter((p: any) => p.id !== sourceId).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={() => createMut.mutate()} disabled={!sourceId || !targetId || createMut.isPending} className="w-full">
            <Link2 className="h-4 w-4 mr-1" />Создать связь
          </Button>
        </CardContent>
      </Card>

      {loadAssocs && <div className="text-center py-6 text-muted-foreground">Загрузка...</div>}

      <div className="space-y-2">
        {assocs.map((a: any) => (
          <div key={a.id} className="flex items-center justify-between gap-2 p-3 border rounded-md">
            <div className="flex items-center gap-2 min-w-0 text-sm">
              <span className="truncate font-medium">{prodName(a.sourceProductId)}</span>
              <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate text-muted-foreground">{prodName(a.targetProductId)}</span>
            </div>
            <Button size="icon" variant="ghost" className="text-destructive shrink-0" onClick={() => deleteMut.mutate(a.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        ))}
        {assocs.length === 0 && !loadAssocs && <p className="text-center py-6 text-muted-foreground">Нет связей</p>}
      </div>
    </div>
  );
}

export default function AdminSettings() {
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Настройки</h1>
      <Tabs defaultValue="admins">
        <TabsList>
          <TabsTrigger value="admins">Администраторы</TabsTrigger>
          <TabsTrigger value="addresses">Адреса самовывоза</TabsTrigger>
          <TabsTrigger value="associations">Связанные товары</TabsTrigger>
        </TabsList>
        <TabsContent value="admins"><AdminsTab /></TabsContent>
        <TabsContent value="addresses"><PickupAddressesTab /></TabsContent>
        <TabsContent value="associations"><AssociationsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
