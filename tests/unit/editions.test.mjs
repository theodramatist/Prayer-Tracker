// The editions for anyone (everyone/, wisconsin/, eastern-ridges/): built
// fresh, each must match what's committed, carry nothing of the full
// edition's own, start with its own lists, and keep to itself on a device it
// shares with the others.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const built = await mkdtemp(join(tmpdir(), 'prayer-tracker-editions-'));
execFileSync(process.execPath, [join(ROOT, 'scripts/build-editions.mjs'), '--root', built], { stdio: 'pipe' });
const NAMES = ['everyone', 'wisconsin', 'eastern-ridges'];
const STORAGE = { everyone: 'prayer-tracker-public', wisconsin: 'prayer-tracker-wisconsin', 'eastern-ridges': 'prayer-tracker-eastern-ridges' };

async function tree(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    if ((await stat(p)).isDirectory()) out.push(...(await tree(p)));
    else out.push(p);
  }
  return out;
}

const files = {};
for (const ed of NAMES) files[ed] = (await tree(join(built, ed))).map((p) => relative(join(built, ed), p)).sort();
const read = (ed, p) => readFile(join(built, ed, p), 'utf8');
const memory = () => {
  const data = {};
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; } };
};
/** A first run of an edition, as on a new phone. */
async function firstRun(ed) {
  const { Store, STORAGE_KEY } = await import(pathToFileURL(join(built, ed, 'js/store.js')).href);
  const { SEEDS } = await import(pathToFileURL(join(built, ed, 'js/seeds.js')).href);
  const { sortItems } = await import(pathToFileURL(join(built, ed, 'js/schedule.js')).href);
  const store = new Store(memory());
  for (const seed of SEEDS) store.seed(seed);
  return { store, STORAGE_KEY, sortItems };
}

test.after(() => rm(built, { recursive: true, force: true }));

test('each committed edition is up to date (run node scripts/build-editions.mjs)', async () => {
  for (const ed of NAMES) {
    const committed = (await tree(join(ROOT, ed))).map((p) => relative(join(ROOT, ed), p)).sort();
    assert.deepEqual(committed, files[ed], ed);
    for (const f of files[ed]) {
      const a = await readFile(join(built, ed, f));
      const b = await readFile(join(ROOT, ed, f));
      assert.ok(a.equals(b), `${ed}/${f} is out of date`);
    }
  }
});

test('nothing of the full edition’s own is in them', async () => {
  // Trinity's form and your name on it, the GitHub sync, Morning Prayer lists.
  const personal = [/Chris Corbin/, /docs\.google\.com\/forms/, /Trinity Prayer Requests/, /Share with Trinity/, /Trinity’s/,
    /api\.github\.com/, /GitHubFile/, /prayer-data/, /trinityosh/, /frchris/i];
  for (const ed of NAMES) {
    assert.ok(!files[ed].includes('js/share.js'), `${ed} has share.js`);
    for (const f of files[ed].filter((x) => !x.startsWith('vendor/') && /\.(js|html|css|webmanifest)$/.test(x))) {
      const text = await read(ed, f);
      for (const re of personal) {
        // The diocese's published cycles, and the Eastern Ridges clergy, name Chris Corbin as one to pray for.
        if (re.source.startsWith('Chris Corbin') && ['js/data/diocese.js', 'js/data/eastern-ridges.js'].includes(f)) continue;
        assert.ok(!re.test(text), `${ed}/${f} has ${re}`);
      }
    }
    for (const m of ['share-ui', 'extras', 'sync']) {
      assert.equal(await read(ed, `js/${m}.js`), await readFile(join(ROOT, 'edition/public/js', `${m}.js`), 'utf8'), `${ed} ${m}`);
    }
    const { store } = await firstRun(ed);
    assert.ok(!store.state.lists.some((l) => l.morningPrayer), `${ed}: a Morning Prayer list`);
  }
  // Only the Wisconsin editions carry the diocese's cycles, and only Eastern Ridges its clergy.
  assert.ok(!files.everyone.some((f) => /diocese|diocesan|eastern-ridges/.test(f)));
  for (const f of files.everyone) if (/\.(js|html)$/.test(f) && !f.startsWith('vendor/')) assert.doesNotMatch(await read('everyone', f), /Wisconsin|Corbin/, f);
  assert.ok(files.wisconsin.includes('js/data/diocese.js') && !files.wisconsin.includes('js/data/eastern-ridges.js'));
  assert.ok(files['eastern-ridges'].includes('js/data/eastern-ridges.js'));
});

test('each starts with its own lists: the diocese’s cycles, and the Eastern Ridges clergy by last name', async () => {
  const lists = async (ed) => (await firstRun(ed)).store.state.lists.map((l) => [l.id, l.name, l.items.length]);
  assert.deepEqual(await lists('everyone'), [
    ['anglican', 'Anglican Cycle of Prayer', 0], ['parish', 'My Church', 0], ['requests', 'Prayer Requests', 0], ['family', 'Family', 0], ['prayers', 'Prayers and Thanksgivings', 0],
  ]);
  assert.deepEqual(await lists('wisconsin'), [
    ['anglican', 'Anglican Cycle of Prayer', 0], ['diocese', 'Diocesan Cycle', 105], ['diocese-daily', 'Diocesan Daily Cycle', 307], ['parish', 'My Church', 0],
    ['requests', 'Prayer Requests', 0], ['family', 'Family', 0], ['prayers', 'Prayers and Thanksgivings', 0],
  ]);
  const { store, sortItems } = await firstRun('eastern-ridges');
  assert.deepEqual(store.state.lists.map((l) => l.id), ['anglican', 'diocese', 'diocese-daily', 'clergy', 'parish', 'requests', 'family', 'prayers']);
  const clergy = store.list('clergy');
  assert.equal(clergy.name, 'Eastern Ridges Clergy');
  assert.equal(clergy.type, 'daily');
  assert.deepEqual(sortItems(clergy, clergy.items).map((i) => i.text), [
    'Mary Lynn Adams', 'Brien Beck', 'Nancy Behm', 'James Biegler', 'Dr. Chris Corbin', 'Portia Corbin', 'Sam Cripps', 'Dr. Hilary Crupi',
    'Andy Cruz Lillegard', 'Mark Evans', 'Brit Frazier', 'Mike Hackbarth', 'Amy Heimerl', 'Julia Hendrix', 'Robert Hoppe', 'Glenn Kanestrom',
    'Jeannie Manning', 'Brian Staude', 'Lisa Ueda', 'Cam Walker', 'Aran Walter',
  ]);
  // Taking your own name off keeps it off, even when the app starts again.
  const me = clergy.items.find((i) => i.text === 'Dr. Chris Corbin');
  store.deleteItem(me.id);
  const { SEEDS } = await import(pathToFileURL(join(built, 'eastern-ridges', 'js/seeds.js')).href);
  for (const seed of SEEDS) store.seed(seed);
  assert.equal(store.list('clergy').items.length, 20);
  assert.ok(!store.list('clergy').items.some((i) => i.text === 'Dr. Chris Corbin'));
});

test('each keeps its data, theme and offline copy apart from the others’', async () => {
  for (const ed of NAMES) {
    const { STORAGE_KEY } = await firstRun(ed);
    assert.equal(STORAGE_KEY, `${STORAGE[ed]}:data`);
    assert.match(await read(ed, 'index.html'), new RegExp(`localStorage\\.getItem\\('${STORAGE[ed]}:ui'\\)`));
    const sw = await read(ed, 'sw.js');
    assert.ok(sw.includes(`const CACHE = \`${STORAGE[ed]}-\${VERSION}\`;`), ed);
    assert.ok(sw.includes(`const OWN_CACHE = /^${STORAGE[ed]}-\\d/;`), ed);
    assert.doesNotMatch(sw, /ELSEWHERE/);
    // Its service worker caches every file it has, and only those.
    const assets = [...sw.matchAll(/^\s+'\.\/([^']*)',$/gm)].map((m) => m[1]).filter(Boolean);
    for (const a of assets) assert.ok(files[ed].includes(a), `${ed}: sw.js lists ${a}`);
    for (const f of files[ed].filter((x) => /^js\/.*\.js$/.test(x))) assert.ok(assets.includes(f), `${ed}: sw.js is missing ${f}`);
    const { LFF_KEY, LFF_AVAILABLE } = await import(pathToFileURL(join(built, ed, 'js/lff.js')).href);
    assert.equal(LFF_AVAILABLE, true);
    assert.equal(LFF_KEY, `${STORAGE[ed]}:lff`);
  }
  // The full edition leaves their caches and folders alone.
  const own = await readFile(join(ROOT, 'sw.js'), 'utf8');
  const ownPattern = new RegExp(own.match(/const OWN_CACHE = \/(.*)\/;/)[1]);
  assert.ok(ownPattern.test('prayer-tracker-2.11.0'));
  for (const ed of NAMES) assert.ok(!ownPattern.test(`${STORAGE[ed]}-2.11.0`), ed);
  assert.match(own, /\['everyone', 'wisconsin', 'eastern-ridges'\]/);
});

test('their manifests and instructions pages', async () => {
  for (const ed of NAMES) {
    const manifest = JSON.parse(await read(ed, 'manifest.webmanifest'));
    assert.equal(manifest.scope, './');
    assert.equal(manifest.start_url, './');
    const install = await read(ed, 'install.html');
    assert.match(install, /Add to Home Screen/);
    assert.match(install, /Install app/);
    assert.match(install, /stays on your phone/);
    assert.match(install, /Lesser Feasts and Fasts/);
    assert.match(install, new RegExp(`theodramatist\\.github\\.io/Prayer-Tracker/${ed}/`));
  }
  assert.match(await read('wisconsin', 'install.html'), /Diocesan Daily Cycle/);
  const er = await read('eastern-ridges', 'install.html');
  assert.match(er, /To take your own name off:/);
  assert.match(er, /Paste names/);
  assert.match(er, /Choose the PDF/);
});
