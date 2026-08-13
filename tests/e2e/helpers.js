import { expect } from '@playwright/test';

/**
 * Collect real JavaScript problems for a page.
 *
 * Uncaught exceptions are always failures. Console errors are filtered: the
 * DummyJSON CDN serves the occasional missing thumbnail, and a 404 on an image
 * is a data problem the UI already handles with a placeholder — not an app bug.
 */
export function trackPageErrors(page) {
  const errors = [];

  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/Failed to load resource|net::ERR|ERR_NAME_NOT_RESOLVED|status of 4\d\d|status of 5\d\d/i.test(text)) return;
    errors.push(`console: ${text}`);
  });

  return {
    get all() {
      return errors;
    },
    assertClean() {
      expect(errors, `Unexpected console/page errors:\n${errors.join('\n')}`).toEqual([]);
    },
  };
}

/**
 * Request matchers.
 *
 * Regexes rather than glob strings: `?` is a wildcard in Playwright's glob
 * syntax, which silently makes `**\/products?*` match far more than intended.
 */
export const API = {
  list: /dummyjson\.com\/products\?/,
  search: /dummyjson\.com\/products\/search\?/,
  categoryList: /dummyjson\.com\/products\/category-list/,
  category: /dummyjson\.com\/products\/category\/(?!list)/,
  detail: /dummyjson\.com\/products\/\d+(\?|$)/,
  anyProducts: /dummyjson\.com\/products/,
};

const resultsMount = (page) => page.locator('#results-mount');

/** Wait until no request is in flight and the skeleton grid is gone. */
export async function waitForSettled(page) {
  await expect(resultsMount(page)).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.card--skeleton')).toHaveCount(0);
}

/** Wait until the skeleton grid has been replaced by real, clickable cards. */
export async function waitForCards(page) {
  await waitForSettled(page);
  await expect(page.locator('.card').first()).toBeVisible();
}

/**
 * Type into the search box and wait for the resulting render.
 *
 * Search is debounced by 350ms, so no request exists at the moment `fill`
 * resolves — asserting on the grid immediately would read the *previous*
 * results. Subscribing to the response before typing makes the wait
 * deterministic without a sleep.
 */
export async function runSearch(page, term) {
  const matcher = term.trim() ? API.search : API.list;
  const response = page.waitForResponse((res) => matcher.test(res.url()), { timeout: 30_000 });
  await searchBox(page).fill(term);
  await response;
  await waitForSettled(page);
}

export const productCards = (page) => page.locator('.card:not(.card--skeleton)');

/**
 * Control locators.
 *
 * Addressed by role + accessible name. `getByLabel('Search')` is ambiguous here
 * — it also matches the search landmark and the "Clear search" button — and an
 * ambiguous locator is a flaky locator.
 */
export const searchBox = (page) => page.getByRole('searchbox', { name: 'Search' });
export const categorySelect = (page) => page.getByLabel('Category', { exact: true });
export const sortSelect = (page) => page.getByLabel('Sort by', { exact: true });

/**
 * Read the rendered price of every card on the current page, as numbers.
 *
 * Polled: the grid is replaced wholesale on every render, so a plain
 * `allTextContents()` can land mid-swap and return an empty list.
 */
export async function cardPrices(page) {
  let prices = [];
  await expect
    .poll(
      async () => {
        const texts = await page.locator('.card__price strong').allTextContents();
        prices = texts.map((text) => Number(text.replace(/[^0-9.]/g, '')));
        return prices.length;
      },
      { message: 'expected at least one rendered card price' },
    )
    .toBeGreaterThan(0);
  return prices;
}

export async function cardTitles(page) {
  let titles = [];
  await expect
    .poll(
      async () => {
        titles = await page.locator('.card__title').allTextContents();
        return titles.length;
      },
      { message: 'expected at least one rendered card title' },
    )
    .toBeGreaterThan(0);
  return titles;
}

/** Distinct `.card__category` labels currently rendered. */
export async function cardCategories(page) {
  let categories = [];
  await expect
    .poll(
      async () => {
        categories = (await page.locator('.card__category').allTextContents()).map((t) => t.trim());
        return categories.length;
      },
      { message: 'expected at least one rendered card category' },
    )
    .toBeGreaterThan(0);
  return [...new Set(categories)];
}
