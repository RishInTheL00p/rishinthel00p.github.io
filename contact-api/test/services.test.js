import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyTurnstile } from '../lib/turnstile.js';
import { sendMail } from '../lib/mail.js';
import { hashIp } from '../lib/ratelimit.js';

/** Fake fetch that records the request and returns a canned response. */
function fakeFetch(status, body) {
  const seen = [];
  const impl = async (url, init) => {
    seen.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  return { impl, seen };
}

test('Turnstile: posts secret, token and IP to the fixed siteverify URL with a timeout', async () => {
  const { impl, seen } = fakeFetch(200, { success: true, hostname: 'h', action: 'contact' });
  const r = await verifyTurnstile({ secret: 's', token: 't', ip: '203.0.113.7', fetchImpl: impl });
  assert.equal(r.success, true);
  assert.equal(seen[0].url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  const body = new URLSearchParams(seen[0].init.body);
  assert.deepEqual([body.get('secret'), body.get('response'), body.get('remoteip')], ['s', 't', '203.0.113.7']);
  assert.ok(seen[0].init.signal instanceof AbortSignal);
});

test('Turnstile: a non-2xx response throws', async () => {
  const { impl } = fakeFetch(500, {});
  await assert.rejects(verifyTurnstile({ secret: 's', token: 't', ip: '', fetchImpl: impl }));
});

test('Resend: sends plain text only, to the configured recipient, with bearer auth', async () => {
  const { impl, seen } = fakeFetch(200, { id: '1' });
  await sendMail({ apiKey: 'k', from: 'F <f@example.com>', to: 'owner@example.com', replyTo: 'v@example.com', subject: 'S', text: 'T', fetchImpl: impl });
  assert.equal(seen[0].url, 'https://api.resend.com/emails');
  assert.equal(seen[0].init.headers.Authorization, 'Bearer k');
  const payload = JSON.parse(seen[0].init.body);
  assert.deepEqual(payload, { from: 'F <f@example.com>', to: ['owner@example.com'], reply_to: 'v@example.com', subject: 'S', text: 'T' });
  assert.equal('html' in payload, false);
});

test('Resend: a non-2xx response throws', async () => {
  const { impl } = fakeFetch(422, {});
  await assert.rejects(sendMail({ apiKey: 'k', from: 'f', to: 't', replyTo: 'r', subject: 's', text: 't', fetchImpl: impl }));
});

test('hashIp is keyed: same IP and salt match, a different salt differs', () => {
  assert.equal(hashIp('203.0.113.7', 'a'.repeat(32)), hashIp('203.0.113.7', 'a'.repeat(32)));
  assert.notEqual(hashIp('203.0.113.7', 'a'.repeat(32)), hashIp('203.0.113.7', 'b'.repeat(32)));
});
