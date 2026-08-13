import { DEFAULT_SORT, isValidSort } from '../api/products.js';

export const PAGE_SIZE = 12;

const DEFAULTS = Object.freeze({
  query: '',
  category: 'all',
  sort: DEFAULT_SORT,
  page: 1,
});

/**
 * Single source of truth for the catalogue query.
 *
 * State is mirrored into the URL so a filtered view can be shared or survive a
 * refresh. We use `replaceState` rather than `pushState`: typing in the search
 * box would otherwise push a history entry per keystroke, and a Back button
 * that walks backwards through half-typed queries is worse than no in-app
 * history at all.
 */
const state = { ...DEFAULTS };
const listeners = new Set();

export function getState() {
  return { ...state };
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(meta) {
  for (const listener of listeners) listener(getState(), meta);
}

/**
 * Merge a patch into state and notify subscribers.
 *
 * Any change other than an explicit `page` change resets to page 1 — landing on
 * page 7 of a brand new search would otherwise show an empty grid.
 */
export function setState(patch, meta = {}) {
  const next = { ...state, ...patch };
  if (!('page' in patch)) next.page = 1;

  const changed = Object.keys(next).some((key) => next[key] !== state[key]);
  if (!changed) return false;

  Object.assign(state, next);
  syncUrl();
  notify(meta);
  return true;
}

export function resetFilters(meta = {}) {
  return setState({ ...DEFAULTS }, meta);
}

export function hasActiveFilters() {
  return state.query.trim() !== '' || state.category !== DEFAULTS.category;
}

function syncUrl() {
  const params = new URLSearchParams();
  if (state.query.trim()) params.set('q', state.query.trim());
  if (state.category !== DEFAULTS.category) params.set('category', state.category);
  if (state.sort !== DEFAULTS.sort) params.set('sort', state.sort);
  if (state.page !== DEFAULTS.page) params.set('page', String(state.page));

  const search = params.toString();
  const url = `${window.location.pathname}${search ? `?${search}` : ''}`;
  window.history.replaceState(null, '', url);
}

/**
 * Seed state from the URL on boot.
 *
 * Every value is validated: `sort` against the known options and `page` as a
 * positive integer, so a hand-edited or stale URL degrades to defaults instead
 * of putting the UI in an impossible state. `category` is validated separately
 * by the caller, once the real category list has loaded.
 */
export function hydrateFromUrl() {
  const params = new URLSearchParams(window.location.search);

  const query = params.get('q');
  if (query) state.query = query.slice(0, 100);

  const category = params.get('category');
  if (category) state.category = category;

  const sort = params.get('sort');
  if (sort && isValidSort(sort)) state.sort = sort;

  const page = Number.parseInt(params.get('page') ?? '1', 10);
  if (Number.isFinite(page) && page > 0) state.page = page;

  return getState();
}

/**
 * Drop a category that isn't in the API's list (typo'd or removed upstream),
 * so we show the full catalogue rather than a permanently empty result set.
 */
export function reconcileCategory(validCategories) {
  if (state.category === DEFAULTS.category) return false;
  if (validCategories.includes(state.category)) return false;
  state.category = DEFAULTS.category;
  syncUrl();
  return true;
}
