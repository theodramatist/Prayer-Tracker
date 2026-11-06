// Builds the editions of Prayer Tracker for anyone, each into a folder of its
// own beside the full edition, from this app:
//
//   everyone/        the public edition: the Anglican Cycle of Prayer, your
//                    church, your own lists, the Collect of the Day, the Prayer
//                    Book's prayers, and Lesser Feasts and Fasts from your own
//                    copy of the PDF, kept on your own device;
//   wisconsin/       the same, with the Diocese of Wisconsin's two cycles;
//   eastern-ridges/  the same as wisconsin/, with the Eastern Ridges clergy.
//
// None of them has sync, Share with Trinity or Morning Prayer lists: the full
// edition's own modules are replaced by the stand-ins in edition/public/, so
// none of their code or data is published there. Each edition is a stack of
// layers copied over the app: edition/public/, then edition/<name>/.
//
//   node scripts/build-editions.mjs [--root dir]
//
// Run it after every change to the app, before committing; a unit test checks
// that each folder matches what this builds. --root builds them into another
// folder instead (the tests use it).

import { cp, readFile, rm, writeFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve, relative, sep } from 'node:path';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const i = args.indexOf('--root');
const into = resolve(ROOT, i >= 0 ? args[i + 1] : '.');

export const EDITIONS = [
  {
    dir: 'everyone',
    layers: ['public'],
    leaveOut: ['js/data/diocese.js', 'js/diocesan-seed.js', 'js/share.js'],
    storage: 'prayer-tracker-public',
    description: 'Daily intercessions: the Anglican Cycle of Prayer, your church, and your own prayer list, with the Collect of the Day.',
  },
  {
    dir: 'wisconsin',
    layers: ['public', 'wisconsin'],
    leaveOut: ['js/share.js'],
    storage: 'prayer-tracker-wisconsin',
    description: 'Daily intercessions for the Diocese of Wisconsin: its cycles of prayer, the Anglican Cycle of Prayer, your church, and your own prayer list, with the Collect of the Day.',
  },
  {
    dir: 'eastern-ridges',
    layers: ['public', 'wisconsin', 'eastern-ridges'],
    leaveOut: ['js/share.js'],
    storage: 'prayer-tracker-eastern-ridges',
    description: 'Daily intercessions for the Eastern Ridges clergy: one another, the Diocese of Wisconsin’s cycles of prayer, the Anglican Cycle of Prayer, your church, and your own prayer list.',
  },
];

/** Replace exactly one occurrence, or stop: the build must notice when the app changes under it. */
function swap(text, from, to, what) {
  if (text.split(from).length !== 2) throw new Error(`build-editions: couldn't find ${what}`);
  return text.replace(from, to);
}

async function files(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    if ((await stat(p)).isDirectory()) out.push(...await files(p));
    else out.push(p);
  }
  return out;
}

async function build(ed) {
  const out = join(into, ed.dir);
  // It empties the folder first, so never the app itself or anything that holds it.
  if (out === ROOT || ROOT.startsWith(out + sep)) throw new Error(`Won't build into ${out}`);
  await rm(out, { recursive: true, force: true });
  for (const p of ['index.html', 'css', 'fonts', 'icons', 'js', 'vendor']) await cp(join(ROOT, p), join(out, p), { recursive: true });
  for (const layer of ed.layers) await cp(join(ROOT, 'edition', layer), out, { recursive: true });
  for (const p of ed.leaveOut) await rm(join(out, p), { force: true });

  const manifest = JSON.parse(await readFile(join(ROOT, 'manifest.webmanifest'), 'utf8'));
  manifest.description = ed.description;
  await writeFile(join(out, 'manifest.webmanifest'), `${JSON.stringify(manifest, null, 2)}\n`);

  let html = await readFile(join(out, 'index.html'), 'utf8');
  html = html.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${ed.description}">`);
  html = swap(html, "localStorage.getItem('prayer-tracker:ui')", `localStorage.getItem('${ed.storage}:ui')`, 'the theme key');
  await writeFile(join(out, 'index.html'), html);

  // The service worker: caches of its own (the editions share one web
  // address), and every file this edition has, and only those.
  const all = (await files(out)).map((p) => relative(out, p).split(sep).join('/'));
  const assets = ['', 'index.html', 'manifest.webmanifest', ...all.filter((p) => /^(css|fonts|icons|js)\//.test(p) && p !== 'icons/icon.svg').sort()];
  let sw = await readFile(join(ROOT, 'sw.js'), 'utf8');
  sw = swap(sw, 'const CACHE = `prayer-tracker-${VERSION}`;', `const CACHE = \`${ed.storage}-\${VERSION}\`;`, 'the cache name');
  sw = swap(sw, 'const OWN_CACHE = /^prayer-tracker-\\d/;', `const OWN_CACHE = /^${ed.storage}-\\d/;`, 'the cache pattern');
  sw = swap(sw, "// The editions for anyone live in folders of their own, each with its own service worker.\nconst ELSEWHERE = ['everyone', 'wisconsin', 'eastern-ridges'].map((d) => new URL(`./${d}/`, self.location).pathname);\n", '', 'the editions’ folders');
  sw = swap(sw, '  if (ELSEWHERE.some((p) => url.pathname.startsWith(p))) return;\n', '', 'the editions’ folder check');
  sw = sw.replace(/const ASSETS = \[[\s\S]*?\];/, `const ASSETS = [\n${assets.map((a) => `  './${a}',`).join('\n')}\n];`);
  await writeFile(join(out, 'sw.js'), sw);
  return all.length + 1;
}

for (const ed of EDITIONS) {
  const n = await build(ed);
  console.log(`${ed.dir}/: ${n} files`);
}
