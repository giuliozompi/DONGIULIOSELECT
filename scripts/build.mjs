import { build as viteBuild } from 'vite';
import { build as serverBuild } from 'esbuild';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const digest = data => createHash('sha256').update(data).digest('hex');
const placeholder = 'RELEASE_ID_REPLACED_AFTER_BUNDLING';

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const name = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(name) : [name];
  }));
  return nested.flat().sort();
}

// Works from Timeweb's source archive too: no Git or environment values used.
await viteBuild();
await serverBuild({
  entryPoints: ['server/index.ts'], platform: 'node', packages: 'external',
  bundle: true, format: 'esm', outdir: 'dist',
  define: { __RELEASE_ID__: JSON.stringify(placeholder) },
});
const server = await readFile('dist/index.js', 'utf8');
const hash = createHash('sha256').update(server);
const assets = [];
for (const file of await filesIn('dist/public')) {
  const content = await readFile(file);
  const url = '/' + path.relative('dist/public', file).split(path.sep).join('/');
  hash.update(url).update('\0').update(digest(content)).update('\0');
  if (/\.(js|css)$/.test(file)) assets.push({ path: url, sha256: digest(content) });
}
const buildId = hash.digest('hex');
await writeFile('dist/index.js', server.replaceAll(placeholder, buildId));
const html = await readFile('dist/public/index.html', 'utf8');
await writeFile('dist/public/index.html',
  html.replace('</head>', `<meta name="release-id" content="${buildId}"></head>`));
await writeFile('dist/public/release.json', JSON.stringify({ buildId, assets }));
console.log(`Build ID: ${buildId}`);
