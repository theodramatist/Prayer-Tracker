import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Store } from '../../js/store.js';
import { mergeStates, canonical, SyncManager, toBase64, fromBase64 } from '../../js/sync.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}

const NOW = Date.parse('2026-11-03T12:00:00Z');
const list = (id, props = {}) => ({ id, name: id, type: 'daily', sort: 'added', updated: 1, since: '2026-11-01', items: [], ...props });
const item = (id, props = {}) => ({ id, text: id, created: 1, updated: 1, ...props });
const doc = (props = {}) => ({ schema: 2, lists: [], checks: {}, tombstones: {}, settings: { updated: 0 }, orderUpdated: 0, ...props });
const merge = (a, b) => mergeStates(a, b, { now: NOW });

test('merge: additions on both sides are kept; the newer edit of the same item wins', () => {
  const a = doc({ lists: [list('fam', { items: [item('mom', { updated: 5, text: 'Mom' }), item('dad')] })] });
  const b = doc({ lists: [list('fam', { items: [item('mom', { updated: 9, text: 'Mother' }), item('sue', { created: 3 })] })] });
  const m = merge(a, b);
  assert.deepEqual(m.lists[0].items.map((i) => i.text), ['dad', 'Mother', 'sue']); // by date added, then id
  assert.equal(m.lists[0].items.find((i) => i.id === 'mom').text, 'Mother');
});

test('merge: a deletion beats older edits, but not a later one', () => {
  const a = doc({ lists: [list('fam', { items: [item('dad', { updated: 4 })] })], tombstones: {} });
  const b = doc({ lists: [list('fam')], tombstones: { dad: 6 } });
  assert.deepEqual(merge(a, b).lists[0].items, []);
  const c = doc({ lists: [list('fam', { items: [item('dad', { updated: 8 })] })] });
  assert.equal(merge(c, b).lists[0].items.length, 1);
  // A deleted list goes, unless it was changed after.
  assert.deepEqual(merge(doc({ lists: [list('old', { updated: 2 })] }), doc({ tombstones: { old: 3 } })).lists, []);
  assert.equal(merge(doc({ lists: [list('old', { updated: 4 })] }), doc({ tombstones: { old: 3 } })).lists.length, 1);
});

test('merge: list settings, order, check-offs and app settings keep the latest', () => {
  const a = doc({
    lists: [list('x', { name: 'Old name', updated: 2 }), list('y')],
    checks: { '2026-11-02': { mom: 10, dad: 5 } },
    settings: { theme: 'dark', updated: 7 },
    orderUpdated: 1,
  });
  const b = doc({
    lists: [list('y'), list('x', { name: 'New name', updated: 3 }), list('z')],
    checks: { '2026-11-02': { mom: -20 }, '2026-11-01': { sue: 3 } },
    settings: { theme: 'light', updated: 4 },
    orderUpdated: 2,
  });
  const m = merge(a, b);
  assert.deepEqual(m.lists.map((l) => l.id), ['y', 'x', 'z']);
  assert.equal(m.lists[1].name, 'New name');
  assert.deepEqual(m.checks, { '2026-11-02': { mom: -20, dad: 5 }, '2026-11-01': { sue: 3 } });
  assert.equal(m.settings.theme, 'dark');
});

test('merge: edits to built-in cycle entries merge entry by entry', () => {
  const a = doc({ lists: [list('anglican', { type: 'cycle', overrides: { 'acp:1': { text: 'A', updated: 5 }, 'acp:2': { hidden: true, updated: 1 } } })] });
  const b = doc({ lists: [list('anglican', { type: 'cycle', overrides: { 'acp:1': { text: 'B', updated: 3 }, 'acp:2': { reset: true, updated: 2 } } })] });
  assert.deepEqual(merge(a, b).lists[0].overrides, { 'acp:1': { text: 'A', updated: 5 }, 'acp:2': { reset: true, updated: 2 } });
});

test('merge: old check-offs and tombstones are forgotten; merging is idempotent', () => {
  const a = doc({ checks: { '2026-01-01': { x: 1 }, '2026-11-01': { y: 2 } }, tombstones: { gone: NOW - 400 * 864e5, recent: NOW - 864e5 } });
  const m = merge(a, a);
  assert.deepEqual(Object.keys(m.checks), ['2026-11-01']);
  assert.deepEqual(Object.keys(m.tombstones), ['recent']);
  assert.equal(canonical(merge(m, m)), canonical(m));
});

test('base64 round-trips accented names and emoji', () => {
  const s = 'José Núñez — “prayers” 🙏';
  assert.equal(fromBase64(toBase64(s)), s);
});

// ---------- a fake GitHub contents API ----------

function fakeGitHub({ isPrivate = true, token = 'good' } = {}) {
  const gh = { file: null, version: 0, writes: 0, beforeWrite: null };
  gh.fetch = async (url, init = {}) => {
    const json = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (init.headers?.Authorization !== `Bearer ${token}`) return json(401, { message: 'Bad credentials' });
    const u = new URL(url);
    if (u.pathname === '/repos/me/prayer-data') return json(200, { private: isPrivate, full_name: 'me/prayer-data' });
    if (u.pathname !== '/repos/me/prayer-data/contents/prayer-tracker.json') return json(404, { message: 'Not Found' });
    if (!init.method || init.method === 'GET') {
      if (!gh.file) return json(404, { message: 'Not Found' });
      return json(200, { sha: gh.file.sha, encoding: 'base64', content: gh.file.content });
    }
    if (gh.beforeWrite) { const f = gh.beforeWrite; gh.beforeWrite = null; await f(); }
    const body = JSON.parse(init.body);
    if (gh.file && body.sha !== gh.file.sha) return json(409, { message: 'does not match' });
    if (!gh.file && body.sha) return json(409, { message: 'no file' });
    gh.version += 1;
    gh.writes += 1;
    gh.file = { sha: `sha${gh.version}`, content: body.content };
    return json(200, { content: { sha: gh.file.sha } });
  };
  gh.data = () => JSON.parse(fromBase64(gh.file.content));
  return gh;
}

function device(gh) {
  const storage = memoryStorage();
  const store = new Store(storage);
  const sync = new SyncManager(store, { fetchImpl: gh.fetch, storage });
  return { store, sync, storage };
}

test('two devices stay in step through the repository', async () => {
  const gh = fakeGitHub();
  const phone = device(gh);
  const ipad = device(gh);
  phone.store.addItems('family', [{ text: 'Mom' }]);
  phone.store.updateList('trinity', { name: 'Trinity Church' });
  await phone.sync.connect('me/prayer-data', 'good');
  assert.equal(gh.writes, 1);
  assert.equal(phone.sync.status.state, 'idle');

  // A new device joining doesn't overwrite the real lists with its defaults.
  await ipad.sync.connect('https://github.com/me/prayer-data', 'good');
  assert.equal(ipad.store.list('trinity').name, 'Trinity Church');
  assert.deepEqual(ipad.store.list('family').items.map((i) => i.text), ['Mom']);

  const mom = ipad.store.list('family').items[0];
  ipad.store.setChecked('2026-11-03', mom.id, true);
  ipad.store.addItems('requests', [{ text: 'Jane' }]);
  await ipad.sync.sync();
  await phone.sync.sync();
  assert.ok(phone.store.isChecked('2026-11-03', mom.id));
  assert.deepEqual(phone.store.list('requests').items.map((i) => i.text), ['Jane']);

  // Deleting on one device removes it on the other.
  phone.store.deleteItem(mom.id);
  await phone.sync.sync();
  await ipad.sync.sync();
  assert.equal(ipad.store.list('family').items.length, 0);

  // Nothing new: no extra write.
  const writes = gh.writes;
  await ipad.sync.sync();
  assert.equal(gh.writes, writes);
});

test('a write that collides with another device is merged and retried', async () => {
  const gh = fakeGitHub();
  const phone = device(gh);
  const ipad = device(gh);
  await phone.sync.connect('me/prayer-data', 'good');
  await ipad.sync.connect('me/prayer-data', 'good');
  phone.store.addItems('family', [{ text: 'From the phone' }]);
  ipad.store.addItems('family', [{ text: 'From the iPad' }]);
  gh.beforeWrite = () => phone.sync.sync(); // the phone saves while the iPad is mid-sync
  await ipad.sync.sync();
  assert.equal(ipad.sync.status.state, 'idle');
  const texts = gh.data().lists.find((l) => l.id === 'family').items.map((i) => i.text).sort();
  assert.deepEqual(texts, ['From the iPad', 'From the phone']);
});

test('connect refuses public repositories and bad tokens, and the token stays out of backups', async () => {
  const pub = device(fakeGitHub({ isPrivate: false }));
  await assert.rejects(pub.sync.connect('me/prayer-data', 'good'), /public/);
  assert.equal(pub.sync.enabled, false);

  const bad = device(fakeGitHub());
  await assert.rejects(bad.sync.connect('me/prayer-data', 'wrong'), /token/);
  await assert.rejects(bad.sync.connect('not a repo', 'good'), /owner\/name/);

  const ok = device(fakeGitHub());
  await ok.sync.connect('me/prayer-data', 'good');
  assert.ok(!JSON.stringify(ok.store.exportData()).includes('good'));
  ok.sync.disconnect();
  assert.equal(ok.sync.enabled, false);
});

test('changes on a device schedule a sync', async () => {
  const gh = fakeGitHub();
  const phone = device(gh);
  await phone.sync.connect('me/prayer-data', 'good');
  let scheduled = 0;
  phone.sync.schedule = () => { scheduled += 1; };
  phone.store.addItems('family', [{ text: 'Dad' }]);
  phone.store.setChecked('2026-11-03', 'x', true, { silent: true });
  assert.equal(scheduled, 2);
});

test('merge comes out the same whichever way round, even for copies saved at the same moment', () => {
  const a = doc({
    lists: [list('x', { since: '2026-11-01', updated: 0, items: [item('s1', { since: '2026-11-05', updated: 7 })] }), list('y', { updated: 0 })],
    checks: { '2026-11-02': { mom: 10 } },
    settings: { theme: 'dark', updated: 0 },
  });
  const b = doc({
    lists: [list('y', { updated: 0 }), list('x', { since: '2026-11-04', updated: 0, items: [item('s1', { since: '2026-11-02', updated: 7 })] })],
    checks: { '2026-11-02': { mom: -10 } },
    settings: { theme: 'light', updated: 0 },
  });
  const ab = merge(a, b);
  assert.equal(canonical(ab), canonical(merge(b, a)));
  // The earlier copy of a tie wins, and merging again changes nothing.
  assert.equal(ab.lists.find((l) => l.id === 'x').items[0].since, '2026-11-02');
  assert.equal(canonical(merge(ab, a)), canonical(ab));
  assert.equal(canonical(merge(b, ab)), canonical(ab));
  assert.equal(ab.checks['2026-11-02'].mom, 10);
});

test('merge: a list only one copy has goes after the list it follows there', () => {
  const a = doc({ lists: [list('anglican'), list('diocese'), list('trinity'), list('family')], orderUpdated: 9 });
  const b = doc({ lists: [list('anglican'), list('diocese'), list('diocese-daily'), list('trinity')], orderUpdated: 0 });
  assert.deepEqual(merge(a, b).lists.map((l) => l.id), ['anglican', 'diocese', 'diocese-daily', 'trinity', 'family']);
  assert.deepEqual(merge(b, a).lists.map((l) => l.id), ['anglican', 'diocese', 'diocese-daily', 'trinity', 'family']);
});

test('two devices that each copied in the diocese’s cycles agree, with no duplicates', async () => {
  const { SEEDS } = await import('../../js/seeds.js');
  const phone = new Store(memoryStorage(), { clock: () => Date.parse('2026-11-03T14:00:00Z') });
  phone.seed(SEEDS[0]);
  phone.updateItem(phone.list('diocese').items[0].id, { note: 'A new priest-in-charge' });
  phone.deleteItem(phone.list('diocese').items[1].id);
  const ipad = new Store(memoryStorage(), { clock: () => Date.parse('2027-07-01T14:00:00Z') });
  ipad.seed(SEEDS[0]);
  const m = mergeStates(phone.syncDocument(), ipad.syncDocument(), { now: Date.parse('2027-07-01T14:00:00Z') });
  assert.equal(canonical(m), canonical(mergeStates(ipad.syncDocument(), phone.syncDocument(), { now: Date.parse('2027-07-01T14:00:00Z') })));
  const monthly = m.lists.find((l) => l.id === 'diocese');
  assert.equal(monthly.items.length, 104);
  assert.equal(monthly.items[0].note, 'A new priest-in-charge');
  assert.equal(m.lists.find((l) => l.id === 'diocese-daily').items.length, 307);
  assert.ok(Object.keys(m.tombstones).some((id) => id.startsWith('seed-'))); // kept, though older than 180 days
});

test('someone marked to reach out to goes on the list on every device, and off it when done', async () => {
  const gh = fakeGitHub();
  const phone = device(gh);
  const laptop = device(gh);
  await phone.sync.connect('me/prayer-data', 'good');
  await laptop.sync.connect('me/prayer-data', 'good');
  const [ann, bob] = phone.store.addItems('clergy', [{ text: 'Fr. Ann Example' }, { text: 'Fr. Bob Example' }]);
  phone.store.setReach(bob.id, '2026-11-05');
  phone.store.setReach(ann.id, '2026-11-03');
  await phone.sync.sync();
  await laptop.sync.sync();
  // Longest waiting first.
  assert.deepEqual(laptop.store.reachOut().map(({ list, item }) => [list.id, item.text, item.reach]), [
    ['clergy', 'Fr. Ann Example', '2026-11-03'], ['clergy', 'Fr. Bob Example', '2026-11-05'],
  ]);
  laptop.store.setReach(ann.id, null);
  await laptop.sync.sync();
  await phone.sync.sync();
  assert.deepEqual(phone.store.reachOut().map(({ item }) => item.text), ['Fr. Bob Example']);
  // An edit that leaves it alone keeps it; moving the entry takes the mark with it.
  phone.store.updateItem(bob.id, { note: 'Rector, St. Example’s' });
  assert.equal(phone.store.findItem(bob.id).item.reach, '2026-11-05');
  phone.store.moveItem(bob.id, 'family');
  assert.deepEqual(phone.store.reachOut().map(({ list, item }) => [list.id, item.reach]), [['family', '2026-11-05']]);
});

test('a change made just after syncing wins, even when another device’s clock runs fast', async () => {
  const gh = fakeGitHub();
  const make = (clock) => {
    const storage = memoryStorage();
    const store = new Store(storage, { clock });
    return { store, sync: new SyncManager(store, { fetchImpl: gh.fetch, storage }) };
  };
  const real = Date.parse('2026-11-05T15:00:00Z');
  const fast = make(() => real + 10 * 60 * 1000); // ten minutes ahead
  const slow = make(() => real);
  await fast.sync.connect('me/prayer-data', 'good');
  const [ann] = fast.store.addItems('clergy', [{ text: 'Fr. Ann Example' }]);
  fast.store.setReach(ann.id, '2026-11-05');
  await fast.sync.sync();
  await slow.sync.connect('me/prayer-data', 'good');
  // Marked done on the device whose clock is behind, a moment later.
  slow.store.setReach(ann.id, null);
  await slow.sync.sync();
  await fast.sync.sync();
  assert.deepEqual(fast.store.reachOut(), []);
  assert.deepEqual(slow.store.reachOut(), []);
});
