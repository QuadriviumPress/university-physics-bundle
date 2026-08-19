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

const SITE_DIR = '_site';
const BASE_URL = '/university-physics-bundle/';
const VOLUMES = {
  'university-physics-volume-1': 124,
  'university-physics-volume-2': 119,
  'university-physics-volume-3': 95,
};

let failures = 0;
const fail = msg => {
  failures++;
  console.error(`  ✗ ${msg}`);
};
const pass = msg => console.log(`  ✓ ${msg}`);

const siteRoot = path.resolve(SITE_DIR);

function readPage(rel) {
  return fs.readFileSync(path.join(siteRoot, rel), 'utf8');
}

// ---------- 1. page counts ----------
console.log('Page counts');
let total = 0;
for (const [slug, expected] of Object.entries(VOLUMES)) {
  const pages = fs
    .readdirSync(path.join(siteRoot, slug), { withFileTypes: true })
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

const existsAsPage = href => {
  // strip prefix
  let p = href;
  if (!p.startsWith(BASE_URL)) return false;
  p = p.slice(BASE_URL.length - 1); // keep leading slash off
  p = p.replace(/^\//, '');
  const file = p.endsWith('.html') ? p : path.join(p, 'index.html');
  return fs.existsSync(path.join(siteRoot, file));
};

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
    if (!chapterNumbers.has(key)) chapterNumbers.set(key, { figure: [], equation: [], page: [] });
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
    if (!href.startsWith(BASE_URL)) continue; // external / same-page fragments
    const [pagePart, fragment] = href.split('#');
    if (!existsAsPage(pagePart)) {
      brokenLinks++;
      if (brokenLinks <= 5) fail(`broken link ${href} in ${rel}`);
      continue;
    }
    if (fragment) {
      let p = pagePart.slice(BASE_URL.length - 1).replace(/^\//, '');
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
    const sorted = [...new Set(nums)].sort((a, b) => a - b);
    const max = sorted[sorted.length - 1];
    if (sorted.length !== max || sorted[0] !== 1) {
      numberingBad++;
      if (numberingBad <= 5) fail(`${key}: ${kind} numbers not 1..${max} without gaps/dupes`);
    }
  }
}
if (numberingBad === 0) pass('figure/equation numbers sequential per chapter');

// ---------- 5b. canonical links on duplicated shared pages ----------
// The preface + 7 appendices are shared by all 3 volumes: 8 modules x 2
// duplicate occurrences = 16 pages carrying <link rel="canonical">.
const CANONICAL_ORIGIN = 'https://quadriviumpress.github.io';
let canonicalBad = 0;
for (const [rel, href] of canonicals) {
  if (!href.startsWith(CANONICAL_ORIGIN + BASE_URL)) {
    canonicalBad++;
    fail(`canonical ${href} in ${rel} is not under ${CANONICAL_ORIGIN}${BASE_URL}`);
    continue;
  }
  const target = href.slice(CANONICAL_ORIGIN.length);
  if (!existsAsPage(target)) {
    canonicalBad++;
    fail(`canonical ${href} in ${rel} does not resolve to an emitted page`);
  } else if (path.join(target.slice(BASE_URL.length), 'index.html') === rel) {
    canonicalBad++;
    fail(`canonical in ${rel} points at itself`);
  }
}
if (canonicals.size === 16 && canonicalBad === 0) {
  pass('16 duplicated shared pages carry a valid canonical link');
} else if (canonicals.size !== 16) {
  fail(`expected 16 canonical links, found ${canonicals.size}`);
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
  'manifest.webmanifest',
  'sw.js',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/js/vendor/minisearch.js',
  'assets/js/mathjax/fonts/mathjax-newcm-font/chtml.js',
]) {
  if (fs.existsSync(path.join(siteRoot, f))) pass(`${f} emitted`);
  else fail(`${f} missing`);
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
