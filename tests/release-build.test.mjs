import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const sha = content => createHash('sha256').update(content).digest('hex');
const backend = `export const fixtureReleaseId = __RELEASE_ID__;
export const backendMessage = "backend original";
throw new Error("Build fixtures must never be executed");
`;
const frontend = `import './style.css';
document.body.textContent = 'frontend original';
document.body.onclick = () => import('./lazy.js').then(module => module.show());
`;

async function sourceArchive(t) {
  // Outside the checkout: no .git, app config, .env, database or application imports.
  const directory = await mkdtemp(path.join(tmpdir(), 'release-build-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const files = {
    'package.json': JSON.stringify({ private: true, type: 'module' }),
    'vite.config.js': `export default {
      root: 'client',
      build: { outDir: '../dist/public', emptyOutDir: true }
    };`,
    'server/index.ts': backend,
    'client/index.html': '<!doctype html><html><head><title>Release fixture</title></head><body><script type="module" src="/main.js"></script></body></html>',
    'client/main.js': frontend,
    'client/style.css': 'body { color: #123456; }',
    'client/lazy.js': `import './lazy.css'; export function show() { document.body.textContent = 'lazy content'; }`,
    'client/lazy.css': 'body { background: #abcdef; }',
    'client/public/sw.js': `self.addEventListener('install', () => self.skipWaiting());`,
    'client/public/nested/extra.js': 'console.log("nested public asset");',
    'client/public/nested/extra.css': '.extra { color: blue; }',
  };
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(directory, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  await mkdir(path.join(directory, 'scripts'));
  // Exercise the unchanged production orchestrator and installed real compilers.
  await copyFile(path.join(projectRoot, 'scripts/build.mjs'), path.join(directory, 'scripts/build.mjs'));
  await symlink(path.join(projectRoot, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
  await assert.rejects(access(path.join(directory, '.git')), { code: 'ENOENT' });
  return directory;
}

async function filesIn(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(path.join(directory, prefix), { withFileTypes: true })) {
    const name = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(directory, name));
    else files.push(name);
  }
  return files.sort();
}

async function compileAndCheck(directory) {
  const { stdout } = await execFileAsync(process.execPath, ['scripts/build.mjs'], {
    cwd: directory,
    // Allowlist only: never pass workspace secrets, NODE_OPTIONS or Git metadata.
    env: { PATH: process.env.PATH, NODE_ENV: 'production', TZ: 'UTC' },
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
  const publicDir = path.join(directory, 'dist/public');
  const server = await readFile(path.join(directory, 'dist/index.js'), 'utf8');
  const html = await readFile(path.join(publicDir, 'index.html'), 'utf8');
  const manifest = JSON.parse(await readFile(path.join(publicDir, 'release.json'), 'utf8'));
  assert.match(manifest.buildId, /^[a-f0-9]{64}$/);
  const serverId = server.match(/\bfixtureReleaseId\s*=\s*"([a-f0-9]{64})"/)?.[1];
  assert.equal(serverId, manifest.buildId, 'server must embed the manifest ID');
  assert.ok(!server.includes('RELEASE_ID_REPLACED_AFTER_BUNDLING'));
  assert.ok(!server.includes('__RELEASE_ID__'));
  assert.deepEqual(
    [...html.matchAll(/<meta name="release-id" content="([^"]+)">/g)].map(match => match[1]),
    [serverId],
    'HTML must contain exactly one matching release ID',
  );
  assert.match(stdout, new RegExp(`Build ID: ${serverId}\\b`));

  const assetPaths = (await filesIn(publicDir))
    .filter(name => /\.(js|css)$/.test(name)).map(name => '/' + name);
  assert.deepEqual(manifest.assets.map(asset => asset.path).sort(), assetPaths,
    'manifest must list every JS/CSS file exactly once, including nested files');
  assert.ok(assetPaths.includes('/sw.js'));
  assert.ok(assetPaths.includes('/nested/extra.js'));
  assert.ok(assetPaths.includes('/nested/extra.css'));
  assert.ok(assetPaths.some(name => /^\/assets\/lazy-.*\.js$/.test(name)), 'real lazy JS chunk');
  assert.ok(assetPaths.some(name => /^\/assets\/lazy-.*\.css$/.test(name)), 'real lazy CSS chunk');
  for (const asset of manifest.assets) {
    assert.match(asset.sha256, /^[a-f0-9]{64}$/);
    assert.equal(asset.sha256, sha(await readFile(path.join(publicDir, asset.path.slice(1)))),
      `checksum must match compiled bytes: ${asset.path}`);
  }
  return { buildId: serverId, assets: manifest.assets, server };
}

test('source archive builds without Git: consistent IDs, content sensitivity and complete checksums',
  { timeout: 120_000 }, async t => {
    const directory = await sourceArchive(t);
    const original = await compileAndCheck(directory);
    const repeated = await compileAndCheck(directory);
    assert.equal(repeated.buildId, original.buildId, 'unchanged sources must retain their ID on rebuild');
    assert.deepEqual(repeated.assets, original.assets);

    await writeFile(path.join(directory, 'server/index.ts'),
      backend.replace('backend original', 'backend changed'));
    const backendChanged = await compileAndCheck(directory);
    assert.notEqual(backendChanged.buildId, original.buildId, 'backend-only changes must change the ID');
    assert.deepEqual(backendChanged.assets, original.assets, 'backend change must leave frontend bytes unchanged');

    // Restore the backend so the frontend assertion cannot pass because of that edit.
    await writeFile(path.join(directory, 'server/index.ts'), backend);
    await writeFile(path.join(directory, 'client/main.js'),
      frontend.replace('frontend original', 'frontend changed'));
    const frontendChanged = await compileAndCheck(directory);
    assert.notEqual(frontendChanged.buildId, original.buildId, 'frontend-only changes must change the ID');
    assert.notDeepEqual(frontendChanged.assets, original.assets, 'frontend edit must reach the compiled assets');
    assert.equal(
      frontendChanged.server.replaceAll(frontendChanged.buildId, '<release-id>'),
      original.server.replaceAll(original.buildId, '<release-id>'),
      'frontend-only build must keep the backend unchanged except for the embedded ID',
    );
  });
