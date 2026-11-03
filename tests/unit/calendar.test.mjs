import { test } from 'node:test';
import assert from 'node:assert/strict';

import { observance, dayTitle } from '../../js/calendar.js';

const title = (k) => observance(k)?.title ?? null;
const detail = (k) => observance(k)?.detail ?? null;

test('principal feasts', () => {
  assert.equal(title('2026-11-01'), 'All Saints’ Day');
  assert.equal(title('2026-12-25'), 'The Nativity of Our Lord Jesus Christ: Christmas Day');
  assert.equal(title('2027-01-06'), 'The Epiphany');
  assert.equal(title('2027-03-28'), 'Easter Day');
  assert.equal(title('2027-05-06'), 'Ascension Day');
  assert.equal(title('2027-05-16'), 'The Day of Pentecost: Whitsunday');
  assert.equal(title('2027-05-23'), 'Trinity Sunday');
});

test('Sundays are named through the year, with Propers after Pentecost', () => {
  assert.equal(title('2026-11-08'), 'The Twenty-fourth Sunday after Pentecost');
  assert.equal(detail('2026-11-08'), 'Proper 27');
  assert.equal(title('2026-11-22'), 'The Last Sunday after Pentecost');
  assert.equal(detail('2026-11-22'), 'Proper 29 · Christ the King');
  assert.equal(title('2026-11-29'), 'The First Sunday of Advent');
  assert.equal(observance('2026-12-13').color, 'rose');
  assert.equal(title('2026-12-27'), 'The First Sunday after Christmas Day');
  assert.equal(title('2027-01-03'), 'The Second Sunday after Christmas Day');
  assert.equal(title('2027-01-10'), 'The First Sunday after the Epiphany: The Baptism of Our Lord');
  assert.equal(title('2027-01-17'), 'The Second Sunday after the Epiphany');
  assert.equal(title('2027-02-07'), 'The Last Sunday after the Epiphany');
  assert.equal(title('2027-02-14'), 'The First Sunday in Lent');
  assert.equal(title('2027-03-07'), 'The Fourth Sunday in Lent');
  assert.equal(observance('2027-03-07').color, 'rose');
  assert.equal(title('2027-03-21'), 'The Sunday of the Passion: Palm Sunday');
  assert.equal(title('2027-04-04'), 'The Second Sunday of Easter');
  assert.equal(title('2027-05-09'), 'The Seventh Sunday of Easter: The Sunday after Ascension Day');
  assert.equal(title('2027-05-30'), 'The Second Sunday after Pentecost');
  assert.equal(detail('2027-05-30'), 'Proper 4');
});

test('Holy Week and Ash Wednesday', () => {
  assert.equal(title('2027-02-10'), 'Ash Wednesday');
  assert.equal(title('2027-03-25'), 'Maundy Thursday');
  assert.equal(title('2027-03-26'), 'Good Friday');
  assert.equal(title('2027-03-27'), 'Holy Saturday');
  assert.equal(title('2027-03-29'), 'Monday in Easter Week');
});

test('fixed Holy Days and civil days', () => {
  assert.equal(title('2026-11-30'), 'Saint Andrew the Apostle');
  assert.equal(title('2026-12-21'), 'Saint Thomas the Apostle');
  assert.equal(title('2026-11-26'), 'Thanksgiving Day');
  assert.equal(title('2027-11-25'), 'Thanksgiving Day');
  assert.equal(title('2027-01-01'), 'The Holy Name of Our Lord Jesus Christ');
  assert.equal(title('2027-03-19'), 'Saint Joseph');
  assert.equal(title('2026-07-22'), 'Saint Mary Magdalene');
  assert.equal(observance('2026-11-03'), null); // an ordinary weekday
});

test('transfers: Sundays, the Christmas octave, Holy and Easter Weeks', () => {
  // St John (Dec 27) is a Sunday in 2026 → Monday; Holy Innocents moves on a day.
  assert.equal(title('2026-12-28'), 'Saint John, Apostle and Evangelist');
  assert.equal(detail('2026-12-28'), 'Transferred');
  assert.equal(title('2026-12-29'), 'The Holy Innocents');
  // The Visitation falls on Trinity Sunday 2026 → Monday.
  assert.equal(title('2026-05-31'), 'Trinity Sunday');
  assert.equal(title('2026-06-01'), 'The Visitation of the Blessed Virgin Mary');
  // The Annunciation falls on Maundy Thursday 2027 → week after the Second Sunday of Easter.
  assert.equal(title('2027-04-05'), 'The Annunciation of Our Lord Jesus Christ to the Blessed Virgin Mary');
  // St Mark falls on a Sunday of Easter 2027 → Monday.
  assert.equal(title('2027-04-25'), 'The Fifth Sunday of Easter');
  assert.equal(title('2027-04-26'), 'Saint Mark the Evangelist');
  // Feasts of our Lord keep their Sunday: the Transfiguration on Sunday, Aug 6, 2028.
  assert.equal(title('2028-08-06'), 'The Transfiguration of Our Lord Jesus Christ');
  assert.match(detail('2028-08-06'), /Sunday after Pentecost/);
  // Independence Day on a Sunday (2027) stays a Sunday, noted alongside.
  assert.match(title('2027-07-04'), /Sunday after Pentecost/);
  assert.match(detail('2027-07-04'), /Independence Day/);
});

test('dayTitle falls back to the season on ordinary weekdays', () => {
  assert.deepEqual(dayTitle('2026-11-03'), { title: 'Season after Pentecost', detail: null, color: 'green', feast: false });
  assert.equal(dayTitle('2026-12-02').title, 'Advent');
  assert.equal(dayTitle('2026-11-30').color, 'red');
  assert.equal(dayTitle('2026-11-26').color, 'green'); // Thanksgiving keeps the season's colour
});
