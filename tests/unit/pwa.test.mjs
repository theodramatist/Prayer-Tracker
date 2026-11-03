import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

import { VERSION } from '../../js/version.js';

const root = new URL('../../', import.meta.url);
const sw = await readFile(new URL('sw.js', root), 'utf8');
const assets = [...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]);

test('service worker caches every app file', async () => {
  const expected = [
    'index.html', 'manifest.webmanifest',
    ...(await readdir(new URL('js/', root))).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`),
    ...(await readdir(new URL('css/', root))).map((f) => `css/${f}`),
    ...(await readdir(new URL('icons/', root))).filter((f) => f !== 'icon.svg').map((f) => `icons/${f}`),
  ];
  for (const file of expected) assert.ok(assets.includes(file), `sw.js ASSETS is missing ${file}`);
});

test('service worker and app versions match', () => {
  const swVersion = sw.match(/const VERSION = '([^']+)'/)[1];
  assert.equal(swVersion, VERSION);
});

test('manifest is valid and its icons exist', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', root), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
  for (const icon of manifest.icons) await readFile(new URL(icon.src, root));
  assert.equal(manifest.shortcuts[0].url, './?add');
  assert.equal(manifest.share_target.method, 'GET');
});
