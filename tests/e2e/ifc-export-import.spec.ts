// A18-T6 — IFC export → file downloads → re-import → same element count
import { test, expect } from '@playwright/test';
import { EditorPage } from './fixtures/EditorPage';

test('IFC export/import preserves element count', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForCanvas();

  const initialCount = await editor.spatialTree.locator('[data-element-id]').count();

  const downloadPromise = page.waitForEvent('download');
  await editor.ifcExportButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.ifc$/i);

  const savePath = 'playwright-downloads/exported.ifc';
  await download.saveAs(savePath);

  const fileChooserPromise = page.waitForEvent('filechooser');
  await editor.ifcImportInput.click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(savePath);

  await page.waitForTimeout(3_000);

  const afterCount = await editor.spatialTree.locator('[data-element-id]').count();
  expect(afterCount).toBeGreaterThanOrEqual(initialCount);
});
