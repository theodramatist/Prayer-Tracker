// The edition for the Diocese of Wisconsin: the public edition, with the
// diocese's two cycles of prayer copied into its lists on the first run. It
// keeps its data apart from the other editions, which can share its web
// address.
export const EDITION = {
  id: 'wisconsin',
  storage: 'prayer-tracker-wisconsin',
  morningPrayer: false,
  privacy: 'Nothing you enter leaves this device: there are no accounts and no tracking.',
  lists: (list) => [
    list({ id: 'anglican', name: 'Anglican Cycle of Prayer', type: 'cycle', kind: 'acp', source: 'acp' }),
    list({ id: 'diocese', name: 'Diocesan Cycle', type: 'monthly' }),
    list({ id: 'diocese-daily', name: 'Diocesan Daily Cycle', type: 'dated' }),
    // The people of your church, named when you set it up.
    list({ id: 'parish', name: 'My Church', type: 'weekly', sort: 'last' }),
    list({ id: 'requests', name: 'Prayer Requests', type: 'daily' }),
    list({ id: 'family', name: 'Family', type: 'daily' }),
    list({ id: 'prayers', name: 'Prayers and Thanksgivings', type: 'daily', kind: 'prayers' }),
  ],
  migrateList() {},
};
