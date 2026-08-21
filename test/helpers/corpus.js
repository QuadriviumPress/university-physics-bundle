/**
 * Build a throwaway CNXML corpus on disk so the parse/model/render layers can
 * be exercised end to end without the 1 GB source submodule.
 *
 * Layout mirrors the real one: META-INF/books.xml -> collections/*.collection.xml
 * -> modules/<id>/index.cnxml.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CNXML_NS = 'http://cnx.rice.edu/cnxml';
const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/**
 * Wrap module body content in a valid <document>.
 * @param {string} title
 * @param {string} body - CNXML that goes inside <content>
 * @param {{ docClass?: string, abstract?: string, glossary?: string }} [opts]
 */
export function moduleXml(title, body, opts = {}) {
  const { docClass = null, abstract = null, glossary = '' } = opts;
  return `<?xml version="1.0" encoding="UTF-8"?>
<document xmlns="${CNXML_NS}" xmlns:m="${MATHML_NS}"${docClass ? ` class="${docClass}"` : ''}>
  <title>${title}</title>
  <metadata xmlns:md="http://cnx.rice.edu/mdml">
    <md:title>${title}</md:title>
    ${abstract ? `<md:abstract>${abstract}</md:abstract>` : ''}
  </metadata>
  <content>${body}</content>
  ${glossary}
</document>`;
}

/**
 * Write a corpus into a fresh temp directory.
 *
 * @param {{
 *   modules: Record<string, string>,
 *   collections: Array<{ slug: string, title: string, front?: string[],
 *     units?: Array<{ title: string, chapters: Array<{ title: string, modules: string[] }> }>,
 *     back?: string[] }>
 * }} spec
 * @returns {string} Absolute path to the corpus root
 */
export function writeCorpus(spec) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'upb-test-'));

  for (const [id, xml] of Object.entries(spec.modules)) {
    const dir = path.join(root, 'modules', id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.cnxml'), xml);
  }

  fs.mkdirSync(path.join(root, 'collections'), { recursive: true });
  fs.mkdirSync(path.join(root, 'META-INF'), { recursive: true });

  const books = spec.collections
    .map(
      c =>
        `<book slug="${c.slug}" collection-id="${c.slug}" href="../collections/${c.slug}.collection.xml"/>`
    )
    .join('\n  ');
  fs.writeFileSync(
    path.join(root, 'META-INF', 'books.xml'),
    `<?xml version="1.0"?>\n<container>\n  ${books}\n</container>`
  );

  for (const c of spec.collections) {
    const front = (c.front || []).map(m => `<col:module document="${m}"/>`).join('');
    const back = (c.back || []).map(m => `<col:module document="${m}"/>`).join('');
    const units = (c.units || [])
      .map(
        u => `<col:subcollection>
          <md:title>${u.title}</md:title>
          <col:content>${u.chapters
            .map(
              ch => `<col:subcollection>
              <md:title>${ch.title}</md:title>
              <col:content>${ch.modules
                .map(m => `<col:module document="${m}"/>`)
                .join('')}</col:content>
            </col:subcollection>`
            )
            .join('')}</col:content>
        </col:subcollection>`
      )
      .join('');

    fs.writeFileSync(
      path.join(root, 'collections', `${c.slug}.collection.xml`),
      `<?xml version="1.0"?>
<col:collection xmlns="http://cnx.rice.edu/collxml" xmlns:md="http://cnx.rice.edu/mdml" xmlns:col="http://cnx.rice.edu/collxml">
  <metadata xmlns:md="http://cnx.rice.edu/mdml" mdml-version="0.5">
    <md:title>${c.title}</md:title>
    <md:slug>${c.slug}</md:slug>
  </metadata>
  <col:content>${front}${units}${back}</col:content>
</col:collection>`
    );
  }

  return root;
}

/** Remove a corpus created by writeCorpus. */
export function removeCorpus(root) {
  fs.rmSync(root, { recursive: true, force: true });
}
