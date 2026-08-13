import { expect, test } from '@playwright/test';
import {
  API,
  cardCategories,
  cardPrices,
  cardTitles,
  categorySelect,
  productCards,
  runSearch,
  searchBox,
  sortSelect,
  trackPageErrors,
  waitForCards,
} from './helpers.js';

test.describe('catalogue: load, search, filter, sort, paginate', () => {
  test('loads the first page of products from the API', async ({ page }) => {
    const errors = trackPageErrors(page);

    await page.goto('/');
    await waitForCards(page);

    await expect(productCards(page)).toHaveCount(12);
    await expect(page.locator('#stat-total')).not.toHaveText('—');
    await expect(page.locator('#stat-categories')).toHaveText('24');
    await expect(page.locator('#results-summary')).toContainText('of 194 products');

    errors.assertClean();
  });

  test('shows skeleton placeholders while a request is in flight', async ({ page }) => {
    // Hold the products response open so the loading state is observable.
    await page.route(API.list, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.continue();
    });

    await page.goto('/');

    await expect(page.locator('.card--skeleton').first()).toBeVisible();
    await expect(page.locator('#results-mount')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('#results-summary')).toContainText('Loading products');

    await waitForCards(page);
    await expect(page.locator('.card--skeleton')).toHaveCount(0);
    await expect(page.locator('#results-mount')).not.toHaveAttribute('aria-busy', 'true');
  });

  test('search narrows results and is reflected in the URL', async ({ page }) => {
    const errors = trackPageErrors(page);

    await page.goto('/');
    await waitForCards(page);

    await runSearch(page, 'mascara');

    await expect(page).toHaveURL(/[?&]q=mascara/);
    const titles = await cardTitles(page);
    expect(titles.length).toBeGreaterThan(0);
    expect(titles.join(' ').toLowerCase()).toContain('mascara');

    errors.assertClean();
  });

  test('search sends one request per pause, not per keystroke', async ({ page }) => {
    await page.goto('/');
    await waitForCards(page);

    const searchRequests = [];
    page.on('request', (request) => {
      if (request.url().includes('/products/search')) searchRequests.push(request.url());
    });

    await searchBox(page).pressSequentially('laptop', { delay: 60 });
    await waitForCards(page);
    await page.waitForTimeout(900);

    // Debounced at 350ms: six characters typed 60ms apart must collapse into one
    // request, not six.
    expect(searchRequests.length).toBeLessThanOrEqual(2);
    expect(searchRequests.length).toBeGreaterThan(0);
  });

  test('filters by category using the category endpoint', async ({ page }) => {
    const errors = trackPageErrors(page);

    await page.goto('/');
    await waitForCards(page);

    const requestPromise = page.waitForRequest(/\/products\/category\/smartphones/);
    await categorySelect(page).selectOption('smartphones');
    await requestPromise;
    await waitForCards(page);

    await expect(page).toHaveURL(/[?&]category=smartphones/);
    await expect(page.locator('#results-summary')).toContainText('Smartphones');

    expect(await cardCategories(page)).toEqual(['Smartphones']);

    errors.assertClean();
  });

  test('sorts by price ascending across the whole result set, not just one page', async ({ page }) => {
    const errors = trackPageErrors(page);

    await page.goto('/');
    await waitForCards(page);

    await sortSelect(page).selectOption('price-asc');
    await waitForCards(page);

    const firstPage = await cardPrices(page);
    expect(firstPage).toEqual([...firstPage].sort((a, b) => a - b));

    // Page 2 must continue where page 1 stopped — which only holds if the API
    // sorts before paginating.
    await page.getByRole('button', { name: 'Go to page 2' }).click();
    await waitForCards(page);

    const secondPage = await cardPrices(page);
    expect(secondPage).toEqual([...secondPage].sort((a, b) => a - b));
    expect(secondPage[0]).toBeGreaterThanOrEqual(firstPage[firstPage.length - 1]);

    errors.assertClean();
  });

  test('sorts by price descending', async ({ page }) => {
    await page.goto('/');
    await waitForCards(page);

    await sortSelect(page).selectOption('price-desc');
    await waitForCards(page);

    const prices = await cardPrices(page);
    expect(prices).toEqual([...prices].sort((a, b) => b - a));
  });

  test('paginates with distinct results and a correct current-page indicator', async ({ page }) => {
    const errors = trackPageErrors(page);

    await page.goto('/');
    await waitForCards(page);
    const firstPageTitles = await cardTitles(page);

    await page.getByRole('button', { name: 'Go to next page' }).click();
    await waitForCards(page);

    await expect(page).toHaveURL(/[?&]page=2/);
    const secondPageTitles = await cardTitles(page);
    expect(secondPageTitles).not.toEqual(firstPageTitles);

    await expect(page.getByRole('button', { name: 'Go to page 2' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('button', { name: 'Go to previous page' })).toBeEnabled();

    // Back to page 1: "previous" must be disabled at the boundary.
    await page.getByRole('button', { name: 'Go to previous page' }).click();
    await waitForCards(page);
    await expect(page.getByRole('button', { name: 'Go to previous page' })).toBeDisabled();

    errors.assertClean();
  });

  test('combines search with a category filter', async ({ page }) => {
    const errors = trackPageErrors(page);

    await page.goto('/?q=phone&category=mobile-accessories');
    await waitForCards(page);

    expect(await cardCategories(page)).toEqual(['Mobile Accessories']);
    await expect(page.locator('#results-summary')).toContainText('“phone”');

    errors.assertClean();
  });

  test('restores state from the URL on load', async ({ page }) => {
    await page.goto('/?q=watch&sort=price-desc&page=1');
    await waitForCards(page);

    await expect(searchBox(page)).toHaveValue('watch');
    await expect(sortSelect(page)).toHaveValue('price-desc');

    const prices = await cardPrices(page);
    expect(prices).toEqual([...prices].sort((a, b) => b - a));
  });

  test('falls back to all categories when the URL names an unknown one', async ({ page }) => {
    const errors = trackPageErrors(page);

    await page.goto('/?category=not-a-real-category');
    await waitForCards(page);

    await expect(categorySelect(page)).toHaveValue('all');
    await expect(productCards(page)).toHaveCount(12);

    errors.assertClean();
  });

  test('resets to page 1 when the query changes', async ({ page }) => {
    await page.goto('/?page=5');
    await waitForCards(page);
    await expect(page.getByRole('button', { name: 'Go to page 5' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    // "phone" spans more than one page, so a pager is still rendered and we can
    // assert which page is current rather than just that the pager vanished.
    await runSearch(page, 'phone');

    await expect(page).not.toHaveURL(/page=5/);
    await expect(page.getByRole('button', { name: 'Go to page 1' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.locator('#results-summary')).toContainText('Page 1 of');
  });

  test('matches description text, not just titles', async ({ page }) => {
    await page.goto('/');
    await waitForCards(page);

    // "volumizing" appears in a product description but in no product title, so
    // a hit proves description text is searched.
    await runSearch(page, 'volumizing');

    const titles = await cardTitles(page);
    expect(titles.length).toBeGreaterThan(0);
    expect(titles.join(' ').toLowerCase()).not.toContain('volumizing');
    await expect(page.locator('.card__description').first()).toContainText(/volumizing/i);
  });

  test('Escape clears the search field and restores the full catalogue', async ({ page }) => {
    await page.goto('/');
    await waitForCards(page);

    await runSearch(page, 'mascara');
    await expect(page).toHaveURL(/[?&]q=mascara/);

    const box = searchBox(page);
    await box.focus();
    const restored = page.waitForResponse((res) => API.list.test(res.url()));
    await page.keyboard.press('Escape');
    await restored;
    await waitForCards(page);

    await expect(box).toHaveValue('');
    await expect(page).not.toHaveURL(/[?&]q=/);
    await expect(productCards(page)).toHaveCount(12);
  });

  test('hides the pager when results fit on a single page', async ({ page }) => {
    // "bag" matches 4 of 194 products — a lone disabled page button would be noise.
    await page.goto('/?q=bag');
    await waitForCards(page);

    await expect(page.locator('.pagination')).toHaveCount(0);
    await expect(page.locator('#results-summary')).not.toContainText('Page 1 of');
  });
});
