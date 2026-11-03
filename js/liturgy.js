// The church year, for the season name under the date and the app's accent
// colour. Follows the Episcopal Church's calendar (BCP 1979).

import { keyFromParts, addDays, weekday, parseKey } from './dates.js';

/** Easter Day (Gregorian), via the Meeus/Jones/Butcher algorithm. */
export function easter(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return keyFromParts(year, month, day);
}

/** The First Sunday of Advent: the Sunday from November 27 to December 3. */
export function adventSunday(year) {
  const nov27 = keyFromParts(year, 11, 27);
  return addDays(nov27, (7 - weekday(nov27)) % 7);
}

/**
 * @returns {{ name: string, color: 'blue'|'white'|'green'|'violet'|'red' }}
 */
export function season(dateKey) {
  const { y, m, d } = parseKey(dateKey);
  const md = m * 100 + d;
  const ez = easter(y);
  const ash = addDays(ez, -46);
  const palm = addDays(ez, -7);
  const pentecost = addDays(ez, 49);
  const advent = adventSunday(y);

  if (md >= 1225 || md <= 105) return { name: 'Christmas', color: 'white' };
  if (md === 106) return { name: 'The Epiphany', color: 'white' };
  if (dateKey >= advent) return { name: 'Advent', color: 'blue' };
  if (dateKey < ash) return { name: 'Season after the Epiphany', color: 'green' };
  if (dateKey === ash) return { name: 'Ash Wednesday', color: 'violet' };
  if (dateKey < palm) return { name: 'Lent', color: 'violet' };
  if (dateKey < ez) return { name: 'Holy Week', color: 'red' };
  if (dateKey === ez) return { name: 'Easter Day', color: 'white' };
  if (dateKey < pentecost) return { name: 'Easter Season', color: 'white' };
  if (dateKey === pentecost) return { name: 'Day of Pentecost', color: 'red' };
  return { name: 'Season after Pentecost', color: 'green' };
}
