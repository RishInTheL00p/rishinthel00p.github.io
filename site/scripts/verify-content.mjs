// Content provenance check. Fails (exit 1) unless:
//   - resume.json matches resume/Rish-Resume.tex verbatim (roles, dates,
//     bullets, education, certifications, interests, summary, profile links),
//     in both directions, and every skill, pillar tool and framework appears in
//     the .tex. The .tex is private (gitignored), so this part runs only where
//     the file exists: on the owner's machine, via npm run verify:resume.
//   - the three pillars have equal weight
//   - every piece of site-authored copy cites real sources, adds no numbers its
//     sources don't contain, and has been approved by the owner
//   - each project in projects.json stands alone (never names another project,
//     cites only its own repo's quotes), claims no tool its quotes don't name,
//     and only the overview relates projects, as a future vision
//   - no employer or school name, and no private infrastructure detail, appears
//     in anything the site shows or publishes
// The quotes themselves are checked against the private repos by
// verify-sources.mjs, which runs locally only.
//
// Usage: node scripts/verify-content.mjs [--allow-unapproved] [--require-resume]
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { texToText, texLinks, normalize, stripBold } from './lib/tex-to-text.mjs';
import { privateNamePatterns, findPrivateNames, findLeaks } from './lib/disclosure.mjs';
import { ResumeSchema, PillarsSchema, CopySchema, ProjectsSchema, PROJECT_IDS } from '../src/content/schema.ts';

const path = (p) => fileURLToPath(new URL(p, import.meta.url));
const readJson = (p) => JSON.parse(readFileSync(path(p), 'utf8'));

const TEX = path('../../resume/Rish-Resume.tex');

/** Reads the real content files. `tex` is null where the private resume source is absent (CI). */
export function loadInputs() {
  return {
    tex: existsSync(TEX) ? readFileSync(TEX, 'utf8') : null,
    resume: readJson('../src/content/resume.json'),
    pillars: readJson('../src/content/pillars.json'),
    copy: readJson('../src/content/copy.json'),
    projects: readJson('../src/content/projects.json'),
    og: readJson('../src/content/og-meta.json'),
  };
}

/** Returns { errors, warnings } for the given inputs. */
export function verifyContent({ tex, resume: resumeRaw, pillars: pillarsRaw, copy: copyRaw, projects: projectsRaw, og }, { allowUnapproved = false, requireResume = false } = {}) {
  const errors = [];
  const warnings = [];
  const fail = (msg) => errors.push(msg);

  // ---------- Load and validate structure ----------
  function parse(schema, data, label) {
    const r = schema.safeParse(data);
    if (!r.success) {
      for (const issue of r.error.issues) fail(`${label}: ${issue.path.join('.') || '(root)'}: ${issue.message}`);
      return null;
    }
    return r.data;
  }
  const resume = parse(ResumeSchema, resumeRaw, 'resume.json');
  const pillars = parse(PillarsSchema, pillarsRaw, 'pillars.json');
  const copy = parse(CopySchema, copyRaw, 'copy.json');
  const projects = parse(ProjectsSchema, projectsRaw, 'projects.json');
  if (!resume || !pillars || !copy || !projects) return { errors, warnings };

  const n = (s) => normalize(s);

  // ---------- Checks on the content files alone (run everywhere) ----------
  if (!resume.experience.some((r) => n(r.title) === n(resume.basics.title))) fail('basics.title must equal a role title');
  for (const c of resume.certifications) if (!n(c.name).includes(c.short)) fail(`certification ${c.id}: short "${c.short}" not in its name`);
  const siteSkills = resume.skills.flatMap((g) => g.items);
  const seen = new Set();
  for (const s of siteSkills) {
    if (seen.has(s.toLowerCase())) fail(`skill listed twice: "${s}"`);
    seen.add(s.toLowerCase());
  }

  // Pillars: equally weighted, built from real bullets.
  const bullets = new Map(resume.experience.flatMap((r) => r.bullets.map((b) => [b.id, b.text])));
  for (const p of pillars.pillars) {
    for (const h of p.highlights) if (!bullets.has(h)) fail(`pillar ${p.id}: unknown bullet "${h}"`);
  }
  for (const field of ['highlights', 'tools', 'frameworks']) {
    const counts = pillars.pillars.map((p) => p[field].length);
    if (new Set(counts).size > 1) fail(`pillars must have equal ${field} counts, got ${counts.join('/')}`);
  }
  const used = pillars.pillars.flatMap((p) => p.highlights);
  if (new Set(used).size !== used.length) fail('a bullet is used as a highlight in more than one pillar');

  // ---------- Against the resume source (only where the private .tex exists) ----------
  if (tex === null) {
    const msg = 'resume .tex not present: resume comparison skipped (run npm run verify:resume locally)';
    (requireResume ? errors : warnings).push(msg);
  } else {
    const lines = texToText(tex).split('\n');
    const plainFlat = stripBold(lines.join(' ')).toLowerCase();
    const inTex = (s) => plainFlat.includes(n(s).toLowerCase());

    /** Lines strictly between two section headings. */
    function section(from, to) {
      const a = lines.indexOf(from);
      const b = to ? lines.indexOf(to) : lines.length;
      if (a < 0 || b < 0) { fail(`.tex: section "${from}" or "${to}" not found`); return []; }
      return lines.slice(a + 1, b);
    }

    function sameList(label, expected, actual) {
      const max = Math.max(expected.length, actual.length);
      for (let i = 0; i < max; i++) {
        if (expected[i] !== actual[i]) {
          fail(`${label} [${i}] differs from the .tex\n      .tex: ${expected[i] ?? '(missing)'}\n      json: ${actual[i] ?? '(missing)'}`);
        }
      }
    }

    // ---------- Basics ----------
    const header = lines.slice(0, lines.indexOf('Background'));
    if (!stripBold(header.join(' ')).includes(resume.basics.name)) fail(`basics.name "${resume.basics.name}" not in .tex header`);
    if (!header.some((l) => l.includes(resume.basics.location))) fail(`basics.location "${resume.basics.location}" not in .tex header`);
    sameList('basics.summary', section('Background', 'Education'), [n(resume.basics.summary)]);
    const links = texLinks(tex);
    for (const p of resume.basics.profiles) if (!links.includes(p.url)) fail(`profile URL not in .tex: ${p.url}`);

    // ---------- Experience: 4 header lines per role, then "- " bullets ----------
    const texRoles = [];
    for (const l of section('Experience', 'Skills')) {
      if (l.startsWith('- ')) texRoles.at(-1)?.bullets.push(l.slice(2));
      else if (!texRoles.length || texRoles.at(-1).bullets.length) texRoles.push({ header: [l], bullets: [] });
      else texRoles.at(-1).header.push(l);
    }
    sameList('experience (company, location, title, dates)',
      texRoles.map((r) => r.header.join(' | ')),
      resume.experience.map((r) => n([r.company, r.location, r.title, `${r.start} - ${r.end}`].join(' | '))));
    resume.experience.forEach((r, i) =>
      sameList(`experience.${r.id}.bullets`, texRoles[i]?.bullets ?? [], r.bullets.map((b) => n(b.text))));

    // ---------- Education: degree, location, school, dates ----------
    const edu = section('Education', 'Experience');
    const texEdu = [];
    for (let i = 0; i < edu.length; i += 4) texEdu.push(edu.slice(i, i + 4).join(' | '));
    sameList('education', texEdu, resume.education.map((e) => n([e.degree, e.location, e.school, `${e.start} - ${e.end}`].join(' | '))));

    // ---------- Certifications and interests ----------
    const certLines = section('Certificates/Awards', 'Activities/Interests').map(stripBold);
    sameList('certifications', certLines, resume.certifications.map((c) => n(`${c.name} - ${c.earned}`)));
    sameList('interests', section('Activities/Interests'), resume.interests.map((x) => n(x.text)));

    // ---------- Skills ----------
    for (const s of siteSkills) if (!inTex(s)) fail(`skill not found in .tex: "${s}"`);
    // Every skill in the resume's Skills section must be shown somewhere on the site.
    for (const l of section('Skills', 'Certificates/Awards').map(stripBold)) {
      for (const item of l.slice(l.indexOf(':') + 1).split(',').map((s) => s.trim()).filter(Boolean)) {
        if (!siteSkills.some((s) => s.toLowerCase().includes(item.toLowerCase()))) fail(`resume skill missing from site: "${item}"`);
      }
    }

    for (const p of pillars.pillars) {
      for (const t of [...p.tools, ...p.frameworks]) if (!inTex(t)) fail(`pillar ${p.id}: "${t}" not found in .tex`);
    }
  }

  // ---------- Projects: standalone, sourced, nothing private ----------
  const privateNames = privateNamePatterns(resume);
  /** Fails on employer/school names or infrastructure details in shown or published text. */
  function screen(label, s) {
    for (const name of findPrivateNames(s, privateNames)) fail(`${label}: names "${name}" (the site shows no employers or schools)`);
    for (const leak of findLeaks(s)) fail(`${label}: contains a ${leak}`);
  }
  const projectNameRe = new Map(PROJECT_IDS.map((p) => [p, new RegExp(`\\b${p.replace('-', '[\\s-]+')}\\b`, 'i')]));
  /** Fails if `s` names any project other than `self`: each project stands alone. */
  function isolated(label, s, self) {
    for (const other of PROJECT_IDS) {
      if (other !== self && projectNameRe.get(other).test(s)) fail(`${label}: mentions another project (${other})`);
    }
  }
  const citedSources = new Set();
  /** A project may cite only quotes from its own repo. */
  function ownSource(label, sid, project) {
    citedSources.add(sid);
    const src = projects.sources[sid];
    if (!src) fail(`${label}: unknown source "${sid}"`);
    else if (src.repo !== project) fail(`${label}: cites "${sid}" from another project's repo`);
  }

  for (const [sid, src] of Object.entries(projects.sources)) {
    if (sid.split('.')[0] !== src.repo) fail(`source "${sid}": id prefix must be its repo "${src.repo}"`);
    screen(`source "${sid}"`, src.quote);
  }

  const shown = new Set();
  // Copy keys each project needs, so stale or missing wording is caught.
  const projectCopyKeys = new Set();
  if (!projects.projects.length) (allowUnapproved ? warnings : errors).push('projects.json: no projects yet');
  for (const p of projects.projects) {
    if (shown.has(p.id)) fail(`projects.json: project "${p.id}" listed twice`);
    shown.add(p.id);
    const label = `project ${p.id}`;
    const stageIds = p.stages.map((s) => s.id);
    if (new Set(stageIds).size !== stageIds.length) fail(`${label}: duplicate stage id`);
    if (!stageIds.includes(p.human.stage)) fail(`${label}: human.stage "${p.human.stage}" is not one of its stages`);
    for (const sid of [...p.stages.flatMap((s) => s.sources), ...p.human.sources]) ownSource(label, sid, p.id);

    // No overclaiming: every tool shown must be named in one of the project's own quotes.
    const quotes = Object.values(projects.sources).filter((s) => s.repo === p.id).map((s) => s.quote.toLowerCase()).join('\n');
    for (const tool of [p.orchestrator, ...p.stack]) {
      if (!quotes.includes(tool.toLowerCase())) fail(`${label}: "${tool}" not found in any of its source quotes`);
    }
    for (const s of [p.name, p.orchestrator, ...p.stack]) {
      isolated(label, s, p.id);
      screen(label, s);
      if (/—/.test(s)) fail(`${label}: "${s}" contains an em dash`);
    }

    for (const k of ['tagline', 'name-meaning', 'summary', 'human']) projectCopyKeys.add(`project.${p.id}.${k}`);
    for (const s of stageIds) for (const k of ['label', 'plain', 'detail']) projectCopyKeys.add(`project.${p.id}.stage.${s}.${k}`);
  }
  if (projects.projects.length) {
    for (const p of PROJECT_IDS) if (!shown.has(p)) fail(`projects.json: missing project "${p}"`);
    for (const p of [...projects.overview.flow, projects.overview.feedback]) {
      if (!shown.has(p)) fail(`projects.json: overview refers to missing project "${p}"`);
    }
  }

  // ---------- Site-authored copy ----------
  const sourceText = new Map([
    // Wording about how the site itself works (not claims about me).
    ['site', ''],
    ['basics.title', resume.basics.title],
    ['basics.summary', resume.basics.summary],
    ...bullets,
    ...resume.interests.map((x) => [x.id, x.text]),
    ...resume.certifications.map((c) => [c.id, `${c.name} ${c.earned}`]),
    ...resume.skills.map((g) => [g.group, g.items.join(' ')]),
    ...resume.experience.map((r) => [r.id, `${r.company} ${r.title}`]),
    ...resume.education.map((e) => [e.id, `${e.degree} ${e.school}`]),
    ...Object.entries(projects.sources).map(([sid, s]) => [sid, s.quote]),
  ]);
  for (const src of pillars.centre.sources) if (!sourceText.has(src)) fail(`pillars.centre: unknown source "${src}"`);

  const required = [
    'site.name', 'hero.tagline', 'about.body', 'centre.title', 'centre.body', 'centre.research', 'contact.privacy',
    ...pillars.pillars.flatMap((p) => [`pillar.${p.id}.title`, `pillar.${p.id}.summary`]),
    ...resume.skills.map((g) => `skills.${g.group}`),
    ...[...bullets.keys()].map((b) => `headline.${b}`),
    ...resume.interests.map((x) => `interest.${x.id}`),
    ...projectCopyKeys,
    ...(projects.projects.length ? ['projects.heading', 'projects.lede', 'overview.title', 'overview.body', 'overview.disclaimer'] : []),
  ];
  for (const key of required) if (!copy[key]) fail(`copy.json: missing "${key}"`);

  for (const [key, entry] of Object.entries(copy)) {
    const unknown = entry.sources.filter((s) => !sourceText.has(s));
    if (unknown.length) fail(`copy "${key}": unknown source(s) ${unknown.join(', ')}`);
    screen(`copy "${key}"`, entry.text);
    if (key.startsWith('project.')) {
      const project = key.split('.')[1];
      if (!projectCopyKeys.has(key)) fail(`copy "${key}": not used by any project or stage in projects.json`);
      for (const sid of entry.sources) ownSource(`copy "${key}"`, sid, project);
      isolated(`copy "${key}"`, entry.text, project);
    } else {
      for (const sid of entry.sources) if (sid in projects.sources) citedSources.add(sid);
    }
    // Guard against invented metrics: every number must come from a cited source.
    const cited = entry.sources.map((s) => sourceText.get(s) ?? '').join(' ');
    const aboutTheSite = entry.sources.length === 1 && entry.sources[0] === 'site';
    for (const num of aboutTheSite ? [] : entry.text.match(/\d+(?:[.,]\d+)?%?/g) ?? []) {
      if (!cited.includes(num)) fail(`copy "${key}": number "${num}" does not appear in its sources`);
    }
    // House style: the site never uses em dashes.
    if (/\u2014/.test(entry.text)) fail(`copy "${key}": contains an em dash`);
    if (!entry.approved) (allowUnapproved ? warnings : errors).push(`copy "${key}": not yet approved by the owner`);
  }

  // The overview is a future vision and must say so on the page.
  const disclaimer = copy['overview.disclaimer']?.text;
  if (disclaimer && !/\bnot (yet )?built\b|\bfuture\b/i.test(disclaimer)) fail('copy "overview.disclaimer": must say the connections are future work, not built');
  // Every quote is published with the source, so none may sit there unused.
  for (const sid of Object.keys(projects.sources)) if (!citedSources.has(sid)) fail(`source "${sid}": not cited by any project or copy`);

  // ---------- Share image (public/og.png) ----------
  // og-meta.json records the text rendered into the image by `npm run og`.
  const ogExpected = {
    name: resume.basics.name,
    title: resume.basics.title.replace(/\s+[-\u2013\u2014]+\s+/g, ', '),
    tagline: copy['hero.tagline']?.text,
  };
  for (const [k, want] of Object.entries(ogExpected)) {
    if (og?.[k] !== want) fail(`share image is stale (${k} changed): run "npm run og" and commit public/og.png`);
  }

  return { errors, warnings };
}

// ---------- CLI ----------
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { errors, warnings } = verifyContent(loadInputs(), {
    allowUnapproved: process.argv.includes('--allow-unapproved'),
    requireResume: process.argv.includes('--require-resume'),
  });
  for (const w of warnings) console.warn(`  warn  ${w}`);
  for (const e of errors) console.error(`  FAIL  ${e}`);
  if (errors.length) {
    console.error(`verify-content: ${errors.length} problem(s).`);
    process.exit(1);
  }
  console.log(`verify-content: OK${warnings.length ? ` (${warnings.length} warning(s))` : ''}`);
}
