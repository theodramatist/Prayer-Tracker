// The public edition (everyone/): built fresh, it must match what's
// committed, carry nothing of the full edition's own, and keep to itself on
// a device it shares with the full edition.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const built = await mkdtemp(join(tmpdir(), 'prayer-tracker-public-'));
execFileSync(process.execPath, [join(ROOT, 'scripts/build-public.mjs'), '--out', built], { stdio: 'pipe' });

async function tree(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    if ((await stat(p)).isDirectory()) out.push(...(await tree(p)));
    else out.push(p);
  }
  return out;
}

const files = (await tree(built)).map((p) => relative(built, p)).sort();
const read = (p) => readFile(join(built, p), 'utf8');

test.after(() => rm(built, { recursive: true, force: true }));

test('the committed everyone/ is up to date (run node scripts/build-public.mjs)', async () => {
  const committed = (await tree(join(ROOT, 'everyone'))).map((p) => relative(join(ROOT, 'everyone'), p)).sort();
  assert.deepEqual(committed, files);
  for (const f of files) {
    const a = await readFile(join(built, f));
    const b = await readFile(join(ROOT, 'everyone', f));
    assert.ok(a.equals(b), `everyone/${f} is out of date`);
  }
});

test('nothing of the full edition’s own is in it', async () => {
  for (const gone of ['js/data/diocese.js', 'js/share.js']) assert.ok(!files.includes(gone), gone);
  const personal = [/Chris Corbin/, /Corbin/, /docs\.google\.com\/forms/, /Trinity Prayer Requests/, /Share with Trinity/, /Trinity’s/,
    /api\.github\.com/, /GitHubFile/, /prayer-data/, /episcopalchurch\.org/, /lesser_feasts/, /Wisconsin/, /trinityosh/, /frchris/i];
  for (const f of files.filter((x) => !x.startsWith('vendor/') && /\.(js|html|css|webmanifest)$/.test(x))) {
    const text = await read(f);
    for (const re of personal) assert.ok(!re.test(text), `${f} has ${re}`);
  }
  // The stand-ins, in place of the full edition's modules.
  for (const m of ['edition', 'share-ui', 'extras', 'sync', 'lff', 'seeds']) {
    assert.equal(await read(`js/${m}.js`), await readFile(join(ROOT, 'edition/public', `${m}.js`), 'utf8'), m);
  }
});

test('it keeps its data, theme and offline copy apart from the full edition’s', async () => {
  const { STORAGE_KEY, defaultState } = await import(pathToFileURL(join(built, 'js/store.js')).href);
  assert.equal(STORAGE_KEY, 'prayer-tracker-public:data');
  assert.deepEqual(defaultState().lists.map((l) => [l.id, l.name]), [
    ['anglican', 'Anglican Cycle of Prayer'], ['parish', 'My Church'], ['requests', 'Prayer Requests'], ['family', 'Family'], ['prayers', 'Prayers and Thanksgivings'],
  ]);
  assert.ok(!defaultState().lists.some((l) => l.morningPrayer));
  assert.match(await read('index.html'), /localStorage\.getItem\('prayer-tracker-public:ui'\)/);
  const sw = await read('sw.js');
  assert.match(sw, /const CACHE = `prayer-tracker-public-\$\{VERSION\}`;/);
  assert.match(sw, /const OWN_CACHE = \/\^prayer-tracker-public-\\d\/;/);
  assert.doesNotMatch(sw, /ELSEWHERE/);
  // Its service worker caches every file it has, and only those.
  const assets = [...sw.matchAll(/^\s+'\.\/([^']*)',$/gm)].map((m) => m[1]).filter(Boolean);
  for (const a of assets) assert.ok(files.includes(a), `sw.js lists ${a}`);
  for (const f of files.filter((x) => /^js\/.*\.js$/.test(x))) assert.ok(assets.includes(f), `sw.js is missing ${f}`);
  // And the full edition's leaves the public edition's caches and folder alone.
  const own = await readFile(join(ROOT, 'sw.js'), 'utf8');
  const ownPattern = new RegExp(own.match(/const OWN_CACHE = \/(.*)\/;/)[1]);
  assert.ok(ownPattern.test('prayer-tracker-2.8.0') && !ownPattern.test('prayer-tracker-public-2.8.0'));
  assert.match(own, /if \(url\.pathname\.startsWith\(ELSEWHERE\)\) return;/);
});

test('its manifest and instructions page', async () => {
  const manifest = JSON.parse(await read('manifest.webmanifest'));
  assert.equal(manifest.scope, './');
  assert.equal(manifest.start_url, './');
  assert.match(manifest.description, /your church/);
  const install = await read('install.html');
  assert.match(install, /Add to Home Screen/);
  assert.match(install, /Install app/);
  assert.match(install, /stays on your phone/);
});
