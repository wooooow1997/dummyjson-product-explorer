import { el } from '../lib/dom.js';
import { icons } from '../lib/icons.js';
import { titleCase } from '../lib/format.js';

function panel({ variant, icon, title, message, action }) {
  return el('div', { class: `panel panel--${variant}`, role: variant === 'error' ? 'alert' : 'status' }, [
    el('span', { class: 'panel__icon', html: icon }),
    el('h2', { class: 'panel__title', text: title }),
    el('p', { class: 'panel__message', text: message }),
    action ?? null,
  ]);
}

/**
 * Failure state. The retry button re-runs the exact request that failed, and is
 * only rendered for retryable failures — a 404 gets a reset action instead,
 * because "Try again" on a permanent error is a dead end.
 */
export function createErrorPanel({ error, onRetry, onReset }) {
  const retryable = error?.retryable !== false;
  const message = error?.userMessage ?? 'Something went wrong while loading the catalogue.';

  const action = retryable
    ? el('button', { class: 'btn btn--primary', type: 'button', onClick: onRetry }, [
        el('span', { class: 'btn__icon', html: icons.refresh }),
        el('span', { text: 'Try again' }),
      ])
    : el('button', { class: 'btn btn--primary', type: 'button', onClick: onReset }, 'Reset filters');

  const node = panel({
    variant: 'error',
    icon: icons.alert,
    title: 'We could not load the catalogue',
    message,
    action,
  });

  // Autofocus the recovery action: the grid the user was looking at is gone, so
  // this is where keyboard focus should logically land.
  requestAnimationFrame(() => action.focus());
  return node;
}

/** No-results state, worded to reflect which controls actually caused it. */
export function createEmptyPanel({ query, category, onReset }) {
  const trimmed = String(query ?? '').trim();
  const filtered = category && category !== 'all';

  let message;
  if (trimmed && filtered) {
    message = `No products match “${trimmed}” in ${titleCase(category)}. Try a different search or browse all categories.`;
  } else if (trimmed) {
    message = `No products match “${trimmed}”. Check the spelling or try a broader term.`;
  } else if (filtered) {
    message = `There are no products in ${titleCase(category)} right now.`;
  } else {
    message = 'The catalogue returned no products.';
  }

  return panel({
    variant: 'empty',
    icon: icons.empty,
    title: 'No products found',
    message,
    action:
      trimmed || filtered
        ? el('button', { class: 'btn btn--secondary', type: 'button', onClick: onReset }, 'Clear search and filters')
        : null,
  });
}
