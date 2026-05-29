import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Eye, EyeOff, Mail, Lock, User } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useWebAuth } from '../hooks/useWebAuth';

const loginSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(1, 'Введите пароль'),
});

const registerSchema = z.object({
  firstName: z.string().min(1, 'Введите имя').max(50),
  lastName: z.string().max(50).optional(),
  email: z.string().email('Некорректный email'),
  password: z.string().min(8, 'Минимум 8 символов'),
  marketingConsent: z.boolean().optional(),
});

interface Props {
  open: boolean;
  onClose: () => void;
  defaultTab?: 'login' | 'register';
}

export default function WebAuthModal({ open, onClose, defaultTab = 'login' }: Props) {
  const [tab, setTab] = useState<string>(defaultTab);
  const [showPassword, setShowPassword] = useState(false);
  const { login, register } = useWebAuth();
  const { toast } = useToast();

  const loginForm = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });
  const registerForm = useForm({ resolver: zodResolver(registerSchema), defaultValues: { firstName: '', lastName: '', email: '', password: '', marketingConsent: false } });

  const handleLogin = async (data: z.infer<typeof loginSchema>) => {
    try {
      await login(data.email, data.password);
      toast({ title: 'Добро пожаловать!' });
      onClose();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Ошибка входа', variant: 'destructive' });
    }
  };

  const handleRegister = async (data: z.infer<typeof registerSchema>) => {
    try {
      await register(data);
      toast({ title: 'Аккаунт создан!', description: 'Подтвердите email для активации всех функций.' });
      onClose();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Ошибка регистрации', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-lg">
            <span className="text-amber-700">Don Giulio Select</span>
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Войти</TabsTrigger>
            <TabsTrigger value="register">Регистрация</TabsTrigger>
          </TabsList>

          {/* LOGIN */}
          <TabsContent value="login" className="mt-4">
            <Form {...loginForm}>
              <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                <FormField control={loginForm.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                        <Input {...field} type="email" placeholder="your@email.com" className="pl-9" data-testid="input-login-email" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={loginForm.control} name="password" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Пароль</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                        <Input {...field} type={showPassword ? 'text' : 'password'} placeholder="••••••••" className="pl-9 pr-9" data-testid="input-login-password" />
                        <button type="button" onClick={() => setShowPassword(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600">
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <Button type="submit" className="w-full bg-amber-700 hover:bg-amber-800 text-white" disabled={loginForm.formState.isSubmitting} data-testid="button-login-submit">
                  {loginForm.formState.isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Войти
                </Button>
                <p className="text-center text-xs text-neutral-500">
                  Нет аккаунта?{' '}
                  <button type="button" onClick={() => setTab('register')} className="text-amber-700 hover:underline font-medium">
                    Зарегистрируйтесь
                  </button>
                </p>
              </form>
            </Form>
          </TabsContent>

          {/* REGISTER */}
          <TabsContent value="register" className="mt-4">
            <Form {...registerForm}>
              <form onSubmit={registerForm.handleSubmit(handleRegister)} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={registerForm.control} name="firstName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Имя *</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                          <Input {...field} placeholder="Иван" className="pl-9" data-testid="input-register-firstname" />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={registerForm.control} name="lastName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Фамилия</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Петров" data-testid="input-register-lastname" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={registerForm.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email *</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                        <Input {...field} type="email" placeholder="your@email.com" className="pl-9" data-testid="input-register-email" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={registerForm.control} name="password" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Пароль *</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                        <Input {...field} type={showPassword ? 'text' : 'password'} placeholder="Минимум 8 символов" className="pl-9 pr-9" data-testid="input-register-password" />
                        <button type="button" onClick={() => setShowPassword(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600">
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={registerForm.control} name="marketingConsent" render={({ field }) => (
                  <FormItem className="flex items-start gap-2">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
                    </FormControl>
                    <FormLabel className="text-xs text-neutral-500 font-normal leading-tight cursor-pointer">
                      Согласен получать новости и специальные предложения Don Giulio Select
                    </FormLabel>
                  </FormItem>
                )} />
                <Button type="submit" className="w-full bg-amber-700 hover:bg-amber-800 text-white" disabled={registerForm.formState.isSubmitting} data-testid="button-register-submit">
                  {registerForm.formState.isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Создать аккаунт
                </Button>
                <p className="text-center text-xs text-neutral-500">
                  Уже есть аккаунт?{' '}
                  <button type="button" onClick={() => setTab('login')} className="text-amber-700 hover:underline font-medium">
                    Войдите
                  </button>
                </p>
              </form>
            </Form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
