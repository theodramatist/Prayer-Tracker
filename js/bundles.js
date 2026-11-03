// Cycles that ship with the app. Each has a start date and one entry per day
// (an entry may also be a list of several for the same day).
import acp from './data/acp.js';

export const BUNDLES = { acp };

/** The built-in cycle a list draws from, if it has one with entries. */
export function bundleFor(list) {
  const b = list.source && BUNDLES[list.source];
  return b && b.entries.length ? b : null;
}
