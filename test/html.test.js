import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeText, escapeAttr, attrs } from '../lib/render/html.js';
import { slugify } from '../lib/model/slugs.js';

test('escapeText escapes the three text-context characters', () => {
  assert.equal(escapeText('a & b < c > d'), 'a &amp; b &lt; c &gt; d');
  assert.equal(escapeText('"quotes" stay'), '"quotes" stay');
  // & must be escaped first, or the other replacements get double-escaped
  assert.equal(escapeText('&lt;'), '&amp;lt;');
});

test('escapeAttr also escapes double quotes', () => {
  assert.equal(escapeAttr('a"b'), 'a&quot;b');
  assert.equal(escapeAttr('<img src=x onerror="y">'), '&lt;img src=x onerror=&quot;y&quot;&gt;');
});

test('attrs skips null, undefined and false but keeps empty strings and 0', () => {
  assert.equal(attrs({ a: null, b: undefined, c: false }), '');
  assert.equal(attrs({ id: 'x', class: 'y' }), ' id="x" class="y"');
  assert.equal(attrs({ allowfullscreen: '' }), ' allowfullscreen=""');
  assert.equal(attrs({ width: 0 }), ' width="0"');
});

test('attrs escapes values so a quote cannot break out of the attribute', () => {
  assert.equal(attrs({ id: 'a" onload="alert(1)' }), ' id="a&quot; onload=&quot;alert(1)"');
});

test('slugify matches the OpenStax URL convention', () => {
  assert.equal(slugify("Newton's Laws of Motion"), 'newtons-laws-of-motion');
  assert.equal(slugify('Units and Measurement'), 'units-and-measurement');
  // apostrophes are dropped, not hyphenated
  assert.equal(slugify("Gauss's Law"), 'gausss-law');
  // diacritics are folded away by NFKD + combining-mark strip
  assert.equal(slugify('Ampère–Maxwell'), 'ampere-maxwell');
  // runs of punctuation collapse to a single hyphen, with no leading/trailing one
  assert.equal(slugify('  1.3: Unit Conversion!  '), '1-3-unit-conversion');
});
