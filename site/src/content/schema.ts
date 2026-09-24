// Shape of the site's content files. Strict objects reject unknown keys, so a
// typo or an unreviewed field fails the build instead of rendering silently.
// Plain TypeScript (erasable syntax only) so Node can import it without a build step.
import { z } from 'zod';

const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lowercase-kebab id');
const text = z.string().trim().min(1);
const monthYear = z
  .string()
  .regex(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{4}$/, 'e.g. "Aug 2025"');
const httpsUrl = z.url().refine((u) => u.startsWith('https://'), 'must be https');

export const ResumeSchema = z.strictObject({
  basics: z.strictObject({
    name: text,
    title: text,
    location: text,
    summary: text,
    profiles: z.array(z.strictObject({ network: text, url: httpsUrl })).min(1),
  }),
  experience: z
    .array(
      z.strictObject({
        id,
        company: text,
        location: text,
        title: text,
        start: monthYear,
        end: z.union([monthYear, z.literal('Present')]),
        bullets: z.array(z.strictObject({ id, text })).min(1),
      }),
    )
    .min(1),
  education: z.array(
    z.strictObject({ id, degree: text, school: text, location: text, start: monthYear, end: monthYear }),
  ),
  skills: z.array(z.strictObject({ group: id, items: z.array(text).min(1) })).min(1),
  certifications: z.array(
    z.strictObject({ id, name: text, short: text, earned: monthYear, verifyUrl: httpsUrl.nullable() }),
  ),
  interests: z.array(z.strictObject({ id, text })),
});

export const PillarsSchema = z.strictObject({
  pillars: z
    .array(
      z.strictObject({
        id,
        highlights: z.array(id).min(1),
        tools: z.array(text).min(1),
        frameworks: z.array(text).min(1),
      }),
    )
    .length(3),
  centre: z.strictObject({ sources: z.array(z.string()).min(1) }),
});

export const CopySchema = z.record(
  z.string().regex(/^[a-z0-9.-]+$/, 'copy key'),
  z.strictObject({
    text,
    // IDs of the resume entries this wording is based on.
    sources: z.array(z.string()).min(1),
    // Set to true only by the site owner after reviewing the wording.
    approved: z.boolean(),
  }),
);

export type Resume = z.infer<typeof ResumeSchema>;
export type Pillars = z.infer<typeof PillarsSchema>;
export type Copy = z.infer<typeof CopySchema>;
