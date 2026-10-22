import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

export const validId = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export async function checkRelease({
  expected, origin = 'https://dongiulioselect.ru', timeoutMs = 120000,
  intervalMs = 5000, requestMs = 8000, log = console.log,
}) {
  if (!validId(expected)) throw new Error('Specificare il Build ID completo (64 caratteri esadecimali).');
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 600000 ||
      !Number.isFinite(intervalMs) || intervalMs < 1 ||
      !Number.isFinite(requestMs) || requestMs < 1) throw new Error('Scadenza non valida (massimo 600 secondi).');
  const base = new URL(origin);
  if (base.username || base.password || base.pathname !== '/' || base.search || base.hash ||
      (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(base.hostname)))) {
    throw new Error('Usare un’origine HTTPS senza credenziali, percorso o parametri.');
  }
  const deadline = Date.now() + timeoutMs;
  let last = 'non raggiungibile';

  async function get(resource, type, allowDegraded = false) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('scadenza raggiunta');
    const url = new URL(resource, base);
    url.searchParams.set('_release_check', `${expected}-${Date.now()}`);
    let response;
    try {
      response = await fetch(url, {
        method: 'GET', redirect: 'error', credentials: 'omit',
        headers: { 'Cache-Control': 'no-cache', Accept: type },
        signal: AbortSignal.timeout(Math.max(1, Math.min(requestMs, remaining))),
      });
      if (!response.ok && !(allowDegraded && response.status === 503)) {
        await response.body?.cancel();
        throw new Error(`HTTP ${response.status}`);
      }
      if (!(response.headers.get('content-type') || '').toLowerCase().includes(type)) {
        await response.body?.cancel();
        throw new Error('tipo di risposta inatteso (possibile fallback HTML)');
      }
      // The request timeout also bounds reading the body. Never log remote bodies.
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 20 * 1024 * 1024) {
          await reader.cancel();
          throw new Error('risposta troppo grande');
        }
        chunks.push(Buffer.from(value));
      }
      return Buffer.concat(chunks);
    } catch (error) {
      // Do not echo fetch errors: they can include infrastructure details.
      if (/^(HTTP \d{3}|tipo di risposta inatteso|risposta troppo grande)/.test(error.message)) throw error;
      throw new Error('connessione non disponibile o timeout');
    }
  }
  async function json(resource, allowDegraded = false) {
    const buffer = await get(resource, 'application/json', allowDegraded);
    try { return JSON.parse(buffer.toString()); }
    catch { throw new Error('JSON non valido'); }
  }

  while (Date.now() < deadline) {
    try {
      const health = await json('/healthz', true);
      if (health.buildId !== expected) {
        throw new Error(validId(health.buildId)
          ? `versione diversa online: ${health.buildId}` : 'versione online non identificabile (release precedente o health non aggiornato)');
      }
      if (health.status !== 'ok' || health.db !== 'reachable' ||
          !health.startup || !['routes', 'frontend', 'migrations', 'seed'].every(key => health.startup[key] === 'ready')) {
        const notReady = ['routes', 'frontend', 'migrations', 'seed']
          .filter(key => health.startup?.[key] !== 'ready');
        if (health.db !== 'reachable') notReady.push('db');
        throw new Error(`build attesa presente ma avvio degradato: ${notReady.join(', ') || 'stato server'}`);
      }
      const html = (await get('/', 'text/html')).toString();
      if (!html.includes(`<meta name="release-id" content="${expected}">`)) {
        throw new Error('frontend di una versione diversa o privo di identificatore');
      }
      const manifest = await json('/release.json');
      if (manifest.buildId !== expected || !Array.isArray(manifest.assets) ||
          manifest.assets.length < 1 || manifest.assets.length > 256) throw new Error('manifest frontend non coerente');
      const paths = new Set();
      for (const asset of manifest.assets) {
        if (!asset || !/^\/[A-Za-z0-9_./-]+\.(js|css)$/.test(asset.path) ||
            asset.path.includes('..') || asset.path.startsWith('//') || !validId(asset.sha256) ||
            paths.has(asset.path)) throw new Error('manifest asset non valido');
        paths.add(asset.path);
      }
      const entries = [...html.matchAll(/(?:src|href)=["'](\/[^"']+\.(?:js|css))["']/g)].map(match => match[1]);
      if (!entries.some(entry => entry.endsWith('.js')) || entries.some(entry => !paths.has(entry))) {
        throw new Error('asset iniziali assenti dal manifest');
      }
      for (const asset of manifest.assets) {
        const bytes = await get(asset.path, asset.path.endsWith('.css') ? 'text/css' : 'javascript');
        if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) {
          throw new Error('contenuto asset frontend non coerente');
        }
      }
      if (Date.now() >= deadline) throw new Error('scadenza raggiunta');
      log(`VERIFICATO: build ${expected}, avvio e ${paths.size} asset JS/CSS pubblici. UI autenticata non verificata.`);
      return true;
    } catch (error) {
      last = error.message;
      log(`NON VERIFICATO: ${last}`);
    }
    const remaining = deadline - Date.now();
    if (remaining > 0) await delay(Math.min(intervalMs, remaining));
  }
  log(`SCADUTO: rilascio non confermato entro ${timeoutMs / 1000}s. Ultimo esito: ${last}. Consultare l’esito e i log di build/avvio Timeweb; nessun deploy o dato modificato.`);
  return false;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (!args[0] || args.length > 2) {
    console.error('Uso: npm run release:check -- <Build-ID> [scadenza-secondi, default 120, max 600]');
    process.exitCode = 2;
  } else {
    try {
      process.exitCode = await checkRelease({ expected: args[0], timeoutMs: Number(args[1] ?? 120) * 1000 }) ? 0 : 1;
    } catch (error) {
      console.error(error.message);
      process.exitCode = 2;
    }
  }
}
