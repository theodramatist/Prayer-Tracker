// The day's observance from the calendar of the Episcopal Church (Book of
// Common Prayer 1979): Principal Feasts, named Sundays with their Propers,
// Holy Week, and the fixed Holy Days, moved by the Prayer Book's rules when
// they fall on a Sunday, on Ash Wednesday, or in Holy Week or Easter Week.

import { addDays, weekday, parseKey, keyFromParts, diffDays } from './dates.js';
import { easter, adventSunday, season } from './liturgy.js';

const ORDINALS = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth',
  'Tenth', 'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth', 'Sixteenth', 'Seventeenth',
  'Eighteenth', 'Nineteenth', 'Twentieth', 'Twenty-first', 'Twenty-second', 'Twenty-third', 'Twenty-fourth',
  'Twenty-fifth', 'Twenty-sixth', 'Twenty-seventh', 'Twenty-eighth', 'Twenty-ninth'];

// [month-day, title, liturgical colour, options]
const HOLY_DAYS = [
  ['01-01', 'The Holy Name of Our Lord Jesus Christ', 'white', { lord: true }],
  ['01-18', 'The Confession of Saint Peter the Apostle', 'white'],
  ['01-25', 'The Conversion of Saint Paul the Apostle', 'white'],
  ['02-02', 'The Presentation of Our Lord Jesus Christ in the Temple', 'white', { lord: true }],
  ['02-24', 'Saint Matthias the Apostle', 'red'],
  ['03-19', 'Saint Joseph', 'white'],
  ['03-25', 'The Annunciation of Our Lord Jesus Christ to the Blessed Virgin Mary', 'white'],
  ['04-25', 'Saint Mark the Evangelist', 'red'],
  ['05-01', 'Saint Philip and Saint James, Apostles', 'red'],
  ['05-31', 'The Visitation of the Blessed Virgin Mary', 'white'],
  ['06-11', 'Saint Barnabas the Apostle', 'red'],
  ['06-24', 'The Nativity of Saint John the Baptist', 'white'],
  ['06-29', 'Saint Peter and Saint Paul, Apostles', 'red'],
  ['07-04', 'Independence Day', null, { civil: true }],
  ['07-22', 'Saint Mary Magdalene', 'white'],
  ['07-25', 'Saint James the Apostle', 'red'],
  ['08-06', 'The Transfiguration of Our Lord Jesus Christ', 'white', { lord: true }],
  ['08-15', 'Saint Mary the Virgin, Mother of Our Lord Jesus Christ', 'white'],
  ['08-24', 'Saint Bartholomew the Apostle', 'red'],
  ['09-14', 'Holy Cross Day', 'red'],
  ['09-21', 'Saint Matthew, Apostle and Evangelist', 'red'],
  ['09-29', 'Saint Michael and All Angels', 'white'],
  ['10-18', 'Saint Luke the Evangelist', 'red'],
  ['10-23', 'Saint James of Jerusalem, Brother of Our Lord Jesus Christ, and Martyr', 'red'],
  ['10-28', 'Saint Simon and Saint Jude, Apostles', 'red'],
  ['11-30', 'Saint Andrew the Apostle', 'red'],
  ['12-21', 'Saint Thomas the Apostle', 'red'],
  ['12-26', 'Saint Stephen, Deacon and Martyr', 'red'],
  ['12-27', 'Saint John, Apostle and Evangelist', 'white'],
  ['12-28', 'The Holy Innocents', 'red'],
];

function fixed(year, md) {
  const [m, d] = md.split('-').map(Number);
  return keyFromParts(year, m, d);
}

/** Principal Feasts and the days of Holy Week and Easter Week (never displaced). */
function movable(year) {
  const ez = easter(year);
  const out = new Map();
  const set = (k, title, color, rank = 'principal') => out.set(k, { title, color, rank });
  set(addDays(ez, -46), 'Ash Wednesday', 'violet', 'fast');
  set(addDays(ez, -7), 'The Sunday of the Passion: Palm Sunday', 'red', 'sunday');
  set(addDays(ez, -6), 'Monday in Holy Week', 'red', 'holyweek');
  set(addDays(ez, -5), 'Tuesday in Holy Week', 'red', 'holyweek');
  set(addDays(ez, -4), 'Wednesday in Holy Week', 'red', 'holyweek');
  set(addDays(ez, -3), 'Maundy Thursday', 'white', 'holyweek');
  set(addDays(ez, -2), 'Good Friday', 'red', 'fast');
  set(addDays(ez, -1), 'Holy Saturday', 'violet', 'holyweek');
  set(ez, 'Easter Day', 'white');
  for (const [n, day] of [[1, 'Monday'], [2, 'Tuesday'], [3, 'Wednesday'], [4, 'Thursday'], [5, 'Friday'], [6, 'Saturday']]) {
    set(addDays(ez, n), `${day} in Easter Week`, 'white', 'easterweek');
  }
  set(addDays(ez, 39), 'Ascension Day', 'white');
  set(addDays(ez, 49), 'The Day of Pentecost: Whitsunday', 'red');
  set(addDays(ez, 56), 'Trinity Sunday', 'white');
  set(fixed(year, '01-06'), 'The Epiphany', 'white');
  set(fixed(year, '11-01'), 'All Saints’ Day', 'white');
  set(fixed(year, '12-25'), 'The Nativity of Our Lord Jesus Christ: Christmas Day', 'white');
  return out;
}

function thanksgiving(year) {
  const nov1 = keyFromParts(year, 11, 1);
  const firstThu = addDays(nov1, (4 - weekday(nov1) + 7) % 7);
  return addDays(firstThu, 21);
}

const yearCache = new Map();

/** Fixed Holy Days for a year, already moved to the day they are kept. */
function holyDays(year) {
  if (yearCache.has(year)) return yearCache.get(year);
  const ez = easter(year);
  const palm = addDays(ez, -7);
  const easterWeekEnd = addDays(ez, 6);
  const principal = movable(year);
  const kept = new Map();
  const open = (k) => weekday(k) !== 0 && !principal.has(k) && !kept.has(k);
  const nextOpen = (k) => { let x = k; while (!open(x)) x = addDays(x, 1); return x; };
  const afterEaster = [];

  for (const [md, title, color, opts = {}] of HOLY_DAYS) {
    const k = fixed(year, md);
    if (opts.civil) { kept.set(k, { title, color, rank: 'civil' }); continue; }
    if (k >= palm && k <= easterWeekEnd) { afterEaster.push({ title, color, from: k }); continue; }
    if (opts.lord && weekday(k) === 0 && !principal.has(k)) { kept.set(k, { title, color, rank: 'holyday' }); continue; }
    const day = open(k) ? k : nextOpen(addDays(k, 1));
    kept.set(day, { title, color, rank: 'holyday', transferred: day !== k ? k : null });
  }
  // Holy Days in Holy Week or Easter Week move to the week after the Second Sunday of Easter, in order.
  let k = addDays(ez, 8);
  for (const f of afterEaster) {
    k = nextOpen(k);
    kept.set(k, { title: f.title, color: f.color, rank: 'holyday', transferred: f.from });
    k = addDays(k, 1);
  }
  const tg = thanksgiving(year);
  if (!kept.has(tg)) kept.set(tg, { title: 'Thanksgiving Day', color: null, rank: 'civil' });

  const result = { principal, kept };
  yearCache.set(year, result);
  return result;
}

/** Name of a Sunday from its place in the church year, with its Proper after Pentecost. */
function sundayName(dateKey) {
  const { y, m, d } = parseKey(dateKey);
  const ez = easter(y);
  const ash = addDays(ez, -46);
  const pentecost = addDays(ez, 49);
  const advent = adventSunday(y);
  const md = m * 100 + d;

  if (dateKey >= advent) {
    if (md >= 1226) return { title: 'The First Sunday after Christmas Day', color: 'white' };
    const n = diffDays(advent, dateKey) / 7 + 1;
    return { title: `The ${ORDINALS[n]} Sunday of Advent`, color: n === 3 ? 'rose' : 'blue' };
  }
  if (md <= 105) return { title: 'The Second Sunday after Christmas Day', color: 'white' };
  if (dateKey < ash) {
    const epiphany = keyFromParts(y, 1, 6);
    if (dateKey === addDays(ash, -3)) return { title: 'The Last Sunday after the Epiphany', color: 'white' };
    const n = Math.ceil(diffDays(epiphany, dateKey) / 7);
    if (n === 1) return { title: 'The First Sunday after the Epiphany: The Baptism of Our Lord', color: 'white' };
    return { title: `The ${ORDINALS[n]} Sunday after the Epiphany`, color: 'green' };
  }
  if (dateKey < addDays(ez, -7)) {
    const n = diffDays(addDays(ash, 4), dateKey) / 7 + 1;
    return { title: `The ${ORDINALS[n]} Sunday in Lent`, color: n === 4 ? 'rose' : 'violet' };
  }
  if (dateKey < pentecost) {
    const n = diffDays(ez, dateKey) / 7 + 1;
    if (n === 7) return { title: 'The Seventh Sunday of Easter: The Sunday after Ascension Day', color: 'white' };
    return { title: `The ${ORDINALS[n]} Sunday of Easter`, color: 'white' };
  }
  const n = diffDays(pentecost, dateKey) / 7;
  const proper = Math.round(diffDays(keyFromParts(y, 5, 11), dateKey) / 7) + 1;
  if (dateKey === addDays(advent, -7)) {
    return { title: 'The Last Sunday after Pentecost', color: 'white', detail: 'Proper 29 · Christ the King' };
  }
  return { title: `The ${ORDINALS[n]} Sunday after Pentecost`, color: 'green', detail: `Proper ${proper}` };
}

/**
 * The observance for a date, or null on an ordinary weekday.
 * @returns {{ title: string, color: string|null, rank: string, detail?: string, transferred?: string|null } | null}
 */
export function observance(dateKey) {
  const { y } = parseKey(dateKey);
  const { principal, kept } = holyDays(y);
  if (principal.has(dateKey)) return { ...principal.get(dateKey) };
  if (kept.has(dateKey)) {
    const h = kept.get(dateKey);
    if (h.rank === 'civil' && weekday(dateKey) === 0) {
      // Independence Day on a Sunday: the Sunday comes first.
      const s = sundayName(dateKey);
      return { ...s, rank: 'sunday', detail: [s.detail, h.title].filter(Boolean).join(' · ') };
    }
    const out = { ...h };
    if (h.transferred) out.detail = 'Transferred';
    if (weekday(dateKey) === 0) out.detail = sundayName(dateKey).title;
    return out;
  }
  if (weekday(dateKey) === 0) {
    const s = sundayName(dateKey);
    const nov1 = keyFromParts(y, 11, 1);
    if (dateKey > nov1 && diffDays(nov1, dateKey) < 7) s.detail = `${s.detail} · All Saints’ Sunday`;
    return { ...s, rank: 'sunday' };
  }
  return null;
}

/** What to show under the date: the observance, or else the season. */
export function dayTitle(dateKey) {
  const o = observance(dateKey);
  const s = season(dateKey);
  if (!o) return { title: s.name, detail: null, color: s.color, feast: false };
  return { title: o.title, detail: o.detail || null, color: o.color || s.color, feast: true, rank: o.rank };
}
