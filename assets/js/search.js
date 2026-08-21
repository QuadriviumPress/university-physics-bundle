/**
 * Client-Side Search Module for Physics Book PWA
 *
 * Offline-capable full-text search over the pre-built MiniSearch index.
 *
 * The index is ~2 MB, so it is fetched lazily — on the reader's first
 * interaction with the search box, not on page load — and never precached by
 * the service worker. Once fetched it is cached by the runtime handler, so
 * later visits (including offline ones) resolve from cache.
 */

// Self-hosted MiniSearch, copied from node_modules by `npm run update:minisearch`
import MiniSearch from './vendor/minisearch.js';
import { BookConfig } from './book-config.js';

class SearchManager {
  constructor() {
    this.miniSearch = null;
    this.isReady = false;
    this.loadPromise = null;
    this.baseUrl = `${BookConfig.rootUrl || ''}/`;
  }

  /**
   * Load and deserialize the search index. Safe to call repeatedly: the first
   * call starts the fetch, later ones join it. A failed load is not cached, so
   * a reader who was offline can retry simply by typing again.
   * @returns {Promise<boolean>} True once the index is queryable
   */
  ensureReady() {
    if (this.isReady) return Promise.resolve(true);
    if (!this.loadPromise) {
      this.loadPromise = this.load().catch(error => {
        console.error('Failed to initialize search:', error);
        this.loadPromise = null;
        return false;
      });
    }
    return this.loadPromise;
  }

  /** @private */
  async load() {
    const response = await fetch(`${this.baseUrl}search_index.json`);
    if (!response.ok) {
      throw new Error(`Failed to load search index: ${response.status}`);
    }

    const data = await response.json();

    // loadJS expects the parsed JSON object, not a stringified version. The
    // field configuration must match the one build-index.js indexed with.
    this.miniSearch = MiniSearch.loadJS(data.index, {
      fields: ['title', 'content'],
      storeFields: ['title', 'url', 'preview'],
    });

    this.isReady = true;
    window.dispatchEvent(new CustomEvent('searchready'));
    return true;
  }

  /**
   * Perform a search query.
   * @param {string} query - The search query
   * @param {number} maxResults - Maximum number of results to return
   * @returns {Array} Array of search results
   */
  search(query, maxResults = 10) {
    if (!this.isReady || !query || query.trim().length === 0) {
      return [];
    }

    try {
      const results = this.miniSearch.search(query, {
        boost: { title: 2 },
        fuzzy: 0.2,
        prefix: true,
      });

      // title/url/preview come back on the result itself (storeFields), so
      // there is no side table to look them up in.
      return results.slice(0, maxResults).map(result => ({
        id: result.id,
        title: result.title,
        url: result.url,
        preview: result.preview,
        score: result.score,
      }));
    } catch (error) {
      console.error('Search error:', error);
      return [];
    }
  }

  /**
   * Check if search is ready
   * @returns {boolean} True if the index is loaded and queryable
   */
  ready() {
    return this.isReady;
  }
}

// Create and export singleton instance. Deliberately NOT initialized here:
// search-ui.js calls ensureReady() when the reader first uses the search box.
const searchManager = new SearchManager();

export default searchManager;

// Also make available globally for non-module scripts
window.searchManager = searchManager;
