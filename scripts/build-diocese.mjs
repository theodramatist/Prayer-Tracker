// Builds the Episcopal Diocese of Wisconsin's cycles for the app (js/data/diocese.js):
//
//   node scripts/build-diocese.mjs path/to/2026DailyCycleofPrayer.pdf [--report report.md]
//
// - A monthly cycle of every church in the diocese's 2026 Sunday-by-Sunday cycle
//   (transcribed below), each with the clergy the daily cycle names for it.
//   Parishes are spread over days 1–28, in the Sunday cycle's order, so every
//   month includes every church; companion churches and diocese-wide petitions
//   take days 29–31 (which fold into the last day of a shorter month).
// - The daily clergy cycle itself, one entry per date, read from its PDF.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pdfToText } from '../js/pdf.js';
import { parseDated } from '../js/importer.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : fallback;
};
const out = opt('--out', fileURLToPath(new URL('../js/data/diocese.js', import.meta.url)));
const reportPath = opt('--report', null);
const pdfPath = args[0];
if (!pdfPath) {
  console.error('Usage: node scripts/build-diocese.mjs path/to/DailyCycleofPrayer.pdf [--report report.md]');
  process.exit(1);
}

// ---------- the 2026 Sunday-by-Sunday cycle ----------
// p(name, town): a church. x(text): a companion church, religious order or
// diocese-wide petition. Seasonal petitions and feasts are kept for the report
// only. `fix` notes a spelling corrected from the source.
const p = (name, town, o = {}) => ({ kind: 'parish', name, town, ...o });
const x = (text, o = {}) => ({ kind: 'extra', text, ...o });
const seasonal = (text) => ({ kind: 'seasonal', text });
const feast = (text) => ({ kind: 'feast', text });

const SUNDAYS = [
  ['2026-01-04', [p('Trinity', 'Mineral Point'), p('Ascension', 'Merrill')]],
  ['2026-01-06', [feast('Epiphany'), p('St. Paul’s Cathedral', 'Fond du Lac'), p('St. John’s', 'Sparta')]],
  ['2026-01-11', [p('St. Andrew’s', 'Monroe'), p('St. Mark’s', 'Milwaukee')]],
  ['2026-01-18', [p('Christ Church', 'Delavan', { fix: 'Delevan' }), p('St. James', 'West Bend')]],
  ['2026-01-25', [p('St. Anskar’s', 'Hartland'), p('St. Aiden’s', 'Hartford')]],
  ['2026-02-01', [p('St. John Chrysostom', 'Delafield', { match: /st johns? (chrysostom )?delafield/ }), p('St. Barnabas', 'Suamico')]],
  ['2026-02-08', [p('St. Barnabas', 'Richland Center'), p('St. Mary’s', 'Dousman'),
    x('St. Marc Episcopal Church and School, Jeanette, Haiti', { match: /st marcs? .*jeanette/ })]],
  ['2026-02-15', [p('St. Matthias', 'Waukesha'), p('St. Peter’s', 'Fort Atkinson')]],
  ['2026-02-22', [p('Trinity', 'Wauwatosa'), p('All Saints', 'Appleton')]],
  ['2026-03-01', [p('St. Simon the Fisherman', 'Port Washington', { match: /st simon(s| the fisherman)? port washington/ }), p('St. Paul’s', 'Ashippun')]],
  ['2026-03-08', [p('St. Peter’s', 'North Lake'), p('Precious Blood', 'Gardner')]],
  ['2026-03-15', [p('St. Paul’s', 'Watertown'), x('The parishes of the Diocese of Masvingo, Zimbabwe', { match: /masvingo/ })]],
  ['2026-03-22', [p('St. Paul’s', 'Marinette'), p('St. Luke’s', 'Bayview')]],
  ['2026-03-29', [feast('Palm Sunday'), p('St. Francis', 'Menomonee Falls')]],
  ['2026-04-05', [feast('Easter Sunday')]],
  ['2026-04-12', [p('St. Andrew’s', 'Madison'), p('St. Boniface', 'Mequon', { match: /st boniface mec?quon/ }), p('St. Alban’s', 'Spooner', { benefice: true })]],
  ['2026-04-19', [p('St. Matthew’s', 'Kenosha'), p('St. Ambrose', 'Antigo')]],
  ['2026-04-26', [p('St. Christopher’s', 'River Hills'), p('St. Luke’s', 'Racine'), p('St. Luke’s', 'Springbrook', { benefice: true })]],
  ['2026-05-03', [p('St. Paul’s', 'Beloit'), p('Trinity', 'Janesville')]],
  ['2026-05-10', [p('Ascension', 'Hayward', { benefice: true }), x('The Sisters of St. Mary, Diocese of Newala, Tanzania', { match: /newala/ })]],
  ['2026-05-17', [p('Grace', 'Menomonie'), p('St. Anne’s', 'De Pere')]],
  ['2026-05-24', [feast('Pentecost'), p('Christ Church Cathedral', 'Eau Claire', { match: /christ church (cathedral )?eau claire/ }), p('St. Thomas', 'Menasha')]],
  ['2026-05-31', [p('St. Paul’s', 'Milwaukee'), x('Those discerning a call to ordained ministry or mission work')]],
  ['2026-06-07', [p('St. Barnabas', 'Clear Lake'), p('St. Michael’s', 'Racine')]],
  ['2026-06-14', [p('St. Katherine’s', 'Owen'), seasonal('Campers and staff attending EpiscoWisco Summer Camp')]],
  ['2026-06-21', [p('All Saints Cathedral', 'Milwaukee'), p('Grace', 'Sheboygan'), p('St. Alban’s', 'Superior')]],
  ['2026-06-28', [p('Christ Church', 'La Crosse'), p('Trinity', 'Oshkosh'), x('St. Marc Episcopal School, Jeanette, Haiti', { merge: 0 })]],
  ['2026-07-05', [p('St. John’s', 'Shawano'), p('St. Luke’s', 'Sister Bay'), p('Grace', 'Rice Lake', { benefice: true })]],
  ['2026-07-12', [p('Trinity', 'Platteville'), p('Zion', 'Oconomowoc')]],
  ['2026-07-19', [p('St. Matthias', 'Minocqua'), p('St. Simeon’s', 'Chippewa Falls'), p('St. Mark’s', 'Waupaca')]],
  ['2026-07-26', [p('All Saints Chapel', 'Elkhart Lake'), p('St. John’s', 'Wisconsin Rapids'), p('St. Peter’s', 'West Allis')]],
  ['2026-08-02', [p('St. Agnes', 'Algoma'), x('The Order of Julian of Norwich', { match: /\bojn\b/ })]],
  ['2026-08-09', [p('St. Olaf’s', 'Amherst'), p('St. Augustine’s', 'Rhinelander', { match: /st augustines? rhinelander/ })]],
  ['2026-08-16', [x('Ecumenical relationships, especially the Evangelical Lutheran Church in America and the Moravian Church')]],
  ['2026-08-23', [p('St. Francis', 'Eagle River'), p('St. Mark’s', 'Beaver Dam')]],
  ['2026-08-30', [p('Atonement', 'Fish Creek'), x('St. Francis House Student Center, UW–Madison, and all campus ministers', { match: /st francis (house )?student center/ })]],
  ['2026-09-06', [p('Christ Church', 'Bayfield'), p('St. Luke’s', 'Madison')]],
  ['2026-09-13', [p('Christ Church', 'Chippewa Falls'), p('Holy Cross', 'Wisconsin Dells', { match: /holy cross (wi|wisconsin) dells/ })]],
  ['2026-09-20', [p('St. Thomas', 'Greendale'), p('St. James', 'Manitowoc')]],
  ['2026-09-27', [p('Christ Church', 'Whitefish Bay'), seasonal('Clergy and lay deputies attending Diocesan Convention')]],
  ['2026-10-04', [p('St. John’s', 'Wausau'), seasonal('Those preparing for the Walsingham Pilgrimage at Grace, Sheboygan')]],
  ['2026-10-11', [p('St. John’s', 'New London'), p('Holy Communion', 'Lake Geneva'), x('Non-parochial priests and deacons of the diocese')]],
  ['2026-10-18', [p('St. Mary’s', 'Tomah'), p('Holy Apostles', 'Oneida')]],
  ['2026-10-25', [p('St. Peter’s', 'Sheboygan Falls'), p('St. Mark’s', 'South Milwaukee')]],
  ['2026-11-01', [p('St. Paul’s', 'Plymouth'), p('Holy Trinity', 'Prairie du Chien')]],
  ['2026-11-08', [p('St. John’s', 'Burlington'), p('Grace', 'Madison')]],
  ['2026-11-15', [p('St. Paul’s', 'Hudson'), p('St. Bartholomew’s', 'Pewaukee', { fix: 'Bartholowmew’s' })]],
  ['2026-11-22', [p('St. John’s', 'Elkhorn'), p('St. Peter’s', 'Ripon')]],
  ['2026-11-29', [feast('Advent 1'), p('Holy Trinity', 'Waupun'), p('St. Thomas and St. John’s', 'New Richmond', { match: /st thomas (and )?(st )?johns? new richmond/ })]],
  ['2026-12-06', [p('Trinity', 'Baraboo'), p('St. Dunstan’s', 'Madison')]],
  ['2026-12-13', [p('Christ the King, Sturgeon Bay, and Holy Nativity', 'Jacksonport', { match: /christ the king|holy nativity/ })]],
  ['2026-12-20', [p('Beloved Community', 'Stevens Point'), p('St. Alban’s', 'Sussex')]],
  ['2026-12-25', [feast('Christmas')]],
  ['2026-12-27', [p('Good Shepherd', 'Sun Prairie'), x('Those discerning a call to ordained ministry or mission work', { merge: 'discerning' })]],
];

// Clergy listings the matcher can't place by name and town.
const PLACE = {
  '2026-03-06': { church: 'Trinity, Wauwatosa', printed: 'Trinity, Wausau', why: 'The daily cycle says “Trinity, Wausau”; Gary Manning is rector of Trinity, Wauwatosa, and there is no Trinity in Wausau in the cycle.' },
};
const BENEFICE = /northern highlands? benefice/;

// ---------- matching ----------

const norm = (s) => String(s).toLowerCase().replace(/[’']/g, '').replace(/\bsaint\b/g, 'st').replace(/\bsts\b/g, 'st')
  .replace(/[.,;:()/&–-]+/g, ' ').replace(/\s+/g, ' ').trim();
// "St. Paul's Cathedral" → /\bpauls? cathedrals? fond du lac\b/: each word may take a possessive s.
const pattern = (name, town) => new RegExp(`\\b${norm(name).replace(/^st /, '').split(' ').map((w) => `${w.replace(/s$/, '')}s?`).join(' ')} ${norm(town)}\\b`);

const ROLE_ORDER = ['Bishop', 'Dean', '(Bishop) Interim', 'Interim', 'Rector', 'Priest-in-Charge', 'Associate Rector', 'Associate Priest',
  'Associate', 'Assisting Priest', 'Long-term supply', 'Supply', 'Priest Chaplain', 'Priest', 'Deacon'];
const rank = (role) => {
  const i = ROLE_ORDER.findIndex((r) => role.startsWith(r));
  return i < 0 ? ROLE_ORDER.length : i;
};

const text = await pdfToText(new File([await readFile(pdfPath)], 'daily.pdf', { type: 'application/pdf' }));
const daily = parseDated(text, { defaultYear: 2026 }).entries;

// Churches and other entries in Sunday order, merging repeats.
const entries = [];
for (const [sunday, items] of SUNDAYS) {
  for (const it of items) {
    if (it.kind === 'parish') entries.push({ ...it, sunday, text: `${it.name}, ${it.town}`, clergy: [] });
    else if (it.kind === 'extra' && it.merge == null) entries.push({ ...it, sunday, clergy: [] });
  }
}
const parishes = entries.filter((e) => e.kind === 'parish');
const extras = entries.filter((e) => e.kind === 'extra');

const placed = new Set();
const unplaced = [];
for (const d of daily) {
  if (!d.note) continue;
  const role = d.note.split(',')[0].trim();
  const hay = norm(d.note);
  const hayAll = norm(`${d.text} ${d.note}`); // "Hilary Crupi, OJN": the order is in the name
  let targets = [];
  if (PLACE[d.date]) targets = entries.filter((e) => e.text === PLACE[d.date].church);
  else if (BENEFICE.test(hay)) targets = parishes.filter((e) => e.benefice);
  else {
    targets = entries.filter((e) => {
      if (e.match) return e.match.test(hayAll);
      if (e.kind !== 'parish') return false;
      return pattern(e.name, e.town).test(hay);
    });
  }
  if (!targets.length) {
    // Listed with a place (beyond "canonically resident") that isn't in the Sunday cycle.
    const place = d.note.split(',').slice(1).join(',').trim();
    if (place && !/^canonically resident$/i.test(place) && /rector|priest-in-charge|deacon|supply|associate|assisting|dean|interim|chaplain/i.test(role)) unplaced.push(d);
    continue;
  }
  for (const t of targets) {
    t.clergy.push({ name: d.text, role, date: d.date, benefice: BENEFICE.test(hay), corrected: PLACE[d.date]?.why });
  }
  placed.add(d.date);
}

const clergyNote = (e) => {
  const list = [...e.clergy]
    .sort((a, b) => rank(a.role) - rank(b.role) || a.date.localeCompare(b.date))
    .map((c) => `${c.name}, ${c.role}`)
    .join(' · ');
  return list && e.clergy.every((c) => c.benefice) ? `Northern Highlands Benefice: ${list}` : list;
};

// Spread the parishes evenly over days 1–28, keeping their order; the rest on 29–31.
const monthly = [];
const spread = (list, firstDay, days) => {
  let start = 0;
  for (let k = 0; k < days; k++) {
    const end = start + Math.round((list.length - start) / (days - k));
    for (const e of list.slice(start, end)) {
      const note = clergyNote(e);
      monthly.push(note ? { day: firstDay + k, text: e.text, note } : { day: firstDay + k, text: e.text });
    }
    start = end;
  }
};
spread(parishes, 1, 28);
spread(extras, 29, 3);

// The daily cycle as printed, with the same corrections.
const dailyOut = daily.map((d) => {
  const fix = PLACE[d.date];
  const note = fix?.printed && d.note ? d.note.replace(fix.printed, fix.church) : d.note;
  return note ? { date: d.date, text: d.text, note } : { date: d.date, text: d.text };
});

const data = {
  id: 'wis2026',
  diocese: 'The Episcopal Diocese of Wisconsin',
  // Fixed so a second synced device seeding the same entries never undoes your edits.
  updated: Date.parse('2026-11-03T00:00:00Z'),
  monthly,
  daily: dailyOut,
};

const rows = (arr) => arr.map((e) => `    ${JSON.stringify(e)},`).join('\n');
await writeFile(out, `// The Episcopal Diocese of Wisconsin's cycles of prayer, built by
// scripts/build-diocese.mjs from the diocese's 2026 Sunday-by-Sunday cycle and
// its 2026 Daily Cycle of Prayer. On first use the app copies them into your
// Diocesan Cycle and Diocesan Daily Cycle lists, where they can be edited.
export default {
  id: ${JSON.stringify(data.id)},
  diocese: ${JSON.stringify(data.diocese)},
  updated: ${data.updated},
  // A church for each day of the month (days 1–28: parishes; 29–31: companions and petitions).
  monthly: [
${rows(monthly)}
  ],
  // The clergy and others prayed for on each date of 2026.
  daily: [
${rows(dailyOut)}
  ],
};
`);

// ---------- report ----------
const lines = [];
lines.push(`# Diocese of Wisconsin: monthly cycle check`, '');
lines.push(`- Churches from the Sunday cycle: **${parishes.length}**, each on exactly one day of the month (days 1–28).`);
lines.push(`- Companion churches and diocese-wide petitions: **${extras.length}** (days 29–31).`);
lines.push(`- Churches with clergy named in the daily cycle: **${parishes.filter((e) => e.clergy.length).length}**; without: **${parishes.filter((e) => !e.clergy.length).length}**.`);
lines.push(`- Daily-cycle dates: **${daily.length}**.`, '');
lines.push('## The monthly cycle', '', '| Day | Church | Clergy (from the daily cycle) |', '| --- | --- | --- |');
for (const m of monthly) lines.push(`| ${m.day} | ${m.text} | ${m.note || '—'} |`);
lines.push('', '## Churches with no clergy named in the daily cycle', '');
for (const e of parishes.filter((x2) => !x2.clergy.length)) lines.push(`- ${e.text}`);
lines.push('', '## Clergy placed by judgment', '');
lines.push('- The Northern Highlands Benefice clergy are attached to its four parishes (Ascension, Hayward; Grace, Rice Lake; St. Alban’s, Spooner; St. Luke’s, Springbrook).');
for (const [date, pl] of Object.entries(PLACE)) lines.push(`- ${date}: ${pl.why}`);
lines.push('', '## Clergy listed with a church or ministry not in the Sunday cycle', '');
for (const d of unplaced) lines.push(`- ${d.date}: ${d.text}, ${d.note}`);
const blank = daily.filter((d) => !d.note && !/members|team|staff|vestry|warden|missioner|deputies|commission|board/i.test(d.text));
lines.push('', '## Daily-cycle entries to check', '');
for (const d of blank) lines.push(`- ${d.date}: “${d.text}”`);
lines.push('', '## Left out of the monthly cycle', '');
for (const [sunday, items] of SUNDAYS) for (const it of items) if (it.kind === 'feast' || it.kind === 'seasonal') lines.push(`- ${sunday}: ${it.text} (${it.kind === 'feast' ? 'a feast, not a church' : 'seasonal'})`);
lines.push('', '## Spellings corrected from the Sunday cycle', '');
for (const e of parishes.filter((x2) => x2.fix)) lines.push(`- ${e.fix} → ${e.text}`);
const report = lines.join('\n');
if (reportPath) await writeFile(reportPath, `${report}\n`);

console.log(`${parishes.length} churches + ${extras.length} others over 31 days; ${monthly.length} monthly entries; ${daily.length} daily entries.`);
console.log(`Clergy placed from ${placed.size} daily entries; ${unplaced.length} listed with a church not in the Sunday cycle.`);
console.log(`Churches without clergy: ${parishes.filter((e) => !e.clergy.length).map((e) => e.text).join('; ')}`);
console.log(`Wrote ${out}${reportPath ? ` and ${reportPath}` : ''}`);
