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
import { parseDated } from '../js/importer.js';
import { addDays, diffDays } from '../js/dates.js';
import { readPdfLines, parseAcpLines } from '../js/acp-pdf.js';

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

const { lines, fontsKnown } = await readPdfLines(pdfjs, new Uint8Array(await readFile(pdfPath)));

let entries;
if (fontsKnown) {
  entries = parseAcpLines(lines);
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
