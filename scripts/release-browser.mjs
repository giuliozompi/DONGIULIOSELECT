import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// A separate process group bounds Chromium startup, CDP, rendering AND shutdown.
// No customer profile or environment credentials are passed to the worker.
export async function checkPublicBrowser({ origin, expected, assets, timeoutMs }) {
  if (timeoutMs <= 0) throw new Error('browser: scadenza complessiva raggiunta');
  const temporary = await mkdtemp(join(tmpdir(), 'release-browser-'));
  let child;
  try {
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('browser: scadenza complessiva raggiunta')), timeoutMs);
      child = spawn(process.execPath, [fileURLToPath(new URL('./release-browser-worker.mjs', import.meta.url))], {
        detached: true,
        stdio: ['pipe', 'pipe', 'ignore'],
        env: {
          PATH: process.env.PATH, HOME: temporary, TMPDIR: temporary,
          ...(process.env.CHROMIUM_PATH ? { CHROMIUM_PATH: process.env.CHROMIUM_PATH } : {}),
        },
      });
      let output = '';
      child.stdout.on('data', bytes => {
        output += bytes;
        if (output.length > 4096) {
          clearTimeout(timer);
          reject(new Error('browser: risposta non valida'));
        }
      });
      child.once('error', () => {
        clearTimeout(timer);
        reject(new Error('browser: avvio non disponibile'));
      });
      child.once('exit', code => {
        clearTimeout(timer);
        try {
          const value = JSON.parse(output);
          if (code !== 0 || !['ok', 'javascript', 'network', 'render', 'version', 'policy', 'unavailable'].includes(value.status)) throw new Error();
          resolve(value);
        } catch { reject(new Error('browser: avvio o esecuzione non disponibile')); }
      });
      child.stdin.on('error', () => {});
      child.stdin.end(JSON.stringify({ origin, expected, assets }));
    });
    const messages = {
      javascript: 'errori JavaScript o console.error nella home pubblica',
      network: 'documento, JS/CSS o API pubblica essenziale non disponibile',
      render: 'rendering della home pubblica assente o incompleto',
      version: 'versione della home nel browser diversa da quella attesa',
      policy: 'richiesta non consentita bloccata prima dell’invio',
      unavailable: 'Chromium non disponibile o esecuzione fallita',
    };
    if (result.status !== 'ok') throw new Error(`browser: ${messages[result.status]}`);
    return result;
  } finally {
    if (child?.pid) {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already exited */ }
    }
    await rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}
