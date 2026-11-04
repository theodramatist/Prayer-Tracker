import { test } from 'node:test';
import assert from 'node:assert/strict';

import { COLLECTS, collectFor, collectSource } from '../../js/collects.js';
import { collectId, observance } from '../../js/calendar.js';
import { easter } from '../../js/liturgy.js';
import { addDays, keyFromParts } from '../../js/dates.js';

const id = (k) => collectId(k);
const nextDay = (k) => addDays(k, 1);

test('the book of Collects: every Sunday, season and Holy Day, in both languages', () => {
  const all = Object.values(COLLECTS);
  assert.equal(all.length, 107);
  for (const c of all) {
    assert.ok(c.traditional && c.contemporary, c.id);
    for (const text of [c.traditional, c.contemporary]) {
      for (const one of text.split(/\n\*[^*]+\*\n/)) assert.match(one, /Amen\.$/, c.id);
    }
    // As many alternatives in Rite One as in Rite Two.
    assert.equal(c.traditional.split('\n').length, c.contemporary.split('\n').length, c.id);
    assert.ok(c.pages.traditional >= 159 && c.pages.traditional <= 194, c.id);
    assert.ok(c.pages.contemporary >= 211 && c.pages.contemporary <= 246, c.id);
  }
  // Christmas Day has three collects, Easter Day three, Ascension Day and Pentecost two.
  const count = (x) => x.contemporary.split(/\n\*[^*]+\*\n/).length;
  assert.deepEqual(all.filter((c) => count(c) > 1).map((c) => [c.id, count(c)]),
    [['christmas-day', 3], ['easter-day', 3], ['ascension-day', 2], ['pentecost', 2]]);
  assert.ok(COLLECTS['christmas-day'].traditional.includes('\n*or the following*\n'));
});

test('the collect in the language chosen, with where to find it', () => {
  const two = collectFor('2026-11-04', 'contemporary');
  assert.equal(two.id, 'proper-26');
  assert.match(two.text, /^Almighty and merciful God, it is only by your gift that your faithful people offer you true and laudable service/);
  assert.equal(two.page, 235);
  assert.equal(collectSource(two), 'Proper 26 · The Sunday closest to November 2 · page 235');
  const one = collectFor('2026-11-04', 'traditional');
  assert.match(one.text, /^Almighty and merciful God, of whose only gift it cometh that thy faithful people do unto thee true and laudable service/);
  assert.equal(one.page, 184);
  assert.match(collectFor('2026-11-30', 'traditional').text, /^Almighty God, who didst give such grace to thine apostle Andrew/);
  assert.equal(collectSource(collectFor('2026-11-30')), 'Saint Andrew · November 30 · page 237');
  // "only-begotten" is one word broken over a line in the Prayer Book.
  assert.match(COLLECTS.epiphany.traditional, /thy only-begotten Son to the peoples of the earth/);
});

test('Sundays and Holy Days have their own', () => {
  assert.equal(id('2026-11-01'), 'all-saints-day');
  assert.equal(id('2026-11-08'), 'proper-27');
  assert.equal(id('2026-11-22'), 'proper-29'); // the Last Sunday after Pentecost
  assert.equal(id('2026-11-26'), 'thanksgiving-day');
  assert.equal(id('2026-11-29'), 'advent-1');
  assert.equal(id('2026-11-30'), '11-30');
  assert.equal(id('2027-01-10'), 'epiphany-1');
  assert.equal(id('2027-03-21'), 'palm-sunday');
  assert.equal(id('2027-03-22'), 'monday-in-holy-week');
  assert.equal(id('2027-03-26'), 'good-friday');
  assert.equal(id('2027-03-28'), 'easter-day');
  assert.equal(id('2027-03-29'), 'monday-in-easter-week');
  assert.equal(id('2027-04-04'), 'easter-2');
  assert.equal(id('2027-05-09'), 'easter-7');
  assert.equal(id('2027-05-16'), 'pentecost');
  assert.equal(id('2027-05-23'), 'trinity-sunday');
  // A Holy Day keeps its own collect when it is moved: St John (Dec 27, a Sunday) on Monday,
  // the Annunciation (in Holy Week) after the Second Sunday of Easter, Independence Day off a Sunday.
  assert.equal(id('2026-12-27'), 'christmas-1');
  assert.equal(id('2026-12-28'), '12-27');
  assert.equal(id('2026-12-29'), '12-28');
  assert.equal(id('2027-04-05'), '03-25');
  assert.equal(id('2027-07-04'), 'proper-9');
  assert.equal(id('2027-07-05'), '07-04');
  // The Holy Name and the Transfiguration take the place of a Sunday.
  assert.equal(id('2023-01-01'), '01-01');
  assert.equal(observance('2023-01-01').detail, 'The First Sunday after Christmas Day');
  assert.equal(id('2028-08-06'), '08-06');
});

test('weekdays take the Sunday’s collect, or the one the Prayer Book appoints', () => {
  // "The Proper appointed for the Sunday is also used ... on the weekdays following."
  assert.equal(id('2026-11-04'), 'proper-26'); // All Saints' Day was the Sunday; its week is Proper 26's
  assert.equal(id('2026-11-27'), 'proper-29');
  assert.equal(id('2026-12-24'), 'advent-4');
  assert.equal(id('2027-02-09'), 'epiphany-last');
  assert.equal(id('2027-02-15'), 'lent-1');
  assert.equal(id('2028-08-07'), 'proper-13'); // after the Transfiguration on a Sunday
  assert.equal(id('2023-01-02'), 'christmas-1'); // after the Holy Name on a Sunday
  // Christmas Day's serves the weekdays between Holy Innocents' Day and the First Sunday after Christmas.
  assert.equal(id('2022-12-29'), 'christmas-day');
  assert.equal(id('2022-12-31'), 'christmas-day');
  assert.equal(id('2026-12-30'), 'christmas-1'); // the Sunday after Christmas came first
  assert.equal(id('2027-01-02'), 'christmas-1');
  assert.equal(id('2027-01-04'), 'christmas-2');
  // The Epiphany's, the weekdays before the following Sunday.
  assert.equal(id('2027-01-07'), 'epiphany');
  assert.equal(id('2027-01-09'), 'epiphany');
  assert.equal(id('2030-01-10'), 'epiphany'); // the Epiphany on a Sunday: the week after it
  // Ash Wednesday's and Ascension Day's, the days after them.
  for (const k of ['2027-02-11', '2027-02-12', '2027-02-13']) assert.equal(id(k), 'ash-wednesday');
  for (const k of ['2027-05-07', '2027-05-08']) assert.equal(id(k), 'ascension-day');
  assert.equal(id('2027-05-10'), 'easter-7');
});

test('Pentecost and Trinity weeks use the numbered Proper closest to their dates (page 158)', () => {
  // The first year each example comes true (Easter on March 24 is rare: 1940, then 2391).
  const findYear = (sundayAfterTrinity) => {
    for (let y = 1900; y < 2400; y++) if (addDays(easter(y), 63) === keyFromParts(y, ...sundayAfterTrinity)) return y;
    throw new Error(`no year with the Sunday after Trinity Sunday on ${sundayAfterTrinity}`);
  };
  // "If the Sunday after Trinity Sunday is May 26, the sequence begins with Proper 3
  // (Propers 1 and 2 being used on the weekdays of Pentecost and Trinity weeks)."
  let y = findYear([5, 26]);
  let pentecost = addDays(easter(y), 49);
  assert.equal(id(nextDay(pentecost)), 'proper-1');
  assert.equal(id(addDays(pentecost, 8)), 'proper-2');
  assert.equal(id(addDays(pentecost, 14)), 'proper-3');
  // "If the Sunday after Trinity Sunday is June 13, the sequence begins with Proper 6
  // (Propers 1 through 3 being omitted that year, and Propers 4 and 5 being used in Pentecost and Trinity weeks)."
  y = findYear([6, 13]);
  pentecost = addDays(easter(y), 49);
  assert.equal(id(nextDay(pentecost)), '05-31'); // except on the Visitation, May 31
  assert.equal(id(addDays(pentecost, 2)), 'proper-4');
  assert.equal(id(addDays(pentecost, 8)), 'proper-5');
  assert.equal(id(addDays(pentecost, 14)), 'proper-6');
  assert.equal(id(addDays(pentecost, 15)), 'proper-6');
  // This year's: Pentecost May 16, 2027, then Trinity Sunday May 23.
  assert.equal(id('2027-05-17'), 'proper-2');
  assert.equal(id('2027-05-24'), 'proper-3');
  assert.equal(id('2027-05-30'), 'proper-4');
});

test('every day has a collect, and every collect in the book comes up', () => {
  const used = new Set();
  for (let k = '2026-01-01'; k < '2101-01-01'; k = nextDay(k)) {
    const c = collectFor(k);
    assert.ok(c && c.text, k);
    used.add(c.id);
  }
  assert.deepEqual(Object.keys(COLLECTS).filter((x) => !used.has(x)), []);
});
