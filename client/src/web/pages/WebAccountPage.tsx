import { useState } from 'react';
import { useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { User, Mail, Phone, Lock, LogOut, ChevronRight, Package, MapPin, Heart, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useWebAuth } from '../hooks/useWebAuth';

const profileSchema = z.object({
  firstName: z.string().min(1, 'Введите имя').max(50),
  lastName: z.string().max(50).optional(),
  phone: z.string().optional(),
});

export default function WebAccountPage() {
  const [, setLocation] = useLocation();
  const { user, logout, updateProfile } = useWebAuth();
  const { toast } = useToast();
  const [saved, setSaved] = useState(false);

  const form = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      phone: user?.phone || '',
    },
  });

  const handleSave = async (data: z.infer<typeof profileSchema>) => {
    try {
      await updateProfile(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast({ title: 'Профиль обновлён' });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Ошибка', variant: 'destructive' });
    }
  };

  const handleLogout = async () => {
    await logout();
    setLocation('/web');
  };

  if (!user) return null;

  const menuItems = [
    { icon: Package, label: 'Мои заказы', href: '/web/account/orders' },
    { icon: Heart, label: 'Избранное', href: '/web/wishlist' },
    { icon: MapPin, label: 'Адреса доставки', href: '/web/account/addresses' },
    { icon: Lock, label: 'Безопасность', href: '/web/account/security' },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-neutral-900 mb-6">Личный кабинет</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Sidebar */}
        <div className="md:col-span-1 space-y-3">
          {/* Profile card */}
          <div className="bg-white rounded-xl border border-neutral-200 p-4 flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={user.avatar || undefined} />
              <AvatarFallback className="bg-amber-100 text-amber-800 font-semibold">
                {user.firstName[0]}{user.lastName?.[0] || ''}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="font-semibold text-sm text-neutral-900 truncate">{user.firstName} {user.lastName}</p>
              <p className="text-xs text-neutral-500 truncate">{user.email}</p>
            </div>
          </div>

          {/* Nav */}
          <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
            {menuItems.map((item, i) => (
              <button
                key={item.href}
                onClick={() => setLocation(item.href)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors text-left ${i > 0 ? 'border-t border-neutral-100' : ''}`}
              >
                <item.icon className="w-4 h-4 text-neutral-400 shrink-0" />
                <span className="flex-1">{item.label}</span>
                <ChevronRight className="w-4 h-4 text-neutral-300" />
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            className="w-full text-red-600 border-red-200 hover:bg-red-50"
            onClick={handleLogout}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4 mr-2" /> Выйти
          </Button>
        </div>

        {/* Main — profile edit */}
        <div className="md:col-span-2">
          <div className="bg-white rounded-xl border border-neutral-200 p-6">
            <h2 className="font-semibold text-neutral-900 mb-4 flex items-center gap-2">
              <User className="w-4 h-4 text-neutral-400" /> Личные данные
            </h2>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField control={form.control} name="firstName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Имя *</FormLabel>
                      <FormControl><Input {...field} data-testid="input-profile-firstname" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="lastName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Фамилия</FormLabel>
                      <FormControl><Input {...field} data-testid="input-profile-lastname" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-neutral-700 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-neutral-400" /> Email
                  </label>
                  <div className="flex items-center gap-2">
                    <Input value={user.email || ''} disabled className="bg-neutral-50 text-neutral-500" />
                    {user.isEmailVerified && (
                      <span className="flex items-center gap-1 text-xs text-green-600 shrink-0">
                        <Check className="w-3.5 h-3.5" /> Подтверждён
                      </span>
                    )}
                  </div>
                </div>

                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-neutral-400" /> Телефон
                    </FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="+7 (999) 123-45-67" type="tel" data-testid="input-profile-phone" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <Button
                  type="submit"
                  className={`bg-amber-600 hover:bg-amber-700 text-white ${saved ? 'bg-green-600 hover:bg-green-600' : ''}`}
                  disabled={form.formState.isSubmitting}
                  data-testid="button-save-profile"
                >
                  {saved ? <><Check className="w-4 h-4 mr-2" /> Сохранено</> : 'Сохранить изменения'}
                </Button>
              </form>
            </Form>
          </div>
        </div>
      </div>
    </div>
  );
}
