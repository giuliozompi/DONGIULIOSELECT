import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));

test('committed npm downloads are portable outside the workspace', () => {
  let checked = 0;
  for (const [name, entry] of Object.entries(lock.packages)) {
    if (!entry.resolved) continue;
    let url;
    try { url = new URL(entry.resolved); }
    catch { assert.fail(`Invalid download URL for ${name}`); }
    assert.ok(!url.username && !url.password, `Registry credentials must not be committed for ${name}`);
    assert.ok(url.protocol === 'https:', `Use secure public download URLs for ${name}`);
    assert.ok(!url.hostname.endsWith('.internal') && !url.hostname.endsWith('.localhost')
      && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
    `Workspace-only download URL prevents external deployment: ${name}`);
    if (url.hostname === 'registry.npmjs.org') {
      assert.ok(typeof entry.integrity === 'string' && /^sha(256|384|512)-/.test(entry.integrity),
        `Keep the published package integrity for ${name}`);
    }
    checked++;
  }
  assert.ok(checked > 0, 'No package downloads were checked');
});
