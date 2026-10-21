import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatOrderQuantity, parseOrderQuantity } from '@shared/order-quantity';

interface Props {
  quantity: number;
  productName: string;
  disabled: boolean;
  onSave: (quantity: number) => Promise<unknown>;
}

export function OrderWeightEditor({ quantity, productName, disabled, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const parsed = parseOrderQuantity(value, 'кг');

  if (!editing) {
    return (
      <Button variant="outline" disabled={disabled} onClick={() => {
        setValue(formatOrderQuantity(quantity, 'кг'));
        setEditing(true);
      }} aria-label={`Изменить вес: ${productName}`}>
        {formatOrderQuantity(quantity, 'кг')} кг · Изменить вес
      </Button>
    );
  }

  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={async e => {
      e.preventDefault();
      if (parsed === null || disabled) return;
      try {
        await onSave(parsed);
        setEditing(false);
      } catch {
        // The mutation displays the server error; keep the entered weight for retry.
      }
    }}>
      <label className="flex items-center gap-1 text-sm">
        Вес, кг
        <Input type="text" inputMode="decimal" value={value}
          onChange={e => setValue(e.target.value)} disabled={disabled}
          aria-label={`Вес в килограммах: ${productName}`}
          aria-invalid={parsed === null} placeholder="0,735" className="w-24" autoFocus />
      </label>
      <Button type="submit" size="sm" disabled={disabled || parsed === null}>Сохранить</Button>
      <Button type="button" size="sm" variant="ghost" disabled={disabled}
        onClick={() => setEditing(false)}>Отмена</Button>
      <p className="w-full text-xs text-muted-foreground">До 3 знаков после запятой, минимум 0,001 кг.</p>
    </form>
  );
}
