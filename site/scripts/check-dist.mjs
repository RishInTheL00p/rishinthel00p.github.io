// Security checks on the built site (dist/). Fails (exit 1) if any page:
//   - lacks exactly one CSP <meta>, or its policy allows unsafe sources
//   - has an inline <script>/<style> whose SHA-256 hash isn't in the policy
//   - has inline style="" or on*="" event-handler attributes
//   - links with javascript: or plain http:, or opens a new tab without
//     rel="noopener noreferrer"
//
// Usage: node scripts/check-dist.mjs [distDir]
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_DIRECTIVES = {
  'default-src': "'none'",
  'base-uri': "'none'",
  'object-src': "'none'",
  'form-action': "'none'",
};
const FORBIDDEN_SOURCES = ["'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'", '*', 'data:', 'http:', 'https:'];
// data: is allowed only for images (inline SVG backgrounds).
const DATA_ALLOWED = new Set(['img-src']);

const sha256 = (s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;

export function parseCsp(policy) {
  const map = new Map();
  for (const part of policy.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) map.set(name.toLowerCase(), values);
  }
  return map;
}

/** Returns a list of problems for one HTML document. */
export function checkHtml(html) {
  const errors = [];
  const metas = [...html.matchAll(/<meta\s+http-equiv="content-security-policy"\s+content="([^"]*)"/gi)];
  if (metas.length !== 1) {
    errors.push(`expected 1 CSP <meta>, found ${metas.length}`);
    return errors;
  }
  const csp = parseCsp(metas[0][1].replace(/&#39;/g, "'").replace(/&amp;/g, '&'));

  for (const [name, value] of Object.entries(REQUIRED_DIRECTIVES)) {
    if (csp.get(name)?.join(' ') !== value) errors.push(`CSP ${name} must be ${value}`);
  }
  for (const [name, values] of csp) {
    for (const v of values) {
      if (v === 'data:' && DATA_ALLOWED.has(name)) continue;
      if (FORBIDDEN_SOURCES.includes(v)) errors.push(`CSP ${name} allows ${v}`);
    }
  }

  const scriptSrc = csp.get('script-src') ?? [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\b[^>]*>/gi)) {
    const [, attrs, body] = m;
    if (/\bsrc=/.test(attrs)) continue;
    if (/type="application\/(ld\+)?json"/i.test(attrs)) continue; // data, not executed
    if (!scriptSrc.includes(sha256(body))) errors.push(`inline <script> not covered by a CSP hash: ${body.slice(0, 60)}…`);
  }
  const styleSrc = csp.get('style-src') ?? [];
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\b[^>]*>/gi)) {
    if (!styleSrc.includes(sha256(m[1]))) errors.push(`inline <style> not covered by a CSP hash`);
  }

  // In-page links must point at an element that exists on the same page.
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const [, target] of html.matchAll(/\shref="#([^"]+)"/g)) {
    if (!ids.has(target)) errors.push(`broken in-page link: #${target}`);
  }

  // House style: no em dashes anywhere on the site, literal or as entities.
  if (/\u2014|&mdash;|&#8212;|&#x2014;/i.test(html)) errors.push('page contains an em dash');

  // Attributes, checked on tag markup only (not text or script bodies).
  let withoutScripts = html;
  let previous;
  do {
    previous = withoutScripts;
    withoutScripts = withoutScripts.replace(/<script\b[\s\S]*?<\/script\b[^>]*>/gi, '');
  } while (withoutScripts !== previous);
  for (const [tag] of withoutScripts.matchAll(/<[a-z][a-z0-9-]*\b[^>]*>/gi)) {
    if (/\sstyle\s*=/i.test(tag)) errors.push(`inline style attribute: ${tag.slice(0, 80)}`);
    if (/\son[a-z]+\s*=/i.test(tag)) errors.push(`inline event handler: ${tag.slice(0, 80)}`);
    for (const [, attr, url] of tag.matchAll(/\s(href|src|action|formaction)\s*=\s*"([^"]*)"/gi)) {
      if (/^\s*javascript:/i.test(url)) errors.push(`javascript: URL in ${attr}`);
      if (/^\s*http:/i.test(url)) errors.push(`insecure http: URL in ${attr}: ${url}`);
    }
    if (/\starget\s*=\s*"_blank"/i.test(tag)) {
      const rel = /\srel\s*=\s*"([^"]*)"/i.exec(tag)?.[1].split(/\s+/) ?? [];
      if (!rel.includes('noopener') || !rel.includes('noreferrer')) {
        errors.push(`target="_blank" without rel="noopener noreferrer": ${tag.slice(0, 80)}`);
      }
    }
  }
  return errors;
}

/** Stylesheets may only load resources the CSP allows; data: URLs are allowed
 *  for images only (img-src), so anything else inlined as data: is blocked. */
export function checkCss(css) {
  const errors = [];
  for (const [, url] of css.matchAll(/url\(\s*["']?(data:[^;,)"']*)/gi)) {
    if (!/^data:image\//i.test(url)) errors.push(`CSS inlines ${url.slice(0, 30)}… as a data: URL (blocked by CSP)`);
  }
  return errors;
}

function filesWithExt(dir, ext) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return filesWithExt(p, ext);
    return name.endsWith(ext) ? [p] : [];
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dist = process.argv[2] ?? fileURLToPath(new URL('../dist', import.meta.url));
  const files = filesWithExt(dist, '.html');
  if (!files.length) {
    console.error(`check-dist: no HTML files in ${dist}. Build first.`);
    process.exit(1);
  }
  let problems = 0;
  const checks = [
    ...files.map((f) => [f, checkHtml]),
    ...filesWithExt(dist, '.css').map((f) => [f, checkCss]),
  ];
  for (const [f, check] of checks) {
    for (const e of check(readFileSync(f, 'utf8'))) {
      console.error(`  FAIL  ${relative(dist, f)}: ${e}`);
      problems++;
    }
  }
  if (problems) {
    console.error(`check-dist: ${problems} problem(s).`);
    process.exit(1);
  }
  console.log(`check-dist: OK (${files.length} page(s))`);
}
