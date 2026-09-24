// Proves the provenance check catches drift, invented facts and unapproved copy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadInputs, verifyContent } from './verify-content.mjs';

const base = loadInputs();
const approveAll = (copy) =>
  Object.fromEntries(Object.entries(copy).map(([k, v]) => [k, { ...v, approved: true }]));

/** Real content with all copy approved, then modified by `mutate`. */
function run(mutate = () => {}) {
  const inputs = structuredClone({ ...base, copy: approveAll(base.copy) });
  mutate(inputs);
  return verifyContent(inputs);
}
const expectError = (result, pattern) =>
  assert.ok(result.errors.some((e) => pattern.test(e)), `expected an error matching ${pattern}, got:\n${result.errors.join('\n')}`);

test('current content passes once copy is approved', () => {
  assert.deepEqual(run().errors, []);
});

test('unapproved copy fails unless drafts are allowed', () => {
  const inputs = structuredClone(base);
  inputs.copy['hero.tagline'].approved = false;
  expectError(verifyContent(inputs), /hero\.tagline.*not yet approved/);
  assert.ok(!verifyContent(inputs, { allowUnapproved: true }).errors.some((e) => /hero\.tagline/.test(e)));
});

test('a bullet edited only in resume.json fails', () => {
  expectError(run((i) => { i.resume.experience[0].bullets[0].text += ' by 40%'; }), /experience\.mag\.bullets/);
});

test('a bullet edited only in the .tex fails', () => {
  expectError(run((i) => { i.tex = i.tex.replace('Watch and play soccer religiously', 'Watch soccer'); }), /interests/);
});

test('a bullet added to the .tex but not the site fails', () => {
  expectError(run((i) => { i.tex = i.tex.replace('to track threats and security issues.', 'to track threats and security issues. \\\\ - Did something new.'); }), /experience\.ericsson\.bullets/);
});

test('changed bold emphasis fails', () => {
  expectError(run((i) => { i.resume.experience[0].bullets[0].text = i.resume.experience[0].bullets[0].text.replace('**Owned', 'Owned').replace('lifecycle**', 'lifecycle'); }), /experience\.mag\.bullets/);
});

test('an inflated title or changed date fails', () => {
  expectError(run((i) => { i.resume.experience[2].title = 'Malware Research Analyst'; }), /experience \(company/);
  expectError(run((i) => { i.resume.experience[3].start = 'Jan 2017'; }), /experience \(company/);
});

test('a skill the resume never mentions fails', () => {
  expectError(run((i) => { i.resume.skills[0].items.push('Rust'); }), /skill not found in \.tex: "Rust"/);
});

test('dropping a resume skill from the site fails', () => {
  expectError(run((i) => { i.resume.skills[1].items = i.resume.skills[1].items.filter((s) => s !== 'Nmap'); }), /missing from site: "Nmap"/);
});

test('a certification with a changed date fails', () => {
  expectError(run((i) => { i.resume.certifications[4].earned = 'November 2024'; }), /certifications/);
});

test('a number not in the cited sources fails', () => {
  expectError(run((i) => { i.copy['headline.mag-4'].text = 'Dashboards that cut exposure by 60%'; }), /number "60%"/);
});

test('unequal pillars fail', () => {
  expectError(run((i) => { i.pillars.pillars[0].tools.push('Python'); }), /equal tools counts/);
});

test('a pillar tool not in the resume fails', () => {
  expectError(run((i) => { i.pillars.pillars[2].tools[0] = 'Qualys'; }), /"Qualys" not found/);
});

test('an unknown field is rejected', () => {
  expectError(run((i) => { i.resume.basics.phone = '555'; }), /resume\.json: basics/);
});

test('a non-https profile URL is rejected', () => {
  expectError(run((i) => { i.resume.basics.profiles[0].url = 'http://github.com/rsg14196'; }), /must be https/);
});

test('copy containing an em dash fails', () => {
  expectError(run((i) => { i.copy['hero.tagline'].text = 'Fast security — with a human in the loop.'; }), /em dash/);
});

test('a missing interest wording fails', () => {
  expectError(run((i) => { delete i.copy['interest.soccer']; }), /missing "interest\.soccer"/);
});
