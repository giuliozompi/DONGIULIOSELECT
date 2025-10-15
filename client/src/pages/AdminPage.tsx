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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { insertCategorySchema, insertProductSchema, type Category, type Product, type Order, type Admin, type ProductAssociation, type AdminActionLog } from '@shared/schema';
import { Trash2, Edit, Plus, Package, Truck, CheckCircle2, XCircle, Settings, ClipboardList, FolderTree, Link, ShoppingCart, Users, FileText, Upload, ImagePlus, AlertTriangle } from 'lucide-react';
import { ImageUploadField } from '@/components/ImageUploadField';
import { getAbsoluteImageUrl } from '@/lib/imageUtils';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { SubmitHandler } from 'react-hook-form';
import { format } from 'date-fns';

// Nota: Telegram types già definiti in lib/telegram.ts

// Componente interno che può usare useSidebar
function AdminContent({ isMasterAdmin }: { isMasterAdmin: boolean }) {
  const [activeSection, setActiveSection] = useState('orders');
  const { isMobile, open, setOpen, setOpenMobile } = useSidebar();

  // Forza l'apertura della sidebar solo al mount iniziale (quando si accede a /admin)
  useEffect(() => {
    if (!isMobile) {
      setOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run solo al mount

  const handleNavClick = (section: string) => {
    setActiveSection(section);
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
          {activeSection === 'categories' && <CategoriesManager />}
          {activeSection === 'products' && <ProductsManager />}
          {activeSection === 'associations' && <ProductAssociationsManager />}
          {activeSection === 'orders' && <OrdersManager isMasterAdmin={isMasterAdmin} />}
          {activeSection === 'clients' && <ClientsManager />}
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

function CategoriesManager() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [hasUnsavedImage, setHasUnsavedImage] = useState(false);

  // Fetch categories
  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ['/api/categories'],
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
      queryClient.invalidateQueries({ queryKey: ['/api/categories'] });
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
      queryClient.invalidateQueries({ queryKey: ['/api/categories'] });
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
      queryClient.invalidateQueries({ queryKey: ['/api/categories'] });
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
                className="overflow-hidden cursor-pointer hover-elevate active-elevate-2"
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
                    <h3 className="text-white font-semibold text-base">
                      {category.name}
                    </h3>
                    <p className="text-white/70 text-xs">
                      /{category.slug}
                    </p>
                  </div>
                  <div className="absolute top-2 right-2 flex gap-2">
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

type ProductFormData = z.infer<typeof insertProductSchema>;

function ProductsManager() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Fetch products and categories
  const { data: products = [], isLoading: isLoadingProducts } = useQuery<Product[]>({
    queryKey: ['/api/products'],
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['/api/categories'],
  });

  // Form - usa valori temporanei per input arrays
  type FormValues = Omit<ProductFormData, 'images' | 'tasteVariations'> & {
    images: string; // comma-separated
    tasteVariations: string; // comma-separated
  };

  const form = useForm<FormValues>({
    defaultValues: {
      name: '',
      slug: '',
      categoryId: '',
      images: '',
      price: '',
      priceOld: null,
      unit: 'кг',
      inStock: true,
      tasteVariations: '',
      descriptionShort: null,
      descriptionFull: null,
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      const response = await apiRequest('POST', '/api/admin/products', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      form.reset();
      toast({ title: '✅ Продукт создан' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Ошибка', 
        description: error.message || 'Не удалось создать продукт',
        variant: 'destructive' 
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ProductFormData> }) => {
      const response = await apiRequest('PATCH', `/api/admin/products/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      // NON resettare il form dopo il salvataggio - mantieni modalità modifica
      toast({ title: '✅ Продукт обновлен' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Ошибка', 
        description: error.message || 'Не удалось обновить продукт',
        variant: 'destructive' 
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/admin/products/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
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

  const onSubmit: SubmitHandler<FormValues> = (data) => {
    // Converti stringhe separate da virgola in array
    const processedData: ProductFormData = {
      ...data,
      images: data.images ? data.images.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      tasteVariations: data.tasteVariations.split(',').map((s: string) => s.trim()).filter(Boolean),
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: processedData });
    } else {
      createMutation.mutate(processedData);
    }
  };

  const handleEdit = (product: Product) => {
    setEditingId(product.id);
    setShowForm(true);
    form.reset({
      name: product.name,
      slug: product.slug,
      categoryId: product.categoryId,
      images: product.images.join(', '),
      price: product.price,
      priceOld: product.priceOld,
      unit: product.unit,
      inStock: product.inStock,
      tasteVariations: product.tasteVariations.join(', '),
      descriptionShort: product.descriptionShort,
      descriptionFull: product.descriptionFull,
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setShowForm(false);
    form.reset();
  };

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
              onClick={() => {
                setEditingId(null);
                setShowForm(true);
                form.reset();
              }}
              data-testid="button-new-product"
            >
              <Plus className="w-4 h-4 mr-2" />
              Новый продукт
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {products.map((product) => (
              <Card
                key={product.id}
                className="overflow-hidden cursor-pointer hover-elevate active-elevate-2"
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
                    <h3 className="text-white font-semibold text-base">
                      {product.name}
                    </h3>
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
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Form - mostrato solo quando necessario */}
      {showForm && (
        <Card data-testid="product-form">
          <CardHeader>
            <CardTitle>{editingId ? 'Редактировать продукт' : 'Создать продукт'}</CardTitle>
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
                      <Input {...field} data-testid="input-product-name" />
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
                      <Input {...field} data-testid="input-product-slug" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Категория</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-product-category">
                          <SelectValue placeholder="Выберите категорию" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
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
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Цена (₽)</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-product-price" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Единица измерения</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-product-unit">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="кг">кг</SelectItem>
                        <SelectItem value="г">г</SelectItem>
                        <SelectItem value="л">л</SelectItem>
                        <SelectItem value="мл">мл</SelectItem>
                        <SelectItem value="шт">шт</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="images"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Изображения продукта (макс. 5)</FormLabel>
                    <FormControl>
                      <ImageUploadField
                        value={field.value}
                        onChange={field.onChange}
                        multiple={true}
                        maxFiles={5}
                        onUploadComplete={(paths) => {
                          const count = paths.split(',').length;
                          toast({
                            title: `Загружено ${count} ${count === 1 ? 'изображение' : 'изображений'}`,
                            description: 'Нажмите "Обновить" чтобы сохранить изменения'
                          });
                        }}
                        onUploadError={(error) => {
                          toast({
                            title: 'Ошибка загрузки',
                            description: error,
                            variant: 'destructive'
                          });
                        }}
                        data-testid="product-images-upload"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="priceOld"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Старая цена (₽, опционально)</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        value={field.value || ''}
                        data-testid="input-product-price-old"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="tasteVariations"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Вариации вкуса (через запятую)</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="Классический, Острый, С трюфелем"
                        data-testid="input-product-taste"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="descriptionShort"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Краткое описание (опционально)</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        value={field.value || ''}
                        data-testid="input-product-desc-short"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="descriptionFull"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Полное описание (опционально)</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        value={field.value || ''}
                        rows={6}
                        data-testid="input-product-desc-full"
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
                  data-testid="button-submit-product"
                >
                  {editingId ? 'Обновить' : 'Создать'}
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleCancelEdit}
                  data-testid="button-cancel-edit-product"
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

// ========== ORDER EDIT DIALOG ==========

interface OrderEditDialogProps {
  order: Order;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function OrderEditDialog({ order, open, onOpenChange }: OrderEditDialogProps) {
  const { toast } = useToast();
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [newQuantity, setNewQuantity] = useState<number>(0);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [addQuantity, setAddQuantity] = useState<number>(1);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState<string>('');
  const [newAddress, setNewAddress] = useState<string>(order.deliveryAddress || '');
  
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
      return await apiRequest('POST', `/api/admin/orders/${order.id}/change-address`, { 
        deliveryAddress: newAddress 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders', order.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders', order.id, 'logs'] });
      toast({ title: '✅ Адрес обновлен' });
    },
    onError: (error: any) => {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
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

          {/* Change Address */}
          <div className="space-y-3">
            <h3 className="font-semibold">Изменить адрес доставки</h3>
            <div className="flex gap-2">
              <Textarea
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                className="flex-1"
                placeholder="Адрес доставки"
                disabled={!editable}
                data-testid="textarea-delivery-address"
              />
              <Button 
                onClick={() => {
                  if (newAddress && newAddress !== order.deliveryAddress) {
                    changeAddressMutation.mutate();
                  }
                }}
                disabled={!editable || !newAddress || newAddress === order.deliveryAddress}
                data-testid="button-change-address"
              >
                Обновить
              </Button>
            </div>
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
  
  // Fetch orders with filter
  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ['/api/admin/orders', statusFilter !== 'all' ? statusFilter : undefined],
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
          <CardTitle>Заказы ({orders.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4" data-testid="orders-list">
            {orders.length === 0 ? (
              <p className="text-muted-foreground">Нет заказов</p>
            ) : (
              orders.map((order) => (
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
                      onValueChange={(newStatus) => updateStatusMutation.mutate({ orderId: order.id, status: newStatus })}
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
                    
                    {order.status === 'ОПЛАЧЕН' && (
                      <Button 
                        size="sm"
                        onClick={() => callCourierMutation.mutate(order.id)}
                        disabled={callCourierMutation.isPending}
                        data-testid={`button-call-courier-${order.id}`}
                      >
                        <Truck className="w-4 h-4 mr-2" />
                        Вызвать курьера
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
        />
      )}
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
}

function ClientsManager() {
  const { toast } = useToast();
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editForm, setEditForm] = useState({
    customerName: '',
    phone: '',
    email: '',
  });

  // Fetch clients list
  const { data: clients = [], isLoading } = useQuery<ClientWithStats[]>({
    queryKey: ['/api/admin/clients'],
  });

  // Fetch selected client detail
  const { data: clientDetail } = useQuery<ClientDetail>({
    queryKey: ['/api/admin/clients', selectedClient],
    enabled: !!selectedClient,
  });

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

  return (
    <div className="space-y-6">
      <Card data-testid="clients-list">
        <CardHeader>
          <CardTitle>Клиенты ({clients.length})</CardTitle>
          <CardDescription>Список всех клиентов с статистикой покупок</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Загрузка...</p>
          ) : clients.length === 0 ? (
            <p className="text-muted-foreground">Нет клиентов</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Клиент</TableHead>
                  <TableHead>Контакты</TableHead>
                  <TableHead>Заказов</TableHead>
                  <TableHead>Всего потрачено</TableHead>
                  <TableHead>Последний заказ</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((client) => (
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
          {clientDetail && (
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
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
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

      {/* Order Edit Dialog */}
      {editingOrder && (
        <OrderEditDialog
          order={editingOrder}
          open={!!editingOrder}
          onOpenChange={(open) => {
            if (!open) setEditingOrder(null);
          }}
        />
      )}
    </div>
  );
}
