import { el } from '../lib/dom.js';
import { createProductCard, createSkeletonCard } from './productCard.js';

/**
 * The product grid.
 *
 * Card clicks are handled by one delegated listener on the grid rather than a
 * listener per card, so re-rendering a page costs nothing in teardown.
 *
 * @param {object[]} products
 * @param {(id: number) => void} onSelect
 */
export function createProductGrid(products, onSelect) {
  const grid = el(
    'ul',
    { class: 'product-grid' },
    products.map((product) => el('li', { class: 'product-grid__item' }, [createProductCard(product)])),
  );

  grid.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-product-id]');
    if (!trigger || !grid.contains(trigger)) return;

    const id = Number(trigger.dataset.productId);
    if (Number.isFinite(id)) onSelect(id);
  });

  return grid;
}

/** Skeleton grid shown while a page is in flight. */
export function createSkeletonGrid(count = 12) {
  return el(
    'ul',
    { class: 'product-grid', 'aria-hidden': 'true' },
    Array.from({ length: count }, () =>
      el('li', { class: 'product-grid__item' }, [createSkeletonCard()]),
    ),
  );
}
