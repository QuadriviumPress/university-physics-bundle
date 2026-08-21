import { attrs, escapeText, escapeAttr } from './html.js';
import { renderMathML } from './mathml.js';
import { renderTable } from './cals.js';
import { childNamed, childElements, hasClass } from '../parse/xml-utils.js';
import { loadModule } from '../parse/module.js';

// CNXML paras may contain block-level children; HTML <p> may not. Paras split
// around these, emitting them between <p> segments.
const BLOCK_IN_PARA = new Set([
  'equation',
  'figure',
  'note',
  'table',
  'list',
  'media',
  'example',
  'exercise',
  'iframe',
]);

/**
 * Render one module to an HTML string.
 * ctxBase: { volumeSlug, anchors, moduleRefText, numberByNode, pagesByModule, warnings }
 */
export function renderModule(root, moduleId, ctxBase) {
  const mod = loadModule(root, moduleId);
  const ctx = {
    ...ctxBase,
    moduleId,
    moduleTitle: mod.title,
    footnotes: [],
    sectionDepth: 0,
    warn: msg => ctxBase.warnings.push(`${moduleId}: ${msg}`),
  };

  let out = `<article${attrs({ class: `module${mod.docClass ? ` ${mod.docClass}` : ''}` })}>`;

  // md:abstract = the section's learning objectives. Ids are stripped: abstract
  // ids (para-00001...) repeat across modules and are never link targets.
  if (mod.abstract) {
    out += `<div class="abstract">${renderNodes(mod.abstract.children, { ...ctx, stripIds: true })}</div>`;
  }

  if (mod.content) {
    out += renderNodes(mod.content.children, ctx);
  } else {
    ctx.warn('module has no <content>');
  }

  if (mod.glossary) {
    out += render(mod.glossary, ctx);
  }

  if (ctx.footnotes.length) {
    out += '<aside class="footnotes"><hr/><ol>';
    for (const fn of ctx.footnotes) {
      out += `<li id="${escapeAttr(fn.id)}">${fn.html} <a href="#${escapeAttr(fn.refId)}" class="footnote-back" aria-label="Back to reference">↩</a></li>`;
    }
    out += '</ol></aside>';
  }

  return out + '</article>';
}

function renderNodes(nodes, ctx) {
  return (nodes || []).map(n => render(n, ctx)).join('');
}

function render(node, ctx) {
  if (node.type === 'text') return escapeText(node.data);
  if (node.type !== 'tag') return '';
  const handler = handlers[node.name];
  if (handler) return handler(node, ctx);
  ctx.warn(`unhandled element <${node.name}>`);
  return renderNodes(node.children, ctx);
}

function idOf(el, ctx) {
  return ctx.stripIds ? null : (el.attribs && el.attribs.id) || null;
}

const handlers = {
  para: renderPara,
  section: renderSection,
  emphasis: renderEmphasis,
  term(el, ctx) {
    const cls = hasClass(el, 'no-emphasis') ? 'term no-emphasis' : 'term';
    return `<span${attrs({ class: cls, id: idOf(el, ctx) })}>${renderNodes(el.children, ctx)}</span>`;
  },
  sub: (el, ctx) => `<sub>${renderNodes(el.children, ctx)}</sub>`,
  sup: (el, ctx) => `<sup>${renderNodes(el.children, ctx)}</sup>`,
  newline: () => '<br/>',
  'm:math': (el, ctx) => renderMathML(el, { warn: ctx.warn }),
  equation: renderEquation,
  figure: renderFigure,
  media: (el, ctx) => renderMedia(el, ctx),
  image: (el, ctx) => renderImage(el, '', ctx, null),
  iframe: (el, ctx) => renderIframe(el, '', ctx, null),
  note: renderNote,
  example: renderExample,
  exercise(el, ctx) {
    return `<div${attrs({
      class: 'exercise',
      id: idOf(el, ctx),
      'data-element-type': ctx.inCheckUnderstanding ? 'check-understanding' : null,
    })}>${renderNodes(el.children, ctx)}</div>`;
  },
  problem(el, ctx) {
    return `<div${attrs({ class: 'problem', id: idOf(el, ctx) })}>${renderNodes(el.children, ctx)}</div>`;
  },
  solution(el, ctx) {
    return `<div${attrs({ class: 'solution', id: idOf(el, ctx) })}>${renderNodes(el.children, ctx)}</div>`;
  },
  commentary(el, ctx) {
    return `<div${attrs({ class: 'commentary', id: idOf(el, ctx) })}>${renderNodes(el.children, ctx)}</div>`;
  },
  list: renderList,
  link: renderLink,
  footnote: renderFootnote,
  glossary: renderGlossary,
  table: (el, ctx) => renderTable(el, ctx, { children: (node, c) => renderNodes(node.children, c) }),
  quote(el, ctx) {
    return `<blockquote${attrs({ id: idOf(el, ctx) })}>${renderNodes(el.children, ctx)}</blockquote>`;
  },
  code(el, ctx) {
    return `<code>${renderNodes(el.children, ctx)}</code>`;
  },
  label(el, ctx) {
    const text = (el.children || []).some(c => (c.type === 'text' && c.data.trim()) || c.type === 'tag');
    if (text) ctx.warn('non-empty <label> dropped (numbering is generated)');
    return '';
  },
  title(el, ctx) {
    // Titles are normally consumed by their parent handler (section, para,
    // note, figure...). A title reaching the generic path is unexpected.
    ctx.warn('orphan <title> element');
    return `<div class="title">${renderNodes(el.children, ctx)}</div>`;
  },
};

function renderPara(el, ctx) {
  const titleEl = childNamed(el, 'title');
  let out = '';
  if (titleEl && titleEl !== ctx.omitTitle) {
    out += `<h4 class="para-title">${renderNodes(titleEl.children, ctx)}</h4>`;
  }

  const id = idOf(el, ctx);
  let inline = [];
  let idEmitted = false;

  const flush = () => {
    if (inline.length === 0) return;
    const inner = renderNodes(inline, ctx);
    inline = [];
    if (inner.trim() === '') return;
    out += `<p${attrs({ id: idEmitted ? null : id })}>${inner}</p>`;
    idEmitted = true;
  };

  for (const child of el.children || []) {
    if (child === titleEl) continue;
    if (child.type === 'tag' && BLOCK_IN_PARA.has(child.name)) {
      flush();
      out += render(child, ctx);
    } else {
      inline.push(child);
    }
  }
  flush();

  // Para consisted only of block children: keep its id addressable.
  if (id && !idEmitted) out = `<span id="${escapeAttr(id)}"></span>` + out;
  return out;
}

function renderSection(el, ctx) {
  const depth = ctx.sectionDepth || 0;
  const hTag = `h${Math.min(depth + 2, 6)}`;
  const titleEl = childNamed(el, 'title');
  let out = `<section${attrs({ id: idOf(el, ctx), class: el.attribs.class })}>`;
  if (titleEl) out += `<${hTag}>${renderNodes(titleEl.children, ctx)}</${hTag}>`;
  const childCtx = { ...ctx, sectionDepth: depth + 1 };
  for (const child of el.children || []) {
    if (child === titleEl) continue;
    out += render(child, childCtx);
  }
  return out + '</section>';
}

function renderEmphasis(el, ctx) {
  const effect = el.attribs.effect || 'bold'; // CNXML default effect is bold
  const inner = renderNodes(el.children, ctx);
  if (effect === 'bold') return `<strong>${inner}</strong>`;
  if (effect === 'italics' || effect === 'italic') return `<em>${inner}</em>`;
  if (effect === 'underline') return `<span class="underline">${inner}</span>`;
  ctx.warn(`unknown emphasis effect "${effect}"`);
  return `<em>${inner}</em>`;
}

function renderEquation(el, ctx) {
  const number = ctx.numberByNode.get(el);
  const math = childNamed(el, 'm:math');
  let inner;
  if (math) {
    inner = renderMathML(math, { display: true, warn: ctx.warn });
  } else {
    inner = (el.children || [])
      .filter(c => !(c.type === 'tag' && (c.name === 'label' || c.name === 'title')))
      .map(c => render(c, ctx))
      .join('');
  }
  return `<div${attrs({
    class: `equation${number ? '' : ' unnumbered'}`,
    id: idOf(el, ctx),
  })}>${inner}${number ? `<span class="equation-number">${escapeText(number)}</span>` : ''}</div>`;
}

function renderFigure(el, ctx) {
  const number = ctx.numberByNode.get(el);
  const captionEl = childNamed(el, 'caption');
  const titleEl = childNamed(el, 'title');
  let inner = titleEl ? `<div data-type="title">${renderNodes(titleEl.children, ctx)}</div>` : '';

  for (const child of childElements(el)) {
    if (child === captionEl || child === titleEl || child.name === 'label') continue;
    inner += render(child, ctx);
  }

  let figcaption = '';
  if (number || captionEl) {
    figcaption =
      '<figcaption>' +
      (number ? `<span class="figure-number">Figure ${escapeText(number)}</span> ` : '') +
      (captionEl ? renderNodes(captionEl.children, ctx) : '') +
      '</figcaption>';
  }

  return `<figure${attrs({ id: idOf(el, ctx), class: el.attribs.class })}>${inner}${figcaption}</figure>`;
}

function renderMedia(el, ctx) {
  const alt = el.attribs.alt || '';
  const mediaId = idOf(el, ctx);
  let out = '';
  let first = true;
  for (const child of childElements(el)) {
    // Carry the media id onto its first rendered child so link targets resolve.
    const id = first ? mediaId : null;
    if (child.name === 'image') out += renderImage(child, alt, ctx, id);
    else if (child.name === 'iframe') out += renderIframe(child, alt, ctx, id);
    else {
      ctx.warn(`unhandled media child <${child.name}>`);
      continue;
    }
    first = false;
  }
  return out;
}

function renderImage(el, alt, ctx, id) {
  let src = el.attribs.src || '';
  if (src.startsWith('../../media/')) {
    src = `/media/${src.slice('../../media/'.length)}`;
  } else if (!/^https?:\/\//.test(src)) {
    ctx.warn(`unexpected image src "${src}"`);
  }
  return `<img${attrs({
    id,
    src,
    alt,
    width: el.attribs.width,
    height: el.attribs.height,
    loading: 'lazy',
  })}/>`;
}

function renderIframe(el, alt, ctx, id) {
  const a = el.attribs || {};
  if (!isSafeUrl(a.src || '')) {
    ctx.warn(`iframe with unsupported src "${a.src}" dropped`);
    return '';
  }
  // Third-party embeds run in a sandbox: enough to render an interactive
  // simulation, not enough to navigate the reader away or reach this origin.
  return `<div class="interactive-embed"><iframe${attrs({
    id,
    src: a.src,
    width: a.width,
    height: a.height,
    title: alt || 'Interactive content',
    loading: 'lazy',
    referrerpolicy: 'no-referrer',
    sandbox: 'allow-scripts allow-same-origin allow-popups allow-forms',
    allowfullscreen: '',
  })}></iframe></div>`;
}

// Content is trusted-ish (OpenStax CNXML), but @url and @src are the two places
// where an upstream edit could put an arbitrary scheme — javascript: or data: —
// straight into an href. Only http(s) and protocol-relative URLs get through.
function isSafeUrl(url) {
  const trimmed = String(url).trim();
  if (trimmed.startsWith('//')) return true;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return /^https?:/i.test(trimmed);
  return true; // relative URL
}

function renderNote(el, ctx) {
  const classes = (el.attribs.class || '').trim();
  const number = ctx.numberByNode.get(el);
  let label = '';
  if (hasClass(el, 'check-understanding')) label = `Check Your Understanding ${number}`;
  else if (hasClass(el, 'problem-solving')) label = 'Problem-Solving Strategy';
  else if (hasClass(el, 'media-2')) label = 'Interactive';

  const titleEl = childNamed(el, 'title');
  const childCtx = hasClass(el, 'check-understanding')
    ? { ...ctx, inCheckUnderstanding: true }
    : ctx;

  let out = `<div${attrs({
    class: `note${classes ? ` ${classes}` : ''}`,
    id: idOf(el, ctx),
  })} data-label="${escapeAttr(label)}">`;
  if (titleEl) out += `<div class="title">${renderNodes(titleEl.children, childCtx)}</div>`;
  for (const child of el.children || []) {
    if (child === titleEl) continue;
    out += render(child, childCtx);
  }
  return out + '</div>';
}

function renderExample(el, ctx) {
  const number = ctx.numberByNode.get(el);
  // The example's display name is the <title> of its first titled para
  // ("Converting Nonmetric Units to Metric"); later para titles are the
  // Strategy / Solution / Significance headings.
  const titlePara = (el.children || []).find(
    c => c.type === 'tag' && c.name === 'para' && childNamed(c, 'title')
  );
  const titleEl = titlePara ? childNamed(titlePara, 'title') : null;

  let out = `<div${attrs({ class: 'example', id: idOf(el, ctx) })} data-label="Example ${escapeAttr(
    number || ''
  )}">`;
  if (titleEl) out += `<div class="title">${renderNodes(titleEl.children, ctx)}</div>`;
  for (const child of el.children || []) {
    if (child === titlePara) {
      out += renderPara(child, { ...ctx, omitTitle: titleEl });
    } else {
      out += render(child, ctx);
    }
  }
  return out + '</div>';
}

function renderList(el, ctx) {
  const titleEl = childNamed(el, 'title');
  let out = titleEl ? `<div class="list-title">${renderNodes(titleEl.children, ctx)}</div>` : '';
  const isOrdered = el.attribs['list-type'] === 'enumerated';
  const numberStyle = el.attribs['number-style'];
  const typeAttr = isOrdered
    ? { 'lower-alpha': 'a', 'upper-alpha': 'A', 'lower-roman': 'i', 'upper-roman': 'I' }[numberStyle] || null
    : null;
  const cls = !isOrdered && el.attribs['bullet-style'] === 'none' ? 'list-style-none' : null;
  const tag = isOrdered ? 'ol' : 'ul';

  out += `<${tag}${attrs({
    id: idOf(el, ctx),
    class: cls,
    type: typeAttr,
    'data-mark-prefix': el.attribs['mark-prefix'],
    'data-mark-suffix': el.attribs['mark-suffix'],
  })}>`;
  for (const child of childElements(el)) {
    if (child === titleEl) continue;
    if (child.name === 'item') out += `<li>${renderNodes(child.children, ctx)}</li>`;
    else ctx.warn(`unexpected <${child.name}> in list`);
  }
  return `${out}</${tag}>`;
}

function renderLink(el, ctx) {
  const a = el.attribs || {};
  const inner = renderNodes(el.children, ctx);
  const hasText = inner.trim() !== '';

  if (a.url) {
    if (!isSafeUrl(a.url)) {
      ctx.warn(`external link with unsupported URL scheme "${a.url}" rendered as text`);
      return hasText ? inner : escapeText(a.url);
    }
    return `<a href="${escapeAttr(a.url)}" target="_blank" rel="noopener">${
      hasText ? inner : escapeText(a.url)
    }</a>`;
  }

  if (a.document) {
    const pageUrl = resolveModuleUrl(a.document, ctx);
    if (!pageUrl) {
      ctx.warn(`link to unknown module ${a.document}`);
      return inner;
    }
    const href = a['target-id'] ? `${pageUrl}#${a['target-id']}` : pageUrl;
    return `<a href="${escapeAttr(href)}">${
      hasText ? inner : refText(a.document, a['target-id'], ctx)
    }</a>`;
  }

  if (a['target-id']) {
    return `<a href="#${escapeAttr(a['target-id'])}">${
      hasText ? inner : refText(ctx.moduleId, a['target-id'], ctx)
    }</a>`;
  }

  ctx.warn('link with no url/document/target-id');
  return inner;
}

function resolveModuleUrl(moduleId, ctx) {
  const occurrences = ctx.pagesByModule.get(moduleId);
  if (!occurrences || occurrences.length === 0) return null;
  const sameVolume = occurrences.find(p => p.volumeSlug === ctx.volumeSlug);
  return (sameVolume || occurrences[0]).url;
}

function refText(moduleId, targetId, ctx) {
  if (targetId) {
    const anchor = ctx.anchors.get(`${moduleId}#${targetId}`);
    if (anchor) return escapeText(anchor.text);
    ctx.warn(`no anchor registered for ${moduleId}#${targetId}`);
  }
  const text = ctx.moduleRefText.get(moduleId);
  if (text) return escapeText(text);
  ctx.warn(`no reference text for module ${moduleId}`);
  return 'link';
}

function renderFootnote(el, ctx) {
  const n = ctx.footnotes.length + 1;
  const sourceId = idOf(el, ctx);
  const refId = sourceId || `fnref-${n}`;
  const id = `fn-${n}`;
  ctx.footnotes.push({ id, refId, html: renderNodes(el.children, ctx) });
  return `<sup class="footnote-ref" id="${escapeAttr(refId)}"><a href="#${id}">[${n}]</a></sup>`;
}

function renderGlossary(el, ctx) {
  let out = '<section class="glossary"><h2 class="glossary-title">Glossary</h2><dl>';
  for (const def of childElements(el)) {
    if (def.name !== 'definition') {
      if (def.name !== 'title') ctx.warn(`unexpected <${def.name}> in glossary`);
      continue;
    }
    const term = childNamed(def, 'term');
    const meaning = childNamed(def, 'meaning');
    out += `<dt${attrs({ id: idOf(def, ctx) })}>${term ? renderNodes(term.children, ctx) : ''}</dt>`;
    out += `<dd${attrs({ id: meaning && meaning.attribs.id })}>${
      meaning ? renderNodes(meaning.children, ctx) : ''
    }</dd>`;
  }
  return `${out}</dl></section>`;
}
