const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * @typedef {{ success: boolean, hostname?: string, action?: string, 'error-codes'?: string[] }} SiteverifyResult
 */

/**
 * Verifies a Turnstile token server-side. Throws on network errors or
 * timeouts (the handler treats that as "unavailable" and fails closed).
 * @param {{ secret: string, token: string, ip: string, fetchImpl?: typeof fetch, timeoutMs?: number }} args
 * @returns {Promise<SiteverifyResult>}
 */
export async function verifyTurnstile({ secret, token, ip, fetchImpl = fetch, timeoutMs = 5000 }) {
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  const res = await fetchImpl(SITEVERIFY, {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`siteverify HTTP ${res.status}`);
  return /** @type {SiteverifyResult} */ (await res.json());
}
