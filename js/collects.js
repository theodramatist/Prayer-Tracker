// The Collect of the Day, from the Prayer Book's Collects for the Seasons of
// the Year and the Holy Days (data/collects.js), in Rite One or Rite Two
// language as chosen in Settings. Which collect each day takes, weekdays
// included, is worked out in calendar.js.

import data from './data/collects.js';
import { collectId } from './calendar.js';
import { DEFAULT_RITE } from './prayers.js';

/** Every collect by id: "advent-1", "proper-26", "christmas-day", or a Holy Day's date ("11-30"). */
export const COLLECTS = Object.fromEntries(data.collects.map((c) => [c.id, c]));

/**
 * The collect for a date, in the chosen language: { id, title, sub, text, page }.
 * `title` and `sub` are its heading in the Prayer Book ("Proper 26", "The
 * Sunday closest to November 2"); `text` may hold alternatives, with "or
 * this" between them on a line of its own in *italics*.
 */
export function collectFor(dateKey, rite = DEFAULT_RITE) {
  const c = COLLECTS[collectId(dateKey)];
  if (!c) return null;
  const r = rite === 'traditional' ? 'traditional' : 'contemporary';
  return { id: c.id, title: c.title, sub: c.sub || null, text: c[r], page: c.pages[r] };
}

/** Where to find it in the Prayer Book: its heading and page. */
export function collectSource(c) {
  return [c.title, c.sub, `page ${c.page}`].filter(Boolean).join(' · ');
}
