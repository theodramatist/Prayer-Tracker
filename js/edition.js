// Which edition of the app this is. This copy is the full one, with sync,
// Share with Trinity, the diocese's cycles, Morning Prayer lists and Lesser
// Feasts and Fasts. The public edition, built into everyone/ by
// scripts/build-public.mjs, has its own copy of this file (edition/public/)
// and stand-ins there for the modules it leaves out.
export const EDITION = {
  id: 'personal',
  /** The start of every key the app keeps on the device. */
  storage: 'prayer-tracker',
  /** Lists can be read at Morning Prayer. */
  morningPrayer: true,
  /** What Settings → About says about your data. */
  privacy: 'Nothing you enter leaves this device unless you choose to: sync keeps a copy in your own private repository, and Share with Trinity sends a request to the parish’s form. There are no accounts and no tracking.',
  /** The lists a first run starts with (`list` fills in the rest of each). */
  lists: (list) => [
    list({ id: 'anglican', name: 'Anglican Cycle of Prayer', type: 'cycle', kind: 'acp', source: 'acp' }),
    list({ id: 'diocese', name: 'Diocesan Cycle', type: 'monthly' }),
    list({ id: 'diocese-daily', name: 'Diocesan Daily Cycle', type: 'dated' }),
    // Read at Morning Prayer a weekday at a time; in your own prayer, everyone every day.
    list({ id: 'trinity', name: 'Trinity', type: 'weekly', sort: 'last', morningPrayer: true, everyDay: true }),
    list({ id: 'requests', name: 'Prayer Requests', type: 'daily' }),
    list({ id: 'family', name: 'Family', type: 'daily' }),
    list({ id: 'clergy', name: 'Clergy', type: 'daily', sort: 'last' }),
    // Prayers and thanksgivings from the Prayer Book, chosen to pray one by one.
    list({ id: 'prayers', name: 'Prayers and Thanksgivings', type: 'daily', kind: 'prayers' }),
  ],
  /** Bring a list saved by an earlier version up to date. */
  migrateList(saved, list) {
    // Before 2.3 the parish list was only a weekly list. It is now read at
    // Morning Prayer, with everyone every day in your own prayer, unless you
    // have chosen otherwise.
    if (saved.id === 'trinity' && saved.type === 'weekly' && saved.morningPrayer === undefined && saved.everyDay === undefined) {
      list.morningPrayer = true;
      list.everyDay = true;
    }
  },
};
