export function isKilogramUnit(unit: string): boolean {
  return ['кг', 'kg'].includes(unit.trim().toLowerCase());
}

export function isValidOrderQuantity(quantity: number, unit: string): boolean {
  return Number.isFinite(quantity) && quantity > 0 && (
    !isKilogramUnit(unit) ||
    Math.abs(quantity * 1000 - Math.round(quantity * 1000)) < 1e-8
  );
}

export function parseOrderQuantity(value: string, unit: string): number | null {
  const text = value.trim();
  const pattern = isKilogramUnit(unit)
    ? /^(?:\d+|\d*[.,]\d{1,3})$/
    : /^(?:\d+|\d*[.,]\d+)$/;
  if (!pattern.test(text)) return null;
  const quantity = Number(text.replace(',', '.'));
  return isValidOrderQuantity(quantity, unit) ? quantity : null;
}

export function formatOrderQuantity(quantity: number, unit: string): string {
  return isKilogramUnit(unit) ? quantity.toFixed(3).replace('.', ',') : String(quantity);
}
