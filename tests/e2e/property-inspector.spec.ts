// A18-T9 — property inspector shows selected wall properties
import { test, expect } from '@playwright/test';
import { EditorPage } from './fixtures/EditorPage';

test('property inspector shows properties for selected element', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForCanvas();

  await editor.wallToolButton.click();
  const box = await editor.canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');
  await page.mouse.click(box.x + 200, box.y + 300);
  await page.mouse.click(box.x + 350, box.y + 300);

  const wall = editor.spatialTree.locator('[data-element-type="wall"]').first();
  await wall.waitFor({ state: 'visible', timeout: 5_000 });
  await wall.click();

  await expect(editor.propertyPanel).toBeVisible({ timeout: 5_000 });

  await expect(editor.propertyPanel.locator('[data-property="type"]')).toBeVisible({
    timeout: 3_000,
  });

  const typeValue = await editor.propertyPanel
    .locator('[data-property="type"]')
    .textContent();
  expect(typeValue?.toLowerCase()).toContain('wall');
});
