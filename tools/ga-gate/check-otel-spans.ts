#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/check-otel-spans.ts
 *
 * GA gate — OTel handler span coverage (C10 §2, S03).
 *
 * CONTRACT (C10 §2): "Every new exported function MUST add ≥ 1 OTel span."
 * For CommandBus handlers this means each handler file MUST call
 * `withHandlerSpan()` (or `withAsyncHandlerSpan()`) from @pryzm/plugin-sdk.
 * Direct `@opentelemetry/api` imports in handler files are FORBIDDEN per
 * ADR-002 §2 (L7 boundary).
 *
 * Gate strategy — count handler files that contain withHandlerSpan or
 * withAsyncHandlerSpan calls (not just imports).
 *
 *   HARD_FLOOR  — instrumented count must stay ≥ this value (ratchet, never goes down).
 *   SOFT_WARN   — count below this emits a warning but does NOT fail CI.
 *
 * Ratchet schedule:
 *   S03 (2026-05-04): wall Create handlers (5) wired → HARD_FLOOR = 5.
 *   S04: remaining 23 Create handlers → HARD_FLOOR = 28.
 *   S05: all non-Create handlers (batch, delete, set, move) → HARD_FLOOR = 176.
 *
 * Verification:
 *   pnpm tsx tools/ga-gate/check-otel-spans.ts
 *   Exit 0 → all clear.  Exit 1 → regression (instrumented count < HARD_FLOOR).
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dir, '..', '..');
const PLUGINS_DIR = join(REPO_ROOT, 'plugins');

// ── Thresholds ────────────────────────────────────────────────────────────────
//
// HARD_FLOOR: minimum number of handler files that MUST have OTel spans.
// Increase this each sprint as more handlers are instrumented.  Never decrease.
// Ratcheted A30 2026-05-04: 182 → 183 for CreateStairBatch.ts (stair.batch.create).
// Gate output confirmed 183/183 before ratchet (184 total - 1 excluded marker = 183 gate-visible).
//
// Verified 2026-05-08 (Phase 0 Task 0.3 — plan doc §0.3):
//   Raw handler files (non-index .ts in plugins/*/src/handlers/): 184
//   Excluded via @command-gate marker: 1 (ifc-import/pluginHandlers.ts)
//   Gate-visible: 183.  Instrumented: 183/183 (100% coverage).
//   NOTE: The plan document §0.3 stated "192 handlers"; that figure used a
//   different counting method (may have included index.ts or non-handler files).
//
// Ratcheted 2026-05-14: 183 → 184.
//   A new handler file landed with full OTel span coverage, removing (or neutralising) the
//   previously-excluded @command-gate marker in ifc-import/pluginHandlers.ts.
//   Gate run output: [otel-spans] 213 / 213 handler files have OTel spans.
//   HARD_FLOOR advances to 213 — the new authoritative maximum for the current handler set.
//   HARD_FLOOR stays at 213; increase only when new handlers are added and
//   instrumented in the same PR (per P8 merge gate).
//   Ratcheted 2026-05-15 (Sprint F-2.1): 184 → 213.  29 new handler files were
//   added across Phase F-1 sprints (F-1.0 → F-1.4); all 29 were instrumented at
//   the time of authorship per the P8 merge gate rule.  Gate scan confirmed:
//   [otel-spans] 213 / 213 handler files have OTel spans → EXIT:0.
const HARD_FLOOR = 213;

// SOFT_WARN: target count — below this a warning is printed (does not fail CI).
// 213 = current gate-visible handler file count (all instrumented, 100% coverage).
// Ratcheted 2026-05-15: 184 → 213 to match actual gate-visible handler count.
const SOFT_WARN = 213;

// ── File discovery ────────────────────────────────────────────────────────────

const GATE_EXCLUDE_MARKER = '@command-gate: not-a-command-bus-handler';

function findHandlerFiles(): string[] {
  const files: string[] = [];
  if (!existsSync(PLUGINS_DIR)) return files;

  for (const plugin of readdirSync(PLUGINS_DIR)) {
    const handlersDir = join(PLUGINS_DIR, plugin, 'src', 'handlers');
    if (!existsSync(handlersDir)) continue;

    for (const entry of readdirSync(handlersDir)) {
      if (
        entry === 'index.ts' ||
        !entry.endsWith('.ts') ||
        entry.includes('.test.') ||
        entry.includes('.spec.') ||
        entry.includes('.mock.')
      ) continue;

      const full = join(handlersDir, entry);
      if (!statSync(full).isFile()) continue;

      const head = readFileSync(full, { encoding: 'utf-8' }).slice(0, 600);
      if (head.includes(GATE_EXCLUDE_MARKER)) continue;

      files.push(full);
    }
  }
  return files;
}

// ── Instrumentation check ─────────────────────────────────────────────────────
//
// A handler file is considered instrumented when its source contains a call
// to withHandlerSpan or withAsyncHandlerSpan (not just an import — the call
// pattern has the opening parenthesis).

const SPAN_CALL_RE = /withHandlerSpan\s*\(|withAsyncHandlerSpan\s*\(/;

function isInstrumented(filePath: string): boolean {
  const src = readFileSync(filePath, 'utf-8');
  return SPAN_CALL_RE.test(src);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const handlerFiles = findHandlerFiles();
const total = handlerFiles.length;
const uninstrumented: string[] = [];
let instrumented = 0;

for (const f of handlerFiles) {
  if (isInstrumented(f)) {
    instrumented++;
  } else {
    uninstrumented.push(relative(REPO_ROOT, f));
  }
}

console.log(`[otel-spans] ${instrumented} / ${total} handler files have OTel spans.`);

if (instrumented < HARD_FLOOR) {
  console.error(
    `[otel-spans] FAIL: only ${instrumented} handler file(s) instrumented — minimum is ${HARD_FLOOR} (HARD_FLOOR).`,
  );
  console.error(
    `[otel-spans] Regression: a previously-instrumented handler lost its withHandlerSpan() call.`,
  );
  console.error(`[otel-spans] Missing instrumentation in:`);
  for (const f of uninstrumented.slice(0, 20)) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
}

if (instrumented < SOFT_WARN) {
  console.warn(
    `[otel-spans] WARN: ${uninstrumented.length} handler file(s) still lack OTel spans ` +
    `(target: ${SOFT_WARN}).  Add withHandlerSpan() per the S03 sprint plan.`,
  );
  if (uninstrumented.length > 0 && uninstrumented.length <= 20) {
    for (const f of uninstrumented) {
      console.warn(`  - ${f}`);
    }
  }
}

console.log(`[otel-spans] OK: ${instrumented} ≥ HARD_FLOOR(${HARD_FLOOR}). ✅`);
process.exit(0);
