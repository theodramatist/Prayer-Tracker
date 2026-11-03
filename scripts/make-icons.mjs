// Draws the app icon (a lit votive candle on burgundy) and renders the PNG sizes the
// manifest and iOS need: `npm run icons`.
import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const OUT = fileURLToPath(new URL('../icons/', import.meta.url));

/** Full-bleed artwork on a 512 grid; everything important sits inside the maskable safe zone. */
function art({ rounded }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8e2a39"/>
      <stop offset="1" stop-color="#4f1420"/>
    </linearGradient>
    <radialGradient id="glow" cx="256" cy="190" r="170" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffd977" stop-opacity=".55"/>
      <stop offset=".45" stop-color="#ffcc5c" stop-opacity=".16"/>
      <stop offset="1" stop-color="#ffcc5c" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="wax" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fffaf0"/>
      <stop offset=".7" stop-color="#f6eedc"/>
      <stop offset="1" stop-color="#e6d9bd"/>
    </linearGradient>
    <linearGradient id="flame" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffd25e"/>
      <stop offset="1" stop-color="#f29a2e"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" ${rounded ? 'rx="112"' : ''} fill="url(#bg)"/>
  <circle cx="256" cy="190" r="170" fill="url(#glow)"/>
  <path d="M256 112c30 36 44 62 44 90 0 27-19 46-44 46s-44-19-44-46c0-28 14-54 44-90z" fill="url(#flame)"/>
  <path d="M256 160c15 19 22 32 22 46 0 14-10 24-22 24s-22-10-22-24c0-14 7-27 22-46z" fill="#fff4cf"/>
  <rect x="252" y="244" width="8" height="22" rx="4" fill="#3a2f22"/>
  <rect x="198" y="262" width="116" height="160" rx="16" fill="url(#wax)"/>
  <path d="M230 262h22v26a11 11 0 0 1-22 0z" fill="#fffdf7" opacity=".9"/>
  <ellipse cx="256" cy="424" rx="104" ry="18" fill="#c9a24a"/>
  <ellipse cx="256" cy="418" rx="84" ry="10" fill="#e5c26a"/>
</svg>`;
}

const targets = [
  { file: 'icon-192.png', size: 192, rounded: true },
  { file: 'icon-512.png', size: 512, rounded: true },
  { file: 'icon-maskable-512.png', size: 512, rounded: false },
  { file: 'apple-touch-icon.png', size: 180, rounded: false },
  { file: 'favicon-32.png', size: 32, rounded: true },
];

await mkdir(OUT, { recursive: true });
await writeFile(`${OUT}favicon.svg`, art({ rounded: true }));
await writeFile(`${OUT}icon.svg`, art({ rounded: false }));

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${t.size}px;height:${t.size}px}</style>${art(t)}`);
  await page.screenshot({ path: `${OUT}${t.file}`, omitBackground: true });
  console.log('wrote', t.file);
}
await browser.close();
