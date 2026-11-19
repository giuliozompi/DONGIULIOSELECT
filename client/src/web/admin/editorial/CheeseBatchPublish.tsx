import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

export type CheesePublicationSelection = { id: string; revision: number; title: string };

export default function CheeseBatchPublish({ count, eligibleCount, busy, review, error, stale, onSelectPage,
  onClear, onReview, onClose, onConfirm, onRefresh }: {
  count: number;
  eligibleCount: number;
  busy: boolean;
  review: CheesePublicationSelection[] | null;
  error?: string;
  stale: boolean;
  onSelectPage: () => void;
  onClear: () => void;
  onReview: () => void;
  onClose: () => void;
  onConfirm: () => void;
  onRefresh: () => void;
}) {
  return <AlertDialog open={review !== null} onOpenChange={open => open ? onReview() : onClose()}>
    <div data-testid="cheese-batch-toolbar" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#d7d8cc] bg-[#fbfaf6] px-4 py-3">
      <span className="text-sm font-medium text-[#315647]" aria-live="polite">Выбрано: {count}</span>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy || count === eligibleCount} onClick={onSelectPage}>Выбрать все на странице</Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy || !count} onClick={onClear}>Снять выбор</Button>
        <AlertDialogTrigger asChild>
          <Button type="button" size="sm" data-testid="cheese-batch-review" disabled={busy || !count} className="bg-[#315647] text-white hover:bg-[#244537]">Опубликовать выбранные</Button>
        </AlertDialogTrigger>
      </div>
    </div>
    <AlertDialogContent data-testid="cheese-batch-dialog" className="w-[calc(100vw-2rem)] rounded-lg border-[#d7d8cc] bg-[#fbfaf6]">
      <AlertDialogHeader>
        <AlertDialogTitle>Опубликовать выбранные статьи?</AlertDialogTitle>
        <AlertDialogDescription>Эти статьи станут доступны читателям одновременно. Всего: {review?.length ?? 0}.</AlertDialogDescription>
      </AlertDialogHeader>
      <ul className="max-h-[32dvh] list-disc space-y-1 overflow-y-auto break-words pl-5 text-sm">
        {review?.map(item => <li key={item.id}>{item.title}</li>)}
      </ul>
      {(error || stale) && <p role="alert" className="text-sm text-[#8b4535]">
        {error || 'Список изменился. Обновите его и выберите статьи заново.'}
      </p>}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel>
        {stale ? <Button type="button" variant="outline" onClick={onRefresh} disabled={busy}>Обновить список</Button>
          : <Button type="button" data-testid="cheese-batch-confirm" disabled={busy} onClick={onConfirm} className="bg-[#315647] text-white hover:bg-[#244537]">
            {busy ? 'Публикация…' : 'Подтвердить публикацию'}
          </Button>}
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
