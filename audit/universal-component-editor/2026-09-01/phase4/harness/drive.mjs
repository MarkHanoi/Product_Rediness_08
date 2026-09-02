// lane 4E — Playwright driver for the browser harness.
// Usage: node drive.mjs <path-under-vite-root> <out.json> [shotPath]
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const page_path = process.argv[2];
const outPath = process.argv[3];
const shotPath = process.argv[4] ?? null;

const browser = await chromium.launch({
  args: [
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`.slice(0, 400)));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`.slice(0, 400)));

await page.goto(`http://127.0.0.1:5211/${page_path}`, { waitUntil: 'domcontentloaded', timeout: 120000 });

// Wait for the harness to reach a terminal stage.
try {
  await page.waitForFunction(
    () => ['done', 'threw'].includes(window.__LANE4E?.stage),
    null,
    { timeout: 180000 },
  );
} catch {
  logs.push('[driver] TIMEOUT waiting for terminal stage');
}

const result = await page.evaluate(() => window.__LANE4E ?? { stage: 'MISSING' });
if (shotPath !== null) {
  await page.screenshot({ path: shotPath });
}
writeFileSync(outPath, JSON.stringify({ result, logs: logs.slice(-60) }, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log('--- CONSOLE (last 25) ---');
for (const l of logs.slice(-25)) console.log(l);
await browser.close();
