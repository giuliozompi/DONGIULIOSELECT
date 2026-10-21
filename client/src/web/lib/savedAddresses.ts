export interface SavedAddress {
  id: string;
  label: string;
  fullAddress: string;
  city: string;
  street?: string | null;
  building?: string | null;
  apartment?: string | null;
  postalCode?: string | null;
  notes?: string | null;
  isDefault: boolean;
  createdAt: string;
}

// DaData may already include the flat in fullAddress, while manually saved
// addresses can keep it only in apartment. Preserve both without duplicating it.
export function savedDeliveryAddress(address: SavedAddress): string {
  const apartment = address.apartment?.trim();
  if (!apartment) return address.fullAddress;
  const escaped = apartment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const included = new RegExp(
    `(?:^|[\\s,;])(?:кв(?:артира)?\\.?|апартаменты|apartment|apt\\.?)\\s*${escaped}(?=$|[\\s,;])`,
    'iu',
  ).test(address.fullAddress);
  return included ? address.fullAddress : `${address.fullAddress}, кв. ${apartment}`;
}
