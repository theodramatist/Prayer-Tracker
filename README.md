# Prayer Tracker

A web app for daily intercessions that you install on your phone's Home Screen. It
works offline, and everything you enter stays on your device.

It keeps four kinds of cycle, and shows everything due on a given day in one place:

| Cycle | Repeats | Comes set up as |
| --- | --- | --- |
| **Anglican Cycle of Prayer** | a different diocese or province each calendar date | *Anglican Cycle of Prayer* (load the cycle from its PDF) |
| **Diocesan cycle** | a different church each day of the month (1–31) | *Diocesan Cycle* (paste your diocese's list) |
| **Parish cycle** | a different list of names each day of the week | *Trinity*: type names First Last; they sort by last name |
| **Daily** | every day, either ongoing or for a set time you choose when adding | *Prayer Requests*, *Family*, *Clergy* |

You can rename, reorder, hide or delete any of these, and make more lists of any type.

## Using it

- **Today** shows everything for the day, grouped by list. Tap the circle to mark
  someone prayed for, and they slide away. Undo is on the message at the bottom, and
  **Show prayed** brings checked items back. Tomorrow starts fresh.
- Use the **filter chips** to see one list at a time. Use **‹ ›** or tap the date to
  look at another day.
- Tap the big **+** to add someone. Pick the list. For daily lists, also pick how long:
  *Ongoing*, *Today only*, *3 days*, *1 week*, *2 weeks*, *1 month*, *3 months*, or
  *Until…* a date. Paste several lines to add several people at once. The sheet
  remembers the last list and duration you used.
- Tap a name to edit it: add details, change its day, set or remove an end date, move it
  to another list, or delete it.
- The date heading shows the season of the church year, and the accent colour follows
  it (Advent blue, Lent violet, and so on). You can turn this off in Settings.

### Setting up the cycles

**Anglican Cycle of Prayer.** Download the current cycle's PDF from
[anglicancommunion.org](https://www.anglicancommunion.org/resource/from-abu-to-divine-hope-via-zululand/).
Then go to **Lists → Anglican Cycle of Prayer → Add the cycle → Choose a file**. You can
also copy the text and paste it in. Each day's entry has to start with its date. Many
formats work: `Monday 2 November 2026`, `02-Nov-2026`, `Nov 2, 2026`, `2026-11-02`, or a
month heading with `2 Monday` under it. A preview shows what was understood before
anything is saved. The current cycle ends on 31 December 2026. After that, Today
reminds you to add the next one the same way.

**Diocesan cycle.** Paste one church per line, each starting with its day number:

```
1 The Bishop and diocesan staff
2 St Paul's, Anytown — The Rev. Jane Doe
3 Christ Church, Riverside
```

Lines without a number belong to the day above, so a day can have more than one church.
A list with no numbers at all is read as day 1, day 2, and so on. In shorter months, the
last day also includes the days the month doesn't have (February 28 shows days 28–31),
so no church is missed. You can turn this off in Settings.

**Trinity (weekly).** Paste names one per line, as `First Last` or `Last, First`. Put a
day name on its own line to start that day's names:

```
Sunday
Mary Adams
John & Sue Baker
Monday
Smith, Tom
```

You can also paste the whole directory and choose **Spread over the week**. This puts
everyone in last-name order, gives each day an even share of the alphabet, keeps
families with the same last name together, and lets you leave out days such as Sunday.
When you add someone new, the app suggests the day where their last name falls.
Sorting understands couples ("John & Mary Smith"), "The Smith Family", titles, suffixes
("Jr."), and surnames like "de la Cruz".

## Getting it on your phone

The app is plain files with no build step and no server, so any static web host works.
GitHub Pages is the simplest:

1. GitHub Pages is free for **public** repositories. This repository is private, so
   either make it public (**Settings → General → Danger Zone → Change visibility**) or
   use a paid GitHub plan. Making it public exposes only the code: your names and prayer
   requests are never stored in the repository. They live on your phone.
2. Go to **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a
   branch**, then pick `main` and `/ (root)`, and save.
3. After a minute or two the app is at **https://theodramatist.github.io/Prayer-Tracker-/**.

Then install it:

- **iPhone / iPad:** open the link in **Safari**, tap **Share**, then **Add to Home
  Screen**. Always open it from that icon. iOS keeps the Home Screen app's data separate
  from Safari's.
- **Android:** open the link in **Chrome**, tap **⋮**, then **Install app**.
  Long-press the icon for an **Add a prayer request** shortcut, which you can drag onto
  the Home Screen. You can also **Share** text from Messages, email or any app straight
  into Prayer Tracker as a new request.

Web apps can't put true widgets on the Home Screen. On iPhone, quick adding means
opening the app and tapping **+**. On Android, use the shortcut and Share options above.

## Your data and backups

Everything is saved in the browser storage on your device. There are no accounts and
nothing is uploaded. That also means the app can't recover your lists if you lose your
phone. Use **Settings → Save a backup** now and then. On a phone this opens the share
sheet, so you can save the file to Files, iCloud Drive, Google Drive or email.
**Restore a backup** brings everything back on a new phone. After a few days of use,
the app reminds you about once a month.

## Development

Requires Node 20+ and no dependencies.

```
npm start           # serve the app at http://localhost:8080
npm test            # unit tests (dates, names, cycles, importers, storage, PWA files)
npm run test:e2e    # drives the app in Chromium with Playwright; screenshots in tests/e2e/output/
npm run icons       # re-render the PNG icons from the SVG artwork
```

Layout: `index.html`, `css/app.css`, `js/` (ES modules: `schedule.js` decides what is due
on a date, `importer.js` reads pasted text, `names.js` handles last-name sorting,
`store.js` handles storage, and `today.js`, `lists.js`, `sheets.js`, `settings.js` are the
screens), `sw.js` (offline cache), and `manifest.webmanifest`.

**Releasing a change:** bump the version in both `js/version.js` and `sw.js`. Installed
copies then fetch the new files and offer to reload. A unit test checks that the two
versions match and that `sw.js` lists every app file.

PDF reading uses [pdf.js](https://mozilla.github.io/pdf.js/) 6.4.299 (Apache-2.0),
bundled in `vendor/pdfjs/`. It loads only when you choose a PDF.
