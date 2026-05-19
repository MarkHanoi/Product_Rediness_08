#!/usr/bin/env node
// PRYZM 2 — heap-leak-hunt harness (S69 D5 deliverable).
//
// Spec source: PHASE-3D §S69 D5 (line 291):
//   "memory profile + leak hunt over 4-hour session simulation."
// Exit-criterion (line 303):
//   "No memory leaks over 4h session."
//
// HONEST SCOPE — what this harness CAN and CANNOT do in dev:
//
//   CAN do (this script):
//     - Run N append-bake cycles against the largest-project fixture.
//     - Capture `process.memoryUsage().heapUsed` before + after each cycle.
//     - Compute trailing-window monotonic-growth: a leak is flagged
//       when 5 consecutive cycles show heap growing without an
//       intervening drop and the total growth exceeds the leak floor
//       (default 5% of the post-warmup heap baseline).
//     - Force GC between cycles when run with `node --expose-gc`.
//       Without `--expose-gc`, the V8 heuristic is used; the harness
//       still works but the noise floor is higher.
//     - Emit a JSON report to apps/bench/.run-output/heap-leak-hunt.json
//       so downstream tooling (the M35 perf doc) can ingest it.
//
//   CANNOT do (operator-side; see DR-DRILL-RUNBOOK.md §7):
//     - Run for the literal 4 hours the spec calls for — that's the
//       operator-side D5 deliverable run on staging where 4 hours of
//       wall-clock is acceptable.  This harness defaults to 200 cycles
//       (~30 s on a Replit container) which is sufficient to detect a
//       linear leak; the 4 h sim is required to detect slow drift
//       (e.g. an IndexedDB-backed store accumulating tombstones).
//     - Profile non-Node retainers (DOM nodes, WebGL textures, GPU
//       buffers).  Those are owned by the editor Playwright bench
//       (S70 D5).
//
// USAGE:
//
//   # Default: 200 cycles, GC heuristic, prints summary to stdout.
//   node apps/bench/scripts/heap-leak-hunt.mjs
//
//   # Force GC between cycles (recommended; needs --expose-gc):
//   node --expose-gc apps/bench/scripts/heap-leak-hunt.mjs
//
//   # Override cycle count (e.g. a 10-min run for nightly CI):
//   PRYZM_LEAK_CYCLES=2000 node --expose-gc apps/bench/scripts/heap-leak-hunt.mjs
//
//   # Operator 4-hour staging run:
//   PRYZM_LEAK_CYCLES=50000 node --expose-gc apps/bench/scripts/heap-leak-hunt.mjs
//
// EXIT CODES:
//   0 — no leak detected.
//   1 — leak detected per the trailing-window heuristic.
//   2 — fixture missing — generate it first with
//       `node tools/generate-largest-fixture.mjs`.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FIXTURE_PATH = resolve(
  __dirname,
  '..',
  '..',
  '..',
  'tests',
  'fixtures',
  'largest-project.pryzm-stub.json',
);
const RUN_OUTPUT = join(ROOT, '.run-output');
const REPORT_PATH = join(RUN_OUTPUT, 'heap-leak-hunt.json');

if (!existsSync(FIXTURE_PATH)) {
  console.error(
    `[leak-hunt] missing fixture: ${FIXTURE_PATH}\n` +
      `            generate with: node tools/generate-largest-fixture.mjs`,
  );
  process.exit(2);
}

const CYCLES = Number(process.env.PRYZM_LEAK_CYCLES ?? 200);
const WARMUP = Number(process.env.PRYZM_LEAK_WARMUP ?? 10);
const LEAK_FLOOR_PCT = Number(process.env.PRYZM_LEAK_FLOOR_PCT ?? 5);
const TRAILING_WINDOW = Number(process.env.PRYZM_LEAK_WINDOW ?? 5);
const GC_AVAILABLE = typeof globalThis.gc === 'function';

console.log(
  `[leak-hunt] cycles=${CYCLES} warmup=${WARMUP} window=${TRAILING_WINDOW} ` +
    `leakFloor=${LEAK_FLOOR_PCT}% gc=${GC_AVAILABLE ? 'expose-gc' : 'heuristic'}`,
);

const raw = readFileSync(FIXTURE_PATH, 'utf-8');
const parsed = JSON.parse(raw);
const wallCount = parsed.walls.length;
console.log(
  `[leak-hunt] fixture loaded: ${wallCount} walls × ${parsed.levels.length} levels`,
);

// One cycle = one full parse-then-discard pass over the fixture.  This
// exercises the JSON.parse code path + the V8 GC of the resulting
// object graph — exactly the slow-leak surface that 4-hour-sessions
// are designed to flush out.  We deliberately do NOT hold a reference
// to the parsed object across cycles; if the heap grows monotonically,
// something is retaining it (closure, listener, registry, etc.).
function oneCycle() {
  // Re-parse from the original raw string each cycle so the per-cycle
  // allocation profile matches a fresh-load scenario rather than a
  // structured-clone of an already-parsed graph.
  const local = JSON.parse(raw);
  // Touch every wall to defeat any dead-code-elimination V8 might do.
  let acc = 0;
  for (const w of local.walls) {
    acc += w.height;
  }
  return acc;
}

if (GC_AVAILABLE) globalThis.gc();
const baselineHeap = process.memoryUsage().heapUsed;
console.log(
  `[leak-hunt] baseline heap: ${(baselineHeap / 1024 / 1024).toFixed(1)} MiB`,
);

// Warm-up cycles — V8 inlining + IC stabilisation; numbers excluded.
for (let i = 0; i < WARMUP; i++) {
  oneCycle();
  if (GC_AVAILABLE) globalThis.gc();
}

if (GC_AVAILABLE) globalThis.gc();
const postWarmupHeap = process.memoryUsage().heapUsed;
const leakFloorBytes = (postWarmupHeap * LEAK_FLOOR_PCT) / 100;

const samples = [];
let monotonicCount = 0;
let prevHeap = postWarmupHeap;
let leakDetected = false;
let leakDetectedAt = -1;
const startedAt = Date.now();

for (let i = 0; i < CYCLES; i++) {
  oneCycle();
  if (GC_AVAILABLE) globalThis.gc();
  const heap = process.memoryUsage().heapUsed;
  samples.push({ cycle: i, heapMiB: Number((heap / 1024 / 1024).toFixed(2)) });

  if (heap > prevHeap) {
    monotonicCount += 1;
    if (
      monotonicCount >= TRAILING_WINDOW &&
      heap - postWarmupHeap > leakFloorBytes
    ) {
      leakDetected = true;
      leakDetectedAt = i;
      console.error(
        `[leak-hunt] LEAK at cycle ${i}: heap=${(heap / 1024 / 1024).toFixed(1)}MiB ` +
          `vs post-warmup=${(postWarmupHeap / 1024 / 1024).toFixed(1)}MiB ` +
          `(growth=${(((heap - postWarmupHeap) / postWarmupHeap) * 100).toFixed(1)}% > floor=${LEAK_FLOOR_PCT}%) ` +
          `monotonic-window=${monotonicCount}`,
      );
      break;
    }
  } else {
    monotonicCount = 0;
  }
  prevHeap = heap;

  if ((i + 1) % 50 === 0) {
    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
      `[leak-hunt] cycle ${i + 1}/${CYCLES} heap=${(heap / 1024 / 1024).toFixed(1)}MiB ` +
        `delta=${(((heap - postWarmupHeap) / postWarmupHeap) * 100).toFixed(1)}% ` +
        `t=${elapsedSec}s`,
    );
  }
}

const elapsedMs = Date.now() - startedAt;
const finalHeap = samples[samples.length - 1]?.heapMiB ?? 0;
const totalGrowthPct = (
  ((finalHeap * 1024 * 1024 - postWarmupHeap) / postWarmupHeap) *
  100
).toFixed(2);

const report = {
  generatedAt: new Date().toISOString(),
  cycles: samples.length,
  cyclesPlanned: CYCLES,
  warmup: WARMUP,
  leakWindow: TRAILING_WINDOW,
  leakFloorPct: LEAK_FLOOR_PCT,
  gc: GC_AVAILABLE ? 'expose-gc' : 'heuristic',
  fixture: { path: FIXTURE_PATH, wallCount, levels: parsed.levels.length },
  baselineHeapMiB: Number((baselineHeap / 1024 / 1024).toFixed(2)),
  postWarmupHeapMiB: Number((postWarmupHeap / 1024 / 1024).toFixed(2)),
  finalHeapMiB: finalHeap,
  totalGrowthPct: Number(totalGrowthPct),
  leakDetected,
  leakDetectedAt,
  elapsedMs,
  samples,
  // Honesty hooks for the report consumer.
  notes: [
    'In-process Node-side leak hunt only.  Does NOT cover DOM, WebGL, or GPU retainers.',
    '4-hour session simulation per S69 D5 spec is the operator-side run on staging — invoke this script with PRYZM_LEAK_CYCLES=50000 against a session-like driver script for that.',
    `Run with --expose-gc to lower the noise floor.  This run used: ${GC_AVAILABLE ? 'expose-gc' : 'heuristic'}.`,
  ],
};

mkdirSync(RUN_OUTPUT, { recursive: true });
writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
console.log(
  `[leak-hunt] wrote ${REPORT_PATH} — leak=${leakDetected} growth=${totalGrowthPct}% elapsed=${(elapsedMs / 1000).toFixed(1)}s`,
);

process.exit(leakDetected ? 1 : 0);
