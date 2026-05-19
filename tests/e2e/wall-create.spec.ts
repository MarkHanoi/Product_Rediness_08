// A18-T4 — wall tool: draw wall → appears in 3D + spatial tree
import { test, expect } from '@playwright/test';
import { EditorPage } from './fixtures/EditorPage';

test('wall tool creates wall visible in 3D view and spatial tree', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForCanvas();

  await editor.wallToolButton.click();
  await expect(page.locator('[data-testid="active-tool"]')).toContainText('Wall');

  const box = await editor.canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');

  await page.mouse.click(box.x + 200, box.y + 300);
  await page.mouse.click(box.x + 400, box.y + 300);

  await expect(
    editor.spatialTree.locator('[data-element-type="wall"]').first(),
  ).toBeVisible({ timeout: 5_000 });
});
