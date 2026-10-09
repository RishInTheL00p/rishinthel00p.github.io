# Rish in the Loop

Source for **https://rishinthel00p.github.io**, the portfolio of Rishabh Singh,
security engineer.

Two rules shape this repo:

1. **Nothing on the site is made up.** Skills and credentials come from my
   resume, which stays private (`*.tex` is gitignored), and are checked against
   it before publishing. Project
   write-ups cite verbatim quotes from each project's (private) repository: every
   number must appear in its quote, every tool listed must be named in one, and
   no project's write-up may mention another. Wording written for the site has
   to cite its sources and be approved before it can deploy. The site names no
   employers or schools, and the build fails if one appears.
2. **It's built like something worth attacking.** A hash-based Content Security
   Policy, no third-party requests, supply-chain controls and CI gates on every
   change. See [how this site is secured](https://rishinthel00p.github.io/security/)
   and the [threat model](docs/THREAT-MODEL.md).

## Layout

```
site/                  Astro static site
  src/content/         resume.json (facts), copy.json (approved wording), pillars.json,
                       projects.json (project flows and their source quotes)
  scripts/             verify-content, check-dist, verify-sources, and their tests
contact-api/           Vercel function behind the contact form (handler, tests, vercel.json)
scripts/pii-scan.sh    blocks phone numbers, emails and dates of birth from commits and builds
resume/                local only (gitignored): the LaTeX resume and personal contact details
.githooks/pre-commit   runs the PII scan (and gitleaks, if installed) before every commit
.github/workflows/     ci, deploy (GitHub Pages), scorecard
```

## Before publishing

The resume source and the project repositories are private, so CI can't read
them. CI still checks approvals, numbers, project rules and that no employer
or school is named. Run the two source checks locally before opening a PR:

```bash
cd site
npm run verify:resume    # site content vs resume/Rish-Resume.tex (local only)
npm run verify:sources   # project quotes vs ../../<project> repos, read-only git
```

`verify:sources` fails if a quote is missing at its pinned commit or no longer
on `main`. Set `PROJECT_REPOS_DIR` if the repositories live somewhere else.

## Security

Please report vulnerabilities privately: see [SECURITY.md](SECURITY.md).
