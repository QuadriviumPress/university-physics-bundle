import { escapeText, escapeAttr } from './html.js';

// Allowlist of MathML attribute names passed through to output. Attribute
// VALUES are escaped, but names are emitted verbatim — an unexpected name
// (e.g. an on* handler injected by upstream content) must never reach the
// page. Covers every attribute used by the corpus plus the standard MathML
// presentation attributes, so routine upstream errata pass through unchanged.
const ALLOWED_ATTRS = new Set([
  'accent',
  'accentunder',
  'actiontype',
  'align',
  'bevelled',
  'class',
  'close',
  'columnalign',
  'columnlines',
  'columnspacing',
  'columnspan',
  'denomalign',
  'depth',
  'dir',
  'display',
  'displaystyle',
  'edge',
  'equalcolumns',
  'equalrows',
  'fence',
  'fontstyle',
  'fontweight',
  'form',
  'frame',
  'framespacing',
  'groupalign',
  'height',
  'id',
  'linethickness',
  'lspace',
  'mathbackground',
  'mathcolor',
  'mathsize',
  'mathvariant',
  'maxsize',
  'minsize',
  'movablelimits',
  'notation',
  'numalign',
  'open',
  'position',
  'rowalign',
  'rowlines',
  'rowspacing',
  'rowspan',
  'rspace',
  'scriptlevel',
  'selection',
  'separator',
  'separators',
  'shift',
  'side',
  'stackalign',
  'stretchy',
  'symmetric',
  'voffset',
  'width',
]);

// Allowlist of element names passed through to output, for the same reason as
// ALLOWED_ATTRS above: a tag name from upstream content must never reach the
// page unchecked (an attribute allowlist alone would still let a <script>
// smuggled inside <m:math> through). Covers the MathML 4 presentation
// vocabulary, which is a superset of the 21 elements this corpus uses.
const ALLOWED_ELEMENTS = new Set([
  'annotation',
  'annotation-xml',
  'maction',
  'menclose',
  'merror',
  'mfenced',
  'mfrac',
  'mi',
  'mmultiscripts',
  'mn',
  'mo',
  'mover',
  'mpadded',
  'mphantom',
  'mprescripts',
  'mroot',
  'mrow',
  'ms',
  'mspace',
  'msqrt',
  'mstyle',
  'msub',
  'msubsup',
  'msup',
  'mtable',
  'mtd',
  'mtext',
  'mtr',
  'munder',
  'munderover',
  'none',
  'semantics',
]);

/**
 * Serialize a `<m:math>` subtree to HTML MathML: strip the `m:` prefix (HTML
 * MathML is unprefixed), add the MathML namespace on the root, and preserve
 * structure, attributes, and text verbatim. `display: true` marks display math
 * (direct child of <equation>).
 *
 * `warn` (optional) receives a message for each element dropped by the
 * allowlist, so an upstream vocabulary change surfaces in the build log rather
 * than silently losing math.
 */
export function renderMathML(el, { display = false, warn = null } = {}) {
  const attrsOut = serializeAttrs(el, {
    xmlns: 'http://www.w3.org/1998/Math/MathML',
    ...(display ? { display: 'block' } : {}),
  });
  return `<math${attrsOut}>${serializeChildren(el, warn)}</math>`;
}

function serialize(node, warn) {
  if (node.type === 'text') return escapeText(node.data);
  if (node.type !== 'tag') return '';
  const name = node.name.startsWith('m:') ? node.name.slice(2) : node.name;
  if (!ALLOWED_ELEMENTS.has(name)) {
    // Keep the text so the formula degrades rather than vanishing, but never
    // emit the element itself.
    if (warn) warn(`dropped unexpected element <${node.name}> inside <m:math>`);
    return serializeChildren(node, warn);
  }
  return `<${name}${serializeAttrs(node)}>${serializeChildren(node, warn)}</${name}>`;
}

function serializeChildren(node, warn) {
  return (node.children || []).map(child => serialize(child, warn)).join('');
}

function serializeAttrs(node, extra = {}) {
  const merged = { ...extra };
  for (const [k, v] of Object.entries(node.attribs || {})) {
    if (ALLOWED_ATTRS.has(k)) merged[k] = v;
  }
  let out = '';
  for (const [k, v] of Object.entries(merged)) {
    out += ` ${k}="${escapeAttr(v)}"`;
  }
  return out;
}
