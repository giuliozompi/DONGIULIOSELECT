import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MapPin, Plus, Trash2, ChevronRight, Star, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { webApi } from '../lib/webApi';
import { useWebAuth } from '../hooks/useWebAuth';

interface Address {
  id: string; label: string; fullAddress: string; city: string;
  street?: string; building?: string; apartment?: string; postalCode?: string;
  notes?: string; isDefault: boolean; createdAt: string;
}

const addSchema = z.object({
  label: z.string().default('Дом'),
  fullAddress: z.string().min(5, 'Введите полный адрес'),
  city: z.string().min(2, 'Введите город'),
  apartment: z.string().optional(),
  postalCode: z.string().optional(),
  notes: z.string().optional(),
  isDefault: z.boolean().optional().default(false),
});

export default function WebAddressesPage() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useWebAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: addresses = [], isLoading } = useQuery({
    queryKey: ['/web-api/addresses'],
    queryFn: () => webApi.get<Address[]>('/addresses'),
    enabled: isAuthenticated,
  });

  const form = useForm({ resolver: zodResolver(addSchema), defaultValues: { label: 'Дом', fullAddress: '', city: '', isDefault: false } });

  const addMutation = useMutation({
    mutationFn: (data: z.infer<typeof addSchema>) => webApi.post<Address>('/addresses', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/web-api/addresses'] });
      setDialogOpen(false);
      form.reset({ label: 'Дом', fullAddress: '', city: '', isDefault: false });
      toast({ title: 'Адрес добавлен' });
    },
    onError: (e) => toast({ title: e instanceof Error ? e.message : 'Ошибка', variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => webApi.delete<void>(`/addresses/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/web-api/addresses'] });
      toast({ title: 'Адрес удалён' });
    },
  });

  if (!isAuthenticated) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Адреса доставки</h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setLocation('/web/account')}>
            <ChevronRight className="w-4 h-4 rotate-180 mr-1" /> Аккаунт
          </Button>
          <Button size="sm" className="bg-amber-600 text-white" onClick={() => setDialogOpen(true)} data-testid="button-add-address">
            <Plus className="w-4 h-4 mr-1" /> Добавить
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1,2].map(i => <div key={i} className="bg-white rounded-xl border border-neutral-200 h-24 animate-pulse" />)}
        </div>
      ) : addresses.length === 0 ? (
        <div className="text-center py-16">
          <MapPin className="w-12 h-12 mx-auto text-neutral-200 mb-3" />
          <p className="font-medium text-neutral-600">Нет сохранённых адресов</p>
          <p className="text-sm text-neutral-400 mt-1 mb-6">Добавьте адрес для быстрого оформления заказа</p>
          <Button className="bg-amber-600 text-white" onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Добавить адрес
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {addresses.map(addr => (
            <div key={addr.id} className="bg-white rounded-xl border border-neutral-200 p-4 flex items-start gap-3" data-testid={`card-address-${addr.id}`}>
              <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center shrink-0 mt-0.5">
                <MapPin className="w-4 h-4 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="font-medium text-sm text-neutral-900">{addr.label}</p>
                  {addr.isDefault && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Star className="w-2.5 h-2.5" /> По умолчанию
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-neutral-600">{addr.fullAddress}</p>
                {addr.notes && <p className="text-xs text-neutral-400 mt-0.5">{addr.notes}</p>}
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-neutral-300 hover:text-red-500 shrink-0"
                onClick={() => deleteMutation.mutate(addr.id)}
                disabled={deleteMutation.isPending}
                data-testid={`button-delete-address-${addr.id}`}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add address dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Новый адрес</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(d => addMutation.mutate(d))} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="label" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Название</FormLabel>
                    <FormControl><Input {...field} placeholder="Дом, Офис..." /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="city" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Город *</FormLabel>
                    <FormControl><Input {...field} placeholder="Москва" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="fullAddress" render={({ field }) => (
                <FormItem>
                  <FormLabel>Полный адрес *</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Улица, дом, корпус, квартира" className="resize-none" rows={2} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="apartment" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Квартира / офис</FormLabel>
                    <FormControl><Input {...field} placeholder="42" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="postalCode" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Индекс</FormLabel>
                    <FormControl><Input {...field} placeholder="123456" /></FormControl>
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Комментарий</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Код домофона, этаж..." />
                  </FormControl>
                </FormItem>
              )} />
              <div className="flex gap-3 pt-1">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Отмена</Button>
                <Button type="submit" className="flex-1 bg-amber-600 text-white" disabled={addMutation.isPending}>
                  {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Сохранить'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
