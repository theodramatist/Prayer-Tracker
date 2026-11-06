// Reads the text out of a PDF (such as the Anglican Cycle of Prayer) so it can
// go through the same parser as pasted text. pdf.js is only loaded when a PDF
// is actually chosen.

import { readPdfLines, parseAcpLines, everyDay } from './acp-pdf.js';

let loading = null;

function loadPdfjs() {
  loading ||= import('../vendor/pdfjs/pdf.min.mjs').then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
    return pdfjs;
  }).catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

export function isPdf(file) {
  return file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name));
}

/** Text of every page, one line per line of the document. */
export async function pdfToText(file, onProgress) {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true });
  const pages = [];
  try {
    const doc = await task.promise;
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      pages.push(itemsToText(content.items));
      page.cleanup();
      onProgress?.(p, doc.numPages);
    }
  } finally {
    await task.destroy();
  }
  return pages.join('\n');
}

/**
 * The Anglican Cycle of Prayer, read from the Anglican Communion's PDF by its
 * layout (as the built-in cycle is): every day from the first to the last,
 * as { date, text, note? }, or [] when the PDF isn't laid out like one.
 */
export async function readAcpPdf(file, onProgress) {
  const pdfjs = await loadPdfjs();
  const { lines, fontsKnown } = await readPdfLines(pdfjs, new Uint8Array(await file.arrayBuffer()), onProgress);
  return fontsKnown ? everyDay(parseAcpLines(lines)) : [];
}

/**
 * Text items come in the document's reading order. Start a new line where
 * pdf.js marks an end of line, or where the baseline jumps.
 */
export function itemsToText(items) {
  let out = '';
  let lastY = null;
  for (const it of items) {
    if (typeof it.str !== 'string') continue;
    const y = it.transform?.[5] ?? 0;
    const size = Math.abs(it.transform?.[3] || it.height || 10);
    if (lastY != null && Math.abs(y - lastY) > size * 0.6 && !out.endsWith('\n')) out += '\n';
    out += it.str;
    if (it.hasEOL) out += '\n';
    if (it.str) lastY = y;
  }
  return out;
}
