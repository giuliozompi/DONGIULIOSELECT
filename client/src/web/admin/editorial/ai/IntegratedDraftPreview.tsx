import { ExternalLink, MapPin } from 'lucide-react';
import type { AiField, ResearchPhoto } from '@shared/editorial-ai';

const fieldLabels: Record<AiField, string> = {
  title: 'Название',
  description: 'Описание',
  country: 'Страна происхождения',
  region: 'Регион',
  history: 'История',
  characteristics: 'Характеристики',
  culinaryUses: 'Кулинарное использование',
};

type Candidate = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  url: string;
};
type PreviewPhoto = { id: string; src: string; label: string; sourceUrl?: string; saved: boolean };

export default function IntegratedDraftPreview({
  values,
  originalName,
  proposedFields,
  photos,
  savedPhotos,
  savedSourceCount,
  researchSourceCount,
  candidate,
  savedPoint,
  hasOriginCandidate,
}: {
  values: Partial<Record<AiField, string>>;
  originalName?: string;
  proposedFields: AiField[];
  photos: ResearchPhoto[];
  savedPhotos: string[];
  savedSourceCount: number;
  researchSourceCount: number;
  candidate?: Candidate;
  savedPoint?: { latitude?: number | null; longitude?: number | null };
  hasOriginCandidate: boolean;
}) {
  const lat = candidate?.latitude;
  const lon = candidate?.longitude;
  const mapLat = lat ?? savedPoint?.latitude;
  const mapLon = lon ?? savedPoint?.longitude;
  const hasMapPoint = mapLat != null && mapLon != null;
  const mapUrl = hasMapPoint
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${Math.max(-180, mapLon - 0.035)}%2C${Math.max(-90, mapLat - 0.02)}%2C${Math.min(180, mapLon + 0.035)}%2C${Math.min(90, mapLat + 0.02)}&layer=mapnik&marker=${mapLat}%2C${mapLon}`
    : '';
  const missing = (['title', 'country', 'history', 'characteristics', 'culinaryUses'] as AiField[])
    .filter(field => !values[field]?.trim());
  const allPhotos: PreviewPhoto[] = [
    ...savedPhotos.filter(Boolean).map((src, index) => ({ id: `saved-${index}-${src}`, src, label: 'Сохранённое фото статьи', saved: true })),
    ...photos
      .filter(photo => photo.imageUrl && !savedPhotos.includes(photo.imageUrl))
      .map(photo => ({ id: `candidate-${photo.id}`, src: photo.imageUrl, label: photo.label || 'Фото-кандидат', sourceUrl: photo.sourceUrl, saved: false })),
  ];
  const hasPoint = hasMapPoint;
  const hasSources = savedSourceCount > 0 || researchSourceCount > 0;

  return <section data-testid="ai-integrated-preview" className="rounded-md border border-[#c9cfc2] bg-[#f0f1e8] p-4" aria-label="Предпросмотр целой статьи">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#d9dccf] pb-3">
      <div>
        <p className="ai-kicker">Проверка перед переносом</p>
        <h3 className="mt-1 font-serif text-xl text-[#31483d]">Статья целиком</h3>
        {originalName?.trim() && <p className="mt-1 text-sm italic text-[#526158]">{originalName}</p>}
        <p className="mt-1 max-w-2xl text-xs leading-5 text-[#6e7b70]">Текущая запись с отмеченными предложениями поверх неё. Ничего не сохраняется автоматически.</p>
      </div>
      <span className="rounded-full border border-[#c4cdbf] bg-[#faf9f2] px-2.5 py-1 text-[11px] text-[#607064]">Предпросмотр · не публикация</span>
    </div>
    <div className="mt-3 grid gap-2 md:grid-cols-2">
      {(Object.keys(fieldLabels) as AiField[]).map(field => {
        const proposed = proposedFields.includes(field);
        return <article key={field} className={`rounded border p-3 ${proposed ? 'border-[#bd957d] bg-[#fbf5ed]' : 'border-[#dedfd5] bg-[#fbfaf5]'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-semibold text-[#526158]">{fieldLabels[field]}</h4>
            {proposed && <span className="rounded-full bg-[#ead9cc] px-2 py-0.5 text-[10px] font-semibold text-[#84543b]">Предложение выбрано</span>}
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-[#34463b]">{values[field]?.trim() || <span className="italic text-[#8b9288]">Не заполнено · данных не добавлено</span>}</p>
        </article>;
      })}
    </div>
    <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.8fr)]">
      <section className="rounded border border-[#dedfd5] bg-[#fbfaf5] p-3">
        <h4 className="text-xs font-semibold text-[#526158]">Фотографии статьи и выбранные кандидаты · {allPhotos.length}</h4>
        {allPhotos.length ? <div className="mt-2 grid grid-cols-2 gap-2">
          {allPhotos.map(photo => <figure key={photo.id} className="overflow-hidden rounded border border-[#e0dfd5] bg-[#f5f3eb]">
            <img src={photo.src} alt={photo.label} className="aspect-[4/3] w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
            <figcaption className="p-2 text-[11px] leading-4 text-[#68756b]">
              <span className="block font-medium text-[#45594b]">{photo.label}</span>
              {!photo.saved && photo.sourceUrl && <a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 break-all underline underline-offset-2">Источник <ExternalLink className="h-3 w-3 shrink-0" /></a>}
              {!photo.saved && <span className="mt-1 block">Требуется отдельное подтверждение права использования.</span>}
            </figcaption>
          </figure>)}
        </div> : <p className="mt-1 text-xs leading-5 text-[#78837a]">Фото не выбраны. Ни одно изображение не добавлено автоматически.</p>}
      </section>
      <section className="rounded border border-[#dedfd5] bg-[#fbfaf5] p-3">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-[#526158]"><MapPin className="h-3.5 w-3.5 text-[#a45f43]" />Географическая точка</h4>
        {hasMapPoint && mapUrl ? <>
          <p className="mt-1 text-sm font-medium text-[#45594b]">{candidate?.label || 'Координаты, сохранённые в статье'}</p>
          <p className="mt-1 text-xs text-[#78837a]">{candidate ? 'Кандидат из результата геопоиска' : 'Текущие сохранённые координаты'}: {mapLat}, {mapLon}</p>
          <iframe title={`Карта точки ${candidate?.label || 'происхождения сыра'}`} src={mapUrl} className="mt-2 h-40 w-full rounded border border-[#d8d9cc]" loading="lazy" referrerPolicy="no-referrer" />
          {candidate
            ? <a href={candidate.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs underline underline-offset-2">Открыть выбранный объект в OpenStreetMap <ExternalLink className="h-3 w-3" /></a>
            : <a href={`https://www.openstreetmap.org/?mlat=${mapLat}&mlon=${mapLon}#map=12/${mapLat}/${mapLon}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs underline underline-offset-2">Открыть сохранённую точку в OpenStreetMap <ExternalLink className="h-3 w-3" /></a>}
        </> : <div className="mt-1 text-xs leading-5 text-[#78837a]">
          <p>{hasOriginCandidate ? 'Найденный кандидат не выбран.' : 'Проверенный кандидат геопоиска не получен: результат отсутствует или поиск не вернул точку.'} Сохранённых координат нет; предположений не добавлено.</p>
        </div>}
        {candidate && savedPoint?.latitude != null && savedPoint?.longitude != null && <p className="mt-2 text-[11px] text-[#78837a]">До переноса статьи сохранено: {savedPoint.latitude}, {savedPoint.longitude}.</p>}
      </section>
    </div>
    {(missing.length > 0 || !hasPoint || allPhotos.length === 0 || !hasSources) && <div className="mt-3 rounded border border-[#dfc9b5] bg-[#f5ece2] p-3 text-xs leading-5 text-[#75533e]">
      <strong>Что остаётся неполным</strong>
      <ul className="mt-1 list-inside list-disc">
        {missing.length > 0 && <li>Нет текста: {missing.map(field => fieldLabels[field]).join(', ')}.</li>}
        {!hasPoint && <li>Географическая точка отсутствует и в сохранённой статье, и среди выбранных кандидатов.</li>}
        {allPhotos.length === 0 && <li>Нет фото ни в сохранённой статье, ни среди выбранных кандидатов.</li>}
        {!hasSources && <li>Источники не указаны в статье или текущем исследовании.</li>}
      </ul>
    </div>}
    <p className="mt-2 text-[11px] leading-4 text-[#78837a]">Описание и регион показаны для проверки, но пустые значения сами по себе здесь не помечаются как блокер готовности.</p>
  </section>;
}
