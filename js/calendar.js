// The day's observance from the calendar of the Episcopal Church (Book of
// Common Prayer 1979): Principal Feasts, named Sundays with their Propers,
// Holy Week, and the fixed Holy Days, moved by the Prayer Book's rules when
// they fall on a Sunday, on Ash Wednesday, or in Holy Week or Easter Week.
// The titles are the Prayer Book's own ("The Titles of the Seasons, Sundays,
// and Major Holy Days observed in this Church throughout the Year", pages
// 31-33), and each Sunday after Pentecost takes the numbered Proper whose
// date is closest (pages 158 and 225-236).
//
// Each day also has an id for its Collect (see collects.js): the Sunday or
// feast's own, or on a weekday the one the Prayer Book appoints for it.

import { addDays, weekday, parseKey, keyFromParts, diffDays } from './dates.js';
import { easter, adventSunday, season } from './liturgy.js';

const ORDINALS = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth',
  'Tenth', 'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth', 'Sixteenth', 'Seventeenth',
  'Eighteenth', 'Nineteenth', 'Twentieth', 'Twenty-First', 'Twenty-Second', 'Twenty-Third', 'Twenty-Fourth',
  'Twenty-Fifth', 'Twenty-Sixth', 'Twenty-Seventh', 'Twenty-Eighth', 'Twenty-Ninth'];

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
  ['07-04', 'Independence Day', null, { national: true }],
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
  const set = (k, id, title, color, rank = 'principal') => out.set(k, { id, title, color, rank });
  set(addDays(ez, -46), 'ash-wednesday', 'The First Day of Lent, or Ash Wednesday', 'violet', 'fast');
  set(addDays(ez, -7), 'palm-sunday', 'The Sunday of the Passion: Palm Sunday', 'red', 'sunday');
  set(addDays(ez, -6), 'monday-in-holy-week', 'Monday in Holy Week', 'red', 'holyweek');
  set(addDays(ez, -5), 'tuesday-in-holy-week', 'Tuesday in Holy Week', 'red', 'holyweek');
  set(addDays(ez, -4), 'wednesday-in-holy-week', 'Wednesday in Holy Week', 'red', 'holyweek');
  set(addDays(ez, -3), 'maundy-thursday', 'Maundy Thursday', 'white', 'holyweek');
  set(addDays(ez, -2), 'good-friday', 'Good Friday', 'red', 'fast');
  set(addDays(ez, -1), 'holy-saturday', 'Holy Saturday', 'violet', 'holyweek');
  set(ez, 'easter-day', 'The Sunday of the Resurrection, or Easter Day', 'white');
  for (const [n, day] of [[1, 'Monday'], [2, 'Tuesday'], [3, 'Wednesday'], [4, 'Thursday'], [5, 'Friday'], [6, 'Saturday']]) {
    set(addDays(ez, n), `${day.toLowerCase()}-in-easter-week`, `${day} in Easter Week`, 'white', 'easterweek');
  }
  set(addDays(ez, 39), 'ascension-day', 'Ascension Day', 'white');
  set(addDays(ez, 49), 'pentecost', 'The Day of Pentecost: Whitsunday', 'red');
  set(addDays(ez, 56), 'trinity-sunday', 'The First Sunday after Pentecost: Trinity Sunday', 'white');
  set(fixed(year, '01-06'), 'epiphany', 'The Epiphany, or the Manifestation of Christ to the Gentiles', 'white');
  set(fixed(year, '11-01'), 'all-saints-day', 'All Saints’ Day', 'white');
  set(fixed(year, '12-25'), 'christmas-day', 'The Nativity of Our Lord Jesus Christ: Christmas Day', 'white');
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

  // A Holy Day's id is its date, wherever it is kept.
  for (const [md, title, color, opts = {}] of HOLY_DAYS) {
    const k = fixed(year, md);
    // Independence Day is a Major Feast too, so on a Sunday it moves like the others.
    if (k >= palm && k <= easterWeekEnd) { afterEaster.push({ id: md, title, color, from: k }); continue; }
    if (opts.lord && weekday(k) === 0 && !principal.has(k)) { kept.set(k, { id: md, title, color, rank: 'holyday' }); continue; }
    const day = open(k) ? k : nextOpen(addDays(k, 1));
    kept.set(day, { id: md, title, color, rank: opts.national ? 'national' : 'holyday', transferred: day !== k ? k : null });
  }
  // Holy Days in Holy Week or Easter Week move to the week after the Second Sunday of Easter, in order.
  let k = addDays(ez, 8);
  for (const f of afterEaster) {
    k = nextOpen(k);
    kept.set(k, { id: f.id, title: f.title, color: f.color, rank: 'holyday', transferred: f.from });
    k = addDays(k, 1);
  }
  const tg = thanksgiving(year);
  if (!kept.has(tg)) kept.set(tg, { id: 'thanksgiving-day', title: 'Thanksgiving Day', color: null, rank: 'national' });

  const result = { principal, kept };
  yearCache.set(year, result);
  return result;
}

/** The numbered Proper (1-29) whose date is closest to a Sunday's (page 158). */
function properNumber(dateKey) {
  return Math.round(diffDays(keyFromParts(parseKey(dateKey).y, 5, 11), dateKey) / 7) + 1;
}

/** Name of a Sunday from its place in the church year, with its Proper after Pentecost, and the id of its collect. */
function sundayName(dateKey) {
  const { y, m, d } = parseKey(dateKey);
  const ez = easter(y);
  const ash = addDays(ez, -46);
  const pentecost = addDays(ez, 49);
  const advent = adventSunday(y);
  const md = m * 100 + d;

  if (dateKey >= advent) {
    if (md >= 1226) return { id: 'christmas-1', title: 'The First Sunday after Christmas Day', color: 'white' };
    const n = diffDays(advent, dateKey) / 7 + 1;
    return { id: `advent-${n}`, title: `The ${ORDINALS[n]} Sunday of Advent`, color: n === 3 ? 'rose' : 'blue' };
  }
  // January 1 on a Sunday follows Christmas Day on a Sunday (and the Holy Name is kept on it).
  if (md === 101) return { id: 'christmas-1', title: 'The First Sunday after Christmas Day', color: 'white' };
  if (md <= 105) return { id: 'christmas-2', title: 'The Second Sunday after Christmas Day', color: 'white' };
  if (dateKey < ash) {
    const epiphany = keyFromParts(y, 1, 6);
    if (dateKey === addDays(ash, -3)) return { id: 'epiphany-last', title: 'The Last Sunday after the Epiphany', color: 'white' };
    const n = Math.ceil(diffDays(epiphany, dateKey) / 7);
    if (n === 1) return { id: 'epiphany-1', title: 'The First Sunday after the Epiphany: The Baptism of Our Lord Jesus Christ', color: 'white' };
    return { id: `epiphany-${n}`, title: `The ${ORDINALS[n]} Sunday after the Epiphany`, color: 'green' };
  }
  if (dateKey < addDays(ez, -7)) {
    const n = diffDays(addDays(ash, 4), dateKey) / 7 + 1;
    return { id: `lent-${n}`, title: `The ${ORDINALS[n]} Sunday in Lent`, color: n === 4 ? 'rose' : 'violet' };
  }
  if (dateKey < pentecost) {
    const n = diffDays(ez, dateKey) / 7 + 1;
    if (n === 7) return { id: 'easter-7', title: 'The Seventh Sunday of Easter: The Sunday after Ascension Day', color: 'white' };
    return { id: `easter-${n}`, title: `The ${ORDINALS[n]} Sunday of Easter`, color: 'white' };
  }
  const n = diffDays(pentecost, dateKey) / 7;
  const proper = properNumber(dateKey);
  if (dateKey === addDays(advent, -7)) {
    return { id: 'proper-29', title: 'The Last Sunday after Pentecost', color: 'white', detail: 'Proper 29' };
  }
  return { id: `proper-${proper}`, title: `The ${ORDINALS[n]} Sunday after Pentecost`, color: 'green', detail: `Proper ${proper}` };
}

/**
 * The observance for a date, or null on an ordinary weekday.
 * @returns {{ id: string, title: string, color: string|null, rank: string, detail?: string, transferred?: string|null } | null}
 */
export function observance(dateKey) {
  const { y } = parseKey(dateKey);
  const { principal, kept } = holyDays(y);
  if (principal.has(dateKey)) return { ...principal.get(dateKey) };
  if (kept.has(dateKey)) {
    const h = kept.get(dateKey);
    const out = { ...h };
    if (h.transferred) out.detail = 'Transferred';
    if (weekday(dateKey) === 0) out.detail = sundayName(dateKey).title;
    return out;
  }
  if (weekday(dateKey) === 0) {
    const s = sundayName(dateKey);
    const nov1 = keyFromParts(y, 11, 1);
    // "All Saints' Day may always be observed on the Sunday following November 1."
    if (dateKey > nov1 && diffDays(nov1, dateKey) < 7) s.detail = `${s.detail} · or All Saints’ Day`;
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

/**
 * Other collects the Calendar allows on a Sunday, in place of the Sunday's:
 * All Saints' Day's on the Sunday after November 1 ("All Saints' Day may
 * always be observed on the Sunday following November 1"), and that of a
 * Major Feast which falls on the Sunday and so is moved to the week ("When
 * desired, however, the Collect ... appointed for the Feast may be
 * substituted for those of the Sunday, but not from the Last Sunday after
 * Pentecost through the First Sunday after the Epiphany, or from the Last
 * Sunday after the Epiphany through Trinity Sunday", page 16).
 */
export function sundayAlternatives(dateKey) {
  if (weekday(dateKey) !== 0 || observance(dateKey)?.rank !== 'sunday') return [];
  const { y } = parseKey(dateKey);
  const out = [];
  const nov1 = keyFromParts(y, 11, 1);
  if (dateKey > nov1 && diffDays(nov1, dateKey) < 7) out.push('all-saints-day');
  const ez = easter(y);
  const jan6 = keyFromParts(y, 1, 6);
  const firstAfterEpiphany = addDays(jan6, 7 - weekday(jan6));
  const lastAfterEpiphany = addDays(ez, -49);
  const trinity = addDays(ez, 56);
  const lastAfterPentecost = addDays(adventSunday(y), -7);
  const allowed = (dateKey > firstAfterEpiphany && dateKey < lastAfterEpiphany) || (dateKey > trinity && dateKey < lastAfterPentecost);
  if (allowed) {
    const md = dateKey.slice(5);
    if (HOLY_DAYS.some(([d, , , opts = {}]) => d === md && !opts.lord)) out.push(md);
  }
  return out;
}

/**
 * The id of the Collect for a date: the day's own, if it has one; otherwise,
 * on a weekday, the one the Prayer Book appoints. That is the Sunday's (page
 * 158: "The Proper appointed for the Sunday is also used ... on the weekdays
 * following"), except that Christmas Day's serves the weekdays after Holy
 * Innocents' Day, the Epiphany's those before the next Sunday, Ash
 * Wednesday's and Ascension Day's the days after them, and in the weeks of
 * Pentecost and Trinity Sunday the numbered Proper closest to their date.
 * A Sunday given over to a feast still leads its week with its own Proper.
 */
export function collectId(dateKey) {
  const own = observance(dateKey);
  if (own) return own.id;
  const { y, m, d } = parseKey(dateKey);
  const sunday = addDays(dateKey, -weekday(dateKey));
  const ez = easter(y);
  const after = (k) => diffDays(k, dateKey);
  if (m === 12 && d >= 26 && sunday <= keyFromParts(y, 12, 25)) return 'christmas-day';
  if (m === 1 && d >= 7 && sunday <= keyFromParts(y, 1, 6)) return 'epiphany';
  const ash = addDays(ez, -46);
  if (after(ash) >= 1 && after(ash) <= 3) return 'ash-wednesday';
  const ascension = addDays(ez, 39);
  if (after(ascension) >= 1 && after(ascension) <= 2) return 'ascension-day';
  const pentecost = addDays(ez, 49);
  if (after(pentecost) >= 1 && after(pentecost) <= 6) return `proper-${properNumber(pentecost)}`;
  const trinity = addDays(ez, 56);
  if (after(trinity) >= 1 && after(trinity) <= 6) return `proper-${properNumber(trinity)}`;
  return sundayName(sunday).id;
}
