import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../lib/handler.js';
import { loadConfig } from '../lib/config.js';

const ORIGIN = 'https://rishinthel00p.github.io';
const ENV = {
  ALLOWED_ORIGIN: ORIGIN,
  TURNSTILE_EXPECTED_HOSTNAME: 'rishinthel00p.github.io',
  TURNSTILE_SECRET_KEY: 'ts-secret',
  RESEND_API_KEY: 're-key',
  UPSTASH_REDIS_REST_URL: 'https://redis.example.com',
  UPSTASH_REDIS_REST_TOKEN: 'redis-token',
  RATE_LIMIT_SALT: 'x'.repeat(64),
  CONTACT_TO_EMAIL: 'owner@example.com',
};
const VALID = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  message: 'Hello! I would like to talk about a security role.',
  website: '',
  token: 'turnstile-token',
};

/** Builds a handler with fakes; records calls and log lines. */
function setup(overrides = {}) {
  const calls = { limiter: [], verify: [], send: [], log: [] };
  const deps = {
    config: loadConfig(ENV),
    limiter: async (key) => (calls.limiter.push(key), { success: true, reset: 0 }),
    verify: async (token, ip) => (calls.verify.push({ token, ip }), { success: true, hostname: 'rishinthel00p.github.io', action: 'contact' }),
    send: async (mail) => void calls.send.push(mail),
    log: (entry) => void calls.log.push(entry),
    now: () => 1_000_000,
    ...overrides,
  };
  return { handle: createHandler(deps), calls };
}

function post(body, { origin = ORIGIN, type = 'application/json', headers = {} } = {}) {
  return new Request('https://api.example.com/api/contact', {
    method: 'POST',
    headers: { ...(origin ? { origin } : {}), 'content-type': type, 'x-real-ip': '203.0.113.7', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function expectStatus(res, status, code) {
  assert.equal(res.status, status);
  if (status === 204) return;
  const body = await res.json();
  if (code) assert.deepEqual(body, { ok: false, code });
  return body;
}

test('a valid message is verified, rate-limited, sent, and returns 200', async () => {
  const { handle, calls } = setup();
  const res = await handle(post(VALID));
  assert.deepEqual(await expectStatus(res, 200), { ok: true });
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(res.headers.get('vary'), 'Origin');
  assert.equal(calls.verify[0].ip, '203.0.113.7');
  assert.equal(calls.send.length, 1);
  assert.equal(calls.send[0].replyTo, 'ada@example.com');
  assert.match(calls.send[0].text, /Hello! I would like/);
});

test('every response carries no-store, nosniff and JSON content type', async () => {
  const { handle } = setup();
  for (const res of [await handle(post(VALID)), await handle(post('{bad'))]) {
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.match(res.headers.get('content-type'), /^application\/json/);
  }
});

test('preflight from the allowed origin succeeds; from others it is refused', async () => {
  const { handle } = setup();
  const ok = await handle(new Request('https://api.example.com/api/contact', { method: 'OPTIONS', headers: { origin: ORIGIN } }));
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(ok.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
  assert.equal(ok.headers.get('access-control-allow-credentials'), null);
  const bad = await handle(new Request('https://api.example.com/api/contact', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }));
  await expectStatus(bad, 403, 'forbidden_origin');
  assert.equal(bad.headers.get('access-control-allow-origin'), null);
});

test('methods other than POST and OPTIONS get 405', async () => {
  const { handle } = setup();
  for (const method of ['GET', 'PUT', 'DELETE', 'PATCH']) {
    const res = await handle(new Request('https://api.example.com/api/contact', { method, headers: { origin: ORIGIN } }));
    await expectStatus(res, 405, 'method_not_allowed');
    assert.equal(res.headers.get('allow'), 'POST, OPTIONS');
  }
});

test('a wrong or missing Origin is refused before anything else runs', async () => {
  const { handle, calls } = setup();
  await expectStatus(await handle(post(VALID, { origin: 'https://evil.example' })), 403, 'forbidden_origin');
  await expectStatus(await handle(post(VALID, { origin: 'https://rishinthel00p.github.io.evil.example' })), 403, 'forbidden_origin');
  await expectStatus(await handle(post(VALID, { origin: null })), 403, 'forbidden_origin');
  assert.equal(calls.limiter.length + calls.verify.length + calls.send.length, 0);
});

test('non-JSON content types get 415', async () => {
  const { handle } = setup();
  await expectStatus(await handle(post('name=x', { type: 'application/x-www-form-urlencoded' })), 415, 'unsupported_media_type');
  await expectStatus(await handle(post('x', { type: 'text/plain' })), 415, 'unsupported_media_type');
});

test('bodies over 8 KB get 413, whether declared or streamed', async () => {
  const { handle } = setup();
  const big = JSON.stringify({ ...VALID, message: 'a'.repeat(9000) });
  await expectStatus(await handle(post(big, { headers: { 'content-length': String(big.length) } })), 413, 'payload_too_large');
  await expectStatus(await handle(post(big)), 413, 'payload_too_large');
});

test('malformed JSON and invalid UTF-8 get 400', async () => {
  const { handle } = setup();
  await expectStatus(await handle(post('{"name":')), 400, 'invalid_json');
  const res = await handle(new Request('https://api.example.com/api/contact', {
    method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: new Uint8Array([0x7b, 0xff, 0x7d]),
  }));
  await expectStatus(res, 400, 'invalid_encoding');
});

test('schema violations get 400 without revealing details', async () => {
  const { handle, calls } = setup();
  const cases = [
    { ...VALID, name: 'Ada\r\nBcc: victim@example.com' }, // header injection attempt
    { ...VALID, email: 'not-an-email' },
    { ...VALID, message: 'too short' },
    { ...VALID, message: 'x'.repeat(2001) },
    { ...VALID, name: '' },
    { ...VALID, token: '' },
    { ...VALID, to: 'someone-else@example.com' }, // unknown key: can't redirect mail
    { ...VALID, message: `hello there this is fine\u0000but not this` },
  ];
  for (const body of cases) await expectStatus(await handle(post(body)), 400, 'invalid_input');
  assert.equal(calls.send.length, 0);
});

test('a filled honeypot looks successful but sends nothing', async () => {
  const { handle, calls } = setup();
  assert.deepEqual(await expectStatus(await handle(post({ ...VALID, website: 'http://spam.example' })), 200), { ok: true });
  assert.equal(calls.verify.length + calls.send.length, 0);
  assert.equal(calls.log.at(-1).outcome, 'honeypot');
});

test('rate limiting uses a hashed client key and returns 429 with Retry-After', async () => {
  const { handle, calls } = setup({ limiter: async (key) => (calls.limiter.push(key), { success: false, reset: 1_000_000 + 42_500 }) });
  const res = await handle(post(VALID));
  await expectStatus(res, 429, 'rate_limited');
  assert.equal(res.headers.get('retry-after'), '43');
  assert.match(calls.limiter[0], /^[0-9a-f]{64}$/);
  assert.ok(!calls.limiter[0].includes('203.0.113.7'));
});

test('if the rate limiter is down, requests are refused (fail closed)', async () => {
  const { handle, calls } = setup({ limiter: async () => { throw new Error('redis down'); } });
  await expectStatus(await handle(post(VALID)), 503, 'rate_limiter_unavailable');
  assert.equal(calls.send.length, 0);
});

test('Turnstile failure, wrong hostname or wrong action get 403', async () => {
  const results = [
    { success: false, 'error-codes': ['invalid-input-response'] },
    { success: true, hostname: 'evil.example', action: 'contact' },
    { success: true, hostname: 'rishinthel00p.github.io', action: 'login' },
  ];
  for (const r of results) {
    const { handle, calls } = setup({ verify: async () => r });
    await expectStatus(await handle(post(VALID)), 403, 'bot_check_failed');
    assert.equal(calls.send.length, 0);
  }
});

test('if Turnstile is unreachable, requests are refused (fail closed)', async () => {
  const { handle, calls } = setup({ verify: async () => { throw new Error('timeout'); } });
  await expectStatus(await handle(post(VALID)), 503, 'bot_check_unavailable');
  assert.equal(calls.send.length, 0);
});

test('an email provider failure returns 502 without leaking the upstream error', async () => {
  const { handle } = setup({ send: async () => { throw new Error('resend: invalid api key re_secret123'); } });
  const res = await handle(post(VALID));
  const text = await res.clone().text();
  await expectStatus(res, 502, 'send_failed');
  assert.ok(!text.includes('re_secret123'));
});

test('missing or weak configuration refuses every request', async () => {
  for (const env of [{}, { ...ENV, RATE_LIMIT_SALT: 'short' }, { ...ENV, ALLOWED_ORIGIN: 'http://insecure.example' }, { ...ENV, ALLOWED_ORIGIN: '*' }]) {
    const { handle, calls } = setup({ config: loadConfig(env) });
    await expectStatus(await handle(post(VALID)), 500, 'misconfigured');
    assert.equal(calls.send.length, 0);
  }
});

test('log lines never contain the message, email address or raw IP', async () => {
  const { handle, calls } = setup();
  await handle(post(VALID));
  const logged = JSON.stringify(calls.log);
  for (const secret of [VALID.message, VALID.email, VALID.name, '203.0.113.7']) assert.ok(!logged.includes(secret));
  assert.deepEqual(Object.keys(calls.log[0]).sort(), ['client', 'ms', 'outcome', 'status']);
});
