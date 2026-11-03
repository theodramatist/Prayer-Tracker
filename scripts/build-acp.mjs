// Builds the app's built-in Anglican Cycle of Prayer (js/data/acp.js) from the
// Anglican Communion's PDF:
//
//   node scripts/build-acp.mjs path/to/acp.pdf [--title "From Aba to …"] [--out js/data/acp.js]
//
// Each day's entry in the PDF starts with its date; the lines after it are that
// day's diocese or province and its bishops. The cycle runs from the first
// date to the last, and the app starts it over after that.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pdfToText } from '../js/pdf.js';
import { parseDated } from '../js/importer.js';
import { addDays, diffDays } from '../js/dates.js';

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

const file = new File([await readFile(pdfPath)], 'acp.pdf', { type: 'application/pdf' });
const text = await pdfToText(file);
const { entries, first, last } = parseDated(text, { defaultYear: 2023 });
if (!entries.length) {
  console.error('No dated entries found in the PDF.');
  process.exit(1);
}

// One slot per day from the first date; a day with several entries keeps them all.
const length = diffDays(first, last) + 1;
const days = Array.from({ length }, () => []);
for (const e of entries) days[diffDays(first, e.date)].push(e.note ? { text: e.text, note: e.note } : { text: e.text });
const missing = days.map((d, i) => (d.length ? null : addDays(first, i))).filter(Boolean);
const doubled = days.filter((d) => d.length > 1).length;

const bundle = {
  id: `acp${first.slice(0, 4)}`,
  title,
  source: 'The Anglican Communion Office (Anglican Consultative Council), anglicancommunion.org',
  start: first,
  entries: days.map((d) => (d.length === 1 ? d[0] : d.length ? d : { text: 'The Anglican Communion' })),
};

const lines = bundle.entries.map((e) => `    ${JSON.stringify(e)},`).join('\n');
await writeFile(out, `// The Anglican Cycle of Prayer, built from the Anglican Communion's PDF by
// scripts/build-acp.mjs. One entry per day from \`start\`; the app starts over
// after the last day. Edits you make in the app are kept separately.
export default {
  id: ${JSON.stringify(bundle.id)},
  title: ${JSON.stringify(bundle.title)},
  source: ${JSON.stringify(bundle.source)},
  start: ${JSON.stringify(bundle.start)},
  entries: [
${lines}
  ],
};
`);

console.log(`${length} days, ${first} to ${last} (${entries.length} entries${doubled ? `, ${doubled} days with more than one` : ''}).`);
if (missing.length) console.log(`No entry found for ${missing.length} day(s): ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '…' : ''}`);
console.log(`Wrote ${out}`);
