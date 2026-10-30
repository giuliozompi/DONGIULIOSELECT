import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { printAdminOrder, type AdminPrintFormat } from '../client/src/lib/printAdminOrder';

const formats: AdminPrintFormat[] = ['packing-list', 'label', 'order-summary'];
const html = '<!doctype html><html><body>Fixture order</body></html>';

function fixture(t: TestContext) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const timers: (() => void)[] = [];
  const windows: ReturnType<typeof makeWindow>[] = [];
  let blocked = false;
  function makeWindow() {
    const output = {
      html: '', closed: false, printed: 0, focused: 0, failWrite: false, failPrint: false,
      document: {
        open() {
          if (output.closed || output.failWrite) throw new Error('Window inaccessible');
          output.html = '';
        },
        write(value: string) { output.html += value; },
        close() {},
      },
      focus() { output.focused++; },
      print() {
        if (output.failPrint) throw new Error('Печать недоступна.');
        output.printed++;
      },
    };
    return output;
  }
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      open() {
        if (blocked) return null;
        const popup = makeWindow();
        windows.push(popup);
        return popup;
      },
      setTimeout(callback: () => void, ms: number) {
        assert.equal(ms, 300);
        timers.push(callback);
      },
    },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  return { windows, timers, block(value: boolean) { blocked = value; } };
}

for (const format of formats) {
  for (const failure of ['blocked', '401', '403', '500', 'missing', 'empty', 'whitespace', 'wrong-type', 'closed-loading', 'closed-delay', 'print-throws', 'inaccessible'] as const) {
    test(`${format}: ${failure} rejects clearly without successful print and allows a manual retry`, async t => {
      const f = fixture(t);
      let calls = 0;
      f.block(failure === 'blocked');
      let release!: (value: { html: string }) => void;
      const delayed = new Promise<{ html: string }>(resolve => { release = resolve; });
      const pending = printAdminOrder(format, async () => {
        calls++;
        if (['401', '403', '500', 'inaccessible'].includes(failure)) {
          if (failure === 'inaccessible') f.windows[0].failWrite = true;
          throw new Error(`Ошибка сервера ${failure} <script>"&'</script>`);
        }
        if (failure === 'closed-loading') return delayed;
        if (failure === 'missing') return {} as { html: string };
        if (failure === 'wrong-type') return { html: 123 } as unknown as { html: string };
        return { html: failure === 'empty' ? '' : failure === 'whitespace' ? ' \n ' : html };
      });
      const rejected = assert.rejects(pending, error => {
        const message = (error as Error).message;
        assert.match(message, failure === 'blocked' ? /Разрешите всплывающие окна/
          : failure.startsWith('closed') ? /Окно печати закрыто.*Повторите/
          : failure === 'print-throws' ? /Печать недоступна/
          : ['missing', 'empty', 'whitespace', 'wrong-type'].includes(failure) ? /Сервер не вернул документ/
          : /Ошибка сервера/);
        return true;
      });
      if (failure === 'closed-loading') {
        f.windows[0].closed = true;
        release({ html });
      }
      await Promise.resolve();
      if (failure === 'closed-delay') f.windows[0].closed = true;
      if (failure === 'print-throws') f.windows[0].failPrint = true;
      f.timers.splice(0).forEach(callback => callback());
      await rejected;
      assert.equal(calls, failure === 'blocked' ? 0 : 1);
      assert.ok(f.windows.every(popup => popup.printed === 0));
      if (f.windows.length && !f.windows[0].closed && failure !== 'inaccessible') {
        assert.match(f.windows[0].html, /Не удалось подготовить печать/);
        assert.match(f.windows[0].html, /повторите печать из заказа/);
        assert.doesNotMatch(f.windows[0].html, /<script>/);
        if (['401', '403', '500'].includes(failure)) {
          assert.match(f.windows[0].html, /&lt;script&gt;&quot;&amp;&#39;/);
        }
      }
      assert.equal(f.timers.length, 0);

      // Recovery is a new explicit call, never an automatic retry.
      f.block(false);
      const retry = printAdminOrder(format, async () => { calls++; return { html }; });
      assert.equal(f.windows.at(-1)?.printed, 0);
      await Promise.resolve();
      assert.equal(f.timers.length, 1);
      f.timers.shift()!();
      await retry;
      assert.equal(f.windows.at(-1)?.html, html);
      assert.equal(f.windows.at(-1)?.focused, 1);
      assert.equal(f.windows.at(-1)?.printed, 1);
      assert.equal(calls, failure === 'blocked' ? 1 : 2);
    });
  }
}
