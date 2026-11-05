// The Calendar of the Church Year's rules of precedence and transfer (Book of
// Common Prayer pages 15-18), checked rule by rule over a full 400-year cycle
// of the Gregorian calendar, 1900-2299.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { observance, collectId } from '../../js/calendar.js';
import { easter, adventSunday } from '../../js/liturgy.js';
import { addDays, weekday, keyFromParts, diffDays } from '../../js/dates.js';

const FIRST = 1900;
const LAST = 2299;
const years = Array.from({ length: LAST - FIRST + 1 }, (_, i) => FIRST + i);

// The Holy Days on fixed dates (page 16-17), by their date.
const HOLY_DAYS = ['01-01', '01-18', '01-25', '02-02', '02-24', '03-19', '03-25', '04-25', '05-01', '05-31', '06-11', '06-24',
  '06-29', '07-04', '07-22', '07-25', '08-06', '08-15', '08-24', '09-14', '09-21', '09-29', '10-18', '10-23', '10-28',
  '11-30', '12-21', '12-26', '12-27', '12-28'];
// "Only the following feasts, appointed on fixed days, take precedence of a Sunday."
const OVER_SUNDAY = new Set(['01-01', '02-02', '08-06']);
const PRINCIPAL = ['easter-day', 'ascension-day', 'pentecost', 'trinity-sunday', 'all-saints-day', 'christmas-day', 'epiphany'];
const fixed = (y, md) => keyFromParts(y, Number(md.slice(0, 2)), Number(md.slice(3)));

function yearDays(y) {
  const days = [];
  for (let k = keyFromParts(y, 1, 1); k <= keyFromParts(y, 12, 31); k = addDays(k, 1)) days.push(k);
  return days;
}

test('1. Principal Feasts are kept on their days, and take precedence of any other day', () => {
  for (const y of years) {
    const ez = easter(y);
    const due = {
      'easter-day': ez, 'ascension-day': addDays(ez, 39), pentecost: addDays(ez, 49), 'trinity-sunday': addDays(ez, 56),
      'all-saints-day': keyFromParts(y, 11, 1), 'christmas-day': keyFromParts(y, 12, 25), epiphany: keyFromParts(y, 1, 6),
    };
    for (const id of PRINCIPAL) assert.equal(observance(due[id])?.id, id, `${y} ${id}`);
    assert.ok(ez >= keyFromParts(y, 3, 22) && ez <= keyFromParts(y, 4, 25) && weekday(ez) === 0, `${y} Easter ${ez}`);
    assert.equal(weekday(due['ascension-day']), 4);
  }
});

test('2. Sundays: only the Holy Name, the Presentation and the Transfiguration take a Sunday’s place', () => {
  for (const y of years) {
    for (const k of yearDays(y)) {
      if (weekday(k) !== 0) continue;
      const o = observance(k);
      assert.ok(o, k);
      const allowed = o.rank === 'sunday' || PRINCIPAL.includes(o.id) || o.id === 'palm-sunday' || OVER_SUNDAY.has(o.id);
      assert.ok(allowed, `${k}: ${o.title}`);
    }
  }
});

test('3. Every Holy Day is kept once a year, on its date or moved as the rules say', () => {
  for (const y of years) {
    const ez = easter(y);
    const palm = addDays(ez, -7);
    const easterWeekEnd = addDays(ez, 6);
    const ash = addDays(ez, -46);
    const kept = new Map(); // holy day -> the day it's kept
    for (const k of yearDays(y)) {
      const o = observance(k);
      if (!o || !/^\d\d-\d\d$/.test(o.id)) continue;
      assert.ok(!kept.has(o.id), `${y}: ${o.id} kept twice`);
      kept.set(o.id, k);
    }
    for (const md of HOLY_DAYS) {
      const date = fixed(y, md);
      const at = kept.get(md);
      assert.ok(at, `${y}: ${md} never kept`);
      // Never in Holy Week or Easter Week, never on Ash Wednesday, never on a Principal Feast.
      assert.ok(at < palm || at > easterWeekEnd, `${y}: ${md} kept in Holy Week or Easter Week (${at})`);
      assert.notEqual(at, ash, `${y}: ${md} on Ash Wednesday`);
      if (weekday(at) === 0) assert.ok(OVER_SUNDAY.has(md) && at === date, `${y}: ${md} on Sunday ${at}`);
      if (date >= palm && date <= easterWeekEnd) {
        // "Major Feasts falling in these weeks are transferred to the week following the Second Sunday of Easter."
        assert.ok(at > addDays(ez, 7) && at <= addDays(ez, 13), `${y}: ${md} from ${date} kept ${at}`);
      } else if (at !== date) {
        // Displaced by a Sunday, Ash Wednesday, a Principal Feast, or another Holy Day moved first:
        // "transferred to the first convenient open day within the week".
        const why = weekday(date) === 0 || date === ash || PRINCIPAL.includes(observance(date)?.id) || /^\d\d-\d\d$/.test(observance(date)?.id || '');
        assert.ok(why, `${y}: ${md} moved from ${date} for no reason`);
        assert.ok(at > date && diffDays(date, at) <= 6, `${y}: ${md} moved from ${date} to ${at}`);
        for (let k = addDays(date, 1); k < at; k = addDays(k, 1)) assert.ok(observance(k), `${y}: ${md} passed over the open day ${k}`);
      }
    }
    // Those moved out of Holy Week and Easter Week keep their order.
    const moved = HOLY_DAYS.filter((md) => fixed(y, md) >= palm && fixed(y, md) <= easterWeekEnd);
    const order = moved.map((md) => kept.get(md));
    assert.deepEqual(order, [...order].sort(), `${y}: ${moved}`);
  }
});

test('3a. The First Sunday after Christmas Day comes before the three Holy Days after Christmas, which move on a day as needed', () => {
  for (const y of years) {
    const sunday = addDays(keyFromParts(y, 12, 25), 7 - weekday(keyFromParts(y, 12, 25)));
    if (sunday > keyFromParts(y, 12, 28)) continue;
    assert.equal(observance(sunday).title, 'The First Sunday after Christmas Day', `${y}`);
    const kept = ['12-26', '12-27', '12-28'].map((md) => yearDays(y).find((k) => observance(k)?.id === md));
    assert.deepEqual(kept, [...kept].sort(), `${y}`);
    for (const k of kept) assert.ok(k > keyFromParts(y, 12, 25) && k <= keyFromParts(y, 12, 31) && weekday(k) !== 0, `${y}: ${k}`);
  }
});

test('3b. Independence Day and Thanksgiving Day', () => {
  for (const y of years) {
    const july4 = keyFromParts(y, 7, 4);
    const at = weekday(july4) === 0 ? addDays(july4, 1) : july4;
    assert.equal(observance(at)?.id, '07-04', `${y}`);
    const nov1 = keyFromParts(y, 11, 1);
    const thanksgiving = addDays(nov1, ((4 - weekday(nov1) + 7) % 7) + 21);
    assert.equal(observance(thanksgiving)?.id, 'thanksgiving-day', `${y}`);
    assert.ok(thanksgiving >= keyFromParts(y, 11, 22) && thanksgiving <= keyFromParts(y, 11, 28));
  }
});

test('4. The Sundays and their Propers: Advent, Christmas, Epiphany, Lent, Easter, and after Pentecost by date (page 158)', () => {
  for (const y of years) {
    const advent = adventSunday(y);
    // "The Sundays of Advent are always the four Sundays before Christmas Day."
    assert.equal(diffDays(advent, keyFromParts(y, 12, 25)) > 21 && diffDays(advent, keyFromParts(y, 12, 25)) <= 28, true, `${y}`);
    const ez = easter(y);
    const pentecost = addDays(ez, 49);
    let last = null;
    for (let k = addDays(pentecost, 14); k < advent; k = addDays(k, 7)) {
      // The Sunday's own Proper, even where a feast takes the day: its weekdays say the Sunday's collect.
      let proper = observance(k).rank === 'sunday' ? collectId(k) : null;
      for (let d = 1; !proper && d < 7; d++) if (!observance(addDays(k, d))) proper = collectId(addDays(k, d));
      const n = Number(proper.split('-')[1]);
      // The numbered Proper whose date ("the Sunday closest to ...") is nearest, before or after.
      const anchor = addDays(keyFromParts(y, 5, 11), (n - 1) * 7);
      assert.ok(Math.abs(diffDays(anchor, k)) <= 3, `${k}: Proper ${n}`);
      if (last) assert.equal(n, last + 1, `${k}: the Propers are used consecutively`);
      last = n;
    }
    // The Sunday after Trinity Sunday takes Proper 3 to 8.
    const second = Number((observance(addDays(pentecost, 14)).detail || collectId(addDays(pentecost, 14))).match(/(\d+)$/)?.[1]);
    assert.ok(second >= 3 && second <= 8, `${y}: ${second}`);
    // The last Sunday after Pentecost is Proper 29, and never displaced.
    assert.equal(collectId(addDays(advent, -7)), 'proper-29');
  }
});

test('5. Lesser feasts are kept only on days with no observance (see lff.test.mjs); Ash Wednesday and Holy Week have their own', () => {
  for (const y of years) {
    const ez = easter(y);
    for (let k = addDays(ez, -7); k <= addDays(ez, 6); k = addDays(k, 1)) assert.ok(observance(k), `${k}`);
    assert.equal(observance(addDays(ez, -46)).id, 'ash-wednesday');
  }
});
