import { useId, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Product = { id: string | number; name?: string; title?: string; slug?: string };
const separators = new RegExp('[^\\p{L}\\p{N}]+', 'gu');

function searchText(text: string) {
  return text.toLocaleLowerCase('ru').replace(/ё/g, 'е').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(separators, ' ').trim();
}

export default function EditorialProductLinks({ products, selected, loading, unavailable, disabled, onRetry, onToggle }: {
  products: Product[];
  selected: string[];
  loading: boolean;
  unavailable: boolean;
  disabled: boolean;
  onRetry: () => void;
  onToggle: (id: string) => void;
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const indexed = useMemo(() => products.filter(product => product.id != null).map(product => {
    const label = product.name || product.title || product.slug || 'Товар без названия';
    return { id: String(product.id), label, name: searchText(label), slug: searchText(product.slug || '') };
  }), [products]);
  const filter = searchText(query);
  const tokens = filter.split(' ').filter(Boolean);
  const matches = !query.trim() ? indexed : filter
    ? indexed.filter(product => tokens.every(token => product.name.includes(token) || product.slug.includes(token)))
      .sort((a, b) => matchRank(a.name) - matchRank(b.name))
    : [];
  function matchRank(name: string) {
    return name === filter ? 0 : name.startsWith(filter) ? 1 : 2;
  }
  function updateQuery(value: string) {
    setQuery(value);
    if (list.current) list.current.scrollTop = 0;
  }

  return <fieldset className="min-w-0 space-y-2" disabled={disabled} data-testid="editorial-product-links">
    <legend className="text-sm font-medium">Связанные товары каталога</legend>
    <Label htmlFor={inputId} className="sr-only">Поиск товаров каталога</Label>
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <Input id={inputId} ref={input} type="search" autoComplete="off" placeholder="Введите название товара"
        maxLength={200} value={query} disabled={loading || unavailable} data-testid="editorial-product-search"
        aria-describedby={`${inputId}-hint`} className="pl-9 pr-11 [&::-webkit-search-cancel-button]:hidden"
        onChange={event => updateQuery(event.target.value)}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing || (event.key !== 'Enter' && event.key !== 'ArrowDown')) return;
          event.preventDefault();
          list.current?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus();
        }} />
      {query && <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0"
        aria-label="Очистить поиск товаров" onClick={() => { updateQuery(''); input.current?.focus(); }}>
        <X className="h-4 w-4" aria-hidden="true" />
      </Button>}
    </div>
    <p id={`${inputId}-hint`} className="text-xs text-muted-foreground">
      Enter или ↓ — к первому результату, пробел — выбрать товар.
    </p>
    <p role="status" className="text-xs text-muted-foreground">
      {loading ? 'Загрузка каталога…' : !unavailable && query.trim() ? `Найдено: ${matches.length} · ` : ''}
      {!loading && `Выбрано: ${selected.length}`}
    </p>
    {unavailable ? <div className="flex flex-wrap items-center gap-2 text-sm">
      <span role="alert">Не удалось загрузить каталог товаров.</span>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>Повторить</Button>
    </div> : !loading && (matches.length ? <div ref={list} data-testid="editorial-product-results"
      className="max-h-44 space-y-1 overflow-auto rounded-md border p-2">
      {matches.map(product => <label key={product.id}
        className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/60 has-[:focus-visible]:bg-accent has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-ring">
        <input type="checkbox" value={product.id} className="mt-1 shrink-0 accent-primary"
          checked={selected.includes(product.id)} onChange={() => onToggle(product.id)} />
        <span className="min-w-0 break-words">{product.label}</span>
      </label>)}
    </div> : <p className="rounded-md border p-3 text-sm text-muted-foreground">
      {query.trim() ? 'По вашему запросу товары не найдены.' : 'В каталоге пока нет товаров.'}
    </p>)}
  </fieldset>;
}
