import { useState } from 'react';
import { useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  User, Mail, Phone, Lock, LogOut, ChevronRight, Package, MapPin, Heart, Check,
  MessageCircle, Link2, Link2Off, Loader2, Copy, ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useWebAuth } from '../hooks/useWebAuth';
import { webApi } from '../lib/webApi';

const profileSchema = z.object({
  firstName: z.string().min(1, 'Введите имя').max(50),
  lastName: z.string().max(50).optional(),
  phone: z.string().optional(),
});

interface TelegramLinkCode { code: string; botUrl: string; }

export default function WebAccountPage() {
  const [, setLocation] = useLocation();
  const { user, logout, updateProfile } = useWebAuth();
  const { toast } = useToast();
  const [saved, setSaved] = useState(false);
  const qc = useQueryClient();

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

  // Telegram linking
  const { data: linkCode, refetch: fetchLinkCode, isFetching: fetchingCode } = useQuery({
    queryKey: ['/web-api/auth/telegram-link-code'],
    queryFn: () => webApi.get<TelegramLinkCode>('/auth/telegram-link-code'),
    enabled: false,
  });

  const unlinkMutation = useMutation({
    mutationFn: () => webApi.delete<void>('/auth/link-telegram'),
    onSuccess: () => {
      toast({ title: 'Telegram отвязан' });
      qc.invalidateQueries({ queryKey: ['/web-api/auth/me'] });
      // Reload user
      updateProfile({});
    },
    onError: () => toast({ title: 'Ошибка', variant: 'destructive' }),
  });

  const copyCode = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast({ title: 'Скопировано' }));
  };

  if (!user) return null;

  const isTelegramLinked = !!(user as any).telegramUserId;

  const menuItems = [
    { icon: Package, label: 'Мои заказы', href: '/web/account/orders' },
    { icon: Heart, label: 'Избранное', href: '/web/wishlist' },
    { icon: MapPin, label: 'Адреса доставки', href: '/web/account/addresses' },
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
              {isTelegramLinked && (
                <span className="inline-flex items-center gap-1 text-xs text-blue-600 mt-0.5">
                  <MessageCircle className="w-3 h-3" /> Telegram подключён
                </span>
              )}
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

        {/* Main */}
        <div className="md:col-span-2 space-y-4">
          {/* Profile edit */}
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

          {/* Telegram linking */}
          <div className="bg-white rounded-xl border border-neutral-200 p-6">
            <h2 className="font-semibold text-neutral-900 mb-1 flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-blue-500" /> Telegram аккаунт
            </h2>
            <p className="text-sm text-neutral-500 mb-4">
              Привяжите Telegram, чтобы получать уведомления о заказах прямо в мессенджере
            </p>

            {isTelegramLinked ? (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <MessageCircle className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-neutral-900">Подключён</p>
                    <p className="text-xs text-neutral-500">ID: {(user as any).telegramUserId}</p>
                  </div>
                  <Badge className="bg-blue-100 text-blue-700 border-0 text-xs">Активен</Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 border-red-200"
                  onClick={() => unlinkMutation.mutate()}
                  disabled={unlinkMutation.isPending}
                  data-testid="button-unlink-telegram"
                >
                  {unlinkMutation.isPending
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <><Link2Off className="w-4 h-4 mr-1.5" /> Отвязать</>}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {!linkCode ? (
                  <Button
                    variant="outline"
                    className="border-blue-200 text-blue-700 hover:bg-blue-50"
                    onClick={() => fetchLinkCode()}
                    disabled={fetchingCode}
                    data-testid="button-get-link-code"
                  >
                    {fetchingCode
                      ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      : <Link2 className="w-4 h-4 mr-2" />}
                    Привязать Telegram
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                      <p className="text-sm text-blue-800 font-medium">Как привязать:</p>
                      <ol className="text-sm text-blue-700 space-y-1.5 list-decimal list-inside">
                        <li>Откройте нашего Telegram-бота</li>
                        <li>Нажмите START или отправьте команду ниже</li>
                        <li>Аккаунт будет привязан автоматически</li>
                      </ol>

                      <div className="flex items-center gap-2">
                        <code className="flex-1 bg-white border border-blue-200 rounded px-3 py-1.5 text-xs font-mono text-blue-900 truncate">
                          /start link_{linkCode.code}
                        </code>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8 shrink-0 border-blue-200"
                          onClick={() => copyCode(`/start link_${linkCode.code}`)}
                          data-testid="button-copy-link-code"
                        >
                          <Copy className="w-3.5 h-3.5 text-blue-600" />
                        </Button>
                      </div>
                    </div>

                    <Button
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => window.open(linkCode.botUrl, '_blank')}
                      data-testid="button-open-telegram-bot"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" /> Открыть бота в Telegram
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
