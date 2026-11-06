// The public edition, for anyone: the Anglican Cycle of Prayer, your own
// church, your own prayer list, the Collect of the Day and the Prayer Book's
// prayers, on this device only. It keeps its data apart from the full
// edition's, which can share this web address.
export const EDITION = {
  id: 'public',
  storage: 'prayer-tracker-public',
  morningPrayer: false,
  privacy: 'Nothing you enter leaves this device: there are no accounts and no tracking.',
  lists: (list) => [
    list({ id: 'anglican', name: 'Anglican Cycle of Prayer', type: 'cycle', kind: 'acp', source: 'acp' }),
    // The people of your church, named when you set it up.
    list({ id: 'parish', name: 'My Church', type: 'weekly', sort: 'last' }),
    list({ id: 'requests', name: 'Prayer Requests', type: 'daily' }),
    list({ id: 'family', name: 'Family', type: 'daily' }),
    list({ id: 'prayers', name: 'Prayers and Thanksgivings', type: 'daily', kind: 'prayers' }),
  ],
  migrateList() {},
};
