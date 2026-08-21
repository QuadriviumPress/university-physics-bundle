import { test } from 'node:test';
import assert from 'node:assert/strict';
import MiniSearch from 'minisearch';

/**
 * The build (scripts/build-index.js) and the client (assets/js/search.js) agree
 * on one serialized shape: `{ index }`, with title/url/preview carried per
 * document in the index's own storedFields. These tests pin that contract —
 * the client reads result.url directly, so a build that stopped storing it
 * would silently produce results that navigate nowhere.
 */

const DOCS = [
  {
    id: 1,
    title: '1.3 Unit Conversion',
    content: 'Converting nonmetric units to metric requires a conversion factor.',
    url: '/university-physics-bundle/university-physics-volume-1/1-3-unit-conversion/',
    preview: 'Converting nonmetric units…',
  },
  {
    id: 2,
    title: 'Preface',
    content: 'Welcome to University Physics, an OpenStax resource.',
    url: '/university-physics-bundle/university-physics-volume-1/preface/',
    preview: 'Welcome to University Physics…',
  },
];

/** Serialize exactly the way scripts/build-index.js does. */
function buildIndex() {
  const miniSearch = new MiniSearch({
    fields: ['title', 'content'],
    storeFields: ['title', 'url', 'preview'],
    searchOptions: { boost: { title: 2 }, fuzzy: 0.2, prefix: true },
  });
  miniSearch.addAll(DOCS);
  return JSON.parse(JSON.stringify({ index: miniSearch.toJSON() }));
}

/** Deserialize exactly the way assets/js/search.js does. */
function loadIndex(data) {
  return MiniSearch.loadJS(data.index, {
    fields: ['title', 'content'],
    storeFields: ['title', 'url', 'preview'],
  });
}

test('the serialized payload carries no separate documents table', () => {
  const data = buildIndex();
  assert.deepEqual(Object.keys(data), ['index']);
});

test('every document is recoverable from storedFields alone', () => {
  const stored = Object.values(buildIndex().index.storedFields);
  assert.equal(stored.length, DOCS.length);
  for (const doc of stored) {
    assert.ok(doc.url, 'stored document is missing url');
    assert.ok(doc.title, 'stored document is missing title');
    assert.ok(doc.preview, 'stored document is missing preview');
  }
});

test('results round-trip through loadJS with title/url/preview attached', () => {
  const miniSearch = loadIndex(buildIndex());
  const results = miniSearch.search('conversion', { boost: { title: 2 }, fuzzy: 0.2, prefix: true });

  assert.ok(results.length > 0, 'expected at least one hit');
  const [top] = results;
  assert.equal(top.title, '1.3 Unit Conversion');
  assert.equal(top.url, '/university-physics-bundle/university-physics-volume-1/1-3-unit-conversion/');
  assert.match(top.preview, /Converting nonmetric units/);
});

test('index URLs use the directory form the ToC links to', () => {
  // The viewer keys prev/next, ToC highlighting and visited-tracking off exact
  // hrefs, so an index.html suffix would silently break all three.
  for (const doc of Object.values(buildIndex().index.storedFields)) {
    assert.doesNotMatch(doc.url, /index\.html$/);
    assert.match(doc.url, /\/$/);
  }
});
