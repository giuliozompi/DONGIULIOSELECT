import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ListChecks, LoaderCircle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { DraftBatchItemStatus, DraftBatchReview } from '@shared/editorial-ai-batch';
import { editorialAiApi } from '../../lib/editorialAiApi';

const labels: Record<DraftBatchItemStatus, string> = {
  queued: 'В очереди', running: 'Готовится', ready: 'Готов к проверке',
  failed: 'Ошибка', skipped: 'Пропущена', cancelled: 'Остановлена',
};
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Не удалось выполнить действие.';

export default function DraftBatchPanel({ onReview }: { onReview: (result: DraftBatchReview) => boolean }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [batchId, setBatchId] = useState('');
  const [confirmation, setConfirmation] = useState<{ count: number; requestId: string }>();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const lock = useRef(false);
  const query = useQuery({
    queryKey: ['/web-api/admin/editorial-ai/batches', page, batchId],
    queryFn: () => editorialAiApi.draftBatches(page, batchId || undefined),
    enabled: open, refetchInterval: query => query.state.data?.active ? 4000 : false, retry: false,
  });
  const current = query.data?.latest;
  const count = query.data?.eligibleCount ?? 0;
  const complete = current ? current.total - current.counts.queued - current.counts.running : 0;

  async function act(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setActionError('');
    try { await work(); } catch (error) { setActionError(errorText(error)); }
    finally { lock.current = false; setBusy(false); }
  }

  return <section data-testid="editorial-draft-batch" className="mb-5 rounded-md border border-[#d7d8cc] bg-[#fbfaf5] p-4">
    <button type="button" className="flex items-center gap-2 text-sm font-semibold text-[#315647]" aria-expanded={open}
      onClick={() => setOpen(value => !value)}><ListChecks className="h-4 w-4" />Фоновая подготовка черновиков</button>
    {open && <div className="mt-3 space-y-3">
      <p className="text-sm text-[#68746b]">ИИ готовит статьи по очереди, даже если закрыть админку. Готовые предложения, одобренные и опубликованные статьи не обрабатываются. Тексты не переносятся в статью без редактора.</p>
      {query.isLoading && <p role="status" className="text-sm">Проверяем список статей…</p>}
      {query.isError && <div role="alert" className="space-x-2 text-sm text-[#8b4535]">
        {errorText(query.error)} <Button variant="outline" size="sm" onClick={() => { void query.refetch(); }}>Обновить</Button>
      </div>}
      {actionError && <p role="alert" className="text-sm text-[#8b4535]">{actionError}</p>}
      {query.data && !query.isError && <div className="flex flex-wrap items-center gap-3">
        <Button data-testid="draft-batch-review-start" size="sm" disabled={count === 0 || query.data.active || busy || query.isFetching}
          onClick={() => { setActionError(''); setConfirmation({ count, requestId: crypto.randomUUID() }); }}>
          <Sparkles className="mr-1.5 h-4 w-4" />Подготовить все черновики ({count})
        </Button>
        {!query.data.active && count === 0 && <span className="text-sm text-[#68746b]">Нет статей, которым нужен новый черновик.</span>}
        {!query.data.active && <Button size="sm" variant="outline" disabled={query.isFetching || busy} onClick={() => { void query.refetch(); }}>Обновить список</Button>}
        {query.data.history.length > 1 && <label className="text-xs text-[#526158]">Запуск <select className="ml-2 max-w-full rounded border bg-background p-1" value={batchId}
          onChange={event => { setBatchId(event.target.value); setPage(1); setActionError(''); }}>
          <option value="">Последний</option>
          {query.data.history.map(batch => <option key={batch.id} value={batch.id}>{new Date(batch.createdAt).toLocaleString('ru-RU')}</option>)}
        </select></label>}
      </div>}
      {current && <div className="space-y-3 border-t border-[#d7d8cc] pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="status" data-testid="draft-batch-progress" className="text-sm font-medium">
            {current.finishedAt ? (current.stoppedAt ? 'Очередь остановлена' : 'Очередь завершена') : current.stoppedAt ? 'Ожидаем завершения текущей статьи' : 'Очередь работает'} · {complete} / {current.total}
          </p>
          {!current.finishedAt && !current.stoppedAt && <Button type="button" variant="outline" size="sm" disabled={busy}
            onClick={() => { void act(async () => { await editorialAiApi.stopDraftBatch(current.id); await query.refetch(); }); }}>Остановить очередь</Button>}
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#68746b]">{Object.entries(current.counts)
          .map(([status, n]) => <li key={status}>{labels[status as DraftBatchItemStatus]}: {n}</li>)}</ul>
        <ul className="divide-y divide-[#e0dfd4]">{current.items.map(item => <li key={item.entryId} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
          <div className="min-w-0 break-words"><span className="font-medium">{item.title}</span> · {labels[item.status]}
            {item.detail && <p className="max-w-3xl text-xs text-[#78553d]">{item.detail}</p>}</div>
          {item.status === 'ready' && <Button type="button" variant="outline" size="sm" disabled={busy}
            onClick={() => { void act(async () => {
              const result = await editorialAiApi.reviewDraftBatch(current.id, item.entryId);
              if (!onReview(result)) throw new Error('Не удалось открыть черновик. Закройте другие окна и обновите список.');
            }); }}>Открыть черновик</Button>}
        </li>)}</ul>
        {current.total > current.limit && <div className="flex items-center gap-2 text-xs">
          <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Назад</Button>
          <span>Страница {page}</span>
          <Button size="sm" variant="outline" disabled={page * current.limit >= current.total} onClick={() => setPage(page + 1)}>Далее</Button>
        </div>}
      </div>}
    </div>}
    <Dialog open={Boolean(confirmation)} onOpenChange={value => { if (!value && !lock.current) setConfirmation(undefined); }}>
      <DialogContent aria-describedby="draft-batch-confirmation">
        <DialogHeader>
          <DialogTitle>Запустить фоновую подготовку?</DialogTitle>
          <DialogDescription id="draft-batch-confirmation">
            Статей: {confirmation?.count}. На каждую — до пяти запросов поиска и одного запроса к ИИ. Запросы расходуют лимиты сервисов. Статьи не будут изменены или опубликованы.
          </DialogDescription>
        </DialogHeader>
        {actionError && <p role="alert" className="text-sm text-[#8b4535]">{actionError}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmation(undefined)}>Отмена</Button>
          <Button type="button" data-testid="draft-batch-start" disabled={busy} onClick={() => { void act(async () => {
            if (!confirmation) return;
            try {
              await editorialAiApi.startDraftBatch(confirmation.requestId, confirmation.count);
              setConfirmation(undefined);
              setBatchId('');
              setPage(1);
            } finally { await query.refetch(); }
          }); }}>
            {busy && <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" />}Запустить очередь
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
