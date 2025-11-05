import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLocation } from 'wouter';
import { 
  Sidebar, 
  SidebarContent, 
  SidebarGroup, 
  SidebarGroupLabel, 
  SidebarMenu, 
  SidebarMenuItem, 
  SidebarMenuButton, 
  SidebarProvider, 
  SidebarTrigger,
  useSidebar
} from '@/components/ui/sidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { insertCategorySchema, insertProductSchema, insertPickupAddressSchema, type Category, type Product, type Order, type Admin, type ProductAssociation, type AdminActionLog, type PickupAddress, DELIVERY_METHOD_LABELS, DELIVERY_METHODS } from '@shared/schema';
import { Trash2, Edit, Plus, Package, Truck, CheckCircle2, XCircle, Settings, ClipboardList, FolderTree, Link, ShoppingCart, Users, FileText, Upload, ImagePlus, AlertTriangle, Search, MapPin, Star, Phone, User, Loader2, Eye, EyeOff } from 'lucide-react';
import { ImageUploadField } from '@/components/ImageUploadField';
import { MarkingCodesDialog } from '@/components/MarkingCodesDialog';
import { DeliveryDialog } from '@/components/DeliveryDialog';
import { OrderViewDialog } from '@/components/OrderViewDialog';
import { AddressAutocomplete, type AddressSuggestion } from '@/components/AddressAutocomplete';
import { getAbsoluteImageUrl } from '@/lib/imageUtils';
import { normalizePhoneNumber } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { SubmitHandler } from 'react-hook-form';
import { format } from 'date-fns';

// Nota: Telegram types già definiti in lib/telegram.ts

// Componente interno che può usare useSidebar
function AdminContent({ isMasterAdmin }: { isMasterAdmin: boolean }) {
  const [location, setLocation] = useLocation();
  
  // Leggi la sezione dai query params, default 'orders'
  const urlParams = new URLSearchParams(window.location.search);
  const sectionFromUrl = urlParams.get('section') || 'orders';
  const [activeSection, setActiveSection] = useState(sectionFromUrl);
  
  const { isMobile, open, setOpen, setOpenMobile } = useSidebar();

  // Aggiorna activeSection quando cambiano i query params (es. quando si torna indietro)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const newSection = urlParams.get('section') || 'orders';
    setActiveSection(newSection);
  }, [location]); // Dipende da location per aggiornare quando l'URL cambia

  // Forza l'apertura della sidebar solo al mount iniziale (quando si accede a /admin)
  useEffect(() => {
    if (!isMobile) {
      setOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run solo al mount

  const handleNavClick = (section: string) => {
    setActiveSection(section);
    // Aggiorna i query params nell'URL
    setLocation(`/admin?section=${section}`);
    // Chiude la sidebar dopo la selezione
    if (isMobile) {
      setOpenMobile(false);
    } else if (open) {
      setOpen(false);
    }
  };

  return (
    <div className="flex h-screen w-full" data-testid="admin-page">
      <Sidebar collapsible="icon">
        <SidebarContent>
          {/* Gruppo A) Администрирование */}
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              A) Администрирование
            </SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleNavClick('categories')}
                  className={activeSection === 'categories' ? 'bg-sidebar-accent' : ''}
                  data-testid="button-nav-categories"
                >
                  <FolderTree className="w-4 h-4" />
                  <span>Категории</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleNavClick('products')}
                  className={activeSection === 'products' ? 'bg-sidebar-accent' : ''}
                  data-testid="button-nav-products"
                >
                  <Package className="w-4 h-4" />
                  <span>Продукты</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleNavClick('associations')}
                  className={activeSection === 'associations' ? 'bg-sidebar-accent' : ''}
                  data-testid="button-nav-associations"
                >
                  <Link className="w-4 h-4" />
                  <span>Рекомендации</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>

          {/* Gruppo B) Управление */}
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4" />
              B) Управление
            </SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleNavClick('orders')}
                  className={activeSection === 'orders' ? 'bg-sidebar-accent' : ''}
                  data-testid="button-nav-orders"
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>Заказы</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleNavClick('clients')}
                  className={activeSection === 'clients' ? 'bg-sidebar-accent' : ''}
                  data-testid="button-nav-clients"
                >
                  <Users className="w-4 h-4" />
                  <span>Клиенты</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleNavClick('pickup-addresses')}
                  className={activeSection === 'pickup-addresses' ? 'bg-sidebar-accent' : ''}
                  data-testid="button-nav-pickup-addresses"
                >
                  <MapPin className="w-4 h-4" />
                  <span>Адреса забора</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>

          {/* Отдельные разделы */}
          <SidebarGroup>
            <SidebarMenu>
              {isMasterAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleNavClick('admins')}
                    className={activeSection === 'admins' ? 'bg-sidebar-accent' : ''}
                    data-testid="button-nav-admins"
                  >
                    <Users className="w-4 h-4" />
                    <span>Администраторы</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleNavClick('logs')}
                  className={activeSection === 'logs' ? 'bg-sidebar-accent' : ''}
                  data-testid="button-nav-logs"
                >
                  <FileText className="w-4 h-4" />
                  <span>Логи</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <div className="flex flex-col flex-1">
        <header className="flex items-center justify-between gap-4 p-4 border-b">
          <SidebarTrigger data-testid="button-sidebar-toggle" />
          <h1 className="text-xl font-bold">Панель администратора</h1>
        </header>
        <main className="flex-1 overflow-auto p-6">
          {activeSection === 'categories' && <CategoriesManager isMasterAdmin={isMasterAdmin} />}
          {activeSection === 'products' && <ProductsManager isMasterAdmin={isMasterAdmin} />}
          {activeSection === 'associations' && <ProductAssociationsManager />}
          {activeSection === 'orders' && <OrdersManager isMasterAdmin={isMasterAdmin} />}
          {activeSection === 'clients' && <ClientsManager isMasterAdmin={isMasterAdmin} />}
          {activeSection === 'pickup-addresses' && <PickupAddressesManager />}
          {activeSection === 'logs' && <LogsManager />}
          {activeSection === 'admins' && isMasterAdmin && <AdminsManager />}
        </main>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { toast } = useToast();

  // Check admin status
  const { data: adminCheck, isLoading: isCheckingAdmin } = useQuery<{ isAdmin: boolean; isMasterAdmin: boolean }>({
    queryKey: ['/api/admin/check'],
  });

  if (isCheckingAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen" data-testid="loading-admin-check">
        <p className="text-lg">Проверка прав доступа...</p>
      </div>
    );
  }

  if (!adminCheck?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen" data-testid="access-denied">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Доступ запрещен</CardTitle>
            <CardDescription>
              У вас нет прав администратора для доступа к этой странице
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const isMasterAdmin = adminCheck?.isMasterAdmin || false;

  return (
    <SidebarProvider defaultOpen={true}>
      <AdminContent isMasterAdmin={isMasterAdmin} />
    </SidebarProvider>
  );
}

// ========== CATEGORIES MANAGER ==========

type CategoryFormData = z.infer<typeof insertCategorySchema>;

function CategoriesManager({ isMasterAdmin }: { isMasterAdmin: boolean }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [hasUnsavedImage, setHasUnsavedImage] = useState(false);

  // Fetch categories (includeHidden for admin view)
  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ['/api/categories', { includeHidden: true }],
    queryFn: async () => {
      const response = await fetch('/api/categories?includeHidden=true');
      if (!response.ok) throw new Error('Failed to fetch categories');
      return response.json();
    },
  });

  // Form
  const form = useForm<CategoryFormData>({
    resolver: zodResolver(insertCategorySchema),
    defaultValues: {
      name: '',
      slug: '',
      image: null,
      parentId: null,
      sortOrder: 0,
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: CategoryFormData) => {
      const response = await apiRequest('POST', '/api/admin/categories', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/categories', { includeHidden: true }] });
      form.reset();
      setHasUnsavedImage(false); // Reset dopo la creazione
      toast({ title: '✅ Категория создана' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Ошибка', 
        description: error.message || 'Не удалось создать категорию',
        variant: 'destructive' 
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CategoryFormData> }) => {
      const response = await apiRequest('PATCH', `/api/admin/categories/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/categories', { includeHidden: true }] });
      // NON resettare il form dopo il salvataggio - mantieni modalità modifica
      setHasUnsavedImage(false); // Reset flag immagine non salvata
      toast({ title: '✅ Categoria обновлена' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Ошибка', 
        description: error.message || 'Не удалось обновить категорию',
        variant: 'destructive' 
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/admin/categories/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/categories', { includeHidden: true }] });
      toast({ title: '✅ Категория удалена' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Ошибка', 
        description: error.message || 'Не удалось удалить категорию',
        variant: 'destructive' 
      });
    },
  });

  // Toggle visibility mutation (Master Admin only)
  const toggleVisibilityMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('PATCH', `/api/admin/categories/${id}/visibility`, {});
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/categories', { includeHidden: true }] });
      const status = data.isVisible ? 'видима' : 'скрыта';
      toast({ title: `✅ Категория ${status}` });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Ошибка', 
        description: error.message || 'Не удалось изменить видимость',
        variant: 'destructive' 
      });
    },
  });

  const onSubmit: SubmitHandler<CategoryFormData> = (data) => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (category: Category) => {
    setEditingId(category.id);
    setShowForm(true);
    setHasUnsavedImage(false); // Reset quando si seleziona una categoria
    form.reset({
      name: category.name,
      slug: category.slug,
      image: category.image || '',
      parentId: category.parentId,
      sortOrder: category.sortOrder,
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setShowForm(false);
    setHasUnsavedImage(false);
    form.reset();
  };

  if (isLoading) {
    return <div className="py-4">Загрузка категорий...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Lista categorie */}
      <Card data-testid="categories-list">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Категории ({categories.length})</CardTitle>
            <Button
              onClick={() => {
                setEditingId(null);
                setShowForm(true);
                setHasUnsavedImage(false);
                form.reset();
              }}
              data-testid="button-new-category"
            >
              <Plus className="w-4 h-4 mr-2" />
              Новая категория
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {categories.map((category) => (
              <Card
                key={category.id}
                className={`overflow-hidden cursor-pointer hover-elevate active-elevate-2 ${!category.isVisible ? 'opacity-60' : ''}`}
                onClick={() => setLocation(`/admin/categories/${category.id}`)}
                data-testid={`category-item-${category.id}`}
              >
                <div className="relative h-32">
                  {category.image ? (
                    <img 
                      src={getAbsoluteImageUrl(category.image) || category.image} 
                      alt={category.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <ImagePlus className="w-12 h-12 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-white font-semibold text-base">
                        {category.name}
                      </h3>
                      {!category.isVisible && (
                        <Badge variant="destructive" className="text-xs">Nascosta</Badge>
                      )}
                    </div>
                    <p className="text-white/70 text-xs">
                      /{category.slug}
                    </p>
                  </div>
                  <div className="absolute top-2 right-2 flex gap-2">
                    {isMasterAdmin && (
                      <Button
                        size="icon"
                        variant={category.isVisible ? "secondary" : "destructive"}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleVisibilityMutation.mutate(category.id);
                        }}
                        data-testid={`button-toggle-visibility-category-${category.id}`}
                        className="h-8 w-8"
                        title={category.isVisible ? 'Скрыть категорию' : 'Показать категорию'}
                      >
                        {category.isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLocation(`/admin/categories/${category.id}`);
                      }}
                      data-testid={`button-edit-category-${category.id}`}
                      className="h-8 w-8"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Удалить категорию?')) {
                          deleteMutation.mutate(category.id);
                        }
                      }}
                      data-testid={`button-delete-category-${category.id}`}
                      className="h-8 w-8"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Form - mostrato solo quando necessario */}
      {showForm && (
        <Card data-testid="category-form">
        <CardHeader>
          <CardTitle>{editingId ? 'Редактировать категорию' : 'Создать категорию'}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Название</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-category-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slug (URL)</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-category-slug" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="image"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Изображение категории (опционально)</FormLabel>
                    <FormControl>
                      <ImageUploadField
                        value={field.value ?? null}
                        onChange={(value) => {
                          field.onChange(value);
                          setHasUnsavedImage(true);
                        }}
                        onUploadComplete={(path) => {
                          toast({
                            title: 'Изображение загружено',
                            description: 'Теперь нажмите "Обновить" чтобы сохранить изменения'
                          });
                        }}
                        onUploadError={(error) => {
                          toast({
                            title: 'Ошибка загрузки',
                            description: error,
                            variant: 'destructive'
                          });
                        }}
                        data-testid="category-image-upload"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="parentId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Родительская категория (опционально)</FormLabel>
                    <Select 
                      onValueChange={(value) => field.onChange(value === 'null' ? null : value)} 
                      value={field.value || 'null'}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-category-parent">
                          <SelectValue placeholder="Без родителя" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="null">Без родителя</SelectItem>
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="sortOrder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Порядок сортировки</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        value={field.value ?? 0}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                        data-testid="input-category-sort"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="flex gap-2">
                <Button 
                  type="submit" 
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-submit-category"
                  className={hasUnsavedImage ? 'animate-pulse' : ''}
                >
                  {editingId ? (
                    hasUnsavedImage ? (
                      <>
                        <AlertTriangle className="w-4 h-4 mr-2" />
                        Обновить (есть несохраненное изображение)
                      </>
                    ) : (
                      'Обновить'
                    )
                  ) : (
                    'Создать'
                  )}
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleCancelEdit}
                  data-testid="button-cancel-edit-category"
                >
                  Отменить
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
        </Card>
      )}
    </div>
  );
}

// ========== PRODUCTS MANAGER ==========

function ProductsManager({ isMasterAdmin }: { isMasterAdmin: boolean }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');

  // Fetch products and categories (includeHidden for admin view)
  const { data: products = [], isLoading: isLoadingProducts } = useQuery<Product[]>({
    queryKey: ['/api/products', { includeHidden: true }],
    queryFn: async () => {
      const response = await fetch('/api/products?includeHidden=true');
      if (!response.ok) throw new Error('Failed to fetch products');
      return response.json();
    },
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['/api/categories', { includeHidden: true }],
    queryFn: async () => {
      const response = await fetch('/api/categories?includeHidden=true');
      if (!response.ok) throw new Error('Failed to fetch categories');
      return response.json();
    },
  });

  // Filter products by selected category
  const filteredProducts = selectedCategoryId === 'all' 
    ? products 
    : products.filter(p => p.categoryId === selectedCategoryId);

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/admin/products/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/products', { includeHidden: true }] });
      toast({ title: '✅ Продукт удален' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Ошибка', 
        description: error.message || 'Не удалось удалить продукт',
        variant: 'destructive' 
      });
    },
  });

  // Toggle visibility mutation (Master Admin only)
  const toggleVisibilityMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('PATCH', `/api/admin/products/${id}/visibility`, {});
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/products', { includeHidden: true }] });
      const status = data.isVisible ? 'виден' : 'скрыт';
      toast({ title: `✅ Продукт ${status}` });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Ошибка', 
        description: error.message || 'Не удалось изменить видимость',
        variant: 'destructive' 
      });
    },
  });

  if (isLoadingProducts) {
    return <div className="py-4">Загрузка продуктов...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Lista prodotti */}
      <Card data-testid="products-list">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Продукты ({products.length})</CardTitle>
            <Button
              onClick={() => setLocation('/admin/products/new')}
              data-testid="button-new-product"
            >
              <Plus className="w-4 h-4 mr-2" />
              Новый продукт
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filtro per categoria */}
          <div className="mb-4">
            <Label>Фильтр по категории</Label>
            <Select 
              value={selectedCategoryId} 
              onValueChange={setSelectedCategoryId}
            >
              <SelectTrigger data-testid="select-filter-category">
                <SelectValue placeholder="Выберите категорию" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все категории</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredProducts.length === 0 ? (
              <p className="text-muted-foreground">
                {selectedCategoryId === 'all' ? 'Нет продуктов' : 'Нет продуктов в этой категории'}
              </p>
            ) : (
              filteredProducts.map((product) => (
                <Card
                  key={product.id}
                  className={`overflow-hidden cursor-pointer hover-elevate active-elevate-2 ${!product.isVisible ? 'opacity-60' : ''}`}
                  onClick={() => setLocation(`/admin/products/${product.id}`)}
                  data-testid={`product-item-${product.id}`}
                >
                  <div className="relative h-32">
                    {product.images && product.images[0] ? (
                      <img 
                        src={product.images[0]} 
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <Package className="w-12 h-12 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-white font-semibold text-base">
                          {product.name}
                        </h3>
                        {!product.isVisible && (
                          <Badge variant="destructive" className="text-xs">Nascosto</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-white/80 text-xs">
                          {product.price} ₽/{product.unit}
                        </p>
                        {!product.inStock && (
                          <Badge variant="destructive" className="text-xs">Нет в наличии</Badge>
                        )}
                      </div>
                    </div>
                    <div className="absolute top-2 right-2 flex gap-2">
                      {isMasterAdmin && (
                        <Button
                          size="icon"
                          variant={product.isVisible ? "secondary" : "destructive"}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleVisibilityMutation.mutate(product.id);
                          }}
                          data-testid={`button-toggle-visibility-product-${product.id}`}
                          className="h-8 w-8"
                          title={product.isVisible ? 'Скрыть продукт' : 'Показать продукт'}
                        >
                          {product.isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLocation(`/admin/products/${product.id}`);
                        }}
                        data-testid={`button-edit-product-${product.id}`}
                        className="h-8 w-8"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('Удалить продукт?')) {
                            deleteMutation.mutate(product.id);
                          }
                        }}
                        data-testid={`button-delete-product-${product.id}`}
                        className="h-8 w-8"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ========== ORDER EDIT DIALOG ==========

interface OrderEditDialogProps {
  order: Order;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isMasterAdmin?: boolean;
}

function OrderEditDialog({ order, open, onOpenChange, isMasterAdmin = false }: OrderEditDialogProps) {
  const { toast } = useToast();
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [newQuantity, setNewQuantity] = useState<number>(0);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [addQuantity, setAddQuantity] = useState<number>(1);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState<string>('');
  const [newAddress, setNewAddress] = useState<string>(order.deliveryAddress || '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [showAddressMode, setShowAddressMode] = useState<'saved' | 'new'>('saved');
  const [addressStructured, setAddressStructured] = useState<{
    city?: string;
    street?: string;
    building?: string;
    flat?: string;
    postalCode?: string;
    dadataFiasId?: string;
    latitude?: string;
    longitude?: string;
  }>({});
  
  // Determina se l'ordine è modificabile
  const editable = isOrderEditable(order.status);

  // Fetch current order data (refreshes after mutations)
  const { data: currentOrder } = useQuery<Order>({
    queryKey: ['/api/admin/orders', order.id],
    enabled: open,
    initialData: order, // Usa la prop come dati iniziali
  });

  // Usa currentOrder invece di order per visualizzare i dati aggiornati
  const displayOrder = currentOrder || order;

  // Fetch all products for adding
  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ['/api/products'],
  });

  // Fetch customer addresses
  const { data: customerAddresses = [] } = useQuery<any[]>({
    queryKey: ['/api/user-addresses', order.userId],
    enabled: open && !!order.userId,
  });

  // Fetch order logs
  const { data: logs = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/orders', order.id, 'logs'],
    enabled: open,
  });

  // Update quantity mutation
  const updateQuantityMutation = useMutation({
    mutationFn: async ({ productId, newQuantity }: { productId: string; newQuantity: number }) => {
      return await apiRequest('POST', `/api/admin/orders/${order.id}/update-quantity`, { 
        productId, 
        newQuantity 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders', order.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders', order.id, 'logs'] });
      setEditingProductId(null);
      toast({ title: '✅ Количество обновлено' });
    },
    onError: (error: any) => {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
    },
  });

  // Add product mutation
  const addProductMutation = useMutation({
    mutationFn: async ({ productId, quantity }: { productId: string; quantity: number }) => {
      return await apiRequest('POST', `/api/admin/orders/${order.id}/add-product`, { 
        productId, 
        quantity 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders', order.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders', order.id, 'logs'] });
      setSelectedProductId('');
      setAddQuantity(1);
      toast({ title: '✅ Продукт добавлен' });
    },
    onError: (error: any) => {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
    },
  });

  // Remove product mutation
  const removeProductMutation = useMutation({
    mutationFn: async (productId: string) => {
      return await apiRequest('POST', `/api/admin/orders/${order.id}/remove-product`, { productId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders', order.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders', order.id, 'logs'] });
      toast({ title: '✅ Продукт удален' });
    },
    onError: (error: any) => {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
    },
  });

  // Apply discount mutation
  const applyDiscountMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', `/api/admin/orders/${order.id}/apply-discount`, { 
        discountType, 
        discountValue 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders', order.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders', order.id, 'logs'] });
      setDiscountValue('');
      toast({ title: '✅ Скидка применена' });
    },
    onError: (error: any) => {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
    },
  });

  // Change address mutation
  const changeAddressMutation = useMutation({
    mutationFn: async () => {
      const payload: any = { 
        deliveryAddress: newAddress,
      };
      
      // Se abbiamo dati strutturati dall'autocompletamento DaData, includiamoli (solo coordinate e metadata necessari)
      if (addressStructured.dadataFiasId) {
        payload.dadataFiasId = addressStructured.dadataFiasId;
        payload.latitude = addressStructured.latitude;
        payload.longitude = addressStructured.longitude;
        payload.deliveryPostalCode = addressStructured.postalCode;
        payload.saveToCustomer = true; // Salva automaticamente l'indirizzo nel profilo del cliente
      }
      
      return await apiRequest('POST', `/api/admin/orders/${order.id}/change-address`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders', order.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders', order.id, 'logs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user-addresses', order.userId] });
      setAddressStructured({}); // Reset dati strutturati
      toast({ title: '✅ Адрес обновлен' });
    },
    onError: (error: any) => {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
    },
  });

  // Delete order mutation (MASTER ADMIN ONLY)
  const deleteOrderMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('DELETE', `/api/admin/orders/${order.id}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delete order');
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
      toast({ 
        title: '✅ Заказ удален', 
        description: 'Заказ и все связанные данные успешно удалены из базы данных.',
      });
      onOpenChange(false); // Chiudi il dialog dopo la cancellazione
    },
    onError: (error: any) => {
      toast({ 
        title: 'Ошибка удаления', 
        description: error.message || 'Не удалось удалить заказ',
        variant: 'destructive' 
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Редактирование заказа #{order.id.slice(0, 8)}</DialogTitle>
          <DialogDescription>
            {order.customerName} • {format(new Date(order.createdAt), 'dd.MM.yyyy HH:mm')}
          </DialogDescription>
        </DialogHeader>

        {!editable && (
          <div className="bg-muted p-4 rounded-md" data-testid="order-not-editable-notice">
            <p className="text-sm font-medium text-muted-foreground">
              ⚠️ Этот заказ не может быть изменен, так как для него уже была отправлена ссылка на оплату или он находится в более позднем статусе.
            </p>
          </div>
        )}

        <div className="space-y-6 py-4">
          {/* Products */}
          <div className="space-y-3">
            <h3 className="font-semibold">Продукты</h3>
            {displayOrder.items.map((item: any) => (
              <div key={item.productId} className="flex items-center justify-between gap-4 border rounded-md p-3">
                <div className="flex-1">
                  <p className="font-medium">{item.productName}</p>
                  <p className="text-sm text-muted-foreground">{item.price}₽ × {item.quantity} {item.unit}</p>
                </div>
                
                {editingProductId === item.productId ? (
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.001"
                      value={newQuantity}
                      onChange={(e) => setNewQuantity(parseFloat(e.target.value))}
                      className="w-24"
                      disabled={!editable}
                      data-testid={`input-quantity-${item.productId}`}
                    />
                    <Button 
                      size="sm" 
                      onClick={() => {
                        updateQuantityMutation.mutate({ 
                          productId: item.productId, 
                          newQuantity 
                        });
                      }}
                      disabled={!editable}
                      data-testid={`button-save-quantity-${item.productId}`}
                    >
                      Сохранить
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => setEditingProductId(null)}
                      data-testid={`button-cancel-quantity-${item.productId}`}
                    >
                      Отмена
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => {
                        setEditingProductId(item.productId);
                        setNewQuantity(item.quantity);
                      }}
                      disabled={!editable}
                      data-testid={`button-edit-quantity-${item.productId}`}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button 
                      size="sm" 
                      variant="destructive"
                      onClick={() => {
                        if (confirm('Удалить продукт из заказа?')) {
                          removeProductMutation.mutate(item.productId);
                        }
                      }}
                      disabled={!editable}
                      data-testid={`button-remove-product-${item.productId}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add Product */}
          <div className="space-y-3">
            <h3 className="font-semibold">Добавить продукт</h3>
            <div className="flex gap-2">
              <Select value={selectedProductId} onValueChange={setSelectedProductId} disabled={!editable}>
                <SelectTrigger className="flex-1" data-testid="select-add-product">
                  <SelectValue placeholder="Выберите продукт" />
                </SelectTrigger>
                <SelectContent>
                  {allProducts.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name} ({product.price}₽)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                step="0.001"
                value={addQuantity}
                onChange={(e) => setAddQuantity(parseFloat(e.target.value))}
                className="w-24"
                placeholder="Кол-во"
                disabled={!editable}
                data-testid="input-add-quantity"
              />
              <Button 
                onClick={() => {
                  if (selectedProductId && addQuantity > 0) {
                    addProductMutation.mutate({ productId: selectedProductId, quantity: addQuantity });
                  }
                }}
                disabled={!editable || !selectedProductId || addQuantity <= 0}
                data-testid="button-add-product"
              >
                <Plus className="w-4 h-4 mr-2" />
                Добавить
              </Button>
            </div>
          </div>

          {/* Apply Discount */}
          <div className="space-y-3">
            <h3 className="font-semibold">Применить скидку</h3>
            <div className="flex gap-2">
              <Select value={discountType} onValueChange={(val) => setDiscountType(val as 'percentage' | 'fixed')} disabled={!editable}>
                <SelectTrigger className="w-[150px]" data-testid="select-discount-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Процент (%)</SelectItem>
                  <SelectItem value="fixed">Фиксированная (₽)</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                step="0.01"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                className="flex-1"
                placeholder={discountType === 'percentage' ? 'Процент скидки' : 'Сумма скидки'}
                disabled={!editable}
                data-testid="input-discount-value"
              />
              <Button 
                onClick={() => {
                  if (discountValue && parseFloat(discountValue) > 0) {
                    applyDiscountMutation.mutate();
                  }
                }}
                disabled={!editable || !discountValue || parseFloat(discountValue) <= 0}
                data-testid="button-apply-discount"
              >
                Применить
              </Button>
            </div>
            {displayOrder.discount && (
              <p className="text-sm text-muted-foreground">
                Текущая скидка: {displayOrder.discount}₽ 
                ({displayOrder.discountType === 'percentage' ? `${displayOrder.discountValue}%` : `${displayOrder.discountValue}₽`})
              </p>
            )}
          </div>

          {/* Delivery Method Info */}
          {displayOrder.deliveryMethod && (
            <div className="space-y-2 border rounded-md p-4 bg-muted/50">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-primary" />
                <h3 className="font-semibold">Метод доставки</h3>
              </div>
              <p className="text-sm" data-testid="order-delivery-method-admin">
                {DELIVERY_METHOD_LABELS[displayOrder.deliveryMethod as keyof typeof DELIVERY_METHOD_LABELS] || displayOrder.deliveryMethod}
              </p>
            </div>
          )}

          {/* Change Address */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Изменить адрес доставки</h3>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={showAddressMode === 'saved' ? 'default' : 'outline'}
                  onClick={() => setShowAddressMode('saved')}
                  disabled={!editable}
                >
                  Сохраненные
                </Button>
                <Button
                  size="sm"
                  variant={showAddressMode === 'new' ? 'default' : 'outline'}
                  onClick={() => setShowAddressMode('new')}
                  disabled={!editable}
                >
                  Новый адрес
                </Button>
              </div>
            </div>

            {showAddressMode === 'saved' ? (
              <div className="space-y-2">
                {customerAddresses.length > 0 ? (
                  customerAddresses.map((address: any) => (
                    <div
                      key={address.id}
                      className={`p-3 border rounded-md cursor-pointer hover-elevate ${
                        newAddress === address.fullAddress ? 'border-primary bg-accent' : ''
                      }`}
                      onClick={() => {
                        if (editable) {
                          setNewAddress(address.fullAddress);
                        }
                      }}
                      data-testid={`address-option-${address.id}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium text-sm">{address.label}</p>
                            {address.isDefault && (
                              <Badge variant="default" className="text-xs">По умолчанию</Badge>
                            )}
                            {newAddress === address.fullAddress && (
                              <Badge variant="outline" className="text-xs">Выбран</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{address.fullAddress}</p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">У клиента нет сохраненных адресов</p>
                )}
                {newAddress && newAddress !== order.deliveryAddress && (
                  <Button 
                    className="w-full"
                    onClick={() => changeAddressMutation.mutate()}
                    disabled={!editable}
                    data-testid="button-change-address"
                  >
                    Обновить адрес
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <AddressAutocomplete
                  value={newAddress}
                  onChange={(value, suggestion) => {
                    setNewAddress(value);
                    if (suggestion) {
                      setAddressStructured({
                        city: suggestion.city || undefined,
                        street: suggestion.street || undefined,
                        building: suggestion.building || undefined,
                        flat: suggestion.flat || undefined,
                        postalCode: suggestion.postalCode || undefined,
                        dadataFiasId: suggestion.fiasId,
                        latitude: suggestion.geoLat || undefined,
                        longitude: suggestion.geoLon || undefined,
                      });
                    } else {
                      setAddressStructured({});
                    }
                  }}
                  placeholder="Начните вводить адрес..."
                  disabled={!editable}
                  data-testid="input-new-delivery-address"
                />
                <Button 
                  className="w-full"
                  onClick={() => {
                    if (newAddress && newAddress !== order.deliveryAddress) {
                      changeAddressMutation.mutate();
                    }
                  }}
                  disabled={!editable || !newAddress || newAddress === order.deliveryAddress}
                  data-testid="button-change-address"
                >
                  Обновить адрес
                </Button>
              </div>
            )}
          </div>

          {/* Order Total */}
          <div className="border-t pt-4">
            <div className="flex justify-between items-center font-semibold text-lg">
              <span>Итого:</span>
              <span>{displayOrder.amount}₽</span>
            </div>
          </div>

          {/* Change Logs */}
          {logs.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold">История изменений</h3>
              <div className="space-y-2">
                {logs.map((log: any) => (
                  <div key={log.id} className="text-sm border rounded-md p-2">
                    <p className="font-medium">
                      {format(new Date(log.createdAt), 'dd.MM.yyyy HH:mm')} • {log.changeType}
                    </p>
                    <p className="text-muted-foreground">
                      {JSON.stringify(log.changeData, null, 2)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Delete Order (Master Admin Only) */}
          {isMasterAdmin && (
            <div className="border-t pt-4">
              {!showDeleteConfirm ? (
                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-full"
                  data-testid="button-show-delete-confirm"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Удалить заказ из базы данных
                </Button>
              ) : (
                <div className="space-y-3 bg-destructive/10 p-4 rounded-md">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold text-sm">Подтвердите удаление</p>
                      <p className="text-sm text-muted-foreground">
                        Это действие необратимо. Заказ и все связанные данные (коды маркировки, логи изменений) будут удалены из базы данных навсегда.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      onClick={() => deleteOrderMutation.mutate()}
                      disabled={deleteOrderMutation.isPending}
                      className="flex-1"
                      data-testid="button-confirm-delete"
                    >
                      {deleteOrderMutation.isPending ? 'Удаление...' : 'Да, удалить'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={deleteOrderMutation.isPending}
                      className="flex-1"
                      data-testid="button-cancel-delete"
                    >
                      Отмена
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ========== ORDERS MANAGER ==========

const ORDER_STATUSES = ['ОФОРМЛЕН', 'СОБРАН', 'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ', 'ОПЛАЧЕН', 'ВЫЗВАН КУРЬЕР', 'ПОЛУЧЕН'] as const;

// Helper function per determinare se un ordine è modificabile
function isOrderEditable(status: string): boolean {
  const statusIndex = ORDER_STATUSES.indexOf(status as any);
  const paymentLinkSentIndex = ORDER_STATUSES.indexOf('ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ');
  return statusIndex < paymentLinkSentIndex;
}

// Helper function per determinare se lo stato può essere cambiato
function canChangeOrderStatus(status: string, isMasterAdmin: boolean): boolean {
  if (isMasterAdmin) return true; // Master admin può sempre cambiare
  const statusIndex = ORDER_STATUSES.indexOf(status as any);
  const paidIndex = ORDER_STATUSES.indexOf('ОПЛАЧЕН');
  return statusIndex < paidIndex; // Admin normali solo prima di "ОПЛАЧЕН"
}

function OrdersManager({ isMasterAdmin }: { isMasterAdmin: boolean }) {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [markingDialogOrder, setMarkingDialogOrder] = useState<Order | null>(null);
  const [deliveryDialogOrder, setDeliveryDialogOrder] = useState<Order | null>(null);
  const [pendingStatusChange, setPendingStatusChange] = useState<{ orderId: string; status: string } | null>(null);
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  
  // States for cancel confirmation dialogs
  const [cancelDostavkaOrder, setCancelDostavkaOrder] = useState<Order | null>(null);
  const [cancelGoOrder, setCancelGoOrder] = useState<Order | null>(null);
  
  // State for courier warning dialog (when order has pickup or don_giulio_courier delivery)
  const [courierWarningOrder, setCourierWarningOrder] = useState<Order | null>(null);
  
  // Fetch orders with filter
  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ['/api/admin/orders', statusFilter !== 'all' ? statusFilter : undefined],
  });

  // Fetch all products to check marking requirements
  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ['/api/products'],
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
      return await apiRequest('PATCH', `/api/admin/orders/${orderId}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
      toast({ title: '✅ Статус обновлен' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Ошибка', 
        description: error.message || 'Не удалось обновить статус',
        variant: 'destructive' 
      });
    },
  });

  // Call courier mutation
  const callCourierMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return await apiRequest('POST', `/api/admin/orders/${orderId}/call-courier`, { courierService: 'manual' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
      toast({ title: '✅ Курьер вызван' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Ошибка', 
        description: error.message || 'Не удалось вызвать курьера',
        variant: 'destructive' 
      });
    },
  });

  // Cancel Yandex Dostavka delivery mutation
  const cancelDostavkaMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await apiRequest('POST', `/api/admin/orders/${orderId}/yandex-delivery-cancel`, {});
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
      setCancelDostavkaOrder(null);
      toast({ 
        title: '✅ Доставка отменена',
        description: 'Yandex Dostavka успешно отменена'
      });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Ошибка', 
        description: error.message || 'Не удалось отменить доставку',
        variant: 'destructive' 
      });
    },
  });

  // Cancel Yandex Go delivery mutation
  const cancelGoMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await apiRequest('POST', `/api/admin/orders/${orderId}/yandex-go-cancel`, {});
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
      setCancelGoOrder(null);
      toast({ 
        title: '✅ Доставка отменена',
        description: 'Yandex Go успешно отменена'
      });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Ошибка', 
        description: error.message || 'Не удалось отменить доставку',
        variant: 'destructive' 
      });
    },
  });

  // Helper function to check if order has products requiring marking
  const orderRequiresMarking = (order: Order): boolean => {
    const result = order.items.some(item => {
      const product = allProducts.find(p => p.id === item.productId);
      // IMPORTANTE: Маркировка attiva SOLO per prodotti a pezzo (шт)
      const isUnitProduct = item.unit === 'шт';
      const requires = product?.requiresMarking === true && isUnitProduct;
      console.log(`  Product ${item.productId}: requiresMarking=${product?.requiresMarking}, isUnit=${isUnitProduct}, requires=${requires}`);
      return requires;
    });
    console.log(`📋 Order ${order.id} requires marking: ${result}`);
    return result;
  };

  // Helper function to check if marking codes are already complete
  const checkMarkingComplete = async (orderId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/admin/marking-logs/${orderId}`);
      if (!res.ok) return false;
      
      const logs = await res.json();
      const order = orders.find(o => o.id === orderId);
      if (!order) return false;

      // Conta quanti codici sono richiesti
      let totalRequired = 0;
      order.items.forEach(item => {
        const product = allProducts.find(p => p.id === item.productId);
        const isUnitProduct = item.unit === 'шт';
        if (product?.requiresMarking && isUnitProduct) {
          totalRequired += Math.ceil(item.quantity);
        }
      });

      // Verifica se tutti i codici sono già stati acquisiti
      return logs.length >= totalRequired;
    } catch (error) {
      console.error('Error checking marking completion:', error);
      return false;
    }
  };

  // Handle status change with marking check
  const handleStatusChange = async (order: Order, newStatus: string) => {
    console.log('🔄 handleStatusChange called', { orderId: order.id, newStatus, allProductsLength: allProducts.length });
    
    // CRITICAL: Verify allProducts is loaded
    if (allProducts.length === 0) {
      console.error('❌ allProducts not loaded yet! Cannot check marking requirements.');
      toast({
        title: 'Ошибка',
        description: 'Данные продуктов еще загружаются. Попробуйте снова через несколько секунд.',
        variant: 'destructive',
      });
      return;
    }
    
    // If changing to СОБРАН and order has products requiring marking
    const requiresMarking = orderRequiresMarking(order);
    console.log('📦 Order requires marking:', requiresMarking);
    
    if (newStatus === 'СОБРАН' && requiresMarking) {
      console.log('✅ Checking marking completion...');
      // Check if marking codes are already complete
      const markingComplete = await checkMarkingComplete(order.id);
      console.log('📊 Marking complete:', markingComplete);
      
      if (markingComplete) {
        // Codes already acquired, proceed with status change without opening dialog
        console.log('✅ Marking complete - proceeding with status change');
        updateStatusMutation.mutate({ orderId: order.id, status: newStatus });
      } else {
        // Codes not complete, opening dialog
        console.log('❌ Marking incomplete - opening dialog');
        setMarkingDialogOrder(order);
        setPendingStatusChange({ orderId: order.id, status: newStatus });
      }
    } else {
      // Otherwise proceed with status change
      console.log('➡️ No marking required - proceeding with status change');
      updateStatusMutation.mutate({ orderId: order.id, status: newStatus });
    }
  };

  // Handle marking dialog completion
  const handleMarkingComplete = () => {
    if (pendingStatusChange) {
      updateStatusMutation.mutate(pendingStatusChange);
      setPendingStatusChange(null);
    }
    setMarkingDialogOrder(null);
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'ОФОРМЛЕН': return 'default';
      case 'СОБРАН': return 'secondary';
      case 'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ': return 'outline';
      case 'ОПЛАЧЕН': return 'default';
      case 'ВЫЗВАН КУРЬЕР': return 'secondary';
      case 'ПОЛУЧЕН': return 'default';
      default: return 'default';
    }
  };

  // Filter orders based on search query and status
  const filteredOrders = orders.filter(order => {
    // Filter by status
    if (statusFilter !== 'all' && order.status !== statusFilter) {
      return false;
    }
    
    // Filter by search query
    if (!searchQuery.trim()) return true;
    
    const query = searchQuery.toLowerCase().trim();
    
    // Search in customer name
    const customerName = order.customerName?.toLowerCase() || '';
    
    // Search in phone
    const phone = order.customerPhone?.toLowerCase() || '';
    
    // Search in order ID
    const orderId = order.id.toLowerCase();
    
    return customerName.includes(query) || 
           phone.includes(query) ||
           orderId.includes(query);
  });

  if (isLoading) {
    return <div className="py-4">Загрузка заказов...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Filter */}
      <Card>
        <CardHeader>
          <CardTitle>Фильтр по статусу</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger data-testid="select-order-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все заказы</SelectItem>
              {ORDER_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>{status}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Orders list */}
      <Card>
        <CardHeader>
          <CardTitle>Заказы ({filteredOrders.length}{statusFilter !== 'all' || searchQuery ? ` из ${orders.length}` : ''})</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Search field */}
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Поиск по имени клиента, телефону или номеру заказа..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-orders"
              />
            </div>
          </div>

          <div className="space-y-4" data-testid="orders-list">
            {filteredOrders.length === 0 ? (
              <p className="text-muted-foreground">
                {searchQuery ? 'Заказы не найдены' : 'Нет заказов'}
              </p>
            ) : (
              filteredOrders.map((order) => (
                <div 
                  key={order.id} 
                  className="border rounded-md p-4 space-y-3 hover-elevate"
                  data-testid={`order-item-${order.id}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">
                        Заказ #{order.id.slice(0, 8)} • {format(new Date(order.createdAt), 'dd.MM.yyyy HH:mm')}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {order.customerName} • {order.amount}₽
                      </p>
                    </div>
                    <Badge variant={getStatusBadgeVariant(order.status)} data-testid={`badge-status-${order.id}`}>
                      {order.status}
                    </Badge>
                  </div>

                  <div className="flex gap-2 items-center">
                    <Label className="text-sm font-medium">Изменить статус:</Label>
                    <Select 
                      value={order.status}
                      onValueChange={(newStatus) => handleStatusChange(order, newStatus)}
                      disabled={updateStatusMutation.isPending || !canChangeOrderStatus(order.status, isMasterAdmin)}
                    >
                      <SelectTrigger className="w-[280px]" data-testid={`select-status-${order.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ORDER_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>{status}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!canChangeOrderStatus(order.status, isMasterAdmin) && (
                      <p className="text-xs text-muted-foreground">Только мастер-администратор может изменять оплаченные заказы</p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {/* View/Print button - Always visible in all statuses */}
                    <Button 
                      size="sm"
                      variant="ghost"
                      onClick={() => setViewingOrder(order)}
                      data-testid={`button-view-order-${order.id}`}
                      title="Просмотреть и распечатать заказ"
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      Просмотр
                    </Button>
                    
                    <Button 
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingOrder(order)}
                      disabled={!isOrderEditable(order.status)}
                      data-testid={`button-edit-order-${order.id}`}
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Редактировать
                    </Button>
                    {!isOrderEditable(order.status) && (
                      <p className="text-xs text-muted-foreground">
                        {ORDER_STATUSES.indexOf(order.status as any) >= ORDER_STATUSES.indexOf('ОПЛАЧЕН')
                          ? 'Оплаченные заказы не могут быть изменены'
                          : 'Заказ не может быть изменен после отправки ссылки на оплату'}
                      </p>
                    )}
                    
                    {/* Always show delivery service buttons when order is paid */}
                    {order.status === 'ОПЛАЧЕН' && !order.yandexClaimId && !order.yandexGoClaimId && (
                      <Button 
                        size="sm"
                        variant={order.deliveryMethod === DELIVERY_METHODS.PICKUP || order.deliveryMethod === DELIVERY_METHODS.DON_GIULIO_COURIER ? 'outline' : 'default'}
                        onClick={() => {
                          // Se l'ordine ha pickup o don_giulio_courier, mostra prima il warning
                          if (order.deliveryMethod === DELIVERY_METHODS.PICKUP || order.deliveryMethod === DELIVERY_METHODS.DON_GIULIO_COURIER) {
                            setCourierWarningOrder(order);
                          } else {
                            setDeliveryDialogOrder(order);
                          }
                        }}
                        data-testid={`button-call-courier-${order.id}`}
                      >
                        <Truck className="w-4 h-4 mr-2" />
                        Вызвать курьер
                      </Button>
                    )}
                    
                    {/* Show Yandex Dostavka status and cancel button ONLY if courier was called (claim ID exists) */}
                    {order.yandexClaimId && (
                      <div className="flex items-center gap-2">
                        <Badge variant="default" className="flex items-center gap-1" data-testid={`badge-yandex-dostavka-status-${order.id}`}>
                          <Truck className="w-3 h-3" />
                          Yandex Dostavka: {order.yandexDeliveryStatus || 'в обработке'}
                          {order.yandexDeliveryPrice && ` (${order.yandexDeliveryPrice} ₽)`}
                        </Badge>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setCancelDostavkaOrder(order)}
                          data-testid={`button-cancel-yandex-dostavka-${order.id}`}
                        >
                          <XCircle className="w-4 h-4 mr-2" />
                          Отменить доставку
                        </Button>
                      </div>
                    )}
                    
                    {/* Show Yandex Go status and cancel button ONLY if courier was called (claim ID exists) */}
                    {order.yandexGoClaimId && (
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="flex items-center gap-1" data-testid={`badge-yandex-go-status-${order.id}`}>
                          <Truck className="w-3 h-3" />
                          Yandex Go: {order.yandexGoStatus || 'в обработке'}
                          {order.yandexGoPrice && ` (${order.yandexGoPrice} ₽)`}
                        </Badge>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setCancelGoOrder(order)}
                          data-testid={`button-cancel-yandex-go-${order.id}`}
                        >
                          <XCircle className="w-4 h-4 mr-2" />
                          Отменить доставку
                        </Button>
                      </div>
                    )}
                    
                    {/* Button to view/acquire marking codes */}
                    {orderRequiresMarking(order) && (
                      <Button 
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setMarkingDialogOrder(order);
                          // Non impostiamo pendingStatusChange perché questo è un'apertura manuale
                          setPendingStatusChange(null);
                        }}
                        data-testid={`button-view-marking-${order.id}`}
                      >
                        <ClipboardList className="w-4 h-4 mr-2" />
                        Маркировка
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit Order Dialog */}
      {editingOrder && (
        <OrderEditDialog 
          order={editingOrder}
          open={!!editingOrder}
          onOpenChange={(open) => !open && setEditingOrder(null)}
          isMasterAdmin={isMasterAdmin}
        />
      )}

      {/* Marking Codes Dialog */}
      {markingDialogOrder && (
        <MarkingCodesDialog
          order={markingDialogOrder}
          open={!!markingDialogOrder}
          onOpenChange={(open) => {
            if (!open) {
              setMarkingDialogOrder(null);
              setPendingStatusChange(null);
            }
          }}
          onComplete={handleMarkingComplete}
        />
      )}

      {/* Unified Delivery Dialog */}
      {deliveryDialogOrder && (
        <DeliveryDialog
          order={deliveryDialogOrder}
          open={!!deliveryDialogOrder}
          onOpenChange={(open) => !open && setDeliveryDialogOrder(null)}
        />
      )}

      {/* Cancel Yandex Dostavka Confirmation Dialog */}
      <AlertDialog open={!!cancelDostavkaOrder} onOpenChange={(open) => !open && setCancelDostavkaOrder(null)}>
        <AlertDialogContent data-testid="dialog-cancel-dostavka-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Отменить доставку Yandex Dostavka?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите отменить заказ на доставку через Yandex Dostavka для заказа {cancelDostavkaOrder?.id.slice(0, 8)}?
              <br />
              <br />
              Это действие необратимо. Вам нужно будет создать новый заказ на доставку, если потребуется.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-confirm-no">
              Отмена
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelDostavkaOrder && cancelDostavkaMutation.mutate(cancelDostavkaOrder.id)}
              disabled={cancelDostavkaMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-cancel-confirm-yes"
            >
              {cancelDostavkaMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Отмена...
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 mr-2" />
                  Да, отменить доставку
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Yandex Go Confirmation Dialog */}
      <AlertDialog open={!!cancelGoOrder} onOpenChange={(open) => !open && setCancelGoOrder(null)}>
        <AlertDialogContent data-testid="dialog-cancel-go-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Отменить доставку Yandex Go?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите отменить заказ на доставку через Yandex Go для заказа {cancelGoOrder?.id.slice(0, 8)}?
              <br />
              <br />
              Это действие необратимо. Вам нужно будет создать новый заказ на доставку, если потребуется.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-go-confirm-no">
              Отмена
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelGoOrder && cancelGoMutation.mutate(cancelGoOrder.id)}
              disabled={cancelGoMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-cancel-go-confirm-yes"
            >
              {cancelGoMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Отмена...
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 mr-2" />
                  Да, отменить доставку
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Courier Warning Dialog (for pickup/don_giulio orders) */}
      <AlertDialog open={!!courierWarningOrder} onOpenChange={(open) => !open && setCourierWarningOrder(null)}>
        <AlertDialogContent data-testid="dialog-courier-warning">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              Внимание: Стоимость доставки не включена
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Этот заказ был оформлен с методом доставки "{courierWarningOrder?.deliveryMethod === DELIVERY_METHODS.PICKUP ? 'Самовывоз' : 'Дон Джулио курьер'}", 
                но вы пытаетесь вызвать платного курьера (Yandex).
              </p>
              <p className="font-semibold text-foreground">
                ⚠️ Заказ уже оплачен, поэтому стоимость доставки через Yandex НЕ МОЖЕТ быть добавлена в счет.
              </p>
              <p>
                Вы уверены, что хотите продолжить? Стоимость доставки придется оплатить отдельно или согласовать с клиентом.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-courier-warning-cancel">
              Отмена
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (courierWarningOrder) {
                  setDeliveryDialogOrder(courierWarningOrder);
                  setCourierWarningOrder(null);
                }
              }}
              className="bg-yellow-600 text-white hover:bg-yellow-700"
              data-testid="button-courier-warning-continue"
            >
              <Truck className="w-4 h-4 mr-2" />
              Продолжить вызов курьера
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Order View/Print Dialog */}
      {viewingOrder && (
        <OrderViewDialog
          order={viewingOrder}
          open={!!viewingOrder}
          onOpenChange={(open) => !open && setViewingOrder(null)}
        />
      )}
    </div>
  );
}

// ========== PICKUP ADDRESSES MANAGER ==========

type PickupAddressFormData = z.infer<typeof insertPickupAddressSchema>;

function PickupAddressesManager() {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<AddressSuggestion | null>(null);

  // Fetch pickup addresses
  const { data: addresses = [], isLoading } = useQuery<PickupAddress[]>({
    queryKey: ['/api/admin/pickup-addresses'],
  });

  // Form
  const form = useForm<PickupAddressFormData>({
    resolver: zodResolver(insertPickupAddressSchema),
    defaultValues: {
      label: '',
      fullAddress: '',
      city: null,
      street: null,
      building: null,
      flat: null,
      postalCode: null,
      dadataFiasId: null,
      latitude: null,
      longitude: null,
      contactName: null,
      contactPhone: '',
      isDefault: false,
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: PickupAddressFormData) => {
      const response = await apiRequest('POST', '/api/admin/pickup-addresses', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/pickup-addresses'] });
      form.reset();
      setSelectedAddress(null);
      setShowForm(false);
      toast({ title: '✅ Адрес сохранен' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Ошибка', 
        description: error.message || 'Не удалось сохранить адрес',
        variant: 'destructive' 
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<PickupAddressFormData> }) => {
      const response = await apiRequest('PATCH', `/api/admin/pickup-addresses/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/pickup-addresses'] });
      toast({ title: '✅ Адрес обновлен' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Ошибка', 
        description: error.message || 'Не удалось обновить адрес',
        variant: 'destructive' 
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/admin/pickup-addresses/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/pickup-addresses'] });
      toast({ title: '✅ Адрес удален' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Ошибка', 
        description: error.message || 'Не удалось удалить адрес',
        variant: 'destructive' 
      });
    },
  });

  // Set default mutation
  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('PATCH', `/api/admin/pickup-addresses/${id}`, { isDefault: true });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/pickup-addresses'] });
      toast({ title: '✅ Адрес по умолчанию установлен' });
    },
  });

  const onSubmit: SubmitHandler<PickupAddressFormData> = (data) => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (address: PickupAddress) => {
    setEditingId(address.id);
    setShowForm(true);
    form.reset({
      label: address.label,
      fullAddress: address.fullAddress,
      city: address.city,
      street: address.street,
      building: address.building,
      flat: address.flat,
      postalCode: address.postalCode,
      dadataFiasId: address.dadataFiasId,
      latitude: address.latitude,
      longitude: address.longitude,
      contactName: address.contactName,
      contactPhone: address.contactPhone || '',
      isDefault: address.isDefault,
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setShowForm(false);
    setSelectedAddress(null);
    form.reset();
  };

  const handleAddressSelect = (suggestion: AddressSuggestion) => {
    setSelectedAddress(suggestion);
    form.setValue('fullAddress', suggestion.fullAddress);
    form.setValue('city', suggestion.city || null);
    form.setValue('street', suggestion.street || null);
    form.setValue('building', suggestion.building || null);
    form.setValue('flat', suggestion.flat || null);
    form.setValue('postalCode', suggestion.postalCode || null);
    form.setValue('dadataFiasId', suggestion.fiasId || null);
    form.setValue('latitude', suggestion.geoLat || null);
    form.setValue('longitude', suggestion.geoLon || null);
  };

  if (isLoading) {
    return <div className="py-4">Загрузка адресов...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Lista indirizzi */}
      <Card data-testid="pickup-addresses-list">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Адреса забора ({addresses.length})</CardTitle>
            <Button
              onClick={() => {
                setEditingId(null);
                setShowForm(true);
                setSelectedAddress(null);
                form.reset();
              }}
              data-testid="button-new-pickup-address"
            >
              <Plus className="w-4 h-4 mr-2" />
              Новый адрес
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {addresses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MapPin className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Нет сохраненных адресов забора</p>
            </div>
          ) : (
            <div className="space-y-4">
              {addresses.map((address) => (
                <Card
                  key={address.id}
                  className="hover-elevate active-elevate-2"
                  data-testid={`pickup-address-item-${address.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{address.label}</h3>
                          {address.isDefault && (
                            <Badge variant="default" className="gap-1">
                              <Star className="w-3 h-3" />
                              По умолчанию
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground flex items-start gap-2">
                          <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          {address.fullAddress}
                        </p>
                        {address.contactName && (
                          <p className="text-sm text-muted-foreground flex items-center gap-2">
                            <User className="w-4 h-4" />
                            {address.contactName}
                          </p>
                        )}
                        {address.contactPhone && (
                          <p className="text-sm text-muted-foreground flex items-center gap-2">
                            <Phone className="w-4 h-4" />
                            {address.contactPhone}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {!address.isDefault && (
                          <Button
                            size="icon"
                            variant="outline"
                            onClick={() => setDefaultMutation.mutate(address.id)}
                            data-testid={`button-set-default-${address.id}`}
                          >
                            <Star className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => handleEdit(address)}
                          data-testid={`button-edit-pickup-address-${address.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="destructive"
                          onClick={() => {
                            if (confirm('Вы уверены, что хотите удалить этот адрес?')) {
                              deleteMutation.mutate(address.id);
                            }
                          }}
                          data-testid={`button-delete-pickup-address-${address.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => !open && handleCancelEdit()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Редактировать адрес' : 'Новый адрес забора'}
            </DialogTitle>
            <DialogDescription>
              Укажите адрес, откуда будут забирать заказы
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="label"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Название</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="Например: Магазин Don Giulio"
                        data-testid="input-pickup-label"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="fullAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Адрес</FormLabel>
                    <FormControl>
                      <AddressAutocomplete
                        value={field.value}
                        onChange={field.onChange}
                        onSelect={handleAddressSelect}
                        placeholder="Начните вводить адрес..."
                        data-testid="input-pickup-address"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="contactName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Контактное лицо</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          value={field.value || ''}
                          placeholder="Имя"
                          data-testid="input-pickup-contact-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contactPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Телефон</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          placeholder="+7 XXX XXX XX XX"
                          data-testid="input-pickup-contact-phone"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex gap-4 justify-end pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancelEdit}
                  data-testid="button-cancel-pickup-address"
                >
                  Отмена
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-pickup-address"
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  {editingId ? 'Сохранить' : 'Создать'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ========== LOGS MANAGER ==========

function LogsManager() {
  const { data: logs = [], isLoading } = useQuery<AdminActionLog[]>({
    queryKey: ['/api/admin/action-logs'],
    queryFn: async () => {
      const response = await fetch('/api/admin/action-logs?limit=50');
      if (!response.ok) throw new Error('Failed to fetch logs');
      return response.json();
    },
  });

  const translateActionType = (actionType: string): string => {
    const translations: Record<string, string> = {
      created: 'Создано',
      updated: 'Обновлено',
      deleted: 'Удалено',
    };
    return translations[actionType] || actionType;
  };

  const translateEntityType = (entityType: string): string => {
    const translations: Record<string, string> = {
      category: 'Категория',
      product: 'Продукт',
      product_association: 'Ассоциация',
      admin: 'Администратор',
    };
    return translations[entityType] || entityType;
  };

  const formatActionData = (actionData: any, actionType: string, entityType: string): string => {
    if (!actionData || Object.keys(actionData).length === 0) return '-';

    const parts: string[] = [];

    if (entityType === 'category' && actionData.categoryName) {
      parts.push(`"${actionData.categoryName}"`);
      if (actionData.categorySlug) parts.push(`(${actionData.categorySlug})`);
    } else if (entityType === 'product' && actionData.productName) {
      parts.push(`"${actionData.productName}"`);
      if (actionData.productSlug) parts.push(`(${actionData.productSlug})`);
    } else if (entityType === 'product_association') {
      if (actionData.sourceProductName && actionData.targetProductName) {
        parts.push(`"${actionData.sourceProductName}" → "${actionData.targetProductName}"`);
      }
    } else if (entityType === 'admin' && actionData.affectedUsername) {
      parts.push(`@${actionData.affectedUsername}`);
    }

    if (actionData.notes) {
      parts.push(`(${actionData.notes})`);
    }

    if (actionType === 'updated' && actionData.oldData && actionData.newData) {
      const changes = Object.keys(actionData.newData)
        .filter(key => actionData.oldData[key] !== actionData.newData[key])
        .map(key => `${key}: "${actionData.oldData[key]}" → "${actionData.newData[key]}"`)
        .join(', ');
      if (changes) parts.push(`[${changes}]`);
    }

    return parts.join(' ') || '-';
  };

  if (isLoading) {
    return <div className="py-4" data-testid="loading-logs">Загрузка логов...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Журнал действий администраторов</CardTitle>
        <CardDescription>Последние 50 действий</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead data-testid="header-datetime">Дата/Время</TableHead>
                <TableHead data-testid="header-admin">Администратор</TableHead>
                <TableHead data-testid="header-action">Действие</TableHead>
                <TableHead data-testid="header-entity">Тип сущности</TableHead>
                <TableHead data-testid="header-details">Детали</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground" data-testid="no-logs">
                    Нет записей
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id} data-testid={`log-row-${log.id}`}>
                    <TableCell data-testid={`log-datetime-${log.id}`}>
                      {format(new Date(log.createdAt), 'dd.MM.yyyy HH:mm:ss')}
                    </TableCell>
                    <TableCell data-testid={`log-admin-${log.id}`}>
                      {log.telegramUsername ? `@${log.telegramUsername}` : log.adminUserId}
                    </TableCell>
                    <TableCell data-testid={`log-action-${log.id}`}>
                      <Badge variant="outline">{translateActionType(log.actionType)}</Badge>
                    </TableCell>
                    <TableCell data-testid={`log-entity-${log.id}`}>
                      <Badge variant="secondary">{translateEntityType(log.entityType)}</Badge>
                    </TableCell>
                    <TableCell data-testid={`log-details-${log.id}`} className="max-w-md truncate">
                      {formatActionData(log.actionData, log.actionType, log.entityType)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ========== ADMINS MANAGER ==========

function AdminsManager() {
  const { toast } = useToast();
  const [newUserId, setNewUserId] = useState('');
  const [newUsername, setNewUsername] = useState('');
  
  // Fetch admins
  const { data: admins = [], isLoading } = useQuery<Admin[]>({
    queryKey: ['/api/admin/admins'],
  });

  // Add admin mutation
  const addAdminMutation = useMutation({
    mutationFn: async ({ userId, telegramUsername }: { userId: string; telegramUsername?: string }) => {
      return await apiRequest('POST', '/api/admin/admins', { userId, telegramUsername });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/admins'] });
      setNewUserId('');
      setNewUsername('');
      toast({ title: '✅ Администратор добавлен' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Ошибка', 
        description: error.message || 'Не удалось добавить администратора',
        variant: 'destructive' 
      });
    },
  });

  // Remove admin mutation
  const removeAdminMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest('DELETE', `/api/admin/admins/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/admins'] });
      toast({ title: '✅ Администратор удален' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Ошибка', 
        description: error.message || 'Не удалось удалить администратора',
        variant: 'destructive' 
      });
    },
  });

  const handleAddAdmin = () => {
    if (!newUserId.trim()) {
      toast({ 
        title: 'Ошибка', 
        description: 'Введите User ID',
        variant: 'destructive' 
      });
      return;
    }
    addAdminMutation.mutate({ 
      userId: newUserId.trim(), 
      telegramUsername: newUsername.trim() || undefined 
    });
  };

  if (isLoading) {
    return <div className="py-4">Загрузка администраторов...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Add admin form */}
      <Card>
        <CardHeader>
          <CardTitle>Добавить администратора</CardTitle>
          <CardDescription>
            Введите Telegram User ID (обязательно) и username (опционально)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Input 
              placeholder="User ID (es: 123456789)"
              value={newUserId}
              onChange={(e) => setNewUserId(e.target.value)}
              data-testid="input-new-admin-userid"
            />
            <Input 
              placeholder="Username (опционально, без @)"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddAdmin()}
              data-testid="input-new-admin-username"
            />
            <Button 
              onClick={handleAddAdmin}
              disabled={addAdminMutation.isPending}
              data-testid="button-add-admin"
              className="w-full"
            >
              <Plus className="w-4 h-4 mr-2" />
              Добавить администратора
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Admins list */}
      <Card>
        <CardHeader>
          <CardTitle>Администраторы ({admins.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2" data-testid="admins-list">
            {admins.length === 0 ? (
              <p className="text-muted-foreground">Нет администраторов</p>
            ) : (
              admins.map((admin) => (
                <div 
                  key={admin.userId} 
                  className="flex items-center justify-between p-4 border rounded-md hover-elevate"
                  data-testid={`admin-item-${admin.userId}`}
                >
                  <div>
                    <p className="font-medium">@{admin.telegramUsername}</p>
                    <p className="text-sm text-muted-foreground">User ID: {admin.userId}</p>
                  </div>
                  <Button 
                    size="icon" 
                    variant="destructive" 
                    onClick={() => {
                      if (confirm(`Удалить администратора @${admin.telegramUsername}?`)) {
                        removeAdminMutation.mutate(admin.userId);
                      }
                    }}
                    disabled={removeAdminMutation.isPending}
                    data-testid={`button-remove-admin-${admin.userId}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ========== PRODUCT ASSOCIATIONS MANAGER ==========

type AssociationWithProducts = ProductAssociation & {
  sourceProduct: Product;
  targetProduct: Product;
};

function ProductAssociationsManager() {
  const { toast } = useToast();
  const [sourceProductId, setSourceProductId] = useState('');
  const [targetProductId, setTargetProductId] = useState('');
  const [reason, setReason] = useState('');

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['/api/products'],
  });

  const { data: associations = [], isLoading } = useQuery<AssociationWithProducts[]>({
    queryKey: ['/api/admin/product-associations'],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/admin/product-associations', {
        sourceProductId,
        targetProductId,
        reason: reason || null,
        sortOrder: 0,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/product-associations'] });
      setSourceProductId('');
      setTargetProductId('');
      setReason('');
      toast({ title: '✅ Ассоциация создана' });
    },
    onError: (error: any) => {
      toast({ 
        title: '❌ Ошибка', 
        description: error.message || 'Не удалось создать ассоциацию',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/admin/product-associations/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/product-associations'] });
      toast({ title: '✅ Ассоциация удалена' });
    },
    onError: (error: any) => {
      toast({ 
        title: '❌ Ошибка', 
        description: error.message || 'Не удалось удалить ассоциацию',
        variant: 'destructive',
      });
    },
  });

  const handleCreate = () => {
    if (!sourceProductId || !targetProductId) {
      toast({ 
        title: '⚠️ Внимание', 
        description: 'Выберите оба продукта',
        variant: 'destructive',
      });
      return;
    }
    createMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Создать ассоциацию</CardTitle>
          <CardDescription>
            Укажите продукт и рекомендуемый к нему товар
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Основной продукт</Label>
              <Select value={sourceProductId} onValueChange={setSourceProductId}>
                <SelectTrigger data-testid="select-source-product">
                  <SelectValue placeholder="Выберите продукт" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Рекомендуемый продукт</Label>
              <Select value={targetProductId} onValueChange={setTargetProductId}>
                <SelectTrigger data-testid="select-target-product">
                  <SelectValue placeholder="Выберите продукт" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Описание (опционально)</Label>
            <Input
              placeholder="Почему эти продукты хорошо сочетаются"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              data-testid="input-reason"
            />
          </div>

          <Button 
            onClick={handleCreate}
            disabled={createMutation.isPending}
            data-testid="button-create-association"
            className="w-full"
          >
            <Plus className="w-4 h-4 mr-2" />
            Создать ассоциацию
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ассоциации продуктов ({associations.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Загрузка...</p>
          ) : associations.length === 0 ? (
            <p className="text-muted-foreground">Нет ассоциаций</p>
          ) : (
            <div className="space-y-3" data-testid="associations-list">
              {associations.map((association) => (
                <div 
                  key={association.id} 
                  className="flex items-center justify-between p-4 border rounded-md hover-elevate"
                  data-testid={`association-item-${association.id}`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline">{association.sourceProduct.name}</Badge>
                      <span className="text-muted-foreground">→</span>
                      <Badge variant="default">{association.targetProduct.name}</Badge>
                    </div>
                    {association.reason && (
                      <p className="text-sm text-muted-foreground">{association.reason}</p>
                    )}
                  </div>
                  <Button 
                    size="icon" 
                    variant="destructive" 
                    onClick={() => {
                      if (confirm('Удалить эту ассоциацию?')) {
                        deleteMutation.mutate(association.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-association-${association.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== CLIENTS MANAGER ====================

interface ClientWithStats {
  id: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  customerName: string | null;
  primaryAddress: string | null;
  totalAddresses: number;
  stats: {
    totalOrders: number;
    totalSpent: string;
    lastOrderDate: string | null;
    lastOrderId: string | null;
  };
}

interface ClientDetail extends ClientWithStats {
  stats: {
    totalOrders: number;
    totalSpent: string;
    lastOrderDate: string | null;
    lastOrderId: string | null;
    averageOrderValue: string;
    topProducts: Array<{
      productId: string;
      productName: string;
      totalQuantity: number;
      totalSpent: string;
    }>;
  };
  orders: Order[];
  prizes: Array<{
    id: string;
    type: string;
    name: string;
    value: string;
    claimed: boolean;
    createdAt: string;
    products?: Product[];
  }>;
  addresses: Array<{
    id: string;
    label: string;
    fullAddress: string;
    phone: string | null;
    isDefault: boolean;
    city?: string | null;
    street?: string | null;
    building?: string | null;
    postalCode?: string | null;
    dadataFiasId?: string | null;
    latitude?: string | null;
    longitude?: string | null;
  }>;
}

function ClientsManager({ isMasterAdmin }: { isMasterAdmin: boolean }) {
  const { toast } = useToast();
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [editForm, setEditForm] = useState({
    customerName: '',
    phone: '',
    email: '',
  });
  const [editAddressDialogOpen, setEditAddressDialogOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<any | null>(null);
  const [editAddressForm, setEditAddressForm] = useState({
    label: '',
    fullAddress: '',
    phone: '',
    isDefault: false,
  });
  const [editAddressStructured, setEditAddressStructured] = useState<{
    city?: string;
    street?: string;
    building?: string;
    postalCode?: string;
    dadataFiasId?: string;
    latitude?: string;
    longitude?: string;
  }>({});

  // Fetch clients list
  const { data: clients = [], isLoading } = useQuery<ClientWithStats[]>({
    queryKey: ['/api/admin/clients'],
  });

  // Fetch selected client detail
  const { data: clientDetail, isLoading: isLoadingDetail, error: clientDetailError } = useQuery<ClientDetail>({
    queryKey: ['/api/admin/clients', selectedClient],
    enabled: !!selectedClient,
  });
  
  // Log errori per debug produzione
  if (clientDetailError) {
    console.error('[ClientDetail] Errore caricamento:', clientDetailError);
  }

  // Update client mutation
  const updateMutation = useMutation({
    mutationFn: async (data: { userId: string; updates: any }) => {
      await apiRequest('PUT', `/api/admin/clients/${data.userId}`, data.updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/clients'] });
      toast({ title: '✅ Клиент обновлен' });
      setEditDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: 'Ошибка',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleEditClick = (client: ClientDetail) => {
    setEditForm({
      customerName: client.customerName || '',
      phone: client.phone || '',
      email: client.email || '',
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!selectedClient) return;
    updateMutation.mutate({
      userId: selectedClient,
      updates: {
        customerName: editForm.customerName || null,
        phone: editForm.phone || null,
        email: editForm.email || null,
      },
    });
  };

  const handleEditAddressClick = (address: any) => {
    setEditingAddress(address);
    setEditAddressForm({
      label: address.label || '',
      fullAddress: address.fullAddress || '',
      phone: address.phone || '',
      isDefault: address.isDefault || false,
    });
    setEditAddressStructured({
      city: address.city || undefined,
      street: address.street || undefined,
      building: address.building || undefined,
      postalCode: address.postalCode || undefined,
      dadataFiasId: address.dadataFiasId || undefined,
      latitude: address.latitude || undefined,
      longitude: address.longitude || undefined,
    });
    setEditAddressDialogOpen(true);
  };

  const updateAddressMutation = useMutation({
    mutationFn: async (data: { userId: string; addressId: string; updates: any }) => {
      await apiRequest('PATCH', `/api/admin/clients/${data.userId}/addresses/${data.addressId}`, data.updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/clients'] });
      toast({ title: '✅ Адрес обновлен' });
      setEditAddressDialogOpen(false);
      setEditingAddress(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Ошибка',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSaveAddress = () => {
    if (!selectedClient || !editingAddress) return;
    updateAddressMutation.mutate({
      userId: selectedClient,
      addressId: editingAddress.id,
      updates: {
        label: editAddressForm.label || editingAddress.label,
        fullAddress: editAddressForm.fullAddress || editingAddress.fullAddress,
        phone: editAddressForm.phone || null,
        isDefault: editAddressForm.isDefault,
        city: editAddressStructured.city,
        street: editAddressStructured.street,
        building: editAddressStructured.building,
        postalCode: editAddressStructured.postalCode,
        dadataFiasId: editAddressStructured.dadataFiasId,
        latitude: editAddressStructured.latitude,
        longitude: editAddressStructured.longitude,
      },
    });
  };

  // Filter clients based on search query
  const filteredClients = clients.filter(client => {
    if (!searchQuery.trim()) return true;
    
    const query = searchQuery.toLowerCase().trim();
    
    // Search in customer name
    const customerName = client.customerName?.toLowerCase() || '';
    const firstName = client.firstName?.toLowerCase() || '';
    const lastName = client.lastName?.toLowerCase() || '';
    const fullName = `${firstName} ${lastName}`.toLowerCase();
    
    // Search in phone
    const phone = client.phone?.toLowerCase() || '';
    
    // Search in last order ID (safely handle missing stats)
    const orderId = client.stats?.lastOrderId?.toLowerCase() || '';
    
    return customerName.includes(query) || 
           firstName.includes(query) || 
           lastName.includes(query) ||
           fullName.includes(query) ||
           phone.includes(query) ||
           orderId.includes(query);
  });

  return (
    <div className="space-y-6">
      <Card data-testid="clients-list">
        <CardHeader>
          <CardTitle>Клиенты ({clients.length})</CardTitle>
          <CardDescription>Список всех клиентов с статистикой покупок</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Search field */}
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Поиск по имени, телефону или номеру заказа..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-clients"
              />
            </div>
          </div>

          {isLoading ? (
            <p className="text-muted-foreground">Загрузка...</p>
          ) : filteredClients.length === 0 ? (
            <p className="text-muted-foreground">
              {searchQuery ? 'Клиенты не найдены' : 'Нет клиентов'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Клиент</TableHead>
                  <TableHead>Контакты</TableHead>
                  <TableHead>Адрес</TableHead>
                  <TableHead>Заказов</TableHead>
                  <TableHead>Всего потрачено</TableHead>
                  <TableHead>Последний заказ</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client) => (
                  <TableRow 
                    key={client.id}
                    className="cursor-pointer hover-elevate"
                    onClick={() => setSelectedClient(client.id)}
                    data-testid={`client-row-${client.id}`}
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium">
                          {client.customerName || client.firstName || 'Имя не указано'}
                        </p>
                        {client.username && (
                          <p className="text-sm text-muted-foreground">@{client.username}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {client.phone && <p>{client.phone}</p>}
                        {client.email && <p className="text-muted-foreground">{client.email}</p>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm max-w-xs">
                        {client.primaryAddress ? (
                          <>
                            <p className="truncate" title={client.primaryAddress}>
                              {client.primaryAddress}
                            </p>
                            {client.totalAddresses > 1 && (
                              <p className="text-muted-foreground text-xs">
                                +{client.totalAddresses - 1} адрес
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="text-muted-foreground">—</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{client.stats.totalOrders}</TableCell>
                    <TableCell className="font-semibold">{client.stats.totalSpent} ₽</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {client.stats.lastOrderDate 
                        ? format(new Date(client.stats.lastOrderDate), 'dd.MM.yyyy HH:mm')
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedClient(client.id);
                        }}
                        data-testid={`button-view-client-${client.id}`}
                      >
                        Подробнее
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Client Detail Dialog */}
      <Dialog open={!!selectedClient} onOpenChange={(open) => !open && setSelectedClient(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {isLoadingDetail ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center space-y-3">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="text-sm text-muted-foreground">Загрузка данных клиента...</p>
              </div>
            </div>
          ) : clientDetailError ? (
            <div className="flex items-center justify-center py-12">
              <div className="max-w-md p-6 bg-destructive/10 border border-destructive/20 rounded-lg">
                <h3 className="font-semibold text-destructive mb-2">Ошибка загрузки данных клиента</h3>
                <p className="text-sm text-destructive/80 mb-3">
                  {clientDetailError instanceof Error ? clientDetailError.message : 'Неизвестная ошибка'}
                </p>
                <p className="text-xs text-muted-foreground border-t border-border pt-3">
                  💡 <strong>Совет:</strong> Если видите ошибку авторизации, попробуйте полностью закрыть и снова открыть приложение в Telegram
                </p>
              </div>
            </div>
          ) : clientDetail ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {clientDetail.customerName || clientDetail.firstName || 'Клиент'} 
                  {clientDetail.username && <span className="text-muted-foreground ml-2">@{clientDetail.username}</span>}
                </DialogTitle>
                <DialogDescription>
                  ID: {clientDetail.id}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6">
                {/* Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardDescription>Всего заказов</CardDescription>
                      <CardTitle className="text-2xl">{clientDetail.stats.totalOrders}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardDescription>Всего потрачено</CardDescription>
                      <CardTitle className="text-2xl">{clientDetail.stats.totalSpent} ₽</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardDescription>Средний чек</CardDescription>
                      <CardTitle className="text-2xl">{clientDetail.stats.averageOrderValue} ₽</CardTitle>
                    </CardHeader>
                  </Card>
                </div>

                {/* Contact Info */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Контактная информация</CardTitle>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEditClick(clientDetail)}
                        data-testid="button-edit-client"
                      >
                        <Edit className="w-4 h-4 mr-2" />
                        Редактировать
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Имя</p>
                      <p className="font-medium">{clientDetail.customerName || '—'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Telegram</p>
                      <p className="font-medium">{clientDetail.username ? `@${clientDetail.username}` : '—'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Телефон</p>
                      <p className="font-medium">{clientDetail.phone || '—'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Email</p>
                      <p className="font-medium">{clientDetail.email || '—'}</p>
                    </div>
                  </CardContent>
                </Card>

                {/* Addresses */}
                {clientDetail.addresses && clientDetail.addresses.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Адреса клиента</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {clientDetail.addresses.map((address: any) => (
                          <div key={address.id} className="p-3 border rounded-md">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="font-medium">{address.label}</p>
                                  {address.isDefault && (
                                    <Badge variant="default" className="text-xs">По умолчанию</Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground">{address.fullAddress}</p>
                                {address.phone && (
                                  <p className="text-sm text-muted-foreground mt-1">Тел: {address.phone}</p>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleEditAddressClick(address)}
                                  data-testid={`button-edit-address-${address.id}`}
                                >
                                  <Edit className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={async () => {
                                    if (confirm('Удалить этот адрес?')) {
                                      try {
                                        await apiRequest('DELETE', `/api/admin/clients/${clientDetail.id}/addresses/${address.id}`, {});
                                        toast({ title: 'Адрес удален' });
                                        queryClient.invalidateQueries({ queryKey: ['/api/admin/clients', selectedClient] });
                                      } catch (error: any) {
                                        toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
                                      }
                                    }
                                  }}
                                  data-testid={`button-delete-address-${address.id}`}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Top Products */}
                {clientDetail.stats.topProducts.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Топ-5 продуктов</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {clientDetail.stats.topProducts.map((product, index) => (
                          <div key={product.productId} className="flex items-center justify-between p-3 border rounded-md">
                            <div className="flex items-center gap-3">
                              <Badge variant="outline">{index + 1}</Badge>
                              <div>
                                <p className="font-medium">{product.productName}</p>
                                <p className="text-sm text-muted-foreground">
                                  Количество: {product.totalQuantity}
                                </p>
                              </div>
                            </div>
                            <p className="font-semibold">{product.totalSpent} ₽</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Prizes */}
                {clientDetail.prizes && clientDetail.prizes.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Призы клиента</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {clientDetail.prizes.map((prize: any) => (
                          <div key={prize.id} className="p-3 border rounded-md">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1">
                                <p className="font-medium">{prize.name}</p>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {prize.type === 'gift' && 'Подарок'}
                                  {prize.type === 'discount' && 'Скидка'}
                                  {prize.type === 'delivery_coupon' && 'Купон на доставку'}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {format(new Date(prize.createdAt), 'dd.MM.yyyy HH:mm')}
                                </p>
                              </div>
                              <div className="flex flex-col items-end gap-2">
                                {prize.claimed ? (
                                  <Badge variant="secondary">Использован</Badge>
                                ) : (
                                  <Badge>Активен</Badge>
                                )}
                                {prize.type === 'gift' && !prize.claimed && (
                                  <Button
                                    size="sm"
                                    onClick={async () => {
                                      try {
                                        await apiRequest('POST', `/api/admin/prizes/${prize.id}/add-to-cart`, {});
                                        toast({ title: 'Продукты добавлены в корзину клиента' });
                                        queryClient.invalidateQueries({ queryKey: ['/api/admin/clients', selectedClient] });
                                      } catch (error: any) {
                                        toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
                                      }
                                    }}
                                    data-testid={`button-add-prize-to-cart-${prize.id}`}
                                  >
                                    Добавить в корзину
                                  </Button>
                                )}
                              </div>
                            </div>
                            {prize.products && prize.products.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {prize.products.map((p: any) => (
                                  <p key={p.id} className="text-sm text-muted-foreground">• {p.name}</p>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Orders */}
                <Card>
                  <CardHeader>
                    <CardTitle>История заказов</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {clientDetail.orders.map((order) => (
                        <div key={order.id} className="p-4 border rounded-md space-y-2">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1">
                              <p className="font-medium">Заказ #{order.id.slice(0, 8)}</p>
                              <p className="text-sm text-muted-foreground">
                                {format(new Date(order.createdAt), 'dd.MM.yyyy HH:mm')}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold">{order.amount} ₽</p>
                              <Badge variant={order.status === 'ПОЛУЧЕН' ? 'default' : 'secondary'}>
                                {order.status}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm text-muted-foreground">
                              {order.items.length} {order.items.length === 1 ? 'товар' : order.items.length < 5 ? 'товара' : 'товаров'}
                            </div>
                            {isOrderEditable(order.status) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingOrder(order)}
                                data-testid={`button-edit-client-order-${order.id}`}
                              >
                                <Edit className="w-3 h-3 mr-1" />
                                Редактировать
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">Нет данных клиента</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Client Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Редактировать клиента</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Имя</Label>
              <Input
                value={editForm.customerName}
                onChange={(e) => setEditForm({ ...editForm, customerName: e.target.value })}
                placeholder="Имя клиента"
                data-testid="input-edit-name"
              />
            </div>
            <div>
              <Label>Телефон</Label>
              <Input
                value={editForm.phone}
                onChange={(e) => {
                  const normalizedPhone = e.target.value ? normalizePhoneNumber(e.target.value) : '';
                  setEditForm({ ...editForm, phone: normalizedPhone });
                }}
                placeholder="+7..."
                data-testid="input-edit-phone"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                placeholder="email@example.com"
                data-testid="input-edit-email"
              />
            </div>
            <Button
              className="w-full"
              onClick={handleSaveEdit}
              disabled={updateMutation.isPending}
              data-testid="button-save-edit"
            >
              {updateMutation.isPending ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Address Dialog */}
      <Dialog open={editAddressDialogOpen} onOpenChange={setEditAddressDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Редактировать адрес</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Название адреса</Label>
              <Input
                value={editAddressForm.label}
                onChange={(e) => setEditAddressForm({ ...editAddressForm, label: e.target.value })}
                placeholder="Дом, Офис и т.д."
                data-testid="input-edit-address-label"
              />
            </div>
            <div>
              <Label>Полный адрес</Label>
              <AddressAutocomplete
                value={editAddressForm.fullAddress}
                onChange={(value, suggestion) => {
                  setEditAddressForm({ ...editAddressForm, fullAddress: value });
                  if (suggestion) {
                    setEditAddressStructured({
                      city: suggestion.city || undefined,
                      street: suggestion.street || undefined,
                      building: suggestion.building || undefined,
                      postalCode: suggestion.postalCode || undefined,
                      dadataFiasId: suggestion.fiasId,
                      latitude: suggestion.geoLat || undefined,
                      longitude: suggestion.geoLon || undefined,
                    });
                  } else {
                    setEditAddressStructured({});
                  }
                }}
                placeholder="Начните вводить адрес..."
                data-testid="input-edit-address-full"
              />
            </div>
            <div>
              <Label>Телефон</Label>
              <Input
                value={editAddressForm.phone}
                onChange={(e) => {
                  const normalizedPhone = e.target.value ? normalizePhoneNumber(e.target.value) : '';
                  setEditAddressForm({ ...editAddressForm, phone: normalizedPhone });
                }}
                placeholder="+7..."
                data-testid="input-edit-address-phone"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isDefault"
                checked={editAddressForm.isDefault}
                onChange={(e) => setEditAddressForm({ ...editAddressForm, isDefault: e.target.checked })}
                data-testid="checkbox-edit-address-default"
              />
              <Label htmlFor="isDefault">По умолчанию</Label>
            </div>
            <Button
              className="w-full"
              onClick={handleSaveAddress}
              disabled={updateAddressMutation.isPending}
              data-testid="button-save-address"
            >
              {updateAddressMutation.isPending ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Order Edit Dialog */}
      {editingOrder && (
        <OrderEditDialog
          order={editingOrder}
          open={!!editingOrder}
          onOpenChange={(open) => {
            if (!open) setEditingOrder(null);
          }}
          isMasterAdmin={isMasterAdmin}
        />
      )}
    </div>
  );
}
