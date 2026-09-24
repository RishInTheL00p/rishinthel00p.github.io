// Content Security Policy, shared by astro.config.mjs (which emits the policy)
// and the /security page (which describes it), so the page can't drift from
// what is actually enforced. Astro adds a SHA-256 hash to script-src for every
// inline script it generates.

export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

/**
 * The contact form's configuration, read from build-time environment
 * variables. Returns null when either is missing, and the form is left out.
 * @param {Record<string, string | undefined>} env
 * @returns {{ apiUrl: string, apiOrigin: string, siteKey: string } | null}
 */
export function contactConfig(env) {
  const apiUrl = env.PUBLIC_CONTACT_API_URL?.trim();
  const siteKey = env.PUBLIC_TURNSTILE_SITE_KEY?.trim();
  if (!apiUrl || !siteKey) return null;
  const url = new URL(apiUrl);
  if (url.protocol !== 'https:') throw new Error('PUBLIC_CONTACT_API_URL must use https');
  if (!/^[\w-]{1,100}$/.test(siteKey)) throw new Error('PUBLIC_TURNSTILE_SITE_KEY looks malformed');
  return { apiUrl: url.href, apiOrigin: url.origin, siteKey };
}

/**
 * @param {ReturnType<typeof contactConfig>} contact
 */
export function buildCsp(contact) {
  const directives = [
    "default-src 'none'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self'${contact ? ` ${contact.apiOrigin}` : ''}`,
    ...(contact ? [`frame-src ${TURNSTILE_ORIGIN}`] : []),
    "manifest-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "form-action 'none'",
    'upgrade-insecure-requests',
  ];
  const scriptResources = ["'self'", ...(contact ? [TURNSTILE_ORIGIN] : [])];
  const styleResources = ["'self'"];
  return { directives, scriptResources, styleResources };
}
