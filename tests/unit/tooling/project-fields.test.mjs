import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('root package has required test scripts for pyramid', async () => {
  const raw = await readFile(new URL('../../../package.json', import.meta.url), 'utf8');
  const pkg = JSON.parse(raw);

  assert.equal(typeof pkg.scripts?.['test:unit'], 'string');
  assert.equal(typeof pkg.scripts?.['test:integration'], 'string');
  assert.equal(typeof pkg.scripts?.['test:e2e'], 'string');
  assert.equal(typeof pkg.scripts?.['ci:tests'], 'string');
});

