// End-to-end tests: drives the real app in Chromium on a phone-sized screen.
// `npm run test:e2e` — screenshots go to tests/e2e/output/.
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../scripts/serve.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const OUT = fileURLToPath(new URL('./output/', import.meta.url));
await mkdir(OUT, { recursive: true });

const PORT = 8000 + Math.floor(Math.random() * 900);
const BASE = `http://localhost:${PORT}/`;
const server = await startServer(PORT);
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'en-US',
  timezoneId: 'America/New_York',
  acceptDownloads: true,
});
let page = await context.newPage();
await page.clock.setFixedTime(new Date('2026-11-02T09:00:00-05:00')); // Monday

const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function eventually(fn, timeout = 4000) {
  const start = Date.now();
  for (;;) {
    try { return await fn(); } catch (e) {
      if (Date.now() - start > timeout) throw e;
      await sleep(100);
    }
  }
}
const texts = async (sel) => (await page.locator(sel).allInnerTexts()).map((t) => t.trim());
const shot = (name) => page.screenshot({ path: `${OUT}${name}.png` });

let passed = 0;
async function step(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.log(`  ✗ ${name}\n${e.stack || e}`);
    await shot(`FAILED-${name.replace(/\W+/g, '-')}`).catch(() => {});
    await browser.close();
    server.close();
    process.exit(1);
  }
}

async function quickAdd(text, { list, duration } = {}) {
  await page.click('.tab-add');
  const sheet = page.locator('.sheet-add');
  await sheet.waitFor();
  await sheet.locator('textarea.add-text').fill(text);
  if (list) await sheet.locator('.chips-lists .chip', { hasText: list }).click();
  if (duration) await sheet.locator('.chip', { hasText: duration }).first().click();
  await sheet.locator('button[type=submit]').click();
  await page.locator('.sheet-add').waitFor({ state: 'detached' });
}

async function openList(id) {
  await page.click('.tabbar a[href="#/lists"]');
  await page.locator('a.list-card').first().waitFor();
  await page.click(`a.list-card[href="#/list/${id}"]`);
  await page.locator('.list-title h1').waitFor();
}

async function pasteInto(id, text, { choose } = {}) {
  await openList(id);
  await page.locator('.toolbar button', { hasText: /Paste a list|Add the cycle|Load a newer cycle/ }).click();
  const sheet = page.locator('.sheet-import');
  await sheet.waitFor();
  await sheet.locator('textarea.import-text').fill(text);
  if (choose) for (const label of choose) await sheet.locator('.chip', { hasText: label }).first().click();
  await eventually(async () => assert.ok(await sheet.locator('.preview-summary').isVisible()));
  return sheet;
}

const heading = () => page.locator('.day-head h1').getAttribute('aria-label');

async function goToday() {
  await page.click('.tabbar a[href="#/"]');
  await page.locator('.day-head h1').waitFor();
}

console.log('Prayer Tracker end-to-end\n Part 1: lists, cycles, check-offs, backup, offline');

await step('first run: the Anglican Cycle is built in, the diocese’s cycles are filled in, Trinity asks to be set up', async () => {
  await page.goto(BASE);
  await page.locator('.day-head h1').waitFor();
  assert.equal(await heading(), 'Monday, November 2');
  assert.equal(await page.locator('.feast').innerText(), 'Season after Pentecost');
  assert.deepEqual(await texts('.group[data-list=anglican] .item-text'), ['The Diocese of Carlisle']);
  assert.deepEqual(await texts('.group[data-list=anglican] .item-note'), ['The Church of England']);
  // The 2nd of the month in the diocese's monthly cycle, with each church's clergy.
  assert.equal(await page.locator('.group[data-list=diocese] .group-label').innerText(), 'DAY 2');
  assert.deepEqual(await texts('.group[data-list=diocese] .item-text'), ['St. John’s, Sparta', 'St. Andrew’s, Monroe', 'St. Mark’s, Milwaukee']);
  assert.deepEqual(await texts('.group[data-list=diocese] .item-note'), [
    'Kathleen Charles, Long-term supply · Janet Leigh Sterken, Deacon',
    'Don Fleischman, Priest-in-Charge · John Hickey, Associate · Michelle Mooney, Deacon']);
  assert.deepEqual(await texts('.group[data-list=diocese-daily] .item-text'), ['Esther Kramer']);
  assert.deepEqual(await texts('.group[data-list=diocese-daily] .item-note'), ['Rector, St. Aiden’s, Hartford']);
  assert.equal(await page.locator('.group[data-list=diocese-daily] .prayer-title').innerText(), 'FOR CLERGY AND PEOPLE');
  assert.deepEqual(await texts('.setup-card h2'), ['Trinity']);
  await shot('01-first-run');
});

await step('quick add a request for one week', async () => {
  await quickAdd('Jane Doe – surgery Thursday', { list: 'Prayer Requests', duration: '1 week' });
  await eventually(async () => assert.match(await page.locator('.toast.show').innerText(), /Added “Jane Doe – surgery Thursday” to Prayer Requests until Nov 8/));
  assert.deepEqual(await texts('.group[data-list=requests] .item-text'), ['Jane Doe – surgery Thursday']);
  assert.deepEqual(await texts('.group[data-list=requests] .badge'), ['Until Nov 8']);
});

await step('several lines at once become several entries', async () => {
  await quickAdd('Mom\nDad\nAunt Sue', { list: 'Family' });
  assert.deepEqual(await texts('.group[data-list=family] .item-text'), ['Mom', 'Dad', 'Aunt Sue']);
});

await step('the add sheet remembers the last list and its duration', async () => {
  await page.click('.tab-add');
  const sheet = page.locator('.sheet-add');
  await sheet.waitFor();
  assert.equal(await sheet.locator('.chips-lists .chip.on').innerText(), 'Family');
  await sheet.locator('.chips-lists .chip', { hasText: 'Prayer Requests' }).click();
  assert.equal(await sheet.locator('.chip.on', { hasText: '1 week' }).count(), 1);
  await shot('02-add-sheet');
  await sheet.locator('.sheet-close').click();
  await sheet.waitFor({ state: 'detached' });
});

await step('checking off makes an item disappear; undo brings it back', async () => {
  assert.equal(await page.locator('.progress-text').innerText(), '0 of 9 prayed');
  await page.locator('.item', { hasText: 'Mom' }).locator('.check').click();
  await eventually(async () => assert.deepEqual(await texts('.group[data-list=family] .item-text'), ['Dad', 'Aunt Sue']));
  assert.equal(await page.locator('.progress-text').innerText(), '1 of 9 prayed');
  await page.locator('.toast.show .toast-action').click();
  await eventually(async () => assert.deepEqual(await texts('.group[data-list=family] .item-text'), ['Mom', 'Dad', 'Aunt Sue']));
  await page.locator('.item', { hasText: 'Mom' }).locator('.check').click();
  await eventually(async () => assert.equal(await page.locator('.item', { hasText: 'Mom' }).count(), 0));
});

await step('"Show prayed" reveals checked items, which can be unchecked', async () => {
  await page.locator('.show-done button').click();
  assert.deepEqual(await texts('.items-done .item-text'), ['Mom']);
  await page.locator('.items-done .check').click();
  await eventually(async () => assert.equal(await page.locator('.items-done').count(), 0));
  await page.locator('.item', { hasText: 'Mom' }).locator('.check').click();
  await eventually(async () => assert.equal(await page.locator('.progress-text').innerText(), '1 of 9 prayed'));
});

await step('check-offs and items survive a reload', async () => {
  await page.reload();
  await page.locator('.day-head h1').waitFor();
  assert.equal(await page.locator('.progress-text').innerText(), '1 of 9 prayed');
  assert.deepEqual(await texts('.group[data-list=family] .item-text'), ['Dad', 'Aunt Sue']);
});

await step('the next day starts fresh; a one-week request ends on time', async () => {
  await page.click('button[aria-label="Next day"]');
  assert.equal(await heading(), 'Tuesday, November 3');
  assert.equal(await page.locator('.day-rel').innerText(), 'TOMORROW');
  assert.deepEqual(await texts('.group[data-list=family] .item-text'), ['Mom', 'Dad', 'Aunt Sue']);
  for (let i = 0; i < 5; i++) await page.click('button[aria-label="Next day"]');
  assert.equal(await heading(), 'Sunday, November 8');
  assert.deepEqual(await texts('.group[data-list=requests] .badge'), ['Last day']);
  await page.click('button[aria-label="Next day"]');
  assert.equal(await page.locator('.group[data-list=requests]').count(), 0);
  await page.click('.back-today');
  assert.equal(await heading(), 'Monday, November 2');
});

const TRINITY = `Sunday
Mary Adams
John & Sue Baker
Monday
Smith, Tom
Ann Zeller
Bob Carter
de la Cruz, Maria
Tuesday
Pat O'Brien
Lee Chen`;

await step('Trinity: paste names with day headers, sorted by last name', async () => {
  const sheet = await pasteInto('trinity', TRINITY);
  assert.equal(await sheet.locator('.preview-summary').innerText(), '8 names over 3 days');
  assert.doesNotMatch(await sheet.innerText(), /\b(null|undefined|false)\b/);
  await shot('03-import-trinity');
  await sheet.locator('button[type=submit]').click();
  await sheet.waitFor({ state: 'detached' });
  await goToday();
  // Monday's names are read at Morning Prayer as one list…
  assert.equal(await page.locator('.office-list[data-office=trinity] .group-label').innerText(), 'MONDAY');
  assert.deepEqual(await texts('.office-list[data-office=trinity] .office-names li'), ['Bob Carter', 'Maria de la Cruz', 'Tom Smith', 'Ann Zeller']);
  // …and everyone comes up every day in your own prayer.
  assert.equal(await page.locator('.group[data-list=trinity] .group-label').innerText(), 'EVERY DAY');
  assert.deepEqual(await texts('.group[data-list=trinity] .item-text'),
    ['Mary Adams', 'John & Sue Baker', 'Bob Carter', 'Lee Chen', 'Maria de la Cruz', "Pat O'Brien", 'Tom Smith', 'Ann Zeller']);
});

await step('Trinity: add "First Last" and it slots in by last name', async () => {
  await quickAdd('Grace Brown', { list: 'Trinity' });
  // The list is not spread A–Z yet, so the emptiest day in use is suggested
  // (Sunday and Tuesday tie at two names; the earlier day wins).
  await openList('trinity');
  assert.deepEqual(await page.locator('.detail-section', { hasText: 'Sunday' }).locator('.row-text').allInnerTexts(), ['Mary Adams', 'John & Sue Baker', 'Grace Brown']);
});

await step('Trinity: spread everyone over the week alphabetically', async () => {
  await page.locator('.toolbar button', { hasText: 'Spread over the week' }).click();
  const sheet = page.locator('.sheet-spread');
  await sheet.waitFor();
  // Monday to Friday unless chosen otherwise; add Saturday.
  assert.deepEqual(await texts('.sheet-spread .chip.on'), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  await sheet.locator('.chip', { hasText: 'Sat' }).click();
  const preview = await sheet.locator('.spread-preview li').allInnerTexts();
  assert.equal(preview.length, 6);
  await shot('04-spread');
  await sheet.locator('button[type=submit]').click();
  await sheet.waitFor({ state: 'detached' });
  assert.equal(await page.locator('.detail-section', { hasText: 'Sunday' }).locator('.row').count(), 0);
  const order = [];
  for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']) {
    order.push(...await page.locator('.detail-section', { hasText: day }).locator('.row-text').allInnerTexts());
  }
  assert.deepEqual(order, ['Mary Adams', 'John & Sue Baker', 'Grace Brown', 'Bob Carter', 'Lee Chen', 'Maria de la Cruz', "Pat O'Brien", 'Tom Smith', 'Ann Zeller']);
  await shot('05-trinity-list');
});

await step('Trinity: Morning Prayer reads the day’s list; your own prayer has everyone, kept separate', async () => {
  await goToday();
  const office = page.locator('.office-list[data-office=trinity]');
  assert.equal(await page.locator('.office .office-head').innerText(), 'MORNING PRAYER');
  assert.deepEqual(await texts('.office-list[data-office=trinity] .office-names li'), ['Mary Adams', 'John & Sue Baker']);
  assert.equal(await page.locator('.group[data-list=trinity] .item').count(), 9);
  await shot('05d-morning-prayer');
  // Praying for someone privately doesn't touch the Morning Prayer list…
  await page.locator('.group[data-list=trinity] .item', { hasText: 'Mary Adams' }).locator('.check').click();
  await eventually(async () => assert.equal(await page.locator('.group[data-list=trinity] .item', { hasText: 'Mary Adams' }).count(), 0));
  assert.deepEqual(await texts('.office-list[data-office=trinity] .office-names li'), ['Mary Adams', 'John & Sue Baker']);
  // …and marking the list prayed at Morning Prayer leaves everyone on it to pray for privately.
  await office.locator('.btn-office').click();
  await eventually(async () => assert.equal(await page.locator('.office-list[data-office=trinity]').count(), 0));
  assert.match(await page.locator('.toast.show').innerText(), /Trinity: prayed at Morning Prayer/);
  assert.equal(await page.locator('.group[data-list=trinity] .item', { hasText: 'John & Sue Baker' }).count(), 1);
  await page.locator('.toast.show .toast-action').click();
  await eventually(async () => assert.equal(await page.locator('.office-list[data-office=trinity]').count(), 1));
  // A name added to the list goes onto its Morning Prayer day, and into your prayer every day.
  await quickAdd('Zack Zimmer', { list: 'Trinity' });
  assert.equal(await page.locator('.group[data-list=trinity] .item', { hasText: 'Zack Zimmer' }).count(), 1);
  await page.evaluate(() => window.prayerTracker.setDate('2026-11-07'));
  assert.deepEqual(await texts('.office-list[data-office=trinity] .office-names li'), ['Ann Zeller', 'Zack Zimmer']);
  assert.equal(await page.locator('.office-list[data-office=trinity] .group-label').innerText(), 'SATURDAY');
  await page.evaluate(() => window.prayerTracker.setDate('2026-11-02'));
});

await step('a member directory (CSV) with preferred names is spread over Monday to Friday', async () => {
  await page.click('.tabbar a[href="#/lists"]');
  await page.locator('button', { hasText: 'New list' }).click();
  const make = page.locator('.sheet-list');
  await make.waitFor();
  await make.locator('input.input-lg').fill('Choir');
  await make.locator('.type-card', { hasText: 'Weekly' }).click();
  await make.locator('.chip', { hasText: 'Last name' }).click();
  await make.locator('button[type=submit]').click();
  await page.locator('.list-title h1', { hasText: 'Choir' }).waitFor();
  const csv = ['First Name,Preferred Name,Last Name', 'Katherine,Kate,Abbot', 'Robert,Bob,Abbot', 'Ann,,Brent', 'Carl,,Coyle',
    'Dorothy,Dot,Drury', 'Ed,,Esmond', 'Frances,Fran,Fenwick', 'Gail,,Garth', 'Hugh,,Halloran', 'Ivy,,Ingram', 'Ines,,Vale Moreno'].join('\r\n');
  await page.locator('.toolbar button', { hasText: 'Paste a list' }).click();
  const sheet = page.locator('.sheet-import');
  await sheet.waitFor();
  await sheet.locator('textarea.import-text').fill(csv);
  await eventually(async () => assert.equal(await sheet.locator('.preview-summary').innerText(), '11 names, spread over 5 days'));
  assert.equal(await sheet.locator('.chip.on', { hasText: 'Spread A–Z' }).count(), 1);
  assert.deepEqual(await texts('.sheet-import .chips-spread .chip.on'), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  assert.deepEqual(await texts('.sheet-import .spread-preview .preview-key'), ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
  await shot('05a-import-csv');
  await sheet.locator('button[type=submit]').click();
  await sheet.waitFor({ state: 'detached' });
  const day = (name) => page.locator('.detail-section', { hasText: name }).first().locator('.row-text').allInnerTexts();
  assert.deepEqual(await day('Monday'), ['Bob Abbot', 'Kate Abbot']); // preferred names, by last name then first
  assert.deepEqual(await day('Tuesday'), ['Ann Brent', 'Carl Coyle']);
  assert.deepEqual(await day('Sunday'), []);
  assert.deepEqual(await day('Saturday'), []);
  assert.deepEqual((await day('Friday')).slice(-1), ['Ines Vale Moreno']);
  // Remembered for next time.
  await page.locator('.toolbar button', { hasText: 'Spread over the week' }).click();
  assert.deepEqual(await texts('.sheet-spread .chip.on'), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  await page.locator('.sheet-spread .sheet-close').click();
  await page.locator('button[aria-label="List settings"]').click();
  await page.locator('.sheet-list .btn-danger').click();
  await page.locator('.sheet-confirm .btn-danger-fill').click();
  await page.locator('a.list-card').first().waitFor();
});

await step('Trinity: a new name is suggested for its alphabetical day', async () => {
  await page.click('.tab-add');
  const sheet = page.locator('.sheet-add');
  await sheet.waitFor();
  await sheet.locator('.chips-lists .chip', { hasText: 'Trinity' }).click();
  await sheet.locator('textarea.add-text').fill('Zoe Zwick');
  await eventually(async () => assert.match(await sheet.locator('.chips-days .chip.on').innerText(), /^Sat/));
  await sheet.locator('textarea.add-text').fill('Abe Aaronson');
  await eventually(async () => assert.match(await sheet.locator('.chips-days .chip.on').innerText(), /^Mon/));
  await sheet.locator('.sheet-close').click();
  await sheet.waitFor({ state: 'detached' });
});

const saints = ['Andrew', 'Barnabas', 'Christopher', 'David', 'Edmund', 'Francis', 'George', 'Hilda', 'Ignatius', 'James',
  'Katharine', 'Luke', 'Mark', 'Nicholas', 'Oswald', 'Paul', 'Quentin', 'Raphael', 'Stephen', 'Timothy', 'Ursula',
  'Vincent', 'Wilfrid', 'Xavier', 'Yolanda', 'Zita', 'Alban', 'Bede', 'Columba', 'Dunstan', 'Elizabeth'];
const DIOCESE = ['Diocesan Cycle of Prayer', ...saints.map((s, i) => `${i + 1}. St. ${s}’s, Town ${i + 1} — The Rev. Rector ${i + 1}`)].join('\n');

await step('Diocese: paste a numbered month in place of the built-in one; today shows day 2', async () => {
  const sheet = await pasteInto('diocese', DIOCESE);
  assert.equal(await sheet.locator('.preview-summary').innerText(), '31 entries on 31 days of the month');
  assert.equal(await sheet.locator('button[type=submit]').innerText(), 'Replace with 31');
  await sheet.locator('button[type=submit]').click();
  await sheet.waitFor({ state: 'detached' });
  await goToday();
  assert.equal(await page.locator('.group[data-list=diocese] .group-label').innerText(), 'DAY 2');
  assert.deepEqual(await texts('.group[data-list=diocese] .item-text'), ['St. Barnabas’s, Town 2']);
  assert.deepEqual(await texts('.group[data-list=diocese] .item-note'), ['The Rev. Rector 2']); // clergy, editable
});

await step('Diocese: on November 30 the 31st is included', async () => {
  await page.evaluate(() => window.prayerTracker.setDate('2026-11-30'));
  assert.equal(await page.locator('.group[data-list=diocese] .group-label').innerText(), 'DAYS 30–31');
  assert.equal(await page.locator('.group[data-list=diocese] .item').count(), 2);
  await page.evaluate(() => window.prayerTracker.setDate('2026-11-02'));
});

await step('Diocese: start again from the diocese’s own monthly cycle', async () => {
  await openList('diocese');
  await page.locator('button[aria-label="List settings"]').click();
  await page.locator('.sheet-list .link-btn', { hasText: 'Start again from the diocese’s monthly cycle' }).click();
  const confirm = page.locator('.sheet-confirm');
  await confirm.waitFor();
  assert.match(await confirm.innerText(), /Its 31 entries are replaced by the 105 entries in the diocese’s monthly cycle/);
  await confirm.locator('.btn-danger-fill').click();
  await eventually(async () => assert.match(await page.locator('.toast.show').innerText(), /105 entries from the diocese’s monthly cycle/));
  await page.locator('.sheet-list').waitFor({ state: 'detached' });
  assert.deepEqual(await page.locator('.detail-section', { hasText: 'Day 2' }).first().locator('.row-text').allInnerTexts(), ['St. John’s, Sparta', 'St. Andrew’s, Monroe', 'St. Mark’s, Milwaukee']);
  await shot('05b-diocese-list');
  await goToday();
  assert.deepEqual(await texts('.group[data-list=diocese] .item-text'), ['St. John’s, Sparta', 'St. Andrew’s, Monroe', 'St. Mark’s, Milwaukee']);
});

await step('a list read out in one go (say, at Morning Prayer) can be marked prayed in one tap', async () => {
  await page.locator('.group[data-list=diocese] .group-foot .link-btn', { hasText: 'Prayed for all 3' }).click();
  await eventually(async () => assert.equal(await page.locator('.group[data-list=diocese] .items .item').count(), 0));
  assert.match(await page.locator('.toast.show').innerText(), /Prayed for all 3/);
  await page.locator('.toast.show .toast-action').click();
  await eventually(async () => assert.equal(await page.locator('.group[data-list=diocese] .items .item').count(), 3));
});

await step('Diocesan Daily Cycle: next year’s PDF goes in alongside this year’s', async () => {
  // A stand-in for the diocese's daily PDF: a heading, a month, then numbered days.
  const people = ['Ann Able, Rector, St. Alban’s, Ayton', 'Bob Baker, Retired Priest', 'Cal Cole, Deacon, Grace, Beeton',
    'Dee Dale, PiC, St. Luke’s, Ceeton', 'Eve Ennis, Retired Deacon', 'Fay Fox, Priest CR', 'Gus Gale, Rector, Trinity, Deeton',
    'Hal Hale, Retired Priest', 'Ida Ives, Deacon, St. Paul’s, Eeton', 'Jo Jay, Retired Priest', 'Kit Kay, Rector, Zion, Feeton',
    'Lu Lee, Retired Priest'];
  const pdfPage = await context.newPage();
  await pdfPage.setContent(`<style>body{font:13px Helvetica;margin:40px} p{margin:0 0 3px}</style>
    <p>Daily Cycle of Prayer 2027 Updated 1/5/2027</p><p>JANUARY</p>${people.map((x, i) => `<p>${i + 1} ${x}</p>`).join('')}`);
  const pdfPath = `${OUT}daily-sample.pdf`;
  await pdfPage.pdf({ path: pdfPath, format: 'Letter' });
  await pdfPage.close();

  await openList('diocese-daily');
  await page.locator('.toolbar button', { hasText: 'Add dates' }).click();
  const sheet = page.locator('.sheet-import');
  await sheet.waitFor();
  await sheet.locator('input[type=file]').setInputFiles(pdfPath);
  await eventually(async () => assert.equal(await sheet.locator('.preview-summary').innerText(), '12 dates from Jan 1, 2027 to Jan 12, 2027'), 15000);
  assert.equal(await sheet.locator('.chip.on', { hasText: 'Add, replacing those dates' }).count(), 1);
  await shot('05c-import-daily');
  await sheet.locator('button[type=submit]').click();
  await sheet.waitFor({ state: 'detached' });
  await goToday();
  await page.evaluate(() => window.prayerTracker.setDate('2027-01-04'));
  assert.deepEqual(await texts('.group[data-list=diocese-daily] .item-text'), ['Dee Dale']);
  assert.deepEqual(await texts('.group[data-list=diocese-daily] .item-note'), ['Priest-in-Charge, St. Luke’s, Ceeton']);
  await page.evaluate(() => window.prayerTracker.setDate('2026-11-03'));
  assert.deepEqual(await texts('.group[data-list=diocese-daily] .item-text'), ['Lynn Zobel']); // this year's are still there
  await page.evaluate(() => window.prayerTracker.setDate('2026-11-02'));
});

const ACP = `THE ANGLICAN CYCLE OF PRAYER (test sample)
Sunday 01-Nov-2026
Pray for the Church of the Province of Example
The Most Revd A. Primate – Primate and Archbishop
12
Monday 02-Nov-2026
The Diocese of Alpha – (Example)
The Rt Revd B. Bishop
Tuesday 03-Nov-2026
The Diocese of Beta – (Example)
The Rt Revd C. Bishop
Wednesday 04-Nov-2026
The Diocese of Gamma – (Example)`;

await step('Anglican Cycle: paste dated text; today shows its diocese and bishop', async () => {
  const sheet = await pasteInto('anglican', ACP);
  assert.equal(await sheet.locator('.preview-summary').innerText(), '4 days, Nov 1, 2026 to Nov 4, 2026, then it starts over');
  assert.match(await sheet.locator('button[type=submit]').innerText(), /^Use these 4 days/);
  await shot('06-import-acp');
  await sheet.locator('button[type=submit]').click();
  await sheet.waitFor({ state: 'detached' });
  await goToday();
  assert.deepEqual(await texts('.group[data-list=anglican] .item-text'), ['The Diocese of Alpha – (Example)']);
  assert.deepEqual(await texts('.group[data-list=anglican] .item-note'), ['The Rt Revd B. Bishop']);
  await shot('07-today-full');
  await page.locator('.view').screenshot({ path: `${OUT}07-today-full-page.png` });
});

await step('Anglican Cycle: after its last day the cycle starts over', async () => {
  await page.evaluate(() => window.prayerTracker.setDate('2026-11-05'));
  assert.deepEqual(await texts('.group[data-list=anglican] .item-text'), ['Pray for the Church of the Province of Example']);
  assert.equal(await page.locator('.notice-card').count(), 0);
  await page.click('.back-today');
});

await step('Anglican Cycle: read straight from a PDF', async () => {
  // Make an ACP-style PDF with Chromium, then choose it in the import sheet.
  const pdfPage = await context.newPage();
  const days = [['Monday 02-Nov-2026', 'The Diocese of Delta – (Example)', 'The Rt Revd D. Bishop'],
    ['Tuesday 03-Nov-2026', 'The Diocese of Epsilon – (Example)', 'The Rt Revd E. Bishop'],
    ['Wednesday 04-Nov-2026', 'The Diocese of Zeta – (Example)', 'The Rt Revd F. Bishop'],
    ['Thursday 05-Nov-2026', 'The Diocese of Eta – (Example)', 'The Rt Revd G. Bishop']];
  await pdfPage.setContent(`<style>body{font:14px Georgia;columns:2;margin:30px} h1{column-span:all} p{margin:0} .d{font-weight:bold;margin-top:12px}</style>
    <h1>Anglican Cycle of Prayer</h1>${days.map(([d, a, b]) => `<p class="d">${d}</p><p>${a}</p><p>${b}</p>`).join('')}`);
  const pdfPath = `${OUT}acp-sample.pdf`;
  await pdfPage.pdf({ path: pdfPath, format: 'A5' });
  await pdfPage.close();

  await openList('anglican');
  await page.locator('.toolbar button', { hasText: 'Add the cycle' }).click();
  const sheet = page.locator('.sheet-import');
  await sheet.waitFor();
  await sheet.locator('input[type=file]').setInputFiles(pdfPath);
  await eventually(async () => assert.equal(await sheet.locator('.preview-summary').innerText(), '4 days, Nov 2, 2026 to Nov 5, 2026, then it starts over'), 15000);
  // A cycle is replaced as a whole.
  assert.match(await sheet.locator('button[type=submit]').innerText(), /^Use these 4 days/);
  await sheet.locator('button[type=submit]').click();
  await sheet.waitFor({ state: 'detached' });
  await goToday();
  assert.deepEqual(await texts('.group[data-list=anglican] .item-text'), ['The Diocese of Delta – (Example)']);
  assert.deepEqual(await texts('.group[data-list=anglican] .item-note'), ['The Rt Revd D. Bishop']);
});

await step('filter chips show one list at a time', async () => {
  await page.locator('.filter-chips .chip', { hasText: 'Family' }).click();
  assert.deepEqual(await texts('.group h2'), ['Family']);
  await shot('08-filtered');
  await page.locator('.filter-chips .chip', { hasText: 'All' }).click();
  assert.deepEqual(await texts('.group h2'), ['Anglican Cycle of Prayer', 'Diocesan Cycle', 'Diocesan Daily Cycle', 'Trinity', 'Prayer Requests', 'Family']);
});

await step('edit an item: rename, add a note, set an end date, move lists', async () => {
  await page.locator('.item', { hasText: 'Aunt Sue' }).locator('.item-body').click();
  const sheet = page.locator('.sheet-item');
  await sheet.waitFor();
  await sheet.locator('input.input-lg').fill('Aunt Susan');
  await sheet.locator('textarea').fill('new job');
  await sheet.locator('.chip', { hasText: '1 week' }).click();
  await sheet.locator('select').selectOption('requests');
  await sheet.locator('button[type=submit]').click();
  await sheet.waitFor({ state: 'detached' });
  assert.equal(await page.locator('.toast.show').innerText(), 'Moved to Prayer Requests'); // no stray "undefined"
  assert.deepEqual(await texts('.group[data-list=requests] .item-text'), ['Jane Doe – surgery Thursday', 'Aunt Susan']);
  assert.ok((await texts('.group[data-list=requests] .item-note')).includes('new job'));
  assert.ok((await texts('.group[data-list=requests] .badge')).includes('Until Nov 8'));
});

await step('delete with undo', async () => {
  await page.locator('.item', { hasText: 'Aunt Susan' }).locator('.item-body').click();
  await page.locator('.sheet-item .btn-danger').click();
  await eventually(async () => assert.equal(await page.locator('.item', { hasText: 'Aunt Susan' }).count(), 0));
  await page.locator('.toast.show .toast-action').click();
  await eventually(async () => assert.equal(await page.locator('.item', { hasText: 'Aunt Susan' }).count(), 1));
});

await step('?add opens the add sheet; shared text arrives prefilled', async () => {
  await page.goto(`${BASE}?add`);
  await page.locator('.sheet-add').waitFor();
  assert.equal(new URL(page.url()).search, '');
  await page.goto(`${BASE}?title=Prayer%20request&text=Please%20pray%20for%20my%20sister`);
  await page.locator('.sheet-add').waitFor();
  assert.equal(await page.locator('.sheet-add textarea.add-text').inputValue(), 'Prayer request Please pray for my sister');
  await page.locator('.sheet-add .sheet-close').click();
});

await step('midnight rollover moves Today forward', async () => {
  await page.clock.setFixedTime(new Date('2026-11-03T00:00:30-05:00'));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await eventually(async () => assert.equal(await heading(), 'Tuesday, November 3'));
  assert.equal(await page.locator('.day-rel').innerText(), 'TODAY');
  // Monday's unprayed cycle entries are carried into Tuesday. Trinity brings
  // everyone every day, so nothing of it is carried, and Tuesday's Morning
  // Prayer list is Tuesday's names.
  assert.deepEqual(await texts('.group[data-list=anglican] .items-carried .item-text'), ['The Diocese of Delta – (Example)']);
  assert.equal(await page.locator('.group[data-list=trinity] .items-carried').count(), 0);
  assert.deepEqual(await texts('.office-list[data-office=trinity] .office-names li'), ['Grace Brown']);
  assert.equal(await page.locator('.group[data-list=family] .items-carried').count(), 0); // daily lists just repeat
  await shot('08b-carried');
  await page.clock.setFixedTime(new Date('2026-11-02T09:00:00-05:00'));
  await page.reload();
  await page.locator('.day-head h1').waitFor();
});

await step('all prayed shows a closing response', async () => {
  await page.evaluate(() => window.prayerTracker.setDate('2026-11-04'));
  for (;;) {
    const office = page.locator('.btn-office');
    if (await office.count()) {
      await office.first().click();
      await sleep(80);
      continue;
    }
    const checks = page.locator('.items:not(.items-done) .item:not(.checked) .check');
    if (!(await checks.count())) break;
    await checks.first().click();
    await sleep(80);
  }
  await eventually(async () => assert.equal(await page.locator('.complete-response').innerText(), 'Thanks be to God.'));
  await shot('09-all-prayed');
  await page.click('.back-today');
});

await step('Lists and Settings screens render', async () => {
  await page.click('.tabbar a[href="#/lists"]');
  assert.deepEqual(await texts('.lc-name'), ['Anglican Cycle of Prayer', 'Diocesan Cycle', 'Diocesan Daily Cycle', 'Trinity', 'Prayer Requests', 'Family', 'Clergy', 'Prayers and Thanksgivings']);
  await shot('10-lists');
  await page.click('a[href="#/settings"]');
  await page.locator('.page-title').waitFor();
  await shot('11-settings');
});

await step('backup: save, erase everything, restore', async () => {
  const downloadPromise = page.waitForEvent('download');
  await page.locator('button', { hasText: 'Save a backup' }).click();
  const download = await downloadPromise;
  const file = `${OUT}backup.json`;
  await download.saveAs(file);
  const data = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(data.app, 'prayer-tracker');
  assert.ok(data.data.lists.find((l) => l.id === 'trinity').items.length >= 9);

  await page.locator('button', { hasText: 'Erase all data' }).click();
  await page.locator('.sheet-confirm .btn-danger-fill').click();
  await goToday();
  // As on a first run: the Anglican Cycle is built in and the diocese's cycles are filled in again.
  assert.deepEqual(await texts('.setup-card h2'), ['Trinity']);
  assert.equal(await page.locator('.group[data-list=diocese] .item').count(), 3);

  await page.click('.tabbar a[href="#/lists"]');
  await page.click('a[href="#/settings"]');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('button', { hasText: 'Restore a backup' }).click();
  await (await chooser).setFiles(file);
  await page.locator('.sheet-confirm .btn-danger-fill').click();
  await goToday();
  await eventually(async () => assert.equal(await page.locator('.setup-card').count(), 0));
  assert.deepEqual(await texts('.group[data-list=family] .item-text'), ['Dad']);
});

await step('works offline once loaded', async () => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await page.locator('.day-head h1').waitFor();
  assert.equal(await heading(), 'Monday, November 2');
  await context.setOffline(false);
});

await step('dark mode', async () => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await eventually(async () => assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark'));
  await shot('12-dark');
  await page.click('.tab-add');
  await page.locator('.sheet-add').waitFor();
  await sleep(350);
  await shot('13-dark-add');
  await page.locator('.sheet-add .sheet-close').click();
  await page.emulateMedia({ colorScheme: 'light' });
});

await step('no errors in the console', async () => {
  // The offline step makes Chromium log one failed network fetch for the SW update check.
  const real = problems.filter((p) => !/ERR_INTERNET_DISCONNECTED|Failed to fetch|net::ERR/.test(p));
  assert.deepEqual(real, []);
});

// ---------- Part 2: the built-in cycle, the calendar, prayers, carry-forward, pray-through, sync ----------

console.log(' Part 2: built-in cycle, feasts, prayers, carry-forward, pray-through, sync');
const NAMES = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa'];
// A stand-in for js/data/acp.js (the real one is built from the Anglican Communion's PDF).
const FAKE_ACP = `export default { id: 'acptest', title: 'Test cycle', source: 'test', start: '2026-10-30', entries: [
${NAMES.map((n) => `  { text: 'The Diocese of ${n} (Example)', note: 'The Rt Revd ${n} Bishop' },`).join('\n')}
] };`;

const gh = { file: null, version: 0 };
const ghDoc = () => JSON.parse(Buffer.from(gh.file, 'base64').toString('utf8'));
const context2 = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  locale: 'en-US', timezoneId: 'America/New_York', serviceWorkers: 'block',
});
await context2.route('**/js/data/acp.js', (route) => route.fulfill({ contentType: 'text/javascript', body: FAKE_ACP }));
// And for js/data/diocese.js, with entries only on the 15th, so they stay out of the way.
const FAKE_DIOCESE = `export default { id: 'wistest', diocese: 'Test diocese', updated: ${Date.parse('2026-11-01T00:00:00Z')},
  monthly: [{ day: 15, text: 'St. Test’s, Testville', note: 'Tess Tester, Rector' }],
  daily: [{ date: '2026-11-15', text: 'Tess Tester', note: 'Rector, St. Test’s, Testville' }] };`;
await context2.route('**/js/data/diocese.js', (route) => route.fulfill({ contentType: 'text/javascript', body: FAKE_DIOCESE }));
// Trinity's prayer request form: record what the app sends it.
const formPosts = [];
let formUnreachable = false;
await context2.route('https://docs.google.com/forms/**', async (route) => {
  if (formUnreachable) return route.abort('internetdisconnected');
  const req = route.request();
  formPosts.push({ method: req.method(), url: req.url(), body: new URLSearchParams(req.postData() || '') });
  await route.fulfill({ status: 200, contentType: 'text/html', body: '<p>Your response has been recorded.</p>' });
});
await context2.route('https://api.github.com/**', async (route) => {
  const req = route.request();
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, accept, x-github-api-version', 'access-control-allow-methods': 'GET, PUT, OPTIONS' };
  const json = (status, body) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  if (req.headers().authorization !== 'Bearer good-token') return json(401, { message: 'Bad credentials' });
  const path = new URL(req.url()).pathname;
  if (path === '/repos/me/prayer-data') return json(200, { private: true, full_name: 'me/prayer-data' });
  if (path !== '/repos/me/prayer-data/contents/prayer-tracker.json') return json(404, { message: 'Not Found' });
  if (req.method() === 'GET') return gh.file ? json(200, { sha: `s${gh.version}`, encoding: 'base64', content: gh.file }) : json(404, { message: 'Not Found' });
  const body = JSON.parse(req.postData());
  if (gh.file && body.sha !== `s${gh.version}`) return json(409, { message: 'does not match' });
  gh.version += 1;
  gh.file = body.content;
  return json(200, { content: { sha: `s${gh.version}` } });
});
page = await context2.newPage();
await page.clock.setFixedTime(new Date('2026-11-02T09:00:00-05:00'));
const problems2 = [];
page.on('pageerror', (e) => problems2.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') problems2.push(`console: ${m.text()}`); });

await step('the built-in Anglican Cycle shows today’s diocese, with nothing to set up', async () => {
  await page.goto(BASE);
  await page.locator('.day-head h1').waitFor();
  assert.deepEqual(await texts('.group[data-list=anglican] .item-text'), ['The Diocese of Delta (Example)']);
  assert.deepEqual(await texts('.group[data-list=anglican] .item-note'), ['The Rt Revd Delta Bishop']);
  assert.deepEqual(await texts('.setup-card h2'), ['Trinity']);
  // Ten days from Oct 30, then it starts over.
  await page.evaluate(() => window.prayerTracker.setDate('2026-11-09'));
  assert.deepEqual(await texts('.group[data-list=anglican] .item-text'), ['The Diocese of Alpha (Example)']);
  await page.evaluate(() => window.prayerTracker.setDate('2026-11-02'));
});

await step('each list opens with its prayer, folded until tapped', async () => {
  assert.equal(await page.locator('.group[data-list=anglican] .prayer-title').innerText(), 'FOR THE CHURCH');
  assert.equal(await page.locator('.group[data-list=anglican] .prayer-text').isVisible(), false);
  await page.locator('.group[data-list=anglican] .prayer summary').click();
  assert.match(await page.locator('.group[data-list=anglican] .prayer-text').innerText(), /^Gracious Father, we pray for thy holy Catholic Church/);
  await shot('20-today-prayer-open');
  await page.locator('.group[data-list=anglican] .prayer summary').click();
});

await step('the feast of the day and its colour', async () => {
  await page.evaluate(() => window.prayerTracker.setDate('2026-11-30'));
  assert.equal(await page.locator('.feast').innerText(), 'Saint Andrew the Apostle');
  assert.equal(await page.locator('.day-head').getAttribute('data-color'), 'red');
  await page.evaluate(() => window.prayerTracker.setDate('2026-11-29'));
  assert.equal(await page.locator('.feast').innerText(), 'The First Sunday of Advent');
  assert.equal(await page.locator('.day-head').getAttribute('data-color'), 'blue');
  await shot('21-advent');
  await page.evaluate(() => window.prayerTracker.setDate('2026-11-08'));
  assert.equal(await page.locator('.feast').innerText(), 'The Twenty-fourth Sunday after Pentecost');
  assert.equal(await page.locator('.feast-detail').innerText(), 'PROPER 27');
  await page.click('.back-today');
});

await step('a built-in entry can be reworded (say, after a merger) and restored', async () => {
  await page.locator('.group[data-list=anglican] .item-body').click();
  const sheet = page.locator('.sheet-item');
  await sheet.waitFor();
  assert.equal(await sheet.locator('h2').innerText(), 'Edit entry');
  await sheet.locator('input.input-lg').fill('The Diocese of Delta and Epsilon (Example)');
  await sheet.locator('button[type=submit]').click();
  await sheet.waitFor({ state: 'detached' });
  assert.deepEqual(await texts('.group[data-list=anglican] .item-text'), ['The Diocese of Delta and Epsilon (Example)']);
  await openList('anglican');
  assert.match(await page.locator('.detail-section', { hasText: 'Your changes' }).innerText(), /Delta and Epsilon[\s\S]*Edited/);
  await shot('22-cycle-list');
  await page.locator('.detail-section', { hasText: 'Your changes' }).locator('.row').click();
  await page.locator('.sheet-item .link-btn', { hasText: 'Restore the original wording' }).click();
  await goToday();
  assert.deepEqual(await texts('.group[data-list=anglican] .item-text'), ['The Diocese of Delta (Example)']);
});

await step('a list’s prayers can be changed: others added from the Prayer Book, reordered, reworded, or removed', async () => {
  await quickAdd('Mom', { list: 'Family' });
  assert.equal(await page.locator('.group[data-list=family] .prayer-title').innerText(), 'FOR THOSE WE LOVE');
  await openList('family');
  await page.locator('button[aria-label="List settings"]').click();
  const sheet = page.locator('.sheet-list');
  await sheet.waitFor();
  assert.deepEqual(await texts('.sheet-list .prayer-row-title'), ['For those we Love']);
  await sheet.locator('select[aria-label="Add a prayer from the Prayer Book"]').selectOption('p52');
  assert.deepEqual(await texts('.sheet-list .prayer-row-title'), ['For those we Love', 'For the Absent']);
  await sheet.locator('button[aria-label="Move “For the Absent” up"]').click();
  assert.deepEqual(await texts('.sheet-list .prayer-row-title'), ['For the Absent', 'For those we Love']);
  await sheet.locator('button[aria-label="Remove “For the Absent”"]').click();
  await sheet.locator('.prayer-row .link-btn', { hasText: 'Change the words' }).click();
  await sheet.locator('.prayer-edit input').fill('For my family');
  await sheet.locator('.prayer-edit textarea').fill('Lord, keep those I love in your care, near and far. Amen.');
  await shot('23-prayer-editor');
  await sheet.locator('button[type=submit]').click();
  await sheet.waitFor({ state: 'detached' });
  await goToday();
  assert.equal(await page.locator('.group[data-list=family] .prayer-title').innerText(), 'FOR MY FAMILY');
  await page.locator('.group[data-list=family] .prayer summary').click();
  assert.equal(await page.locator('.group[data-list=family] .prayer-text').innerText(), 'Lord, keep those I love in your care, near and far. Amen.');
});

await step('missed entries carry forward until prayed, or let go', async () => {
  // As a plain weekly list (just each day's names), Trinity carries what's missed.
  await openList('trinity');
  await page.locator('button[aria-label="List settings"]').click();
  const settings = page.locator('.sheet-list');
  await settings.waitFor();
  await settings.locator('.toggle-row', { hasText: 'Everyone, every day' }).locator('label').click();
  await settings.locator('button[type=submit]').click();
  await settings.waitFor({ state: 'detached' });
  assert.doesNotMatch(await page.locator('.list-sub').innerText(), /every day/);
  await goToday();
  await quickAdd('Ann Able', { list: 'Trinity' }); // goes on Monday
  await page.clock.setFixedTime(new Date('2026-11-03T09:00:00-05:00'));
  await page.reload();
  await page.locator('.day-head h1').waitFor();
  assert.deepEqual(await texts('.group[data-list=anglican] .items:not(.items-carried) .item-text'), ['The Diocese of Epsilon (Example)']);
  assert.deepEqual(await texts('.group[data-list=anglican] .items-carried .item-text'), ['The Diocese of Delta (Example)']);
  assert.deepEqual(await texts('.group[data-list=trinity] .items-carried .item-text'), ['Ann Able']);
  assert.deepEqual(await texts('.group[data-list=trinity] .items-carried .badge'), ['Mon, Nov 2']);
  assert.equal(await page.locator('.group[data-list=family] .items-carried').count(), 0);
  assert.match(await page.locator('.progress-text').innerText(), /2 from earlier days/);
  await shot('24-carried');
  await page.locator('.group[data-list=trinity] .items-carried .check').click();
  await eventually(async () => assert.equal(await page.locator('.group[data-list=trinity] .items-carried').count(), 0));
  assert.ok(await page.evaluate(() => {
    const ann = window.prayerTracker.store.list('trinity').items[0];
    return window.prayerTracker.store.isChecked('2026-11-02', ann.id);
  }));
  await page.locator('.group[data-list=anglican] .carried-head .link-btn').click();
  await eventually(async () => assert.equal(await page.locator('.group[data-list=anglican] .items-carried').count(), 0));
  await page.locator('.toast.show .toast-action').click();
  await eventually(async () => assert.equal(await page.locator('.group[data-list=anglican] .items-carried .item').count(), 1));
});

await step('pray-through: each list’s prayer, then one entry at a time; Amen marks it prayed', async () => {
  await page.locator('.btn-pray').click();
  const pray = page.locator('dialog.pray');
  await pray.waitFor();
  assert.equal(await pray.locator('.pray-prayer-title').innerText(), 'For the Church');
  await shot('25-pray-prayer');
  await pray.locator('.btn-amen').click();
  assert.equal(await pray.locator('.pray-name').innerText(), 'The Diocese of Epsilon (Example)');
  assert.equal(await pray.locator('.pray-count').innerText(), '1 of 3');
  await shot('26-pray-entry');
  await pray.locator('.btn-amen').click();
  assert.equal(await pray.locator('.pray-name').innerText(), 'The Diocese of Delta (Example)');
  assert.equal(await pray.locator('.pray-from').innerText(), 'From Mon, Nov 2');
  await pray.locator('.btn-amen').click();
  assert.equal(await pray.locator('.pray-prayer-title').innerText(), 'For my family');
  await pray.locator('.btn-amen').click();
  assert.equal(await pray.locator('.pray-name').innerText(), 'Mom');
  await pray.locator('button', { hasText: 'Back' }).click(); // back to the prayer, then forward again
  await pray.locator('.btn-amen').click();
  await pray.locator('.btn-amen').click();
  assert.equal(await pray.locator('.pray-response').innerText(), 'Thanks be to God.');
  assert.match(await pray.locator('.pray-summary').innerText(), /Everyone on today’s list/);
  await shot('27-pray-end');
  await pray.locator('.btn-amen').click(); // Close
  await pray.waitFor({ state: 'detached' });
  await eventually(async () => assert.equal(await page.locator('.complete-response').innerText(), 'Thanks be to God.'));
});

await step('sync: refuses a bad token, connects to a private repository, and picks up another device’s changes', async () => {
  await page.click('.tabbar a[href="#/lists"]');
  await page.click('a[href="#/settings"]');
  const card = page.locator('.settings-card', { hasText: 'Sync across devices' });
  await card.locator('input[aria-label="Repository"]').fill('me/prayer-data');
  await card.locator('input[aria-label="Access token"]').fill('wrong');
  await card.locator('button[type=submit]').click();
  await eventually(async () => assert.match(await card.locator('.sync-status').innerText(), /token/));
  await card.locator('input[aria-label="Access token"]').fill('good-token');
  await card.locator('button[type=submit]').click();
  await eventually(async () => assert.match(await page.locator('.settings-card', { hasText: 'Sync across devices' }).innerText(), /Last synced just now/));
  await shot('28-sync-on');
  const doc = ghDoc();
  assert.deepEqual(doc.lists.find((l) => l.id === 'family').items.map((i) => i.text), ['Mom']);
  assert.equal(doc.meta, undefined); // device-only settings stay on the device
  // Another device adds Grandma.
  const t = Date.parse('2026-11-03T10:00:00-05:00');
  doc.lists.find((l) => l.id === 'family').items.push({ id: 'from-ipad', text: 'Grandma', created: t, updated: t, since: '2026-11-03' });
  gh.file = Buffer.from(JSON.stringify(doc)).toString('base64');
  gh.version += 1;
  await page.locator('button', { hasText: 'Sync now' }).click();
  await eventually(async () => assert.match(await page.locator('.settings-card', { hasText: 'Sync across devices' }).innerText(), /Last synced/));
  await goToday();
  await page.locator('.show-done button').click();
  assert.deepEqual(await texts('.group[data-list=family] .item-text'), ['Grandma', 'Mom']);
  // A change here goes back up.
  await page.locator('.item', { hasText: 'Grandma' }).locator('.check').click();
  await eventually(async () => assert.ok((ghDoc().checks['2026-11-03'] || {})['from-ipad'] > 0), 6000);
});

async function addSharing(text, { choice = null } = {}) {
  await page.click('.tab-add');
  const sheet = page.locator('.sheet-add');
  await sheet.waitFor();
  await sheet.locator('textarea.add-text').fill(text);
  await sheet.locator('.chips-lists .chip', { hasText: 'Prayer Requests' }).click();
  await sheet.locator('.share .toggle-row label').click();
  await sheet.locator('.share-body').waitFor();
  if (choice) await sheet.locator('.radio-row', { hasText: choice }).click();
  return sheet;
}

await step('share a prayer request with Trinity: your name and the request go as they are; the other two questions come down', async () => {
  await page.evaluate(() => { window.prayerTracker.shareDelay = 400; });
  await page.click('.tab-add');
  const sheet = page.locator('.sheet-add');
  await sheet.waitFor();
  await sheet.locator('textarea.add-text').fill('Jane Roe – surgery Friday');
  await sheet.locator('.chips-lists .chip', { hasText: 'Prayer Requests' }).click();
  await sheet.locator('.link-btn', { hasText: 'Add details' }).click();
  await sheet.locator('textarea[aria-label="Details"]').fill('a private detail');
  assert.equal(await sheet.locator('.share-body').isVisible(), false);
  await sheet.locator('.share .toggle-row label').click();
  await sheet.locator('.share-body').waitFor();
  assert.match(await sheet.locator('.share-from').innerText(), /^From Chris Corbin, with the request as you wrote it above\. Details stay private\./);
  assert.equal(await sheet.locator('.share-body input:not([type=radio]), .share-body textarea').count(), 0); // nothing to type
  assert.deepEqual(await texts('.sheet-add .radio-row'), [
    'Only share my name and prayer request with clergy and staff.',
    'Share my prayer request with members of the congregation, but keep my name anonymous.',
    'Share my prayer request and name with members of the congregation.']);
  assert.ok(await sheet.locator('.radio-row').first().locator('input').isChecked()); // the most private, to begin with
  await sheet.locator('.radio-row', { hasText: 'keep my name anonymous' }).click();
  assert.equal(await sheet.locator('button[type=submit]').innerText(), 'Add and share');
  await shot('32b-share-with-trinity');
  await sheet.locator('button[type=submit]').click();
  await sheet.waitFor({ state: 'detached' });
  await eventually(async () => assert.equal(formPosts.length, 1), 6000);
  assert.equal(formPosts[0].method, 'POST');
  assert.equal(formPosts[0].url, 'https://docs.google.com/forms/d/e/1FAIpQLSceBPekpqOMedX0hZYr27AjsuaDFwjs0W_eftoAQvaK197Q3Q/formResponse');
  assert.deepEqual(Object.fromEntries(formPosts[0].body), {
    'entry.597871476': 'Chris Corbin',
    'entry.670633233': 'Jane Roe – surgery Friday',
    'entry.764039509': 'No',
    'entry.1294983933': 'Share my prayer request with members of the congregation, but keep my name anonymous.',
  });
  await eventually(async () => assert.match(await page.locator('.toast.show').innerText({ timeout: 1000 }), /Sent to Trinity’s prayer list/));
  // On your own list it's marked shared, and can be sent again (Trinity keeps a request a month).
  await page.locator('.item', { hasText: 'Jane Roe' }).locator('.item-body').click();
  const edit = page.locator('.sheet-item');
  await edit.waitFor();
  assert.match(await edit.innerText(), /shared with Trinity Tue, Nov 3/);
  await edit.locator('.link-btn', { hasText: 'Share with Trinity again' }).click();
  const again = page.locator('.sheet-share');
  await again.waitFor();
  assert.equal(await again.locator('.share-preview').innerText(), 'Jane Roe – surgery Friday');
  assert.ok(await again.locator('.radio-row', { hasText: 'keep my name anonymous' }).locator('input').isChecked()); // remembered
  assert.match(await again.locator('.share-open').getAttribute('href') || '', /viewform/);
  await shot('32c-share-again');
  await again.locator('.sheet-close').click();
  await again.waitFor({ state: 'detached' });
});

await step('a share can be undone before it goes, waits while offline, and sends each line as its own request', async () => {
  await page.evaluate(() => { window.prayerTracker.shareDelay = 2500; });
  let sheet = await addSharing('Undo me');
  await sheet.locator('button[type=submit]').click();
  await sheet.waitFor({ state: 'detached' });
  await page.locator('.toast.show .toast-action').click();
  await sleep(3200);
  assert.equal(formPosts.length, 1);
  assert.equal(await page.locator('.item', { hasText: 'Undo me' }).count(), 0);

  await page.evaluate(() => { window.prayerTracker.shareDelay = 400; });
  formUnreachable = true; // as if offline
  sheet = await addSharing('Bob Doe – new job');
  await sheet.locator('button[type=submit]').click();
  await sheet.waitFor({ state: 'detached' });
  await eventually(async () => assert.match(await page.locator('.toast.show').innerText({ timeout: 1000 }), /No connection yet/), 6000);
  assert.equal(formPosts.length, 1);
  assert.equal(await page.evaluate(() => window.prayerTracker.store.state.meta.outbox.length), 1);
  formUnreachable = false;
  // (The page's clock is fixed, so nothing ages past the Undo moment by itself.)
  await page.evaluate(() => { window.prayerTracker.shareDelay = 0; window.dispatchEvent(new Event('online')); });
  await eventually(async () => assert.equal(formPosts.length, 2), 8000);
  assert.equal(formPosts[1].body.get('entry.670633233'), 'Bob Doe – new job');

  await page.evaluate(() => { window.prayerTracker.shareDelay = 400; });
  sheet = await addSharing('Ann Fox – travelling\nBen Fox – exams');
  assert.equal(await sheet.locator('button[type=submit]').innerText(), 'Add 2 and share');
  await sheet.locator('button[type=submit]').click();
  await sheet.waitFor({ state: 'detached' });
  await eventually(async () => assert.equal(formPosts.length, 4), 6000);
  assert.deepEqual(formPosts.slice(2).map((p) => p.body.get('entry.670633233')).sort(), ['Ann Fox – travelling', 'Ben Fox – exams']);
});

await step('the name requests go under can be changed in Settings', async () => {
  await page.click('.tabbar a[href="#/lists"]');
  await page.click('a[href="#/settings"]');
  const card = page.locator('.settings-card', { hasText: 'Sharing with Trinity' });
  assert.equal(await card.locator('input').inputValue(), 'Chris Corbin');
  await card.locator('input').fill('Pat Example');
  await card.locator('input').press('Tab');
  await goToday();
  const sheet = await addSharing('Cy Coe – thanksgiving for a new grandchild');
  assert.match(await sheet.locator('.share-from').innerText(), /^From Pat Example/);
  await sheet.locator('button[type=submit]').click();
  await sheet.waitFor({ state: 'detached' });
  await eventually(async () => assert.equal(formPosts.length, 5), 6000);
  assert.equal(formPosts[4].body.get('entry.597871476'), 'Pat Example');
});

await step('Prayer Requests opens with the Vigil prayer, then All Sorts and Conditions', async () => {
  await goToday();
  assert.deepEqual(await texts('.group[data-list=requests] .prayer-title'), ['FROM THE GREAT VIGIL OF EASTER', 'FOR ALL SORTS AND CONDITIONS OF MEN']);
  await page.locator('.group[data-list=requests] .prayer summary').first().click();
  assert.match(await page.locator('.group[data-list=requests] .prayer-text').first().innerText(), /^God and Father of all believers, for the glory of your Name multiply/);
  await page.locator('.group[data-list=requests] .prayer summary').first().click();
});

await step('Prayers and Thanksgivings: choose from folded headings or by searching, in Rite One or Rite Two', async () => {
  await page.click('.tabbar a[href="#/lists"]');
  await page.click('a[href="#/settings"]');
  assert.equal(await page.locator('.chips-rite .chip.on').innerText(), 'Rite Two');
  await page.locator('button', { hasText: 'Choose prayers and thanksgivings' }).click();
  const picker = page.locator('.sheet-picker');
  await picker.waitFor();
  assert.match(await picker.locator('.picker-count').innerText(), /Nothing chosen yet/);
  assert.equal(await picker.locator('.picker-section[open]').count(), 0); // all folded
  assert.equal(await picker.locator('.picker-section > summary').first().innerText(), 'Prayers for the World');
  // Search by the prayer's own words.
  await picker.locator('input[type=search]').fill('quietness and in confidence');
  await eventually(async () => assert.deepEqual(await texts('.sheet-picker .picker-row:not([hidden]) .picker-title'), ['59. For Quiet Confidence']));
  await picker.locator('.picker-row:not([hidden]) input[type=checkbox]').check();
  assert.match(await picker.locator('.picker-count').innerText(), /^1 prayer chosen/);
  await picker.locator('input[type=search]').fill('');
  // Or open a heading.
  const general = picker.locator('.picker-section', { hasText: 'General Thanksgivings' });
  await general.locator('summary').first().click();
  await general.locator('.picker-row', { hasText: 'A General Thanksgiving' }).locator('input[type=checkbox]').check();
  assert.equal(await general.locator('.picker-chosen').innerText(), '1 chosen');
  await shot('33-prayer-picker');
  await picker.locator('button', { hasText: 'Done' }).click();
  await picker.waitFor({ state: 'detached' });
  await goToday();
  assert.deepEqual(await texts('.group[data-list=prayers] .item-text'), ['For Quiet Confidence', 'A General Thanksgiving']);
  assert.match(await page.locator('.group[data-list=prayers] .item-prayer').first().innerText(), /^O God of peace, you have taught us/);
  // Rite One: the same prayer in traditional language.
  await page.click('.tabbar a[href="#/lists"]');
  await page.click('a[href="#/settings"]');
  await page.locator('.chips-rite .chip', { hasText: 'Rite One' }).click();
  await goToday();
  assert.match(await page.locator('.group[data-list=prayers] .item-prayer').first().innerText(), /^O God of peace, who hast taught us/);
  // Read one in full.
  await page.locator('.group[data-list=prayers] .item', { hasText: 'For Quiet Confidence' }).locator('.item-body').click();
  const read = page.locator('.sheet-prayer');
  await read.waitFor();
  assert.match(await read.innerText(), /know that thou art God; through Jesus Christ our Lord\. Amen\.[\s\S]*The Book of Common Prayer, page 832/);
  await shot('34-prayer-read');
  await read.locator('button', { hasText: 'Done' }).click();
  await read.waitFor({ state: 'detached' });
});

await step('your chosen prayers are said one by one in pray-through, and checked off', async () => {
  await page.locator('.btn-pray').click();
  const pray = page.locator('dialog.pray');
  await pray.waitFor();
  for (let k = 0; k < 20 && (await pray.locator('.pray-prayer-title').innerText().catch(() => '')) !== 'For Quiet Confidence'; k++) {
    await pray.locator('button', { hasText: 'Skip' }).or(pray.locator('.btn-amen')).first().click();
  }
  assert.equal(await pray.locator('.pray-prayer-title').innerText(), 'For Quiet Confidence');
  assert.match(await pray.locator('.pray-prayer-text').innerText(), /^O God of peace, who hast taught us/);
  await sleep(450);
  await shot('35-pray-prayer-item');
  await pray.locator('.btn-amen').click();
  await pray.locator('button[aria-label="Close"]').click();
  await pray.waitFor({ state: 'detached' });
  await eventually(async () => assert.deepEqual(await texts('.group[data-list=prayers] .items:not(.items-done) .item-text'), ['A General Thanksgiving']));
  await page.click('.tabbar a[href="#/lists"]');
  await page.click('a[href="#/settings"]');
  await page.locator('.chips-rite .chip', { hasText: 'Rite Two' }).click();
  await goToday();
});

await step('colours: burgundy on ivory unless blue or the church year is chosen', async () => {
  const root = (k) => page.evaluate((key) => document.documentElement.dataset[key], k);
  const accent = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
  assert.equal(await root('palette'), 'burgundy');
  assert.equal(await accent(), '#8a2433');
  await page.click('.tabbar a[href="#/lists"]');
  await page.click('a[href="#/settings"]');
  const chips = page.locator('.chips-palette');
  assert.equal(await chips.locator('.chip.on').innerText(), 'Burgundy');
  await chips.locator('.chip', { hasText: 'Blue' }).click();
  await eventually(async () => assert.equal(await root('palette'), 'blue'));
  assert.equal(await accent(), '#284878');
  await shot('32-settings-blue');
  await chips.locator('.chip', { hasText: 'Church year' }).click();
  await eventually(async () => assert.equal(await root('palette'), 'season'));
  assert.notEqual(await accent(), '#284878');
  await chips.locator('.chip', { hasText: 'Burgundy' }).click();
  await eventually(async () => assert.equal(await accent(), '#8a2433'));
  await goToday();
});

await step('part 2 light and dark screenshots', async () => {
  await page.evaluate(() => window.prayerTracker.setDate('2026-11-04'));
  await shot('29-today-new-design');
  await page.emulateMedia({ colorScheme: 'dark' });
  await eventually(async () => assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark'));
  await shot('30-today-dark');
  await page.locator('.btn-pray').click();
  await page.locator('dialog.pray').waitFor();
  await page.locator('dialog.pray .btn-amen').click();
  await sleep(350);
  await shot('31-pray-dark');
  await page.locator('dialog.pray button[aria-label="Close"]').click();
  await page.emulateMedia({ colorScheme: 'light' });
});

await step('no errors in the console (part 2)', async () => {
  // The offline share step makes Chromium log the requests it couldn't make.
  const real = problems2.filter((p) => !/Failed to load resource: the server responded with a status of (401|404)|net::ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(p));
  assert.deepEqual(real, []);
});

await writeFile(`${OUT}summary.txt`, `${passed} steps passed\n`);
console.log(`\n${passed} steps passed`);
await browser.close();
server.close();
