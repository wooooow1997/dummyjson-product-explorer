// Import order is the cascade order: tokens, then reset, then structure, then
// components. Each component stylesheet co-locates its own responsive rules.
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/controls.css';
import './styles/catalogue.css';
import './styles/feedback.css';
import './styles/dialog.css';

import { el, qs, replaceChildren } from './lib/dom.js';
import { formatCompact, titleCase } from './lib/format.js';
import { fetchCategories, fetchProducts } from './api/products.js';
import {
  PAGE_SIZE,
  getState,
  hasActiveFilters,
  hydrateFromUrl,
  reconcileCategory,
  resetFilters,
  setState,
  subscribe,
} from './state/store.js';
import { createToolbar } from './ui/toolbar.js';
import { createProductGrid, createSkeletonGrid } from './ui/productGrid.js';
import { createPagination } from './ui/pagination.js';
import { createErrorPanel, createEmptyPanel } from './ui/statusPanel.js';
import { openProductModal } from './ui/productModal.js';

const mounts = {
  toolbar: qs('#toolbar-mount'),
  summary: qs('#results-summary'),
  results: qs('#results-mount'),
  pagination: qs('#pagination-mount'),
  announcer: qs('#announcer'),
  statTotal: qs('#stat-total'),
  statCategories: qs('#stat-categories'),
};

let toolbar = null;
let categories = [];
/** Monotonic token so a slow response from a superseded query is discarded. */
let requestId = 0;
let inFlight = null;
let lastResult = null;

/* ------------------------------------------------------------------ *
 * Announcements
 * ------------------------------------------------------------------ */

/**
 * Screen-reader announcements go through one dedicated live region.
 *
 * The grid itself is deliberately *not* a live region — marking it `aria-live`
 * makes assistive tech read out all twelve cards on every filter change.
 */
function announce(message) {
  mounts.announcer.textContent = message;
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

function renderSummary({ total, page, totalPages, count }) {
  const state = getState();
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = total === 0 ? 0 : from + count - 1;

  const context = [];
  if (state.query.trim()) context.push(`“${state.query.trim()}”`);
  if (state.category !== 'all') context.push(titleCase(state.category));

  const nodes = [
    el('p', { class: 'results-summary__count' }, [
      el('strong', { text: total === 0 ? 'No' : `${from}–${to}` }),
      el('span', { text: total === 0 ? ' products found' : ` of ${total} products` }),
    ]),
  ];

  if (context.length > 0) {
    nodes.push(
      el('p', { class: 'results-summary__context' }, [
        el('span', { text: `Filtered by ${context.join(' · ')}` }),
        el('button', {
          class: 'link-button',
          type: 'button',
          onClick: () => resetFilters({ announce: 'Filters cleared.' }),
        }, 'Clear'),
      ]),
    );
  }

  if (totalPages > 1) {
    nodes.push(el('p', { class: 'results-summary__pages', text: `Page ${page} of ${totalPages}` }));
  }

  replaceChildren(mounts.summary, nodes);
}

function renderLoading() {
  mounts.results.setAttribute('aria-busy', 'true');
  replaceChildren(mounts.results, createSkeletonGrid(PAGE_SIZE));
  replaceChildren(mounts.pagination, []);
  replaceChildren(mounts.summary, el('p', { class: 'results-summary__count', text: 'Loading products…' }));
}

function renderResults(result) {
  const state = getState();
  mounts.results.removeAttribute('aria-busy');
  lastResult = result;

  renderSummary({
    total: result.total,
    page: result.page,
    totalPages: result.totalPages,
    count: result.items.length,
  });

  if (result.items.length === 0) {
    replaceChildren(
      mounts.results,
      createEmptyPanel({
        query: state.query,
        category: state.category,
        onReset: () => resetFilters({ announce: 'Filters cleared.' }),
      }),
    );
    replaceChildren(mounts.pagination, []);
    announce(
      state.query.trim()
        ? `No products found for ${state.query.trim()}.`
        : 'No products found for the current filters.',
    );
    return;
  }

  replaceChildren(mounts.results, createProductGrid(result.items, openProductModal));
  replaceChildren(
    mounts.pagination,
    createPagination({
      page: result.page,
      totalPages: result.totalPages,
      onNavigate: (page) => setState({ page }, { scrollToResults: true }),
    }),
  );

  renderTotals();
  announce(`Showing ${result.items.length} of ${result.total} products, page ${result.page} of ${result.totalPages}.`);
}

function renderError(error) {
  mounts.results.removeAttribute('aria-busy');
  replaceChildren(mounts.summary, []);
  replaceChildren(mounts.pagination, []);
  replaceChildren(
    mounts.results,
    createErrorPanel({
      error,
      onRetry: () => load({ scrollToResults: false }),
      onReset: () => resetFilters(),
    }),
  );
  announce(`Error: ${error?.userMessage ?? 'The catalogue could not be loaded.'}`);
}

/* ------------------------------------------------------------------ *
 * Data loading
 * ------------------------------------------------------------------ */

/**
 * Load the current page of results.
 *
 * Guards against two distinct races that a naive `await fetch` gets wrong:
 * the in-flight request is aborted so the browser stops work on a superseded
 * query, and a monotonic token means a response that still arrives late can
 * never overwrite fresher results.
 */
async function load({ scrollToResults = false } = {}) {
  const token = ++requestId;
  inFlight?.abort();

  const controller = new AbortController();
  inFlight = controller;

  renderLoading();

  try {
    const state = getState();
    const result = await fetchProducts({
      query: state.query,
      category: state.category,
      sort: state.sort,
      page: state.page,
      pageSize: PAGE_SIZE,
      signal: controller.signal,
    });

    if (token !== requestId) return;

    // The API clamps out-of-range pages to an empty list; realign state so the
    // pager and URL reflect the page actually being shown.
    if (result.page !== state.page) {
      setState({ page: result.page });
      return;
    }

    renderResults(result);
    if (scrollToResults) scrollResultsIntoView();
  } catch (error) {
    if (error?.name === 'AbortError' || token !== requestId) return;
    renderError(error);
  } finally {
    if (inFlight === controller) inFlight = null;
  }
}

function scrollResultsIntoView() {
  const target = document.getElementById('results');
  if (!target) return;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
}

/* ------------------------------------------------------------------ *
 * Bootstrap
 * ------------------------------------------------------------------ */

/**
 * Load the category list.
 *
 * A failure here is non-fatal by design: the filter dropdown degrades to
 * "All categories" and the rest of the catalogue stays fully usable, rather
 * than one secondary request taking down the whole page.
 */
async function loadCategories() {
  try {
    categories = await fetchCategories();
    mounts.statCategories.textContent = String(categories.length);
  } catch {
    categories = [];
    mounts.statCategories.textContent = '—';
  }
}

/** The "products" stat reflects the whole catalogue, so only track unfiltered totals. */
function renderTotals() {
  if (lastResult && !hasActiveFilters()) {
    mounts.statTotal.textContent = formatCompact(lastResult.total);
  }
}

async function start() {
  hydrateFromUrl();
  await loadCategories();
  reconcileCategory(categories);

  toolbar = createToolbar({
    categories,
    state: getState(),
    onChange: (patch) => setState(patch),
  });
  mounts.toolbar.append(toolbar.element);

  subscribe((state, meta) => {
    toolbar.syncFromState(state);
    if (meta?.announce) announce(meta.announce);
    load({ scrollToResults: Boolean(meta?.scrollToResults) });
  });

  // Ctrl/Cmd + K is a common "focus search" affordance. The visible hint is
  // rendered per-platform (see toolbar.js) so macOS users aren't told "Ctrl".
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      toolbar.focusSearch();
    }
  });

  await load();
  renderTotals();
}

start();
