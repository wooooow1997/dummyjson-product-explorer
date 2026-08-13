import { expect, test } from '@playwright/test';
import {
  categorySelect,
  productCards,
  runSearch,
  searchBox,
  sortSelect,
  trackPageErrors,
  waitForCards,
} from './helpers.js';

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 780, expectedColumns: 2 },
  { name: 'tablet', width: 834, height: 1050, expectedColumns: 3 },
  { name: 'desktop', width: 1440, height: 900, expectedColumns: 4 },
];

/**
 * Count grid columns from the resolved `grid-template-columns` rather than
 * assuming a breakpoint.
 *
 * Polled because the grid element is replaced wholesale on each render: reading
 * a handle captured a moment earlier can resolve against a detached node, which
 * reports an empty computed style.
 */
const expectColumns = async (page, expected) => {
  await expect
    .poll(
      () =>
        page.locator('.product-grid').evaluate((grid) => {
          const template = getComputedStyle(grid).gridTemplateColumns;
          return template ? template.split(' ').filter(Boolean).length : 0;
        }),
      { message: `expected ${expected} grid columns` },
    )
    .toBe(expected);
};

test.describe('responsive layout', () => {
  for (const viewport of VIEWPORTS) {
    test(`renders a usable ${viewport.name} layout without horizontal overflow`, async ({ page }) => {
      const errors = trackPageErrors(page);

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');
      await waitForCards(page);

      await expectColumns(page, viewport.expectedColumns);

      // Nothing may spill sideways: a horizontal scrollbar on a catalogue page is
      // the classic responsive bug.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, 'page scrolls horizontally').toBeLessThanOrEqual(1);

      await expect(searchBox(page)).toBeVisible();
      await expect(categorySelect(page)).toBeVisible();
      await expect(sortSelect(page)).toBeVisible();
      await expect(productCards(page).first()).toBeVisible();

      errors.assertClean();
    });
  }

  test('details dialog fits a small viewport and stays scrollable', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 780 });
    await page.goto('/');
    await waitForCards(page);

    await page.locator('.card__action').first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.modal__title')).toBeVisible();

    const box = await dialog.boundingBox();
    expect(box.width).toBeLessThanOrEqual(375);
    expect(box.height).toBeLessThanOrEqual(780);

    await expect(page.getByRole('button', { name: 'Close product details' })).toBeVisible();
  });
});

test.describe('accessibility', () => {
  test('exposes labelled controls and a single live region', async ({ page }) => {
    await page.goto('/');
    await waitForCards(page);

    await expect(searchBox(page)).toBeVisible();
    await expect(categorySelect(page)).toBeVisible();
    await expect(sortSelect(page)).toBeVisible();

    // Exactly one polite live region, and it is not the grid itself — otherwise
    // every filter change reads out all twelve cards.
    await expect(page.locator('[aria-live="polite"]')).toHaveCount(1);
    await expect(page.locator('#announcer')).toHaveAttribute('role', 'status');
    await expect(page.locator('#results-mount')).not.toHaveAttribute('aria-live', /.*/);
  });

  test('announces result counts after a search', async ({ page }) => {
    await page.goto('/');
    await waitForCards(page);

    await runSearch(page, 'laptop');

    await expect(page.locator('#announcer')).toContainText(/Showing \d+ of \d+ products/);
  });

  test('every product card action has an accessible name', async ({ page }) => {
    await page.goto('/');
    await waitForCards(page);

    const actions = page.locator('.card__action');
    await expect(actions).toHaveCount(12);

    const labels = await actions.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('aria-label')),
    );
    expect(labels).toHaveLength(12);
    for (const label of labels) {
      expect(label).toMatch(/^View details for .+/);
    }
  });

  test('is operable by keyboard from the search field to a product dialog', async ({ page }) => {
    await page.goto('/');
    await waitForCards(page);

    // The documented Ctrl/Cmd+K shortcut focuses search.
    await page.keyboard.press('ControlOrMeta+k');
    await expect(searchBox(page)).toBeFocused();

    await page.keyboard.type('watch');
    await page.keyboard.press('Enter');
    await waitForCards(page);

    const firstAction = page.locator('.card__action').first();
    await firstAction.focus();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('provides a skip link to the product results', async ({ page }) => {
    await page.goto('/');
    await waitForCards(page);

    await page.keyboard.press('Tab');
    const skip = page.locator('.skip-link');
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
  });

  test('renders exactly one h1 and a labelled results region', async ({ page }) => {
    await page.goto('/');
    await waitForCards(page);

    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('#results')).toHaveAttribute('aria-labelledby', 'results-heading');
  });
});
