// A18-T2 — NFT 1: cold boot to first paint < 2.5 s
import { test, expect } from '@playwright/test';
import { EditorPage } from './fixtures/EditorPage';

test('NFT 1 — cold boot to first paint < 2.5 s', async ({ page }) => {
  const start = Date.now();
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForCanvas();
  const elapsed = Date.now() - start;
  expect(elapsed, `Cold boot took ${elapsed}ms — NFT 1 limit: 2500ms`).toBeLessThan(2500);
});
