// Builds the Collects of the Day (js/data/collects.js) from the Book of Common
// Prayer's two books of Collects, as PDFs: "Collects: Traditional" (Rite One,
// pages 159-185) and "Collects: Contemporary" (Rite Two, pages 211-236).
//
//   node scripts/build-collects.mjs path/to/colctrad.pdf path/to/collect_contemp.pdf [--out js/data/collects.js]
//
// It takes the Seasons of the Year and the Holy Days, each collect exactly as
// printed, with "or this" between alternatives (Christmas Day, Easter Day,
// Ascension Day, Pentecost). Prefaces and the other rubrics are left out; the
// rules they give for weekdays are in js/calendar.js. The two books have the
// same headings in the same order, so each collect's Rite One and Rite Two
// forms are paired by heading.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const out = opt('--out', fileURLToPath(new URL('../js/data/collects.js', import.meta.url)));
const [tradPath, contPath] = args;
if (!tradPath || !contPath) {
  console.error('Usage: node scripts/build-collects.mjs colctrad.pdf collect_contemp.pdf [--out js/data/collects.js]');
  process.exit(1);
}

const pdfjs = await import('../vendor/pdfjs/pdf.min.mjs');
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

/** Every line of the PDF: its runs (text, italic?, bold?, size), page, and position. */
async function readLines(path) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await readFile(path)), isEvalSupported: false, fontExtraProperties: true, verbosity: 0 }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    await page.getOperatorList(); // loads the fonts, so their names can be read
    const tc = await page.getTextContent();
    let cur = null;
    for (const it of tc.items) {
      if (typeof it.str !== 'string' || !it.str) continue;
      const y = it.transform[5];
      if (!cur || Math.abs(cur.y - y) > 3) { cur = { y, page: p, runs: [] }; lines.push(cur); }
      let font = '';
      try { font = page.commonObjs.get(it.fontName)?.name || ''; } catch { font = ''; }
      cur.runs.push({ s: it.str, italic: /Italic/.test(font), bold: /Bold/.test(font), size: Math.round(Math.abs(it.transform[3])) });
    }
  }
  await doc.destroy?.();
  return lines;
}

const clean = (s) => s.replace(/\s+/g, ' ').trim();
const textOf = (runs) => clean(runs.map((r) => r.s).join(''));
const allItalic = (l) => l.runs.every((r) => r.italic || !r.s.trim());

const ORD = { First: 1, Second: 2, Third: 3, Fourth: 4, Fifth: 5, Sixth: 6, Seventh: 7, Eighth: 8 };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n) => String(n).padStart(2, '0');

/**
 * The id js/calendar.js gives the day: the Sunday or season's name, the
 * Proper's number, or for a Holy Day on a fixed date, that date (MM-DD).
 */
function idFor(title, sub) {
  let m;
  if ((m = title.match(/^(\w+) Sunday of Advent$/))) return `advent-${ORD[m[1]]}`;
  if (title === 'The Nativity of Our Lord: Christmas Day') return 'christmas-day';
  if ((m = title.match(/^(\w+) Sunday after Christmas Day$/))) return `christmas-${ORD[m[1]]}`;
  if (title === 'The Epiphany') return 'epiphany';
  if (title === 'Last Sunday after the Epiphany') return 'epiphany-last';
  if ((m = title.match(/^(\w+) Sunday after the Epiphany\b/))) return `epiphany-${ORD[m[1]]}`;
  if ((m = title.match(/^(\w+) Sunday in Lent$/))) return `lent-${ORD[m[1]]}`;
  if (title === 'Sunday of the Passion: Palm Sunday') return 'palm-sunday';
  if ((m = title.match(/^(\w+) Sunday of Easter\b/))) return `easter-${ORD[m[1]]}`;
  if (title === 'The Day of Pentecost: Whitsunday') return 'pentecost';
  if (title === 'First Sunday after Pentecost: Trinity Sunday') return 'trinity-sunday';
  if ((m = title.match(/^Proper (\d+)$/))) return `proper-${m[1]}`;
  if (title === 'All Saints’ Day') return 'all-saints-day';
  if (sub && (m = sub.match(new RegExp(`^(${MONTHS.join('|')}) (\\d+)$`)))) return `${pad(MONTHS.indexOf(m[1]) + 1)}-${pad(m[2])}`;
  return title.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** The collects of one book, in order: { id, title, sub, page, texts: [...], or: [...] }. */
function collectsOf(lines, book) {
  const collects = [];
  const odd = [];
  let started = false;
  let page = null;
  let cur = null;
  const text = () => cur.texts[cur.texts.length - 1];
  const setText = (s) => { cur.texts[cur.texts.length - 1] = s; };

  for (const l of lines) {
    const t = textOf(l.runs);
    if (!t) continue;
    const size = l.runs.find((r) => r.s.trim())?.size || 12;
    // The running head, with the Prayer Book's page number, at the foot of each page.
    if (l.y < 60 && new RegExp(`^(\\d+ )?Collects: ${book}( \\d+)?$`).test(t)) {
      const n = t.match(/\d+/);
      if (n) page = Number(n[0]);
      continue;
    }
    if (size >= 18) {
      // The book's title, and its parts: the Seasons of the Year go on into the Holy Days; the Common of Saints ends them.
      if (t === `Collects: ${book}`) started = true;
      if (started && t === 'The Common of Saints') break;
      continue;
    }
    if (!started) continue;
    if (l.runs.some((r) => r.bold)) {
      const title = clean(l.runs.filter((r) => !r.italic).map((r) => r.s).join(''));
      const sub = clean(l.runs.filter((r) => r.italic).map((r) => r.s).join('')) || null;
      cur = { id: idFor(title, sub), title, sub, page, texts: [''], or: [] };
      collects.push(cur);
      continue;
    }
    if (!cur) continue;
    if (size <= 10) {
      // A rubric: the words between alternatives are kept; directions are not.
      if (/^or (this|the following)$/.test(t) && text()) { cur.or.push(t); cur.texts.push(''); }
      continue;
    }
    if (allItalic(l)) {
      if (/^Amen\.?$/.test(t) && text()) { setText(`${text()} Amen.`); continue; }
      if (/^Preface of /.test(t)) continue;
      odd.push(`${book} p.${page} ${cur.title}: ${t}`);
      continue;
    }
    // The collect itself: lines joined with a space, or straight on after a hyphen (only-begotten).
    const prev = text();
    setText(!prev ? t : prev.endsWith('-') ? prev + t : `${prev} ${t}`);
  }
  for (const c of collects) {
    c.texts = c.texts.map((s) => s.replace(/\s+([.,;:])/g, '$1').replace(/\bAmen\s*\.\s*$/, 'Amen.'));
    if (c.texts.some((s) => !/Amen\.$/.test(s))) odd.push(`${book} ${c.title}: doesn’t end with Amen.`);
  }
  return { collects, odd };
}

const trad = collectsOf(await readLines(tradPath), 'Traditional');
const cont = collectsOf(await readLines(contPath), 'Contemporary');
const problems = [...trad.odd, ...cont.odd];

if (trad.collects.length !== cont.collects.length) problems.push(`Traditional has ${trad.collects.length} collects, Contemporary ${cont.collects.length}.`);
const collects = trad.collects.map((t, k) => {
  const c = cont.collects[k];
  if (!c || c.id !== t.id) { problems.push(`#${k}: ${t.title} / ${c?.title}`); return null; }
  if (c.texts.length !== t.texts.length) problems.push(`${t.title}: ${t.texts.length} collects in Rite One, ${c.texts.length} in Rite Two.`);
  // Alternatives as the app shows a prayer's: each on its own line, with "or this" between them in italics.
  const join = (x) => x.texts.map((s, i) => (i ? `*${x.or[i - 1]}*\n${s}` : s)).join('\n');
  return {
    id: t.id,
    title: c.title,
    ...(c.sub ? { sub: c.sub } : {}),
    pages: { traditional: t.page, contemporary: c.page },
    traditional: join(t),
    contemporary: join(c),
  };
}).filter(Boolean);

const ids = new Set();
for (const c of collects) {
  if (ids.has(c.id)) problems.push(`Two collects have the id ${c.id}.`);
  ids.add(c.id);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const banner = `// The Collects of the Day: the Seasons of the Year and the Holy Days, from
// the Book of Common Prayer (1979), in traditional language (Rite One, pages
// ${collects[0].pages.traditional}-${Math.max(...collects.map((c) => c.pages.traditional))}) and contemporary (Rite Two, pages ${collects[0].pages.contemporary}-${Math.max(...collects.map((c) => c.pages.contemporary))}), exactly as printed.
// Built by scripts/build-collects.mjs from the PDFs of the Collects formatted
// by Satucket Software (satucket.com); don't edit it by hand.
`;
// One collect to a line.
await writeFile(out, `${banner}\nexport default {\n  collects: [\n${collects.map((c) => `    ${JSON.stringify(c)},`).join('\n')}\n  ],\n};\n`);
console.log(`${collects.length} collects (${collects.filter((c) => c.traditional.includes('\n')).length} with alternatives) → ${out}`);
