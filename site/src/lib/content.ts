// Loads and validates the content files at build time. Pages read facts only
// through this module, so an invalid file or unapproved copy stops the build.
import resumeRaw from '../content/resume.json';
import pillarsRaw from '../content/pillars.json';
import copyRaw from '../content/copy.json';
import { ResumeSchema, PillarsSchema, CopySchema } from '../content/schema.ts';

export const resume = ResumeSchema.parse(resumeRaw);
export const pillarData = PillarsSchema.parse(pillarsRaw);
const copyData = CopySchema.parse(copyRaw);

/** Owner-approved site wording. Throws on a missing or unapproved key. */
export function copy(key: string): string {
  const entry = copyData[key];
  if (!entry) throw new Error(`copy.json: missing "${key}"`);
  if (!entry.approved) throw new Error(`copy.json: "${key}" is not approved`);
  return entry.text;
}

export type Bullet = { id: string; text: string };
const bulletIndex = new Map<string, Bullet>(
  resume.experience.flatMap((r) => r.bullets.map((b) => [b.id, b] as const)),
);
export const hasBullet = (id: string) => bulletIndex.has(id);
export function bullet(id: string): Bullet {
  const b = bulletIndex.get(id);
  if (!b) throw new Error(`Unknown bullet "${id}"`);
  return b;
}

export const interest = (id: string) => {
  const i = resume.interests.find((x) => x.id === id);
  if (!i) throw new Error(`Unknown interest "${id}"`);
  return i;
};

/** Splits "**bold**" markup into text runs. Rendered as elements, never as HTML. */
export function richParts(text: string): { text: string; bold: boolean }[] {
  return text
    .split('**')
    .map((t, i) => ({ text: t, bold: i % 2 === 1 }))
    .filter((p) => p.text.length > 0);
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** "Sept 2021" → sortable number (year * 12 + month). "Present" sorts last. */
export function monthIndex(value: string): number {
  if (value === 'Present') return Number.MAX_SAFE_INTEGER;
  const [month = '', year = ''] = value.split(' ');
  const m = MONTHS.indexOf(month.slice(0, 3).toLowerCase());
  if (m < 0 || !/^\d{4}$/.test(year)) throw new Error(`Unrecognized date "${value}"`);
  return Number(year) * 12 + m;
}

/** "more than 7 years" in the verbatim summary → 7. Never computed from dates. */
export function statedYears(): number {
  const m = /more than \*\*(\d+) years/.exec(resume.basics.summary);
  if (!m) throw new Error('Summary no longer states years of expertise');
  return Number(m[1]);
}

export const siteRepoUrl = 'https://github.com/RishInTheL00p/rishinthel00p.github.io';
