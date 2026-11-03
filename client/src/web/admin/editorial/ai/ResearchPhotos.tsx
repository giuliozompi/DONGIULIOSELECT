import { useState } from 'react';
import { ExternalLink, ImageOff, Image as ImageIcon } from 'lucide-react';
import type { ResearchPhoto } from '@shared/editorial-ai';

export default function ResearchPhotos({
  photos, selectedIds, rightsConfirmed, disabled, onToggle, onRightsConfirmedChange,
}: {
  photos: ResearchPhoto[];
  selectedIds: string[];
  rightsConfirmed: boolean;
  disabled: boolean;
  onToggle: (id: string) => void;
  onRightsConfirmedChange: (checked: boolean) => void;
}) {
  const [previewIds, setPreviewIds] = useState<string[]>([]);
  const [imageErrors, setImageErrors] = useState<string[]>([]);
  if (!photos.length) return null;
  const selectedPhotos = photos.filter(photo => selectedIds.includes(photo.id));

  return <section data-testid="ai-research-photos" className="mt-4 rounded border border-[#d8d9cc] bg-[#f1f0e8] p-3" aria-label="Кандидаты фотографий">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <p className="flex items-center gap-1.5 text-sm font-semibold text-[#43574a]"><ImageIcon className="h-4 w-4" />Фотографии с найденных страниц</p>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-[#78837a]">Только кандидаты с релевантных загруженных страниц. Проверьте визуальную идентичность сыра и условия использования до выбора. Изображения не загружаются, пока вы явно не откроете предпросмотр.</p>
      </div>
      <span className="rounded-full border border-[#d8d9cc] bg-[#fbfaf5] px-2.5 py-1 text-[11px] text-[#657369]">{selectedIds.length} / 3 выбрано</span>
    </div>
    <ul className="mt-3 space-y-2">
      {photos.slice(0, 3).map((photo, index) => {
        const selected = selectedIds.includes(photo.id);
        const previewOpen = previewIds.includes(photo.id);
        const failed = imageErrors.includes(photo.id);
        return <li key={photo.id} className="grid gap-3 rounded border border-[#e0dfd4] bg-[#fbfaf5] p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="flex min-w-0 items-start gap-2.5">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-[#315647]"
              checked={selected}
              disabled={disabled || (!selected && selectedIds.length >= 3)}
              onChange={() => onToggle(photo.id)}
              aria-label={`Выбрать фотографию: ${photo.label || `кандидат ${index + 1}`}`}
              data-testid={`ai-photo-select-${photo.id}`}
            />
            <div className="min-w-0">
              <p className="break-words text-sm font-medium text-[#43574a]">{photo.label || `Кандидат ${index + 1}`}</p>
              <p className="mt-1 text-xs text-[#78837a]">Источник страницы · <a className="break-all font-medium underline underline-offset-2" href={photo.sourceUrl} target="_blank" rel="noopener noreferrer">{photo.sourceUrl}<ExternalLink className="ml-1 inline h-3 w-3" /></a></p>
              {photo.licenseUrl
                ? <p className="mt-1 text-xs text-[#78837a]">Условия / лицензия · <a className="break-all underline underline-offset-2" href={photo.licenseUrl} target="_blank" rel="noopener noreferrer">{photo.licenseUrl}<ExternalLink className="ml-1 inline h-3 w-3" /></a></p>
                : <p className="mt-1 text-xs font-medium text-[#8b5d43]">Права неизвестны — не считать наличие ссылки разрешением на использование.</p>}
              <p className="mt-1 break-all text-[11px] text-[#8a9188]">Файл изображения: {photo.imageUrl}</p>
            </div>
          </div>
          <button
            type="button"
            data-testid={`ai-photo-preview-${photo.id}`}
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded border border-[#bcc7b9] bg-[#f7f6ef] px-3 text-xs font-medium text-[#43574a] hover:bg-[#edf0e8] disabled:opacity-60"
            onClick={() => {
              setImageErrors(current => current.filter(id => id !== photo.id));
              setPreviewIds(current => current.includes(photo.id) ? current : [...current, photo.id]);
            }}
          >
            <ImageIcon className="h-3.5 w-3.5" />{previewOpen ? 'Предпросмотр открыт' : 'Показать фото'}
          </button>
          {previewOpen && <div className="sm:col-span-2">
            {failed
              ? <div role="status" className="flex items-center gap-2 rounded border border-[#d8d9cc] bg-[#f1f0e8] p-3 text-xs text-[#78837a]"><ImageOff className="h-4 w-4" />Не удалось загрузить изображение. Проверьте страницу-источник.</div>
              : <img
                  src={photo.imageUrl}
                  alt={`Кандидат на фотографию сыра: ${photo.label || `кандидат ${index + 1}`} — проверьте визуальную идентичность`}
                  referrerPolicy="no-referrer"
                  onError={() => setImageErrors(current => current.includes(photo.id) ? current : [...current, photo.id])}
                  className="max-h-72 w-full rounded border border-[#d8d9cc] bg-[#f1f0e8] object-contain"
                />}
          </div>}
        </li>;
      })}
    </ul>
    {selectedPhotos.length > 0 && <div className="mt-3 rounded border border-[#dfc9b5] bg-[#f5ece2] p-3">
      <label className="flex cursor-pointer items-start gap-2 text-xs leading-5 text-[#75533e]">
        <input
          data-testid="ai-photo-rights-confirm"
          type="checkbox"
          className="mt-1 h-4 w-4 accent-[#315647]"
          checked={rightsConfirmed}
          disabled={disabled}
          onChange={event => onRightsConfirmedChange(event.target.checked)}
        />
        <span><strong>Подтверждаю право использовать выбранные фотографии.</strong> Я проверил(а) условия использования и визуальную идентичность. Если лицензия не указана, право использования нужно установить отдельно.</span>
      </label>
    </div>}
  </section>;
}
