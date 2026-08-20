# University Physics (OpenStax) — browsable HTML edition

[![Deploy Eleventy site to Pages](https://github.com/QuadriviumPress/university-physics-bundle/actions/workflows/deploy.yml/badge.svg)](https://github.com/QuadriviumPress/university-physics-bundle/actions/workflows/deploy.yml)
[![CI](https://github.com/QuadriviumPress/university-physics-bundle/actions/workflows/ci.yml/badge.svg)](https://github.com/QuadriviumPress/university-physics-bundle/actions/workflows/ci.yml)

**Read online: <https://QuadriviumPress.github.io/university-physics-bundle/>**

This repository wraps the OpenStax
[osbooks-university-physics-bundle](https://github.com/openstax/osbooks-university-physics-bundle)
CNXML source (a fork living in the [`source/`](./source) submodule, pinned at
the `QuadriviumPress/osbooks-university-physics-bundle` fork) and adds an
[Eleventy](https://www.11ty.dev/) build that renders _University Physics_
Volumes 1–3 (338 pages from 322 modules) as a browsable, installable web site.
The submodule is the only place content (`source/collections/`,
`source/modules/`, `source/media/`) lives and it is **never modified** here —
all transformation happens at build time, so pulling upstream errata is a clean
submodule bump.

## Features

- Three-volume site with a collapsible sidebar, prev/next navigation, and
  client-side full-text search (self-hosted [MiniSearch](https://lucaong.github.io/minisearch/))
- Build-generated, chapter-scoped numbering of figures, tables, equations,
  examples, and Check Your Understanding boxes, matching openstax.org
- Math rendered from the source MathML by fully self-hosted **MathJax v4**
  (script *and* `mathjax-newcm` fonts — no CDN requests)
- **Progressive Web App**: installable (web manifest + icons) with a service
  worker that precaches the app shell and serves visited pages, images, and
  math fonts offline
- `<link rel="canonical">` on the 16 duplicated pages (the preface and 7
  appendices are shared by all three volumes) pointing at the Volume 1 copy
- Post-build verification (`npm run verify`): page counts, link/fragment
  integrity, media existence, numbering sequences, canonical links, zero CNXML
  leakage

## Building

```bash
# first-time: initialize the source/ submodule (or clone with --recursive)
git submodule update --init --recursive
npm ci
npm run update:vendor   # copy self-hosted MathJax (+fonts) and MiniSearch into assets/
npm run build           # build _site/ + search index
npm run serve           # dev server at http://localhost:4000/university-physics-bundle/
npm run verify          # post-build checks over _site/
```

Requires Node ≥ 22. See [BUILDING.md](./BUILDING.md) for architecture,
deployment (GitHub Pages / Vercel), and gotchas.

## Updating the OpenStax source

The textbook content is tracked as the `source/` submodule pointing at the
`QuadriviumPress/osbooks-university-physics-bundle` fork of OpenStax. To pull new
upstream errata:

```bash
# 1. (in the fork) sync it with openstax upstream, push to QuadriviumPress/...
# 2. (here) bump the submodule pointer to the fork's latest commit:
cd source && git fetch origin && git checkout openstax/main && cd ..
git add source
git commit -m "bump openstax source: <errata>"
```

This records a single submodule-SHA change rather than replaying upstream
history into this repo.

## Continuous integration

- [`ci.yml`](.github/workflows/ci.yml) — on pull requests: full build +
  `npm run verify`
- [`deploy.yml`](.github/workflows/deploy.yml) — on pushes to `main`: build,
  verify, and deploy to GitHub Pages

## About the books

_University Physics_ Volumes 1–3 are calculus-based physics textbooks published
by [OpenStax](https://openstax.org/), a non profit organization that is part of
[Rice University](https://www.rice.edu/). To view these books and their
contributors at OpenStax, visit:

- _University Physics Volume 1_ [online](https://openstax.org/details/books/university-physics-volume-1)
- _University Physics Volume 2_ [online](https://openstax.org/details/books/university-physics-volume-2)
- _University Physics Volume 3_ [online](https://openstax.org/details/books/university-physics-volume-3)

OpenStax is not affiliated with this site.

## License

_University Physics_ Volumes 1–3 are available under the
[Creative Commons Attribution-NonCommercial-ShareAlike License](./LICENSE)
(CC BY-NC-SA 4.0). The build tooling in this repository is offered under the
same license.

## Support OpenStax

If you would like to support the creation of free textbooks for students, your
[donations are welcome](https://riceconnect.rice.edu/donation/support-openstax-banner).
