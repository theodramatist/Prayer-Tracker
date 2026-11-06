// The edition for the clergy of the Eastern Ridges: the Diocese of
// Wisconsin's edition, with the Eastern Ridges clergy on a list of their own.
// It keeps its data apart from the other editions, which can share its web
// address.
export const EDITION = {
  id: 'eastern-ridges',
  storage: 'prayer-tracker-eastern-ridges',
  morningPrayer: false,
  privacy: 'Nothing you enter leaves this device: there are no accounts and no tracking.',
  lists: (list) => [
    list({ id: 'anglican', name: 'Anglican Cycle of Prayer', type: 'cycle', kind: 'acp', source: 'acp' }),
    list({ id: 'diocese', name: 'Diocesan Cycle', type: 'monthly' }),
    list({ id: 'diocese-daily', name: 'Diocesan Daily Cycle', type: 'dated' }),
    list({ id: 'clergy', name: 'Eastern Ridges Clergy', type: 'daily', sort: 'last' }),
    // The people of your church, named when you set it up.
    list({ id: 'parish', name: 'My Church', type: 'weekly', sort: 'last' }),
    list({ id: 'requests', name: 'Prayer Requests', type: 'daily' }),
    list({ id: 'family', name: 'Family', type: 'daily' }),
    list({ id: 'prayers', name: 'Prayers and Thanksgivings', type: 'daily', kind: 'prayers' }),
  ],
  migrateList() {},
};
