// A18-T3 — NFT 2: open sample IFC → model visible in 3D view < 6 s
import { test, expect } from '@playwright/test';
import { EditorPage } from './fixtures/EditorPage';
import path from 'node:path';

test('NFT 2 — open sample IFC → model visible in 3D view < 6 s', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();

  const start = Date.now();

  const fileChooserPromise = page.waitForEvent('filechooser');
  await editor.ifcImportInput.click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(path.join('tests', 'fixtures', 'sample.ifc'));

  await expect(editor.canvas).toBeVisible({ timeout: 6_000 });
  await expect(editor.spatialTree).toBeVisible({ timeout: 6_000 });

  const elapsed = Date.now() - start;
  expect(elapsed, `IFC open took ${elapsed}ms — NFT 2 limit: 6000ms`).toBeLessThan(6_000);
});
