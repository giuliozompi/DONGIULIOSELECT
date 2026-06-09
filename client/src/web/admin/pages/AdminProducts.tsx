import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../lib/adminApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Pencil, Trash2, Package, Search, Upload, Loader2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const EMPTY_FORM = {
  name: '', slug: '', description: '', price: '', oldPrice: '', unit: 'шт',
  categoryId: '', inStock: true, isVisible: true, images: [] as string[],
  sortPriority: 0, requiresMarking: false,
  proteins: '', fats: '', carbs: '', calories: '', ingredients: '', additionalInfo: '',
};

const UNITS = ['шт', 'кг', 'г', 'л', 'мл'];

export default function AdminProducts() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [catFilter, setCatFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<{ open: boolean; editing: any | null }>({ open: false, editing: null });
  const [form, setForm] = useState<any>(EMPTY_FORM);
  const [imgInput, setImgInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: cats = [] } = useQuery({ queryKey: ['/web-api/admin/categories'], queryFn: () => adminApi.getCategories() });
  const { data: prods = [], isLoading } = useQuery({ queryKey: ['/web-api/admin/products'], queryFn: () => adminApi.getProducts() });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['/web-api/admin/products'] });

  const saveMut = useMutation({
    mutationFn: (d: any) => dialog.editing ? adminApi.updateProduct(dialog.editing.id, d) : adminApi.createProduct(d),
    onSuccess: () => { invalidate(); closeDialog(); toast({ title: dialog.editing ? 'Товар обновлён' : 'Товар создан' }); },
    onError: (e: any) => toast({ title: 'Ошибка', description: e.message, variant: 'destructive' }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteProduct(id),
    onSuccess: () => { invalidate(); toast({ title: 'Товар удалён' }); },
    onError: (e: any) => toast({ title: 'Ошибка', description: e.message, variant: 'destructive' }),
  });
  const stockMut = useMutation({
    mutationFn: ({ id, inStock }: any) => adminApi.toggleStock(id, inStock),
    onSuccess: () => invalidate(),
  });
  const visMut = useMutation({
    mutationFn: ({ id, isVisible }: any) => adminApi.toggleVisibility(id, isVisible),
    onSuccess: () => invalidate(),
  });

  function openDialog(prod?: any) {
    if (prod) {
      setForm({
        name: prod.name || '', slug: prod.slug || '', description: prod.description || '',
        price: prod.price || '', oldPrice: prod.oldPrice || '', unit: prod.unit || 'шт',
        categoryId: prod.categoryId || '', inStock: prod.inStock ?? true, isVisible: prod.isVisible ?? true,
        images: prod.images || [], sortPriority: prod.sortPriority ?? 0,
        requiresMarking: prod.requiresMarking ?? false,
        proteins: prod.proteins || '', fats: prod.fats || '', carbs: prod.carbs || '',
        calories: prod.calories || '', ingredients: prod.ingredients || '',
        additionalInfo: prod.additionalInfo || '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setImgInput('');
    setDialog({ open: true, editing: prod || null });
  }
  function closeDialog() { setDialog({ open: false, editing: null }); }

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  function handleSlug(name: string) {
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    setForm((f: any) => ({ ...f, name, slug }));
  }

  function addImage() {
    const url = imgInput.trim();
    if (!url) return;
    setForm((f: any) => ({ ...f, images: [...f.images, url] }));
    setImgInput('');
  }
  function removeImage(i: number) {
    setForm((f: any) => ({ ...f, images: f.images.filter((_: any, idx: number) => idx !== i) }));
  }
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    try {
      const { path } = await adminApi.uploadImage(file);
      setForm((f: any) => ({ ...f, images: [...f.images, path] }));
      toast({ title: 'Фото загружено' });
    } catch (err: any) {
      toast({ title: 'Errore upload', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  }

  function handleSave() {
    const data = {
      ...form,
      price: String(form.price),
      oldPrice: form.oldPrice ? String(form.oldPrice) : null,
      sortPriority: Number(form.sortPriority),
      categoryId: form.categoryId || null,
    };
    saveMut.mutate(data);
  }

  const filtered = prods.filter((p: any) => {
    const matchCat = catFilter === 'all' || p.categoryId === catFilter;
    const matchSearch = !search || p.name?.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const catName = (id: string) => cats.find((c: any) => c.id === id)?.name || '';

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">Товары</h1>
        <Button onClick={() => openDialog()} size="sm"><Plus className="h-4 w-4 mr-1" />Создать</Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Поиск товара..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все категории</SelectItem>
            {cats.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <div className="text-center py-8 text-muted-foreground">Загрузка...</div>}

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium">Товар</th>
              <th className="text-left p-3 font-medium hidden md:table-cell">Категория</th>
              <th className="text-right p-3 font-medium">Цена</th>
              <th className="text-center p-3 font-medium">Наличие</th>
              <th className="text-center p-3 font-medium hidden md:table-cell">Видимый</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((p: any) => (
              <tr key={p.id} className="hover:bg-muted/30">
                <td className="p-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {p.images?.[0]
                      ? <img src={p.images[0]} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                      : <div className="w-8 h-8 bg-muted rounded shrink-0 flex items-center justify-center"><Package className="h-4 w-4 text-muted-foreground" /></div>}
                    <div className="min-w-0">
                      <p className="font-medium truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.unit}</p>
                    </div>
                  </div>
                </td>
                <td className="p-3 hidden md:table-cell text-muted-foreground">{catName(p.categoryId)}</td>
                <td className="p-3 text-right font-mono">
                  <div>₽{parseFloat(p.price).toFixed(0)}</div>
                  {p.oldPrice && <div className="text-xs text-muted-foreground line-through">₽{parseFloat(p.oldPrice).toFixed(0)}</div>}
                </td>
                <td className="p-3 text-center">
                  <Switch checked={p.inStock} onCheckedChange={v => stockMut.mutate({ id: p.id, inStock: v })} />
                </td>
                <td className="p-3 text-center hidden md:table-cell">
                  <Switch checked={p.isVisible} onCheckedChange={v => visMut.mutate({ id: p.id, isVisible: v })} />
                </td>
                <td className="p-3">
                  <div className="flex gap-1 justify-end">
                    <Button size="icon" variant="ghost" onClick={() => openDialog(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => { if (confirm('Удалить товар?')) deleteMut.mutate(p.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && !isLoading && (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Товары не найдены</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={dialog.open} onOpenChange={v => !v && closeDialog()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog.editing ? 'Редактировать товар' : 'Новый товар'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">

            {/* ── Основное ── */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Основное</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label>Название</Label>
                  <Input value={form.name} onChange={e => handleSlug(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Категория</Label>
                  <Select value={form.categoryId || 'none'} onValueChange={v => set('categoryId', v === 'none' ? '' : v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Без категории</SelectItem>
                      {cats.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Единица измерения</Label>
                  <Select value={form.unit} onValueChange={v => set('unit', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Цена (₽)</Label>
                  <Input type="number" step="0.01" value={form.price} onChange={e => set('price', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Старая цена (₽)</Label>
                  <Input type="number" step="0.01" value={form.oldPrice} onChange={e => set('oldPrice', e.target.value)} placeholder="Необязательно" />
                </div>
                <div className="space-y-1.5">
                  <Label>Slug</Label>
                  <Input value={form.slug} onChange={e => set('slug', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Приоритет сортировки</Label>
                  <Input type="number" value={form.sortPriority} onChange={e => set('sortPriority', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div className="flex items-center gap-2">
                  <Switch checked={form.inStock} onCheckedChange={v => set('inStock', v)} />
                  <Label>В наличии</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.isVisible} onCheckedChange={v => set('isVisible', v)} />
                  <Label>Видимый</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.requiresMarking} onCheckedChange={v => set('requiresMarking', v)} />
                  <Label>Маркировка</Label>
                </div>
              </div>
            </div>

            <div className="border-t" />

            {/* ── Описание ── */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Описание</p>
              <Textarea
                rows={4}
                placeholder="Краткое описание товара, показываемое в каталоге..."
                value={form.description}
                onChange={e => set('description', e.target.value)}
              />
            </div>

            {/* ── Дополнительная информация ── */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Дополнительная информация</p>
              <Textarea
                rows={3}
                placeholder="Условия хранения, происхождение, сертификаты..."
                value={form.additionalInfo}
                onChange={e => set('additionalInfo', e.target.value)}
              />
            </div>

            <div className="border-t" />

            {/* ── Состав и пищевая ценность ── */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Состав и пищевая ценность</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Ингредиенты / Состав</Label>
                  <Textarea
                    rows={2}
                    placeholder="Каждый ингредиент на отдельной строке..."
                    value={form.ingredients}
                    onChange={e => set('ingredients', e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { key: 'proteins', label: 'Белки' },
                    { key: 'fats', label: 'Жиры' },
                    { key: 'carbs', label: 'Углеводы' },
                    { key: 'calories', label: 'Калории' },
                  ].map(({ key, label }) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-xs">{label}</Label>
                      <Input value={form[key]} onChange={e => set(key, e.target.value)} placeholder="—" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t" />

            {/* ── Изображения ── */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Изображения</p>
              <div className="space-y-3">
                {/* Previews with delete */}
                {form.images.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {form.images.map((url: string, i: number) => (
                      <div key={i} className="relative group">
                        <img src={url} alt="" className="w-20 h-20 object-cover rounded-md border" />
                        <button
                          type="button"
                          onClick={() => removeImage(i)}
                          className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload file button */}
                <div className="flex gap-2 items-center flex-wrap">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading
                      ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Загрузка...</>
                      : <><Upload className="h-3.5 w-3.5 mr-1.5" />Загрузить фото</>
                    }
                  </Button>
                  <span className="text-muted-foreground text-xs">oppure</span>
                  <div className="flex gap-2 flex-1 min-w-48">
                    <Input
                      placeholder="URL esterno https://..."
                      value={imgInput}
                      onChange={e => setImgInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addImage()}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={addImage}>+</Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Max 5 MB · JPG, PNG, WebP</p>
              </div>
            </div>

          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Отмена</Button>
            <Button onClick={handleSave} disabled={saveMut.isPending}>
              {saveMut.isPending ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
