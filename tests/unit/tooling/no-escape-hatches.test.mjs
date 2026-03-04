import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('workspace package test scripts are present', async () => {
  const apiRaw = await readFile(new URL('../../../apps/api/package.json', import.meta.url), 'utf8');
  const webRaw = await readFile(new URL('../../../apps/web/package.json', import.meta.url), 'utf8');
  const apiPkg = JSON.parse(apiRaw);
  const webPkg = JSON.parse(webRaw);

  assert.equal(typeof apiPkg.scripts?.['test:unit'], 'string');
  assert.equal(typeof apiPkg.scripts?.['test:integration'], 'string');
  assert.equal(typeof webPkg.scripts?.['test:unit'], 'string');
});

