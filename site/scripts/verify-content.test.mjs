// Proves the provenance check catches drift, invented facts and unapproved copy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadInputs, verifyContent } from './verify-content.mjs';
import { PROJECT_IDS } from '../src/content/schema.ts';

const base = loadInputs();
// The resume source is private (gitignored), so CI has no .tex. Tests that
// compare against it run only where it exists, on the owner's machine.
const needsTex = { skip: base.tex === null && 'private resume .tex not present (verify:resume runs locally)' };
const approveAll = (copy) =>
  Object.fromEntries(Object.entries(copy).map(([k, v]) => [k, { ...v, approved: true }]));
const isProjectKey = (k) => /^(project|projects|overview)\./.test(k);
const withoutProjectCopy = (copy) => Object.fromEntries(Object.entries(copy).filter(([k]) => !isProjectKey(k)));

/**
 * A minimal valid set of five projects and their copy, so the project rules
 * are tested independently of the real (owner-reviewed) project content.
 */
function projectFixture() {
  const sources = {};
  const copy = {};
  const say = (key, text, cited) => { copy[key] = { text, sources: cited, approved: true }; };
  const projects = PROJECT_IDS.map((id) => {
    const src = `${id}.readme`;
    sources[src] = {
      repo: id, path: 'README.md', commit: 'abc1234',
      quote: 'A Python service with 3 deterministic checks, orchestrated in Tracecat, never touching 169.254.169.254.',
    };
    const stages = [['intake', 'input'], ['check', 'deterministic'], ['review', 'human'], ['report', 'output']]
      .map(([sid, kind]) => ({ id: sid, kind, sources: [src] }));
    for (const k of ['tagline', 'name-meaning', 'summary', 'human']) say(`project.${id}.${k}`, `Wording for ${k}.`, [src]);
    for (const s of stages) for (const k of ['label', 'plain', 'detail']) say(`project.${id}.stage.${s.id}.${k}`, `Stage ${k}.`, [src]);
    return { id, name: id.toUpperCase().replace('-', ' '), orchestrator: 'Tracecat', stages, human: { stage: 'review', sources: [src] }, stack: ['Python'] };
  });
  for (const k of ['projects.heading', 'projects.lede', 'overview.title', 'overview.body']) say(k, 'Section wording.', ['site']);
  say('overview.disclaimer', 'A future vision: these connections are not built yet.', ['site']);
  const overview = { status: 'future', flow: ['conflux', 'oracle', 'cadence', 'forge'], feedback: 'proving-ground' };
  return { projects: { projects, overview, sources }, copy };
}

/** Real resume content plus the project fixture, all approved, then modified by `mutate`. */
function run(mutate = () => {}) {
  const fixture = projectFixture();
  const inputs = structuredClone({
    ...base,
    copy: { ...withoutProjectCopy(approveAll(base.copy)), ...fixture.copy },
    projects: fixture.projects,
  });
  mutate(inputs);
  return verifyContent(inputs);
}
const expectError = (result, pattern) =>
  assert.ok(result.errors.some((e) => pattern.test(e)), `expected an error matching ${pattern}, got:\n${result.errors.join('\n')}`);
const project = (inputs, id) => inputs.projects.projects.find((p) => p.id === id);

test('current content passes once copy is approved', () => {
  assert.deepEqual(run().errors, []);
});

test('unapproved copy fails unless drafts are allowed', () => {
  const inputs = structuredClone(base);
  inputs.copy['hero.tagline'].approved = false;
  expectError(verifyContent(inputs), /hero\.tagline.*not yet approved/);
  assert.ok(!verifyContent(inputs, { allowUnapproved: true }).errors.some((e) => /hero\.tagline/.test(e)));
});

test('a bullet edited only in resume.json fails', needsTex, () => {
  expectError(run((i) => { i.resume.experience[0].bullets[0].text += ' by 40%'; }), /experience\.mag\.bullets/);
});

test('a bullet edited only in the .tex fails', needsTex, () => {
  expectError(run((i) => { i.tex = i.tex.replace('Watch and play soccer religiously', 'Watch soccer'); }), /interests/);
});

test('a bullet added to the .tex but not the site fails', needsTex, () => {
  expectError(run((i) => { i.tex = i.tex.replace('to track threats and security issues.', 'to track threats and security issues. \\\\ - Did something new.'); }), /experience\.ericsson\.bullets/);
});

test('changed bold emphasis fails', needsTex, () => {
  expectError(run((i) => { i.resume.experience[0].bullets[0].text = i.resume.experience[0].bullets[0].text.replace('**Owned', 'Owned').replace('lifecycle**', 'lifecycle'); }), /experience\.mag\.bullets/);
});

test('an inflated title or changed date fails', needsTex, () => {
  expectError(run((i) => { i.resume.experience[2].title = 'Malware Research Analyst'; }), /experience \(company/);
  expectError(run((i) => { i.resume.experience[3].start = 'Jan 2017'; }), /experience \(company/);
});

test('a skill the resume never mentions fails', needsTex, () => {
  expectError(run((i) => { i.resume.skills[0].items.push('Rust'); }), /skill not found in \.tex: "Rust"/);
});

test('dropping a resume skill from the site fails', needsTex, () => {
  expectError(run((i) => { i.resume.skills[1].items = i.resume.skills[1].items.filter((s) => s !== 'Nmap'); }), /missing from site: "Nmap"/);
});

test('a certification with a changed date fails', needsTex, () => {
  expectError(run((i) => { i.resume.certifications[4].earned = 'November 2024'; }), /certifications/);
});

test('a number not in the cited sources fails', () => {
  expectError(run((i) => { i.copy['headline.mag-4'].text = 'Dashboards that cut exposure by 60%'; }), /number "60%"/);
});

test('without the .tex, the resume comparison is skipped with a warning, or fails when required', () => {
  const result = run((i) => { i.tex = null; });
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some((w) => /resume comparison skipped/.test(w)));
  const fixture = projectFixture();
  const strict = verifyContent(
    { ...structuredClone(base), tex: null, copy: { ...withoutProjectCopy(approveAll(base.copy)), ...fixture.copy }, projects: fixture.projects },
    { requireResume: true },
  );
  expectError(strict, /resume .tex not present/);
});

test('checks on the content files still run without the .tex', () => {
  expectError(run((i) => { i.tex = null; i.pillars.pillars[0].tools.push('Python'); }), /equal tools counts/);
  expectError(run((i) => { i.tex = null; i.copy['headline.mag-4'].text = 'Dashboards that cut exposure by 60%'; }), /number "60%"/);
});

test('unequal pillars fail', () => {
  expectError(run((i) => { i.pillars.pillars[0].tools.push('Python'); }), /equal tools counts/);
});

test('a pillar tool not in the resume fails', needsTex, () => {
  expectError(run((i) => { i.pillars.pillars[2].tools[0] = 'Qualys'; }), /"Qualys" not found/);
});

test('an unknown field is rejected', () => {
  expectError(run((i) => { i.resume.basics.phone = '555'; }), /resume\.json: basics/);
});

test('a non-https profile URL is rejected', () => {
  expectError(run((i) => { i.resume.basics.profiles[0].url = 'http://github.com/rsg14196'; }), /must be https/);
});

test('copy containing an em dash fails', () => {
  expectError(run((i) => { i.copy['hero.tagline'].text = 'Fast security \u2014 with a human in the loop.'; }), /em dash/);
});

test('a missing interest wording fails', () => {
  expectError(run((i) => { delete i.copy['interest.soccer']; }), /missing "interest\.soccer"/);
});

test('"site" as a source only exempts wording that cites nothing else', () => {
  expectError(run((i) => { i.copy['headline.mag-4'] = { text: 'Cut exposure by 60%', sources: ['site', 'mag-4'], approved: true }; }), /number "60%"/);
});

test('changing the tagline without regenerating the share image fails', () => {
  expectError(run((i) => { i.copy['hero.tagline'].text = 'Something new and shiny.'; }), /share image is stale \(tagline/);
});

// ---------- Projects ----------

test('no projects yet fails strictly and only warns for drafts', () => {
  const inputs = structuredClone({
    ...base,
    copy: withoutProjectCopy(approveAll(base.copy)),
    projects: { ...projectFixture().projects, projects: [], sources: {} },
  });
  expectError(verifyContent(inputs), /no projects yet/);
  const draft = verifyContent(inputs, { allowUnapproved: true });
  assert.deepEqual(draft.errors, []);
  assert.ok(draft.warnings.some((w) => /no projects yet/.test(w)));
});

test('a missing or duplicated project fails', () => {
  expectError(run((i) => { i.projects.projects = i.projects.projects.filter((p) => p.id !== 'forge'); }), /missing project "forge"/);
  expectError(run((i) => { i.projects.projects[3] = structuredClone(project(i, 'oracle')); }), /"oracle" listed twice/);
  expectError(run((i) => { i.projects.projects.push(structuredClone(project(i, 'oracle'))); }), /projects\.json: projects/);
});

test('a project naming another project fails, in copy or in its stack', () => {
  expectError(run((i) => { i.copy['project.cadence.stage.check.plain'].text = 'Hands the case to FORGE.'; }), /cadence.*mentions another project \(forge\)/);
  expectError(run((i) => { i.copy['project.conflux.tagline'].text = 'Feeds the Proving Ground harness.'; }), /mentions another project \(proving-ground\)/);
  expectError(run((i) => { project(i, 'oracle').stack.push('CONFLUX'); }), /project oracle: mentions another project \(conflux\)/);
});

test('a project may name itself', () => {
  assert.deepEqual(run((i) => { i.copy['project.oracle.tagline'].text = 'ORACLE triages findings.'; }).errors, []);
});

test('only the overview may relate projects', () => {
  assert.deepEqual(run((i) => { i.copy['overview.body'].text = 'CONFLUX would feed ORACLE, then CADENCE and FORGE.'; }).errors, []);
});

test('citing another project\'s repo fails', () => {
  expectError(run((i) => { i.copy['project.oracle.tagline'].sources = ['conflux.readme']; }), /project\.oracle\.tagline.*another project's repo/);
  expectError(run((i) => { project(i, 'forge').stages[0].sources = ['cadence.readme']; }), /project forge: cites "cadence\.readme"/);
});

test('a tool the project\'s quotes never name fails', () => {
  expectError(run((i) => { project(i, 'proving-ground').stack.push('Burp Suite'); }), /"Burp Suite" not found in any of its source quotes/);
  expectError(run((i) => { project(i, 'oracle').orchestrator = 'Langflow'; }), /"Langflow" not found/);
});

test('a number not in the project\'s quotes fails; one that is passes', () => {
  expectError(run((i) => { i.copy['project.forge.summary'].text = 'Runs 7 checks.'; }), /number "7"/);
  assert.deepEqual(run((i) => { i.copy['project.forge.summary'].text = 'Runs 3 checks.'; }).errors, []);
});

test('the overview must be marked future and say it is not built', () => {
  expectError(run((i) => { i.projects.overview.status = 'live'; }), /projects\.json: overview\.status/);
  expectError(run((i) => { i.copy['overview.disclaimer'].text = 'How the five connect.'; }), /must say the connections are future work, not built/);
  expectError(run((i) => { delete i.copy['overview.disclaimer']; }), /missing "overview\.disclaimer"/);
});

test('an employer or school name fails, in copy or in a published quote', () => {
  expectError(run((i) => { i.copy['project.forge.summary'].text = 'Built while at KPMG.'; }), /names "KPMG"/);
  expectError(run((i) => { i.projects.sources['oracle.readme'].quote += ' Tested at the University of Victoria.'; }), /source "oracle\.readme": names "University of Victoria"/);
  expectError(run((i) => { i.copy['hero.tagline'].text = 'Formerly at Nokia.'; }), /hero\.tagline.*names "Nokia"/);
});

test('infrastructure details and credentials fail', () => {
  const leak = (text) => run((i) => { i.projects.sources['cadence.readme'].quote += ` ${text}`; });
  expectError(leak('Open http://localhost:8000 to start.'), /cadence\.readme.*"localhost"/);
  expectError(leak('Open http://localhost:8000 to start.'), /contains a URL/);
  expectError(leak('Open http://localhost:8000 to start.'), /host:port/);
  expectError(leak('The DB sits at 10.0.3.7.'), /private or loopback IP/);
  expectError(leak('Ping db.internal first.'), /internal hostname/);
  expectError(leak(`Token ghp_${'a1'.repeat(15)}`), /credential-like/);
  expectError(run((i) => { i.copy['project.cadence.human'].text = 'Write to ops@example.com.'; }), /email address/);
});

test('a public documentation address like 169.254.169.254 is allowed', () => {
  assert.deepEqual(run((i) => { i.copy['project.forge.stage.check.detail'].text = 'Blocks 169.254.169.254.'; }).errors, []);
});

test('a source path outside the repo is rejected', () => {
  expectError(run((i) => { i.projects.sources['oracle.readme'].path = '../secrets.txt'; }), /projects\.json: sources\.oracle\.readme\.path/);
  expectError(run((i) => { i.projects.sources['oracle.readme'].path = 'C:/Users/x/notes.md'; }), /projects\.json: sources\.oracle\.readme\.path/);
});

test('stale copy, unused quotes and mislabelled sources fail', () => {
  expectError(run((i) => { i.copy['project.oracle.stage.ghost.plain'] = { text: 'Old stage.', sources: ['oracle.readme'], approved: true }; }), /not used by any project or stage/);
  expectError(run((i) => { i.projects.sources['oracle.extra'] = { ...i.projects.sources['oracle.readme'] }; }), /source "oracle\.extra": not cited/);
  expectError(run((i) => { i.projects.sources['oracle.readme'].repo = 'forge'; }), /id prefix must be its repo "forge"/);
});

test('a human step that is not one of the project\'s stages fails', () => {
  expectError(run((i) => { project(i, 'cadence').human.stage = 'approve'; }), /human\.stage "approve" is not one of its stages/);
});

test('a missing stage wording or an em dash in a project name fails', () => {
  expectError(run((i) => { delete i.copy['project.forge.stage.check.plain']; }), /missing "project\.forge\.stage\.check\.plain"/);
  expectError(run((i) => { project(i, 'forge').name = 'FORGE \u2014 fixes'; }), /contains an em dash/);
});
