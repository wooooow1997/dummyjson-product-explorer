import { expect, test } from '@playwright/test';
import {
  API,
  categorySelect,
  productCards,
  runSearch,
  searchBox,
  trackPageErrors,
  waitForCards,
} from './helpers.js';

test.describe('empty, error and recovery states', () => {
  test('shows an empty state for a query with no matches, and can clear it', async ({ page }) => {
    const errors = trackPageErrors(page);

    await page.goto('/');
    await waitForCards(page);

    await runSearch(page, 'zzzzqqqqnothing');
    await expect(page.locator('.panel--empty')).toBeVisible();
    await expect(page.locator('.panel--empty')).toContainText('No products found');
    await expect(page.locator('#results-summary')).toContainText('No products found');
    await expect(page.locator('.pagination')).toHaveCount(0);

    await page.getByRole('button', { name: 'Clear search and filters' }).click();
    await waitForCards(page);

    await expect(searchBox(page)).toHaveValue('');
    await expect(productCards(page)).toHaveCount(12);

    errors.assertClean();
  });

  test('explains an empty category + search combination', async ({ page }) => {
    await page.goto('/');
    await waitForCards(page);

    await categorySelect(page).selectOption('laptops');
    await waitForCards(page);
    await runSearch(page, 'mascara');

    await expect(page.locator('.panel--empty')).toContainText('Laptops');
    await expect(page.locator('.panel--empty')).toContainText('mascara');
  });

  test('shows a retryable error when the API is unreachable, then recovers', async ({ page }) => {
    const errors = trackPageErrors(page);

    // Fail every product request until the test lifts the block.
    let blocked = true;
    await page.route(API.anyProducts, async (route) => {
      if (blocked) return route.abort('failed');
      return route.continue();
    });

    await page.goto('/');

    const panel = page.locator('.panel--error');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('We could not load the catalogue');
    await expect(panel).toContainText(/connection|reach|try again/i);

    const retry = page.getByRole('button', { name: 'Try again' });
    await expect(retry).toBeVisible();
    // Focus should land on the recovery action, since the grid is gone.
    await expect(retry).toBeFocused();

    blocked = false;
    await retry.click();
    await waitForCards(page);

    await expect(panel).toHaveCount(0);
    await expect(productCards(page)).toHaveCount(12);

    errors.assertClean();
  });

  test('surfaces a server error with an actionable message', async ({ page }) => {
    await page.route(API.list, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' }),
    );

    await page.goto('/');

    await expect(page.locator('.panel--error')).toBeVisible();
    await expect(page.locator('.panel--error')).toContainText('having problems');
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  test('times out slow responses instead of hanging forever', async ({ page }) => {
    // Never respond. The client aborts at 12s and reports a timeout.
    await page.route(API.list, () => {});

    await page.goto('/');

    await expect(page.locator('.panel--error')).toBeVisible({ timeout: 40_000 });
    await expect(page.locator('.panel--error')).toContainText('took too long');
  });

  test('keeps the catalogue usable when only the category list fails', async ({ page }) => {
    const errors = trackPageErrors(page);

    await page.route(API.categoryList, (route) => route.abort('failed'));

    await page.goto('/');
    await waitForCards(page);

    // Products still render; the filter degrades to "All categories" only.
    await expect(productCards(page)).toHaveCount(12);
    await expect(page.locator('#stat-categories')).toHaveText('—');
    await expect(categorySelect(page)).toHaveValue('all');

    errors.assertClean();
  });

  test('retries transient failures automatically', async ({ page }) => {
    let attempts = 0;
    await page.route(API.list, async (route) => {
      attempts += 1;
      if (attempts === 1) return route.abort('failed');
      return route.continue();
    });

    await page.goto('/');
    await waitForCards(page);

    // First attempt failed at the network level; the built-in retry recovered
    // without ever showing the user an error panel. Polled rather than read
    // once, since the retry is issued after a backoff delay.
    await expect.poll(() => attempts, { message: 'expected a retry attempt' }).toBeGreaterThanOrEqual(2);
    await expect(page.locator('.panel--error')).toHaveCount(0);
    await expect(productCards(page)).toHaveCount(12);
  });
});
