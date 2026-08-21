import { BookConfig } from '../js/book-config.js';
import { getIcon } from '../js/icons.js';

const BOOK_TEMPLATE = `<div class="book with-summary font-size-2 font-family-1">
        <a href="#" class="btn toggle-summary" aria-label="Toggle navigation">
            <span class="menu-icon"></span>
        </a>
        <nav class="book-summary" role="navigation" aria-label="Table of contents">
        </nav>

          <main class="book-body" role="main">
            <div class="body-inner">
              <div class="page-wrapper" tabindex="-1">
                <div class="page-inner">
                  <section class="normal">
                    <!-- content -->
                  </section>
                </div>
              </div>
            </div>
          </main>
        </div>`;

function docReady(fn) {
  // see if DOM is already available
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    // call on next available tick
    setTimeout(fn, 16);
  } else {
    document.addEventListener('DOMContentLoaded', fn);
  }
}

function parser() {
  //# Squirrel the body and replace it with the template:

  // Pull out all the interesting DOM nodes from the template
  const body = document.body;

  const originalPage = Array.from(body.childNodes);

  body.innerHTML = '';
  body.insertAdjacentHTML('beforeend', BOOK_TEMPLATE);

  const book = body.querySelector('.book');
  const bookPage = book.querySelector('.page-inner > .normal');
  const bookSummary = book.querySelector('.book-summary');
  const bookBody = book.querySelector('.book-body');
  const toggleSummary = book.querySelector('.toggle-summary');

  // Populate the menu icon
  const menuIcon = toggleSummary.querySelector('.menu-icon');
  if (menuIcon) {
    menuIcon.innerHTML = getIcon('bars', '1.2em');
  }

  /** Storage may be unavailable in sandboxed or privacy-restricted contexts. */
  const storageGet = key => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const storageSet = (key, value) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* ignore quota / privacy-mode failures */
    }
  };

  /** Read visited-page map from localStorage; never throw on corrupt data. */
  const readVisited = () => {
    try {
      const raw = storageGet('visited');
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  };

  /** Persist visited-page map; ignore quota / private-mode failures. */
  const writeVisited = visited => storageSet('visited', JSON.stringify(visited));

  /** Find a ToC link by exact href without building a CSS selector from the path. */
  const findTocLink = href => {
    for (const a of bookSummary.querySelectorAll('.summary a[href]')) {
      if (a.getAttribute('href') === href) return a;
    }
    return null;
  };

  toggleSummary.setAttribute('aria-expanded', String(book.classList.contains('with-summary')));
  toggleSummary.addEventListener('click', event => {
    const shown = book.classList.toggle('with-summary');
    toggleSummary.setAttribute('aria-expanded', String(shown));
    event.preventDefault();
  });

  // Add resize handle to sidebar
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'resize-handle';
  bookSummary.appendChild(resizeHandle);

  // Load saved sidebar width from localStorage
  const savedWidth = Number.parseInt(storageGet('sidebarWidth'), 10);
  if (Number.isFinite(savedWidth)) {
    document.documentElement.style.setProperty('--sidebar-width', `${savedWidth}px`);
  }

  // Sidebar resize functionality
  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  resizeHandle.addEventListener('mousedown', e => {
    isResizing = true;
    startX = e.clientX;
    const computedStyle = getComputedStyle(document.documentElement);
    startWidth = parseInt(computedStyle.getPropertyValue('--sidebar-width'));
    resizeHandle.classList.add('resizing');
    book.classList.add('without-animation');
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!isResizing) return;

    const delta = e.clientX - startX;
    const newWidth = startWidth + delta;
    const minWidth = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--sidebar-min-width')
    );
    const maxWidth = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--sidebar-max-width')
    );

    // Constrain width between min and max
    const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
    document.documentElement.style.setProperty('--sidebar-width', `${constrainedWidth}px`);
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizeHandle.classList.remove('resizing');
      book.classList.remove('without-animation');

      // Save the new width to localStorage
      const currentWidth = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width')
      );
      storageSet('sidebarWidth', String(currentWidth));
    }
  });

  /**
   * render the summary on the left-hand side of the page
   */
  const renderToc = () => {
    const summary = document.createElement('ul');
    summary.className = 'summary';

    const tocChildren = Array.from(tocHelper.toc.children);
    tocChildren.forEach(li => {
      summary.appendChild(li);
    });

    // Volumes and chapters are collapsible; only the chain containing the
    // current page starts expanded (see expandTocChain).
    summary.querySelectorAll('li.volume, li.chapter').forEach(li => {
      const sublist = li.querySelector(':scope > ul, :scope > ol');
      if (!sublist) return;
      li.classList.add('collapsible');
      const toggle = document.createElement('button');
      toggle.className = 'toc-toggle';
      toggle.setAttribute('aria-label', 'Expand or collapse');
      toggle.innerHTML = getIcon('chevronRight', '0.75em');
      toggle.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        li.classList.toggle('expanded');
      });
      li.insertBefore(toggle, li.firstChild);
    });

    // Update the ToC to show which links have been visited
    // Add a "hidden" checkmark next to each item
    const visitedLinks = readVisited();
    const linkElements = summary.querySelectorAll('a[href]');
    linkElements.forEach(link => {
      const href = link.getAttribute('href');
      const listItem = link.closest('li');
      const checkmarkIcon = document.createElement('i');
      checkmarkIcon.className = 'fa-check';
      checkmarkIcon.setAttribute('aria-hidden', 'true');
      checkmarkIcon.innerHTML = getIcon('check', '1em');
      // Insert at the <li> level so chapter entries (wrapped in <p>) layout
      // correctly. Only a direct-child <p> counts — volume entries contain
      // nested chapter <p>s that are not children of this li.
      const insertBefore = listItem.querySelector(':scope > p') || link;
      if (insertBefore.parentNode === listItem) {
        listItem.insertBefore(checkmarkIcon, insertBefore);
      }

      if (visitedLinks[href]) {
        listItem.classList.add('visited');
      }
    });

    const existingSummary = bookSummary.querySelector('.summary');
    if (existingSummary) {
      existingSummary.remove();
    }

    bookSummary.appendChild(summary);

    expandTocChain(new URL(window.location.href).pathname, true);

    renderNextPrev();
  };

  /**
   * Expand every collapsible sidebar ancestor of the given page and optionally
   * scroll its entry into view. Works for section links (direct <a> children)
   * and chapter/volume links (wrapped in <p>).
   * @param {string} pagePath
   * @param {boolean} scroll
   */
  const expandTocChain = (pagePath, scroll = false) => {
    const link = findTocLink(pagePath);
    if (!link) return;
    let el = link.closest('li');
    const currentLi = el;
    while (el && !el.classList.contains('summary')) {
      if (el.tagName === 'LI' && el.classList.contains('collapsible')) {
        el.classList.add('expanded');
      }
      el = el.parentElement;
    }
    if (scroll && currentLi) {
      currentLi.scrollIntoView({ block: 'center' });
    }
  };

  const renderNextPrev = () => {
    // Remove existing navigation buttons
    const existingNavigation = bookBody.querySelectorAll('.navigation');
    existingNavigation.forEach(nav => nav.remove());

    const currentUrl = new URL(window.location.href);
    currentUrl.hash = '';
    let prev = tocHelper.prevPageHref(currentUrl.href);
    let next = tocHelper.nextPageHref(currentUrl.href);

    if (prev) {
      prev = new URL(prev, window.location.href).pathname;
      const prevPage = document.createElement('a');
      prevPage.className = 'navigation navigation-prev';
      prevPage.href = prev;
      prevPage.setAttribute('aria-label', 'Previous page');
      prevPage.innerHTML = getIcon('chevronLeft', '1.5em');
      bookBody.appendChild(prevPage);
    }

    if (next) {
      next = new URL(next, window.location.href).pathname;
      const nextPage = document.createElement('a');
      nextPage.className = 'navigation navigation-next';
      nextPage.href = next;
      nextPage.setAttribute('aria-label', 'Next page');
      nextPage.innerHTML = getIcon('chevronRight', '1.5em');
      bookBody.appendChild(nextPage);
    }
  };

  /**
   * Build the theme toggle. The dark class itself is applied to <html> before
   * first paint by the inline script in head.njk (which also honours the OS
   * preference); this only reflects and flips that state. Created once — the
   * button lives in .book-body and survives SPA navigations.
   */
  const renderDarkModeToggle = () => {
    const root = document.documentElement;
    const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'dark-mode-toggle';
    toggleBtn.title = 'Toggle Dark Mode';
    toggleBtn.setAttribute('aria-label', 'Toggle Dark Mode');

    const syncButton = () => {
      const isDarkMode = root.classList.contains('dark-mode');
      toggleBtn.innerHTML = getIcon(isDarkMode ? 'sun' : 'moon', '1.2em');
      toggleBtn.setAttribute('aria-pressed', String(isDarkMode));
    };
    syncButton();

    toggleBtn.addEventListener('click', () => {
      const isDarkMode = root.classList.toggle('dark-mode');
      storageSet('darkMode', isDarkMode ? 'enabled' : 'disabled');
      syncButton();
    });

    // Follow the OS preference while the reader has never chosen explicitly.
    if (media && media.addEventListener) {
      media.addEventListener('change', event => {
        if (storageGet('darkMode')) return;
        root.classList.toggle('dark-mode', event.matches);
        syncButton();
      });
    }

    bookBody.appendChild(toggleBtn);
  };

  /**
   *
   * @param {Element} els
   * @param {string} href
   */
  const newPageBeforeRender = (els, href) => {
    els.querySelectorAll('.example, .exercise, .note').forEach(el => {
      const contents = Array.from(el.childNodes).filter(node => {
        return !node.classList || !node.classList.contains('title');
      });
      const section = document.createElement('section');
      contents.forEach(node => {
        section.appendChild(node);
      });
      el.append(section);

      const title = el.querySelector('.title');
      if (title) {
        el.insertBefore(title, el.firstChild);

        const header = document.createElement('header');
        header.append(title);
        el.insertBefore(header, el.firstChild);

        // Add an attribute for the parents' `data-label`
        // since CSS does not support `parent(attr(data-label))`.
        // When the title exists, this attribute is added before it
        const dataLabelParent = el.getAttribute('data-label');
        title.setAttribute('data-label-parent', dataLabelParent);
      }

      el.classList.toggle('ui-has-child-title', title !== null);
    });

    els.querySelectorAll('.solution').forEach(solution => {
      const section = document.createElement('section');
      while (solution.firstChild) {
        section.appendChild(solution.firstChild);
      }
      solution.appendChild(section);
      const toggleWrapper = document.createElement('div');
      toggleWrapper.className = 'ui-toggle-wrapper';
      solution.insertBefore(toggleWrapper, solution.firstChild);
      const toggleButton = document.createElement('button');
      toggleButton.className = 'btn-link ui-toggle';
      toggleButton.setAttribute('title', 'Show/Hide Solution');
      toggleButton.textContent = 'Show Solution';
      toggleWrapper.appendChild(toggleButton);

      // Mark solution section to skip MathJax processing initially
      const solutionSection = solution.querySelector('section');
      if (solutionSection) {
        solutionSection.classList.add('mathjax-skip');
        solutionSection.setAttribute('data-math-typeset', 'false');
      }

      toggleButton.addEventListener('click', e => {
        const solution = e.currentTarget.closest('.solution');
        solution.classList.toggle('ui-solution-visible');

        // Update button text
        const isVisible = solution.classList.contains('ui-solution-visible');
        e.currentTarget.textContent = isVisible ? 'Hide Solution' : 'Show Solution';

        // Typeset math when solution is first revealed
        const solutionSection = solution.querySelector('section');
        if (
          solutionSection &&
          isVisible &&
          solutionSection.getAttribute('data-math-typeset') === 'false'
        ) {
          solutionSection.setAttribute('data-math-typeset', 'true');
          solutionSection.classList.remove('mathjax-skip');
          typesetMathLazy(solutionSection);
        }
      });
    });

    els.querySelectorAll('figure:has(> figcaption)').forEach(figure => {
      figure.classList.add('ui-has-child-figcaption');
    });

    els.querySelectorAll('figcaption').forEach(figcaption => {
      figcaption.parentNode.appendChild(figcaption);
    });

    const currentPagePath = new URL(href, window.location.href).pathname;
    const visited = readVisited();
    visited[currentPagePath] = new Date().toISOString();
    writeVisited(visited);

    const currentLink = findTocLink(currentPagePath);
    const listItem = currentLink ? currentLink.closest('li') : null;

    if (listItem !== null) {
      listItem.classList.add('visited');
      expandTocChain(currentPagePath, true);
    }

    const selector = 'h1, h2, h3, h4, h5, h6';
    const all = Array.from(els.querySelectorAll(selector));
    all.forEach(el => {
      const id = el.getAttribute('id');
      if (id) {
        const icon = document.createElement('i');
        icon.innerHTML = getIcon('link', '0.875em');
        const a = document.createElement('a');
        a.className = 'header-link';
        a.setAttribute('href', `#${id}`);
        a.setAttribute('aria-label', `Link to section: ${el.textContent.trim()}`);
        a.appendChild(icon);
        el.insertBefore(a, el.firstChild);
      }
    });
  };

  /**
   * Lazy typeset for a specific element (used for hidden content)
   * @param {Element} el - The element to typeset
   */
  const typesetMathLazy = el => {
    if (typeof MathJax !== 'undefined' && MathJax.startup && MathJax.startup.promise) {
      MathJax.startup.promise
        .then(() => MathJax.typesetPromise([el]))
        .catch(err => console.error('MathJax lazy typeset failed:', err.message));
    }
  };

  // Give MathJax this many 100ms ticks to load before giving up (offline
  // first visit, blocked script, ...) instead of retrying forever.
  const TYPESET_MAX_RETRIES = 50;

  /**
   * Typeset MathJax content after element is in DOM
   * @param {Element} els - The element containing math to typeset
   * @param {boolean} clearFirst - Whether to clear previously typeset content
   * @param {Function} [after] - Callback re-run once typesetting settles
   */
  const typesetMath = (els, clearFirst = false, after = null) => {
    const doTypeset = attempt => {
      if (typeof MathJax !== 'undefined' && MathJax.startup && MathJax.startup.promise) {
        MathJax.startup.promise
          .then(() => {
            // Clear any previously typeset content if this is a page change
            if (clearFirst) {
              MathJax.typesetClear([els]);
            }
            // MathJax will automatically skip elements with 'mathjax-skip' class
            return MathJax.typesetPromise([els]);
          })
          .then(() => {
            if (after) after();
          })
          .catch(err => {
            console.error('MathJax typeset failed:', err.message);
            if (after) after();
          });
      } else if (attempt < TYPESET_MAX_RETRIES) {
        setTimeout(() => doTypeset(attempt + 1), 100);
      } else {
        console.warn('MathJax did not load; skipping typeset');
        if (after) after();
      }
    };

    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => doTypeset(0));
  };

  /**
   *
   * @constructor
   */

  function TocHelper() {
    // {string[]}
    this._tocList = [];

    /**
     * @param {Element} toc
     * @returns {function}
     */
    this.loadToc = function (toc) {
      this.toc = toc;
      const tocUrl = new URL(BookConfig.toc.url, window.location.href);

      // Normalize every ToC href to an absolute path so findTocLink can compare
      // it against location.pathname by string equality.
      toc.querySelectorAll('a[href]').forEach(el => {
        el.setAttribute('href', new URL(el.getAttribute('href'), tocUrl).pathname);
      });

      this._tocList = Array.from(toc.querySelectorAll('a[href]')).map(el =>
        new URL(el.getAttribute('href'), tocUrl).toString()
      );

      return renderToc();
    };

    /**
     * @private
     * @param {string} currentHref
     * @returns {number}
     */
    this.currentPageIndex = function (currentHref) {
      return this._tocList.indexOf(currentHref);
    };

    /**
     * @protected
     * @param {string} currentHref
     * @returns {string|undefined}
     */
    this.prevPageHref = function (currentHref) {
      const currentIndex = this.currentPageIndex(currentHref);
      return this._tocList[currentIndex - 1]; //# returns undefined if no previous page
    };

    /**
     * @protected
     * @param {string} currentHref
     * @returns {string|undefined}
     */
    this.nextPageHref = function (currentHref) {
      const currentIndex = this.currentPageIndex(currentHref);
      return this._tocList[currentIndex + 1]; // # returns undefined if no next page
    };
  }

  const tocHelper = new TocHelper();

  fetch(BookConfig.toc.url, {
    headers: {
      Accept: 'application/xhtml+xml',
    },
  })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Table of contents request failed with status ${response.status}`);
      }
      return response.text();
    })
    .then(html => {
      const doc = new DOMParser().parseFromString(html, 'text/html');

      let toc = doc.body.querySelector(BookConfig.toc.selector);
      if (!toc) throw new Error('Table of contents response has no matching root element');
      if (toc.tagName.toLowerCase() === 'ul') {
        // HACK for collection HTML
        toc = toc.querySelector('ul');
      }
      if (!toc) throw new Error('Table of contents response has no nested list');

      tocHelper.loadToc(toc);
    })
    .catch(error => {
      console.error('Failed to load table of contents:', error);
      const message = document.createElement('p');
      message.className = 'toc-error';
      message.setAttribute('role', 'alert');
      message.textContent = 'The table of contents could not be loaded. Reload the page to try again.';
      bookSummary.appendChild(message);
    });

  //  # Fetch resources without fixing up their paths
  if (BookConfig.baseHref) {
    const baseElement = book.querySelector('base');
    if (baseElement) {
      baseElement.remove();
    }
    const baseTag = document.createElement('base');
    baseTag.setAttribute('href', BookConfig.baseHref);
    book.prepend(baseTag);
  }

  const altPage = document.createElement('div');
  altPage.className = 'contents';
  altPage.append(...originalPage);
  newPageBeforeRender(altPage, new URL(window.location.href).pathname);
  bookPage.append(altPage);
  // Typeset MathJax after content is in DOM
  typesetMath(altPage);
  renderDarkModeToggle();

  // The shell (including .book-summary) now exists. search-ui.js waits for
  // this instead of polling for the sidebar to appear.
  window.dispatchEvent(new CustomEvent('bookviewerready'));

  let activeNavigation = 0;
  let navigationController = null;

  const showNavigationError = message => {
    bookPage.querySelector('.navigation-error')?.remove();
    const error = document.createElement('p');
    error.className = 'navigation-error';
    error.setAttribute('role', 'alert');
    error.textContent = message;
    bookPage.prepend(error);
  };

  /**
   * Fetch and render a page without allowing stale responses to win.
   * @param {string} href
   * @param {{ pushHistory?: boolean }} options
   * @returns {Promise<boolean>}
   */
  const changePage = async (href, { pushHistory = true } = {}) => {
    const targetUrl = new URL(href, window.location.href);
    const navigationId = ++activeNavigation;
    navigationController?.abort();
    const controller = new AbortController();
    navigationController = controller;
    book.classList.add('loading');
    bookPage.querySelector('.navigation-error')?.remove();

    try {
      const response = await fetch(targetUrl.href, {
        headers: {
          Accept: 'application/xhtml+xml',
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Page request failed with status ${response.status}`);
      }
      const html = await response.text();
      if (navigationId !== activeNavigation) return false;

      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const nextTitle = parsed.querySelector('title')?.textContent?.trim();
      parsed.querySelectorAll('meta, link, script, title').forEach(el => el.remove());

      if (pushHistory) {
        window.history.pushState(null, '', targetUrl.href);
      }

      // Need to set the URL *before* <img> tags area created
      // Fetch resources without fixing up their paths
      if (BookConfig.baseHref) {
        const baseElement = book.querySelector('base');
        if (baseElement) {
          baseElement.remove();
        }
        const baseTag = document.createElement('base');
        baseTag.setAttribute('href', targetUrl.href);
        book.prepend(baseTag);
      }

      bookPage.innerHTML = '';
      const altPage = document.createElement('div');
      altPage.className = 'contents';
      altPage.append(...parsed.body.childNodes);
      newPageBeforeRender(altPage, targetUrl.href);
      bookPage.append(altPage);
      if (nextTitle) document.title = nextTitle;
      renderNextPrev();

      // Honor a #fragment on cross-page links (cross-module references);
      // otherwise scroll to the top of the page. Scrolled twice: immediately,
      // then again after MathJax typesetting, which can shift the target.
      let fragmentId = '';
      try {
        fragmentId = decodeURIComponent(targetUrl.hash.slice(1));
      } catch {
        fragmentId = targetUrl.hash.slice(1);
      }
      const scrollToTarget = () => {
        const target = fragmentId ? altPage.querySelector(`#${CSS.escape(fragmentId)}`) : null;
        if (target) {
          target.scrollIntoView();
        } else {
          document.querySelector('.body-inner').scrollTop = 0;
        }
      };
      scrollToTarget();
      // Typeset MathJax after content is in DOM (clear previous content)
      typesetMath(altPage, true, scrollToTarget);
      return true;
    } catch (error) {
      if (error.name === 'AbortError') return false;
      if (navigationId === activeNavigation) {
        console.error('Failed to load page:', error);
        showNavigationError('The requested page could not be loaded. Please try again.');
      }
      return false;
    } finally {
      if (navigationId === activeNavigation) {
        book.classList.remove('loading');
      }
    }
  };

  document.body.addEventListener('keydown', event => {
    if (document.activeElement.matches('input, textarea, select, [contenteditable="true"]')) return;
    const link =
      event.key === 'ArrowLeft'
        ? document.querySelector('.book .navigation-prev')
        : event.key === 'ArrowRight'
          ? document.querySelector('.book .navigation-next')
          : null;
    if (link) link.click();
  });

  // Swipe navigation for mobile
  let touchStartX = 0;
  let touchStartY = 0;
  let touchEndX = 0;
  let touchEndY = 0;
  let isSwiping = false;

  const MIN_SWIPE_DISTANCE = 50; // minimum distance for a swipe (pixels)
  const MAX_VERTICAL_DISTANCE = 100; // maximum vertical movement allowed (pixels)

  bookBody.addEventListener(
    'touchstart',
    event => {
      // Only track single-finger touches
      if (event.touches.length === 1) {
        touchStartX = event.touches[0].clientX;
        touchStartY = event.touches[0].clientY;
        isSwiping = false;
      }
    },
    { passive: true }
  );

  bookBody.addEventListener(
    'touchmove',
    event => {
      if (event.touches.length === 1) {
        touchEndX = event.touches[0].clientX;
        touchEndY = event.touches[0].clientY;

        const deltaX = Math.abs(touchEndX - touchStartX);
        const deltaY = Math.abs(touchEndY - touchStartY);

        // Detect horizontal swipe (more horizontal than vertical movement)
        if (deltaX > deltaY && deltaX > 10) {
          isSwiping = true;
          // Add visual feedback
          const swipeDistance = touchEndX - touchStartX;
          const pageWrapper = bookBody.querySelector('.page-wrapper');
          if (pageWrapper) {
            const transform = Math.max(-100, Math.min(100, swipeDistance * 0.2));
            pageWrapper.style.transition = 'none';
            pageWrapper.style.transform = `translateX(${transform}px)`;
            pageWrapper.style.opacity = 1 - Math.abs(transform) / 200;
          }
        }
      }
    },
    { passive: true }
  );

  bookBody.addEventListener(
    'touchend',
    _event => {
      if (isSwiping) {
        const swipeDistance = touchEndX - touchStartX;
        const verticalDistance = Math.abs(touchEndY - touchStartY);

        // Reset visual feedback
        const pageWrapper = bookBody.querySelector('.page-wrapper');
        if (pageWrapper) {
          pageWrapper.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
          pageWrapper.style.transform = '';
          pageWrapper.style.opacity = '';
        }

        // Only navigate if swipe is primarily horizontal and meets minimum distance
        if (
          verticalDistance < MAX_VERTICAL_DISTANCE &&
          Math.abs(swipeDistance) >= MIN_SWIPE_DISTANCE
        ) {
          let link = null;

          if (swipeDistance > 0) {
            // Swipe right (go to previous page)
            link = document.querySelector('.book .navigation-prev');
          } else {
            // Swipe left (go to next page)
            link = document.querySelector('.book .navigation-next');
          }

          if (link !== null) {
            // Delay navigation slightly to allow visual feedback to complete
            setTimeout(() => {
              link.click();
            }, 100);
          }
        }

        isSwiping = false;
      }

      touchStartX = 0;
      touchStartY = 0;
      touchEndX = 0;
      touchEndY = 0;
    },
    { passive: true }
  );

  document.body.addEventListener('click', event => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!target || target.hasAttribute('download') || target.target) return;

    const rawHref = target.getAttribute('href');
    if (!rawHref || rawHref.startsWith('#')) return;

    let url;
    try {
      url = new URL(rawHref, window.location.href);
    } catch {
      return;
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== window.location.origin) return;

    const appRoot = BookConfig.rootUrl || '';
    if (appRoot && url.pathname !== appRoot && !url.pathname.startsWith(`${appRoot}/`)) return;

    // Open same-origin PDFs in a new tab; let all other downloads use the browser.
    if (/\.pdf$/i.test(url.pathname)) {
      event.preventDefault();
      window.open(url.href, '_blank', 'noopener');
      return;
    }
    const fileExtensions = /\.(zip|tar|gz|rar|7z|doc|docx|xls|xlsx|ppt|pptx)$/i;
    if (fileExtensions.test(url.pathname)) return;

    event.preventDefault();
    changePage(url.href);
  });

  window.addEventListener('popstate', () => {
    changePage(window.location.href, { pushHistory: false });
  });
}

docReady(parser);
