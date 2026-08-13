import { el } from '../lib/dom.js';
import { icons } from '../lib/icons.js';
import { formatPrice, formatRating, originalPrice, titleCase } from '../lib/format.js';

/** DummyJSON returns "In Stock" | "Low Stock" | "Out of Stock"; fall back to the count. */
function stockLabel(product) {
  if (product.availabilityStatus) return product.availabilityStatus;
  const stock = Number(product.stock);
  if (!Number.isFinite(stock)) return null;
  if (stock <= 0) return 'Out of Stock';
  if (stock < 10) return 'Low Stock';
  return 'In Stock';
}

function stockModifier(label) {
  const normalised = String(label ?? '').toLowerCase();
  if (normalised.includes('out')) return 'is-out';
  if (normalised.includes('low')) return 'is-low';
  return 'is-in';
}

function media(product) {
  const image = el('img', {
    src: product.thumbnail ?? '',
    alt: product.title ? `${product.title} product image` : 'Product image',
    loading: 'lazy',
    decoding: 'async',
  });

  const wrapper = el('div', { class: 'card__media' }, [image]);

  // Thumbnails occasionally 404 upstream — swap in a neutral placeholder so the
  // grid keeps its rhythm instead of showing a broken-image glyph.
  image.addEventListener('error', () => {
    wrapper.classList.add('card__media--fallback');
    image.remove();
    wrapper.append(el('span', { class: 'card__media-fallback', html: icons.box }));
  });

  const discount = Number(product.discountPercentage);
  if (Number.isFinite(discount) && discount >= 1) {
    wrapper.append(
      el('span', { class: 'badge badge--discount', text: `-${Math.round(discount)}%` }),
    );
  }

  return wrapper;
}

function priceBlock(product) {
  const was = originalPrice(product.price, product.discountPercentage);
  return el('div', { class: 'card__price' }, [
    el('strong', { text: formatPrice(product.price) }),
    was ? el('s', { text: formatPrice(was), 'aria-label': `Original price ${formatPrice(was)}` }) : null,
  ]);
}

/**
 * One product tile.
 *
 * The details button carries a full-card ::after overlay (see components.css),
 * so the whole tile is clickable for pointer users while keyboard and screen
 * reader users get a single, properly labelled control — rather than a nest of
 * competing interactive elements.
 */
export function createProductCard(product) {
  const label = stockLabel(product);

  return el('article', { class: 'card' }, [
    media(product),
    el('div', { class: 'card__body' }, [
      el('p', { class: 'card__category', text: titleCase(product.category) }),
      el('h3', { class: 'card__title', text: product.title ?? 'Untitled product' }),
      el('p', { class: 'card__description', text: product.description ?? '' }),
      el('div', { class: 'card__meta' }, [
        el('span', { class: 'rating', title: `Rated ${formatRating(product.rating)} out of 5` }, [
          el('span', { class: 'rating__icon', html: icons.star }),
          el('span', { text: formatRating(product.rating) }),
        ]),
        label ? el('span', { class: `stock ${stockModifier(label)}`, text: label }) : null,
      ]),
      el('div', { class: 'card__footer' }, [
        priceBlock(product),
        el('button', {
          class: 'card__action',
          type: 'button',
          dataset: { productId: String(product.id) },
          'aria-label': `View details for ${product.title ?? 'this product'}`,
        }, 'Details'),
      ]),
    ]),
  ]);
}

/** Placeholder tile mirroring the real card's box model to avoid layout shift. */
export function createSkeletonCard() {
  return el('article', { class: 'card card--skeleton', 'aria-hidden': 'true' }, [
    el('div', { class: 'card__media skeleton-block' }),
    el('div', { class: 'card__body' }, [
      el('span', { class: 'skeleton-line skeleton-line--xs' }),
      el('span', { class: 'skeleton-line skeleton-line--lg' }),
      el('span', { class: 'skeleton-line' }),
      el('span', { class: 'skeleton-line skeleton-line--sm' }),
      el('div', { class: 'card__footer' }, [
        el('span', { class: 'skeleton-line skeleton-line--md' }),
      ]),
    ]),
  ]);
}
