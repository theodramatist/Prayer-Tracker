// Cycles that ship with the app. Each has a start date and one entry per day
// (an entry may also be a list of several for the same day). A cycle can have
// several editions, oldest first: each date uses the edition that had begun
// by then, and the newest edition starts over after its last day.
//
// To add the next Anglican Cycle: node scripts/build-acp.mjs its.pdf --out js/data/acp-2027.js
// then import it here and add it to the end of BUNDLES.acp.
import acp2023 from './data/acp.js';

export const BUNDLES = { acp: [acp2023] };

/** The editions a list draws from (only those with entries), oldest first. */
export function editionsFor(list) {
  return ((list.source && BUNDLES[list.source]) || []).filter((b) => b.entries.length);
}

/** The edition in use on dateKey, or the newest one when no date is given. */
export function bundleFor(list, dateKey = null) {
  const editions = editionsFor(list);
  if (!editions.length) return null;
  if (!dateKey) return editions[editions.length - 1];
  let pick = editions[0];
  for (const b of editions) if (b.start <= dateKey) pick = b;
  return pick;
}

export function editionById(list, id) {
  return editionsFor(list).find((b) => b.id === id) || null;
}
