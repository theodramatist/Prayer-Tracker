// Builds the app's library of Prayers and Thanksgivings (js/data/prayers.js)
// from the Book of Common Prayer's section of that name, as a PDF:
//
//   node scripts/build-prayers.mjs path/to/praytnx.pdf [--out js/data/prayers.js] [--list-italics]
//
// The text is taken exactly as printed. The Prayer Book notes that "prayers
// originally composed in traditional idiom have not been modernized; but,
// except in certain classical prayers which do not lend themselves to
// modernization, pronouns and verbs have been put in italics to assist in
// rendering them into contemporary speech." So a prayer whose pronouns and
// verbs are in italics gets a contemporary (Rite Two) form too, made by
// rendering just those italic words; the rest stay as they are.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); if (i >= 0) { args.splice(i, 1); return true; } return false; };
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const out = opt('--out', fileURLToPath(new URL('../js/data/prayers.js', import.meta.url)));
const listItalics = flag('--list-italics');
const pdfPath = args[0];
if (!pdfPath) {
  console.error('Usage: node scripts/build-prayers.mjs path/to/praytnx.pdf [--out js/data/prayers.js]');
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

const lines = await readLines(pdfPath);
const textOf = (l) => l.runs.map((r) => r.s).join('').replace(/\s+/g, ' ').trim();
const allItalic = (l) => l.runs.every((r) => r.italic || !r.s.trim());

// ---------- into prayers ----------

const prayers = [];
let kind = null;
let section = null;
let cur = null;
let para = null; // the paragraph being built: an array of runs
let lastY = null;
let lastPage = null;
let pageNo = null; // the Prayer Book's page number

const startPara = (style = 'text') => { para = { style, runs: [] }; cur.paras.push(para); };

for (const l of lines) {
  const t = textOf(l);
  if (!t) continue;
  const size = l.runs.find((r) => r.s.trim())?.size || 12;
  // Running heads and page numbers, at the foot of each page.
  if (l.y < 60 && /^(\d+ )?(Prayers|Thanksgivings)( \d+)?$/.test(t)) {
    const n = t.match(/\d+/);
    if (n) pageNo = Number(n[0]);
    continue;
  }
  if (size >= 18) {
    if (t === 'Prayers') kind = 'prayer';
    if (t === 'Thanksgivings') kind = 'thanksgiving';
    continue;
  }
  if (!kind) continue;
  if (l.runs.some((r) => r.bold)) { section = t; cur = null; continue; }
  const gap = lastPage === l.page && lastY != null ? lastY - l.y : 13;
  lastY = l.y;
  lastPage = l.page;
  const title = allItalic(l) && size === 12 && t.match(/^(\d+)\. (.*)$/);
  if (title) {
    cur = { kind, section, n: Number(title[1]), title: title[2], page: pageNo, paras: [], inTitle: true };
    prayers.push(cur);
    para = null;
    continue;
  }
  if (!cur) continue;
  if (size <= 10) {
    // A rubric: "or this" between alternatives is kept; cross-references are not.
    if (/^or this$/i.test(t)) { cur.paras.push({ style: 'rubric', runs: [{ s: t, italic: true }] }); para = null; }
    cur.inTitle = false;
    continue;
  }
  if (cur.inTitle && allItalic(l) && !cur.paras.length) { cur.title += ` ${t}`; continue; }
  cur.inTitle = false;
  if (allItalic(l)) {
    // A whole line in italics: "Amen." finishing the paragraph, or the people's response.
    if (/^Amen\.?$/.test(t) && para) { para.runs.push({ s: ' ' }, { s: 'Amen.', italic: true }); continue; }
    if (para && para.style === 'response' && gap < 16) { para.runs.push({ s: ' ' }, ...l.runs); continue; }
    startPara('response');
    para.runs.push(...l.runs);
    continue;
  }
  if (!para || para.style !== 'text' || gap > 16) startPara('text');
  else {
    // Join to the line above: a word broken at the line's end, or a space.
    const prev = para.runs[para.runs.length - 1];
    if (prev && /[a-z]-$/.test(prev.s) && /^[a-z]/.test(l.runs[0].s)) prev.s = prev.s.slice(0, -1);
    else para.runs.push({ s: ' ' });
  }
  para.runs.push(...l.runs);
}

// ---------- the contemporary rendering of italic pronouns and verbs ----------

// Each italic phrase in a traditional prayer, as it is rendered in contemporary speech.
const MODERN = {
  thee: 'you', thou: 'you', thy: 'your', unto: 'to',
  hast: 'have', hath: 'has', art: 'are', wilt: 'will', wouldest: 'would',
  liveth: 'lives', reigneth: 'reigns', reacheth: 'reaches', riseth: 'rises',
  'who hast': 'you have', 'who sittest': 'you sit', 'who openest': 'you open', 'who pourest': 'you pour',
  fillest: 'fill', givest: 'give',
};
const KEEP = /^(Amen\.?|N|or|he|him|his|she|her|hers|they|them|their|_+)$/; // names, choices, and "he or she"

function modernize(phrase, next) {
  const raw = phrase.trim();
  if (!raw || KEEP.test(raw.replace(/[.,;:]$/, ''))) return null;
  const words = raw.split(/\s+/);
  const outWords = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i].replace(/[.,;:]$/, '');
    const punct = words[i].slice(w.length);
    const two = i + 1 < words.length ? `${w} ${words[i + 1].replace(/[.,;:]$/, '')}`.toLowerCase() : null;
    if (two && MODERN[two]) { outWords.push(MODERN[two] + words[i + 1].slice(words[i + 1].replace(/[.,;:]$/, '').length)); i++; continue; }
    const lower = w.toLowerCase();
    let m;
    if (lower === 'thine') m = /^\s*[a-z]/i.test(i + 1 < words.length ? words[i + 1] : next) && !punct ? 'your' : 'yours';
    else m = MODERN[lower];
    if (m == null) return { unknown: raw };
    outWords.push((w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase() ? m[0].toUpperCase() + m.slice(1) : m) + punct);
  }
  return { text: outWords.join(' ') };
}

const ARCHAIC = /\b(thee|thou|thy|thine|hast|hath|art|dost|doth|didst|wilt|shalt|wouldest|[a-z]+(est|eth))\b/i;
const unknown = new Map();
const italicPhrases = new Map();

function render(p) {
  const paras = { traditional: [], contemporary: [] };
  let convertible = false;
  let romanArchaic = false;
  for (const para of p.paras) {
    if (para.style !== 'text') {
      const t = para.runs.map((r) => r.s).join('').replace(/\s+/g, ' ').trim();
      paras.traditional.push(`*${t}*`);
      paras.contemporary.push(`*${t}*`);
      continue;
    }
    let trad = '';
    let mod = '';
    para.runs.forEach((r, k) => {
      trad += r.s;
      if (!r.italic || !r.s.trim()) {
        mod += r.s;
        if (ARCHAIC.test(r.s.replace(/\b(beseech|blessed|interest|honest|forest|rest|best|least|harvest|request|manifest|earnest|guest|modest|highest|greatest|everlasting|cometh)\b/gi, ''))) romanArchaic = romanArchaic || /\b(thee|thou|thy|thine|hast|hath|dost|doth|didst|wilt|shalt|wouldest)\b/i.test(r.s);
        return;
      }
      const next = para.runs.slice(k + 1).map((x) => x.s).join('');
      italicPhrases.set(r.s.trim(), (italicPhrases.get(r.s.trim()) || 0) + 1);
      const m = modernize(r.s, next);
      if (!m) { mod += r.s; return; }
      if (m.unknown) { unknown.set(m.unknown, `${p.kind} ${p.n}`); mod += r.s; return; }
      convertible = true;
      mod += r.s.replace(r.s.trim(), m.text);
    });
    paras.traditional.push(trad.replace(/\s+/g, ' ').trim());
    paras.contemporary.push(mod.replace(/\s+/g, ' ').trim());
  }
  return { convertible, romanArchaic, traditional: paras.traditional.join('\n'), contemporary: paras.contemporary.join('\n') };
}

// Blanks for a name or place, which the PDF leaves as gaps.
const BLANKS = (s) => s
  .replace(/\[(in|and especially|especially|in particular) ?_*\]/g, '[$1 ______]')
  .replace(/Town, \)/g, 'Town, ______)');

const library = prayers.map((p) => {
  const r = render(p);
  const id = `${p.kind === 'prayer' ? 'p' : 't'}${p.n}`;
  const entry = { id, kind: p.kind, n: p.n, section: p.section, title: p.title.replace(/\s+/g, ' ').trim(), page: p.page };
  if (r.convertible) {
    entry.traditional = BLANKS(r.traditional);
    entry.contemporary = BLANKS(r.contemporary);
    if (r.romanArchaic) entry.check = 'traditional words left unrendered';
  } else {
    entry.text = BLANKS(r.traditional);
  }
  return entry;
});

if (listItalics) {
  console.log([...italicPhrases.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v}\t${k}`).join('\n'));
}
if (unknown.size) {
  console.error(`Italic words with no contemporary rendering yet: ${[...unknown.entries()].map(([k, v]) => `“${k}” (${v})`).join(', ')}`);
  process.exit(2);
}
const counts = { prayer: library.filter((x) => x.kind === 'prayer').length, thanksgiving: library.filter((x) => x.kind === 'thanksgiving').length };
const both = library.filter((x) => x.contemporary).length;
const rows = library.map((e) => `    ${JSON.stringify(e)},`).join('\n');
await writeFile(out, `// The Book of Common Prayer (1979), Prayers and Thanksgivings (pages 810–841),
// built by scripts/build-prayers.mjs from the PDF of that section formatted as
// the original by Satucket Software (satucket.com). Prayers in
// traditional idiom whose pronouns and verbs the Prayer Book prints in italics
// also have a contemporary form, rendering just those words. In the text, a
// new line starts a paragraph, and *…* is the people's response or a rubric.
export default {
  source: 'The Book of Common Prayer (1979), Prayers and Thanksgivings',
  prayers: [
${rows}
  ],
};
`);
console.log(`${counts.prayer} prayers and ${counts.thanksgiving} thanksgivings; ${both} in both traditional and contemporary forms.`);
const flagged = library.filter((x) => x.check);
if (flagged.length) console.log(`To look at: ${flagged.map((x) => `${x.id} ${x.title} (${x.check})`).join('; ')}`);
console.log(`Wrote ${out}`);
