// MathJax v4 configuration — MathML input (the CNXML source embeds presentation MathML).
// Must load before the MathJax script itself (mml-chtml.js).

// Self-hosted fonts: MathJax resolves the font data, dynamic glyph ranges, and
// woff2 files against the "[fonts]" loader path (default: cdn.jsdelivr.net).
// Point it at the copy that `npm run update:mathjax` places under
// assets/js/mathjax/fonts/. The site's URL prefix differs per deployment
// (GitHub Pages vs Vercel), so derive it from this script's own src.
const mathJaxFontsPath =
  document.currentScript.src.replace(/\/math-config\.js([?#].*)?$/, '') + '/mathjax/fonts';

window.MathJax = {
  loader: {
    load: ['ui/menu'],
    paths: {
      fonts: mathJaxFontsPath,
    },
  },
  options: {
    // Solutions are typeset lazily by book-viewer.js when revealed.
    ignoreHtmlClass: 'mathjax-skip',
    enableMenu: true,
    menuOptions: {
      settings: {
        enrich: true,
        speech: true,
        inTabOrder: true,
      },
    },
  },
  mml: {
    parseAs: 'html',
    forceReparse: false,
  },
  chtml: {
    displayOverflow: 'overflow',
    scale: 1.0,
    minScale: 0.5,
  },
};
