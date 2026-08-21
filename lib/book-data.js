import { parseBooks } from './parse/books.js';
import { parseCollection } from './parse/collection.js';
import { buildModel } from './model/numbering.js';
import { renderModule } from './render/transform.js';

/**
 * Build the whole book model: parse the manifest + collections, run the
 * numbering/anchor pass, then render every module occurrence. Shared
 * preface/appendix modules need one rendering per volume so their cross-module
 * links prefer targets in the volume where that occurrence is emitted.
 */
export function buildBook({ root }) {
  const t0 = Date.now();
  const books = parseBooks(root);
  const collections = books.map(b => parseCollection(b.file));
  const model = buildModel(root, collections);
  const warnings = model.warnings;

  const htmlByOccurrence = new Map();
  for (const { moduleId, volumeSlug } of model.pages) {
    const key = `${volumeSlug}:${moduleId}`;
    if (htmlByOccurrence.has(key)) continue;
    htmlByOccurrence.set(
      key,
      renderModule(root, moduleId, {
        volumeSlug,
        anchors: model.anchors,
        moduleRefText: model.moduleRefText,
        numberByNode: model.numberByNode,
        pagesByModule: model.pagesByModule,
        warnings,
      })
    );
  }

  // The preface and appendix modules are emitted at one URL per volume; mark
  // every occurrence after the first with the first occurrence's URL so the
  // page template can emit <link rel="canonical"> (16 duplicate pages).
  const pages = model.pages.map(p => {
    const first = model.pagesByModule.get(p.moduleId)[0];
    return {
      ...p,
      html: htmlByOccurrence.get(`${p.volumeSlug}:${p.moduleId}`),
      canonicalUrl: first.url !== p.url ? first.url : null,
    };
  });

  const summaryJson = JSON.stringify(
    model.tocVolumes.map(v => ({
      volume: v.title,
      slug: v.slug,
      url: v.url,
      front: v.front.map(p => ({ title: p.displayTitle, url: p.url })),
      units: v.units.map(u => ({
        title: u.title,
        chapters: u.chapters.map(c => ({
          chapterNumber: c.number,
          chapterTitle: c.title,
          url: c.url,
          sections: c.sections.map((s, i) => ({
            sectionNumber: i + 1,
            sectionTitle: s.sidebarTitle,
            url: s.url,
          })),
        })),
      })),
      back: v.back.map(p => ({ title: p.displayTitle, url: p.url })),
    }))
  );

  console.log(
    `[book] ${pages.length} pages from ${model.renderList.length} modules in ${Date.now() - t0}ms` +
      (warnings.length ? `; ${warnings.length} warnings` : '')
  );
  for (const w of warnings.slice(0, 30)) console.warn(`[book]   warn: ${w}`);
  if (warnings.length > 30) console.warn(`[book]   ... and ${warnings.length - 30} more warnings`);

  return { volumes: model.tocVolumes, pages, summaryJson, warningCount: warnings.length };
}
