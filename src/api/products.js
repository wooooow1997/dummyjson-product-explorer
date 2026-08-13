import { getJson } from './client.js';

/** Only the fields the card grid actually renders — keeps list payloads small. */
const LIST_FIELDS = [
  'id',
  'title',
  'description',
  'price',
  'discountPercentage',
  'rating',
  'stock',
  'brand',
  'category',
  'thumbnail',
  'availabilityStatus',
].join(',');

/**
 * Sort options, each mapped to DummyJSON's `sortBy`/`order` query params.
 *
 * Verified against the live API: `sortBy` orders the *whole* collection before
 * `skip`/`limit` are applied (on /products, /products/search and
 * /products/category/*), so sorting stays correct across pages. `featured`
 * intentionally sends no params and preserves the API's own catalogue order.
 */
export const SORT_OPTIONS = [
  { value: 'featured', label: 'Featured', params: {} },
  { value: 'rating-desc', label: 'Top rated', params: { sortBy: 'rating', order: 'desc' } },
  {
    value: 'discount-desc',
    label: 'Biggest discount',
    params: { sortBy: 'discountPercentage', order: 'desc' },
  },
  { value: 'price-asc', label: 'Price: low to high', params: { sortBy: 'price', order: 'asc' } },
  { value: 'price-desc', label: 'Price: high to low', params: { sortBy: 'price', order: 'desc' } },
  { value: 'title-asc', label: 'Name: A to Z', params: { sortBy: 'title', order: 'asc' } },
];

const SORT_BY_VALUE = new Map(SORT_OPTIONS.map((option) => [option.value, option]));

export const DEFAULT_SORT = 'featured';

export function isValidSort(value) {
  return SORT_BY_VALUE.has(value);
}

function sortParams(sort) {
  return (SORT_BY_VALUE.get(sort) ?? SORT_BY_VALUE.get(DEFAULT_SORT)).params;
}

/** Client-side equivalent of `sortParams`, for the combined search+category path. */
function comparatorFor(sort) {
  switch (sort) {
    case 'rating-desc':
      return (a, b) => (b.rating ?? 0) - (a.rating ?? 0);
    case 'discount-desc':
      return (a, b) => (b.discountPercentage ?? 0) - (a.discountPercentage ?? 0);
    case 'price-asc':
      return (a, b) => (a.price ?? 0) - (b.price ?? 0);
    case 'price-desc':
      return (a, b) => (b.price ?? 0) - (a.price ?? 0);
    case 'title-asc':
      return (a, b) => String(a.title ?? '').localeCompare(String(b.title ?? ''));
    default:
      return null; // `featured` — keep the API's own ordering
  }
}

/** `{ products, total }` guard: never trust the shape blindly. */
function readList(payload) {
  return {
    items: Array.isArray(payload?.products) ? payload.products : [],
    total: Number.isFinite(payload?.total) ? payload.total : 0,
  };
}

function paginate({ items, total }, { page, pageSize }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return { items, total, page: Math.min(page, totalPages), totalPages };
}

/**
 * The full product catalogue's category slugs.
 * `category-list` returns a plain string array (vs. `/categories`, which
 * returns objects) — one less mapping step for the filter dropdown.
 */
export async function fetchCategories(options = {}) {
  const payload = await getJson('/products/category-list', {}, options);
  return Array.isArray(payload) ? payload.filter((slug) => typeof slug === 'string') : [];
}

/**
 * Fetch one page of products for the current search / filter / sort state.
 *
 * Search, category filtering, sorting and pagination are all delegated to the
 * API so we only ever transfer one page of results.
 *
 * The one exception is search **combined with** a category filter: DummyJSON
 * exposes no endpoint that accepts both `q` and a category. In that case we
 * request the full result set for the query (`limit=0`, which the API documents
 * as "no limit"), then intersect, sort and page client-side. Search result sets
 * are small (the widest query in this dataset returns ~30 of 194 products), so
 * this stays a single request and a trivial amount of work.
 *
 * @returns {Promise<{items: object[], total: number, page: number, totalPages: number, clientFiltered: boolean}>}
 */
export async function fetchProducts({
  query = '',
  category = 'all',
  sort = DEFAULT_SORT,
  page = 1,
  pageSize = 12,
  signal,
} = {}) {
  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length > 0;
  const hasCategory = category && category !== 'all';
  const skip = (page - 1) * pageSize;

  if (hasQuery && hasCategory) {
    const payload = await getJson(
      '/products/search',
      { q: trimmedQuery, limit: 0, select: LIST_FIELDS },
      { signal },
    );

    const matching = readList(payload).items.filter((product) => product.category === category);
    const comparator = comparatorFor(sort);
    if (comparator) matching.sort(comparator);

    const totalPages = Math.max(1, Math.ceil(matching.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;

    return {
      items: matching.slice(start, start + pageSize),
      total: matching.length,
      page: safePage,
      totalPages,
      clientFiltered: true,
    };
  }

  const params = { limit: pageSize, skip, select: LIST_FIELDS, ...sortParams(sort) };

  const payload = hasQuery
    ? await getJson('/products/search', { q: trimmedQuery, ...params }, { signal })
    : hasCategory
      ? await getJson(`/products/category/${encodeURIComponent(category)}`, params, { signal })
      : await getJson('/products', params, { signal });

  return { ...paginate(readList(payload), { page, pageSize }), clientFiltered: false };
}

/**
 * Full record for the details view.
 *
 * Deliberately a separate request: list responses are trimmed via `select`,
 * while this returns reviews, dimensions, SKU, shipping and returns policy.
 */
export async function fetchProduct(id, options = {}) {
  const product = await getJson(`/products/${encodeURIComponent(id)}`, {}, options);
  if (!product || typeof product !== 'object' || !product.id) {
    throw new Error('Unexpected product payload');
  }
  return product;
}
