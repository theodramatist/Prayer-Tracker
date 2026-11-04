import { test } from 'node:test';
import assert from 'node:assert/strict';

import { observance, dayTitle } from '../../js/calendar.js';

const title = (k) => observance(k)?.title ?? null;
const detail = (k) => observance(k)?.detail ?? null;

test('principal feasts', () => {
  assert.equal(title('2026-11-01'), 'All Saints’ Day');
  assert.equal(title('2026-12-25'), 'The Nativity of Our Lord Jesus Christ: Christmas Day');
  assert.equal(title('2027-01-06'), 'The Epiphany, or the Manifestation of Christ to the Gentiles');
  assert.equal(title('2027-03-28'), 'The Sunday of the Resurrection, or Easter Day');
  assert.equal(title('2027-05-06'), 'Ascension Day');
  assert.equal(title('2027-05-16'), 'The Day of Pentecost: Whitsunday');
  assert.equal(title('2027-05-23'), 'The First Sunday after Pentecost: Trinity Sunday');
});

test('Sundays are named through the year, with Propers after Pentecost', () => {
  assert.equal(title('2026-11-08'), 'The Twenty-Fourth Sunday after Pentecost');
  assert.equal(detail('2026-11-08'), 'Proper 27');
  assert.equal(title('2026-11-22'), 'The Last Sunday after Pentecost');
  assert.equal(detail('2026-11-22'), 'Proper 29');
  assert.equal(title('2026-11-29'), 'The First Sunday of Advent');
  assert.equal(observance('2026-12-13').color, 'rose');
  assert.equal(title('2026-12-27'), 'The First Sunday after Christmas Day');
  assert.equal(title('2027-01-03'), 'The Second Sunday after Christmas Day');
  assert.equal(title('2027-01-10'), 'The First Sunday after the Epiphany: The Baptism of Our Lord Jesus Christ');
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
  assert.equal(title('2027-02-10'), 'The First Day of Lent, or Ash Wednesday');
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
  assert.equal(title('2026-05-31'), 'The First Sunday after Pentecost: Trinity Sunday');
  assert.equal(title('2026-06-01'), 'The Visitation of the Blessed Virgin Mary');
  // The Annunciation falls on Maundy Thursday 2027 → week after the Second Sunday of Easter.
  assert.equal(title('2027-04-05'), 'The Annunciation of Our Lord Jesus Christ to the Blessed Virgin Mary');
  // St Mark falls on a Sunday of Easter 2027 → Monday.
  assert.equal(title('2027-04-25'), 'The Fifth Sunday of Easter');
  assert.equal(title('2027-04-26'), 'Saint Mark the Evangelist');
  // Feasts of our Lord keep their Sunday: the Transfiguration on Sunday, Aug 6, 2028.
  assert.equal(title('2028-08-06'), 'The Transfiguration of Our Lord Jesus Christ');
  assert.match(detail('2028-08-06'), /Sunday after Pentecost/);
  // Independence Day is a Major Feast too: on a Sunday (2027) it moves to the Monday.
  assert.match(title('2027-07-04'), /Sunday after Pentecost/);
  assert.equal(title('2027-07-05'), 'Independence Day');
  assert.equal(detail('2027-07-05'), 'Transferred');
  // All Saints' Day may also be kept on the Sunday after November 1.
  assert.equal(detail('2027-11-07'), 'Proper 27 · or All Saints’ Day');
});

test('dayTitle falls back to the season on ordinary weekdays', () => {
  assert.deepEqual(dayTitle('2026-11-03'), { title: 'The Season after Pentecost', detail: null, color: 'green', feast: false });
  assert.equal(dayTitle('2026-12-02').title, 'Advent Season');
  assert.equal(dayTitle('2026-11-30').color, 'red');
  assert.equal(dayTitle('2026-11-26').color, 'green'); // Thanksgiving keeps the season's colour
});

// "The Titles of the Seasons, Sundays and Major Holy Days observed in this
// Church throughout the Year" (BCP pages 31-33), as printed, less dates.
const PRAYER_BOOK_TITLES = [
  'The First Sunday of Advent', 'The Second Sunday of Advent', 'The Third Sunday of Advent', 'The Fourth Sunday of Advent',
  'The Nativity of Our Lord Jesus Christ: Christmas Day', 'The First Sunday after Christmas Day',
  'The Holy Name of Our Lord Jesus Christ', 'The Second Sunday after Christmas Day',
  'The Epiphany, or the Manifestation of Christ to the Gentiles',
  'The First Sunday after the Epiphany: The Baptism of Our Lord Jesus Christ', 'The Last Sunday after the Epiphany',
  'The First Day of Lent, or Ash Wednesday', 'The First Sunday in Lent', 'The Sunday of the Passion: Palm Sunday',
  'Monday in Holy Week', 'Tuesday in Holy Week', 'Wednesday in Holy Week', 'Maundy Thursday', 'Good Friday', 'Holy Saturday',
  'The Sunday of the Resurrection, or Easter Day', 'Monday in Easter Week', 'Tuesday in Easter Week', 'Wednesday in Easter Week',
  'Thursday in Easter Week', 'Friday in Easter Week', 'Saturday in Easter Week', 'Ascension Day',
  'The Seventh Sunday of Easter: The Sunday after Ascension Day', 'The Day of Pentecost: Whitsunday',
  'The First Sunday after Pentecost: Trinity Sunday', 'The Last Sunday after Pentecost',
  'Saint Andrew the Apostle', 'Saint Thomas the Apostle', 'Saint Stephen, Deacon and Martyr', 'Saint John, Apostle and Evangelist',
  'The Holy Innocents', 'The Confession of Saint Peter the Apostle', 'The Conversion of Saint Paul the Apostle',
  'The Presentation of Our Lord Jesus Christ in the Temple', 'Saint Matthias the Apostle', 'Saint Joseph',
  'The Annunciation of Our Lord Jesus Christ to the Blessed Virgin Mary', 'Saint Mark the Evangelist',
  'Saint Philip and Saint James, Apostles', 'The Visitation of the Blessed Virgin Mary', 'Saint Barnabas the Apostle',
  'The Nativity of Saint John the Baptist', 'Saint Peter and Saint Paul, Apostles', 'Saint Mary Magdalene', 'Saint James the Apostle',
  'The Transfiguration of Our Lord Jesus Christ', 'Saint Mary the Virgin, Mother of Our Lord Jesus Christ', 'Saint Bartholomew the Apostle',
  'Holy Cross Day', 'Saint Matthew, Apostle and Evangelist', 'Saint Michael and All Angels', 'Saint Luke the Evangelist',
  'Saint James of Jerusalem, Brother of Our Lord Jesus Christ, and Martyr', 'Saint Simon and Saint Jude, Apostles', 'All Saints’ Day',
  'Independence Day', 'Thanksgiving Day',
];
const ORDINAL = /^The (Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth|Eleventh|Twelfth|Thirteenth|Fourteenth|Fifteenth|Sixteenth|Seventeenth|Eighteenth|Nineteenth|Twentieth|Twenty-(First|Second|Third|Fourth|Fifth|Sixth|Seventh)) Sunday (after the Epiphany|in Lent|of Easter|after Pentecost)$/;

test('every title the calendar gives over six years is one the Prayer Book gives', () => {
  const seen = new Set();
  let k = '2026-01-01';
  while (k < '2032-01-01') {
    const o = observance(k);
    if (o) {
      seen.add(o.title);
      assert.ok(PRAYER_BOOK_TITLES.includes(o.title) || ORDINAL.test(o.title), `${k}: ${o.title}`);
    }
    const d = new Date(`${k}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    k = d.toISOString().slice(0, 10);
  }
  // And every one of the Prayer Book's titles comes up.
  for (const t of PRAYER_BOOK_TITLES) assert.ok(seen.has(t), `never shown: ${t}`);
});
