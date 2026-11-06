// Reads the Anglican Cycle of Prayer from the PDF the Anglican Communion
// publishes, by its layout. Each day is a bold date ("Friday 1 September
// 2023"), then light or italic labels ("Season of Creation", "Advent 1") that
// are left out (the app shows the Episcopal calendar instead), then the day's
// diocese or province in bold ("The Diocese of Zaki-Biam – The Church of
// Nigeria (Anglican Communion)"), which becomes the entry and the line beneath
// it. The app reads a newer cycle's PDF with it, and scripts/build-acp.mjs the
// built-in one, so the two come out the same.

import { matchDateLine } from './importer.js';
import { addDays, diffDays, keyFromParts } from './dates.js';

/**
 * Every line of a PDF in reading order, marked bold or not. fontsKnown is
 * false when the PDF's font names can't be read (then no line is bold).
 */
export async function readPdfLines(pdfjs, data, onProgress) {
  const task = pdfjs.getDocument({ data, isEvalSupported: false, fontExtraProperties: true, disableFontFace: true, verbosity: 0 });
  const lines = [];
  let fontsKnown = false;
  try {
    const doc = await task.promise;
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
      onProgress?.(p, doc.numPages);
    }
  } finally {
    await task.destroy();
  }
  return { lines, fontsKnown };
}

/** The days of an Anglican Cycle from its PDF's lines: [{ date, text, note? }], in the PDF's order; [] if it isn't laid out like one. */
export function parseAcpLines(lines) {
  const days = [];
  let day = null;
  for (const line of lines) {
    const dm = line.bold && matchDateLine(line.text);
    if (dm && dm.y && !dm.rest) {
      day = { date: keyFromParts(dm.y, dm.m, dm.d), parts: [], closed: false };
      days.push(day);
    } else if (day && line.bold && !day.closed) {
      day.parts.push(line.text);
    } else if (day && !line.bold && day.parts.length) {
      // The entry is the bold run after the labels; anything later (a heading,
      // a footer, a note about the next edition) is not part of it.
      day.closed = true;
    }
  }
  return days.filter((d) => d.parts.length).map((d) => {
    const full = d.parts.join(' ').replace(/\s+/g, ' ').replace(/\s*–\s*/g, ' – ').trim().replace(/\s*–$/, '');
    const cut = full.indexOf(' – ');
    return cut > 0 ? { date: d.date, text: full.slice(0, cut), note: full.slice(cut + 3) } : { date: d.date, text: full };
  });
}

/** In date order, with an entry on every day from the first to the last (the Anglican Communion on any the PDF leaves out). */
export function everyDay(entries) {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!sorted.length) return sorted;
  const have = new Set(sorted.map((e) => e.date));
  const first = sorted[0].date;
  const out = [];
  for (let k = 0; k <= diffDays(first, sorted[sorted.length - 1].date); k++) {
    const date = addDays(first, k);
    if (!have.has(date)) out.push({ date, text: 'The Anglican Communion' });
  }
  return [...sorted, ...out].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
