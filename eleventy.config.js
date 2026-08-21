// GitHub Pages serves this project site under /university-physics-bundle/. Vercel serves
// it at a domain root, so it must build with no path prefix — detected via the VERCEL env
// var that Vercel sets automatically.
export const PATH_PREFIX = process.env.VERCEL ? '/' : '/university-physics-bundle/';

export default function (eleventyConfig) {
  // Input is the repo root (which is primarily CNXML content, not templates), so drive
  // input exclusions explicitly from .eleventyignore rather than .gitignore.
  eleventyConfig.setUseGitIgnore(false);

  // The CNXML source (in the source/ submodule) is not part of Eleventy's
  // template graph (it is read by _data/book.js), so watch it manually for
  // dev-server rebuilds.
  eleventyConfig.addWatchTarget('./source/modules/');
  eleventyConfig.addWatchTarget('./source/collections/');
  eleventyConfig.addWatchTarget('./lib/');

  // Root-relative asset/link URLs get the pathPrefix at build time. Narrow regex
  // transform (same approach as physics-book2): prefixes ONLY single-slash
  // root-relative href/src and leaves ./ ../ # http(s) verbatim.
  eleventyConfig.addTransform('pathPrefix', function (content) {
    const out = this.page && this.page.outputPath;
    if (typeof out !== 'string' || !out.endsWith('.html')) return content;
    const prefix = PATH_PREFIX.replace(/\/+$/, '');
    if (!prefix) return content; // root-hosted (Vercel): nothing to add
    return content.replace(
      /(\s(?:href|src)=)"(\/(?!\/)[^"]*)"/g,
      (_, pre, url) => `${pre}"${prefix}${url}"`
    );
  });

  // window.Book.rootUrl/baseHref must have NO trailing slash (they concatenate
  // with /SUMMARY.html etc.).
  eleventyConfig.addFilter('trimSlash', v => String(v).replace(/\/+$/, ''));

  // Passthrough: copy media + cover out of the source/ submodule into /media/
  // and /cover/ at the site root (object form remaps the output URL so it stays
  // root-relative). The media glob excludes .DS_Store and a handful of stray
  // extensionless files present upstream.
  eleventyConfig.addPassthroughCopy({ 'source/media/*.{jpg,jpeg,png}': 'media' });
  eleventyConfig.addPassthroughCopy({ 'source/cover': 'cover' });
  eleventyConfig.addPassthroughCopy({ assets: 'assets' });

  // Dev server: serve passthrough files from their source location instead of
  // copying ~228 MB of media into _site on every serve.
  eleventyConfig.setServerPassthroughCopyBehavior('passthrough');

  return {
    dir: {
      input: '.',
      includes: '_includes',
      layouts: '_includes/layouts',
      data: '_data',
    },
    templateFormats: ['njk'], // content comes from CNXML via _data/book.js, not files
    htmlTemplateEngine: 'njk',
    pathPrefix: PATH_PREFIX,
  };
}
