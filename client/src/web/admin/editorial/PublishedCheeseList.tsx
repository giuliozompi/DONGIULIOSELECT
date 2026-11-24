import { useState } from 'react';
import { Check, ChevronsUpDown, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import type { CheeseData, EditorialEntry } from '@shared/editorial';
import type { PublishedCheeseFilter, PublishedCheeseOrigin } from '@shared/editorial-stages';

const key = (filter: PublishedCheeseFilter) => JSON.stringify([filter.originCountry ?? null, filter.originRegion ?? null]);
export function PublishedOriginFilter({ origins, value, onChange, loading, unavailable, onRetry }: {
  origins: PublishedCheeseOrigin[]; value: PublishedCheeseFilter;
  onChange: (value: PublishedCheeseFilter) => void; loading: boolean; unavailable: boolean; onRetry: () => void;
}) {
  const [open, setOpen] = useState(false);
  const countries = new Map<string, number>();
  for (const origin of origins) if (origin.country)
    countries.set(origin.country, (countries.get(origin.country) || 0) + origin.count);
  const options = [{ label: 'Все страны и регионы', filter: {} as PublishedCheeseFilter, count: origins.reduce((n, o) => n + o.count, 0) },
    ...Array.from(countries).sort(([a], [b]) => a.localeCompare(b, 'ru')).flatMap(([country, count]) => [
      { label: country, filter: { originCountry: country }, count },
      ...origins.filter(origin => origin.country === country && origin.region).sort((a, b) => a.region.localeCompare(b.region, 'ru'))
        .map(origin => ({ label: `${country} · ${origin.region}`, filter: { originCountry: country, originRegion: origin.region }, count: origin.count })),
    ])];
  const label = [value.originCountry, value.originRegion].filter(Boolean).join(' · ') || 'Все страны и регионы';
  return <section className="mb-4 space-y-2" aria-label="Фильтр опубликованных статей">
    <p className="text-sm font-medium">Место происхождения</p>
    <div className="flex flex-wrap items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" role="combobox" aria-label="Выбрать страну или регион происхождения"
            aria-expanded={open} data-testid="published-origin-filter" variant="outline"
            className="h-auto min-h-10 w-full max-w-xl justify-between whitespace-normal border-[#c9cfc3] bg-[#fbfaf6] text-left">
            <span>{label}</span><ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(36rem,calc(100vw-2rem))] p-0">
          <Command>
            <CommandInput placeholder="Найти страну или регион…" aria-label="Поиск места происхождения" />
            <CommandList>
              <CommandEmpty>{loading ? 'Загрузка мест происхождения…' : 'Место происхождения не найдено'}</CommandEmpty>
              <CommandGroup heading="Страны и регионы">
                {options.map(option => <CommandItem key={key(option.filter)} value={option.label}
                  onSelect={() => { onChange(option.filter); setOpen(false); }}>
                  <Check className={`mr-2 h-4 w-4 shrink-0 ${key(value) === key(option.filter) ? 'opacity-100' : 'opacity-0'}`} />
                  <span className="min-w-0 flex-1 break-words">{option.label}</span>
                  <span className="ml-3 text-xs text-muted-foreground">{option.count}</span>
                </CommandItem>)}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value.originCountry && <Button type="button" variant="ghost" size="sm" onClick={() => onChange({})}>Сбросить фильтр</Button>}
    </div>
    {unavailable ? <p role="alert" className="text-sm text-[#8b4535]">Не удалось загрузить места происхождения. <button type="button" className="underline" onClick={onRetry}>Повторить</button></p>
      : <p className="text-xs text-muted-foreground">По стране, затем региону и названию сыра. Для редактирования выберите статью.</p>}
  </section>;
}

export default function PublishedCheeseList({ entries, disabled, onEdit }: {
  entries: EditorialEntry[]; disabled: boolean; onEdit: (entry: EditorialEntry) => void;
}) {
  return <div data-testid="published-cheese-list" className="overflow-hidden rounded-lg border border-[#d9d7ca] bg-[#fbfaf6]">
    <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.5fr)_auto] gap-4 border-b border-[#d9d7ca] bg-[#eae9df] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#59645d] md:grid" aria-hidden="true">
      <span>Сыр</span><span>Страна происхождения</span><span>Регион происхождения</span><span>Открыть</span>
    </div>
    <ul className="divide-y divide-[#e2e0d5]">
      {entries.map(entry => {
        const cheese = entry.data as CheeseData;
        const changed = entry.publication?.publishedRevision !== entry.revision;
        return <li key={entry.id} id={`entry-${entry.id}`}>
          <button type="button" disabled={disabled} onClick={() => onEdit(entry)}
            aria-label={`Редактировать «${cheese.title}»`} data-testid={`published-cheese-${entry.id}`}
            className="grid w-full gap-2 px-4 py-3 text-left transition-colors hover:bg-[#eef1e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#315647] disabled:opacity-50 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.5fr)_auto] md:items-center md:gap-4">
            <span className="min-w-0 break-words">
              <span className="block font-medium text-[#315647]">{cheese.title}</span>
              {cheese.nameOriginal && <span className="block text-xs italic text-[#68746b]">{cheese.nameOriginal}</span>}
              {changed && <span className="block text-xs text-[#975539]">Есть неопубликованные изменения</span>}
            </span>
            <span className="min-w-0 break-words text-sm"><span className="md:sr-only">Страна: </span>{cheese.country || 'Не указана'}</span>
            <span className="min-w-0 break-words text-sm text-[#68746b]"><span className="md:sr-only">Регион: </span>{cheese.region || '—'}</span>
            <Pencil className="hidden h-4 w-4 text-[#68746b] md:block" aria-hidden="true" />
          </button>
        </li>;
      })}
    </ul>
  </div>;
}
