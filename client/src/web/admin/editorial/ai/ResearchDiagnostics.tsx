import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AiSource, ResearchReport, ResearchTopic } from '@shared/editorial-ai';
import ResearchPhotos from './ResearchPhotos';

const topicLabels: Record<ResearchTopic, string> = {
  history: 'История',
  origin: 'Происхождение',
  characteristics: 'Характеристики',
  culinaryUses: 'Кулинарное использование',
};

export default function ResearchDiagnostics({
  report, sources, missingContext, sourcesText, disabled, onAppend,
  selectedPhotoIds, photoRightsConfirmed, canSelectPhotos, canImportPhotos, onTogglePhoto,
  onPhotoRightsChange, onImportPhotos,
}: {
  report: ResearchReport;
  sources: AiSource[];
  missingContext: string[];
  sourcesText: string;
  disabled: boolean;
  onAppend: (urls: string[]) => void;
  selectedPhotoIds: string[];
  photoRightsConfirmed: boolean;
  canSelectPhotos: boolean;
  canImportPhotos: boolean;
  onTogglePhoto: (id: string) => void;
  onPhotoRightsChange: (checked: boolean) => void;
  onImportPhotos: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const present = sourcesText.split(/\r?\n/).map(url => url.trim()).filter(Boolean);
  const uniquePresent = Array.from(new Set(present));
  const selectedNew = selected.filter(url => !uniquePresent.includes(url));
  const tooMany = present.length + selectedNew.length > 3 || uniquePresent.length + selectedNew.length > 3;
  function toggle(url: string) {
    setSelected(value => value.includes(url) ? value.filter(item => item !== url) : [...value, url]);
    setNotice('');
  }
  const coverage = report.coverage
    ? (Object.entries(topicLabels) as [ResearchTopic, string][]).map(([topic, label]) =>
        report.coverage!.find(item => item.topic === topic) || { topic, label, status: 'missing' as const, evidence: [] },
      )
    : [];
  const queryPlan = report.queryPlan || [];
  const photos = report.photos || [];
  const sourceFor = (sourceIndex: number) => sources[sourceIndex];

  return <section data-testid="ai-research-report" className="mt-4 rounded border border-[#d8d9cc] bg-[#f1f0e8] p-3" aria-label="Отчёт интернет-поиска">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div><p className="text-sm font-semibold text-[#43574a]">Реальный поиск Brave</p><p className="mt-0.5 text-xs text-[#78837a]">Поиск выполнялся явно по нажатию. Фрагменты — эвристические подсказки для проверки, не подтверждённые факты.</p></div>
      <time className="text-[11px] text-[#78837a]" dateTime={report.searchedAt}>{new Date(report.searchedAt).toLocaleString('ru-RU')}</time>
    </div>
    {queryPlan.length > 0 && <div className="mt-3 rounded border border-[#e0dfd4] bg-[#fbfaf5] p-2.5">
      <strong className="text-xs">План поиска</strong>
      <ul className="mt-1 space-y-1 text-xs text-[#66736a]">{queryPlan.map((item, index) => <li key={`${item.topic}-${index}`}><span className="font-medium">{item.label}</span> · {item.query}</li>)}</ul>
      <p className="mt-1 text-[11px] text-[#78837a]">До пяти поисковых запросов и одной генерации; автоматических повторов нет.</p>
    </div>}
    {report.queries.length > 0 && <div className="mt-3"><strong className="text-xs">Поисковые запросы</strong><ul className="mt-1 list-inside list-disc text-xs text-[#66736a]">{report.queries.slice(0, 5).map((query, index) => <li key={`${query}-${index}`}>{query}</li>)}</ul></div>}
    {coverage.length > 0 && <div data-testid="ai-research-coverage" className="mt-3 rounded border border-[#d8d9cc] bg-[#fbfaf5] p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-xs text-[#43574a]">Покрытие тем · эвристические фрагменты</strong>
        <span className="text-[11px] text-[#8b5d43]">Нужна редакторская проверка; это не верифицированные сведения</span>
      </div>
      <div className="mt-2 space-y-2">{coverage.map((item, topicIndex) => <section key={`${item.topic}-${topicIndex}`} className="rounded border border-[#e5e3d9] bg-[#f8f7f0] p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-[#43574a]">{item.label || topicLabels[item.topic]}</h3>
          <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${item.status === 'evidence' ? 'bg-[#e8efe6] text-[#45634e]' : 'bg-[#f5ece2] text-[#8b5d43]'}`}>{item.status === 'evidence' ? `Есть фрагменты · ${item.evidence.length}` : 'Сведений не найдено'}</span>
        </div>
        {item.status === 'missing' || item.evidence.length === 0
          ? <p className="mt-1 text-xs text-[#78837a]">В отчёте нет подходящих фрагментов по этой теме. Не следует трактовать это как отсутствие самого факта.</p>
          : <ul className="mt-2 space-y-2">{item.evidence.map((evidence, index) => {
            const source = sourceFor(evidence.sourceIndex);
            return <li key={`${evidence.sourceIndex}-${index}`} className="border-l-2 border-[#b67b5a] pl-2.5">
              <p className="whitespace-pre-wrap text-xs leading-5 text-[#526158]">«{evidence.excerpt}»</p>
              <p className="mt-1 text-[10px] text-[#78837a]">Фрагмент{evidence.passageIds.length === 1 ? '' : 'ы'} {evidence.passageIds.join(', ') || 'не указаны'} · {source
                ? <a className="break-all font-medium underline underline-offset-2" href={source.finalUrl} target="_blank" rel="noopener noreferrer">источник {evidence.sourceIndex + 1}: {source.title || source.finalUrl}<ExternalLink className="ml-1 inline h-3 w-3" /></a>
                : <span>источник {evidence.sourceIndex + 1} · метаданные источника отсутствуют</span>}</p>
            </li>;
          })}</ul>}
      </section>)}</div>
    </div>}
    {coverage.length === 0 && <p className="mt-3 rounded border border-dashed border-[#c9cbbf] p-2.5 text-xs text-[#718075]">Структурное покрытие тем недоступно в этом запуске.</p>}
    {missingContext.length > 0 && <div className="mt-3 rounded border border-[#dfc9b5] bg-[#f5ece2] p-2.5 text-xs text-[#75533e]"><strong>В статье пока не заполнено</strong><ul className="mt-1 list-inside list-disc">{missingContext.map(item => <li key={item}>{item}</li>)}</ul></div>}
    {report.warnings.length > 0 && <div className="mt-3 rounded border border-[#dfc9b5] bg-[#f5ece2] p-2.5 text-xs text-[#75533e]"><strong>Не хватает контекста / замечания</strong><ul className="mt-1 list-inside list-disc">{report.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></div>}
    {report.failures.length > 0 && <div className="mt-3 rounded border border-[#d79c89] bg-[#faeee9] p-2.5 text-xs text-[#8b4535]"><strong>Не удалось прочитать источники</strong><ul className="mt-1 space-y-1">{report.failures.map((failure, index) => <li key={`${failure.url}-${index}`}><a className="break-all underline" href={failure.url} target="_blank" rel="noopener noreferrer">{failure.url}</a><span> — {failure.reason}</span></li>)}</ul></div>}
    {sources.length > 0 ? <div className="mt-3">
      <strong className="text-xs">Прочитанные источники · до шести</strong>
      <ul className="mt-1 space-y-2">{sources.slice(0, 6).map((source, index) => <li key={`${source.sha256}-${index}`} className="flex items-start gap-2 rounded border border-[#e0dfd4] bg-[#fbfaf5] p-2 text-xs">
        <input className="mt-1 accent-[#315647]" type="checkbox" checked={selected.includes(source.finalUrl)} onChange={() => toggle(source.finalUrl)} disabled={disabled || (!selected.includes(source.finalUrl) && selectedNew.length >= 3)} aria-label={`Выбрать найденный источник ${source.title || source.finalUrl}`} />
        <div className="min-w-0 flex-1"><a className="break-all font-medium text-[#43574a] underline underline-offset-2" href={source.finalUrl} target="_blank" rel="noopener noreferrer">{source.title || source.finalUrl}<ExternalLink className="ml-1 inline h-3 w-3" /></a><p className="mt-1 break-all text-[#78837a]">{source.finalUrl}</p><p className="mt-1 text-[#78837a]">Получен {new Date(source.retrievedAt).toLocaleString('ru-RU')} · {source.characters.toLocaleString('ru-RU')} знаков · SHA-256 {source.sha256.slice(0, 12)}…{source.truncated ? ' · текст усечён' : ''}</p></div>
      </li>)}</ul>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><span className="text-[11px] text-[#78837a]">Отметьте ссылки, затем явно добавьте их в ручной список. Уже введённый текст сохраняется.</span><Button size="sm" variant="outline" disabled={disabled || selected.length === 0 || tooMany} onClick={() => { onAppend(selected); setSelected([]); setNotice('Выбранные ссылки добавлены к ручному списку.'); }}>Добавить в ручные источники</Button></div>
      {tooMany && <p role="alert" className="mt-2 text-xs text-[#8b4535]">В ручном списке может быть не более трёх ссылок. Удалите лишние строки или снимите часть отметок.</p>}
      {notice && <p role="status" className="mt-2 text-xs text-[#45634e]">{notice}</p>}
    </div> : <p className="mt-3 rounded border border-dashed border-[#c9cbbf] p-3 text-xs text-[#718075]">Читаемых источников в этом отчёте нет. Причины отказов и частичные результаты показаны выше.</p>}
    {photos.length > 0 && <ResearchPhotos
      photos={photos}
      selectedIds={selectedPhotoIds}
      rightsConfirmed={photoRightsConfirmed}
      disabled={disabled || !canSelectPhotos}
      onToggle={onTogglePhoto}
      onRightsConfirmedChange={onPhotoRightsChange}
      canImport={canImportPhotos && !disabled}
      onImport={onImportPhotos}
    />}
    {photos.length > 0 && !canSelectPhotos && <p className="mt-2 text-xs text-[#8b5d43]">
      {report && !canImportPhotos
        ? 'Фотографии можно импортировать только из готового запуска, созданного для этой статьи. Запущенные или завершившиеся ошибкой задания импортировать нельзя.'
        : 'Кандидаты доступны только для ознакомления.'}
    </p>}
  </section>;
}
