const REQUIRED = [
  'ALLOWED_ORIGIN',
  'TURNSTILE_EXPECTED_HOSTNAME',
  'TURNSTILE_SECRET_KEY',
  'RESEND_API_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'RATE_LIMIT_SALT',
  'CONTACT_TO_EMAIL',
];

/**
 * @typedef {object} Config
 * @property {string} allowedOrigin
 * @property {string} expectedHostname
 * @property {string} turnstileSecret
 * @property {string} resendApiKey
 * @property {string} redisUrl
 * @property {string} redisToken
 * @property {string} rateLimitSalt
 * @property {string} to
 * @property {string} from
 */

/**
 * Reads configuration from the environment. Returns null if anything required
 * is missing or malformed, so the handler can fail closed.
 * @param {Record<string, string | undefined>} env
 * @returns {Config | null}
 */
export function loadConfig(env) {
  if (REQUIRED.some((k) => !env[k] || !env[k]?.trim())) return null;
  const allowedOrigin = /** @type {string} */ (env.ALLOWED_ORIGIN).trim();
  if (!/^https:\/\/[^/]+$/.test(allowedOrigin)) return null;
  if ((env.RATE_LIMIT_SALT ?? '').length < 32) return null;
  return {
    allowedOrigin,
    expectedHostname: /** @type {string} */ (env.TURNSTILE_EXPECTED_HOSTNAME).trim(),
    turnstileSecret: /** @type {string} */ (env.TURNSTILE_SECRET_KEY),
    resendApiKey: /** @type {string} */ (env.RESEND_API_KEY),
    redisUrl: /** @type {string} */ (env.UPSTASH_REDIS_REST_URL),
    redisToken: /** @type {string} */ (env.UPSTASH_REDIS_REST_TOKEN),
    rateLimitSalt: /** @type {string} */ (env.RATE_LIMIT_SALT),
    to: /** @type {string} */ (env.CONTACT_TO_EMAIL).trim(),
    from: env.CONTACT_FROM?.trim() || 'Portfolio contact <onboarding@resend.dev>',
  };
}
