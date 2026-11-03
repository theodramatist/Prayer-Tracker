# Prayer Tracker

A web app for daily intercessions that you install on your phone's Home Screen. It
works offline, keeps everything on your device, and can sync between your devices
through a private GitHub repository of your own.

It keeps four kinds of cycle, and shows everything due on a given day in one place:

| Cycle | Repeats | Comes set up as |
| --- | --- | --- |
| **Anglican Cycle of Prayer** | a different diocese or province each day, starting over at the end | *Anglican Cycle of Prayer*, built in: nothing to set up |
| **Diocesan cycle** | a different church each day of the month (1–31) | *Diocesan Cycle* (paste your diocese's list) |
| **Parish cycle** | a different list of names each day of the week | *Trinity*: type names First Last; they sort by last name |
| **Daily** | every day, either ongoing or for a set time you choose when adding | *Prayer Requests*, *Family*, *Clergy* |

You can rename, reorder, hide or delete any of these, and make more lists of any type.

## Using it

- **Today** shows the day as a calendar page: the date, the day's feast or Sunday from
  the Episcopal calendar (with its Proper), and a ribbon in the liturgical colour of the
  day. Below come your lists, each opening with a prayer from the Book of Common Prayer;
  tap the prayer to read it in full.
- Tap the circle to mark someone prayed for, and they slide away. Undo is on the message
  at the bottom, and **Show prayed** brings checked entries back.
- **Missed a day?** Cycle entries you didn't check off (the Anglican diocese, the
  diocesan church, the Trinity names) stay on Today under **From earlier days**, with
  their date, until you pray for them or come round to them again. **Let these go**
  clears them. Daily lists simply repeat, so nothing is carried from them.
- **Pray through the list** opens a quiet full-screen view: each list's prayer, then one
  entry at a time in large type. **Amen** marks it prayed and moves on; **Skip** and
  **Back** (or swipe) move without marking.
- Use the **filter chips** to see one list at a time. Use **‹ ›** or tap the date to
  look at another day.
- Tap the big **+** to add someone. Pick the list. For daily lists, also pick how long:
  *Ongoing*, *Today only*, *3 days*, *1 week*, *2 weeks*, *1 month*, *3 months*, or
  *Until…* a date. Paste several lines to add several people at once.
- Tap a name to edit it: add details, change its day, set or remove an end date, move it
  to another list, or delete it.
- **Change a list's prayer:** open the list, tap **⋯**, and under Prayer choose another
  from the Prayer Book, change its words (say, to name your bishop in *For the Diocese*),
  write your own, or choose none.

### The Anglican Cycle of Prayer

The Anglican Communion's cycle is built into the app, one checkable entry a day: the
diocese, with its province beneath (on Sundays, a whole province). The current cycle,
*From Abu to Divine Hope via Zululand*, runs from 1 September 2023 to 31 December 2026.
That is exactly 174 weeks, so if no newer edition has been added, it starts over on
1 January 2027 and each diocese keeps its weekday.

- If a diocese has merged or been renamed, tap it and change the wording; the original
  is kept underneath so you can restore it. Your edits are listed on the list's page.
- **Lists → Anglican Cycle of Prayer → Load a newer cycle** can also read a new
  edition's PDF on your device.

**Adding the next edition to the app.** The PDF says the next edition, from 1 January
2027, is available at [anglicancommunion.org/prayer](https://www.anglicancommunion.org/prayer).
Build it with

```
node scripts/build-acp.mjs path/to/the-2027-edition.pdf --title "…" --out js/data/acp-2027.js
```

then import it in `js/bundles.js` and add it to the end of `BUNDLES.acp`. Each date uses
the edition that has begun by then, so the app moves to the new edition on its first day.
The current edition was built the same way, into `js/data/acp.js`. The builder reads the
bold entries and leaves out the PDF's italic labels ("Season of Creation", "Advent 1"),
because the app shows the Episcopal calendar instead.

The Anglican Cycle of Prayer is © The Anglican Consultative Council 2023. It may be
freely copied and shared on the condition that no charge is made for its use.

### Setting up the other cycles

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
   requests are never stored in this repository.
2. Go to **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a
   branch**, then pick `main` and `/ (root)`, and save.
3. After a minute or two the app is at **https://theodramatist.github.io/Prayer-Tracker/**.

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

## Sync across devices

**Settings → Sync across devices** keeps the same lists on your phone, iPad and
computer. They're stored as one file, `prayer-tracker.json`, in a **private** GitHub
repository you own (keep it separate from this one, which may be public):

1. Create a new private repository, for example `prayer-data`.
2. Make a [fine-grained access token](https://github.com/settings/personal-access-tokens/new):
   under *Repository access* choose *Only select repositories* and pick that repository;
   under *Permissions* set *Contents* to *Read and write*.
3. In the app, enter the repository (`yourname/prayer-data`) and the token. Do the same on
   each device; the same token works on all of them.

Each device keeps working offline. When it syncs (on opening, every few minutes, and
shortly after a change), it merges its copy with the file: the newest change to each
entry wins, deletions are respected, and check-offs made on any device count
everywhere. The token stays on the device and is never put in backups or in the
synced file. The app refuses a public repository.

## Your data and backups

Everything is saved in the browser storage on your device. Without sync nothing leaves
it, and the app can't recover your lists if you lose your phone. Use **Settings → Save
a backup** now and then. On a phone this opens the share sheet, so you can save the
file to Files, iCloud Drive, Google Drive or email. **Restore a backup** brings
everything back on a new phone.

## Development

Requires Node 20+ and no dependencies.

```
npm start           # serve the app at http://localhost:8080
npm test            # unit tests: dates, names, cycles, carry-forward, church calendar, importers, storage, sync, PWA files
npm run test:e2e    # drives the app in Chromium with Playwright; screenshots in tests/e2e/output/
npm run icons       # re-render the PNG icons from the SVG artwork
```

Layout: `index.html`, `css/app.css`, and ES modules in `js/`:

- `schedule.js` decides what is due on a date, including cycles and carry-forward.
- `calendar.js` holds the BCP 1979 calendar (feasts, named Sundays, Propers, transfers);
  `liturgy.js` works out seasons and Easter.
- `prayers.js` holds the Prayer Book prayers; `bundles.js` and `data/acp.js` hold the
  built-in cycle.
- `importer.js` reads pasted text and `pdf.js` reads PDFs; `names.js` handles
  last-name sorting.
- `store.js` handles storage, with per-entry timestamps and tombstones; `sync.js`
  handles the merge and the GitHub file.
- `today.js`, `praythrough.js`, `lists.js`, `sheets.js` and `settings.js` are the screens.

`sw.js` is the offline cache, and `manifest.webmanifest` makes the app installable.

**Releasing a change:** bump the version in both `js/version.js` and `sw.js`. Installed
copies then fetch the new files and offer to reload. A unit test checks that the two
versions match and that `sw.js` lists every app file.

Type: [Fraunces](https://github.com/undercasetype/Fraunces) for headings and prayers and
[Instrument Sans](https://github.com/Instrument/instrument-sans) for lists, both under the
SIL Open Font License and bundled in `fonts/`. PDF reading uses
[pdf.js](https://mozilla.github.io/pdf.js/) 6.4.299 (Apache-2.0), bundled in
`vendor/pdfjs/` and loaded only when you choose a PDF.
