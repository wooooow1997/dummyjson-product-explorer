import { el } from '../lib/dom.js';
import { icons } from '../lib/icons.js';
import { titleCase } from '../lib/format.js';
import { SORT_OPTIONS } from '../api/products.js';
import { debounce } from '../lib/debounce.js';

const SEARCH_DEBOUNCE_MS = 350;
const MAX_QUERY_LENGTH = 100;

/**
 * Show the correct modifier key for the platform, and only on pointer-and-
 * keyboard devices — a "⌘K" hint is meaningless on a phone and just steals
 * space from the input.
 */
function shortcutHint() {
  if (!window.matchMedia('(min-width: 900px)').matches) return null;
  const isApple = /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent || '');
  return el('kbd', { class: 'field__hint', 'aria-hidden': 'true', text: isApple ? '⌘ K' : 'Ctrl K' });
}

function selectField({ id, label, icon, options, value, onChange }) {
  const select = el(
    'select',
    { class: 'field__input', id, onChange: (event) => onChange(event.target.value) },
    options.map((option) =>
      el('option', { value: option.value, selected: option.value === value || undefined }, option.label),
    ),
  );

  return {
    element: el('div', { class: 'field field--select' }, [
      el('label', { class: 'field__label', for: id, text: label }),
      el('div', { class: 'field__control' }, [
        el('span', { class: 'field__icon', html: icon }),
        select,
        el('span', { class: 'field__chevron', html: icons.chevronDown }),
      ]),
    ]),
    select,
  };
}

/**
 * Search / filter / sort controls.
 *
 * Built once and never re-rendered, so the search input keeps DOM identity and
 * focus while results stream in underneath it. `syncFromState` pushes state back
 * into the controls for the cases where something other than the user changed it
 * (URL hydration, "clear filters", an invalid category being reconciled).
 *
 * @param {{categories: string[], state: object, onChange: (patch: object) => void}} params
 */
export function createToolbar({ categories, state, onChange }) {
  const searchInput = el('input', {
    class: 'field__input',
    id: 'product-search',
    type: 'search',
    name: 'q',
    // Wording matches what the API actually matches: /products/search covers
    // title and description, but not brand, category or tags.
    placeholder: 'Search products by name or description…',
    autocomplete: 'off',
    enterkeyhint: 'search',
    maxlength: String(MAX_QUERY_LENGTH),
    value: state.query,
  });

  const clearButton = el('button', {
    class: 'field__clear',
    type: 'button',
    'aria-label': 'Clear search',
    hidden: state.query ? undefined : true,
    html: icons.close,
  });

  const emitQuery = (value) => onChange({ query: value });
  const debouncedEmit = debounce(emitQuery, SEARCH_DEBOUNCE_MS);

  const updateClearVisibility = () => {
    clearButton.hidden = searchInput.value.length === 0;
  };

  searchInput.addEventListener('input', () => {
    updateClearVisibility();
    debouncedEmit(searchInput.value);
  });

  // Enter should feel instant rather than waiting out the debounce window.
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      debouncedEmit.flush(searchInput.value);
    } else if (event.key === 'Escape' && searchInput.value) {
      event.preventDefault();
      searchInput.value = '';
      updateClearVisibility();
      debouncedEmit.flush('');
    }
  });

  clearButton.addEventListener('click', () => {
    searchInput.value = '';
    updateClearVisibility();
    debouncedEmit.flush('');
    searchInput.focus();
  });

  const searchField = el('div', { class: 'field field--search' }, [
    el('label', { class: 'field__label', for: 'product-search', text: 'Search' }),
    el('div', { class: 'field__control' }, [
      el('span', { class: 'field__icon', html: icons.search }),
      searchInput,
      clearButton,
      shortcutHint(),
    ]),
  ]);

  const category = selectField({
    id: 'product-category',
    label: 'Category',
    icon: icons.filter,
    value: state.category,
    options: [
      { value: 'all', label: 'All categories' },
      ...categories.map((slug) => ({ value: slug, label: titleCase(slug) })),
    ],
    onChange: (value) => onChange({ category: value }),
  });

  const sort = selectField({
    id: 'product-sort',
    label: 'Sort by',
    icon: icons.sort,
    value: state.sort,
    options: SORT_OPTIONS.map(({ value, label }) => ({ value, label })),
    onChange: (value) => onChange({ sort: value }),
  });

  const element = el(
    'form',
    {
      class: 'toolbar',
      role: 'search',
      'aria-label': 'Search and filter products',
      onSubmit: (event) => event.preventDefault(),
    },
    [searchField, category.element, sort.element],
  );

  return {
    element,
    focusSearch() {
      searchInput.focus();
      searchInput.select();
    },
    syncFromState(next) {
      if (searchInput.value !== next.query) {
        debouncedEmit.cancel();
        searchInput.value = next.query;
        updateClearVisibility();
      }
      if (category.select.value !== next.category) category.select.value = next.category;
      if (sort.select.value !== next.sort) sort.select.value = next.sort;
    },
  };
}
