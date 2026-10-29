import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const script = readFileSync(new URL('../scripts/post-merge.sh', import.meta.url), 'utf8');

test('post-merge setup is valid non-interactive bash and fails fast', () => {
  const result = spawnSync('bash', ['-n', 'scripts/post-merge.sh'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(script, /set -euo pipefail/);
  assert.doesNotMatch(script, /read -p|npm init/);
});

test('post-merge setup checks and installs committed locks, including the isolated preview', () => {
  assert.ok(script.indexOf('tests/deployment-lockfile.test.mjs') < script.indexOf('npm ci'));
  assert.equal((script.match(/npm ci/g) || []).length, 2);
  assert.match(script, /if \[\[ -f artifacts\/mockup-sandbox\/package-lock\.json \]\]/);
  assert.match(script, /npm ci --workspaces=false/);
  assert.doesNotMatch(script, /npm install|npm update|--force|--legacy-peer-deps/);
});

test('automatic setup never pushes schema or runs database migrations', () => {
  assert.doesNotMatch(script, /db:push|drizzle-kit|migrate|psql/);
});
