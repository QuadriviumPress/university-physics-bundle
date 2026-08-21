import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeCorpus, removeCorpus, moduleXml } from './helpers/corpus.js';
import { buildBook } from '../lib/book-data.js';

let root;
let book;

before(() => {
  root = writeCorpus({
    modules: {
      'm-preface': moduleXml('Preface', '<para>Welcome.</para>', { docClass: 'preface' }),
      'm-intro-1': moduleXml('Introduction', '<para>Opener one.</para>', {
        docClass: 'introduction',
      }),
      // Figures/equations continue across the modules of one chapter.
      'm-1-1': moduleXml(
        "Newton's Laws of Motion",
        '<figure id="f1"><media alt="a"><image src="../../media/a.png"/></media></figure>' +
          '<equation id="e1"><m:math><m:mi>a</m:mi></m:math></equation>'
      ),
      'm-1-2': moduleXml(
        'Friction',
        '<figure id="f2"><media alt="b"><image src="../../media/b.png"/></media></figure>' +
          '<equation id="e2"><m:math><m:mi>b</m:mi></m:math></equation>'
      ),
      'm-intro-2': moduleXml('Introduction', '<para>Opener two.</para>', {
        docClass: 'introduction',
      }),
      // Second chapter restarts the object counters at <chapter>.1
      'm-2-1': moduleXml(
        'Work and Energy',
        '<figure id="f3"><media alt="c"><image src="../../media/c.png"/></media></figure>'
      ),
      'm-app-a': moduleXml(
        'Units',
        '<figure id="f4"><media alt="d"><image src="../../media/d.png"/></media></figure>'
      ),
      'm-app-b': moduleXml('Conversion Factors', '<para>Factors.</para>'),
    },
    collections: [
      {
        slug: 'vol-1',
        title: 'Volume 1',
        front: ['m-preface'],
        units: [
          {
            title: 'Unit 1. Mechanics',
            chapters: [
              { title: 'Motion', modules: ['m-intro-1', 'm-1-1', 'm-1-2'] },
              { title: 'Energy', modules: ['m-intro-2', 'm-2-1'] },
            ],
          },
        ],
        back: ['m-app-a', 'm-app-b'],
      },
      {
        slug: 'vol-2',
        title: 'Volume 2',
        front: ['m-preface'],
        units: [{ title: 'Unit 1. Waves', chapters: [{ title: 'Waves', modules: ['m-intro-2'] }] }],
        back: ['m-app-a'],
      },
    ],
  });

  book = buildBook({ root });
});

after(() => removeCorpus(root));

/** Look up a page by module id within a volume. */
function page(moduleId, volumeSlug) {
  return book.pages.find(p => p.moduleId === moduleId && p.volumeSlug === volumeSlug);
}

test('section slugs carry chapter and section numbers', () => {
  assert.equal(page('m-1-1', 'vol-1').slug, '1-1-newtons-laws-of-motion');
  assert.equal(page('m-1-2', 'vol-1').slug, '1-2-friction');
  assert.equal(page('m-2-1', 'vol-1').slug, '2-1-work-and-energy');
});

test('chapter intros are numbered and titled from the chapter, not the module', () => {
  const intro = page('m-intro-1', 'vol-1');
  assert.equal(intro.slug, '1-introduction');
  assert.equal(intro.sidebarTitle, 'Motion');
  assert.equal(page('m-intro-2', 'vol-1').slug, '2-introduction');
});

test('display titles are prefixed with the section number', () => {
  assert.equal(page('m-1-2', 'vol-1').displayTitle, '1.2 Friction');
});

test('object numbering spans a chapter and restarts on the next one', () => {
  const html = m => book.pages.find(p => p.moduleId === m && p.volumeSlug === 'vol-1').html;
  assert.match(html('m-1-1'), /Figure 1\.1/);
  assert.match(html('m-1-1'), /class="equation-number">1\.1</);
  // continues into the next module of the same chapter
  assert.match(html('m-1-2'), /Figure 1\.2/);
  assert.match(html('m-1-2'), /class="equation-number">1\.2</);
  // new chapter starts over
  assert.match(html('m-2-1'), /Figure 2\.1/);
});

test('appendices are lettered per volume and numbered without a dot', () => {
  const a = page('m-app-a', 'vol-1');
  const b = page('m-app-b', 'vol-1');
  assert.equal(a.slug, 'a-units');
  assert.equal(a.displayTitle, 'Appendix A: Units');
  assert.equal(b.slug, 'b-conversion-factors');
  assert.match(a.html, /Figure A1/);
});

test('the preface keeps a stable slug independent of its title', () => {
  assert.equal(page('m-preface', 'vol-1').slug, 'preface');
});

test('shared modules are emitted once per volume, with a canonical to the first', () => {
  const first = page('m-preface', 'vol-1');
  const second = page('m-preface', 'vol-2');
  assert.equal(first.canonicalUrl, null);
  assert.equal(second.canonicalUrl, first.url);
  assert.equal(second.url, '/vol-2/preface/');
});

test('a module reused in a second volume is renumbered for that volume', () => {
  // m-intro-2 is chapter 2 of vol-1 but chapter 1 of vol-2.
  assert.equal(page('m-intro-2', 'vol-1').slug, '2-introduction');
  assert.equal(page('m-intro-2', 'vol-2').slug, '1-introduction');
});

test('the ToC tree matches the page list', () => {
  const [vol1, vol2] = book.volumes;
  assert.equal(vol1.slug, 'vol-1');
  assert.equal(vol1.front.length, 1);
  assert.equal(vol1.units.length, 1);
  assert.equal(vol1.units[0].chapters.length, 2);
  assert.deepEqual(
    vol1.units[0].chapters.map(c => c.number),
    [1, 2]
  );
  assert.equal(vol1.units[0].chapters[0].sections.length, 2);
  assert.equal(vol1.back.length, 2);
  assert.equal(vol2.back.length, 1);

  const summary = JSON.parse(book.summaryJson);
  assert.equal(summary.length, 2);
  assert.equal(summary[0].units[0].chapters[0].sections[0].sectionNumber, 1);
});

test('the fixture corpus produces no warnings', () => {
  assert.equal(book.warningCount, 0);
});
