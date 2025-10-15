import { useEffect } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { insertProductSchema, type Product, type Category } from '@shared/schema';
import { ArrowLeft, Save } from 'lucide-react';
import { ImageUploadField } from '@/components/ImageUploadField';
import type { SubmitHandler } from 'react-hook-form';

type ProductFormData = z.infer<typeof insertProductSchema>;

// Form type con stringhe invece di array
type FormValues = Omit<ProductFormData, 'images' | 'tasteVariations'> & {
  images: string;
  tasteVariations: string;
};

export default function EditProductPage() {
  const [, params] = useRoute('/admin/products/:id');
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const productId = params?.id;

  // Fetch categories
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['/api/categories'],
  });

  // Fetch all products
  const { data: allProducts = [], isLoading } = useQuery<Product[]>({
    queryKey: ['/api/products'],
  });

  // Find specific product
  const product = allProducts.find(p => p.id === productId);

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

  // Update form when product loads
  useEffect(() => {
    if (product) {
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
    }
  }, [product, form]);

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<ProductFormData>) => {
      const response = await apiRequest('PATCH', `/api/admin/products/${productId}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      toast({ title: '✅ Продукт обновлен' });
      setLocation('/admin');
    },
    onError: (error: any) => {
      toast({ 
        title: 'Ошибка', 
        description: error.message || 'Не удалось обновить продукт',
        variant: 'destructive' 
      });
    },
  });

  const onSubmit: SubmitHandler<FormValues> = (data) => {
    const processedData: ProductFormData = {
      ...data,
      images: data.images ? data.images.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      tasteVariations: data.tasteVariations.split(',').map((s: string) => s.trim()).filter(Boolean),
    };
    updateMutation.mutate(processedData);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Загрузка...</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Продукт не найден</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      <div className="container mx-auto p-6 max-w-2xl">
        <Button
          variant="ghost"
          onClick={() => setLocation('/admin')}
          className="mb-4"
          data-testid="button-back-to-admin"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Назад к панели
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Редактировать продукт</CardTitle>
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
                    disabled={updateMutation.isPending}
                    data-testid="button-save-product"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {updateMutation.isPending ? 'Сохранение...' : 'Обновить'}
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setLocation('/admin')}
                    data-testid="button-cancel-edit"
                  >
                    Отмена
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
