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

// The five portfolio projects, in display order. Each is shown standalone;
// only the overview may relate them, and only as a future vision.
export const PROJECT_IDS = ['conflux', 'oracle', 'cadence', 'forge', 'proving-ground'] as const;
const projectId = z.enum(PROJECT_IDS);
// "<project>.<slug>", e.g. "oracle.adjudicator". The prefix names the repo it quotes.
const sourceId = z.string().regex(/^[a-z0-9-]+\.[a-z0-9.-]+$/, 'source id like "oracle.adjudicator"');
// Path inside a project repo: relative, forward slashes, never climbing out.
const repoPath = z
  .string()
  .regex(/^(?!\/)(?![A-Za-z]:)[\w.-]+(\/[\w.-]+)*$/, 'relative repo path')
  .refine((p) => !p.split('/').includes('..'), 'must not contain ".."');

export const ProjectsSchema = z.strictObject({
  projects: z
    .array(
      z.strictObject({
        id: projectId,
        name: text,
        orchestrator: text,
        stages: z
          .array(
            z.strictObject({
              id,
              kind: z.enum(['input', 'deterministic', 'agent', 'gate', 'human', 'output']),
              sources: z.array(sourceId).min(1),
            }),
          )
          .min(4)
          .max(6),
        // Where a person makes the call in this project's flow.
        human: z.strictObject({ stage: id, sources: z.array(sourceId).min(1) }),
        stack: z.array(text).min(1),
      }),
    )
    .max(PROJECT_IDS.length),
  overview: z.strictObject({
    status: z.literal('future'),
    flow: z.array(projectId).min(2),
    feedback: projectId,
  }),
  // Verbatim quotes from the private repos backing every project claim.
  // Published with the site's source, so they are screened like copy.
  sources: z.record(
    sourceId,
    z.strictObject({
      repo: projectId,
      path: repoPath,
      commit: z.string().regex(/^[0-9a-f]{7,40}$/, 'git commit sha'),
      quote: text,
    }),
  ),
});

export type Resume = z.infer<typeof ResumeSchema>;
export type Pillars = z.infer<typeof PillarsSchema>;
export type Copy = z.infer<typeof CopySchema>;
export type Projects = z.infer<typeof ProjectsSchema>;
