// Proves the local source check catches missing, moved and stale quotes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifySources } from './verify-sources.mjs';

const OLD = 'a'.repeat(40);
const MAIN = 'b'.repeat(40);
const QUOTE = 'Verdicts come from checked facts, never from the model.';

/** A fake repo set: `files[ref][path]` is the file text at that ref. */
function fakeRepos(files, { present = ['oracle'] } = {}) {
  const refs = { [OLD.slice(0, 7)]: OLD, [OLD]: OLD, main: MAIN, [MAIN]: MAIN };
  return {
    exists: (repo) => present.includes(repo),
    resolve: (_repo, ref) => refs[ref] ?? null,
    show: (_repo, ref, path) => files[ref]?.[path] ?? null,
  };
}
const projects = (source = {}) => ({
  projects: [],
  overview: { status: 'future', flow: ['conflux', 'oracle'], feedback: 'proving-ground' },
  sources: { 'oracle.verdict': { repo: 'oracle', path: 'README.md', commit: OLD.slice(0, 7), quote: QUOTE, ...source } },
});
const both = (text) => ({ [OLD]: { 'README.md': text }, [MAIN]: { 'README.md': text } });

test('a quote present at its pin and on main passes, ignoring line wrapping', () => {
  const wrapped = `# ORACLE\n\nVerdicts come from checked facts,\n  never from the model.\n`;
  const { errors, warnings } = verifySources(projects(), fakeRepos(both(wrapped)));
  assert.deepEqual(errors, []);
  assert.match(warnings.join(), /behind main/);
});

test('a quote that was never in the file fails', () => {
  const { errors } = verifySources(projects(), fakeRepos(both('Something else entirely.')));
  assert.match(errors.join(), /quote not found at aaaaaaa/);
});

test('a quote removed from main fails as stale', () => {
  const files = { [OLD]: { 'README.md': QUOTE }, [MAIN]: { 'README.md': 'Rewritten.' } };
  assert.match(verifySources(projects(), fakeRepos(files)).errors.join(), /no longer on main/);
});

test('a missing repo, commit or file fails', () => {
  assert.match(verifySources(projects(), fakeRepos(both(QUOTE), { present: [] })).errors.join(), /repo not found locally/);
  assert.match(verifySources(projects({ commit: 'c'.repeat(7) }), fakeRepos(both(QUOTE))).errors.join(), /commit c{7} not found/);
  assert.match(verifySources(projects({ path: 'docs/GONE.md' }), fakeRepos(both(QUOTE))).errors.join(), /file not found/);
});

test('an invalid projects.json is refused before touching any repo', () => {
  const touched = [];
  const repos = { exists: (r) => touched.push(r), resolve: () => null, show: () => null };
  const { errors } = verifySources({ ...projects(), sources: { bad: {} } }, repos);
  assert.match(errors.join(), /does not match its schema/);
  assert.deepEqual(touched, []);
});

test('origin/main is preferred over a stale local main', () => {
  const NEWER = 'd'.repeat(40);
  const repos = fakeRepos({ [OLD]: { 'README.md': QUOTE }, [MAIN]: { 'README.md': 'Old text.' }, [NEWER]: { 'README.md': QUOTE } });
  const resolve = repos.resolve;
  repos.resolve = (repo, ref) => (ref === 'origin/main' ? NEWER : resolve(repo, ref));
  const { errors } = verifySources(projects(), repos);
  assert.deepEqual(errors, []);
});
