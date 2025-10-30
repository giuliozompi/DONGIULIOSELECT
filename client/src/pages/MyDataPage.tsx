import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useTelegramBackButton } from '@/hooks/useTelegramBackButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, Save, User as UserIcon, MapPin } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import type { User } from '@shared/schema';

export default function MyDataPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const { data: user, isLoading } = useQuery<User>({
    queryKey: ['/api/user']
  });

  const [formData, setFormData] = useState({
    customerName: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    building: '',
    apartment: '',
    addressNotes: ''
  });

  // Update form when user data loads
  useEffect(() => {
    if (user) {
      setFormData({
        customerName: user.customerName || '',
        phone: user.phone || '',
        email: user.email || '',
        address: user.address || '',
        city: user.city || '',
        building: user.building || '',
        apartment: user.apartment || '',
        addressNotes: user.addressNotes || ''
      });
    }
  }, [user]);

  useTelegramBackButton(() => {
    setLocation('/lk');
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { 
      customerName?: string | null; 
      phone?: string | null; 
      email?: string | null;
      address?: string | null;
      city?: string | null;
      building?: string | null;
      apartment?: string | null;
      addressNotes?: string | null;
    }) => {
      return await apiRequest('PUT', '/api/user', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      toast({
        title: 'Данные сохранены',
        description: 'Ваша информация успешно обновлена'
      });
    },
    onError: () => {
      toast({
        title: 'Ошибка',
        description: 'Не удалось сохранить данные',
        variant: 'destructive'
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Normalizza campi vuoti a null per permettere la cancellazione nel DB
    const normalizedData = {
      customerName: formData.customerName.trim() || null,
      phone: formData.phone.trim() || null,
      email: formData.email.trim() || null,
      address: formData.address.trim() || null,
      city: formData.city.trim() || null,
      building: formData.building.trim() || null,
      apartment: formData.apartment.trim() || null,
      addressNotes: formData.addressNotes.trim() || null,
    };
    
    updateMutation.mutate(normalizedData);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 bg-background">
      <div className="sticky top-0 z-40 bg-background border-b">
        <div className="flex items-center gap-3 p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation('/lk')}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold" data-testid="text-page-title">Мои данные</h1>
        </div>
      </div>

      <div className="p-4">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-primary/10">
                <UserIcon className="w-6 h-6 text-primary" />
              </div>
              <div>
                <CardTitle>Личная информация</CardTitle>
                <CardDescription>Управляйте вашими контактными данными</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="telegram-info">Telegram</Label>
                <div className="p-3 rounded-md bg-muted" data-testid="text-telegram-info">
                  {user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.username || 'Не указано'}
                  {user?.username && <span className="text-muted-foreground ml-2">@{user.username}</span>}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="customerName">Полное имя</Label>
                <Input
                  id="customerName"
                  type="text"
                  placeholder="Введите ваше имя"
                  value={formData.customerName}
                  onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                  data-testid="input-customer-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Телефон</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+7 (___) ___-__-__"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  data-testid="input-phone"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="example@email.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  data-testid="input-email"
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={updateMutation.isPending}
                data-testid="button-save"
              >
                <Save className="w-4 h-4 mr-2" />
                {updateMutation.isPending ? 'Сохранение...' : 'Сохранить'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-primary/10">
                <MapPin className="w-6 h-6 text-primary" />
              </div>
              <div>
                <CardTitle>Адрес доставки</CardTitle>
                <CardDescription>Сохраните адрес для быстрого оформления заказов</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="address">Улица и номер дома</Label>
                  <Input
                    id="address"
                    type="text"
                    placeholder="ул. Ленина, д. 10"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    data-testid="input-address"
                  />
                </div>

                <div className="col-span-2 space-y-2">
                  <Label htmlFor="city">Город</Label>
                  <Input
                    id="city"
                    type="text"
                    placeholder="Москва"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    data-testid="input-city"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="building">Корпус/Строение</Label>
                  <Input
                    id="building"
                    type="text"
                    placeholder="к. 1"
                    value={formData.building}
                    onChange={(e) => setFormData({ ...formData, building: e.target.value })}
                    data-testid="input-building"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="apartment">Квартира</Label>
                  <Input
                    id="apartment"
                    type="text"
                    placeholder="кв. 25"
                    value={formData.apartment}
                    onChange={(e) => setFormData({ ...formData, apartment: e.target.value })}
                    data-testid="input-apartment"
                  />
                </div>

                <div className="col-span-2 space-y-2">
                  <Label htmlFor="addressNotes">Примечания</Label>
                  <Textarea
                    id="addressNotes"
                    placeholder="Этаж, домофон, подъезд..."
                    value={formData.addressNotes}
                    onChange={(e) => setFormData({ ...formData, addressNotes: e.target.value })}
                    rows={3}
                    data-testid="input-address-notes"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={updateMutation.isPending}
                data-testid="button-save-address"
              >
                <Save className="w-4 h-4 mr-2" />
                {updateMutation.isPending ? 'Сохранение...' : 'Сохранить адрес'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
