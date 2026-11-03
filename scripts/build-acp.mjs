// Builds the app's built-in Anglican Cycle of Prayer (js/data/acp.js) from the
// Anglican Communion's PDF:
//
//   node scripts/build-acp.mjs path/to/acp.pdf [--title "From Abu to …"] [--out js/data/acp.js]
//
// In the PDF each day is a bold date ("Friday 1 September 2023"), then light
// or italic labels ("Season of Creation", "Advent 1") that the app leaves out
// (it shows the Episcopal calendar instead), then the day's diocese or
// province in bold ("The Diocese of Zaki-Biam – The Church of Nigeria
// (Anglican Communion)"), which becomes the entry and the line beneath it.
// The cycle runs from the first date to the last; the app starts it over after.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { matchDateLine, parseDated } from '../js/importer.js';
import { addDays, diffDays, keyFromParts } from '../js/dates.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : fallback;
};
const out = opt('--out', fileURLToPath(new URL('../js/data/acp.js', import.meta.url)));
const title = opt('--title', 'Anglican Cycle of Prayer');
const pdfPath = args[0];
if (!pdfPath) {
  console.error('Usage: node scripts/build-acp.mjs path/to/acp.pdf [--title "…"] [--out js/data/acp.js]');
  process.exit(1);
}

const pdfjs = await import('../vendor/pdfjs/pdf.min.mjs');
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

/** Every line of the PDF in reading order, marked bold or not. */
async function readLines(path) {
  const data = new Uint8Array(await readFile(path));
  const task = pdfjs.getDocument({ data, isEvalSupported: false, fontExtraProperties: true, verbosity: 0 });
  const doc = await task.promise;
  const lines = [];
  let fontsKnown = false;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    await page.getOperatorList(); // loads the fonts, so their names can be read
    const tc = await page.getTextContent();
    const names = new Map();
    const fontOf = (id) => {
      if (!names.has(id)) {
        let n = '';
        try { n = page.commonObjs.get(id)?.name || ''; } catch { n = ''; }
        names.set(id, n);
        if (n) fontsKnown = true;
      }
      return names.get(id);
    };
    let parts = [];
    let bold = 0;
    let chars = 0;
    let lastY = null;
    const flush = () => {
      const text = parts.join('').replace(/\s+/g, ' ').trim();
      if (text) lines.push({ text, bold: bold > chars / 2, page: p });
      parts = [];
      bold = 0;
      chars = 0;
    };
    for (const it of tc.items) {
      if (typeof it.str !== 'string') continue;
      const y = it.transform[5];
      const size = Math.abs(it.transform[3]) || 10;
      if (lastY != null && Math.abs(y - lastY) > size * 0.6) flush();
      const prev = parts[parts.length - 1];
      // Separate runs that the PDF placed side by side without a space.
      if (prev && it.str && !/\s$/.test(prev) && !/^\s/.test(it.str)) parts.push(' ');
      parts.push(it.str);
      const n = it.str.trim().length;
      if (n) {
        chars += n;
        const f = fontOf(it.fontName);
        if (/Bold/i.test(f) && !/Italic|Black/i.test(f)) bold += n;
        lastY = y;
      }
      if (it.hasEOL) flush();
    }
    flush();
    page.cleanup();
  }
  await task.destroy();
  return { lines, fontsKnown };
}

const { lines, fontsKnown } = await readLines(pdfPath);

let entries;
if (fontsKnown) {
  entries = [];
  let day = null;
  for (const line of lines) {
    const dm = line.bold && matchDateLine(line.text);
    if (dm && dm.y && !dm.rest) {
      day = { date: keyFromParts(dm.y, dm.m, dm.d), parts: [], closed: false };
      entries.push(day);
    } else if (day && line.bold && !day.closed) {
      day.parts.push(line.text);
    } else if (day && !line.bold && day.parts.length) {
      // The entry is the bold run after the labels; anything later (a heading,
      // a footer, a note about the next edition) is not part of it.
      day.closed = true;
    }
  }
  entries = entries.filter((d) => d.parts.length).map((d) => {
    const full = d.parts.join(' ').replace(/\s+/g, ' ').replace(/\s*–\s*/g, ' – ').trim().replace(/\s*–$/, '');
    const cut = full.indexOf(' – ');
    return cut > 0 ? { date: d.date, text: full.slice(0, cut), note: full.slice(cut + 3) } : { date: d.date, text: full };
  });
} else {
  // Fonts unavailable: fall back to the general dated-text reader.
  entries = parseDated(lines.map((l) => l.text).join('\n'), { defaultYear: 2023 }).entries;
}
if (!entries.length) {
  console.error('No dated entries found in the PDF.');
  process.exit(1);
}

entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
const first = entries[0].date;
const last = entries[entries.length - 1].date;
const length = diffDays(first, last) + 1;
const days = Array.from({ length }, () => []);
for (const e of entries) days[diffDays(first, e.date)].push(e.note ? { text: e.text, note: e.note } : { text: e.text });
const missing = days.map((d, i) => (d.length ? null : addDays(first, i))).filter(Boolean);
const doubled = days.map((d, i) => (d.length > 1 ? addDays(first, i) : null)).filter(Boolean);

const bundle = {
  id: `acp${first.slice(0, 4)}`,
  title,
  source: '© The Anglican Consultative Council 2023. The Anglican Cycle of Prayer may be freely copied, adapted, distributed and shared on the condition that no charge is made for its use. anglicancommunion.org/prayer',
  start: first,
  entries: days.map((d) => (d.length === 1 ? d[0] : d.length ? d : { text: 'The Anglican Communion' })),
};

const rows = bundle.entries.map((e, i) => `    ${JSON.stringify(e)}, // ${addDays(first, i)}`).join('\n');
await writeFile(out, `// The Anglican Cycle of Prayer, built from the Anglican Communion's PDF by
// scripts/build-acp.mjs. One entry per day from \`start\`; the app starts over
// after the last day. Edits you make in the app are kept separately.
export default {
  id: ${JSON.stringify(bundle.id)},
  title: ${JSON.stringify(bundle.title)},
  source: ${JSON.stringify(bundle.source)},
  start: ${JSON.stringify(bundle.start)},
  entries: [
${rows}
  ],
};
`);

console.log(`${length} days, ${first} to ${last}: ${entries.length} entries${fontsKnown ? '' : ' (read without fonts)'}.`);
if (doubled.length) console.log(`More than one entry on ${doubled.length} day(s): ${doubled.slice(0, 10).join(', ')}`);
if (missing.length) console.log(`No entry found for ${missing.length} day(s): ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '…' : ''}`);
console.log(`Wrote ${out}`);
