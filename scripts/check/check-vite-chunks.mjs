#!/usr/bin/env node
// scripts/check-vite-chunks.mjs — Lazy AI chunk size CI gate (W-12).
//
// Spec: `phases/audits/PHASE-2-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md` §W-12.
// Audit reference: §3 H-7, §5 R-10, §6 (Phase 2D).
// Authority: ADR-0014 / ADR-0037 K3-A gate — `AiHost.impl` MUST be in a
// separate Vite chunk (lazy-loaded, kept off the editor's main bundle).
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// 1. Spawn a fresh `vite build` in `apps/editor/` (skipped when
//    `--use-existing-build` is passed and `dist/` is present).
// 2. Walk `apps/editor/dist/assets/*.js` looking for a chunk that contains
//    a marker proving `AiHost.impl` is the lazy-imported entry.
// 3. If absent ⇒ exit 1 with a clear "K3-A gate broken" message.
// 4. If present ⇒ print the chunk filename + raw size + gzip size.
// 5. If gzip size > THRESHOLD_GZIP_KB (default 200) ⇒ exit 1.
//
// Why a marker, not a chunk-name match: Vite hashes chunk names
// (`AiHost.impl-Bf3kQ.js`), and they may also be entry chunks rather than
// dynamic imports.  We look for a string literal embedded in
// `AiHost.impl.ts` (the `AI_HOST_IMPL_BUILD_MARKER`) so the check is
// resilient to chunk-name churn.
//
// Marker contract: `packages/ai-host/src/AiHost.impl.ts` MUST export a
// constant whose minified-string value contains `'AI_HOST_IMPL_BUILD_MARKER'`.
// If that contract changes, update both this script and ADR-0037.

import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const EDITOR_DIR = join(REPO_ROOT, 'apps', 'editor');
const DIST_ASSETS = join(EDITOR_DIR, 'dist', 'assets');

const MARKER = 'AI_HOST_IMPL_BUILD_MARKER';
const THRESHOLD_GZIP_KB = Number(process.env.PRYZM_AI_HOST_CHUNK_GZIP_KB_MAX ?? 200);

const args = new Set(process.argv.slice(2));
const useExisting = args.has('--use-existing-build') || args.has('--no-build');

function fail(msg) {
  console.error(`[check-vite-chunks] FAIL — ${msg}`);
  process.exit(1);
}

function pass(msg) {
  console.log(`[check-vite-chunks] PASS — ${msg}`);
  process.exit(0);
}

async function ensureBuild() {
  if (useExisting) {
    const exists = await fs.stat(DIST_ASSETS).then(() => true).catch(() => false);
    if (!exists) fail(`--use-existing-build passed but ${DIST_ASSETS} not found`);
    return;
  }
  console.log('[check-vite-chunks] Running `vite build` in apps/editor …');
  const r = spawnSync('npx', ['vite', 'build'], {
    cwd: EDITOR_DIR,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, NODE_ENV: 'production' },
  });
  if (r.status !== 0) fail(`vite build exited ${r.status}`);
}

async function findMarkerChunk() {
  let entries;
  try {
    entries = await fs.readdir(DIST_ASSETS);
  } catch (e) {
    fail(`could not read ${DIST_ASSETS}: ${e?.message ?? e}`);
  }
  const jsFiles = entries.filter((f) => f.endsWith('.js'));
  if (jsFiles.length === 0) fail(`no .js files in ${DIST_ASSETS}`);

  let mainChunkSize = 0;
  let markerChunk = null;
  let markerSize = 0;
  let markerBytes = null;

  for (const f of jsFiles) {
    const path = join(DIST_ASSETS, f);
    const bytes = await fs.readFile(path);
    const text = bytes.toString('utf-8');
    const isMain = /^index[-.]/i.test(f) || /\bmain[-.]/i.test(f);
    if (isMain) mainChunkSize = Math.max(mainChunkSize, bytes.length);
    if (text.includes(MARKER)) {
      if (markerChunk && !isMain) {
        // Multiple chunks contain the marker — the first one wins; this is
        // unusual but not necessarily a failure.
        console.warn(`[check-vite-chunks] note: marker also present in ${f}`);
        continue;
      }
      if (!isMain) {
        markerChunk = f;
        markerSize = bytes.length;
        markerBytes = bytes;
      } else {
        // Marker leaked into the main chunk — K3-A gate broken.
        fail(
          `marker ${MARKER} found in MAIN chunk ${f} — AiHost.impl is NOT split. `
          + `Check that AiHost.impl is loaded via dynamic import per ADR-0037.`,
        );
      }
    }
  }

  if (!markerChunk || !markerBytes) {
    fail(
      `marker ${MARKER} not found in any chunk under ${DIST_ASSETS}. `
      + `Either the editor build does not include AiHost.impl, or the marker `
      + `constant in packages/ai-host/src/AiHost.impl.ts changed name. `
      + `If the latter, update this script + ADR-0037.`,
    );
  }
  return { name: markerChunk, raw: markerSize, bytes: markerBytes };
}

await ensureBuild();
const chunk = await findMarkerChunk();
const gz = gzipSync(chunk.bytes);
const rawKb = (chunk.raw / 1024).toFixed(1);
const gzKb = (gz.length / 1024).toFixed(1);

console.log(
  `[check-vite-chunks] AiHost.impl chunk: ${chunk.name}  raw=${rawKb} KB  gzip=${gzKb} KB`,
);

if (gz.length > THRESHOLD_GZIP_KB * 1024) {
  fail(
    `chunk gzip ${gzKb} KB > threshold ${THRESHOLD_GZIP_KB} KB — `
    + `set PRYZM_AI_HOST_CHUNK_GZIP_KB_MAX to override`,
  );
}

pass(
  `AiHost.impl is in a separate chunk (${chunk.name}); gzip ${gzKb} KB ≤ ${THRESHOLD_GZIP_KB} KB`,
);
