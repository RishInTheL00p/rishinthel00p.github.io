# Security policy

## Reporting a vulnerability

Please report security issues privately using GitHub's
[private vulnerability reporting](https://github.com/RishInTheL00p/rishinthel00p.github.io/security/advisories/new).
Don't open a public issue for anything that could be exploited.

Include what you found, how to reproduce it, and the impact you expect. I aim
to acknowledge reports within 7 days and to keep you updated until the issue is
resolved. There is no bug bounty, but I'm happy to credit you in the fix.

## Scope

In scope:

- The site at https://rishinthel00p.github.io and its build output
- The contact API in `contact-api/` (deployed on Vercel)
- This repository's code, GitHub Actions workflows and configuration

Out of scope:

- GitHub Pages infrastructure itself (report to GitHub)
- Missing HTTP response headers that GitHub Pages can't set, such as
  `X-Frame-Options` or a header-delivered `frame-ancestors`. This is a known,
  documented limitation (see [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md)).
- Denial-of-service and volumetric testing, including sending bulk messages
  through the contact form

## Supported versions

Only the current deployment from the `main` branch is supported.
