import { el, replaceChildren } from '../lib/dom.js';
import { icons } from '../lib/icons.js';
import { createFocusTrap } from '../lib/focusTrap.js';
import { fetchProduct } from '../api/products.js';
import {
  formatPrice,
  formatRating,
  orDash,
  originalPrice,
  titleCase,
} from '../lib/format.js';

const MAX_REVIEWS = 3;
let activeModal = null;

/* ------------------------------------------------------------------ *
 * Body scroll lock
 * ------------------------------------------------------------------ */

/**
 * Lock background scrolling while the dialog is open, padding the body by the
 * scrollbar's width so the page behind doesn't visibly jump.
 */
function lockScroll() {
  const { body, documentElement } = document;
  const scrollbarWidth = window.innerWidth - documentElement.clientWidth;
  const previous = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };

  body.style.overflow = 'hidden';
  if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;

  return () => {
    body.style.overflow = previous.overflow;
    body.style.paddingRight = previous.paddingRight;
  };
}

/* ------------------------------------------------------------------ *
 * Content builders
 * ------------------------------------------------------------------ */

function loadingView() {
  return el('div', { class: 'modal__state' }, [
    el('span', { class: 'spinner', 'aria-hidden': 'true' }),
    el('p', { class: 'modal__state-text', role: 'status', text: 'Loading product details…' }),
  ]);
}

function errorView({ error, onRetry }) {
  const retryable = error?.retryable !== false;
  const button = el(
    'button',
    { class: 'btn btn--primary', type: 'button', onClick: onRetry },
    retryable
      ? [el('span', { class: 'btn__icon', html: icons.refresh }), el('span', { text: 'Try again' })]
      : 'Try again',
  );

  const view = el('div', { class: 'modal__state' }, [
    el('span', { class: 'panel__icon', html: icons.alert }),
    el('h2', { class: 'panel__title', id: 'modal-title', text: 'Could not load this product' }),
    el('p', {
      class: 'panel__message',
      role: 'alert',
      text: error?.userMessage ?? 'Please try again.',
    }),
    button,
  ]);

  requestAnimationFrame(() => button.focus());
  return view;
}

function gallery(product) {
  const images = (Array.isArray(product.images) ? product.images : []).filter(Boolean);
  const sources = images.length > 0 ? images : [product.thumbnail].filter(Boolean);

  const main = el('img', {
    class: 'gallery__image',
    src: sources[0] ?? '',
    alt: `${product.title} — main product image`,
  });

  const frame = el('div', { class: 'gallery__frame' }, [main]);
  main.addEventListener('error', () => frame.classList.add('gallery__frame--fallback'));

  const wrapper = el('div', { class: 'gallery' }, [frame]);
  if (sources.length < 2) return wrapper;

  const thumbs = sources.slice(0, 5).map((src, index) => {
    const button = el('button', {
      class: `gallery__thumb${index === 0 ? ' is-active' : ''}`,
      type: 'button',
      'aria-label': `Show image ${index + 1} of ${Math.min(sources.length, 5)}`,
      'aria-pressed': index === 0 ? 'true' : 'false',
      onClick: () => {
        main.src = src;
        frame.classList.remove('gallery__frame--fallback');
        for (const other of thumbs) {
          const isActive = other === button;
          other.classList.toggle('is-active', isActive);
          other.setAttribute('aria-pressed', String(isActive));
        }
      },
    }, [el('img', { src, alt: '', loading: 'lazy' })]);
    return button;
  });

  wrapper.append(el('div', { class: 'gallery__thumbs' }, thumbs));
  return wrapper;
}

function specRow(label, value) {
  if (value === null || value === undefined || value === '' || value === '—') return null;
  return el('div', { class: 'spec' }, [
    el('dt', { class: 'spec__label', text: label }),
    el('dd', { class: 'spec__value', text: String(value) }),
  ]);
}

function dimensionText(dimensions) {
  if (!dimensions || typeof dimensions !== 'object') return null;
  const { width, height, depth } = dimensions;
  if (![width, height, depth].every((n) => Number.isFinite(Number(n)))) return null;
  return `${width} × ${height} × ${depth} cm`;
}

function specs(product) {
  const rows = [
    specRow('Brand', product.brand ? orDash(product.brand) : null),
    specRow('SKU', product.sku),
    specRow('Category', titleCase(product.category)),
    specRow('Stock', Number.isFinite(Number(product.stock)) ? `${product.stock} units` : null),
    specRow('Weight', Number.isFinite(Number(product.weight)) ? `${product.weight} g` : null),
    specRow('Dimensions', dimensionText(product.dimensions)),
    specRow('Warranty', product.warrantyInformation),
    specRow('Shipping', product.shippingInformation),
    specRow('Returns', product.returnPolicy),
    specRow(
      'Minimum order',
      Number.isFinite(Number(product.minimumOrderQuantity))
        ? `${product.minimumOrderQuantity} units`
        : null,
    ),
  ].filter(Boolean);

  if (rows.length === 0) return null;

  return el('section', { class: 'modal__section' }, [
    el('h3', { class: 'modal__section-title', text: 'Specifications' }),
    el('dl', { class: 'spec-grid' }, rows),
  ]);
}

function reviews(product) {
  const list = (Array.isArray(product.reviews) ? product.reviews : []).slice(0, MAX_REVIEWS);
  if (list.length === 0) return null;

  return el('section', { class: 'modal__section' }, [
    el('h3', { class: 'modal__section-title', text: `Reviews (${product.reviews.length})` }),
    el(
      'ul',
      { class: 'reviews' },
      list.map((review) =>
        el('li', { class: 'review' }, [
          el('div', { class: 'review__head' }, [
            el('span', { class: 'review__author', text: orDash(review.reviewerName) }),
            el('span', { class: 'rating' }, [
              el('span', { class: 'rating__icon', html: icons.star }),
              el('span', { text: formatRating(review.rating) }),
            ]),
          ]),
          el('p', { class: 'review__body', text: review.comment ?? '' }),
        ]),
      ),
    ),
  ]);
}

function detailView(product) {
  const was = originalPrice(product.price, product.discountPercentage);
  const discount = Number(product.discountPercentage);
  const tags = (Array.isArray(product.tags) ? product.tags : []).filter(Boolean).slice(0, 4);

  return el('div', { class: 'modal__layout' }, [
    gallery(product),
    el('div', { class: 'modal__details' }, [
      el('p', { class: 'modal__eyebrow', text: titleCase(product.category) }),
      el('h2', { class: 'modal__title', id: 'modal-title', text: product.title ?? 'Product' }),
      el('div', { class: 'modal__ratings' }, [
        el('span', { class: 'rating' }, [
          el('span', { class: 'rating__icon', html: icons.star }),
          el('span', { text: `${formatRating(product.rating)} / 5` }),
        ]),
        product.availabilityStatus
          ? el('span', { class: 'stock', text: product.availabilityStatus })
          : null,
      ]),
      el('p', { class: 'modal__description', text: product.description ?? '' }),
      el('div', { class: 'modal__price' }, [
        el('strong', { text: formatPrice(product.price) }),
        was ? el('s', { text: formatPrice(was) }) : null,
        Number.isFinite(discount) && discount >= 1
          ? el('span', { class: 'badge badge--discount', text: `-${Math.round(discount)}%` })
          : null,
      ]),
      tags.length > 0
        ? el('ul', { class: 'tags', 'aria-label': 'Tags' },
            tags.map((tag) => el('li', { class: 'tag', text: titleCase(tag) })))
        : null,
      specs(product),
      reviews(product),
    ]),
  ]);
}

/* ------------------------------------------------------------------ *
 * Dialog
 * ------------------------------------------------------------------ */

/**
 * Open the product details dialog for `productId`.
 *
 * Details are fetched from `/products/{id}` on open rather than reused from the
 * grid, because list responses are trimmed with `select` and omit reviews,
 * dimensions, shipping and returns data. The request is aborted if the dialog is
 * closed before it settles.
 *
 * Accessibility: `role="dialog"` + `aria-modal`, focus moved in on open and
 * restored to the triggering card on close, Tab confined to the dialog, Escape
 * and backdrop-click both close, and background scrolling is locked.
 */
export function openProductModal(productId) {
  activeModal?.close();

  const controller = new AbortController();
  const content = el('div', { class: 'modal__content' }, loadingView());

  const closeButton = el('button', {
    class: 'modal__close',
    type: 'button',
    'aria-label': 'Close product details',
    html: icons.close,
  });

  const dialog = el('div', {
    class: 'modal',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Product details',
  }, [closeButton, content]);

  const overlay = el('div', { class: 'modal-overlay' }, [dialog]);

  const unlockScroll = lockScroll();
  document.body.append(overlay);
  const releaseFocus = createFocusTrap(dialog);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    controller.abort();
    document.removeEventListener('keydown', onKeydown);
    overlay.remove();
    unlockScroll();
    releaseFocus();
    if (activeModal?.close === close) activeModal = null;
  }

  /**
   * Escape must keep working for the dialog's whole lifetime, so this listener
   * is explicitly removed on close rather than registered with `{ once: true }`
   * (which would unbind after the first keypress of any kind).
   */
  function onKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }
  document.addEventListener('keydown', onKeydown);

  closeButton.addEventListener('click', close);

  // Require press *and* release on the backdrop, so a text selection that drags
  // out of the dialog doesn't dismiss it.
  let pressedBackdrop = false;
  overlay.addEventListener('mousedown', (event) => {
    pressedBackdrop = event.target === overlay;
  });
  overlay.addEventListener('click', (event) => {
    if (pressedBackdrop && event.target === overlay) close();
    pressedBackdrop = false;
  });

  activeModal = { close };
  closeButton.focus();

  async function load() {
    replaceChildren(content, loadingView());
    try {
      const product = await fetchProduct(productId, { signal: controller.signal });
      if (closed) return;
      replaceChildren(content, detailView(product));
      dialog.setAttribute('aria-labelledby', 'modal-title');
      dialog.removeAttribute('aria-label');
      content.scrollTop = 0;
    } catch (error) {
      if (closed || error?.name === 'AbortError') return;
      replaceChildren(content, errorView({ error, onRetry: load }));
      dialog.setAttribute('aria-labelledby', 'modal-title');
    }
  }

  load();
  return { close };
}
