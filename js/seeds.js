// Built-in cycles that are copied into your lists the first time the app runs,
// where you can change them like anything you have added yourself (unlike the
// Anglican Cycle, which stays built in; see bundles.js).

import wisconsin from './data/diocese.js';
import { diocesanSeed, findSeed } from './diocesan-seed.js';

/** Lists added to the app since it first shipped, for copies that started without them. */
const NEW_LISTS = {
  id: 'lists-2026-11',
  updated: Date.parse('2026-11-04T00:00:00Z'),
  lists: [
    { list: { id: 'prayers', name: 'Prayers and Thanksgivings', type: 'daily', kind: 'prayers' }, after: 'clergy', entries: [] },
  ],
};

export const SEEDS = [diocesanSeed(wisconsin), NEW_LISTS];

/** The built-in cycle (and its part) that fills a list, if any. */
export const seedFor = (listId) => findSeed(SEEDS, listId);
