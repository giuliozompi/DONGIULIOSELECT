import { useLocation } from 'wouter';
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
import { insertProductSchema, type Category } from '@shared/schema';
import { ArrowLeft, Save } from 'lucide-react';
import { ImageUploadField } from '@/components/ImageUploadField';
import type { SubmitHandler } from 'react-hook-form';

type ProductFormData = z.infer<typeof insertProductSchema>;

// Form type con stringhe invece di array
type FormValues = Omit<ProductFormData, 'images' | 'tasteVariations'> & {
  images: string;
  tasteVariations: string;
};

export default function NewProductPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Fetch categories
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['/api/categories'],
  });

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

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const imagesArray = values.images
        .split(',')
        .map(img => img.trim())
        .filter(img => img.length > 0);
      
      const tasteVariationsArray = values.tasteVariations
        .split(',')
        .map(v => v.trim())
        .filter(v => v.length > 0);

      const data: ProductFormData = {
        ...values,
        images: imagesArray,
        tasteVariations: tasteVariationsArray,
        priceOld: values.priceOld || null,
        descriptionShort: values.descriptionShort || null,
        descriptionFull: values.descriptionFull || null,
      };

      return await apiRequest('POST', '/api/admin/products', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      queryClient.invalidateQueries({ queryKey: ['/api/categories'] });
      toast({ title: '✅ Продукт создан успешно' });
      setLocation('/admin?section=products');
    },
    onError: (error: Error) => {
      toast({
        title: 'Ошибка создания продукта',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const onSubmit: SubmitHandler<FormValues> = (values) => {
    createMutation.mutate(values);
  };

  return (
    <div className="container mx-auto py-6 px-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation('/admin?section=products')}
              data-testid="button-back-to-products"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <CardTitle>Создать новый продукт</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                rules={{ required: 'Название обязательно' }}
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
                rules={{ required: 'Slug обязателен' }}
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
                rules={{ required: 'Категория обязательна' }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Категория</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-category">
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
                name="images"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Изображения (URL через запятую)</FormLabel>
                    <FormControl>
                      <ImageUploadField
                        value={field.value}
                        onChange={field.onChange}
                        data-testid="input-product-images"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="price"
                  rules={{ required: 'Цена обязательна' }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Цена</FormLabel>
                      <FormControl>
                        <Input {...field} type="text" data-testid="input-product-price" />
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
                      <FormLabel>Старая цена (опционально)</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          type="text" 
                          value={field.value || ''}
                          data-testid="input-product-price-old"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="unit"
                rules={{ required: 'Единица измерения обязательна' }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Единица измерения</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-unit">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="кг">кг</SelectItem>
                        <SelectItem value="г">г</SelectItem>
                        <SelectItem value="шт">шт</SelectItem>
                        <SelectItem value="л">л</SelectItem>
                        <SelectItem value="мл">мл</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="inStock"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Доступность</FormLabel>
                    <Select 
                      onValueChange={(value) => field.onChange(value === 'true')} 
                      value={field.value ? 'true' : 'false'}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-in-stock">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="true">В наличии</SelectItem>
                        <SelectItem value="false">Нет в наличии</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tasteVariations"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Вкусовые вариации (через запятую)</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="например: Сливочный, Острый, Пряный"
                        data-testid="input-taste-variations"
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
                    <FormLabel>Краткое описание</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        value={field.value || ''}
                        rows={2}
                        data-testid="textarea-description-short"
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
                    <FormLabel>Полное описание</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        value={field.value || ''}
                        rows={4}
                        data-testid="textarea-description-full"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-3 pt-4 border-t">
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  data-testid="button-save-product"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {createMutation.isPending ? 'Сохранение...' : 'Создать продукт'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocation('/admin?section=products')}
                  data-testid="button-cancel"
                >
                  Отменить
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
