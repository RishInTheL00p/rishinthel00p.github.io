import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCsp, contactConfig } from '../src/lib/csp.mjs';

const KEY = '0x4AAAAAAAAAAAAAAAAAAAAA';

test('no contact settings: no form and no third-party CSP entries', () => {
  assert.equal(contactConfig({}), null);
  assert.equal(contactConfig({ PUBLIC_CONTACT_API_URL: 'https://x.vercel.app/api/contact' }), null);
  const csp = buildCsp(null);
  assert.ok(!JSON.stringify(csp).includes('cloudflare'));
  assert.ok(csp.directives.includes("connect-src 'self'"));
});

test('with contact settings: exactly the API origin and Turnstile are allowed', () => {
  const c = contactConfig({ PUBLIC_CONTACT_API_URL: 'https://x.vercel.app/api/contact', PUBLIC_TURNSTILE_SITE_KEY: KEY });
  assert.deepEqual(c, { apiUrl: 'https://x.vercel.app/api/contact', apiOrigin: 'https://x.vercel.app', siteKey: KEY });
  const csp = buildCsp(c);
  assert.ok(csp.directives.includes("connect-src 'self' https://x.vercel.app"));
  assert.ok(csp.directives.includes('frame-src https://challenges.cloudflare.com'));
  assert.deepEqual(csp.scriptResources, ["'self'", 'https://challenges.cloudflare.com']);
});

test('an http API URL or a malformed site key fails the build', () => {
  assert.throws(() => contactConfig({ PUBLIC_CONTACT_API_URL: 'http://x.vercel.app/api', PUBLIC_TURNSTILE_SITE_KEY: KEY }), /https/);
  assert.throws(() => contactConfig({ PUBLIC_CONTACT_API_URL: 'https://x.vercel.app/api', PUBLIC_TURNSTILE_SITE_KEY: '"><script>' }), /malformed/);
});
