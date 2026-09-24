import { ContactSchema } from './schema.js';
import { hashIp } from './ratelimit.js';

const MAX_BODY_BYTES = 8 * 1024;
const TURNSTILE_ACTION = 'contact';

/**
 * @typedef {import('./config.js').Config} Config
 * @typedef {import('./ratelimit.js').Limiter} Limiter
 * @typedef {import('./turnstile.js').SiteverifyResult} SiteverifyResult
 * @typedef {{ outcome: string, status: number, ms: number, client?: string }} LogEntry
 * @typedef {object} Deps
 * @property {Config | null} config
 * @property {Limiter} limiter
 * @property {(token: string, ip: string) => Promise<SiteverifyResult>} verify
 * @property {(mail: { replyTo: string, subject: string, text: string }) => Promise<void>} send
 * @property {(entry: LogEntry) => void} [log]
 * @property {() => number} [now]
 */

/** One structured line per request. Never contains message text or email addresses. */
const defaultLog = (/** @type {LogEntry} */ entry) => console.log(JSON.stringify({ event: 'contact', ...entry }));

/**
 * Builds the request handler. Every external dependency is injected so each
 * check can be tested in isolation.
 * @param {Deps} deps
 * @returns {(request: Request) => Promise<Response>}
 */
export function createHandler({ config, limiter, verify, send, log = defaultLog, now = Date.now }) {
  return async function handle(request) {
    const started = now();
    /** @type {string | undefined} */
    let client;
    const origin = request.headers.get('origin');
    const originAllowed = !!config && origin === config.allowedOrigin;

    /** @param {number} status @param {string} outcome @param {Record<string, string>} [headers] */
    const reply = (status, outcome, headers = {}) => {
      // A 16-hex prefix of the keyed hash is enough to spot abuse patterns in logs.
      log({ outcome, status, ms: now() - started, client: client?.slice(0, 16) });
      const body = status < 300 ? { ok: true } : { ok: false, code: outcome };
      return json(status, body, originAllowed && config ? corsHeaders(config.allowedOrigin, headers) : headers);
    };

    try {
      // Missing or invalid configuration: refuse everything.
      if (!config) return reply(500, 'misconfigured');

      if (request.method === 'OPTIONS') {
        if (!originAllowed) return reply(403, 'forbidden_origin');
        return reply(204, 'preflight', {
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '600',
        });
      }
      if (request.method !== 'POST') return reply(405, 'method_not_allowed', { Allow: 'POST, OPTIONS' });
      if (!originAllowed) return reply(403, 'forbidden_origin');

      const type = request.headers.get('content-type') ?? '';
      if (!/^application\/json(\s*;|$)/i.test(type)) return reply(415, 'unsupported_media_type');
      const declared = Number(request.headers.get('content-length') ?? '0');
      if (declared > MAX_BODY_BYTES) return reply(413, 'payload_too_large');

      const raw = await readBody(request, MAX_BODY_BYTES);
      if (raw === null) return reply(413, 'payload_too_large');
      if (raw === undefined) return reply(400, 'invalid_encoding');

      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        return reply(400, 'invalid_json');
      }
      const parsed = ContactSchema.safeParse(data);
      if (!parsed.success) return reply(400, 'invalid_input');
      const input = parsed.data;

      // Bots that fill the hidden field get a normal-looking success and nothing is sent.
      if (input.website) return reply(200, 'honeypot');

      const ip = clientIp(request);
      client = hashIp(ip, config.rateLimitSalt);

      let limit;
      try {
        limit = await limiter(client);
      } catch {
        return reply(503, 'rate_limiter_unavailable');
      }
      if (!limit.success) {
        const retry = Math.max(1, Math.ceil((limit.reset - now()) / 1000));
        return reply(429, 'rate_limited', { 'Retry-After': String(retry) });
      }

      let check;
      try {
        check = await verify(input.token, ip);
      } catch {
        return reply(503, 'bot_check_unavailable');
      }
      if (!check.success || check.hostname !== config.expectedHostname || check.action !== TURNSTILE_ACTION) {
        return reply(403, 'bot_check_failed');
      }

      try {
        await send({
          replyTo: input.email,
          subject: `Portfolio contact: ${input.name}`,
          text: [
            'New message from the portfolio contact form.',
            '',
            `Name:  ${input.name}`,
            `Email: ${input.email}`,
            '',
            input.message,
          ].join('\n'),
        });
      } catch {
        return reply(502, 'send_failed');
      }
      return reply(200, 'sent');
    } catch {
      return reply(500, 'internal_error');
    }
  };
}

/**
 * Client IP as reported by Vercel's edge, which overwrites these headers so a
 * client can't spoof them.
 * @param {Request} request
 */
function clientIp(request) {
  return (
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    ''
  );
}

/**
 * Reads the body as UTF-8, stopping at `max` bytes.
 * @param {Request} request
 * @param {number} max
 * @returns {Promise<string | null | undefined>} text; null if too large; undefined if not valid UTF-8
 */
async function readBody(request, max) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  /** @type {Uint8Array[]} */
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

/** @param {string} origin @param {Record<string, string>} headers */
function corsHeaders(origin, headers) {
  return { ...headers, 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
}

/** @param {number} status @param {unknown} body @param {Record<string, string>} headers */
function json(status, body, headers) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}
