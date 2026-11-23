import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  editorialSectionLimits, editorialSourceUrl,
  type DraftResult, type EditorialAiRun, type EditorialSectionField,
} from '@shared/editorial-ai';
import type { EditorialEntry } from '@shared/editorial';
import { editorialAiApi } from '../../lib/editorialAiApi';

export default function CheeseSectionResearch({ entry, field, label, text, sources, disabled, onIntegrate }: {
  entry: EditorialEntry;
  field: EditorialSectionField;
  label: string;
  text: string;
  sources: string[];
  disabled: boolean;
  onIntegrate: (base: string, merged: string, sources: string[]) => string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [starting, setStarting] = useState(false);
  const [run, setRun] = useState<EditorialAiRun>();
  const [base, setBase] = useState('');
  const [editedAddition, setEditedAddition] = useState<string>();
  const [error, setError] = useState('');
  const lock = useRef(false);
  const polled = useQuery({
    queryKey: ['editorial-section-addition', run?.id],
    queryFn: () => editorialAiApi.run(run!.id),
    enabled: run?.status === 'running',
    refetchInterval: query => query.state.status !== 'error' &&
      (!query.state.data || query.state.data.status === 'running') ? 2000 : false,
    retry: 1,
  });
  const current = polled.data ?? run;
  const result = current?.result as DraftResult | undefined;
  const failures = result?.research?.failures ?? [];
  const proposal = current?.status === 'ready' ? result?.fields[field]?.trim() : undefined;
  const addition = (editedAddition ?? proposal ?? '').trim();
  const busy = starting || current?.status === 'running';
  const merged = base.trim() ? `${base.trimEnd()}${field === 'region' ? '; ' : '\n\n'}${addition}` : addition;
  const changed = Boolean(proposal && text !== base);
  const duplicate = Boolean(addition && base.trim().toLocaleLowerCase().includes(addition.toLocaleLowerCase()));
  const tooLong = merged.length > editorialSectionLimits[field];
  const cited = Array.from(new Set((result?.citations ?? [])
    .filter(citation => citation.field === field)
    .map(citation => result?.sources[citation.sourceIndex]?.url)
    .filter((url): url is string => Boolean(url && editorialSourceUrl.safeParse(url).success))));
  const notesId = `section-research-notes-${field}`;
  const additionId = `section-research-addition-${field}`;

  async function start() {
    if (lock.current || busy || disabled) return;
    lock.current = true;
    setStarting(true);
    setError('');
    setEditedAddition(undefined);
    setRun(undefined);
    setBase(text);
    const manualSources = Array.from(new Set(sources.flatMap(url => {
      const parsed = editorialSourceUrl.safeParse(url);
      return parsed.success && !/^https:\/\/www\.openstreetmap\.org\/(?:node|way|relation)\/\d+$/.test(parsed.data)
        ? [parsed.data] : [];
    }))).slice(0, 3);
    try {
      setRun(await editorialAiApi.research({
        requestId: crypto.randomUUID(), entryId: entry.id, revision: entry.revision,
        sources: manualSources,
        intent: { mode: 'deepen', field, instructions: instructions.trim() || undefined,
          addition: { existingText: text.length > 6000 ? `${text.slice(0, 2999)}\n${text.slice(-3000)}` : text } },
      }));
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Не удалось запустить поиск. Повторите вручную.');
    } finally {
      lock.current = false;
      setStarting(false);
    }
  }

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>
      <Button type="button" size="sm" variant="outline" data-testid={`ai-deepen-${field}`} disabled={disabled}>
        <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Углубить и дополнить с ИИ
      </Button>
    </DialogTrigger>
    {open && <DialogContent data-testid="editorial-section-research"
      className="max-h-[88dvh] w-[calc(100%-2rem)] max-w-xl grid-cols-[minmax(0,1fr)] overflow-y-auto border-[#d9d7ca] bg-[#fbfaf6] p-4 text-[#29352f] sm:p-6">
      <DialogHeader className="pr-7">
        <DialogTitle className="font-serif text-xl">Углубить раздел «{label}»</DialogTitle>
        <DialogDescription>ИИ предложит новый текст в стиле статьи. Вы сможете проверить его, отредактировать и добавить в раздел. Статья сохранится только по вашей команде.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={notesId}>Что уточнить? (необязательно)</Label>
          <Textarea id={notesId} rows={2} maxLength={500} disabled={busy} value={instructions}
            onChange={event => setInstructions(event.target.value)} placeholder="Например: уточнить, когда появились первые упоминания" />
          <p className="text-xs text-muted-foreground">До {field === 'description' ? 4 : 1} запросов поиска Brave и 1 запроса к ИИ. Повтора без новой команды не будет.</p>
        </div>
        {busy && !polled.isError && <p role="status" className="text-sm">Ищем источники и готовим дополнение…</p>}
        {polled.isError && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-[#8b4535]">
          Не удалось проверить состояние поиска.
          <Button type="button" size="sm" variant="outline" disabled={polled.isFetching} onClick={() => { void polled.refetch(); }}>Проверить снова</Button>
        </div>}
        {(error || current?.status === 'failed') && <p role="alert" className="text-sm text-[#8b4535]">{error || current?.error || 'Не удалось подготовить дополнение. Текст не изменён.'}</p>}
        {current?.status === 'ready' && !proposal && <p role="status" className="text-sm">Новых подтверждённых сведений не найдено. Текст раздела не изменён.</p>}
        {proposal && <div className="space-y-2">
          <Label htmlFor={additionId}>Дополнительный текст</Label>
          <Textarea id={additionId} data-testid="section-research-addition" value={editedAddition ?? proposal}
            rows={6} maxLength={editorialSectionLimits[field]} onChange={event => setEditedAddition(event.target.value)} />
          {cited.length > 0 && <div className="text-xs text-muted-foreground">
            <p>Источники для проверки:</p>
            <ul className="list-inside list-disc">{cited.map(url => <li key={url} className="break-all">
              <a href={url} target="_blank" rel="noreferrer noopener" className="underline">{url}</a>
            </li>)}</ul>
          </div>}
          {changed && <p role="alert" className="text-sm text-[#8b4535]">Текст раздела изменился после начала поиска. Запустите поиск заново для обновлённого текста.</p>}
          {duplicate && <p role="status" className="text-sm">Этот текст уже есть в разделе.</p>}
          {tooLong && <p role="alert" className="text-sm text-[#8b4535]">Сократите дополнение: в разделе допустимо до {editorialSectionLimits[field]} знаков.</p>}
        </div>}
        {(Boolean(result?.warnings.length) || failures.length > 0) && <details className="rounded border border-[#dedfd5] p-2 text-xs text-[#68746b]">
          <summary className="cursor-pointer">Замечания поиска</summary>
          <ul className="mt-1 list-inside list-disc space-y-1">
            {result?.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
            {failures.map(({ url, reason }, index) => <li key={`${index}:${url}`} className="break-words">{url} — {reason}</li>)}
          </ul>
        </details>}
      </div>
      <DialogFooter className="gap-2 sm:flex-wrap sm:space-x-0">
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>Закрыть</Button>
        <Button type="button" variant={proposal ? 'outline' : 'default'} data-testid="section-research-start"
          disabled={Boolean(busy || disabled)} onClick={() => { void start(); }}>{current ? 'Новый поиск' : 'Найти дополнение'}</Button>
        {proposal && <Button type="button" data-testid="section-research-integrate" disabled={!addition || duplicate || changed || tooLong || disabled}
          onClick={() => {
            const issue = onIntegrate(base, merged, cited);
            if (issue) { setError(issue); return; }
            setRun(undefined);
            setEditedAddition(undefined);
            setOpen(false);
          }}>Добавить в текст</Button>}
      </DialogFooter>
    </DialogContent>}
  </Dialog>;
}
