// A18-T7 — undo/redo 10 commands → state consistent
import { test, expect } from '@playwright/test';
import { EditorPage } from './fixtures/EditorPage';

test('undo/redo 10 commands — state stays consistent', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForCanvas();

  const commands: string[] = [];

  for (let i = 0; i < 10; i++) {
    await editor.wallToolButton.click();
    const box = await editor.canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');
    const offset = i * 30;
    await page.mouse.click(box.x + 100 + offset, box.y + 300);
    await page.mouse.click(box.x + 150 + offset, box.y + 300);
    commands.push(`wall-${i}`);
  }

  const countAfterDraw = await editor.spatialTree.locator('[data-element-type="wall"]').count();
  expect(countAfterDraw).toBeGreaterThanOrEqual(10);

  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Control+Z');
    await page.waitForTimeout(50);
  }

  const countAfterUndo = await editor.spatialTree.locator('[data-element-type="wall"]').count();
  expect(countAfterUndo).toBeLessThan(countAfterDraw);

  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Control+Y');
    await page.waitForTimeout(50);
  }

  const countAfterRedo = await editor.spatialTree.locator('[data-element-type="wall"]').count();
  expect(countAfterRedo).toBeGreaterThanOrEqual(countAfterDraw);
});
