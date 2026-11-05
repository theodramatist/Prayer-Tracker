// Builds the public edition into everyone/: Prayer Tracker for anyone, with
// the Anglican Cycle of Prayer, their own church, their own lists, the
// Collect of the Day and the Prayer Book's prayers, kept on their own device.
// It leaves out sync, Share with Trinity, the Diocese of Wisconsin's cycles,
// Morning Prayer lists and Lesser Feasts and Fasts: their modules are
// replaced by the stand-ins in edition/public/, so none of their code or data
// is published there.
//
//   node scripts/build-public.mjs [--out everyone]
//
// Run it after every change to the app, before committing; a unit test
// checks that everyone/ matches what this builds.

import { cp, readFile, rm, writeFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve, relative, sep } from 'node:path';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const i = args.indexOf('--out');
const out = resolve(ROOT, i >= 0 ? args[i + 1] : 'everyone');
// It empties the folder first, so never the app itself or anything that holds it.
if (out === ROOT || ROOT.startsWith(out + sep)) throw new Error(`Won't build into ${out}`);

const STUBS = join(ROOT, 'edition', 'public');
const COPY = ['index.html', 'css', 'fonts', 'icons', 'js', 'vendor'];
// Only the full edition's own modules use these.
const LEAVE_OUT = ['js/data/diocese.js', 'js/share.js'];
const REPLACE = ['js/edition.js', 'js/share-ui.js', 'js/extras.js', 'js/sync.js', 'js/lff.js', 'js/seeds.js'];
const DESCRIPTION = 'Daily intercessions: the Anglican Cycle of Prayer, your church, and your own prayer list, with the Collect of the Day.';

/** Replace exactly one occurrence, or stop: the build must notice when the app changes under it. */
function swap(text, from, to, what) {
  if (text.split(from).length !== 2) throw new Error(`build-public: couldn't find ${what}`);
  return text.replace(from, to);
}

async function files(dir) {
  const outList = [];
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    if ((await stat(p)).isDirectory()) outList.push(...await files(p));
    else outList.push(p);
  }
  return outList;
}

await rm(out, { recursive: true, force: true });
for (const p of COPY) await cp(join(ROOT, p), join(out, p), { recursive: true });
for (const p of LEAVE_OUT) await rm(join(out, p), { force: true });
for (const p of REPLACE) await cp(join(STUBS, p.split('/').pop()), join(out, p));

const manifest = JSON.parse(await readFile(join(ROOT, 'manifest.webmanifest'), 'utf8'));
manifest.description = DESCRIPTION;
await writeFile(join(out, 'manifest.webmanifest'), `${JSON.stringify(manifest, null, 2)}\n`);

let html = await readFile(join(out, 'index.html'), 'utf8');
html = html.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${DESCRIPTION}">`);
html = swap(html, "localStorage.getItem('prayer-tracker:ui')", "localStorage.getItem('prayer-tracker-public:ui')", 'the theme key');
await writeFile(join(out, 'index.html'), html);

// The service worker: caches of its own (the full edition's can share the
// web address), and only the files this edition has.
let sw = await readFile(join(ROOT, 'sw.js'), 'utf8');
sw = swap(sw, 'const CACHE = `prayer-tracker-${VERSION}`;', 'const CACHE = `prayer-tracker-public-${VERSION}`;', 'the cache name');
sw = swap(sw, 'const OWN_CACHE = /^prayer-tracker-\\d/;', 'const OWN_CACHE = /^prayer-tracker-public-\\d/;', 'the cache pattern');
sw = swap(sw, "const ELSEWHERE = new URL('./everyone/', self.location).pathname;\n", '', 'the public folder');
sw = swap(sw, '// The public edition lives in its own folder, with its own service worker.\n', '', 'its comment');
sw = swap(sw, '  if (url.pathname.startsWith(ELSEWHERE)) return;\n', '', 'the public folder check');
for (const p of LEAVE_OUT) sw = swap(sw, `  './${p}',\n`, '', p);
await writeFile(join(out, 'sw.js'), sw);

const assets = [...sw.matchAll(/^\s+'\.\/([^']*)',$/gm)].map((m) => m[1]);
for (const a of assets) if (a && !(await stat(join(out, a)).catch(() => null))) throw new Error(`build-public: sw.js lists ${a}, which isn't in the build`);

await writeFile(join(out, 'install.html'), await readFile(join(STUBS, 'install.html'), 'utf8'));

const all = await files(out);
console.log(`Public edition: ${all.length} files in ${relative(ROOT, out) || '.'}/`);
