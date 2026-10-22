export type AdminPrintFormat = 'packing-list' | 'label';

/**
 * Open the window during the click gesture, before awaiting the API, so browsers
 * don't treat printing as an unsolicited popup.
 */
export async function printAdminOrder(
  format: AdminPrintFormat,
  loadDocument: () => Promise<{ html: string }>,
) {
  const popup = window.open('', '_blank');
  if (!popup) throw new Error('Разрешите всплывающие окна для печати заказа.');

  const documentLabel = format === 'packing-list' ? 'листа комплектации A4' : 'этикетки 100 × 150 мм';
  popup.document.open();
  popup.document.write(
    `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Подготовка печати</title><body style="font:16px sans-serif;padding:24px">Подготовка ${documentLabel}…</body></html>`,
  );
  popup.document.close();

  try {
    const result = await loadDocument();
    if (!result || typeof result.html !== 'string' || !result.html.trim()) {
      throw new Error('Сервер не вернул документ для печати.');
    }
    popup.document.open();
    popup.document.write(result.html);
    popup.document.close();
    popup.focus();
    window.setTimeout(() => {
      if (!popup.closed) popup.print();
    }, 300);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось загрузить документ.';
    popup.document.open();
    popup.document.write(
      `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Ошибка печати</title><body style="font:16px sans-serif;padding:24px"><h1>Не удалось подготовить печать</h1><p>${escapeHtml(message)}</p><p>Закройте это окно и повторите печать из заказа.</p></body></html>`,
    );
    popup.document.close();
    throw error;
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char] || char);
}
