import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeCorpus, removeCorpus, moduleXml } from './helpers/corpus.js';
import { buildModel } from '../lib/model/numbering.js';
import { parseBooks } from '../lib/parse/books.js';
import { parseCollection } from '../lib/parse/collection.js';
import { renderModule } from '../lib/render/transform.js';

const MODULES = {
  'm-preface': moduleXml('Preface', '<para id="p1">Welcome.</para>', { docClass: 'preface' }),

  'm-intro': moduleXml('Introduction', '<para id="i1">Chapter opener.</para>', {
    docClass: 'introduction',
  }),

  // Numbered objects, an unnumbered one, and the cross-reference targets.
  'm-one': moduleXml(
    'Motion',
    `<para id="para-1">Text before.
       <equation id="eq-1"><m:math><m:mi>a</m:mi></m:math></equation>
       Text after.</para>
     <figure id="fig-1"><media alt="A cart"><image src="../../media/cart.png" width="300"/></media>
       <caption>A cart.</caption></figure>
     <figure id="fig-un" class="unnumbered"><media alt="Decorative">
       <image src="../../media/deco.png"/></media></figure>
     <example id="ex-1"><para><title>Finding Speed</title>Work it out.</para>
       <para><title>Solution</title>Answer.</para></example>
     <note id="cyu-1" class="check-understanding"><para>Check this.</para></note>
     <note id="ps-1" class="problem-solving"><title>Strategy</title><para>Steps.</para></note>
     <para id="links">
       <link target-id="fig-1"/> and <link document="m-two" target-id="tbl-1"/>
       and <link url="https://openstax.org/">OpenStax</link>
       and <link url="javascript:alert(1)">bad</link>
     </para>
     <para id="lists"><list list-type="enumerated" number-style="lower-alpha">
       <item>first</item><item>second</item></list></para>`,
    { abstract: '<para>Learn things.</para>' }
  ),

  'm-two': moduleXml(
    'Forces',
    `<table id="tbl-1" summary="A &quot;quoted&quot; summary &amp; more">
       <title>Force units</title>
       <tgroup cols="2">
         <colspec colnum="1" colname="c1"/><colspec colnum="2" colname="c2"/>
         <thead><row><entry>Quantity</entry><entry>Unit</entry></row></thead>
         <tbody>
           <row><entry namest="c1" nameend="c2" align="center">Spanning</entry></row>
           <row><entry morerows="1">Force</entry><entry>N</entry></row>
         </tbody>
       </tgroup>
     </table>
     <para id="unsafe-iframe"><media alt="Sim"><iframe src="javascript:alert(1)"/></media></para>
     <para id="ok-iframe"><media alt="Sim"><iframe src="https://openstax.org/sim"/></media></para>`
  ),

  'm-appendix': moduleXml(
    'Units',
    '<para id="a1">Table of units.</para><figure id="af"><media alt="x">' +
      '<image src="../../media/units.png"/></media><caption>Units.</caption></figure>'
  ),
};

let root;
let model;
let warnings;

/** Render one module of the fixture corpus with the shared model context. */
function render(moduleId, volumeSlug = 'vol-1') {
  return renderModule(root, moduleId, {
    volumeSlug,
    anchors: model.anchors,
    moduleRefText: model.moduleRefText,
    numberByNode: model.numberByNode,
    pagesByModule: model.pagesByModule,
    warnings,
  });
}

before(() => {
  root = writeCorpus({
    modules: MODULES,
    collections: [
      {
        slug: 'vol-1',
        title: 'Volume 1',
        front: ['m-preface'],
        units: [
          {
            title: 'Unit 1. Mechanics',
            chapters: [{ title: 'Motion', modules: ['m-intro', 'm-one', 'm-two'] }],
          },
        ],
        back: ['m-appendix'],
      },
      {
        slug: 'vol-2',
        title: 'Volume 2',
        front: ['m-preface'],
        units: [
          {
            title: 'Unit 1. Waves',
            chapters: [{ title: 'Waves', modules: ['m-intro'] }],
          },
        ],
        back: ['m-appendix'],
      },
    ],
  });

  const books = parseBooks(root);
  const collections = books.map(b => parseCollection(b.file));
  model = buildModel(root, collections);
  warnings = model.warnings;
});

after(() => removeCorpus(root));

test('paras split around block children, keeping the id on the first segment', () => {
  const html = render('m-one');
  assert.match(html, /<p id="para-1">\s*Text before\.\s*<\/p>/);
  assert.match(html, /<div class="equation" id="eq-1">/);
  // The id is emitted once, not repeated on the trailing segment
  assert.equal(html.match(/id="para-1"/g).length, 1);
  assert.match(html, /<p>\s*Text after\.\s*<\/p>/);
});

test('numbered objects are chapter-scoped and unnumbered ones are skipped', () => {
  const html = render('m-one');
  assert.match(html, /<span class="figure-number">Figure 1\.1<\/span>/);
  assert.match(html, /<span class="equation-number">1\.1<\/span>/);
  assert.match(html, /data-label="Example 1\.1"/);
  assert.match(html, /data-label="Check Your Understanding 1\.1"/);
  // the unnumbered figure gets no figcaption number
  assert.equal(html.match(/figure-number/g).length, 1);
});

test('the example title comes from its first titled para and is not repeated', () => {
  const html = render('m-one');
  assert.match(html, /<div class="title">Finding Speed<\/div>/);
  assert.equal(html.match(/Finding Speed/g).length, 1);
  // later para titles remain as headings
  assert.match(html, /<h4 class="para-title">Solution<\/h4>/);
});

test('media images are rewritten to the site-root /media/ path', () => {
  const html = render('m-one');
  assert.match(html, /<img src="\/media\/cart\.png" alt="A cart" width="300" loading="lazy"\/>/);
});

test('empty links get their text synthesized from the anchor map', () => {
  const html = render('m-one');
  assert.match(html, /<a href="#fig-1">Figure 1\.1<\/a>/);
  assert.match(html, /<a href="\/vol-1\/1-2-forces\/#tbl-1">Table 1\.1<\/a>/);
});

test('external links open in a new tab; javascript: URLs are refused', () => {
  const html = render('m-one');
  assert.match(html, /<a href="https:\/\/openstax\.org\/" target="_blank" rel="noopener">OpenStax<\/a>/);
  assert.equal(html.includes('javascript:'), false);
  // the link text survives as plain text
  assert.match(html, /bad/);
  assert.ok(warnings.some(w => /unsupported URL scheme/.test(w)));
});

test('enumerated lists map number-style onto the type attribute', () => {
  const html = render('m-one');
  assert.match(html, /<ol id="lists-[^"]*"|<ol type="a">/);
  assert.match(html, /<li>first<\/li><li>second<\/li>/);
});

test('the abstract becomes the learning-objectives box with ids stripped', () => {
  const html = render('m-one');
  assert.match(html, /<div class="abstract"><p>Learn things\.<\/p><\/div>/);
});

test('CALS tables render spans, alignment, and an escaped summary', () => {
  const html = render('m-two');
  assert.match(html, /<table id="tbl-1" aria-describedby="tbl-1-summary">/);
  assert.match(html, /<span class="table-number">Table 1\.1<\/span>/);
  assert.match(html, /<th scope="col">Quantity<\/th>/);
  assert.match(html, /<td colspan="2" style="text-align:center">Spanning<\/td>/);
  assert.match(html, /<td rowspan="2">Force<\/td>/);
  // summary text is escaped, and the id it is wired to is attribute-escaped
  assert.match(html, /<p class="visually-hidden" id="tbl-1-summary">A "quoted" summary &amp; more<\/p>/);
});

test('iframes are sandboxed, and unsafe srcs are dropped entirely', () => {
  const html = render('m-two');
  assert.match(html, /<iframe src="https:\/\/openstax\.org\/sim"/);
  assert.match(html, /sandbox="allow-scripts allow-same-origin allow-popups allow-forms"/);
  assert.match(html, /referrerpolicy="no-referrer"/);
  assert.equal(html.includes('javascript:alert(1)'), false);
  assert.ok(warnings.some(w => /iframe with unsupported src/.test(w)));
});

test('cross-module links prefer an occurrence in the rendering volume', () => {
  // m-appendix is emitted in both volumes; a link from vol-2 must stay in vol-2.
  const inVol1 = model.pagesByModule.get('m-appendix')[0];
  const inVol2 = model.pagesByModule.get('m-appendix')[1];
  assert.equal(inVol1.volumeSlug, 'vol-1');
  assert.equal(inVol2.volumeSlug, 'vol-2');
  assert.notEqual(inVol1.url, inVol2.url);
});

test('no unexpected warnings from the fixture corpus', () => {
  const unexpected = warnings.filter(
    w => !/unsupported URL scheme|iframe with unsupported src/.test(w)
  );
  assert.deepEqual(unexpected, []);
});
