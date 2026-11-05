import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseLff, linesOf, plain, LffLibrary, keptFeasts, feastCollect, feastSource, LFF_KEY } from '../../js/lff.js';
import { Store } from '../../js/store.js';
import { SyncManager, mergeStates, fromBase64, LFF_FILE } from '../../js/sync.js';

// A small stand-in for Lesser Feasts and Fasts, laid out as the real book is
// (its text is under copyright, so it isn't in these tests): the title, the
// Calendar, then a Proper on each page with its date at the foot, the heading,
// the line beneath it, and the collect in traditional (I) and contemporary (II)
// language. The names and words are invented.
function book() {
  const lines = [];
  let page = 0;
  let y = 560;
  const newPage = (...head) => { page += 1; y = 560; for (const text of head) lines.push({ page, y: 68, size: 11, text }); };
  const line = (size, text) => { lines.push({ page, y, size, text }); y -= size + 2; };
  newPage();
  line(38, 'Lesser Feasts');
  line(38, 'and Fasts • 2024');
  newPage('3The Calendar of the Church Year');
  line(10, 'Subject to the rules of precedence governing Principal Feasts,');
  line(12, 'November');
  line(10, '1 All Saints');
  line(10, '2');
  line(10, '3 Ann Example, Teacher, 1900');
  line(10, '4 [Gil Trial] Hal Example, Priest, 1700');
  line(10, '5 Ivy Sample, Ida Sample, and Ike Sample,');
  line(10, 'Martyrs, 1850');
  line(10, '8 Bert Sample, Hermit, c. 400');
  line(10, '26 Cora Sample, Poet, 1999');
  line(10, '30 Saint Andrew the Apostle');
  line(12, 'December');
  line(10, '6 Dee Sample, Bishop, c. 342');
  newPage();
  line(38, 'The Proper for');
  line(38, 'the Lesser Feasts');
  newPage('21');
  line(18, 'Concerning the Proper for');
  line(18, 'the Lesser Feasts');
  line(10, 'Proper Collects, Lessons, and Psalms are provided for each of the');
  const proper = (head, headings, collects, extra = []) => {
    newPage(`${page + 20} ${head[1] || ''}`.trim()); // the biography, on the page before
    line(9, 'A life, told in small type.');
    newPage(...head);
    for (const [size, text] of headings) line(size, text);
    for (const l of collects) line(11, l);
    line(9, 'Lessons and Psalm');
    line(9, 'Psalm 1');
    line(11, 'Preface of a Saint (1)');
    for (const l of extra) line(11, l);
  };
  const two = (who) => [`I Almighty God, who didst give thy servant ${who}`, 'grace to serve thee: Grant us the same; through', 'Jesus Christ our Lord. Amen.',
    `II Almighty God, you gave your servant ${who}`, 'grace to serve you: Grant us the same; through', 'Jesus Christ our Lord.', 'Amen.'];
  proper(['25November 3'], [[17, 'Ann Example'], [9, 'Teacher, 1900']], two('Ann'));
  proper(['27November 4'], [[17, 'Hal Example'], [9, 'Priest, 1700']], two('Hal'));
  proper(['29', 'November 4'], [[17, '[Gil Trial]']], two('Gil')); // its date at the foot, on a line of its own
  proper(['31November 5'], [[17, 'Ivy Sample, Ida'], [9, 'Martyr, 1850'], [17, 'and Ike Sample'], [9, 'Martyr, 1851']], two('Ivy, Ida, and Ike'));
  proper(['33November 8'], [[17, 'Bert Sample'], [9, 'Hermit, c. 400']], two('Bert'));
  proper(['35November 26'], [[17, 'Cora Sample'], [9, 'Poet, 1999']], two('Cora'));
  proper(['37November'], [[17, 'Thanksgiving Day']], two('the farmers'));
  proper(['39November 30'], [[17, 'Saint Andrew the Apostle']], two('Andrew'));
  proper(['41December 6'], [[17, 'Dee Sample'], [9, 'Bishop, c. 342']], ['I Almighty God, whose servant Dee', 'is unfinished']);
  newPage();
  line(38, 'The Commons');
  newPage('594The Common of Saints');
  line(17, 'Common of a Martyr I');
  for (const l of two('N.')) line(11, l);
  return lines;
}

test('Lesser Feasts and Fasts is read page by page: dates, headings, and both collects', () => {
  const lff = parseLff(book());
  assert.equal(lff.edition, '2024');
  assert.equal(lff.title, 'Lesser Feasts and Fasts 2024');
  assert.deepEqual(lff.feasts.map((f) => [f.date, f.title]), [
    ['11-03', 'Ann Example'],
    ['11-04', 'Hal Example'],
    ['11-04', 'Gil Trial'],
    ['11-05', 'Ivy Sample, Ida and Ike Sample'],
    ['11-08', 'Bert Sample'],
    ['11-26', 'Cora Sample'],
  ]);
  const ann = lff.feasts[0];
  assert.equal(ann.traditional, 'Almighty God, who didst give thy servant Ann grace to serve thee: Grant us the same; through Jesus Christ our Lord. Amen.');
  assert.equal(ann.contemporary, 'Almighty God, you gave your servant Ann grace to serve you: Grant us the same; through Jesus Christ our Lord. Amen.');
  assert.equal(ann.sub, 'Teacher, 1900');
  assert.equal(ann.line, 'Ann Example, Teacher, 1900');
  assert.equal(ann.page, 25);
  // For trial use, in [brackets]; it shares its day, and its line on the Calendar, with another.
  const gil = lff.feasts[2];
  assert.equal(gil.trial, true);
  assert.equal(gil.line, 'Gil Trial');
  assert.equal(lff.feasts[1].line, 'Hal Example, Priest, 1700');
  // A heading naming several people, each described beneath their name.
  assert.equal(lff.feasts[3].sub, 'Martyr, 1850; Martyr, 1851');
  assert.equal(lff.feasts[3].line, 'Ivy Sample, Ida Sample, and Ike Sample, Martyrs, 1850');
  // The Holy Days come from the Prayer Book, Thanksgiving Day moves, and nothing from the Commons is taken.
  assert.ok(!lff.feasts.some((f) => /Andrew|Thanksgiving|Common/.test(f.title)));
  // A collect that doesn't come to its Amen is reported, not kept.
  assert.deepEqual(lff.problems, ['The collects for Dee Sample weren’t read whole']);
});

test('a PDF that isn’t Lesser Feasts and Fasts is turned away', () => {
  assert.throws(() => parseLff([{ page: 1, y: 500, size: 30, text: 'The Book of Common Prayer' }]), /doesn’t look like Lesser Feasts and Fasts/);
});

test('pdf.js text items become lines, top to bottom', () => {
  const it = (str, y, size = 11) => ({ str, transform: [size, 0, 0, size, 72, y] });
  assert.deepEqual(linesOf([it('I', 500), it(' Almighty God,', 500), it('who', 487), it('', 474), it('25', 68), it('November 3', 68)], 7), [
    { page: 7, y: 500, size: 11, text: 'I Almighty God,' },
    { page: 7, y: 487, size: 11, text: 'who' },
    { page: 7, y: 68, size: 11, text: '25November 3' },
  ]);
  assert.equal(plain('Lili‘uokalani of Hawai‘i'), 'liliuokalani of hawaii');
  assert.equal(plain('Élie Naud'), 'elie naud');
});

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}

function loaded() {
  const lib = new LffLibrary(memoryStorage());
  const { feasts } = parseLff(book());
  // A few more, on days the Prayer Book's rules decide.
  const extra = (date, title) => ({ ...feasts[0], date, title, line: title });
  lib.save({ edition: '2024', title: 'Lesser Feasts and Fasts 2024', updated: 5, feasts: [...feasts, extra('06-01', 'June One'), extra('02-10', 'Ash Day'), extra('02-11', 'Lent Day'), extra('03-23', 'Holy Week Day'), extra('03-30', 'Easter Week Day'), extra('12-29', 'Octave Day')] });
  return lib;
}

test('lesser feasts give way to Sundays, Holy Days, Ash Wednesday, Holy Week and Easter Week, and aren’t moved', () => {
  const lib = loaded();
  const on = (k) => keptFeasts(lib, {}, k).map((f) => f.title);
  assert.deepEqual(on('2026-11-03'), ['Ann Example']); // a Tuesday
  assert.deepEqual(on('2026-11-04'), ['Hal Example', 'Gil Trial']); // two on one day: the trial one second
  assert.deepEqual(on('2026-11-08'), []); // a Sunday: not kept, and not moved to Monday
  assert.deepEqual(on('2026-11-09'), []);
  assert.deepEqual(on('2026-11-26'), []); // Thanksgiving Day
  assert.deepEqual(on('2026-06-01'), []); // the Visitation, moved off Trinity Sunday
  assert.deepEqual(on('2027-06-01'), ['June One']);
  assert.deepEqual(on('2027-02-10'), []); // Ash Wednesday
  assert.deepEqual(on('2027-02-11'), ['Lent Day']); // a weekday in Lent
  assert.deepEqual(on('2027-03-23'), []); // Tuesday in Holy Week
  assert.deepEqual(on('2027-03-30'), []); // Tuesday in Easter Week
  assert.deepEqual(on('2026-12-29'), []); // the Holy Innocents, moved from the Sunday
  assert.deepEqual(on('2027-12-29'), []); // moved there in 2027 too
  assert.deepEqual(on('2028-12-29'), ['Octave Day']);
  // Turned off in Settings, or never loaded.
  assert.deepEqual(keptFeasts(lib, { lesserFeasts: false }, '2026-11-03'), []);
  assert.deepEqual(keptFeasts(new LffLibrary(memoryStorage()), {}, '2026-11-03'), []);
});

test('a lesser feast’s collect, in the language chosen, with where to find it', () => {
  const lib = loaded();
  const [ann] = keptFeasts(lib, {}, '2026-11-03');
  const one = feastCollect(ann, 'traditional', lib);
  assert.match(one.text, /^Almighty God, who didst give thy servant Ann/);
  assert.equal(feastSource(one), 'Ann Example, Teacher, 1900 · Lesser Feasts and Fasts 2024, page 25');
  const [, gil] = keptFeasts(lib, {}, '2026-11-04');
  assert.equal(feastSource(feastCollect(gil, 'contemporary', lib)), 'Gil Trial · for trial use · Lesser Feasts and Fasts 2024, page 29');
  // It is kept on the device, and read back.
  const again = new LffLibrary(lib.storage);
  assert.equal(again.data.feasts.length, lib.data.feasts.length);
  assert.ok(lib.storage.getItem(LFF_KEY));
});

/** A stand-in for GitHub holding any number of files. */
function fakeGitHub() {
  const gh = { files: {}, version: 0, reads: {}, writes: {} };
  gh.fetch = async (url, init = {}) => {
    const json = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (init.headers?.Authorization !== 'Bearer good') return json(401, { message: 'Bad credentials' });
    const u = new URL(url);
    if (u.pathname === '/repos/me/prayer-data') return json(200, { private: true, full_name: 'me/prayer-data' });
    const path = decodeURIComponent(u.pathname.replace('/repos/me/prayer-data/contents/', ''));
    const file = gh.files[path];
    if (!init.method || init.method === 'GET') {
      gh.reads[path] = (gh.reads[path] || 0) + 1;
      return file ? json(200, { sha: file.sha, encoding: 'base64', content: file.content }) : json(404, { message: 'Not Found' });
    }
    const body = JSON.parse(init.body);
    if (file && body.sha !== file.sha) return json(409, { message: 'does not match' });
    gh.version += 1;
    gh.writes[path] = (gh.writes[path] || 0) + 1;
    gh.files[path] = { sha: `sha${gh.version}`, content: body.content };
    return json(200, { content: { sha: `sha${gh.version}` } });
  };
  gh.data = (path) => JSON.parse(fromBase64(gh.files[path].content));
  return gh;
}

function device(gh) {
  const storage = memoryStorage();
  const store = new Store(storage);
  const lff = new LffLibrary(storage);
  const sync = new SyncManager(store, { fetchImpl: gh.fetch, storage, library: lff });
  // As the app does it (app.setLff).
  const setLff = (bk) => {
    const updated = store.stamp();
    if (!bk) { lff.clear(); store.setLibrary('lff', { removed: true, updated }); return; }
    lff.save({ edition: bk.edition, title: bk.title, feasts: bk.feasts, updated });
    store.setLibrary('lff', { edition: bk.edition, title: bk.title, count: bk.feasts.length, updated });
  };
  return { store, sync, lff, setLff };
}

test('with sync, the book goes to your other devices in a file of its own, once', async () => {
  const gh = fakeGitHub();
  const laptop = device(gh);
  const phone = device(gh);
  await laptop.sync.connect('me/prayer-data', 'good');
  await phone.sync.connect('me/prayer-data', 'good');
  assert.equal(gh.files[LFF_FILE], undefined);

  laptop.setLff(parseLff(book()));
  await laptop.sync.sync();
  assert.equal(gh.writes[LFF_FILE], 1);
  assert.equal(gh.data(LFF_FILE).feasts.length, 6);
  // The main file only says which copy is current.
  const main = gh.data('prayer-tracker.json');
  assert.equal(main.library.lff.count, 6);
  assert.equal(main.library.lff.feasts, undefined);

  await phone.sync.sync();
  assert.equal(phone.lff.data.feasts.length, 6);
  assert.deepEqual(keptFeasts(phone.lff, phone.store.state.settings, '2026-11-03').map((f) => f.title), ['Ann Example']);

  // After that it isn't sent or fetched again.
  const reads = gh.reads[LFF_FILE];
  phone.store.addItems('family', [{ text: 'Mom' }]);
  await phone.sync.sync();
  await laptop.sync.sync();
  assert.equal(gh.reads[LFF_FILE], reads);
  assert.equal(gh.writes[LFF_FILE], 1);

  // Removed on one device, it goes from the others.
  phone.setLff(null);
  await phone.sync.sync();
  await laptop.sync.sync();
  assert.equal(laptop.lff.data, null);
  assert.equal(laptop.store.state.library.lff.removed, true);
});

test('merge: the copy of a book loaded or removed last is the current one', () => {
  const doc = (library) => ({ schema: 2, lists: [], checks: {}, tombstones: {}, settings: { updated: 0 }, library, orderUpdated: 0 });
  const a = doc({ lff: { edition: '2024', count: 247, updated: 10 } });
  const b = doc({ lff: { removed: true, updated: 20 } });
  assert.deepEqual(mergeStates(a, b).library, { lff: { removed: true, updated: 20 } });
  assert.deepEqual(mergeStates(b, a).library, { lff: { removed: true, updated: 20 } });
  assert.deepEqual(mergeStates(a, doc(undefined)).library, { lff: { edition: '2024', count: 247, updated: 10 } });
});
