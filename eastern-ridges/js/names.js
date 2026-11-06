// Name handling for people lists: accept "First Last" or "Last, First",
// display as "First Last", and sort by last name.

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v', 'vi', 'md', 'phd', 'dds', 'esq', 'rn', 'dmin', 'mdiv']);
// Lower-case words that belong to the surname: "Ludwig van Beethoven", "Maria de la Cruz".
const PARTICLES = new Set(['van', 'von', 'der', 'den', 'de', 'del', 'della', 'di', 'da', 'dos', 'das', 'du',
  'des', 'la', 'le', 'st', 'ste', 'san', 'santa', 'bin', 'ibn', 'al', 'el', 'ter', 'ten', 'op']);
// Trailing words that are not part of the surname: "The Smith Family".
const GROUP_WORDS = new Set(['family', 'families', 'household']);
// Leading titles that should not affect sorting by first name.
const TITLES = new Set(['the', 'rev', 'revd', 'reverend', 'rt', 'very', 'most', 'canon', 'fr', 'father', 'mtr',
  'mother', 'dcn', 'deacon', 'bp', 'bishop', 'archdeacon', 'dean', 'dr', 'mr', 'mrs', 'ms', 'miss', 'mx', 'sister',
  'sr', 'brother', 'br', 'prof', 'sir', 'dame']);

const norm = (token) => token.toLowerCase().replace(/[.,']/g, '');

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true, ignorePunctuation: true });

/**
 * Split off a trailing note so "John Smith (surgery)" or "John Smith – surgery"
 * still sorts as John Smith. Returns [core, tail] where tail keeps its separator.
 */
function splitTail(s) {
  const candidates = [s.indexOf('('), s.indexOf(' - '), s.indexOf(' – '), s.indexOf(' — '), s.indexOf(': ')]
    .filter((i) => i > 0);
  if (!candidates.length) return [s, ''];
  const i = Math.min(...candidates);
  return [s.slice(0, i).trim(), s.slice(i)];
}

function joinTail(core, tail) {
  if (!tail) return core;
  return tail.startsWith('(') ? `${core} ${tail}` : `${core}${tail}`;
}

/**
 * Parse a person's name.
 * @returns {{ first: string, last: string, display: string }}
 *   display is how the name should be shown ("First Last"); "Last, First"
 *   input is flipped, anything else is kept as typed.
 */
export function parseName(input) {
  const s = String(input ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return { first: '', last: '', display: '' };
  const [core, tail] = splitTail(s);

  const comma = core.indexOf(',');
  if (comma > 0) {
    const before = core.slice(0, comma).trim();
    const afterParts = core.slice(comma + 1).split(',').map((p) => p.trim()).filter(Boolean);
    const isSuffix = (p) => p.split(' ').every((t) => SUFFIXES.has(norm(t)));
    if (afterParts.length && !isSuffix(afterParts[0])) {
      // "Last, First" (optionally "Last, First, Jr.")
      const first = afterParts[0];
      const suffix = afterParts.slice(1).filter(isSuffix).join(' ');
      const display = joinTail([first, before, suffix].filter(Boolean).join(' '), tail);
      return { first, last: before, display };
    }
    // "John Smith, Jr." — fall through with the suffix removed from parsing.
    return { ...parseTokens(before.split(' ')), display: s };
  }
  return { ...parseTokens(core.split(' ')), display: s };
}

function parseTokens(input) {
  const tokens = input.filter(Boolean);
  while (tokens.length > 1 && SUFFIXES.has(norm(tokens[tokens.length - 1]))) tokens.pop();
  while (tokens.length > 1 && GROUP_WORDS.has(norm(tokens[tokens.length - 1]))) tokens.pop();
  if (tokens.length === 1) return { first: '', last: tokens[0] };

  let lastStart = tokens.length - 1;
  // Pull surname particles in, but never the very first word ("Della Reese").
  while (lastStart - 1 >= 1 && PARTICLES.has(norm(tokens[lastStart - 1]))) lastStart--;
  let firstTokens = tokens.slice(0, lastStart);
  while (firstTokens.length > 1 && TITLES.has(norm(firstTokens[0]))) firstTokens = firstTokens.slice(1);
  if (firstTokens.length === 1 && TITLES.has(norm(firstTokens[0]))) firstTokens = [];
  return { first: firstTokens.join(' '), last: tokens.slice(lastStart).join(' ') };
}

/** Compare two parsed names: last name, then first name, then full text. */
export function compareNames(a, b) {
  return collator.compare(a.last, b.last)
    || collator.compare(a.first, b.first)
    || collator.compare(a.display, b.display);
}

export function compareText(a, b) {
  return collator.compare(a, b);
}

/** First letter used for alphabet dividers ("van Beethoven" → "V"). */
export function initialOf(last) {
  const m = String(last).match(/[\p{L}\p{N}]/u);
  return m ? m[0].toLocaleUpperCase() : '#';
}
