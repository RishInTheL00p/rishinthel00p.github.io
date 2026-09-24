// Vercel Function: POST /api/contact
// Wires the real services into the handler. All logic lives in ../lib.
import { loadConfig } from '../lib/config.js';
import { createHandler } from '../lib/handler.js';
import { createLimiter } from '../lib/ratelimit.js';
import { verifyTurnstile } from '../lib/turnstile.js';
import { sendMail } from '../lib/mail.js';

const config = loadConfig(process.env);

const handle = createHandler({
  config,
  limiter: config
    ? createLimiter({ url: config.redisUrl, token: config.redisToken })
    : async () => ({ success: false, reset: 0 }),
  verify: (token, ip) => verifyTurnstile({ secret: config?.turnstileSecret ?? '', token, ip }),
  send: (mail) =>
    sendMail({ apiKey: config?.resendApiKey ?? '', from: config?.from ?? '', to: config?.to ?? '', ...mail }),
});

// Every method goes through the handler so unsupported ones get a clean 405.
export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
