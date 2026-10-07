// Local-only check that every quote in projects.json is really in the private
// project repo it cites. CI can't read those repos, so this runs on the owner's
// machine. Fails (exit 1) when a quote is missing at its pinned commit or no
// longer on main (the claim has gone stale); warns when the pin is behind main.
// "main" means origin/main when fetched (what is merged on GitHub), else the
// local main branch.
// Only read-only git commands run, with fixed arguments and no shell.
//
// Usage: node scripts/verify-sources.mjs
//   PROJECT_REPOS_DIR  folder holding the project repos (default: two levels
//                      above site/, where conflux/, oracle/, ... live)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProjectsSchema } from '../src/content/schema.ts';

const squash = (s) => s.replace(/\s+/g, ' ').trim();

/**
 * Checks each source against `repos`, which reads the project repos:
 *   exists(repo) → boolean
 *   resolve(repo, ref) → full commit sha, or null if unknown
 *   show(repo, ref, path) → file text at that ref, or null if absent
 * Returns { errors, warnings }.
 */
export function verifySources(projectsRaw, repos) {
  const errors = [];
  const warnings = [];
  const parsed = ProjectsSchema.safeParse(projectsRaw);
  if (!parsed.success) return { errors: ['projects.json does not match its schema; run npm run verify'], warnings };

  for (const [sid, { repo, path, commit, quote }] of Object.entries(parsed.data.sources)) {
    const label = `source "${sid}" (${repo}/${path})`;
    if (!repos.exists(repo)) { errors.push(`${label}: repo not found locally`); continue; }
    const pinned = repos.resolve(repo, commit);
    const main = repos.resolve(repo, 'origin/main') ?? repos.resolve(repo, 'main');
    if (!pinned) { errors.push(`${label}: commit ${commit} not found`); continue; }
    if (!main) { errors.push(`${label}: no main branch`); continue; }

    const atPin = repos.show(repo, pinned, path);
    if (atPin === null) errors.push(`${label}: file not found at ${commit}`);
    else if (!squash(atPin).includes(squash(quote))) errors.push(`${label}: quote not found at ${commit}`);

    if (pinned !== main) {
      const atMain = repos.show(repo, main, path);
      if (atMain === null || !squash(atMain).includes(squash(quote))) errors.push(`${label}: quote no longer on main (stale claim)`);
      else warnings.push(`${label}: pinned ${commit} is behind main; quote still holds, re-pin when convenient`);
    }
  }
  return { errors, warnings };
}

/** Reads repos under `root` with read-only git commands. */
export function gitRepos(root) {
  const dir = (repo) => join(root, repo);
  const git = (repo, args) => {
    try {
      return execFileSync('git', ['-C', dir(repo), ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      return null;
    }
  };
  return {
    exists: (repo) => existsSync(join(dir(repo), '.git')),
    resolve: (repo, ref) => git(repo, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])?.trim() || null,
    show: (repo, ref, path) => git(repo, ['show', `${ref}:${path}`]),
  };
}

// ---------- CLI ----------
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = resolve(process.env.PROJECT_REPOS_DIR ?? fileURLToPath(new URL('../../..', import.meta.url)));
  const projects = JSON.parse(readFileSync(new URL('../src/content/projects.json', import.meta.url), 'utf8'));
  const { errors, warnings } = verifySources(projects, gitRepos(root));
  for (const w of warnings) console.warn(`  warn  ${w}`);
  for (const e of errors) console.error(`  FAIL  ${e}`);
  if (errors.length) {
    console.error(`verify-sources: ${errors.length} problem(s).`);
    process.exit(1);
  }
  console.log(`verify-sources: OK (${Object.keys(projects.sources).length} quote(s) checked in ${root})${warnings.length ? `, ${warnings.length} warning(s)` : ''}`);
}
