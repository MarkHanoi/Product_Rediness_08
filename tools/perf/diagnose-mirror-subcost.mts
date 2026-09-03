/**
 * LANE PERF-2 2026-09-03 — the MIRROR SUB-COST PROBE.
 *
 * The question this settles (it decides whether §PERF-MIRROR-BATCH is a real
 * browser target or a headless artefact):
 *
 *   BASE-INNER attributed 228 ms of a 1000-wall `wall.batch.create` to the
 *   authoritative-element mirror's replay (`wireAuthoritativeElementMirror` →
 *   `WallStore.add` × 1000). Fix 2a cut the store-internal term to ~44 ms. The
 *   remaining §PERF-MIRROR-BATCH proposal is to batch-bracket that replay in
 *   `runtime-composer/src/authoritativeElementMirror.ts`.
 *
 *   BUT the mirror's own contract (its header, "WHY IT CANNOT REGRESS THE
 *   BROWSER §2 DEDUP") says it is a NO-OP in the browser: the L7 §P2.1 bridge
 *   (`apps/editor/src/engine/initTools.ts`) has ALWAYS already `add()`-ed the
 *   wall by the time the mirror's patch listener runs, so `store.getById(id)`
 *   is non-empty and the mirror `continue`s without calling `add()`. If that is
 *   true, the 228 ms is paid by the mirror ONLY in the headless harness (which
 *   never wires §P2.1); in the browser it is paid by §P2.1's own `add()`, and
 *   batch-bracketing the MIRROR FILE saves zero browser milliseconds.
 *
 * Arms:
 *   1. MIRROR-HEADLESS  — empty store, run the real `wireAuthoritativeElementMirror`
 *      over a 1000-add batch record. Reproduces the inner-harness attribution:
 *      the mirror does all 1000 `add()`s. (== what BASE-INNER measured.)
 *   2. MIRROR-BROWSER   — PRE-ADD all 1000 (as §P2.1 does synchronously first),
 *      THEN run the same mirror over the same record. Measures the mirror's
 *      residual cost when the browser's §P2.1 bridge got there first.
 *      Expectation if the DEDUP claim holds: ~0 ms, 0 adds performed.
 *   3. FANOUT-UNBATCHED — where the browser cost ACTUALLY goes: 1000 real
 *      `WallStore.add()` (the §P2.1 add) with the real `storeEventBus` carrying
 *      K subscribers, no batch bracket. Decomposes store-internal vs fan-out.
 *   4. FANOUT-BATCHED   — same 1000 adds wrapped in `storeEventBus.batch(fn)`
 *      (the BatchCoordinator bracket the browser's bulk paths open). Delta (3−4)
 *      is the magnitude a storeEventBus batch bracket saves — the ACTUAL redirect
 *      target, and one that already has machinery (BatchCoordinator.runBatch).
 *
 * Falsification: arm 2 also asserts adds-performed === 0 (not just "fast"); a
 * planted subscriber busy-wait in arm 3 must appear in 3 and be amortised in 4.
 *
 * FIDELITY NOTE (declared, not hidden): arm 3/4's fan-out uses the real
 * `storeEventBus` and the real `DependencyResolver` plus K synthetic subscribers
 * calibrated to bracket the real per-event work; it does NOT instantiate
 * `ElementSpatialIndex` (needs registered THREE meshes) or `SelectionManager`
 * (needs a picking world), so arm 3 is a LOWER BOUND on true browser fan-out.
 * The decision (arms 1 vs 2) needs none of that — it is exact.
 *
 * Reproduce: npx tsx tools/perf/diagnose-mirror-subcost.mts
 */

// frame-scheduler's production RafAdapter delegates to globalThis.requestAnimationFrame;
// under plain tsx it is absent (it WARNS + no-ops rather than throwing). Provide a
// setTimeout-backed polyfill so the real DependencyResolver's scheduleOnce actually
// fires, matching the browser where the deferred upsert/flush runs.
if (typeof (globalThis as any).requestAnimationFrame !== 'function') {
  (globalThis as any).requestAnimationFrame = (cb: (t: number) => void) =>
    setTimeout(() => cb(performance.now()), 0) as unknown as number;
  (globalThis as any).cancelAnimationFrame = (h: number) => clearTimeout(h as unknown as NodeJS.Timeout);
}

import { WallStore } from '../../packages/geometry-wall/src/WallStore';
import { wireAuthoritativeElementMirror } from '../../packages/runtime-composer/src/authoritativeElementMirror';
import { storeEventBus } from '../../packages/core-app-model/src/StoreEventBus';

const N = 1000;
const LEVEL = { id: 'level-1', name: 'L1', elevation: 0, height: 3 } as any;
const fakeBim = {
  getLevelById: (id: string) => (id === LEVEL.id ? LEVEL : undefined),
  getLevels: () => [LEVEL],
  getActiveLevel: () => LEVEL,
} as any;
const fakeCtx = {} as any;

function mkWall(i: number) {
  const x0 = (i % 100) * 4, z0 = Math.floor(i / 100) * 4;
  return {
    id: `probe-wall-${i}`, type: 'wall' as const, levelId: LEVEL.id,
    baseLine: [{ x: x0, y: 0, z: z0 }, { x: x0 + 2.5, y: 0, z: z0 }] as any,
    height: 3, thickness: 0.2,
  } as any;
}

function med(a: number[]) { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }

/** The exact record shape `wall.batch.create` emits into the patch stream:
 *  one forward add patch per wall, value = committed record. */
function mkBatchRecord() {
  const forward = [];
  for (let i = 0; i < N; i++) {
    const w = mkWall(i);
    forward.push({ op: 'add', path: [w.id], value: w });
  }
  return { type: 'wall.batch.create', forward } as any;
}

/** A mock patch emitter — synchronous, mirrors `inner.bus.patches`. */
function mkPatchEmitter() {
  let listener: ((bytes: Uint8Array, rec: any) => void) | null = null;
  return {
    subscribe(l: (bytes: Uint8Array, rec: any) => void) { listener = l; return () => { listener = null; }; },
    fire(rec: any) { listener?.(new Uint8Array(0), rec); },
  };
}

// ── Arm 1: MIRROR-HEADLESS (empty store → mirror does all the adds) ──────────
function armMirrorHeadless() {
  const store = new WallStore();
  store.attachEngine(fakeCtx, fakeBim);
  let adds = 0;
  const origAdd = store.add.bind(store);
  (store as any).add = (r: any) => { adds++; return origAdd(r); };
  const patches = mkPatchEmitter();
  const dispose = wireAuthoritativeElementMirror(patches as any, { getStoreForType: () => store });
  const rec = mkBatchRecord();
  const t0 = performance.now();
  patches.fire(rec);
  const total = performance.now() - t0;
  dispose();
  return { total, adds, stored: store.getAll().length };
}

// ── Arm 2: MIRROR-BROWSER (§P2.1 pre-added → mirror must be a no-op) ─────────
function armMirrorBrowser() {
  const store = new WallStore();
  store.attachEngine(fakeCtx, fakeBim);
  // §P2.1 does this FIRST, synchronously, before the mirror's patch listener runs.
  for (let i = 0; i < N; i++) store.add(mkWall(i));
  let adds = 0;
  const origAdd = store.add.bind(store);
  (store as any).add = (r: any) => { adds++; return origAdd(r); };
  const patches = mkPatchEmitter();
  const dispose = wireAuthoritativeElementMirror(patches as any, { getStoreForType: () => store });
  const rec = mkBatchRecord();
  const t0 = performance.now();
  patches.fire(rec);              // mirror runs; every getById hits → skip
  const total = performance.now() - t0;
  dispose();
  return { total, adds, stored: store.getAll().length };
}

// ── Arms 3/4: fan-out cost with the real storeEventBus + K subscribers ──────
function armFanout(opts: { batched: boolean; extraSubs: number; plantedMs?: number }) {
  const store = new WallStore();
  store.attachEngine(fakeCtx, fakeBim);
  const disposers: Array<() => void> = [];
  let events = 0;
  // K representative subscribers (each does the shape of real cross-store work:
  // a map write keyed by elementId + a small scan of buffered ids).
  const seen = new Map<string, number>();
  for (let k = 0; k < opts.extraSubs; k++) {
    disposers.push(storeEventBus.subscribe((e) => {
      events++;
      seen.set(e.elementId, (seen.get(e.elementId) ?? 0) + 1);
      if (opts.plantedMs && k === 0) { const t = performance.now(); while (performance.now() - t < opts.plantedMs) {} }
    }));
  }
  const walls = Array.from({ length: N }, (_, i) => mkWall(i));
  const doAdds = () => { for (const w of walls) store.add(w); };
  const t0 = performance.now();
  if (opts.batched) storeEventBus.batch(doAdds); else doAdds();
  const total = performance.now() - t0;
  for (const d of disposers) d();
  return { total, events, stored: store.getAll().length };
}

// warmup JIT
armMirrorHeadless();
armMirrorBrowser();
armFanout({ batched: false, extraSubs: 4 });

console.log('=== MIRROR SUB-COST PROBE (N=1000) ===\n');

const a1 = armMirrorHeadless();
const a2 = armMirrorBrowser();
console.log(`Arm 1 MIRROR-HEADLESS  total=${a1.total.toFixed(1).padStart(7)}ms  mirror-adds=${a1.adds}  stored=${a1.stored}`);
console.log(`Arm 2 MIRROR-BROWSER   total=${a2.total.toFixed(1).padStart(7)}ms  mirror-adds=${a2.adds}  stored=${a2.stored}`);
console.log('');
console.log(`  DECISION: mirror residual in the browser = ${a2.total.toFixed(2)}ms with ${a2.adds} add()s performed by the mirror.`);
console.log(`            (headless harness attributes ${a1.total.toFixed(1)}ms / ${a1.adds} adds to the SAME mirror only because §P2.1 is absent.)`);
console.log(`  VERDICT: ${a2.adds === 0 ? 'CONFIRMED NO-OP — §PERF-MIRROR-BATCH on authoritativeElementMirror.ts saves ~0 browser ms.' : 'MIRROR STILL ADDS — §PERF-MIRROR-BATCH is a real browser target.'}`);
console.log('');

const K = 4;
const f3 = armFanout({ batched: false, extraSubs: K });
const f4 = armFanout({ batched: true, extraSubs: K });
console.log(`Arm 3 FANOUT-UNBATCHED total=${f3.total.toFixed(1).padStart(7)}ms  storeEventBus deliveries=${f3.events}  (K=${K} subs)`);
console.log(`Arm 4 FANOUT-BATCHED   total=${f4.total.toFixed(1).padStart(7)}ms  storeEventBus deliveries=${f4.events}  (K=${K} subs)`);
console.log(`  redirect magnitude: batch bracket around storeEventBus saves ${(f3.total - f4.total).toFixed(1)}ms of the ${K}-subscriber fan-out (LOWER BOUND — real browser has more, heavier subs).`);
console.log('');

// Falsification: planted 0.02ms subscriber busy-wait must show in unbatched, be amortised by the batch.
const p3 = armFanout({ batched: false, extraSubs: K, plantedMs: 0.02 });
const p4 = armFanout({ batched: true, extraSubs: K, plantedMs: 0.02 });
console.log(`Falsification: +0.02ms planted sub → unbatched ${p3.total.toFixed(1)}ms (Δ+${(p3.total - f3.total).toFixed(1)} vs arm3), batched ${p4.total.toFixed(1)}ms (Δ+${(p4.total - f4.total).toFixed(1)} vs arm4).`);
console.log(`  (unbatched delta should be ~${(0.02 * N).toFixed(0)}ms — the planted cost × N deliveries — proving the timer binds the fan-out.)`);
