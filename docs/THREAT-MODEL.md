# Threat model

A STRIDE review of the portfolio site at https://rishinthel00p.github.io.

## System

- **Site:** static HTML, CSS and JavaScript built with Astro and served by
  GitHub Pages. No server-side code, database, accounts or cookies.
- **Content:** `site/src/content/*.json`, checked against
  `resume/Rish-Resume.tex` on every build.
- **Pipeline:** GitHub Actions builds, checks and deploys to Pages through OIDC.
  `main` accepts changes only through pull requests that pass the required
  checks.
- **Planned (not yet built):** a contact form backed by a Vercel function. It
  will get its own section here before it ships.

## Assets

1. Integrity of the site content: it represents a real person's career.
2. The owner's personal data (phone number, email address), which must never be
   published.
3. Visitors' browsers: the site must not become a way to run attacker code.
4. The build and deploy pipeline, and the credentials it holds.

## Trust boundaries

- Visitor browser ↔ GitHub Pages (public internet)
- Pull request author ↔ repository and CI
- CI ↔ npm registry and GitHub Actions marketplace (third-party code)
- CI ↔ GitHub Pages deployment (OIDC)

## STRIDE

| Threat | Example | Mitigations | Residual risk |
|---|---|---|---|
| **Spoofing** | A fake deployment impersonates the site | Deploys only from the `deploy` workflow on `main`, authenticated with short-lived OIDC tokens; no long-lived deploy keys exist | Low |
| **Tampering: content** | Inflated titles, invented metrics or skills | `verify-content` fails the build when site content and the resume disagree, when a skill isn't in the resume, when a number isn't in its cited source, or when wording isn't owner-approved | Low |
| **Tampering: supply chain** | A compromised npm package or Action injects code | Exact versions and lockfile; `npm ci --ignore-scripts`; `npm audit` and `npm audit signatures`; Actions pinned to commit SHAs; Dependabot; OpenSSF Scorecard | Medium: pinned code can still be malicious at the pinned version |
| **Tampering: pipeline** | A malicious PR steals secrets or deploys | No `pull_request_target`; workflows default to no token permissions; checkout without persisted credentials; deploy runs only on `main` | Low |
| **Repudiation** | Unclear who changed what | Git history, PR-only merges and Actions logs | Low |
| **Information disclosure: personal data** | Phone number or email committed or published | Contact details live in a gitignored file; PII scan in a pre-commit hook, in CI over the repo, and over the build output; gitleaks over full history; commits use a GitHub noreply address | Low |
| **Information disclosure: visitors** | Tracking visitors via third parties | No third-party requests at all: self-hosted fonts, no analytics, no cookies | Low |
| **Denial of service** | Traffic floods | Static hosting on GitHub's CDN; nothing to exhaust | Low; accepted |
| **Elevation of privilege: XSS** | Script injection into the site | No user input is rendered; Astro escapes output; no `set:html` or `innerHTML`; CSP with `default-src 'none'` and hash-only inline scripts; build fails on inline handlers, inline styles, `javascript:` URLs or unhashed scripts | Low |
| **Elevation of privilege: clickjacking** | Framing the site to trick clicks | Nothing to trigger: no logins, forms or state-changing actions | Accepted: GitHub Pages can't send `X-Frame-Options`, and `frame-ancestors` is ignored in `<meta>` |

## Review

Update this document whenever a new component (such as the contact form), a
new third-party service or a new data flow is added.
