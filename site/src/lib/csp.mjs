// Content Security Policy directives, shared by astro.config.mjs (which emits
// the policy) and the /security page (which describes it), so the page can't
// drift from what is actually enforced. Astro adds script-src and style-src
// itself: 'self' plus a SHA-256 hash for every inline script and style.
export const cspDirectives = [
  "default-src 'none'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "form-action 'none'",
  'upgrade-insecure-requests',
];
