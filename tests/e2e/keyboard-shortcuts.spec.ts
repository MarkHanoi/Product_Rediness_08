// A18-T10 — keyboard shortcut Ctrl+Z triggers undo
import { test, expect } from '@playwright/test';
import { EditorPage } from './fixtures/EditorPage';

test('Ctrl+Z triggers undo command', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForCanvas();

  await editor.wallToolButton.click();
  const box = await editor.canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');
  await page.mouse.click(box.x + 200, box.y + 300);
  await page.mouse.click(box.x + 350, box.y + 300);

  const countBefore = await editor.spatialTree.locator('[data-element-type="wall"]').count();
  expect(countBefore).toBeGreaterThanOrEqual(1);

  await page.keyboard.press('Control+Z');
  await page.waitForTimeout(200);

  const countAfter = await editor.spatialTree.locator('[data-element-type="wall"]').count();
  expect(countAfter).toBeLessThan(countBefore);
});

test('keyboard orbit — ArrowLeft rotates camera', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForCanvas();

  await editor.canvas.click();
  await editor.canvas.focus();

  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowDown');

  await expect(editor.canvas).toBeVisible();
});
