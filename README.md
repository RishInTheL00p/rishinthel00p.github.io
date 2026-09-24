# Rish in the Loop

Source for **https://rishinthel00p.github.io**, the portfolio of Rishabh Singh,
security engineer.

Two rules shape this repo:

1. **Nothing on the site is made up.** Work history, skills and credentials come
   from `resume/Rish-Resume.tex` and are checked against it on every build.
   Wording written for the site has to cite the resume lines it is based on and
   be approved before it can deploy.
2. **It's built like something worth attacking.** A hash-based Content Security
   Policy, no third-party requests, supply-chain controls and CI gates on every
   change. See [how this site is secured](https://rishinthel00p.github.io/security/)
   and the [threat model](docs/THREAT-MODEL.md).

## Layout

```
site/                  Astro static site
  src/content/         resume.json (facts), copy.json (approved wording), pillars.json
  scripts/             verify-content, check-dist, and their tests
contact-api/           Vercel function behind the contact form (handler, tests, vercel.json)
resume/                LaTeX resume; personal contact details stay in gitignored private/
scripts/pii-scan.sh    blocks phone numbers, emails and dates of birth from commits and builds
.githooks/pre-commit   runs the PII scan (and gitleaks, if installed) before every commit
.github/workflows/     ci, deploy (GitHub Pages), scorecard
```

## Working on it

Requires Node.js 24 or later.

```sh
git config core.hooksPath .githooks   # once per clone
cd site
npm ci
npm run dev                            # local dev server
npm run ci                             # everything CI runs: tests, content check, type check, build, output checks
```

The contact form is included only when the repository variables
`PUBLIC_CONTACT_API_URL` and `PUBLIC_TURNSTILE_SITE_KEY` are set. The API's
secrets live in Vercel; see `contact-api/.env.example` for the full list.

```sh
cd contact-api && npm ci && npm test   # API tests
```

The share image (`site/public/og.png`) is rendered from the resume and the
approved tagline with `npm run og` (needs a local Chrome or Edge). CI fails if
the name, title or tagline changes without regenerating it.

To preview wording that hasn't been approved yet, build with
`ALLOW_DRAFT_COPY=1`. CI never sets it, and its content check fails on
unapproved wording regardless.

## Security

Please report vulnerabilities privately: see [SECURITY.md](SECURITY.md).
