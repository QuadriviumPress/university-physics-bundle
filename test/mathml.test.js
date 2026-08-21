import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as cheerio from 'cheerio';
import { renderMathML } from '../lib/render/mathml.js';

/** Parse a `<m:math>` fragment and hand back its root element node. */
function mathEl(xml) {
  const $ = cheerio.load(xml, { xml: true });
  return $('m\\:math').get(0);
}

test('strips the m: prefix and adds the MathML namespace', () => {
  const html = renderMathML(mathEl('<m:math><m:mi>x</m:mi></m:math>'));
  assert.equal(html, '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>');
});

test('display math is marked display="block"', () => {
  const html = renderMathML(mathEl('<m:math><m:mn>1</m:mn></m:math>'), { display: true });
  assert.match(html, /^<math xmlns="[^"]+" display="block">/);
});

test('allowlisted attributes survive, with values escaped', () => {
  const html = renderMathML(mathEl('<m:math><m:mo stretchy="false" lspace="0em">(</m:mo></m:math>'));
  assert.match(html, /<mo stretchy="false" lspace="0em">\(<\/mo>/);
});

test('attributes outside the allowlist are dropped', () => {
  const html = renderMathML(
    mathEl('<m:math><m:mi onclick="alert(1)" onmouseover="x" mathvariant="bold">v</m:mi></m:math>')
  );
  assert.equal(html.includes('onclick'), false);
  assert.equal(html.includes('onmouseover'), false);
  assert.match(html, /<mi mathvariant="bold">v<\/mi>/);
});

test('elements outside the allowlist are dropped but their text is kept', () => {
  const warnings = [];
  const html = renderMathML(
    mathEl('<m:math><m:mrow><script>alert(1)</script><m:mi>y</m:mi></m:mrow></m:math>'),
    { warn: m => warnings.push(m) }
  );
  assert.equal(html.includes('<script'), false);
  assert.match(html, /<mrow>alert\(1\)<mi>y<\/mi><\/mrow>/);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /dropped unexpected element <script>/);
});

test('text content is escaped', () => {
  const html = renderMathML(mathEl('<m:math><m:mo>&lt;</m:mo></m:math>'));
  assert.match(html, /<mo>&lt;<\/mo>/);
});

test('every element the corpus uses is allowlisted', () => {
  // The 21 element names present in the OpenStax University Physics CNXML.
  const used = [
    'mo', 'mi', 'mrow', 'mn', 'mtext', 'mspace', 'msub', 'msup', 'mstyle',
    'mfrac', 'mover', 'mtd', 'mtr', 'msubsup', 'msqrt', 'mtable', 'munderover',
    'munder', 'menclose', 'mroot',
  ];
  const inner = used.map(n => `<m:${n}>z</m:${n}>`).join('');
  const html = renderMathML(mathEl(`<m:math>${inner}</m:math>`), {
    warn: m => assert.fail(m),
  });
  for (const name of used) {
    assert.ok(html.includes(`<${name}>z</${name}>`), `${name} was dropped`);
  }
});
