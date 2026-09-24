// @ts-check
import { defineConfig } from 'astro/config';
import { buildCsp, contactConfig } from './src/lib/csp.mjs';

// The contact form (and the CSP entries it needs) is included only when both
// public build variables are set.
const csp = buildCsp(contactConfig(process.env));

export default defineConfig({
  site: 'https://rishinthel00p.github.io',
  output: 'static',
  trailingSlash: 'ignore',
  build: {
    // Emit CSS as files instead of inline <style> blocks.
    inlineStylesheets: 'never',
  },
  vite: {
    build: {
      // Keep build output free of source maps.
      sourcemap: false,
      // Never inline assets as data: URLs; font-src 'self' would block them.
      assetsInlineLimit: 0,
    },
  },
  devToolbar: { enabled: false },
  // No Markdown is rendered; Shiki's inline styles would conflict with the CSP.
  markdown: { syntaxHighlight: false },
  // GitHub Pages can't send response headers, so Astro emits the policy as a
  // <meta> tag and adds a hash for every script and style it generates.
  security: {
    csp: {
      algorithm: 'SHA-256',
      directives: csp.directives,
      scriptDirective: { resources: csp.scriptResources },
      styleDirective: { resources: csp.styleResources },
    },
  },
});
