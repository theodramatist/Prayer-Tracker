// The public edition's own Settings cards: Lesser Feasts and Fasts, from the
// person's own copy of the book, but not the full edition's cards for sharing
// requests with a parish or for sync.
import { lffCard } from './lff-ui.js';

export const extraCards = (app) => [lffCard(app)];
