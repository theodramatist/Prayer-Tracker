// Built-in cycles copied into lists on a first run: the Diocese of Wisconsin's
// (data/diocese.js) as a seed (see store.seed), for the full edition and the
// Wisconsin editions alike.

/** The diocese's two cycles: a church for each day of the month, and a name for each date. */
export function diocesanSeed(d) {
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

/** The built-in cycle (and its part) among `seeds` that fills a list, if any. */
export function findSeed(seeds, listId) {
  for (const seed of seeds) {
    const part = seed.lists.find((p) => p.list.id === listId && p.entries.length);
    if (part) return { seed, part };
  }
  return null;
}
