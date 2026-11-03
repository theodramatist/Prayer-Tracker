import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as D from '../../js/dates.js';
import { parseName, compareNames } from '../../js/names.js';
import { itemsDue, agenda, cycleLabel, endLabel, partitionByStatus, monthDaysFor } from '../../js/schedule.js';
import { parseList, parseWeekly, parseMonthly, parseDated, matchDateLine, matchWeekdayHeader, splitClergy } from '../../js/importer.js';
import { easter, adventSunday, season } from '../../js/liturgy.js';

// ---------- dates ----------

test('date keys: arithmetic across months, years and DST', () => {
  assert.equal(D.addDays('2026-11-02', 1), '2026-11-03');
  assert.equal(D.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(D.addDays('2026-03-08', 1), '2026-03-09'); // US DST change
  assert.equal(D.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(D.addDays('2028-03-01', -1), '2028-02-29');
  assert.equal(D.diffDays('2026-11-02', '2026-11-09'), 7);
  assert.equal(D.diffDays('2026-11-09', '2026-11-02'), -7);
  assert.equal(D.weekday('2026-11-02'), 1); // Monday
  assert.equal(D.weekday('2026-11-29'), 0); // Sunday
  assert.equal(D.addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(D.addMonths('2026-11-02', 2), '2027-01-02');
  assert.equal(D.daysInMonth(2026, 2), 28);
  assert.equal(D.daysInMonth(2028, 2), 29);
  assert.ok(D.isValidKey('2026-02-28'));
  assert.ok(!D.isValidKey('2026-02-30'));
  assert.ok(!D.isValidKey('nope'));
  assert.equal(D.todayKey(new Date(2026, 10, 2, 23, 59)), '2026-11-02');
  assert.equal(D.ordinal(1), '1st');
  assert.equal(D.ordinal(22), '22nd');
  assert.equal(D.ordinal(13), '13th');
});

// ---------- names ----------

test('names: First Last and Last, First both sort by last name', () => {
  assert.deepEqual(parseName('John Smith'), { first: 'John', last: 'Smith', display: 'John Smith' });
  assert.deepEqual(parseName('Smith, John'), { first: 'John', last: 'Smith', display: 'John Smith' });
  assert.deepEqual(parseName('  mary   jones '), { first: 'mary', last: 'jones', display: 'mary jones' });
});

test('names: couples, families, titles, suffixes, particles, notes', () => {
  const cases = [
    ['John and Mary Smith', 'Smith', 'John and Mary'],
    ['John & Mary Smith', 'Smith', 'John & Mary'],
    ['The Smith Family', 'Smith', ''],
    ['The Rev. Jane Doe', 'Doe', 'Jane'],
    ['Rev. Canon John Smith', 'Smith', 'John'],
    ['John Smith Jr.', 'Smith', 'John'],
    ['Juan de la Cruz', 'de la Cruz', 'Juan'],
    ['Ludwig van Beethoven', 'van Beethoven', 'Ludwig'],
    ['Della Reese', 'Reese', 'Della'],
    ['Mary Smith-Jones', 'Smith-Jones', 'Mary'],
    ['John Smith (surgery Tuesday)', 'Smith', 'John'],
    ['John Smith – new job', 'Smith', 'John'],
    ['Grandma', 'Grandma', ''],
  ];
  for (const [input, last, first] of cases) {
    const p = parseName(input);
    assert.equal(p.last, last, `${input} → last`);
    assert.equal(p.first, first, `${input} → first`);
    assert.equal(p.display, input.replace(/\s+/g, ' '), `${input} → display kept`);
  }
});

test('names: Last, First input is flipped for display', () => {
  assert.equal(parseName('de la Cruz, Maria').display, 'Maria de la Cruz');
  assert.equal(parseName('de la Cruz, Maria').last, 'de la Cruz');
  assert.equal(parseName('Smith, John, Jr.').display, 'John Smith Jr.');
  assert.equal(parseName('Smith, John (hospital)').display, 'John Smith (hospital)');
  // A comma before a suffix is not "Last, First".
  const jr = parseName('John Smith, Jr.');
  assert.equal(jr.last, 'Smith');
  assert.equal(jr.display, 'John Smith, Jr.');
});

test('names: sorting by last name, then first, ignoring case and accents', () => {
  const names = ['Zoe Adams', 'adam Zeller', 'Émile Brown', 'Bob Brown', 'Ann Baker', 'Smith, Carl'];
  const sorted = names.map(parseName).sort(compareNames).map((n) => n.display);
  assert.deepEqual(sorted, ['Zoe Adams', 'Ann Baker', 'Bob Brown', 'Émile Brown', 'Carl Smith', 'adam Zeller']);
});

// ---------- schedule ----------

const daily = {
  id: 'r', type: 'daily', sort: 'added', items: [
    { id: 'a', text: 'Ongoing', start: '2026-11-01' },
    { id: 'b', text: 'One week', start: '2026-11-02', end: '2026-11-08' },
    { id: 'c', text: 'Future', start: '2026-11-10' },
  ],
};
const weekly = {
  id: 't', type: 'weekly', sort: 'last', items: [
    { id: 'w1', text: 'Zed Young', day: 1 },
    { id: 'w2', text: 'Amy Adams', day: 1 },
    { id: 'w3', text: 'Smith, Bob', day: 2, last: 'Smith', first: 'Bob' },
  ],
};
const monthly = {
  id: 'd', type: 'monthly', sort: 'added', items: [
    { id: 'm2', text: 'St Paul’s', day: 2 },
    { id: 'm28', text: 'Christ Church', day: 28 },
    { id: 'm29', text: 'Grace', day: 29 },
    { id: 'm31', text: 'St Mark’s', day: 31 },
  ],
};
const dated = {
  id: 'acp', type: 'dated', sort: 'added', items: [
    { id: 'x', date: '2026-11-02', text: 'The Diocese of Abu' },
    { id: 'y', date: '2026-11-03', text: 'The Diocese of Accra' },
  ],
};

test('daily: start and end dates are respected', () => {
  const ids = (k) => itemsDue(daily, k).map((i) => i.id);
  assert.deepEqual(ids('2026-10-31'), []);
  assert.deepEqual(ids('2026-11-02'), ['a', 'b']);
  assert.deepEqual(ids('2026-11-08'), ['a', 'b']);
  assert.deepEqual(ids('2026-11-09'), ['a']);
  assert.deepEqual(ids('2026-11-10'), ['a', 'c']);
});

test('weekly: right weekday, sorted by last name', () => {
  assert.deepEqual(itemsDue(weekly, '2026-11-02').map((i) => i.text), ['Amy Adams', 'Zed Young']); // Monday
  assert.deepEqual(itemsDue(weekly, '2026-11-03').map((i) => i.id), ['w3']);
  assert.deepEqual(itemsDue(weekly, '2026-11-01'), []);
  assert.equal(cycleLabel(weekly, '2026-11-02'), 'Monday');
});

test('monthly: day of month, with short months folding the leftover days into the last day', () => {
  const ids = (k, fold = true) => itemsDue(monthly, k, { foldShortMonths: fold }).map((i) => i.id);
  assert.deepEqual(ids('2026-11-02'), ['m2']);
  assert.deepEqual(ids('2026-10-31'), ['m31']);
  assert.deepEqual(ids('2026-11-30'), ['m31']); // November has 30 days → day 31 folds into the 30th
  assert.deepEqual(ids('2026-02-28'), ['m28', 'm29', 'm31']);
  assert.deepEqual(ids('2026-02-28', false), ['m28']);
  assert.deepEqual(ids('2028-02-29'), ['m29', 'm31']);
  assert.deepEqual(monthDaysFor('2026-02-28'), [28, 29, 30, 31]);
  assert.equal(cycleLabel(monthly, '2026-02-28'), 'Days 28–31');
  assert.equal(cycleLabel(monthly, '2026-11-02'), 'Day 2');
});

test('dated: exact date only; agenda flags an ended cycle and lists that need setup', () => {
  assert.deepEqual(itemsDue(dated, '2026-11-02').map((i) => i.id), ['x']);
  const state = {
    settings: {},
    lists: [dated, { id: 'e', type: 'monthly', items: [] }, { id: 'h', type: 'daily', items: [], hidden: true }],
  };
  const groups = agenda(state, '2027-01-01');
  assert.equal(groups.length, 2);
  assert.equal(groups[0].cycleEnded, true);
  assert.equal(groups[1].needsSetup, true);
  assert.equal(agenda(state, '2026-11-02')[0].cycleEnded, false);
});

test('end labels and status partition', () => {
  assert.equal(endLabel({ end: '2026-11-08' }, '2026-11-02'), 'Until Nov 8');
  assert.equal(endLabel({ end: '2026-11-03' }, '2026-11-02'), 'Until tomorrow');
  assert.equal(endLabel({ end: '2026-11-02' }, '2026-11-02'), 'Last day');
  assert.equal(endLabel({}, '2026-11-02'), '');
  const p = partitionByStatus(daily.items, '2026-11-09');
  assert.deepEqual(p.active.map((i) => i.id), ['a']);
  assert.deepEqual(p.ended.map((i) => i.id), ['b']);
  assert.deepEqual(p.upcoming.map((i) => i.id), ['c']);
});

// ---------- importers ----------

test('parseList: bullets and numbering removed; spreadsheet header columns used', () => {
  assert.deepEqual(parseList('• Mom\n- Dad\n\n1. Aunt Sue\n2) Uncle Bob\n3 kids at camp').map((e) => e.text),
    ['Mom', 'Dad', 'Aunt Sue', 'Uncle Bob', '3 kids at camp']);
  const rows = parseList('Last Name\tFirst Name\nSmith\tJohn\nde la Cruz\tMaria\n');
  assert.deepEqual(rows, [
    { text: 'John Smith', first: 'John', last: 'Smith' },
    { text: 'Maria de la Cruz', first: 'Maria', last: 'de la Cruz' },
  ]);
  assert.deepEqual(parseList('first,last\nAnn,Lee').map((e) => e.text), ['Ann Lee']);
});

test('parseWeekly: weekday headers assign days; plain names get null', () => {
  assert.deepEqual(matchWeekdayHeader('Monday'), { day: 1, rest: '' });
  assert.deepEqual(matchWeekdayHeader('TUESDAYS (D–G)'), { day: 2, rest: '' });
  assert.deepEqual(matchWeekdayHeader('Wed: Ann Lee'), { day: 3, rest: 'Ann Lee' });
  assert.equal(matchWeekdayHeader('Sun Li'), null);
  assert.equal(matchWeekdayHeader('Sunday School teachers'), null);
  const { entries, sawHeader } = parseWeekly('Ann Early\nSunday\nJohn Smith\nSmith, Jane\nMonday:\n• Bob Jones\nSun Li\nSaturday - Al Green; Ed Brown');
  assert.equal(sawHeader, true);
  assert.deepEqual(entries.map((e) => [e.day, e.text]), [
    [null, 'Ann Early'], [0, 'John Smith'], [0, 'Smith, Jane'], [1, 'Bob Jones'], [1, 'Sun Li'], [6, 'Al Green'], [6, 'Ed Brown'],
  ]);
});

test('parseMonthly: numbered days, extra lines for the same day, and plain sequential lists', () => {
  const numbered = parseMonthly('Diocesan Cycle of Prayer 2026\n1 The Bishop and staff\n2. St Paul’s, Anytown\nGrace Church, Elsewhere\nDay 3: Christ Church\n31) St Mark’s\n4\tTrinity\tThe Rev. Ann Lee');
  assert.equal(numbered.numbered, true);
  assert.equal(numbered.overflow, 1);
  assert.deepEqual(numbered.entries.map((e) => [e.day, e.text, e.note]), [
    [1, 'The Bishop and staff', undefined], [2, 'St Paul’s, Anytown', undefined], [2, 'Grace Church, Elsewhere', undefined],
    [3, 'Christ Church', undefined], [31, 'St Mark’s', undefined], [4, 'Trinity', 'The Rev. Ann Lee'],
  ]);
  const seq = parseMonthly('A\nB\nC');
  assert.equal(seq.numbered, false);
  assert.deepEqual(seq.entries.map((e) => [e.day, e.text]), [[1, 'A'], [2, 'B'], [3, 'C']]);
  const long = parseMonthly(Array.from({ length: 33 }, (_, i) => `Church ${String.fromCharCode(65 + (i % 26))}`).join('\n'));
  assert.equal(long.entries.length, 31);
  assert.equal(long.overflow, 2);
});

test('matchDateLine: the date formats people paste', () => {
  const dm = (s) => { const r = matchDateLine(s); return r && [r.y, r.m, r.d, r.rest]; };
  assert.deepEqual(dm('Monday 2 November 2026'), [2026, 11, 2, '']);
  assert.deepEqual(dm('Mon 02-Nov-2026: Diocese of Abu'), [2026, 11, 2, 'Diocese of Abu']);
  assert.deepEqual(dm('Monday, November 2, 2026 – The Diocese of Abu'), [2026, 11, 2, 'The Diocese of Abu']);
  assert.deepEqual(dm('2nd November 2026'), [2026, 11, 2, '']);
  assert.deepEqual(dm('Nov 2'), [null, 11, 2, '']);
  assert.deepEqual(dm('2026-11-02,The Diocese of Abu'), [2026, 11, 2, 'The Diocese of Abu']);
  assert.deepEqual(dm('11/2/26 Abu'), [2026, 11, 2, 'Abu']);
  assert.deepEqual(dm('02-Nov-26'), [2026, 11, 2, '']);
  assert.equal(matchDateLine('May the Lord bless you'), null);
  assert.equal(matchDateLine('3rd Sunday of Advent'), null);
  assert.equal(matchDateLine('2 Kings 5'), null);
  assert.equal(matchDateLine('100 Main Street'), null);
});

test('parseDated: entries with notes, noise removed, years inferred across New Year', () => {
  const pages = [];
  const days = [
    ['Sunday 27 December 2026', 'The Anglican Church of Kenya', 'The Most Revd Jackson Ole Sapit'],
    ['Monday 28 December 2026', 'The Diocese of Abu – (Nigeria)', 'The Rt Revd A. Bishop'],
    ['Tuesday 29 December 2026', 'The Diocese of Accra – (West Africa)'],
  ];
  for (const [d, ...rest] of days) pages.push(d, ...rest, 'Anglican Cycle of Prayer', '12');
  pages.push('Anglican Cycle of Prayer', 'Anglican Cycle of Prayer', 'Wed 30 Dec: The Diocese of Aba');
  const r = parseDated(['Introduction text that comes before any date', ...pages].join('\n'));
  assert.deepEqual(r.entries, [
    { date: '2026-12-27', text: 'The Anglican Church of Kenya', note: 'The Most Revd Jackson Ole Sapit' },
    { date: '2026-12-28', text: 'The Diocese of Abu – (Nigeria)', note: 'The Rt Revd A. Bishop' },
    { date: '2026-12-29', text: 'The Diocese of Accra – (West Africa)' },
    { date: '2026-12-30', text: 'The Diocese of Aba' },
  ]);
  assert.equal(r.first, '2026-12-27');
  assert.equal(r.last, '2026-12-30');

  const wrap = parseDated('Dec 31: A\nJan 1: B\nJan 2: C', { defaultYear: 2026 });
  assert.deepEqual(wrap.entries.map((e) => e.date), ['2026-12-31', '2027-01-01', '2027-01-02']);

  const json = parseDated('[{"date":"2027-01-01","text":"X","note":"Y"},{"date":"bad","text":"Z"}]');
  assert.deepEqual(json.entries, [{ date: '2027-01-01', text: 'X', note: 'Y' }]);

  assert.deepEqual(parseDated('Feb 30 2026: nope').entries, []);
});

test('parseDated: calendars laid out under month headings', () => {
  const text = `Cycle of Prayer
NOVEMBER 2026
1 Sunday
The Province of X
2 Monday The Diocese of Y
2 Kings 5 is read today
Tuesday 3
The Diocese of Z
December
1 Tue: The Diocese of W
January
Friday 1st – The Diocese of V`;
  const r = parseDated(text, { defaultYear: 2020 });
  assert.deepEqual(r.entries, [
    { date: '2026-11-01', text: 'The Province of X' },
    { date: '2026-11-02', text: 'The Diocese of Y', note: '2 Kings 5 is read today' },
    { date: '2026-11-03', text: 'The Diocese of Z' },
    { date: '2026-12-01', text: 'The Diocese of W' },
    { date: '2027-01-01', text: 'The Diocese of V' },
  ]);
  // Without a month heading, "2 Monday" is not taken as a date.
  assert.deepEqual(parseDated('2 Monday Something').entries, []);
});

// ---------- liturgy ----------

test('liturgical calendar', () => {
  assert.equal(easter(2026), '2026-04-05');
  assert.equal(easter(2027), '2027-03-28');
  assert.equal(easter(2025), '2025-04-20');
  assert.equal(adventSunday(2026), '2026-11-29');
  assert.equal(adventSunday(2027), '2027-11-28');
  assert.equal(adventSunday(2022), '2022-11-27');
  assert.equal(adventSunday(2023), '2023-12-03');
  const name = (k) => season(k).name;
  assert.equal(name('2026-11-02'), 'Season after Pentecost');
  assert.equal(name('2026-11-29'), 'Advent');
  assert.equal(name('2026-12-24'), 'Advent');
  assert.equal(name('2026-12-25'), 'Christmas');
  assert.equal(name('2027-01-05'), 'Christmas');
  assert.equal(name('2027-01-06'), 'The Epiphany');
  assert.equal(name('2027-02-09'), 'Season after the Epiphany');
  assert.equal(name('2027-02-10'), 'Ash Wednesday');
  assert.equal(name('2027-03-21'), 'Holy Week'); // Palm Sunday
  assert.equal(name('2027-03-28'), 'Easter Day');
  assert.equal(name('2027-05-15'), 'Easter Season');
  assert.equal(name('2027-05-16'), 'Day of Pentecost');
  assert.equal(name('2027-05-17'), 'Season after Pentecost');
  assert.equal(season('2026-11-29').color, 'blue');
  assert.equal(season('2027-03-01').color, 'violet');
});

test('clergy go in the details, so they can be changed', () => {
  assert.deepEqual(splitClergy('St Paul’s, Anytown — The Rev. Jane Doe'), { text: 'St Paul’s, Anytown', note: 'The Rev. Jane Doe' });
  assert.deepEqual(splitClergy('Christ Church, Riverside: The Very Rev. Canon John Smith'), { text: 'Christ Church, Riverside', note: 'The Very Rev. Canon John Smith' });
  assert.deepEqual(splitClergy('Grace Church, Elsewhere, The Rev. Ann Lee and the Rev. Bo Chen'), { text: 'Grace Church, Elsewhere', note: 'The Rev. Ann Lee and the Rev. Bo Chen' });
  assert.deepEqual(splitClergy('St Mary’s - Downtown'), { text: 'St Mary’s - Downtown' });
  assert.deepEqual(splitClergy('The Bishop and diocesan staff'), { text: 'The Bishop and diocesan staff' });
  const m = parseMonthly('1 St Andrew’s, Alpha\nThe Rev. A. Priest\n2 St Barnabas, Beta — Mtr. B. Priest\nSt Clement’s, Gamma');
  assert.deepEqual(m.entries, [
    { day: 1, text: 'St Andrew’s, Alpha', note: 'The Rev. A. Priest' },
    { day: 2, text: 'St Barnabas, Beta', note: 'Mtr. B. Priest' },
    { day: 2, text: 'St Clement’s, Gamma' },
  ]);
});
