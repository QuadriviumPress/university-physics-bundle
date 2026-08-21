# Building the HTML site

This repo wraps the OpenStax *University Physics* CNXML source (3 volumes,
322 modules) — which lives in the `source/` submodule (a fork of
[openstax/osbooks-university-physics-bundle](https://github.com/openstax/osbooks-university-physics-bundle))
— plus an [Eleventy](https://www.11ty.dev/) build that renders it as a
browsable HTML site. **The content under `source/` (`collections/`, `modules/`,
`media/`) is never modified** here — all transformation happens at build time,
so pulling upstream errata is a clean submodule bump.

## Quick start

```bash
git submodule update --init --recursive   # populate source/ (the OpenStax CNXML)
npm ci
npm run update:vendor    # copy the self-hosted MathJax (+fonts) and MiniSearch bundles into assets/
npm run build            # build _site/ + search index
npm run serve            # dev server at http://localhost:4000/university-physics-bundle/
npm test                 # unit tests over lib/ (no submodule or build needed)
npm run lint             # eslint over lib/, scripts/, assets/js/, test/
```

Requires Node ≥ 22.

## How it works

- `_data/book.js` passes `source/` as the content root to `lib/book-data.js`,
  which parses `META-INF/books.xml` → the three
  CollXML collections → all 322 CNXML modules, in two passes:
  1. **Model pass** (`lib/parse/`, `lib/model/`): assigns chapter/section
     numbers and OpenStax-style slugs (`/university-physics-volume-1/1-3-unit-conversion/`),
     runs the chapter-scoped counters (Figure 1.5, Equation 2.10, Example 1.2,
     Check Your Understanding 1.3 — spanning all modules of a chapter), and
     builds a global anchor map for `<link>` resolution.
  2. **Render pass** (`lib/render/`): CNXML → HTML (paras with block-splitting,
     CALS tables, notes/examples/exercises in the markup contract the viewer
     JS expects, MathML passed through for client-side MathJax, glossaries,
     footnotes, learning-objective boxes from `md:abstract`).
- `pages.njk` paginates over the resulting 338 pages (the preface and 7
  appendices are shared by all three volumes, so 322 modules → 338 URLs).
- `summary.njk` emits `/SUMMARY.html`, which the client-side book viewer
  (`assets/js/book-viewer.js`, adapted from the `physics-book2` repo) fetches
  to build the collapsible 3-volume sidebar, prev/next navigation, and SPA
  page swapping.
- Math is presentation MathML rendered client-side by self-hosted **MathJax v4**
  (`mml-chtml`), configured in `assets/js/math-config.js`. The `mathjax-newcm`
  fonts are self-hosted too: `math-config.js` points MathJax's `[fonts]` loader
  path at `assets/js/mathjax/fonts/` (populated by `npm run update:mathjax`),
  so nothing is fetched from a CDN. The prefix-dependent URL is derived from
  the config script's own `src` at runtime.
- The site is an installable **PWA**: `manifest.njk` emits
  `/manifest.webmanifest` and `sw.njk` emits the service worker `/sw.js` (both
  as Nunjucks templates so URLs carry the deployment's path prefix, and the
  precache version tracks the build via `_data/build.js`). The worker
  precaches the app shell and uses network-first for HTML, cache-first for
  `media/`/`cover/`/MathJax fonts, and stale-while-revalidate for other
  assets; registration lives in `_includes/foot.njk`. The precache is split in
  two: `CRITICAL_URLS` (fail the install if missing) and `OPTIONAL_URLS`
  (added individually, so one bad response cannot abort the whole install the
  way an atomic `cache.addAll` would). The ~2 MB search index is deliberately
  not precached. Icons are in
  `assets/icons/` (PNGs rasterized from `icon.svg` via a headless-browser
  canvas).
- The 16 duplicated pages (preface + 7 appendices × the 2 extra volumes) get
  `<link rel="canonical">` pointing at the Volume 1 copy: `lib/book-data.js`
  sets `canonicalUrl` on every occurrence after a module's first, and
  `_includes/head.njk` emits it as an absolute URL under `site.baseUrl`
  (`_data/site.js`).
- `scripts/build-index.js` (postbuild) builds the MiniSearch index over
  `_site/` (search runs client-side on the self-hosted copy of MiniSearch in
  `assets/js/vendor/`, populated by `npm run update:minisearch`). The payload
  is `{ index }` only — per-document title/url/preview ride along in the
  index's own `storedFields`, which is what `assets/js/search.js` reads off
  each result. `assets/js/search-ui.js` fetches it lazily, on first use of the
  search box, so a reader who never searches never downloads it;
  `scripts/verify-build.js` (`npm run verify`) asserts page counts,
  link/fragment integrity, media existence, numbering sequences, canonical
  links on exactly the 16 duplicated pages, and zero CNXML leakage.

- The theme (light/dark) is resolved **before first paint** by a small inline
  script in `_includes/head.njk`, which puts `.dark-mode` on `<html>` from
  `localStorage` or, absent an explicit choice, `prefers-color-scheme`. All the
  dark rules are keyed off `html.dark-mode body`; `book-viewer.js` only flips
  that class. Moving this into a stylesheet or into `book-viewer.js` would
  reintroduce a full-page white flash on every load.

## Testing

`npm test` runs `node --test` over `test/`: the parse → numbering → render
pipeline against a synthetic CNXML corpus built on the fly by
`test/helpers/corpus.js`, plus the HTML-escaping helpers, the MathML
element/attribute allowlists, and the search-index serialization contract.
They need neither the `source/` submodule nor a built site, so they run first
in CI. End-to-end assertions over real content stay in `npm run verify`.

## Deployment

The path prefix is `/university-physics-bundle/` by default (GitHub Pages
project site). When the `VERCEL` env var is set, the site builds with no
prefix for root hosting. The built site is ~230 MB, dominated by `media/`.

GitHub Actions:

- `.github/workflows/ci.yml` — pull requests: `npm ci` →
  `npm run update:vendor` → build → `npm run verify`.
- `.github/workflows/deploy.yml` — pushes to `main` (and manual dispatch):
  same build + verify, then deploys `_site/` to GitHub Pages.

## Known divergences from openstax.org

- End-of-chapter exercises restart numbering per review section instead of
  numbering continuously across the chapter (the aggregated numbering can't be
  reproduced while review sections stay embedded in their section modules).
- 15 images use remote `https://openstax.org/l/...` URLs and load from the
  network; 15 `<iframe>` interactives point at external simulations.

## Gotchas

- The dev server does **not** hot-reload changes to `lib/` (Node's ESM cache
  keeps transitive imports of `_data/book.js`); restart `npm run serve` after
editing build code. Content edits under `source/modules/`/`source/collections/`
rebuild fine.
- `assets/js/mathjax/` (MathJax + fonts) and `assets/js/vendor/` (MiniSearch)
  are git-ignored and populated by `npm run update:vendor`; a fresh clone
  must run it before building or math/search will 404.
- When testing the service worker against a static server without
  `Cache-Control` headers (e.g. `python3 -m http.server`), the browser's
  heuristic HTTP cache can serve stale JS that looks like a service-worker
  bug; test in a fresh browser profile/context. GitHub Pages sends
  `max-age=600`, so deployed clients settle within minutes.
