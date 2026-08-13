import { el } from '../lib/dom.js';
import { icons } from '../lib/icons.js';

/**
 * Page numbers to render: always first and last, plus a window around the
 * current page. Returns `'gap'` markers where pages were elided.
 */
function pageWindow(current, total, radius = 1) {
  const shown = new Set([1, total]);
  for (let page = current - radius; page <= current + radius; page += 1) {
    if (page >= 1 && page <= total) shown.add(page);
  }

  const ordered = [...shown].sort((a, b) => a - b);
  const output = [];
  let previous = 0;

  for (const page of ordered) {
    if (previous && page - previous > 1) output.push('gap');
    output.push(page);
    previous = page;
  }
  return output;
}

function stepButton({ label, icon, page, disabled, onNavigate }) {
  return el('button', {
    class: 'pagination__step',
    type: 'button',
    disabled: disabled || undefined,
    'aria-label': label,
    onClick: () => onNavigate(page),
  }, [el('span', { class: 'btn__icon', html: icon })]);
}

/**
 * Server-backed pager. Renders nothing for a single page of results — a lone
 * disabled "1" is noise.
 *
 * @param {{page: number, totalPages: number, onNavigate: (page: number) => void}} params
 */
export function createPagination({ page, totalPages, onNavigate }) {
  if (totalPages <= 1) return null;

  const nav = el('nav', { class: 'pagination', 'aria-label': 'Product catalogue pages' });

  nav.append(
    stepButton({
      label: 'Go to previous page',
      icon: icons.chevronLeft,
      page: page - 1,
      disabled: page <= 1,
      onNavigate,
    }),
  );

  const list = el('ul', { class: 'pagination__list' });
  for (const entry of pageWindow(page, totalPages)) {
    if (entry === 'gap') {
      list.append(el('li', { class: 'pagination__gap', 'aria-hidden': 'true', text: '…' }));
      continue;
    }

    const isCurrent = entry === page;
    list.append(
      el('li', {}, [
        el('button', {
          class: `pagination__page${isCurrent ? ' is-current' : ''}`,
          type: 'button',
          'aria-label': `Go to page ${entry}`,
          'aria-current': isCurrent ? 'page' : undefined,
          onClick: () => onNavigate(entry),
        }, String(entry)),
      ]),
    );
  }
  nav.append(list);

  nav.append(
    stepButton({
      label: 'Go to next page',
      icon: icons.chevronRight,
      page: page + 1,
      disabled: page >= totalPages,
      onNavigate,
    }),
  );

  return nav;
}
