#!/usr/bin/env node

/**
 * Post-build verification for the University Physics site.
 *
 * Checks (over _site/):
 *  - page counts: 124/119/95 content pages per volume (338 total)
 *  - every internal href resolves to an emitted page; #fragments resolve to ids
 *  - every /media/ image reference exists in _site/media/
 *  - no CNXML leaks into output (<para>, <emphasis>, m:-prefixed tags)
 *  - figure/equation numbers are strictly sequential within each chapter
 *  - learning-objectives boxes present (270 modules have abstracts)
 *  - spot checks: splash figure = Figure 1.1, Example 1.2 on 1-3-unit-conversion
 *
 * Usage: node scripts/verify-build.js [--site-dir _site] [--base-url /university-physics-bundle/]
 */

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import * as cheerio from 'cheerio';
import { runCli } from './lib/cli.js';
import { getBaseDir } from './lib/files.js';

const VOLUMES = {
  'university-physics-volume-1': 124,
  'university-physics-volume-2': 119,
  'university-physics-volume-3': 95,
};

// Canonical <link> targets always name the GitHub Pages deployment, even when
// this build was emitted with a different path prefix (e.g. Vercel root).
const CANONICAL_ORIGIN = 'https://quadriviumpress.github.io';
const CANONICAL_BASE = '/university-physics-bundle/';

/**
 * Normalize a path prefix so comparisons are consistent.
 * Root hosting may pass `/` or ``; treat both as a single leading slash for
 * href matching against root-relative links.
 */
function normalizeBaseUrl(baseUrl) {
  if (!baseUrl || baseUrl === '/') return '/';
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

function hrefUnderBase(href, baseUrl) {
  if (baseUrl === '/') {
    // Root-hosted: accept any same-origin root-relative path, but not //…
    return href.startsWith('/') && !href.startsWith('//');
  }
  return href.startsWith(baseUrl);
}

function stripBase(href, baseUrl) {
  if (baseUrl === '/') return href.replace(/^\//, '');
  // Match the historical slice(length - 1) behavior: keep then drop a leading /
  return href.slice(baseUrl.length - 1).replace(/^\//, '');
}

async function verify(options) {
  const siteDir = options.siteDir || '_site';
  const baseUrl = normalizeBaseUrl(options.baseUrl || '/university-physics-bundle/');
  const siteRoot = path.resolve(getBaseDir(import.meta.url), siteDir);

  let failures = 0;
  const fail = msg => {
    failures++;
    console.error(`  ✗ ${msg}`);
  };
  const pass = msg => console.log(`  ✓ ${msg}`);

  if (!fs.existsSync(siteRoot)) {
    console.error(`Error: Site directory not found: ${siteRoot}`);
    console.error('Run Eleventy build first: npm run build');
    return false;
  }

  console.log(`Site directory: ${siteRoot}`);
  console.log(`Base URL:       ${baseUrl}\n`);

  function readPage(rel) {
    return fs.readFileSync(path.join(siteRoot, rel), 'utf8');
  }

  const existsAsPage = (href, hrefBase = baseUrl) => {
    if (!hrefUnderBase(href, hrefBase)) return false;
    const p = stripBase(href, hrefBase);
    const file = p.endsWith('.html') ? p : path.join(p, 'index.html');
    return fs.existsSync(path.join(siteRoot, file));
  };

  // ---------- 1. page counts ----------
  console.log('Page counts');
  let total = 0;
  for (const [slug, expected] of Object.entries(VOLUMES)) {
    const volDir = path.join(siteRoot, slug);
    if (!fs.existsSync(volDir)) {
      fail(`${slug}: directory missing`);
      continue;
    }
    const pages = fs
      .readdirSync(volDir, { withFileTypes: true })
      .filter(d => d.isDirectory()).length;
    total += pages;
    if (pages === expected) pass(`${slug}: ${pages} pages`);
    else fail(`${slug}: expected ${expected} pages, found ${pages}`);
  }
  if (total === 338) pass('338 content pages total');
  else fail(`expected 338 content pages, found ${total}`);

  // ---------- 2/3/4. link, media, and leak checks over all pages ----------
  console.log('Scanning pages (links, media, CNXML leaks, numbering)...');
  const htmlFiles = await glob('**/*.html', { cwd: siteRoot, ignore: 'assets/**' });

  const idsByPage = new Map(); // outputPath -> Set(ids)
  const linksByPage = new Map(); // outputPath -> [{href}]
  const canonicals = new Map(); // outputPath -> canonical href
  const abstracts = new Set();
  const chapterNumbers = new Map(); // "vol/ch" -> { figure: [..], equation: [..] }

  let leaks = 0;
  let mediaMissing = 0;

  for (const rel of htmlFiles) {
    const html = readPage(rel);

    // CNXML leaks
    if (/<para[\s>]|<emphasis[\s>]|<m:/.test(html)) {
      leaks++;
      if (leaks <= 3) fail(`CNXML leak in ${rel}`);
    }

    const $ = cheerio.load(html);

    const ids = new Set();
    $('[id]').each((_, el) => ids.add($(el).attr('id')));
    idsByPage.set(rel, ids);

    const links = [];
    $('a[href]').each((_, el) => links.push($(el).attr('href')));
    linksByPage.set(rel, links);

    if ($('.abstract').length > 0) abstracts.add(rel);

    const canonical = $('link[rel="canonical"]').attr('href');
    if (canonical) canonicals.set(rel, canonical);

    $('img[src]').each((_, el) => {
      const src = $(el).attr('src');
      const m = src.match(/\/media\/(.+)$/);
      if (m && !fs.existsSync(path.join(siteRoot, 'media', decodeURIComponent(m[1])))) {
        mediaMissing++;
        if (mediaMissing <= 5) fail(`missing media ${m[1]} referenced from ${rel}`);
      }
    });

    // numbering sequences per chapter (content pages only)
    const volMatch = rel.match(/^(university-physics-volume-\d)\/((\d+)-[^/]*)\/index\.html$/);
    if (volMatch) {
      const key = `${volMatch[1]}/ch${volMatch[3]}`;
      if (!chapterNumbers.has(key)) chapterNumbers.set(key, { figure: [], equation: [] });
      const bucket = chapterNumbers.get(key);
      $('.figure-number').each((_, el) => {
        const m2 = $(el)
          .text()
          .match(/Figure (\d+)\.(\d+)/);
        if (m2) bucket.figure.push([volMatch[2], parseInt(m2[2], 10)]);
      });
      $('.equation-number').each((_, el) => {
        const m2 = $(el)
          .text()
          .match(/^(\d+)\.(\d+)$/);
        if (m2) bucket.equation.push([volMatch[2], parseInt(m2[2], 10)]);
      });
    }
  }

  if (leaks === 0) pass('no CNXML leaks in output');
  if (mediaMissing === 0) pass('all referenced media files exist');

  // internal links + fragments
  let brokenLinks = 0;
  let brokenFragments = 0;
  for (const [rel, links] of linksByPage) {
    for (const href of links) {
      if (!hrefUnderBase(href, baseUrl)) continue; // external / same-page fragments
      const [pagePart, fragment] = href.split('#');
      if (!existsAsPage(pagePart)) {
        brokenLinks++;
        if (brokenLinks <= 5) fail(`broken link ${href} in ${rel}`);
        continue;
      }
      if (fragment) {
        const p = stripBase(pagePart, baseUrl);
        const file = p.endsWith('.html') ? p : path.join(p, 'index.html');
        const ids = idsByPage.get(file);
        if (ids && !ids.has(decodeURIComponent(fragment))) {
          brokenFragments++;
          if (brokenFragments <= 5) fail(`broken fragment ${href} in ${rel}`);
        }
      }
    }
  }
  if (brokenLinks === 0) pass('all internal links resolve');
  if (brokenFragments === 0) pass('all link fragments resolve to ids');

  // same-page fragments (#id)
  let brokenLocal = 0;
  for (const [rel, links] of linksByPage) {
    const ids = idsByPage.get(rel);
    for (const href of links) {
      if (!href.startsWith('#')) continue;
      const id = decodeURIComponent(href.slice(1));
      if (!ids.has(id)) {
        brokenLocal++;
        if (brokenLocal <= 5) fail(`broken same-page fragment ${href} in ${rel}`);
      }
    }
  }
  if (brokenLocal === 0) pass('all same-page fragments resolve');

  // ---------- 5. numbering sequences ----------
  let numberingBad = 0;
  for (const [key, bucket] of chapterNumbers) {
    for (const kind of ['figure', 'equation']) {
      const nums = bucket[kind].map(x => x[1]);
      if (nums.length === 0) continue;
      const unique = new Set(nums);
      const sorted = [...unique].sort((a, b) => a - b);
      const max = sorted[sorted.length - 1];
      if (unique.size !== nums.length || sorted.length !== max || sorted[0] !== 1) {
        numberingBad++;
        if (numberingBad <= 5) fail(`${key}: ${kind} numbers not 1..${max} without gaps/dupes`);
      }
    }
  }
  if (numberingBad === 0) pass('figure/equation numbers sequential per chapter');

  // ---------- 5b. canonical links on duplicated shared pages ----------
  // The preface + 7 appendices are shared by all 3 volumes: 8 modules x 2
  // duplicate occurrences = 16 pages carrying <link rel="canonical">.
  let canonicalBad = 0;
  for (const [rel, href] of canonicals) {
    if (!href.startsWith(CANONICAL_ORIGIN + CANONICAL_BASE)) {
      canonicalBad++;
      fail(`canonical ${href} in ${rel} is not under ${CANONICAL_ORIGIN}${CANONICAL_BASE}`);
      continue;
    }
    const target = href.slice(CANONICAL_ORIGIN.length);
    if (!existsAsPage(target, CANONICAL_BASE)) {
      canonicalBad++;
      fail(`canonical ${href} in ${rel} does not resolve to an emitted page`);
    } else if (path.join(stripBase(target, CANONICAL_BASE), 'index.html') === rel) {
      canonicalBad++;
      fail(`canonical in ${rel} points at itself`);
    }
  }
  if (canonicals.size === 16 && canonicalBad === 0) {
    pass('16 duplicated shared pages carry a valid canonical link');
  } else if (canonicals.size !== 16) {
    fail(`expected 16 canonical links, found ${canonicals.size}`);
  }

  // ---------- 5b. search index URLs resolve to emitted pages ----------
  // URLs must use the directory form (.../preface/) matching the ToC links —
  // the viewer keys prev/next, ToC highlight, and visited-tracking off exact
  // hrefs, so an index.html suffix silently breaks all three.
  const searchIndexPath = path.join(siteRoot, 'search_index.json');
  if (fs.existsSync(searchIndexPath)) {
    const searchIndex = JSON.parse(fs.readFileSync(searchIndexPath, 'utf8'));
    // Per-document title/url/preview live in the index's storedFields; the
    // client reads them straight off each search result.
    const storedDocs = Object.values(searchIndex.index?.storedFields ?? {});
    let indexBad = 0;
    for (const doc of storedDocs) {
      if (!doc.url || /index\.html$/.test(doc.url) || !existsAsPage(doc.url)) {
        indexBad++;
        if (indexBad <= 5) fail(`search index URL does not resolve: ${doc.url}`);
      }
    }
    if (storedDocs.length === 338 && indexBad === 0) {
      pass('search index has 338 documents with resolvable URLs');
    } else if (storedDocs.length !== 338) {
      fail(`expected 338 search documents, found ${storedDocs.length}`);
    }
  } else {
    fail('search_index.json missing');
  }

  // ---------- 6. learning objectives ----------
  if (abstracts.size === 270) pass('270 pages with learning-objectives boxes');
  else fail(`expected 270 pages with .abstract, found ${abstracts.size}`);

  // ---------- 7. spot checks ----------
  const intro = readPage('university-physics-volume-1/1-introduction/index.html');
  if (intro.includes('class="splash"') && intro.includes('Figure 1.1')) {
    pass('vol-1 chapter 1 intro has splash Figure 1.1');
  } else fail('vol-1 intro splash/Figure 1.1 missing');

  const unitConv = readPage('university-physics-volume-1/1-3-unit-conversion/index.html');
  if (unitConv.includes('data-label="Example 1.2"') && (unitConv.match(/menclose/g) || []).length >= 3) {
    pass('1-3-unit-conversion has Example 1.2 and menclose strikes');
  } else fail('1-3-unit-conversion spot check failed');

  for (const f of [
    'SUMMARY.html',
    'summary.json',
    'index.html',
    'offline.html',
    'manifest.webmanifest',
    'sw.js',
    'search_index.json',
    'assets/icons/icon-192.png',
    'assets/icons/icon-512.png',
    'assets/js/vendor/minisearch.js',
    'assets/js/mathjax/fonts/mathjax-newcm-font/chtml.js',
  ]) {
    if (fs.existsSync(path.join(siteRoot, f))) pass(`${f} emitted`);
    else fail(`${f} missing`);
  }

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
  return failures === 0;
}

runCli({
  name: 'verify-build',
  description: `Post-build verification for the University Physics site.

Asserts page counts, link/fragment integrity, media existence, numbering
sequences, canonical links, and zero CNXML leakage over the built _site/.`,
  flags: {
    siteDir: {
      flag: '--site-dir',
      description: 'Site directory (default: _site)',
      type: 'string',
      default: '_site',
    },
    baseUrl: {
      flag: '--base-url',
      description: 'Path prefix used in built hrefs (default: /university-physics-bundle/)',
      type: 'string',
      default: '/university-physics-bundle/',
    },
  },
  examples: [
    'node scripts/verify-build.js',
    'node scripts/verify-build.js --site-dir _site',
    'node scripts/verify-build.js --base-url /',
  ],
  run: verify,
});
