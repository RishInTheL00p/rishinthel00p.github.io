// Project views: projects.json joined with its owner-approved wording, shared
// by the homepage section and the technical pages so both show the same facts.
import { projectData, copy } from './content.ts';
import type { Projects } from '../content/schema.ts';

type Kind = Projects['projects'][number]['stages'][number]['kind'];

/** One plain-language tag per kind of step, so a visitor learns the legend once. */
export const KIND_LABEL: Record<Kind, string> = {
  input: 'Input',
  deterministic: 'Rule-based',
  agent: 'AI agent',
  gate: 'Gate',
  human: 'Human',
  output: 'Output',
};
export const LEGEND_KINDS: Kind[] = ['deterministic', 'agent', 'gate', 'human'];

export const projectHref = (id: string) => `/projects/${id}/`;
export const overviewHref = '/projects/overview/';

export const projects = projectData.projects.map((p) => ({
  id: p.id,
  name: p.name,
  orchestrator: p.orchestrator,
  stack: p.stack,
  href: projectHref(p.id),
  tagline: copy(`project.${p.id}.tagline`),
  meaning: copy(`project.${p.id}.name-meaning`),
  summary: copy(`project.${p.id}.summary`),
  human: copy(`project.${p.id}.human`),
  stages: p.stages.map((s) => ({
    id: s.id,
    kind: s.kind,
    label: copy(`project.${p.id}.stage.${s.id}.label`),
    plain: copy(`project.${p.id}.stage.${s.id}.plain`),
    detail: copy(`project.${p.id}.stage.${s.id}.detail`),
  })),
}));
export type ProjectView = (typeof projects)[number];

/** The future System Overview. Only this view relates projects to each other. */
export const overview = {
  flow: projectData.overview.flow,
  feedback: projectData.overview.feedback,
  title: copy('overview.title'),
  body: copy('overview.body'),
  disclaimer: copy('overview.disclaimer'),
};

export const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? id;
