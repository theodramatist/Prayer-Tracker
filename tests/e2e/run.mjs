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
const page = await context.newPage();
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
  await page.locator('.toolbar button', { hasText: /Paste a list|Add the cycle/ }).click();
  const sheet = page.locator('.sheet-import');
  await sheet.waitFor();
  await sheet.locator('textarea.import-text').fill(text);
  if (choose) for (const label of choose) await sheet.locator('.chip', { hasText: label }).first().click();
  await eventually(async () => assert.ok(await sheet.locator('.preview-summary').isVisible()));
  return sheet;
}

async function goToday() {
  await page.click('.tabbar a[href="#/"]');
  await page.locator('.day-head h1').waitFor();
}

console.log('Prayer Tracker end-to-end');

await step('first run shows setup cards for the three cycles', async () => {
  await page.goto(BASE);
  await page.locator('.day-head h1').waitFor();
  assert.equal(await page.locator('.day-head h1').innerText(), 'Monday, November 2');
  assert.equal(await page.locator('.season').innerText(), 'Season after Pentecost');
  assert.deepEqual(await texts('.setup-card h2'), ['Anglican Cycle of Prayer', 'Diocesan Cycle', 'Trinity']);
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
  assert.equal(await page.locator('.progress-text').innerText(), '0 of 4 prayed');
  await page.locator('.item', { hasText: 'Mom' }).locator('.check').click();
  await eventually(async () => assert.deepEqual(await texts('.group[data-list=family] .item-text'), ['Dad', 'Aunt Sue']));
  assert.equal(await page.locator('.progress-text').innerText(), '1 of 4 prayed');
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
  await eventually(async () => assert.equal(await page.locator('.progress-text').innerText(), '1 of 4 prayed'));
});

await step('check-offs and items survive a reload', async () => {
  await page.reload();
  await page.locator('.day-head h1').waitFor();
  assert.equal(await page.locator('.progress-text').innerText(), '1 of 4 prayed');
  assert.deepEqual(await texts('.group[data-list=family] .item-text'), ['Dad', 'Aunt Sue']);
});

await step('the next day starts fresh; a one-week request ends on time', async () => {
  await page.click('button[aria-label="Next day"]');
  assert.equal(await page.locator('.day-head h1').innerText(), 'Tuesday, November 3');
  assert.equal(await page.locator('.day-rel').innerText(), 'TOMORROW');
  assert.deepEqual(await texts('.group[data-list=family] .item-text'), ['Mom', 'Dad', 'Aunt Sue']);
  for (let i = 0; i < 5; i++) await page.click('button[aria-label="Next day"]');
  assert.equal(await page.locator('.day-head h1').innerText(), 'Sunday, November 8');
  assert.deepEqual(await texts('.group[data-list=requests] .badge'), ['Last day']);
  await page.click('button[aria-label="Next day"]');
  assert.equal(await page.locator('.group[data-list=requests]').count(), 0);
  await page.click('.back-today');
  assert.equal(await page.locator('.day-head h1').innerText(), 'Monday, November 2');
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
  assert.equal(await page.locator('.group[data-list=trinity] .group-label').innerText(), 'MONDAY');
  assert.deepEqual(await texts('.group[data-list=trinity] .item-text'), ['Bob Carter', 'Maria de la Cruz', 'Tom Smith', 'Ann Zeller']);
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
  await sheet.locator('.chip', { hasText: 'Sun' }).click(); // skip Sundays
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

await step('Diocese: paste a numbered month; today shows day 2', async () => {
  const sheet = await pasteInto('diocese', DIOCESE);
  assert.equal(await sheet.locator('.preview-summary').innerText(), '31 entries on 31 days of the month');
  await sheet.locator('button[type=submit]').click();
  await sheet.waitFor({ state: 'detached' });
  await goToday();
  assert.equal(await page.locator('.group[data-list=diocese] .group-label').innerText(), 'DAY 2');
  assert.deepEqual(await texts('.group[data-list=diocese] .item-text'), ['St. Barnabas’s, Town 2 — The Rev. Rector 2']);
});

await step('Diocese: on November 30 the 31st is included', async () => {
  await page.evaluate(() => window.prayerTracker.setDate('2026-11-30'));
  assert.equal(await page.locator('.group[data-list=diocese] .group-label').innerText(), 'DAYS 30–31');
  assert.equal(await page.locator('.group[data-list=diocese] .item').count(), 2);
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
  assert.equal(await sheet.locator('.preview-summary').innerText(), '4 dates from Nov 1, 2026 to Nov 4, 2026');
  await shot('06-import-acp');
  await sheet.locator('button[type=submit]').click();
  await sheet.waitFor({ state: 'detached' });
  await goToday();
  assert.deepEqual(await texts('.group[data-list=anglican] .item-text'), ['The Diocese of Alpha – (Example)']);
  assert.deepEqual(await texts('.group[data-list=anglican] .item-note'), ['The Rt Revd B. Bishop']);
  await shot('07-today-full');
  await page.locator('.view').screenshot({ path: `${OUT}07-today-full-page.png` });
});

await step('Anglican Cycle: after the last date, a notice asks for the new cycle', async () => {
  await page.evaluate(() => window.prayerTracker.setDate('2026-11-10'));
  assert.match(await page.locator('.notice-card').innerText(), /ends on Nov 4, 2026/);
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
  await eventually(async () => assert.equal(await sheet.locator('.preview-summary').innerText(), '4 dates from Nov 2, 2026 to Nov 5, 2026'), 15000);
  // Merge: those four dates are replaced, Nov 1 is kept.
  assert.match(await sheet.locator('button[type=submit]').innerText(), /^Add 4/);
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
  assert.deepEqual(await texts('.group h2'), ['Anglican Cycle of Prayer', 'Diocesan Cycle', 'Trinity', 'Prayer Requests', 'Family']);
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
  await eventually(async () => assert.equal(await page.locator('.day-head h1').innerText(), 'Tuesday, November 3'));
  assert.equal(await page.locator('.day-rel').innerText(), 'TODAY');
  await page.clock.setFixedTime(new Date('2026-11-02T09:00:00-05:00'));
  await page.reload();
  await page.locator('.day-head h1').waitFor();
});

await step('all prayed shows a closing response', async () => {
  await page.evaluate(() => window.prayerTracker.setDate('2026-11-04'));
  for (;;) {
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
  assert.deepEqual(await texts('.lc-name'), ['Anglican Cycle of Prayer', 'Diocesan Cycle', 'Trinity', 'Prayer Requests', 'Family', 'Clergy']);
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
  assert.equal(await page.locator('.setup-card').count(), 3);

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
  assert.equal(await page.locator('.day-head h1').innerText(), 'Monday, November 2');
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

await writeFile(`${OUT}summary.txt`, `${passed} steps passed\n`);
console.log(`\n${passed} steps passed`);
await browser.close();
server.close();
