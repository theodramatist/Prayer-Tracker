import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Store, STORAGE_KEY, migrate, defaultState, stampAsNewest } from '../../js/store.js';
import { itemsDue, endDateFor, carriedOver, builtinEntries, cycleSource } from '../../js/schedule.js';
import { BUNDLES } from '../../js/bundles.js';
import { weekday } from '../../js/dates.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}

test('first run creates the four cycles and the daily lists', () => {
  const store = new Store(memoryStorage());
  const types = store.state.lists.map((l) => [l.id, l.type]);
  assert.deepEqual(types, [
    ['anglican', 'cycle'], ['diocese', 'monthly'], ['trinity', 'weekly'],
    ['requests', 'daily'], ['family', 'daily'], ['clergy', 'daily'],
  ]);
  assert.equal(store.list('trinity').sort, 'last');
});

test('items persist across reloads; corrupt data is kept aside, not lost', () => {
  const storage = memoryStorage();
  const a = new Store(storage);
  a.addItems('family', [{ text: 'Mom' }, { text: '  ' }, { text: 'Dad', note: 'knee' }]);
  const b = new Store(storage);
  assert.deepEqual(b.list('family').items.map((i) => [i.text, i.note]), [['Mom', undefined], ['Dad', 'knee']]);

  const bad = memoryStorage({ [STORAGE_KEY]: '{not json' });
  const c = new Store(bad);
  assert.equal(c.state.lists.length, 6);
  assert.ok(Object.keys(bad.data).some((k) => k.startsWith(`${STORAGE_KEY}:unreadable:`)));
});

test('works without storage (private mode) and reports it', () => {
  const store = new Store(null);
  assert.equal(store.persistent, false);
  store.addItems('family', [{ text: 'Mom' }]);
  assert.equal(store.list('family').items.length, 1);
});

test('people lists flip "Last, First" for display and keep the last name for sorting', () => {
  const store = new Store(memoryStorage());
  const [a, b, c] = store.addItems('trinity', [
    { text: 'de la Cruz, Maria', day: 1 },
    { text: 'Ann Zeller', day: 1 },
    { text: 'Last, First', first: 'Bo', last: 'Adams', day: 1 },
  ]);
  assert.equal(a.text, 'Maria de la Cruz');
  assert.equal(a.last, 'de la Cruz');
  assert.equal(b.last, undefined); // parsed on the fly
  assert.equal(c.last, 'Adams');
  const order = itemsDue(store.list('trinity'), '2026-11-02').map((i) => i.text);
  assert.deepEqual(order, ['Last, First', 'Maria de la Cruz', 'Ann Zeller']);
  // Non-people lists keep commas as typed.
  const [r] = store.addItems('requests', [{ text: 'Peace in Sudan, Gaza and Ukraine' }]);
  assert.equal(r.text, 'Peace in Sudan, Gaza and Ukraine');
});

test('day numbers are validated for the list type', () => {
  const store = new Store(memoryStorage());
  const [w] = store.addItems('trinity', [{ text: 'X Y', day: 15 }]);
  assert.equal(w.day, 0);
  const [m] = store.addItems('diocese', [{ text: 'St Paul', day: 31 }]);
  assert.equal(m.day, 31);
  const dated = store.addList({ name: 'Anniversaries', type: 'dated' });
  assert.deepEqual(store.addItems(dated.id, [{ text: 'no date' }]), []);
});

test('update, move, delete and undo', () => {
  const store = new Store(memoryStorage());
  const [item] = store.addItems('requests', [{ text: 'Jane', start: '2026-11-02', end: '2026-11-08' }]);
  store.updateItem(item.id, { text: 'Jane Doe', note: 'surgery', end: null });
  let found = store.findItem(item.id);
  assert.equal(found.item.text, 'Jane Doe');
  assert.equal(found.item.end, undefined);
  assert.equal(found.item.note, 'surgery');

  store.moveItem(item.id, 'trinity', { day: 3 });
  found = store.findItem(item.id);
  assert.equal(found.list.id, 'trinity');
  assert.equal(found.item.day, 3);
  assert.equal(store.list('requests').items.length, 0);

  // Renaming while moving into a people list re-reads the last name.
  const [tom] = store.addItems('trinity', [{ text: 'Smith, Tom', day: 1 }]);
  assert.equal(tom.last, 'Smith');
  store.moveItem(tom.id, 'clergy', { text: 'Tom Smyth' });
  assert.equal(store.findItem(tom.id).item.last, undefined);
  assert.equal(store.findItem(tom.id).item.text, 'Tom Smyth');

  const removed = store.deleteItem(item.id);
  assert.equal(store.findItem(item.id), null);
  store.restoreItem(removed);
  assert.equal(store.findItem(item.id).item.text, 'Jane Doe');
});

test('check-offs are per date and old ones are pruned', () => {
  const storage = memoryStorage();
  const store = new Store(storage);
  const [item] = store.addItems('family', [{ text: 'Mom' }]);
  store.setChecked('2026-11-02', item.id, true);
  assert.ok(store.isChecked('2026-11-02', item.id));
  assert.ok(!store.isChecked('2026-11-03', item.id));
  store.setChecked('2026-11-02', item.id, false);
  assert.ok(!store.isChecked('2026-11-02', item.id));
  assert.ok(store.state.checks['2026-11-02'][item.id] < 0); // un-checking is remembered, for sync
  store.setChecked('2020-01-01', item.id, true);
  store.pruneChecks('2026-11-02');
  assert.equal(store.state.checks['2020-01-01'], undefined);
  // Version 1 stored a check as 1; it still counts.
  store.state.checks['2026-11-03'] = { [item.id]: 1 };
  assert.ok(store.isChecked('2026-11-03', item.id));
});

test('distribute a weekly list alphabetically, keeping shared last names together', () => {
  const store = new Store(memoryStorage());
  const names = ['Ann Adams', 'Bob Baker', 'Cy Baker', 'Di Baker', 'Ed Clark', 'Flo Davis', 'Gus Evans',
    'Hal Fox', 'Ivy Green', 'Jo Hill', 'Kim Irwin', 'Lu Jones', 'Mo King', 'Ned Lee'];
  store.addItems('trinity', names.map((text) => ({ text })));
  store.distributeWeekly('trinity');
  const byDay = Array.from({ length: 7 }, (_, d) => itemsDue(store.list('trinity'), `2026-11-0${d + 1}`).map((i) => i.text));
  // 2026-11-01 is a Sunday, so index 0 = Sunday.
  assert.deepEqual(byDay[0], ['Ann Adams', 'Bob Baker', 'Cy Baker', 'Di Baker']);
  assert.equal(byDay.flat().length, names.length);
  for (const day of byDay.slice(1)) assert.ok(day.length >= 1 && day.length <= 2);

  store.distributeWeekly('trinity', [1, 2, 3, 4, 5, 6]);
  assert.equal(itemsDue(store.list('trinity'), '2026-11-01').length, 0);
});

test('lists: add, rename, hide, reorder, delete', () => {
  const store = new Store(memoryStorage());
  const list = store.addList({ name: 'Godchildren', type: 'daily' });
  store.updateList(list.id, { name: 'Godchildren & friends', hidden: true });
  assert.equal(store.list(list.id).hidden, true);
  store.updateList(list.id, { hidden: false });
  assert.equal('hidden' in store.list(list.id), false);
  store.moveList(list.id, -1);
  assert.equal(store.state.lists[5].id, list.id);
  store.setMeta('quickAddList', list.id);
  store.deleteList(list.id);
  assert.equal(store.list(list.id), null);
  assert.equal(store.state.meta.quickAddList, 'requests');
});

test('backup export/import round-trip and validation', () => {
  const a = new Store(memoryStorage());
  a.addItems('family', [{ text: 'Mom' }]);
  a.setSetting('seasonalColor', false);
  const file = JSON.parse(JSON.stringify(a.exportData()));
  const b = new Store(memoryStorage());
  b.importData(file);
  assert.equal(b.list('family').items[0].text, 'Mom');
  assert.equal(b.state.settings.seasonalColor, false);
  assert.throws(() => b.importData({ hello: 'world' }));
  assert.equal(b.list('family').items[0].text, 'Mom'); // unchanged after a bad import
  assert.throws(() => migrate(null));
  const m = migrate({ lists: [{ id: 'x', type: 'bogus', items: [] }, { id: 'y', type: 'daily', items: [{ text: 'ok' }, { nope: 1 }] }] });
  assert.equal(m.lists.length, 1);
  assert.equal(m.lists[0].items.length, 1);
  assert.equal(typeof m.lists[0].items[0].id, 'string');
  assert.deepEqual(Object.keys(m.settings), Object.keys(defaultState().settings));
});

test('snapshot/restore undoes bulk changes', () => {
  const store = new Store(memoryStorage());
  store.addItems('diocese', [{ text: 'A', day: 1 }]);
  const snap = store.snapshot();
  store.replaceItems('diocese', [{ text: 'B', day: 2 }, { text: 'C', day: 3 }]);
  assert.equal(store.list('diocese').items.length, 2);
  store.restore(snap);
  assert.deepEqual(store.list('diocese').items.map((i) => i.text), ['A']);
});

test('durations', () => {
  assert.equal(endDateFor('ongoing', '2026-11-02'), null);
  assert.equal(endDateFor('day', '2026-11-02'), '2026-11-02');
  assert.equal(endDateFor('3d', '2026-11-02'), '2026-11-04');
  assert.equal(endDateFor('1w', '2026-11-02'), '2026-11-08');
  assert.equal(endDateFor('2w', '2026-11-02'), '2026-11-15');
  assert.equal(endDateFor('1m', '2026-11-02'), '2026-12-01');
  assert.equal(endDateFor('1m', '2026-01-31'), '2026-02-27');
  assert.equal(endDateFor('3m', '2026-11-02'), '2027-02-01');
  assert.equal(endDateFor('until', '2026-11-02', '2026-12-25'), '2026-12-25');
  assert.equal(endDateFor('until', '2026-11-02', '2026-10-01'), null);
});

// ---------- schema 2: timestamps, tombstones, cycles, carry-forward ----------

function clockAt(iso) {
  let t = Date.parse(iso);
  return { now: () => t, advance: (ms) => { t += ms; } };
}

test('version 1 data is upgraded: the empty Anglican list becomes the built-in cycle', () => {
  const v1 = {
    lists: [
      { id: 'anglican', name: 'Anglican Cycle of Prayer', type: 'dated', sort: 'added', kind: 'acp', items: [] },
      { id: 'family', name: 'Family', type: 'daily', sort: 'added', items: [{ id: 'a', text: 'Mom', created: 5 }] },
    ],
    checks: { '2026-11-02': { a: 1 } },
    settings: { seasonalColor: false },
  };
  const m = migrate(v1, 1000, '2026-11-03');
  assert.equal(m.schema, 2);
  assert.equal(m.lists[0].type, 'cycle');
  assert.equal(m.lists[0].source, 'acp');
  assert.equal(m.lists[1].items[0].updated, 5);
  assert.equal(m.lists[1].since, '2026-11-03');
  assert.deepEqual(m.tombstones, {});
  assert.equal(m.settings.seasonalColor, false);
  assert.equal(m.settings.showPrayers, true);
});

test('changes are stamped and deletions leave tombstones', () => {
  const c = clockAt('2026-11-03T12:00:00Z');
  const store = new Store(memoryStorage(), { clock: c.now });
  const [mom] = store.addItems('family', [{ text: 'Mom' }]);
  assert.equal(mom.updated, c.now());
  assert.equal(mom.since, '2026-11-03');
  c.advance(1000);
  store.updateItem(mom.id, { note: 'knee' });
  assert.equal(store.findItem(mom.id).item.updated, c.now());
  c.advance(1000);
  const removed = store.deleteItem(mom.id);
  assert.equal(store.state.tombstones[mom.id], c.now());
  c.advance(1000);
  store.restoreItem(removed);
  assert.equal(store.state.tombstones[mom.id], undefined);
  assert.equal(store.findItem(mom.id).item.updated, c.now());
  c.advance(1000);
  store.updateList('family', { name: 'My family' });
  assert.equal(store.list('family').updated, c.now());
  c.advance(1000);
  store.moveList('family', -1);
  assert.equal(store.state.orderUpdated, c.now());
});

test('undo (restore) wins over the changes it undoes, even on other devices', () => {
  const c = clockAt('2026-11-03T12:00:00Z');
  const store = new Store(memoryStorage(), { clock: c.now });
  const [a] = store.addItems('diocese', [{ text: 'A', day: 1 }]);
  store.setChecked('2026-11-01', a.id, true);
  const snap = store.snapshot();
  c.advance(1000);
  const [b] = store.replaceItems('diocese', [{ text: 'B', day: 2 }]);
  store.setChecked('2026-11-02', b.id, true);
  store.setChecked('2026-11-01', a.id, false);
  c.advance(1000);
  store.restore(snap);
  const t = c.now();
  assert.deepEqual(store.list('diocese').items.map((i) => [i.text, i.updated]), [['A', t]]);
  assert.equal(store.state.tombstones[b.id], t);
  assert.equal(store.state.checks['2026-11-01'][a.id], t);
  assert.equal(store.state.checks['2026-11-02'][b.id], -t);
  assert.equal(store.state.tombstones[a.id], undefined);
});

test('stampAsNewest leaves untouched check state alone', () => {
  const target = { lists: [], checks: { d: { x: 5 } }, settings: {}, tombstones: {} };
  const current = { lists: [], checks: { d: { y: -3 } } };
  stampAsNewest(target, current, 9);
  assert.deepEqual(target.checks, { d: { x: 9 } });
});

test('a cycle of your own: one entry a day from its start, starting over at the end', () => {
  const store = new Store(memoryStorage());
  const list = store.addList({ name: 'Psalms', type: 'cycle' });
  store.replaceCycle(list.id, { start: '2026-11-01', entries: [{ text: 'Psalm 1', seq: 0 }, { text: 'Psalm 2', seq: 1 }, { text: 'Psalm 3', seq: 2 }] });
  const due = (k) => itemsDue(store.list(list.id), k).map((i) => i.text);
  assert.deepEqual(due('2026-11-01'), ['Psalm 1']);
  assert.deepEqual(due('2026-11-03'), ['Psalm 3']);
  assert.deepEqual(due('2026-11-04'), ['Psalm 1']); // starts over
  assert.deepEqual(due('2026-10-31'), ['Psalm 3']);
  assert.equal(cycleSource(store.list(list.id)).length, 3);
});

test('built-in cycle entries can be edited, hidden, and reset', () => {
  const bundle = { id: 'acp', start: '2023-09-01', entries: [{ text: 'Aba', note: 'Bishop A' }, [{ text: 'Abu' }, { text: 'Accra' }]] };
  const list = { id: 'anglican', type: 'cycle', source: 'acp', items: [], overrides: {} };
  assert.deepEqual(builtinEntries(list, bundle, 0), [{ id: 'acp:0', seq: 0, text: 'Aba', note: 'Bishop A', builtin: true, edited: false }]);
  assert.deepEqual(builtinEntries(list, bundle, 1).map((e) => e.id), ['acp:1.0', 'acp:1.1']);
  list.overrides['acp:0'] = { text: 'Aba and Ikwuano (merged)', note: null, updated: 1 };
  assert.deepEqual(builtinEntries(list, bundle, 0)[0], { id: 'acp:0', seq: 0, text: 'Aba and Ikwuano (merged)', note: null, builtin: true, edited: true });
  list.overrides['acp:1.1'] = { hidden: true, updated: 2 };
  assert.deepEqual(builtinEntries(list, bundle, 1).map((e) => e.text), ['Abu']);
  list.overrides['acp:0'] = { reset: true, updated: 3 };
  assert.equal(builtinEntries(list, bundle, 0)[0].text, 'Aba');
});

test('carry forward: unchecked weekly and monthly entries stay until checked or due again', () => {
  const c = clockAt('2026-11-01T12:00:00Z'); // Sunday
  const store = new Store(memoryStorage(), { clock: c.now });
  const [amy, bob, cy] = store.addItems('trinity', [{ text: 'Amy Adams', day: 1 }, { text: 'Bob Brown', day: 2 }, { text: 'Cy Cole', day: 3 }]);
  const [paul] = store.addItems('diocese', [{ text: 'St Paul', day: 2 }]);
  store.addItems('family', [{ text: 'Mom' }]);
  store.updateList('anglican', { hidden: true }); // keep the built-in cycle out of this test
  store.state.lists.find((l) => l.id === 'trinity').since = '2026-11-01';
  store.state.lists.find((l) => l.id === 'diocese').since = '2026-11-01';
  store.setChecked('2026-11-03', bob.id, true);
  const checked = (d, id) => store.isChecked(d, id);
  const carried = (today) => [...carriedOver(store.state, today, checked).entries()]
    .map(([list, rows]) => [list, rows.map((r) => `${r.item.text}@${r.date}`)]);

  assert.deepEqual(carried('2026-11-05'), [
    ['diocese', ['St Paul@2026-11-02']],
    ['trinity', ['Amy Adams@2026-11-02', 'Cy Cole@2026-11-04']],
  ]);
  // A week on, Amy is due again: last Monday's miss is superseded. Bob was prayed for. Cy is still owed.
  const later = carried('2026-11-09');
  assert.deepEqual(later.find(([l]) => l === 'trinity')[1], ['Cy Cole@2026-11-04']);
  // Checking a carried entry off marks its own day.
  store.setChecked('2026-11-04', cy.id, true);
  assert.equal(carried('2026-11-09').find(([l]) => l === 'trinity'), undefined);
  // Nothing from before an entry was on the list (Zed added Nov 5, his Monday was Nov 2).
  c.advance(4 * 864e5);
  const [zed] = store.addItems('trinity', [{ text: 'Zed Zane', day: 1 }]);
  assert.equal(zed.since, '2026-11-05');
  assert.ok(!carried('2026-11-06').flatMap(([, r]) => r).some((x) => x.startsWith('Zed')));
  assert.equal(paul.since, '2026-11-01');
});

test('carried entries: older days first, and each day keeps the list’s own order', () => {
  const state = {
    settings: {},
    lists: [{ id: 't', type: 'weekly', sort: 'last', since: '2026-11-01', items: [
      { id: 'b', text: 'Bob Baker', day: 1 }, { id: 'a', text: 'Amy Adams', day: 1 }, { id: 'c', text: 'Cy Cole', day: 2 },
    ] }],
  };
  const rows = carriedOver(state, '2026-11-04', () => false).get('t').map((r) => `${r.item.text}@${r.date}`);
  assert.deepEqual(rows, ['Amy Adams@2026-11-02', 'Bob Baker@2026-11-02', 'Cy Cole@2026-11-03']);
});

test('the built-in Anglican Cycle: today’s diocese, and a fresh start in 2027 on the same weekdays', () => {
  const list = defaultState().lists.find((l) => l.id === 'anglican');
  const on = (k) => itemsDue(list, k).map((e) => [e.text, e.note]);
  assert.deepEqual(on('2023-09-01'), [['The Diocese of Zaki-Biam', 'The Church of Nigeria (Anglican Communion)']]);
  assert.deepEqual(on('2026-11-02'), [['The Diocese of Carlisle', 'The Church of England']]);
  assert.deepEqual(on('2026-11-29'), [['Hong Kong Sheng Kung Hui', undefined]]);
  assert.deepEqual(on('2026-12-31'), [['The Diocese of Divine Hope', 'Igreja Anglicana de Mocambique e Angola']]);
  assert.deepEqual(on('2027-01-01'), on('2023-09-01'));
  assert.equal(weekday('2027-01-01'), weekday('2023-09-01'));
  assert.equal(cycleSource(list, '2026-11-02').length, 1218);
  // Sundays are for whole provinces.
  for (const k of ['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22']) assert.equal(itemsDue(list, k)[0].note, undefined);
});

test('a newer edition takes over from its first day; the newest starts over after its last', () => {
  const next = { id: 'acp2027', start: '2027-01-01', entries: [{ text: 'X' }, { text: 'Y' }] };
  BUNDLES.acp.push(next);
  try {
    const list = defaultState().lists.find((l) => l.id === 'anglican');
    assert.equal(itemsDue(list, '2026-12-31')[0].text, 'The Diocese of Divine Hope');
    assert.deepEqual(itemsDue(list, '2027-01-01').map((e) => [e.id, e.text]), [['acp2027:0', 'X']]);
    assert.equal(itemsDue(list, '2027-01-04')[0].text, 'Y');
    assert.equal(cycleSource(list, '2027-02-01').length, 2);
  } finally {
    BUNDLES.acp.pop();
  }
});
