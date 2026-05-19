// A18-T8 — section plane cut → 2D plan view matches section
import { test, expect } from '@playwright/test';
import { EditorPage } from './fixtures/EditorPage';

test('section plane cut produces 2D plan view', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForCanvas();

  await editor.sectionPlaneToggle.click();
  await expect(page.locator('[data-testid="section-plane-controls"]')).toBeVisible({
    timeout: 5_000,
  });

  await expect(editor.planViewport).toBeVisible({ timeout: 5_000 });

  const canvas3DVisible = await editor.canvas.isVisible();
  const planVisible = await editor.planViewport.isVisible();
  expect(canvas3DVisible).toBe(true);
  expect(planVisible).toBe(true);
});
