import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MapPin, Plus, Trash2, ChevronRight, Star, Loader2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { webApi } from '../lib/webApi';
import { useWebAuth } from '../hooks/useWebAuth';
import { AddressAutocomplete, type AddressSuggestion } from '@/components/AddressAutocomplete';
import type { SavedAddress as Address } from '../lib/savedAddresses';
import { savedDeliveryAddress } from '../lib/savedAddresses';

const addSchema = z.object({
  label: z.string().default('Дом'),
  fullAddress: z.string().min(5, 'Введите полный адрес'),
  city: z.string().min(2, 'Введите город'),
  street: z.string().optional(),
  building: z.string().optional(),
  apartment: z.string().optional(),
  postalCode: z.string().optional(),
  notes: z.string().optional(),
  isDefault: z.boolean().optional().default(false),
});

export default function WebAddressesPage() {
  const { user, isAuthenticated } = useWebAuth();
  // An account change discards dialogs, pending UI and references together.
  return isAuthenticated && user ? <AddressBook key={user.id} userId={user.id} /> : null;
}

function AddressBook({ userId }: { userId: string }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [deletingAddress, setDeletingAddress] = useState<Address | null>(null);
  const deleteTrigger = useRef<HTMLButtonElement | null>(null);
  const deleteInFlight = useRef(false);
  const selectedAddress = useRef<AddressSuggestion | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const { data: addresses = [], isLoading } = useQuery({
    queryKey: ['/web-api/addresses', userId],
    queryFn: () => webApi.get<Address[]>('/addresses'),
  });

  const form = useForm<z.infer<typeof addSchema>>({
    resolver: zodResolver(addSchema),
    defaultValues: {
      label: 'Дом', fullAddress: '', city: '', street: '', building: '',
      apartment: '', postalCode: '', notes: '', isDefault: false,
    },
  });

  const updateAddress = (value: string, suggestion?: AddressSuggestion) => {
    form.setValue('fullAddress', value, { shouldDirty: true, shouldValidate: true });
    if (suggestion || selectedAddress.current || editingAddress) {
      // Changing selected text invalidates its extracted fields. Never save the
      // previous city's/street's metadata alongside a different manual address.
      const fields = {
        city: suggestion?.city || '',
        street: suggestion?.street || '',
        building: suggestion?.building || '',
        postalCode: suggestion?.postalCode || '',
      };
      for (const key of ['city', 'street', 'building', 'postalCode'] as const) {
        form.setValue(key, fields[key], { shouldDirty: true, shouldValidate: true });
      }
      if (suggestion?.flat) {
        form.setValue('apartment', suggestion.flat, { shouldDirty: true });
      } else if (!editingAddress) {
        // New addresses have no independent, previously saved apartment to keep.
        form.setValue('apartment', '', { shouldDirty: true });
      }
    }
    selectedAddress.current = suggestion || null;
  };

  const saveMutation = useMutation({
    mutationFn: ({ data, id }: { data: z.infer<typeof addSchema>; id?: string }) =>
      id ? webApi.patch<Address>(`/addresses/${id}`, data) : webApi.post<Address>('/addresses', data),
    onSuccess: (_address, { id }) => {
      qc.invalidateQueries({ queryKey: ['/web-api/addresses'] });
      setDialogOpen(false);
      form.reset();
      selectedAddress.current = null;
      setEditingAddress(null);
      toast({ title: id ? 'Адрес обновлён' : 'Адрес добавлен' });
    },
    onError: (e) => toast({ title: e instanceof Error ? e.message : 'Ошибка', variant: 'destructive' }),
  });

  const openAddress = (address?: Address) => {
    selectedAddress.current = null;
    setEditingAddress(address ?? null);
    form.reset(address ? {
      label: address.label, fullAddress: address.fullAddress, city: address.city,
      street: address.street ?? '', building: address.building ?? '',
      apartment: address.apartment ?? '', postalCode: address.postalCode ?? '',
      notes: address.notes ?? '', isDefault: address.isDefault,
    } : {
      label: 'Дом', fullAddress: '', city: '', street: '', building: '',
      apartment: '', postalCode: '', notes: '', isDefault: false,
    });
    setDialogOpen(true);
  };

  const closeDialog = (open: boolean) => {
    if (saveMutation.isPending) return;
    setDialogOpen(open);
    if (!open) {
      form.reset();
      selectedAddress.current = null;
      setEditingAddress(null);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => webApi.delete<void>(`/addresses/${id}`),
    onSuccess: () => {
      // The request may finish after this owner's page has been replaced.
      qc.invalidateQueries({ queryKey: ['/web-api/addresses', userId], exact: true });
      if (!mounted.current) return;
      setDeletingAddress(null);
      toast({ title: 'Адрес удалён' });
    },
    onSettled: () => { deleteInFlight.current = false; },
  });

  const closeDeleteDialog = (open: boolean) => {
    if (open || deleteInFlight.current) return;
    setDeletingAddress(null);
  };

  const confirmDelete = () => {
    if (!deletingAddress || deleteInFlight.current) return;
    // Lock synchronously, before React renders the pending state.
    deleteInFlight.current = true;
    deleteMutation.mutate(deletingAddress.id);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Адреса доставки</h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setLocation('/web/account')}>
            <ChevronRight className="w-4 h-4 rotate-180 mr-1" /> Аккаунт
          </Button>
          <Button size="sm" className="bg-amber-600 text-white" onClick={() => openAddress()} data-testid="button-add-address">
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
          <Button className="bg-amber-600 text-white" onClick={() => openAddress()}>
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
                className="h-8 w-8 text-neutral-500 shrink-0"
                onClick={() => openAddress(addr)}
                aria-label={`Изменить адрес: ${addr.label}`}
                data-testid={`button-edit-address-${addr.id}`}
              >
                <Pencil className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-neutral-300 hover:text-red-500 shrink-0"
                onClick={event => {
                  deleteTrigger.current = event.currentTarget;
                  deleteMutation.reset();
                  setDeletingAddress(addr);
                }}
                disabled={deleteMutation.isPending}
                aria-label={`Удалить адрес: ${addr.label}`}
                data-testid={`button-delete-address-${addr.id}`}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!deletingAddress} onOpenChange={closeDeleteDialog}>
        <AlertDialogContent
          aria-busy={deleteMutation.isPending}
          onCloseAutoFocus={event => {
            event.preventDefault();
            if (deleteTrigger.current?.isConnected) deleteTrigger.current.focus();
            else document.querySelector<HTMLButtonElement>('[data-testid="button-add-address"]')?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить адрес?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingAddress && <>
                <span className="block font-medium">{deletingAddress.label}</span>
                <span className="block">{savedDeliveryAddress(deletingAddress)}</span>
              </>}
              <span className="block mt-2">Адрес будет удалён из списка сохранённых адресов.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteMutation.isError && (
            <p role="alert" className="text-sm text-red-600">
              {deleteMutation.error instanceof Error
                ? deleteMutation.error.message : 'Не удалось удалить адрес. Попробуйте ещё раз.'}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending} data-testid="button-cancel-delete-address">
              Отмена
            </AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete-address"
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />}
              {deleteMutation.isPending ? 'Удаление…' : 'Удалить'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAddress ? 'Изменить адрес' : 'Новый адрес'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(data => saveMutation.mutate({ data, id: editingAddress?.id }))} className="space-y-4">
              <fieldset disabled={saveMutation.isPending} className="space-y-4">
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
                    <FormControl><Input {...field} placeholder="Москва" data-testid="input-address-city" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="fullAddress" render={({ field }) => (
                <FormItem>
                  <FormLabel>Полный адрес *</FormLabel>
                  <FormControl>
                    <AddressAutocomplete
                      ref={field.ref}
                      value={field.value}
                      onChange={updateAddress}
                      onBlur={field.onBlur}
                      placeholder="Начните вводить город, улицу и дом"
                      testId="input-saved-address"
                      suggestOnFocus={!!editingAddress}
                    />
                  </FormControl>
                  <p className="text-xs text-neutral-500">
                    Выберите подсказку DaData: город, улица, дом и индекс заполнятся автоматически.
                    Если подсказок нет, заполните адрес и город вручную.
                    {editingAddress && ' Чтобы уточнить сохранённый адрес, нажмите на него и выберите подсказку. Изменения применятся только после сохранения.'}
                  </p>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="apartment" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Квартира / офис</FormLabel>
                    <FormControl><Input {...field} placeholder="42" data-testid="input-address-apartment" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="postalCode" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Индекс</FormLabel>
                    <FormControl><Input {...field} placeholder="123456" data-testid="input-address-postal-code" /></FormControl>
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Комментарий</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Код домофона, этаж..." data-testid="input-address-notes" />
                  </FormControl>
                </FormItem>
              )} />
              <div className="flex gap-3 pt-1">
                <Button type="button" variant="outline" className="flex-1" onClick={() => closeDialog(false)} data-testid="button-cancel-address">Отмена</Button>
                <Button type="submit" className="flex-1 bg-amber-600 text-white" disabled={saveMutation.isPending} data-testid="button-save-address">
                  {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Сохранить'}
                </Button>
              </div>
              </fieldset>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
