import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';

class Connection {
  nextId = 0;
  pending = new Map();
  handlers = new Map();
  constructor(socket) {
    this.socket = socket;
    socket.on('message', raw => {
      const message = JSON.parse(String(raw));
      if (message.id) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) pending?.reject(new Error(message.error.message));
        else pending?.resolve(message.result);
      } else {
        for (const handler of this.handlers.get(message.method) || []) {
          Promise.resolve(handler(message.params)).catch(error => {
            this.eventError = error;
          });
        }
      }
    });
  }
  static async open(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    return new Connection(socket);
  }
  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  on(method, handler) {
    this.handlers.set(method, [...(this.handlers.get(method) || []), handler]);
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    if (this.eventError) throw this.eventError;
    return result.result.value;
  }
  async wait(expression, timeout = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await this.evaluate(expression)) return;
      await delay(50);
    }
    throw new Error(`Timed out waiting for: ${expression}`);
  }
  async click(selector) {
    await this.wait(`!!document.querySelector(${JSON.stringify(selector)})`);
    const point = await this.evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      element.scrollIntoView({ block: 'center' });
      const rect = element.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`);
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  }
  async fill(selector, value) {
    await this.evaluate(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
  }
}

export async function launchBrowser() {
  const profile = await mkdtemp(join(tmpdir(), 'checkout-auth-browser-'));
  const process = spawn(globalThis.process.env.CHROMIUM_PATH || 'chromium', [
    '--headless', '--no-sandbox', '--disable-dev-shm-usage',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const url = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Chromium did not start')), 15000);
    process.stderr.on('data', chunk => {
      output += chunk;
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    process.once('error', error => { clearTimeout(timer); reject(error); });
    process.once('exit', code => { clearTimeout(timer); reject(new Error(`Chromium exited: ${code}`)); });
  });
  const root = await Connection.open(url);
  return {
    async newPage() {
      const { browserContextId } = await root.send('Target.createBrowserContext');
      const { targetId } = await root.send('Target.createTarget', { url: 'about:blank', browserContextId });
      const address = new URL(url);
      const targets = await (await fetch(`http://${address.host}/json/list`)).json();
      const page = await Connection.open(targets.find(target => target.id === targetId).webSocketDebuggerUrl);
      await page.send('Page.enable');
      await page.send('Runtime.enable');
      // The app's service worker can otherwise proxy fetches in a separate target
      // outside page-level interception and accidentally reach real APIs.
      await page.send('Network.enable');
      await page.send('Network.setBypassServiceWorker', { bypass: true });
      await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
      page.close = async () => {
        page.socket.close();
        await root.send('Target.disposeBrowserContext', { browserContextId });
      };
      return page;
    },
    async close() {
      root.socket.close();
      process.kill('SIGTERM');
      await new Promise(resolve => {
        if (process.exitCode !== null) resolve();
        else process.once('exit', resolve);
      });
      // Chromium subprocesses can flush files just after the launcher exits.
      await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    },
  };
}
