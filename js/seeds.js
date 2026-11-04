// Built-in cycles that are copied into your lists the first time the app runs,
// where you can change them like anything you have added yourself (unlike the
// Anglican Cycle, which stays built in; see bundles.js).

import wisconsin from './data/diocese.js';

/** The diocese's two cycles: a church for each day of the month, and a name for each date. */
function diocesanSeed(d) {
  const perDate = {};
  const year = d.daily[0]?.date.slice(0, 4);
  return {
    id: d.id,
    title: d.diocese,
    updated: d.updated,
    lists: [
      {
        list: { id: 'diocese', name: 'Diocesan Cycle', type: 'monthly' },
        label: 'the diocese’s monthly cycle',
        entries: d.monthly.map((e, k) => ({ ...e, key: `m${k + 1}` })),
      },
      {
        list: { id: 'diocese-daily', name: 'Diocesan Daily Cycle', type: 'dated' },
        after: 'diocese',
        label: year ? `the diocese’s ${year} daily cycle` : 'the diocese’s daily cycle',
        entries: d.daily.map((e) => {
          const n = (perDate[e.date] = (perDate[e.date] || 0) + 1);
          return { ...e, key: n > 1 ? `${e.date}.${n}` : e.date };
        }),
      },
    ],
  };
}

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
export function seedFor(listId) {
  for (const seed of SEEDS) {
    const part = seed.lists.find((p) => p.list.id === listId && p.entries.length);
    if (part) return { seed, part };
  }
  return null;
}
