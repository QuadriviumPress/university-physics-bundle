import { attrs } from './html.js';
import { childElements, childNamed, textOf } from '../parse/xml-utils.js';

/**
 * Render a CALS <table> (tgroup/colspec/thead/tbody/tfoot/row/entry) to an HTML
 * table. Column spans come from namest/nameend (resolved via the colspec map),
 * row spans from morerows. The deprecated @summary attribute becomes a
 * visually-hidden paragraph wired up with aria-describedby.
 *
 * `render` is the generic child renderer from transform.js (entries can contain
 * math, lists, paras...).
 */
export function renderTable(el, ctx, render) {
  const id = el.attribs.id;
  const number = ctx.numberByNode.get(el);
  const summary = el.attribs.summary;
  const title = textOf(childNamed(el, 'title')).trim();

  const tgroup = childNamed(el, 'tgroup');
  if (!tgroup) {
    ctx.warn(`<table${id ? ` id=${id}` : ''}> without <tgroup>`);
    return '';
  }

  // colname -> column number, for namest/nameend spans.
  const colnums = {};
  childElements(tgroup)
    .filter(c => c.name === 'colspec')
    .forEach((c, i) => {
      const num = parseInt(c.attribs.colnum, 10) || i + 1;
      if (c.attribs.colname) colnums[c.attribs.colname] = num;
    });

  const caption = childNamed(el, 'caption');
  let captionHtml = '';
  if (number || title || caption) {
    captionHtml =
      '<caption>' +
      (number ? `<span class="table-number">Table ${number}</span> ` : '') +
      (title ? `<span class="table-title">${render.children(childNamed(el, 'title'), ctx)}</span> ` : '') +
      (caption ? render.children(caption, ctx) : '') +
      '</caption>';
  }

  const summaryId = summary && id ? `${id}-summary` : null;
  let out = `<table${attrs({
    id,
    class: el.attribs.class,
    'aria-describedby': summaryId,
  })}>${captionHtml}`;

  for (const part of childElements(tgroup)) {
    if (part.name === 'thead' || part.name === 'tbody' || part.name === 'tfoot') {
      out += `<${part.name}>`;
      for (const row of childElements(part).filter(r => r.name === 'row')) {
        out += renderRow(row, part.name === 'thead', colnums, ctx, render);
      }
      out += `</${part.name}>`;
    }
  }
  out += '</table>';

  if (summaryId) {
    out += `<p class="visually-hidden" id="${summaryId}">${escapeSummary(summary)}</p>`;
  }
  return out;
}

// CALS @align/@valign vocabulary mapped into the generated style attribute;
// anything else from upstream content is dropped rather than passed through.
const ALIGN_VALUES = new Set(['left', 'center', 'right', 'justify', 'char']);
const VALIGN_VALUES = new Set(['top', 'middle', 'bottom', 'baseline']);

function renderRow(row, isHead, colnums, ctx, render) {
  let out = '<tr>';
  for (const entry of childElements(row).filter(e => e.name === 'entry')) {
    const a = entry.attribs || {};
    const tag = isHead ? 'th' : 'td';
    let colspan = null;
    if (a.namest && a.nameend && colnums[a.namest] && colnums[a.nameend]) {
      const span = colnums[a.nameend] - colnums[a.namest] + 1;
      if (span > 1) colspan = String(span);
    }
    const rowspan = a.morerows ? String(parseInt(a.morerows, 10) + 1) : null;
    const style =
      [
        a.align && ALIGN_VALUES.has(a.align) ? `text-align:${a.align}` : null,
        a.valign && VALIGN_VALUES.has(a.valign) ? `vertical-align:${a.valign}` : null,
      ]
        .filter(Boolean)
        .join(';') || null;
    out += `<${tag}${attrs({
      scope: isHead ? 'col' : null,
      colspan,
      rowspan,
      style,
    })}>${render.children(entry, ctx)}</${tag}>`;
  }
  return out + '</tr>';
}

function escapeSummary(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
