// The Diocese of Wisconsin's cycles and the Eastern Ridges clergy, copied into
// their lists the first time the app runs; they can then be changed like
// anything you add yourself (take your own name off, add a new colleague).
import wisconsin from './data/diocese.js';
import ridges from './data/eastern-ridges.js';
import { diocesanSeed, findSeed } from './diocesan-seed.js';

const clergySeed = {
  id: ridges.id,
  title: 'The Eastern Ridges',
  updated: ridges.updated,
  lists: [{
    list: { id: 'clergy', name: 'Eastern Ridges Clergy', type: 'daily', sort: 'last' },
    after: 'diocese-daily',
    label: 'the Eastern Ridges clergy',
    entries: ridges.clergy.map(([first, last], k) => ({ key: `c${k + 1}`, text: `${first} ${last}`, first: first.replace(/^Dr\. /, ''), last })),
  }],
};

export const SEEDS = [diocesanSeed(wisconsin), clergySeed];
export const seedFor = (listId) => findSeed(SEEDS, listId);
