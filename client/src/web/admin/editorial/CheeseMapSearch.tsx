import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { MapPlaceLookup } from '@shared/editorial-ai';
import { editorialAiApi } from '../lib/editorialAiApi';

export type MapPlace = MapPlaceLookup['candidates'][number];

export function localityZoom(type: string) {
  switch (type) {
    case 'country': return 5;
    case 'state': case 'region': case 'province': return 8;
    case 'county': case 'state_district': return 10;
    case 'city': case 'town': case 'municipality': case 'administrative': return 12;
    case 'village': case 'hamlet': case 'locality': return 14;
    default: return 15;
  }
}

export default function CheeseMapSearch({ disabled, focusedId, onFocus }: {
  disabled: boolean;
  focusedId?: string;
  onFocus: (place: MapPlace) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<MapPlaceLookup>();
  const [error, setError] = useState('');
  const activeRequest = useRef<symbol | null>(null);
  useEffect(() => () => { activeRequest.current = null; }, []);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const place = query.trim();
    if (place.length < 2 || disabled || activeRequest.current) return;
    const request = Symbol();
    activeRequest.current = request;
    setBusy(true);
    setResults(undefined);
    setError('');
    try {
      const result = await editorialAiApi.mapPlace(place);
      if (activeRequest.current === request) setResults(result);
    } catch (issue) {
      if (activeRequest.current === request) {
        setError(issue instanceof Error ? issue.message : 'Не удалось найти место. Попробуйте ещё раз.');
      }
    } finally {
      if (activeRequest.current === request) {
        activeRequest.current = null;
        setBusy(false);
      }
    }
  }

  return <div className="space-y-2 rounded border border-[#d9d7ca] bg-[#fbfaf6] p-2.5" data-testid="cheese-map-search">
    <form onSubmit={search} className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-[#315647]">Поиск места на карте</label>
      <div className="flex flex-wrap gap-2">
        <Input id={id} type="search" className="min-w-0 flex-1" maxLength={200} aria-describedby={`${id}-hint`}
          placeholder="Например: Бергамо, Италия" value={query} disabled={disabled || busy}
          onChange={event => { setQuery(event.target.value); setResults(undefined); setError(''); }} />
        <Button type="submit" variant="outline" disabled={disabled || busy || query.trim().length < 2}>
          <Search aria-hidden="true" className="mr-1.5 h-4 w-4" />Найти
        </Button>
      </div>
      <p id={`${id}-hint`} className="text-xs leading-5 text-[#65766c]">Введите название населённого пункта или региона, не частный адрес. Поиск меняет только вид карты.</p>
    </form>
    {error && <p role="alert" className="break-words text-xs text-[#8b4535]">{error}</p>}
    <div role="status" className="text-xs text-[#53645a]">
      {busy ? 'Ищем место…' : results ? results.candidates.length
        ? 'Выберите место, чтобы приблизить его на карте.'
        : 'Место не найдено. Уточните название, добавив регион или страну.' : null}
    </div>
    {!!results?.candidates.length && <ul aria-label="Найденные места" className="space-y-1">
      {results.candidates.map(place => <li key={place.id}>
        <button type="button" className="w-full break-words rounded border border-[#d9d7ca] px-2.5 py-2 text-left text-sm text-[#315647] hover:bg-[#edf1e9] aria-pressed:bg-[#edf1e9] disabled:opacity-60"
          aria-pressed={focusedId === place.id} disabled={disabled} onClick={() => onFocus(place)}>{place.label}</button>
      </li>)}
    </ul>}
  </div>;
}
