import { useState } from 'react';
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
import { Plus, Pencil, Trash2, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const EMPTY = { name: '', slug: '', parentId: '', sortOrder: 0, isVisible: true };

export default function AdminCategories() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<{ open: boolean; editing: any | null }>({ open: false, editing: null });
  const [form, setForm] = useState<any>(EMPTY);

  const { data: cats = [], isLoading } = useQuery({
    queryKey: ['/web-api/admin/categories'],
    queryFn: () => adminApi.getCategories(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['/web-api/admin/categories'] });

  const createMut = useMutation({
    mutationFn: (d: any) => adminApi.createCategory(d),
    onSuccess: () => { invalidate(); close(); toast({ title: 'Categoria creata' }); },
    onError: (e: any) => toast({ title: 'Errore', description: e.message, variant: 'destructive' }),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }: any) => adminApi.updateCategory(id, d),
    onSuccess: () => { invalidate(); close(); toast({ title: 'Categoria aggiornata' }); },
    onError: (e: any) => toast({ title: 'Errore', description: e.message, variant: 'destructive' }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteCategory(id),
    onSuccess: () => { invalidate(); toast({ title: 'Categoria eliminata' }); },
    onError: (e: any) => toast({ title: 'Errore', description: e.message, variant: 'destructive' }),
  });

  function open(cat?: any) {
    setForm(cat ? { name: cat.name, slug: cat.slug, parentId: cat.parentId || '', sortOrder: cat.sortOrder ?? 0, isVisible: cat.isVisible ?? true } : EMPTY);
    setDialog({ open: true, editing: cat || null });
  }
  function close() { setDialog({ open: false, editing: null }); }

  function handleSave() {
    const data = { ...form, parentId: form.parentId || null, sortOrder: Number(form.sortOrder) };
    if (dialog.editing) updateMut.mutate({ id: dialog.editing.id, d: data });
    else createMut.mutate(data);
  }

  function handleSlug(name: string) {
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    setForm((f: any) => ({ ...f, name, slug }));
  }

  const topLevel = cats.filter((c: any) => !c.parentId);
  const children = (parentId: string) => cats.filter((c: any) => c.parentId === parentId);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Categorie</h1>
        <Button onClick={() => open()} size="sm"><Plus className="h-4 w-4 mr-1" />Nuova</Button>
      </div>

      {isLoading && <div className="text-center py-8 text-muted-foreground">Caricamento...</div>}

      <div className="space-y-2">
        {topLevel.sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((cat: any) => (
          <Card key={cat.id}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  {cat.imageUrl && <img src={cat.imageUrl} alt="" className="w-8 h-8 rounded object-cover shrink-0" />}
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{cat.name}</p>
                    <p className="text-xs text-muted-foreground">{cat.slug}</p>
                  </div>
                  {!cat.isVisible && <Badge variant="secondary" className="shrink-0"><EyeOff className="h-3 w-3 mr-1" />Nascosta</Badge>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => open(cat)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => { if (confirm('Eliminare?')) deleteMut.mutate(cat.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
              {children(cat.id).length > 0 && (
                <div className="mt-2 ml-4 space-y-1">
                  {children(cat.id).sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((sub: any) => (
                    <div key={sub.id} className="flex items-center justify-between gap-2 p-2 bg-muted/40 rounded-md flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-sm truncate">{sub.name}</p>
                        <p className="text-xs text-muted-foreground">{sub.slug}</p>
                        {!sub.isVisible && <Badge variant="secondary" className="shrink-0"><EyeOff className="h-3 w-3" /></Badge>}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" onClick={() => open(sub)}><Pencil className="h-3 w-3" /></Button>
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => { if (confirm('Eliminare?')) deleteMut.mutate(sub.id); }}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialog.open} onOpenChange={v => !v && close()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{dialog.editing ? 'Modifica categoria' : 'Nuova categoria'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={form.name} onChange={e => handleSlug(e.target.value)} placeholder="es. Salumi" />
            </div>
            <div className="space-y-1.5">
              <Label>Slug (URL)</Label>
              <Input value={form.slug} onChange={e => setForm((f: any) => ({ ...f, slug: e.target.value }))} placeholder="es. salumi" />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria padre</Label>
              <Select value={form.parentId || 'none'} onValueChange={v => setForm((f: any) => ({ ...f, parentId: v === 'none' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Nessuna (categoria principale)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nessuna (categoria principale)</SelectItem>
                  {topLevel.filter((c: any) => c.id !== dialog.editing?.id).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ordine</Label>
              <Input type="number" value={form.sortOrder} onChange={e => setForm((f: any) => ({ ...f, sortOrder: e.target.value }))} />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.isVisible} onCheckedChange={v => setForm((f: any) => ({ ...f, isVisible: v }))} />
              <Label>Visibile nel catalogo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>Annulla</Button>
            <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}>
              {createMut.isPending || updateMut.isPending ? 'Salvataggio...' : 'Salva'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
