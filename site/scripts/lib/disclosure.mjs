// Detects text the public site must never show: employer and school names
// (the site carries no work history), and details of private infrastructure
// or credentials that could leak through project write-ups.
// Shared by verify-content (source files) and check-dist (built pages).

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Trailing words that don't identify an organisation on their own.
const GENERIC_SUFFIX = /\s+(Group|Inc\.?|Ltd\.?|LLC|Corporation|Corp\.?|Limited)$/i;

/**
 * Patterns for every employer and school named in resume.json. Each school
 * contributes its leading name ("University of Victoria") and any acronym in
 * it ("AKTU"); acronyms match case-sensitively so ordinary words don't trip them.
 */
export function privateNamePatterns(resume) {
  const names = new Set();
  for (const r of resume.experience) {
    names.add(r.company);
    names.add(r.company.replace(GENERIC_SUFFIX, ''));
  }
  for (const e of resume.education) {
    names.add(e.school.split(/[,(]/)[0].trim());
    for (const [acronym] of e.school.matchAll(/\b[A-Z]{3,}\b/g)) names.add(acronym);
  }
  return [...names].filter(Boolean).map((name) => ({
    name,
    re: new RegExp(`\\b${escapeRe(name).replace(/\s+/g, '\\s+')}\\b`, /^[A-Z]{3,}$/.test(name) ? '' : 'i'),
  }));
}

/** Names from `patterns` that appear in `text`. */
export const findPrivateNames = (text, patterns) => patterns.filter((p) => p.re.test(text)).map((p) => p.name);

const PRIVATE_IPV4 = /\b(?:10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])|192\.168|127\.\d{1,3})\.\d{1,3}\.\d{1,3}\b|\b0\.0\.0\.0\b/;
const LEAKS = [
  ['private or loopback IP address', PRIVATE_IPV4],
  ['"localhost"', /\blocalhost\b/i],
  ['host:port', /\b[a-z0-9][a-z0-9.-]*:\d{2,5}\b/i],
  ['internal hostname', /\b[a-z0-9-]+\.(?:local|internal|lan|corp|home\.arpa)\b/i],
  ['URL', /\b[a-z][a-z0-9+.-]*:\/\/|\bwww\./i],
  ['email address', /[^\s@]+@[^\s@]+\.[a-z]{2,}/i],
  ['credential-like string', /\b(?:sk-[A-Za-z0-9-]{10,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})\b/],
  ['long hex string', /\b[0-9a-f]{32,}\b/i],
  ['long token-like string', /(?=[A-Za-z0-9+/_-]*\d)(?=[A-Za-z0-9+/_-]*[A-Za-z])[A-Za-z0-9+/_-]{40,}/],
];

/** Descriptions of infrastructure or credential details found in `text`. */
export const findLeaks = (text) => LEAKS.filter(([, re]) => re.test(text)).map(([label]) => label);
