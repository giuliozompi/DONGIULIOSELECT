import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cheeseMilkCompositionSchema } from '@shared/editorial';
import { cheeseMilkLabels, cheeseMilkText, cheeseMilkTypes, resolveCheeseMilk, type CheeseMilk, type CheeseMilkResult } from '@shared/editorial-cheese-milk';

export type MilkCompositionDraft = { type: CheeseMilk; percentage?: string | number }[];

export function milkCompositionForSave(value?: MilkCompositionDraft) {
  return value?.length ? value.map(({ type, percentage }) => {
    const raw = String(percentage ?? '').trim();
    return { type, percentage: raw === '' ? undefined : /^\d+(?:[.,]\d{1,2})?$/.test(raw) ? Number(raw.replace(',', '.')) : NaN };
  }) : undefined;
}

export default function CheeseMilkEditor({ value = [], detected, disabled, onChange }: {
  value?: MilkCompositionDraft;
  detected: CheeseMilkResult;
  disabled: boolean;
  onChange: (value: MilkCompositionDraft | undefined) => void;
}) {
  const manual = value.length > 0;
  const validated = manual ? cheeseMilkCompositionSchema.safeParse(milkCompositionForSave(value)) : undefined;
  const preview = validated?.success ? resolveCheeseMilk({ milkComposition: validated.data }) : detected;
  const hint = detected.status === 'review' ? 'В тексте указаны варианты или противоречивые сведения.' :
    detected.status === 'unknown' ? 'В описании и характеристиках вид молока не уточнён.' : '';

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-2 rounded-md border border-[#cbd4c8] bg-[#edf1e9] p-3 text-sm text-[#365344]" aria-describedby="ed-milk-help">
      <legend className="px-1 font-semibold">Состав молока</legend>
      <p id="ed-milk-help" className="text-xs leading-5">
        Выберите один или несколько видов. Если доля неизвестна, оставьте поле пустым.
        Состав, указанный редактором, заменит результат анализа текста после публикации.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-xs">По тексту: {cheeseMilkText(detected)}{hint && ` · ${hint}`}</p>
        {manual ? <Button type="button" size="sm" variant="outline" onClick={() => onChange(undefined)}>Вернуть автоопределение</Button> :
          detected.status === 'known' && <Button type="button" size="sm" variant="outline"
            onClick={() => onChange(detected.types.map(type => ({ type })))}>Взять виды из текста</Button>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {cheeseMilkTypes.map(type => {
          const item = value.find(item => item.type === type);
          return (
            <div key={type} className="flex min-h-11 items-center justify-between gap-2 rounded-md border border-[#cbd4c8] bg-white px-2">
              <label className="flex min-h-10 grow cursor-pointer items-center gap-2">
                <input type="checkbox" data-testid={`ed-milk-${type}`} className="accent-[#315647]" checked={Boolean(item)} onChange={event => {
                  const next = event.target.checked ? [...value, { type }] : value.filter(item => item.type !== type);
                  onChange(next.length ? next : undefined);
                }} />
                {cheeseMilkLabels[type]}
              </label>
              {item && <Input type="text" inputMode="decimal" maxLength={6} placeholder="—" className="h-8 w-20 shrink-0"
                aria-label={`Доля (${cheeseMilkLabels[type]} молоко), %`} aria-invalid={validated?.success === false}
                data-testid={`ed-milk-percentage-${type}`} value={item.percentage ?? ''}
                onChange={event => onChange(value.map(item => item.type === type ? { ...item, percentage: event.target.value } : item))} />}
            </div>
          );
        })}
      </div>
      <div data-testid="editorial-milk-summary" aria-live="polite">
        {validated?.success === false ?
          <p className="text-xs text-red-800">{validated.error.issues[0].message}</p> :
          <strong>Вид молока: {cheeseMilkText(preview)}</strong>}
      </div>
    </fieldset>
  );
}
