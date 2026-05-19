// A18-T11 — offline mode: disable network → model still visible from IndexedDB cache
import { test, expect } from '@playwright/test';
import { EditorPage } from './fixtures/EditorPage';

test('offline mode — model remains visible from IndexedDB cache', async ({
  page,
  context,
}) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForCanvas();

  await expect(editor.canvas).toBeVisible();

  await context.setOffline(true);

  await page.reload();

  await page.waitForLoadState('domcontentloaded');

  await expect(editor.canvas).toBeVisible({ timeout: 15_000 });

  await expect(page.locator('[data-testid="offline-indicator"]')).toBeVisible({
    timeout: 5_000,
  });

  await context.setOffline(false);
});
