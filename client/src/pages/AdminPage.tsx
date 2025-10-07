import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { insertCategorySchema, insertProductSchema, type Category, type Product, type Order, type Admin } from '@shared/schema';
import { Trash2, Edit, Plus, Package, Truck, CheckCircle2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { SubmitHandler } from 'react-hook-form';
import { format } from 'date-fns';

// Nota: Telegram types già definiti in lib/telegram.ts

export default function AdminPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('categories');

  // Check admin status
  const { data: adminCheck, isLoading: isCheckingAdmin } = useQuery<{ isAdmin: boolean }>({
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

  return (
    <div className="container mx-auto py-6 px-4" data-testid="admin-page">
      <h1 className="text-3xl font-bold mb-6">Панель администратора</h1>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4" data-testid="admin-tabs">
          <TabsTrigger value="categories" data-testid="tab-categories">Категории</TabsTrigger>
          <TabsTrigger value="products" data-testid="tab-products">Продукты</TabsTrigger>
          <TabsTrigger value="orders" data-testid="tab-orders">Заказы</TabsTrigger>
          <TabsTrigger value="admins" data-testid="tab-admins">Админы</TabsTrigger>
        </TabsList>
        
        <TabsContent value="categories">
          <CategoriesManager />
        </TabsContent>
        
        <TabsContent value="products">
          <ProductsManager />
        </TabsContent>
        
        <TabsContent value="orders">
          <OrdersManager />
        </TabsContent>
        
        <TabsContent value="admins">
          <AdminsManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ========== CATEGORIES MANAGER ==========

type CategoryFormData = z.infer<typeof insertCategorySchema>;

function CategoriesManager() {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);

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
      form.reset();
      setEditingId(null);
      toast({ title: '✅ Категория обновлена' });
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
    form.reset({
      name: category.name,
      slug: category.slug,
      parentId: category.parentId,
      sortOrder: category.sortOrder,
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    form.reset();
  };

  if (isLoading) {
    return <div className="py-4">Загрузка категорий...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Form */}
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
                >
                  {editingId ? 'Обновить' : 'Создать'}
                </Button>
                {editingId && (
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={handleCancelEdit}
                    data-testid="button-cancel-edit-category"
                  >
                    Отменить
                  </Button>
                )}
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardHeader>
          <CardTitle>Все категории ({categories.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2" data-testid="category-list">
            {categories.map((category) => (
              <div 
                key={category.id} 
                className="flex items-center justify-between p-4 border rounded-md hover-elevate"
                data-testid={`category-item-${category.id}`}
              >
                <div>
                  <p className="font-medium">{category.name}</p>
                  <p className="text-sm text-muted-foreground">/{category.slug}</p>
                </div>
                <div className="flex gap-2">
                  <Button 
                    size="icon" 
                    variant="outline" 
                    onClick={() => handleEdit(category)}
                    data-testid={`button-edit-category-${category.id}`}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button 
                    size="icon" 
                    variant="destructive" 
                    onClick={() => {
                      if (confirm('Удалить категорию?')) {
                        deleteMutation.mutate(category.id);
                      }
                    }}
                    data-testid={`button-delete-category-${category.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ========== PRODUCTS MANAGER ==========

type ProductFormData = z.infer<typeof insertProductSchema>;

function ProductsManager() {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);

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
      form.reset();
      setEditingId(null);
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
      images: data.images.split(',').map((s: string) => s.trim()).filter(Boolean),
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
    form.reset();
  };

  if (isLoadingProducts) {
    return <div className="py-4">Загрузка продуктов...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Form */}
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
                    <FormLabel>URL изображений (через запятую)</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        placeholder="https://example.com/img1.jpg, https://example.com/img2.jpg"
                        data-testid="input-product-images"
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
                {editingId && (
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={handleCancelEdit}
                    data-testid="button-cancel-edit-product"
                  >
                    Отменить
                  </Button>
                )}
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardHeader>
          <CardTitle>Все продукты ({products.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2" data-testid="product-list">
            {products.map((product) => (
              <div 
                key={product.id} 
                className="flex items-center justify-between p-4 border rounded-md hover-elevate"
                data-testid={`product-item-${product.id}`}
              >
                <div className="flex-1">
                  <p className="font-medium">{product.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {product.price}₽/{product.unit} • /{product.slug}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button 
                    size="icon" 
                    variant="outline" 
                    onClick={() => handleEdit(product)}
                    data-testid={`button-edit-product-${product.id}`}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button 
                    size="icon" 
                    variant="destructive" 
                    onClick={() => {
                      if (confirm('Удалить продукт?')) {
                        deleteMutation.mutate(product.id);
                      }
                    }}
                    data-testid={`button-delete-product-${product.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
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

  // Fetch all products for adding
  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ['/api/products'],
  });

  // Fetch order logs
  const { data: logs = [] } = useQuery<any[]>({
    queryKey: [`/api/admin/orders/${order.id}/logs`],
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
      queryClient.invalidateQueries({ queryKey: [`/api/admin/orders/${order.id}/logs`] });
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
      queryClient.invalidateQueries({ queryKey: [`/api/admin/orders/${order.id}/logs`] });
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
      queryClient.invalidateQueries({ queryKey: [`/api/admin/orders/${order.id}/logs`] });
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
      queryClient.invalidateQueries({ queryKey: [`/api/admin/orders/${order.id}/logs`] });
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
      queryClient.invalidateQueries({ queryKey: [`/api/admin/orders/${order.id}/logs`] });
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

        <div className="space-y-6 py-4">
          {/* Products */}
          <div className="space-y-3">
            <h3 className="font-semibold">Продукты</h3>
            {order.items.map((item: any) => (
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
              <Select value={selectedProductId} onValueChange={setSelectedProductId}>
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
                data-testid="input-add-quantity"
              />
              <Button 
                onClick={() => {
                  if (selectedProductId && addQuantity > 0) {
                    addProductMutation.mutate({ productId: selectedProductId, quantity: addQuantity });
                  }
                }}
                disabled={!selectedProductId || addQuantity <= 0}
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
              <Select value={discountType} onValueChange={(val) => setDiscountType(val as 'percentage' | 'fixed')}>
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
                data-testid="input-discount-value"
              />
              <Button 
                onClick={() => {
                  if (discountValue && parseFloat(discountValue) > 0) {
                    applyDiscountMutation.mutate();
                  }
                }}
                disabled={!discountValue || parseFloat(discountValue) <= 0}
                data-testid="button-apply-discount"
              >
                Применить
              </Button>
            </div>
            {order.discount && (
              <p className="text-sm text-muted-foreground">
                Текущая скидка: {order.discount}₽ 
                ({order.discountType === 'percentage' ? `${order.discountValue}%` : `${order.discountValue}₽`})
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
                data-testid="textarea-delivery-address"
              />
              <Button 
                onClick={() => {
                  if (newAddress && newAddress !== order.deliveryAddress) {
                    changeAddressMutation.mutate();
                  }
                }}
                disabled={!newAddress || newAddress === order.deliveryAddress}
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
              <span>{order.amount}₽</span>
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

function OrdersManager() {
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
                      disabled={updateStatusMutation.isPending}
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
                  </div>

                  <div className="flex gap-2">
                    <Button 
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingOrder(order)}
                      data-testid={`button-edit-order-${order.id}`}
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Редактировать
                    </Button>
                    
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
