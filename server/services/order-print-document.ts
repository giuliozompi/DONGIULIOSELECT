import QRCode from 'qrcode';
import { isKilogramUnit } from '../../shared/order-quantity';
import type { Order } from '../../shared/schema';

export type OrderPrintFormat = 'packing-list' | 'label';

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]!));

function quantity(item: Order['items'][number]) {
  const count = Number(item.quantity);
  if (!Number.isFinite(count) || count <= 0) throw new Error('Некорректное количество товара в заказе.');
  if (isKilogramUnit(item.unit)) return `${count.toFixed(3).replace('.', ',')} кг`;
  return `${count.toLocaleString('ru-RU', { maximumFractionDigits: 3 })} ${escapeHtml(item.unit)}`;
}

export async function renderOrderPrintDocument(order: Order, format: OrderPrintFormat) {
  if (format !== 'packing-list' && format !== 'label') throw new Error('Неизвестный формат печати.');
  if (format === 'label' && ['УДАЛЕНО', 'ВОЗВРАТ'].includes(order.status)) {
    throw new Error('Нельзя напечатать этикетку для отменённого или возвращённого заказа.');
  }
  // Fail before printing any items rather than silently publishing an incomplete list.
  const rows = order.items.map((item, i) => `<tr><td class="check">${format === 'packing-list' ? '□' : i + 1}</td>
    <td>${escapeHtml(item.productName)}</td><td class="qty">${quantity(item)}</td></tr>`).join('');
  const qr = await QRCode.toString(order.id, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, width: 256 });
  const reference = escapeHtml(order.id.slice(-6).toUpperCase());
  const fullId = escapeHtml(order.id);
  const customer = escapeHtml(order.customerName);
  const address = escapeHtml(order.deliveryAddress);
  const delivery = escapeHtml(order.deliveryMethod || '—');
  const notes = order.deliveryNotes ? `<p class="notes"><strong>Примечание:</strong> ${escapeHtml(order.deliveryNotes)}</p>` : '';
  const heading = format === 'packing-list' ? 'Лист сборки заказа' : 'Этикетка заказа';
  const list = format === 'packing-list'
    ? `<section><h2>Товары к сборке · ${order.items.length}</h2>
         <table><thead><tr><th></th><th>Наименование</th><th>Количество / вес</th></tr></thead>
         <tbody>${rows || '<tr><td colspan="3">Нет товаров</td></tr>'}</tbody></table></section>`
    : '';
  const sheet = format === 'label'
    ? `<div class="label-top">DON GIULIO SELECT <small>Внутренняя этикетка · не накладная перевозчика</small></div>
        <div class="name">${customer}</div><div class="address">${address}</div><div class="delivery">${delivery}</div>
        <div class="qr-wrap">${qr}</div><div class="reference">№ ${reference}</div>
        <div class="full-id">${fullId}</div>`
    : `<header><div><strong>DON GIULIO SELECT</strong><h1>${heading}</h1><p>Заказ № ${reference}</p>
          <p>Клиент: <strong>${customer}</strong></p><p>Адрес: ${address}</p><p>Доставка: ${delivery}</p>${notes}</div>
          <div class="qr-wrap">${qr}<div class="full-id">${fullId}</div></div></header>${list}`;
  const pageSize = format === 'label' ? '100mm 150mm' : 'A4';

  return `<!doctype html><html lang="ru"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${heading} № ${reference}</title>
    <style>
      @page { size: ${pageSize}; margin: ${format === 'label' ? '4mm' : '14mm'}; }
      * { box-sizing:border-box; } body { font: 12pt Arial,sans-serif; color:#111; margin:0; }
      .toolbar { padding:12px; text-align:center; background:#f5f5f5; }
      .toolbar button { padding:10px 24px; font:inherit; cursor:pointer; }
      main { padding:${format === 'label' ? '4mm' : '0'}; margin:auto; max-width:${format === 'label' ? '100mm' : '190mm'}; overflow-wrap:anywhere; }
      header { display:flex; justify-content:space-between; gap:16mm; border-bottom:2px solid #111; padding:8mm 0; }
      h1 { margin:4mm 0; font-size:22pt; } h2 { margin:9mm 0 4mm; font-size:16pt; }
      header p { margin:2mm 0; } .qr-wrap { text-align:center; flex:none; }
      .qr-wrap svg { display:block; width:${format === 'label' ? '52mm' : '32mm'}; height:auto; margin:auto; }
      .full-id { font:9pt monospace; letter-spacing:.1pt; margin-top:2mm; overflow-wrap:anywhere; }
      table { width:100%; border-collapse:collapse; } th,td { border-bottom:1px solid #bbb; padding:3mm 2mm; text-align:left; vertical-align:top; }
      .check { width:8mm; } .qty { text-align:right; white-space:nowrap; font-weight:bold; }
      .label-top { font-size:11pt; font-weight:bold; border-bottom:1px solid #111; padding-bottom:3mm; }
      .label-top small { display:block; font-size:7pt; font-weight:normal; margin-top:1mm; }
      .name { font-size:18pt; font-weight:bold; padding:4mm 0 2mm; }
      .address { font-size:11pt; min-height:9mm; } .delivery { margin-top:2mm; font-size:10pt; }
      .label-top + .name + .address + .delivery + .qr-wrap { margin:4mm auto 0; }
      .reference { text-align:center; font-size:14pt; font-weight:bold; margin-top:2mm; }
      .label-top ~ .full-id { text-align:center; font-size:7pt; }
      @media print { .toolbar { display:none; } body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
    </style></head><body>
    <div class="toolbar"><button type="button" onclick="window.print()">Печать</button></div>
    <main>${sheet}</main></body></html>`;
}
