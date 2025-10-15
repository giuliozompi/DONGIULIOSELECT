import { useEffect } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { insertCategorySchema, type Category } from '@shared/schema';
import { ArrowLeft, Save } from 'lucide-react';
import { ImageUploadField } from '@/components/ImageUploadField';
import type { SubmitHandler } from 'react-hook-form';

type CategoryFormData = z.infer<typeof insertCategorySchema>;

export default function EditCategoryPage() {
  const [, params] = useRoute('/admin/categories/:id');
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const categoryId = params?.id;

  // Fetch all categories
  const { data: allCategories = [], isLoading } = useQuery<Category[]>({
    queryKey: ['/api/categories'],
  });

  // Find specific category from all categories
  const category = allCategories.find(c => c.id === categoryId);

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

  // Update form when category loads
  useEffect(() => {
    if (category) {
      form.reset({
        name: category.name,
        slug: category.slug,
        image: category.image || '',
        parentId: category.parentId,
        sortOrder: category.sortOrder,
      });
    }
  }, [category, form]);

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<CategoryFormData>) => {
      const response = await apiRequest('PATCH', `/api/admin/categories/${categoryId}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/categories'] });
      toast({ title: '✅ Categoria обновлена' });
      setLocation('/admin');
    },
    onError: (error: any) => {
      toast({ 
        title: 'Ошибка', 
        description: error.message || 'Не удалось обновить категорию',
        variant: 'destructive' 
      });
    },
  });

  const onSubmit: SubmitHandler<CategoryFormData> = (data) => {
    updateMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Загрузка...</p>
      </div>
    );
  }

  if (!category) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Categoria non trovata</p>
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
            <CardTitle>Редактировать категорию</CardTitle>
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
                          onChange={(value) => field.onChange(value)}
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
                          {allCategories.filter(c => c.id !== categoryId).map((cat) => (
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
                    disabled={updateMutation.isPending}
                    data-testid="button-save-category"
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
