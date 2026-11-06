// The Diocese of Wisconsin's cycles, copied into their lists the first time
// the app runs; they can then be changed like anything you add yourself.
import wisconsin from './data/diocese.js';
import { diocesanSeed, findSeed } from './diocesan-seed.js';

export const SEEDS = [diocesanSeed(wisconsin)];
export const seedFor = (listId) => findSeed(SEEDS, listId);
