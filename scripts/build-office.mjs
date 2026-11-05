// Builds more of the Prayer Book's prayers for the library (js/data/office.js),
// from its own pages as PDFs (formatted as the original, by Satucket Software):
//
//   - Morning and Evening Prayer, Rite One and Rite Two: the Collects the
//     Officiant says after the Suffrages, and the prayers for mission;
//   - the Great Vigil of Easter (Proper Liturgies for Special Days): the prayer
//     at the lighting of the Paschal Candle, the Collect after each Lesson, and
//     the Collects at the Eucharist.
//
//   node scripts/build-office.mjs mp1.pdf mp2.pdf ep1.pdf ep2.pdf SpecialDays.pdf
//     [--check dir] [--out js/data/office.js]
//
// --check names a folder with the Online Book of Common Prayer's own pages
// (bcponline.org: mp1.html, mp2.html, ep1.html, ep2.html, EasterVigil.html);
// every prayer is compared word for word with them, and the build stops on a
// difference that isn't settled below. Rite One and Rite Two forms of each
// office prayer are paired by heading (the collects) or by place (the prayers
// for mission).

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join as joinPath } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const out = opt('--out', fileURLToPath(new URL('../js/data/office.js', import.meta.url)));
const checkDir = opt('--check', null);
const [mp1, mp2, ep1, ep2, special] = args;
if (!special) {
  console.error('Usage: node scripts/build-office.mjs mp1.pdf mp2.pdf ep1.pdf ep2.pdf SpecialDays.pdf [--check dir] [--out js/data/office.js]');
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
  return lines.map((l) => ({
    ...l,
    text: l.runs.map((r) => r.s).join('').replace(/\s+/g, ' ').trim(),
    size: l.runs.find((r) => r.s.trim())?.size || 12,
    italic: l.runs.every((r) => r.italic || !r.s.trim()),
    bold: l.runs.some((r) => r.bold && r.s.trim()),
  })).filter((l) => l.text);
}

// A word broken at the end of a line is joined up again ("every-" "where"),
// but a word that is hyphenated anyway keeps it ("only-begotten"; the PDFs
// print those with a non-breaking hyphen).
const COMPOUND = /(only|well|ever|never|life|all|self|God)-$/;
function join(text, line) {
  if (!text) return line;
  if (/‑$/.test(text)) return text.slice(0, -1) + '-' + line;
  if (/[a-z]-$/.test(text) && /^[a-z]/.test(line) && !COMPOUND.test(text)) return text.slice(0, -1) + line;
  return text.endsWith('-') ? text + line : `${text} ${line}`;
}

const clean = (s) => s.replace(/‑/g, '-').replace(/'/g, '’').replace(/\s+([.,;:])/g, '$1').replace(/\s+/g, ' ').trim();

/** The page number from a running head such as "Morning Prayer II 99" or "100 Easter Vigil". */
function pageOf(l, name) {
  if (l.y >= 62) return null;
  const m = l.text.match(new RegExp(`^(\\d+)?\\s*${name}\\s*(\\d+)?$`));
  return m ? Number(m[1] || m[2]) : null;
}

/** An office's collects (by heading) and prayers for mission (in order). */
function office(lines, name) {
  const collects = [];
  const missions = [];
  let started = false;
  let mission = false;
  let cur = null;
  let page = null;
  for (const l of lines) {
    const p = pageOf(l, name);
    if (p) { page = p; continue; }
    if (!started) {
      if (l.size <= 10 && /^The Officiant then says one or more of the following Collects/.test(l.text)) started = true;
      continue;
    }
    if (l.size <= 10 && !l.bold) {
      if (/^Here may be sung a hymn or anthem/.test(l.text)) break;
      if (/^Then, unless the Eucharist/.test(l.text)) mission = true;
      cur = null; // "or this", "or the following", and other directions
      continue;
    }
    if (l.italic) {
      if (/^Amen\.?$/.test(l.text) && cur) { cur.text = `${cur.text} Amen.`; cur.done = true; continue; }
      if (/^A Collect for /.test(l.text)) { cur = { title: l.text, page, text: '' }; collects.push(cur); }
      continue;
    }
    if (mission && (!cur || cur.done)) { cur = { title: null, page, text: '' }; missions.push(cur); }
    if (!cur || cur.done) continue;
    cur.text = join(cur.text, l.text);
    if (/Amen\.?$/.test(l.text)) cur.done = true;
  }
  for (const x of [...collects, ...missions]) {
    x.text = clean(x.text);
    if (!/Amen\.$/.test(x.text)) throw new Error(`${name}: ${x.title || x.text.slice(0, 40)} doesn’t end with Amen.`);
  }
  return { collects, missions };
}

/** The Great Vigil's prayers: the Paschal Candle, each Lesson's Collect, and the Collects at the Eucharist. */
function vigil(lines) {
  const prayers = [];
  let started = false;
  let page = null;
  let want = null; // what the next prayer is
  let cur = null;
  let afterLesson = false;
  for (const l of lines) {
    const p = pageOf(l, 'Easter Vigil');
    if (p) { page = p; continue; }
    if (!started) { if (l.size >= 24 && l.text === 'The Great Vigil of Easter') started = true; continue; }
    if (l.size <= 10 && !l.bold) {
      if (/^The Celebrant may say the following prayer/.test(l.text)) want = { id: 'candle', title: 'The Lighting of the Paschal Candle' };
      else if (/^The Celebrant says one of the following Collects/.test(l.text)) want = { id: 'eucharist', title: 'At the Eucharist', or: [] };
      else if (/^or this$/.test(l.text) && cur?.id === 'eucharist') { cur.or.push(l.text); cur.texts.push(''); cur.done = false; }
      if (cur && cur.done && cur.id !== 'eucharist') cur = null;
      continue;
    }
    if (l.bold && l.size <= 10) { want = { id: null, title: l.text }; afterLesson = true; continue; } // a Lesson's heading
    if (want && !cur && /^Let us pray\./.test(l.text)) continue;
    if (l.italic) {
      if (/^Amen\.?$/.test(l.text) && cur) { cur.texts[cur.texts.length - 1] += ' Amen.'; cur.done = true; }
      continue;
    }
    if (want && !cur) {
      if (afterLesson && l.size !== 12) continue; // the Lesson's citation and Psalm
      cur = { ...want, page, texts: [''], or: want.or || [] };
      prayers.push(cur);
      want = null;
      afterLesson = false;
    }
    if (!cur || cur.done) continue;
    cur.texts[cur.texts.length - 1] = join(cur.texts[cur.texts.length - 1], l.text);
    if (/Amen\.?$/.test(l.text)) cur.done = true;
    if (cur.id === 'eucharist' && cur.done && cur.texts.length === 2) break;
  }
  return prayers.map((x) => ({ ...x, texts: x.texts.map(clean) }));
}

// ---------- read the books ----------

const MP1 = office(await readLines(mp1), 'Morning Prayer I');
const MP2 = office(await readLines(mp2), 'Morning Prayer II');
const EP1 = office(await readLines(ep1), 'Evening Prayer I');
const EP2 = office(await readLines(ep2), 'Evening Prayer II');
const VIGIL = vigil(await readLines(special));

const problems = [];
const slug = (s) => s.toLowerCase().replace(/’/g, '').replace(/^a collect for (the )?/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const titleCase = (s) => s.replace(/(^|\s)([a-z])/g, (m, sp, c) => sp + c.toUpperCase())
  .replace(/\s(And|Of|The|At|In|A|To|For|By|On)(?=\s)/g, (m, w) => ` ${w.toLowerCase()}`);

const MISSION = {
  'mp-mission-1': 'Almighty and everlasting God, by whose Spirit',
  'mp-mission-2': 'O God, you have made of one blood',
  'mp-mission-3': 'Lord Jesus Christ, you stretched out your arms',
  'ep-mission-1': 'O God and Father of all',
  'ep-mission-2': 'Keep watch, dear Lord',
  'ep-mission-3': 'O God, you manifest in your servants',
};
// The Vigil's Lessons, by their headings as printed.
const LESSONS = {
  'The story of Creation': 'creation',
  'The Flood': 'flood',
  'Abraham’s sacrifice of Isaac': 'abraham',
  'Israel’s deliverance at the Red Sea': 'red-sea',
  'God’s Presence in a renewed Israel': 'renewed-israel',
  'Salvation offered freely to all': 'salvation',
  'A new heart and a new spirit': 'new-heart',
  'The valley of dry bones': 'dry-bones',
  'The gathering of God’s people': 'gathering',
};

function pairOffice(prefix, section, one, two) {
  const out = [];
  if (one.collects.length !== two.collects.length) problems.push(`${section}: ${one.collects.length} collects in Rite One, ${two.collects.length} in Rite Two`);
  for (const c2 of two.collects) {
    const c1 = one.collects.find((c) => c.title === c2.title);
    if (!c1) problems.push(`${section}: no Rite One form of ${c2.title}`);
    out.push({ id: `${prefix}-${slug(c2.title)}`, kind: 'prayer', section, title: c2.title, pages: { traditional: c1?.page, contemporary: c2.page }, traditional: c1?.text, contemporary: c2.text });
  }
  if (one.missions.length !== 3 || two.missions.length !== 3) problems.push(`${section}: ${one.missions.length} and ${two.missions.length} prayers for mission`);
  two.missions.forEach((m2, k) => {
    const m1 = one.missions[k];
    const id = `${prefix}-mission-${k + 1}`;
    // Called by their first words, as the Prayer Book gives them no heading.
    const first = MISSION[id];
    if (!m2.text.startsWith(first)) problems.push(`${id} begins “${m2.text.slice(0, 40)}”, not “${first}”`);
    out.push({ id, kind: 'prayer', section, title: `For Mission: ${first}`, pages: { traditional: m1?.page, contemporary: m2.page }, traditional: m1?.text, contemporary: m2.text });
  });
  return out;
}

const prayers = [
  ...VIGIL.map((v) => ({
    id: `vigil-${v.id || LESSONS[clean(v.title)] || slug(v.title)}`,
    kind: 'prayer',
    section: 'From the Great Vigil of Easter',
    title: `The Great Vigil: ${v.id ? v.title : titleCase(v.title)}`,
    page: v.page,
    text: v.texts.map((t, i) => (i ? `*${v.or[i - 1]}*\n${t}` : t)).join('\n'),
  })),
  ...pairOffice('mp', 'From Morning Prayer', MP1, MP2),
  ...pairOffice('ep', 'From Evening Prayer', EP1, EP2),
];

// The prayer from the Vigil the app already had keeps its id, so lists that open with it are unchanged.
const abraham = prayers.find((p) => p.id === 'vigil-abraham');
if (abraham) abraham.id = 'vigil';
else problems.push('The Vigil’s Collect after Abraham’s sacrifice of Isaac wasn’t found');
if (VIGIL.length !== 11) problems.push(`The Vigil: ${VIGIL.length} prayers, not 11`);
for (const v of VIGIL) if (!v.id && !LESSONS[clean(v.title)]) problems.push(`The Vigil: a Lesson headed “${v.title}”`);

// ---------- check them against the Online Book of Common Prayer ----------

// The other copy differs, and the Prayer Book's own pages above are right:
const SETTLED = {
  // "through Jesus Christ your Son our Lord", as in the Collect for Monday in
  // Holy Week it is taken from (page 220); the web page leaves out "your Son".
  'mp-fridays/contemporary': 'Almighty God, whose most dear Son went not up to joy but first he suffered pain, and entered not into glory before he was crucified: Mercifully grant that we, walking in the way of the cross, may find it none other than the way of life and peace; through Jesus Christ our Lord. Amen.',
};

if (checkDir) {
  const words = (s) => s.toLowerCase().replace(/&nbsp;/g, ' ').replace(/[‘’'`]/g, '’').replace(/-\s*<br\s*\/?>\s*/g, '').replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#?\w+;/g, ' ').replace(/[^a-z0-9’]+/g, ' ').replace(/\s+/g, ' ').trim();
  const pages = {};
  for (const [key, file] of [['mp1', 'mp1.html'], ['mp2', 'mp2.html'], ['ep1', 'ep1.html'], ['ep2', 'ep2.html'], ['vigil', 'EasterVigil.html']]) {
    pages[key] = words(await readFile(joinPath(checkDir, file), 'utf8'));
  }
  const where = (p, rite) => (p.section === 'From the Great Vigil of Easter' ? 'vigil' : `${p.id.slice(0, 2)}${rite === 'traditional' ? 1 : 2}`);
  let checked = 0;
  for (const p of prayers) {
    for (const rite of p.text != null ? ['text'] : ['traditional', 'contemporary']) {
      for (const part of String(p[rite]).split(/\n\*[^*]+\*\n/)) {
        checked++;
        const page = pages[where(p, rite)];
        const w = words(part.replace(/-/g, ' - ').replace(/ - /g, ''));
        if (page.includes(w)) continue;
        if (page.includes(words(SETTLED[`${p.id}/${rite}`] || '\u0000'))) continue;
        problems.push(`${p.id} (${rite}) differs from the Online Book of Common Prayer: ${part}`);
      }
    }
  }
  console.log(`${checked} prayers checked against the Online Book of Common Prayer`);
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const banner = `// More of the Book of Common Prayer's prayers for the library: the Collects
// and prayers for mission of Morning and Evening Prayer, in Rite One and Rite
// Two, and the prayers of the Great Vigil of Easter, exactly as printed.
// Built by scripts/build-office.mjs from the PDFs of the Prayer Book formatted
// by Satucket Software (satucket.com), and checked against the Online Book of
// Common Prayer; don't edit it by hand.
`;
await writeFile(out, `${banner}\nexport default {\n  prayers: [\n${prayers.map((p) => `    ${JSON.stringify(p)},`).join('\n')}\n  ],\n};\n`);
console.log(`${prayers.length} prayers → ${out}`);
for (const p of prayers) console.log(`  ${p.id.padEnd(24)} ${p.title}`);
