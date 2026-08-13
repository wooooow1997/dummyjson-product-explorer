import { expect, test } from '@playwright/test';
import { API, trackPageErrors, waitForCards } from './helpers.js';

const openFirstCard = async (page) => {
  await page.locator('.card__action').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
};

test.describe('product details dialog', () => {
  test('opens with detail fetched from the single-product endpoint', async ({ page }) => {
    const errors = trackPageErrors(page);

    await page.goto('/');
    await waitForCards(page);

    const detailRequest = page.waitForRequest(/\/products\/\d+$/);
    await openFirstCard(page);
    await detailRequest;

    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('.modal__title')).toBeVisible();
    await expect(dialog.locator('.modal__price strong')).toContainText('$');

    // These fields only exist on the single-product response, so their presence
    // proves the details view is not just reusing trimmed list data.
    await expect(dialog.locator('.modal__section-title', { hasText: 'Specifications' })).toBeVisible();
    await expect(dialog.locator('.spec')).not.toHaveCount(0);

    errors.assertClean();
  });

  test('is labelled by its title and marked as a modal dialog', async ({ page }) => {
    await page.goto('/');
    await waitForCards(page);
    await openFirstCard(page);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveAttribute('aria-labelledby', 'modal-title');
    await expect(dialog.locator('#modal-title')).toBeVisible();
  });

  test('closes with Escape and returns focus to the triggering card', async ({ page }) => {
    await page.goto('/');
    await waitForCards(page);

    const trigger = page.locator('.card__action').first();
    await trigger.click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('Escape still works after other keys have been pressed', async ({ page }) => {
    await page.goto('/');
    await waitForCards(page);
    await openFirstCard(page);

    // Guards a real regression: a one-shot keydown listener would be consumed by
    // these presses and leave Escape dead.
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('a');

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('closes on backdrop click but not on clicks inside the dialog', async ({ page }) => {
    await page.goto('/');
    await waitForCards(page);
    await openFirstCard(page);

    await page.locator('.modal__title').click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.locator('.modal-overlay').click({ position: { x: 5, y: 5 } });
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('closes with the close button', async ({ page }) => {
    await page.goto('/');
    await waitForCards(page);
    await openFirstCard(page);

    await page.getByRole('button', { name: 'Close product details' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('confines Tab to the dialog', async ({ page }) => {
    await page.goto('/');
    await waitForCards(page);
    await openFirstCard(page);

    const dialog = page.getByRole('dialog');
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      const inside = await dialog.evaluate(
        (node) => node.contains(document.activeElement),
      );
      expect(inside, `focus escaped the dialog after ${i + 1} Tab presses`).toBe(true);
    }
  });

  test('locks background scrolling while open', async ({ page }) => {
    await page.goto('/');
    await waitForCards(page);

    await openFirstCard(page);
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');

    await page.keyboard.press('Escape');
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  });

  test('shows a loading state, then an error with retry when detail fetch fails', async ({ page }) => {
    await page.goto('/');
    await waitForCards(page);

    let blocked = true;
    await page.route(API.detail, async (route) => {
      if (blocked) return route.abort('failed');
      return route.continue();
    });

    await page.locator('.card__action').first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Could not load this product')).toBeVisible();

    blocked = false;
    await dialog.getByRole('button', { name: 'Try again' }).click();

    await expect(dialog.locator('.modal__title')).toBeVisible();
    await expect(dialog.getByText('Could not load this product')).toHaveCount(0);
  });

  test('switches the gallery image via thumbnails', async ({ page }) => {
    // Targets a product that actually ships multiple images — the first product
    // in the catalogue has only one, so thumbnails never render for it.
    await page.goto('/?q=calvin%20klein');
    await waitForCards(page);
    await openFirstCard(page);

    const thumbs = page.locator('.gallery__thumb');
    await expect(thumbs).toHaveCount(3);

    const main = page.locator('.gallery__image');
    const before = await main.getAttribute('src');

    await thumbs.nth(1).click();
    await expect(thumbs.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(thumbs.nth(0)).toHaveAttribute('aria-pressed', 'false');
    expect(await main.getAttribute('src')).not.toBe(before);
  });

  test('renders a single image without thumbnail controls', async ({ page }) => {
    await page.goto('/');
    await waitForCards(page);
    await openFirstCard(page);

    await expect(page.locator('.gallery__image')).toBeVisible();
    await expect(page.locator('.gallery__thumb')).toHaveCount(0);
  });

  test('opening a second product replaces the first dialog', async ({ page }) => {
    await page.goto('/');
    await waitForCards(page);

    await page.locator('.card__action').nth(0).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const firstTitle = await page.locator('.modal__title').textContent();

    await page.keyboard.press('Escape');
    await page.locator('.card__action').nth(1).click();

    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(page.locator('.modal__title')).not.toHaveText(firstTitle ?? '');
  });
});
