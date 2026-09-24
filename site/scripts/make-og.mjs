// Renders the social share image (public/og.png, 1200x630) from resume.json
// and approved copy, using a locally installed Chromium-based browser.
// It also writes src/content/og-meta.json with the exact text it used, and
// verify-content fails if that text no longer matches the content, so a
// shared link can't show a stale title or tagline.
//
// Usage: npm run og   (set OG_BROWSER to a Chrome/Edge path if not found)
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const resume = JSON.parse(readFileSync(here('../src/content/resume.json'), 'utf8'));
const copy = JSON.parse(readFileSync(here('../src/content/copy.json'), 'utf8'));

export function ogText() {
  const tagline = copy['hero.tagline'];
  if (!tagline?.approved) throw new Error('hero.tagline must be approved before rendering the share image');
  return {
    name: resume.basics.name,
    // Same presentation rule as the site: clause dashes become commas.
    title: resume.basics.title.replace(/\s+[-\u2013\u2014]+\s+/g, ', '),
    tagline: tagline.text,
    url: 'rishinthel00p.github.io',
  };
}

const esc = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const font = (pkg, file) => pathToFileURL(here(`../node_modules/@fontsource-variable/${pkg}/files/${file}`)).href;

function html(t) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face { font-family: Inter; src: url(${font('inter', 'inter-latin-wght-normal.woff2')}) format('woff2'); font-weight: 100 900; }
  @font-face { font-family: Mono; src: url(${font('jetbrains-mono', 'jetbrains-mono-latin-wght-normal.woff2')}) format('woff2'); font-weight: 100 800; }
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; overflow: hidden; background: #0a0e16; color: #e6e9ef; font-family: Inter, sans-serif; position: relative; }
  .glow { position: absolute; inset: 0; background:
    radial-gradient(520px 420px at 88% 18%, rgba(177,151,252,.28), transparent 70%),
    radial-gradient(480px 380px at 72% 88%, rgba(59,201,219,.22), transparent 70%),
    radial-gradient(420px 360px at 104% 70%, rgba(252,196,25,.16), transparent 70%); }
  .rings { position: absolute; right: 36px; top: 125px; width: 370px; height: 370px; }
  .content { position: absolute; left: 80px; top: 92px; width: 690px; }
  .eyebrow { font-family: Mono; font-size: 22px; letter-spacing: .08em; color: #9aa5b5; text-transform: uppercase; }
  h1 { font-size: 92px; font-weight: 800; letter-spacing: -.04em; line-height: 1; margin: 22px 0 22px; color: #fff; }
  .title { font-family: Mono; font-size: 26px; color: #3bc9db; margin-bottom: 30px; }
  .tagline { font-size: 34px; line-height: 1.3; color: #c9d1dc; font-weight: 500; }
  .url { position: absolute; left: 80px; bottom: 56px; font-family: Mono; font-size: 24px; color: #9aa5b5; }
  .url b { color: #f783ac; font-weight: 600; }
  </style></head><body>
  <div class="glow"></div>
  <svg class="rings" viewBox="0 0 420 420" fill="none">
    <circle cx="210" cy="136" r="112" stroke="#b197fc" stroke-width="5" fill="rgba(177,151,252,.10)"/>
    <circle cx="272" cy="244" r="112" stroke="#3bc9db" stroke-width="5" fill="rgba(59,201,219,.10)"/>
    <circle cx="148" cy="244" r="112" stroke="#fcc419" stroke-width="5" fill="rgba(252,196,25,.10)"/>
    <circle cx="210" cy="208" r="30" fill="#f783ac"/>
    <circle cx="210" cy="199" r="7" fill="#0a0e16"/>
    <path d="M197 223a13 11 0 0 1 26 0z" fill="#0a0e16"/>
  </svg>
  <div class="content">
    <p class="eyebrow">// Rish in the Loop</p>
    <h1>${esc(t.name)}</h1>
    <p class="title">${esc(t.title)}</p>
    <p class="tagline">${esc(t.tagline)}</p>
  </div>
  <p class="url"><b>$</b> ${esc(t.url)}</p>
  </body></html>`;
}

function findBrowser() {
  const candidates = [
    process.env.OG_BROWSER,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error('No Chrome or Edge found; set OG_BROWSER to its path.');
  return found;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const t = ogText();
  const file = join(mkdtempSync(join(tmpdir(), 'og-')), 'og.html');
  writeFileSync(file, html(t));
  const browser = await chromium.launch({ executablePath: findBrowser(), headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: here('../public/og.png'), type: 'png' });
  await browser.close();
  writeFileSync(here('../src/content/og-meta.json'), JSON.stringify(t, null, 2) + '\n');
  console.log('og: wrote public/og.png and src/content/og-meta.json');
}
