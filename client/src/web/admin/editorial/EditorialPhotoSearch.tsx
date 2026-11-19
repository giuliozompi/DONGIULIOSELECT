import { useRef, useState } from 'react';
import { Image, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { editorialSourceUrl, type PhotoSearchRequest, type PhotoSearchResult, type ResearchPhoto } from '@shared/editorial-ai';
import { editorialAiApi } from '../lib/editorialAiApi';
import ResearchPhotos from './ai/ResearchPhotos';

export default function EditorialPhotoSearch({ identity, photos, priorSuggestions, disabled, onAdd }: {
  identity: Omit<PhotoSearchRequest, 'excludedUrls' | 'attempt'>;
  photos: string[];
  priorSuggestions: ResearchPhoto[];
  disabled: boolean;
  onAdd: (selected: ResearchPhoto[]) => string | undefined;
}) {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [result, setResult] = useState<PhotoSearchResult>();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const shown = useRef<string[]>([]);
  const hasName = Boolean(identity.title.trim() || identity.nameOriginal.trim());
  const candidates = (result?.photos ?? []).filter(photo => !photos.includes(photo.imageUrl));
  const selected = candidates.filter(photo => selectedIds.includes(photo.id));

  async function search() {
    if (lock.current || disabled || !hasName) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const references = [...photos, ...priorSuggestions.map(photo => photo.imageUrl), ...shown.current];
      const excludedUrls = Array.from(new Set(references.flatMap(url => {
        const parsed = editorialSourceUrl.safeParse(url.trim());
        return parsed.success ? [parsed.data] : [];
      }))).slice(0, 48);
      const next = await editorialAiApi.searchPhotos({ ...identity, excludedUrls, attempt });
      shown.current = Array.from(new Set([...next.photos.map(photo => photo.imageUrl), ...shown.current])).slice(0, 33);
      setResult(next);
      setSelectedIds([]);
      setRightsConfirmed(false);
      setAttempt((attempt + 1) % 4);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось выполнить поиск фотографий.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function add() {
    if (!rightsConfirmed || !selected.length || busy || disabled) return;
    const message = onAdd(selected);
    if (message) return setError(message);
    setSelectedIds([]);
    setRightsConfirmed(false);
    setError('');
    setNotice('Фотографии добавлены в форму. Сохраните изменения, чтобы записать их в статью.');
  }

  return <div className="space-y-2" data-testid="editorial-photo-search">
    <Button type="button" size="sm" variant="outline" data-testid="search-alternative-photos"
      disabled={disabled || busy || !hasName} onClick={() => { void search(); }}>
      {busy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Image className="mr-2 h-4 w-4" />}
      {busy ? 'Ищем фотографии…' : 'Найти другие фотографии'}
    </Button>
    {!hasName && <p className="text-xs text-[#718075]">Укажите название сыра для поиска фотографий.</p>}
    {error && <p role="alert" className="text-sm text-[#8b4535]">{error}</p>}
    {notice && <p role="status" className="text-sm text-[#43574a]">{notice}</p>}
    {!notice && !busy && result && candidates.length === 0 && <p role="status" className="text-sm text-[#718075]">Новых фотографий не найдено. Можно повторить поиск или добавить своё изображение.</p>}
    {!!result?.unavailablePages && <p className="text-xs text-[#718075]">Часть страниц не удалось прочитать: {result.unavailablePages}.</p>}
    <ResearchPhotos key={attempt} draftOnly photos={candidates} selectedIds={selected.map(photo => photo.id)}
      disabled={disabled || busy} canImport={photos.length + selected.length <= 12}
      rightsConfirmed={rightsConfirmed} onRightsConfirmedChange={setRightsConfirmed}
      onToggle={id => {
        setSelectedIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
        setRightsConfirmed(false);
      }} onImport={add} />
    {selected.length > 0 && photos.length + selected.length > 12 && <p role="status" className="text-sm text-[#8b4535]">В статье может быть не более 12 фотографий. Уберите лишние из формы или выберите меньше.</p>}
  </div>;
}
