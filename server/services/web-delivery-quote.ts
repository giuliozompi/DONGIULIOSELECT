import { getDaDataService } from './dadata';
import { MOSCOW_DELIVERY_RUB, type WebDeliveryQuote } from '../../shared/web-delivery';

const optionalAddressWords = new Set(['г', 'город', 'ул', 'улица', 'д', 'дом']);
const normalizedTerms: Record<string, string> = { квартира: 'кв', строение: 'стр', корпус: 'корп', область: 'обл' };
const normalize = (text: string) => text.toLowerCase().replaceAll('ё', 'е')
  .replace(/^\s*\d{6}[,\s]+/, '').replace(/[,.]/g, ' ').trim().split(/\s+/)
  .filter(word => !optionalAddressWords.has(word))
  .map(word => Object.hasOwn(normalizedTerms, word) ? normalizedTerms[word] : word).join(' ');

export type DeliveryLookup = (address: string) => Promise<Array<{
  fullAddress: string; building: string | null; inMoscow: boolean | null;
}>>;

const lookup: DeliveryLookup = async address => await getDaDataService()?.suggestAddress(address) ?? [];

export async function quoteWebDelivery(
  choice: 'courier' | 'pickup', address: string, findAddress = lookup,
): Promise<WebDeliveryQuote> {
  if (choice === 'pickup') return { method: 'web_pickup', fee: '0.00' };
  if (address.length >= 10) {
    // A suggested house on a similar street is not proof of where the customer
    // lives. Rate only an exact normalized address, never the client's region.
    const matches = (await findAddress(address)).filter(result =>
      result.building && normalize(result.fullAddress) === normalize(address));
    if (matches.length && matches.every(result => result.inMoscow === true)) {
      return { method: 'web_moscow', fee: MOSCOW_DELIVERY_RUB.toFixed(2) };
    }
    if (matches.length && matches.every(result => result.inMoscow === false)) {
      return { method: 'web_regional', fee: null };
    }
  }
  return { method: 'web_unconfirmed', fee: null };
}
