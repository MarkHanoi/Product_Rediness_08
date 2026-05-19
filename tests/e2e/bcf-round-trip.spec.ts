// A18-T5 — BCF 3.0 round-trip: create issue → export → re-import → issue preserved
import { test, expect } from '@playwright/test';
import { EditorPage } from './fixtures/EditorPage';

test('BCF round-trip: create → export → import → issue preserved', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForCanvas();

  await page.locator('[data-testid="bcf-new-issue"]').click();
  const titleInput = page.locator('[data-testid="bcf-issue-title"]');
  await titleInput.fill('A18 E2E test issue');
  await page.locator('[data-testid="bcf-save-issue"]').click();

  await expect(page.locator('[data-testid="bcf-issue-list-item"]').first()).toBeVisible({
    timeout: 5_000,
  });

  const downloadPromise = page.waitForEvent('download');
  await editor.bcfExportButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.bcf(zip)?$/i);

  const savePath = 'playwright-downloads/test-issues.bcfzip';
  await download.saveAs(savePath);

  await page.locator('[data-testid="bcf-import"]').click();
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.locator('[data-testid="bcf-import-file-input"]').click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(savePath);

  await expect(page.locator('[data-testid="bcf-issue-list-item"]').first()).toContainText(
    'A18 E2E test issue',
    { timeout: 5_000 },
  );
});
