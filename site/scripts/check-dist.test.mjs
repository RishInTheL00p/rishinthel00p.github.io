import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { checkHtml, checkCss } from './check-dist.mjs';

const hash = (s) => `'sha256-${createHash('sha256').update(s).digest('base64')}'`;
const SCRIPT = 'console.log(1)';
const policy = (extra = '') =>
  `default-src 'none'; base-uri 'none'; object-src 'none'; form-action 'none'; img-src 'self' data:; script-src 'self' ${hash(SCRIPT)}${extra}`;
const page = (body, csp = policy()) =>
  `<html><head><meta http-equiv="content-security-policy" content="${csp}"></head><body>${body}</body></html>`;

test('a clean page passes', () => {
  assert.deepEqual(checkHtml(page(`<script>${SCRIPT}</script><a href="https://x.test" target="_blank" rel="noopener noreferrer">x</a>`)), []);
});

test('missing CSP fails', () => {
  assert.match(checkHtml('<html><body></body></html>').join(), /expected 1 CSP/);
});

test('unsafe-inline in the policy fails', () => {
  assert.match(checkHtml(page('', policy(" 'unsafe-inline'"))).join(), /allows 'unsafe-inline'/);
});

test('an inline script without a matching hash fails', () => {
  assert.match(checkHtml(page('<script>alert(1)</script>')).join(), /not covered by a CSP hash/);
});

test('inline style and event handler attributes fail', () => {
  const errors = checkHtml(page('<div style="color:red" onclick="x()">x</div>')).join();
  assert.match(errors, /inline style attribute/);
  assert.match(errors, /inline event handler/);
});

test('javascript: and http: links fail', () => {
  const errors = checkHtml(page('<a href="javascript:alert(1)">a</a><a href="http://x.test">b</a>')).join();
  assert.match(errors, /javascript: URL/);
  assert.match(errors, /insecure http:/);
});

test('target=_blank without noopener noreferrer fails', () => {
  assert.match(checkHtml(page('<a href="https://x.test" target="_blank">x</a>')).join(), /noopener noreferrer/);
});

test('data: outside img-src fails', () => {
  assert.match(checkHtml(page('', policy('; font-src data:'))).join(), /font-src allows data:/);
});

test('a font inlined as a data: URL in CSS fails; data: images pass', () => {
  assert.match(checkCss('@font-face{src:url(data:font/woff2;base64,AAAA) format("woff2")}').join(), /data: URL/);
  assert.deepEqual(checkCss('.x{background:url("data:image/svg+xml,%3Csvg%3E")}'), []);
});

test('an unhashed script closed with "</script >" is still caught', () => {
  const errors = checkHtml(page('<script>alert(1)</script ><div onclick="x()"></div>')).join();
  assert.match(errors, /not covered by a CSP hash/);
  assert.match(errors, /inline event handler/);
});

test('an unhashed style closed with "</style >" is still caught', () => {
  assert.match(checkHtml(page('<style>body{}</style >')).join(), /inline <style> not covered/);
});

test('an em dash, literal or as an entity, fails', () => {
  assert.match(checkHtml(page('<p>fast \u2014 secure</p>')).join(), /em dash/);
  assert.match(checkHtml(page('<p>fast &mdash; secure</p>')).join(), /em dash/);
});

test('an in-page link to a missing id fails; one to an existing id passes', () => {
  assert.match(checkHtml(page('<a href="#nowhere">x</a>')).join(), /broken in-page link: #nowhere/);
  assert.deepEqual(checkHtml(page('<a href="#here">x</a><section id="here"></section>')), []);
});
