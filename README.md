# Prayer Tracker

A web app for daily intercessions that you install on your phone's Home Screen. It
works offline, keeps everything on your device, and can sync between your devices
through a private GitHub repository of your own.

It keeps several kinds of cycle, and shows everything due on a given day in one place:

| Cycle | Repeats | Comes set up as |
| --- | --- | --- |
| **Anglican Cycle of Prayer** | a different diocese or province each day, starting over at the end | *Anglican Cycle of Prayer*, built in: nothing to set up |
| **Diocesan cycle** | a different church each day of the month (1–31) | *Diocesan Cycle*: the Episcopal Diocese of Wisconsin's 97 churches, each with its clergy |
| **Diocesan daily cycle** | one name for each date of the year | *Diocesan Daily Cycle*: the diocese's 2026 Daily Cycle of Prayer |
| **Parish cycle** | a list of names for each weekday, read at Morning Prayer, and everyone every day in your own prayer | *Trinity*: import the member list, or type names First Last; they sort by last name |
| **Daily** | every day, either ongoing or for a set time you choose when adding | *Prayer Requests*, *Family*, *Clergy* |

You can rename, reorder, hide or delete any of these, and make more lists of any type.

## Using it

- **Today** shows the day as a calendar page: the date, the day's feast or Sunday from
  the Episcopal calendar (with its Proper), and a ribbon in the liturgical colour of the
  day. Below come your lists, each opening with a prayer from the Book of Common Prayer;
  tap the prayer to read it in full.
- Tap the circle to mark someone prayed for, and they slide away. Undo is on the message
  at the bottom, and **Show prayed** brings checked entries back.
- **Morning Prayer** comes first on Today: each list you read at the office, as that
  day's names (no notes, which stay private), with **Prayed at Morning Prayer** to mark
  the whole list once. It is kept apart from your own prayer below: marking the list
  checks no one off there, and checking someone off there leaves the list as it is.
  Any list can be read at Morning Prayer (open it, tap **⋯**, **Read at Morning
  Prayer**); *Trinity* comes that way.
- **Prayed for all** under a list marks everyone on it at once.
- **Missed a day?** Cycle entries you didn't check off (the Anglican diocese, the
  diocesan churches and clergy) stay on Today under **From earlier days**, with their
  date, until you pray for them or come round to them again. **Let these go** clears
  them. Lists that bring everyone every day (daily lists, and Trinity in your own
  prayer) simply repeat, so nothing is carried from them, and neither are Morning
  Prayer lists.
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
- **Share with Trinity:** when you add a prayer request (to *Prayer Requests* or another
  daily list), turn on **Share with Trinity**. The request goes to the parish's prayer
  request form exactly as you wrote it, under your name (*Chris Corbin*; change it in
  **Settings → Sharing with Trinity**). Details you add stay private. Only the form's
  other two questions come down: whether it's for someone who has died, and who it may
  be shared with (your last choice is remembered). **Add and share** puts it on your list
  and, a few seconds later (so **Undo** can still stop it), sends it; several lines go as
  several requests. If you're offline it waits on the device and goes when you're back
  online. The request then shows when it was shared. Trinity prays for a request for a
  month, so for an ongoing one, tap it and choose **Share with Trinity again**.
- **Change a list's prayers:** open the list, tap **⋯**, and under Prayers add others
  from the Prayer Book (listed under its own headings), put them in order, change their
  words (say, to name your bishop in *For the Diocese*), write your own, or remove them.
  *Prayer Requests* opens with the prayer from the Great Vigil of Easter ("God and Father
  of all believers…"), then *For All Sorts and Conditions of Men*.
- **Rite One or Rite Two:** Settings → Prayers → Language. The Prayer Book keeps prayers
  written in traditional language as they are, but prints their pronouns and verbs in
  italics "to assist in rendering them into contemporary speech"; those 20 prayers follow
  your choice, rendering just the italic words. The 10 classical prayers it leaves
  unmarked (among them For the Church, For Clergy and People, and All Sorts and
  Conditions) are rendered the same way in Rite Two: you and your for thee, thou, thy and
  thine, with their verbs to match. Prayers already in contemporary language have just
  the one form.
- **Prayers and Thanksgivings:** any of the Prayer Book's 70 prayers and 11 thanksgivings
  (pages 810–841) can be prayed one by one each day. **Lists → Prayers and Thanksgivings →
  Choose prayers** (or Settings → Prayers) opens them under the Prayer Book's headings,
  folded shut, each showing how many you've chosen; search finds a prayer by its words,
  and a check adds it. Each comes up on Today and in pray-through to say and check off;
  tap one to read it in full. You can add your own prayers there too.
- **Colours:** Settings → Colour. *Burgundy* on warm ivory is the default; *Blue* is deep
  blue on linen; *Church year* tints the whole app in the liturgical colour of the day,
  as the ribbon on Today always shows it. Each has a dark version.

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

### The Diocese of Wisconsin's cycles

The app starts with the Episcopal Diocese of Wisconsin's two cycles already in place,
built from its 2026 Sunday-by-Sunday cycle and its 2026 Daily Cycle of Prayer:

- **Diocesan Cycle** (monthly): all 97 churches of the Sunday cycle, one or more each
  day from the 1st to the 28th, in the Sunday cycle's order; the companion churches and
  diocese-wide petitions are on the 29th to the 31st. Under each church are its clergy as
  the daily cycle names them, with their roles (Rector, Priest-in-Charge, Deacon and so
  on). 14 churches have no clergy named in the daily cycle, so none are shown.
- **Diocesan Daily Cycle** (by date): the daily cycle as printed, one entry a day, with
  each person's role and church beneath.

Both are ordinary lists: tap a church to change its clergy, move it to another day, or
delete it, and add new ones with **+**. Your changes sync like anything else. To start
again from the diocese's version, open the list, tap **⋯** and choose **Start again from
the diocese's monthly cycle** (you can undo it).

**Each new year's daily cycle.** When the diocese publishes the next Daily Cycle of
Prayer as a PDF, go to **Lists → Diocesan Daily Cycle → Add dates → Choose a file** and
pick it (on Today, the list also offers **Add more** once its last date has passed). The
app reads the month-by-month layout (a month name, then each day's number and name) and
adds those dates; earlier years stay unless you choose **Replace everything**. The 2026
PDF reads this way to exactly the 307 dates built in.

The monthly cycle doesn't change by itself when clergy move: change the church's
details in the app, or rebuild it from the new daily cycle with
`node scripts/build-diocese.mjs path/to/DailyCycle.pdf --report report.md`. The script holds the
Sunday-by-Sunday cycle as transcribed, matches each clergy listing to its church, and
writes `js/data/diocese.js` and a report of how every church was clergyed and what needs
a look. A few listings needed judgment: the Northern Highlands Benefice clergy are shown
at its four parishes (Hayward, Rice Lake, Spooner, Springbrook), and "Trinity, Wausau"
in the 2026 daily cycle is Trinity, Wauwatosa.

### Setting up the other cycles

**Another diocese's cycle.** Paste one church per line, each starting with its day number:

```
1 The Bishop and diocesan staff
2 St Paul's, Anytown — The Rev. Jane Doe
3 Christ Church, Riverside
```

Lines without a number belong to the day above, so a day can have more than one church.
A list with no numbers at all is read as day 1, day 2, and so on. In shorter months, the
last day also includes the days the month doesn't have (February 28 shows days 28–31),
so no church is missed. You can turn this off in Settings.

**Trinity (weekly).** The quickest way is the parish's member list as a spreadsheet:
**Lists → Trinity → Paste a list → Choose a file**, and pick the CSV (or paste its
contents). It reads the *First Name* and *Last Name* columns and, where it's filled in,
uses the *Preferred Name* instead of the first name. Leave **Spread A–Z** chosen with
Monday to Friday, and everyone is put in last-name order and divided into five even
lists, with people who share a last name on the same day.

Trinity then works in two parts. **At Morning Prayer**, each weekday's names come up at
the top of Today as that day's list, to read aloud and mark once. **In your own
prayer**, everyone on the list comes up every day, to pray for one by one or with
**Pray through the list**; nothing is carried from day to day, since everyone is there
again tomorrow. A name you add goes on its Morning Prayer day by last name, and into
your own prayer every day. In the list's settings (**⋯**) you can turn either part off:
without **Everyone, every day**, your own prayer has only that day's names.

You can also paste names one per line, as `First Last` or `Last, First`. Put a
day name on its own line to start that day's names:

```
Sunday
Mary Adams
John & Sue Baker
Monday
Smith, Tom
```

**Spread over the week** on the list's page does the same for names already there. It
uses the days you chose last time (Monday to Friday unless you change them), gives each
day an even share of the alphabet, and keeps families with the same last name together.
When you add someone new, the app suggests the day where their last name falls.
Sorting understands couples ("John & Mary Smith"), "The Smith Family", titles, suffixes
("Jr."), and surnames like "de la Cruz".

## Getting it on your phone

The app is plain files with no build step and no server, so any static web host works.
GitHub Pages is the simplest:

1. GitHub Pages is free for **public** repositories. This repository is private, so
   either make it public (**Settings → General → Danger Zone → Change visibility**) or
   use a paid GitHub plan. Making it public exposes only the code and the published
   cycles built into it (the Anglican Cycle, and the diocese's churches and clergy): your
   own names, prayer requests and parish list are never stored in this repository.
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
everywhere. Each device fills in the diocese's cycles on its first run, with the same
entries, so a second device adds no duplicates, and a church you deleted stays deleted
however much later a new device joins. The token stays on the device and is never put in backups or in the
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
npm test            # unit tests: dates, names, cycles, carry-forward, church calendar, importers, storage, the diocese's cycles, sync, PWA files
npm run test:e2e    # drives the app in Chromium with Playwright; screenshots in tests/e2e/output/
npm run icons       # re-render the PNG icons from the SVG artwork
```

Layout: `index.html`, `css/app.css`, and ES modules in `js/`:

- `schedule.js` decides what is due on a date, including cycles and carry-forward.
- `calendar.js` holds the BCP 1979 calendar (feasts, named Sundays, Propers, transfers);
  `liturgy.js` works out seasons and Easter.
- `prayers.js` holds the prayers, from `data/prayers.js`: the Prayer Book's Prayers and
  Thanksgivings exactly as printed, built from its PDF by
  `node scripts/build-prayers.mjs path/to/praytnx.pdf`, which also renders the italic
  pronouns and verbs for Rite Two. `bundles.js` and `data/acp.js` hold the built-in
  Anglican Cycle; `seeds.js` and `data/diocese.js` hold the diocese's cycles,
  which are copied into their lists on first run (`scripts/build-diocese.mjs` builds them).
- `importer.js` reads pasted text and `pdf.js` reads PDFs; `names.js` handles
  last-name sorting.
- `store.js` handles storage, with per-entry timestamps and tombstones; `sync.js`
  handles the merge and the GitHub file.
- `today.js`, `praythrough.js`, `lists.js`, `sheets.js` and `settings.js` are the screens.

`sw.js` is the offline cache, and `manifest.webmanifest` makes the app installable.

**Trinity's prayer request form** is set up in `js/share.js`: the form's address, the
code Google gives each question's answer, and the sharing choices word for word. If the
form changes, open it in Google Forms, choose **⋮ → Get pre-filled link**, fill in every
question, and copy the `entry.…` codes from the link into that file. Google doesn't tell
other sites whether it recorded a response, so the app counts a request as shared once it
reaches Google; the share sheet also offers to open the form itself, filled in.

**Releasing a change:** bump the version in both `js/version.js` and `sw.js`. Each copy
looks for a new version when it's opened or comes back to the front (and hourly), and
switches to it straight away if it arrives as the app opens, or else the next time you
come back to it, with a **Reload now** banner on Today meanwhile. A unit test checks that the two
versions match and that `sw.js` lists every app file.

Type: [Fraunces](https://github.com/undercasetype/Fraunces) for headings and prayers and
[Instrument Sans](https://github.com/Instrument/instrument-sans) for lists, both under the
SIL Open Font License and bundled in `fonts/`. PDF reading uses
[pdf.js](https://mozilla.github.io/pdf.js/) 6.4.299 (Apache-2.0), bundled in
`vendor/pdfjs/` and loaded only when you choose a PDF.
