# Threat model

A STRIDE review of the portfolio site at https://rishinthel00p.github.io.

## System

- **Site:** static HTML, CSS and JavaScript built with Astro and served by
  GitHub Pages. No server-side code, database, accounts or cookies.
- **Content:** `site/src/content/*.json`. The resume source
  (`resume/Rish-Resume.tex`) is gitignored, so the comparison against it runs
  on the owner's machine before publishing; CI checks approvals, cited numbers,
  project rules and disclosure on every build. `projects.json` describes five
  private project repositories, backed by verbatim quotes from them.
- **Pipeline:** GitHub Actions builds, checks and deploys to Pages through OIDC.
  `main` accepts changes only through pull requests that pass the required
  checks.
- **Contact form:** an optional form on the site that posts to a Vercel
  function (`contact-api/`), which checks Cloudflare Turnstile, applies Upstash
  rate limits and emails the owner through Resend. The site builds without the
  form when its public settings are absent.

## Assets

1. Integrity of the site content: it represents a real person's career.
2. The owner's personal data (phone number, email address), which must never be
   published, and the names of past employers and schools, which the site no
   longer shows.
3. Details of the owner's private project repositories beyond what the project
   write-ups deliberately describe.
4. The owner's inbox and email quota (abuse target via the contact form).
5. API keys for Resend, Turnstile and Upstash.
6. Visitors' browsers: the site must not become a way to run attacker code.
7. The build and deploy pipeline, and the credentials it holds.

## Trust boundaries

- Visitor browser ↔ GitHub Pages (public internet)
- Pull request author ↔ repository and CI
- CI ↔ npm registry and GitHub Actions marketplace (third-party code)
- CI ↔ GitHub Pages deployment (OIDC)
- Visitor browser ↔ contact API on Vercel (public internet, untrusted input)
- Contact API ↔ Turnstile, Upstash and Resend (outbound, fixed hosts)

## STRIDE

| Threat | Example | Mitigations | Residual risk |
|---|---|---|---|
| **Spoofing** | A fake deployment impersonates the site | Deploys only from the `deploy` workflow on `main`, authenticated with short-lived OIDC tokens; no long-lived deploy keys exist | Low |
| **Tampering: content** | Inflated titles, invented metrics or skills | `verify-content` fails when a number isn't in its cited source or wording isn't owner-approved (every build), and when site content and the resume disagree or a skill isn't in the resume (`npm run verify:resume`, local) | Medium: the resume source is private, so the resume comparison depends on the owner running it before publishing |
| **Tampering: project claims** | A project write-up overclaims a tool, a result or a link between projects | Every project claim cites a verbatim quote from that project's repository; numbers must appear in the cited quotes and every tool listed must be named in one; a project's write-up may not name another project; only the System Overview relates projects, and it must say the connections are not built | Low |
| **Tampering: stale project claims** | A project changes after publishing, so a quote no longer holds | Quotes are pinned to commits; `npm run verify:sources` fails when a quote is missing at its pin or no longer on `main` | Medium: CI can't read the private repositories, so this check runs only on the owner's machine before publishing |
| **Tampering: supply chain** | A compromised npm package or Action injects code | Exact versions and lockfile; `npm ci --ignore-scripts`; `npm audit` and `npm audit signatures`; Actions pinned to commit SHAs; Dependabot; OpenSSF Scorecard | Medium: pinned code can still be malicious at the pinned version |
| **Tampering: pipeline** | A malicious PR steals secrets or deploys | No `pull_request_target`; workflows default to no token permissions; checkout without persisted credentials; deploy runs only on `main` | Low |
| **Repudiation** | Unclear who changed what | Git history, PR-only merges and Actions logs | Low |
| **Information disclosure: personal data** | Phone number or email committed or published | Contact details live in a gitignored file; PII scan in a pre-commit hook, in CI over the repo, and over the build output; gitleaks over full history; commits use a GitHub noreply address | Low |
| **Information disclosure: private projects** | Write-ups or published quotes leak internal hosts, ports, credentials or employer names | `verify-content` rejects private IPs, `localhost`, host:port pairs, internal hostnames, URLs, email addresses, credential-like strings and employer or school names in all copy and in every published quote; `check-dist` fails on employer or school names and on links into the private repositories | Accepted: the site deliberately describes each project's architecture (components, tools and safety controls). The projects run only in a local lab. |
| **Information disclosure: visitors** | Tracking visitors via third parties | No third-party requests at all: self-hosted fonts, no analytics, no cookies | Low |
| **Denial of service** | Traffic floods | Static hosting on GitHub's CDN; nothing to exhaust | Low; accepted |
| **Elevation of privilege: XSS** | Script injection into the site | No user input is rendered; Astro escapes output; no `set:html` or `innerHTML`; CSP with `default-src 'none'` and hash-only inline scripts; build fails on inline handlers, inline styles, `javascript:` URLs or unhashed scripts | Low |
| **Elevation of privilege: clickjacking** | Framing the site to trick clicks | Nothing to trigger: no logins, forms or state-changing actions | Accepted: GitHub Pages can't send `X-Frame-Options`, and `frame-ancestors` is ignored in `<meta>` |

## Contact API

| Threat | Example | Mitigations | Residual risk |
|---|---|---|---|
| **Spoofing** | Scripts on other sites or bots posting to the API | Exact-origin check and CORS for one origin, no credentials; Turnstile token verified server-side with expected hostname and action; honeypot field | Low: a determined human can still send a message |
| **Tampering: email injection** | Extra headers or recipients via form fields | Strict schema: unknown keys rejected, no line breaks or control characters in the name, validated email; recipient fixed in server config; plain-text body sent as JSON to Resend's API, never raw SMTP | Low |
| **Repudiation** | Denying abuse | One structured log line per request with outcome and a truncated keyed hash of the IP | Low |
| **Information disclosure** | Error messages or logs leaking secrets or messages | Generic error codes only; logs never contain message text, names, email addresses or raw IPs; secrets only in Vercel Production environment variables | Low |
| **Denial of service: inbox flooding** | Scripted messages exhausting the inbox or email quota | Per-client limit (3 per 10 minutes) and a global limit (20 per day); 8 KB body cap; Turnstile | Medium: a distributed attacker could use the daily allowance, blocking legitimate messages until reset |
| **Denial of service: dependency outage** | Turnstile or Upstash unavailable | Fails closed with 503; the page points visitors to LinkedIn instead | Accepted |
| **Elevation of privilege: SSRF** | Making the function call attacker-chosen URLs | Outbound calls go only to three fixed HTTPS endpoints; no URL is built from input | Low |
| **Clickjacking the form** | Framing the page to trick a visitor into sending | Only outcome is a message to the owner, and the Turnstile check still has to pass | Accepted |

## Review

Update this document whenever a new component (such as the contact form), a
new third-party service or a new data flow is added.
