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
import { ArrowLeft, Save, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { ImageUploadField } from '@/components/ImageUploadField';
import type { SubmitHandler } from 'react-hook-form';

type ProductFormData = z.infer<typeof insertProductSchema>;

// Form type con stringhe invece di array e oggetti
type FormValues = Omit<ProductFormData, 'images' | 'tasteVariations' | 'nutrition'> & {
  images: string;
  tasteVariations: string;
  // Campi БЖУ e состав come stringhe
  nutritionProteins: string;
  nutritionFats: string;
  nutritionCarbs: string;
  nutritionCalories: string;
  nutritionComposition: string;
  nutritionAdditionalInfo: string;
};

// Component to copy product URL to clipboard
function CopyProductUrlButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  
  const productUrl = `https://t.me/dongiuliocatalog_bot/DGSCatalog?startapp=product_${slug}`;
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(productUrl);
      setCopied(true);
      toast({ title: 'Ссылка скопирована в буфер обмена' });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({ 
        title: 'Ошибка копирования', 
        description: 'Не удалось скопировать ссылку',
        variant: 'destructive' 
      });
    }
  };
  
  return (
    <div className="flex items-center gap-2 mt-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleCopy}
        data-testid="button-copy-product-url"
        className="text-xs"
      >
        {copied ? (
          <>
            <Check className="w-3 h-3 mr-1" />
            Скопировано
          </>
        ) : (
          <>
            <Copy className="w-3 h-3 mr-1" />
            Скопировать ссылку
          </>
        )}
      </Button>
      <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={productUrl}>
        {productUrl}
      </span>
    </div>
  );
}

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
      requiresMarking: false,
      sortPriority: 0,
      tasteVariations: '',
      descriptionShort: null,
      descriptionFull: null,
      nutritionProteins: '',
      nutritionFats: '',
      nutritionCarbs: '',
      nutritionCalories: '',
      nutritionComposition: '',
      nutritionAdditionalInfo: '',
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
        requiresMarking: product.requiresMarking,
        sortPriority: product.sortPriority,
        tasteVariations: product.tasteVariations.join(', '),
        descriptionShort: product.descriptionShort,
        descriptionFull: product.descriptionFull,
        nutritionProteins: product.nutrition?.proteins || '',
        nutritionFats: product.nutrition?.fats || '',
        nutritionCarbs: product.nutrition?.carbs || '',
        nutritionCalories: product.nutrition?.calories || '',
        nutritionComposition: product.nutrition?.composition?.join(', ') || '',
        nutritionAdditionalInfo: product.nutrition?.additionalInfo?.join(', ') || '',
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
      window.history.back();
    },
    onError: (error: any) => {
      toast({ 
        title: 'Ошибка', 
        description: error.message || 'Не удалось обновить продукт',
        variant: 'destructive' 
      });
    },
  });

  const onSubmit: SubmitHandler<FormValues> = (values) => {
    // Costruisci oggetto nutrition solo se almeno un campo è compilato
    let nutrition = undefined;
    const hasNutrition = values.nutritionProteins || values.nutritionFats || 
                         values.nutritionCarbs || values.nutritionCalories || 
                         values.nutritionComposition || values.nutritionAdditionalInfo;
    
    if (hasNutrition) {
      nutrition = {
        proteins: values.nutritionProteins || '',
        fats: values.nutritionFats || '',
        carbs: values.nutritionCarbs || '',
        calories: values.nutritionCalories || '',
        composition: values.nutritionComposition
          .split(',')
          .map(c => c.trim())
          .filter(c => c.length > 0),
        additionalInfo: values.nutritionAdditionalInfo
          .split(',')
          .map(a => a.trim())
          .filter(a => a.length > 0),
      };
    }

    const processedData: ProductFormData = {
      name: values.name,
      slug: values.slug,
      categoryId: values.categoryId,
      images: values.images ? values.images.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      price: values.price,
      priceOld: values.priceOld || null,
      unit: values.unit,
      inStock: values.inStock,
      requiresMarking: values.requiresMarking,
      sortPriority: values.sortPriority,
      tasteVariations: values.tasteVariations.split(',').map((s: string) => s.trim()).filter(Boolean),
      tasteRatingStats: values.tasteRatingStats,
      descriptionShort: values.descriptionShort || null,
      descriptionFull: values.descriptionFull || null,
      nutrition,
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
          onClick={() => window.history.back()}
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
                      {field.value && (
                        <CopyProductUrlButton slug={field.value} />
                      )}
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
                  name="sortPriority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Приоритет сортировки</FormLabel>
                      <FormControl>
                        <Input 
                          type="number"
                          {...field}
                          value={field.value ?? 0}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          placeholder="0 = обычный, >0 = высокий приоритет"
                          data-testid="input-sort-priority"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="requiresMarking"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Маркировка</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(value === 'true')} 
                        value={field.value ? 'true' : 'false'}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-requires-marking">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="false">Не требует маркировку</SelectItem>
                          <SelectItem value="true">Требует маркировку</SelectItem>
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
                
                {/* Sezione БЖУ e Composizione */}
                <div className="space-y-4 pt-6 border-t">
                  <h3 className="text-lg font-semibold">Пищевая ценность (БЖУ) и Состав</h3>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <FormField
                      control={form.control}
                      name="nutritionProteins"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Белки (г)</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              placeholder="0"
                              data-testid="input-nutrition-proteins"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="nutritionFats"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Жиры (г)</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              placeholder="0"
                              data-testid="input-nutrition-fats"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="nutritionCarbs"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Углеводы (г)</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              placeholder="0"
                              data-testid="input-nutrition-carbs"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="nutritionCalories"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Калории (ккал)</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              placeholder="0"
                              data-testid="input-nutrition-calories"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="nutritionComposition"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Состав (ингредиенты через запятую)</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            placeholder="например: молоко, соль, закваска, сычужный фермент"
                            rows={3}
                            data-testid="textarea-nutrition-composition"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="nutritionAdditionalInfo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Дополнительная информация (через запятую)</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            placeholder="например: Без лактозы, Без глютена, Подходит для вегетарианцев"
                            rows={2}
                            data-testid="textarea-nutrition-additional"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
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
