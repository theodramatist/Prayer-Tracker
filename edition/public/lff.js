// Lesser Feasts and Fasts is under copyright, so the public edition doesn't
// offer it: only the Prayer Book's own calendar and collects, which are in
// the public domain.
export const LFF_AVAILABLE = false;
export const LFF_URL = '';
export const LFF_KEY = null;

export class LffLibrary {
  constructor() {
    this.data = null;
  }

  feastsFor() { return []; }

  save() { return false; }

  clear() {}
}

export const keptFeasts = () => [];
export const feastCollect = () => null;
export const feastSource = () => '';
export async function readLffPdf() { throw new Error('Lesser Feasts and Fasts isn’t part of this edition.'); }
