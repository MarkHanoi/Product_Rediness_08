#!/usr/bin/env node
// S06-T8 — Hello Cube snapshot capture (per-mode reference PNGs).
//
// Renders the Hello Cube scene in headed Chromium (one run per mode)
// and writes the per-mode reference PNGs that
// `apps/bench/scripts/visual-diff.mjs` consumes.
//
// REQUIRES A REAL GPU (Chrome stable headless with WebGPU enabled).
// The Replit / many CI sandboxes have no GPU — see
// `apps/editor/__tests__/visual-fixtures/README.md` for the workflow.
//
// This script is intentionally a thin wrapper over Playwright; the
// heavy lifting (page.goto + canvas.toDataURL + decode) lives here so
// that the snapshot logic is the same shape on every host.
//
// Usage:
//   node apps/editor/scripts/snapshot-cube.mjs --mode=webgpu --out=PATH
//   node apps/editor/scripts/snapshot-cube.mjs --mode=webgl2 --out=PATH

import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '..', '__tests__', 'visual-fixtures');

const args = parseArgs(process.argv.slice(2));
const mode = args.mode ?? 'webgl2';
if (!['webgpu', 'webgl2'].includes(mode)) {
  console.error(`[snapshot] unknown mode "${mode}" — must be webgpu or webgl2.`);
  process.exit(2);
}
const outPath = resolve(args.out ?? join(FIXTURES, `hello-cube.${mode}.png`));

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error(
    `[snapshot] Playwright is not installed.  Install via:\n` +
      `    npm i -D playwright @playwright/test\n` +
      `    npx playwright install chromium\n` +
      `  (Run on a host with a discrete GPU; the Replit sandbox has none.)`,
  );
  process.exit(2);
}

const url = process.env.PRYZM_DEV_URL ?? 'http://localhost:5173';
const flag = mode === 'webgpu' ? '?pryzm2=1&mode=webgpu' : '?pryzm2=1&mode=webgl2';

const browser = await chromium.launch({
  headless: true,
  args: [
    '--enable-features=Vulkan,UseSkiaRenderer',
    '--enable-unsafe-webgpu',
    '--use-gl=angle',
    '--use-angle=vulkan',
  ],
});
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.goto(`${url}/${flag}`, { waitUntil: 'networkidle' });
  // Wait for the canvas to settle — the renderer marks the camera
  // dirty once on bootstrap, so a single rAF should suffice; we give
  // it 500 ms for safety.
  await page.waitForTimeout(500);
  const canvas = await page.$('canvas');
  if (!canvas) {
    console.error('[snapshot] no <canvas> on the page — bootstrap failed?');
    process.exit(1);
  }
  const buf = await canvas.screenshot({ type: 'png' });
  if (!existsSync(dirname(outPath))) mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, buf);
  console.log(`[snapshot] mode=${mode} → ${outPath} (${buf.length} bytes)`);
} finally {
  await browser.close();
}

function parseArgs(argv) {
  const out = {};
  for (const tok of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(tok);
    if (m) out[m[1]] = m[2];
    else if (tok.startsWith('--')) out[tok.slice(2)] = true;
  }
  return out;
}
