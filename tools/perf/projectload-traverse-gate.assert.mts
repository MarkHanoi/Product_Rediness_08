/**
 * LANE PERF-2 2026-09-03 — §PERF-PROJECTLOADER acceptance oracle.
 *
 * The diagnosis (audit/perf/2026-09-02/diagnosis.md, Axis D + rank 3) proposed
 * "batch the loader replay ... so L03/tier runs once at batch end", attributing
 * an O(N²) hydrate leg to `initScene.ts`'s per-`bim-wall-added` DOUBLE
 * scene.traverse (`collectNewPbrMeshes` + `countMeshes`) running per wall because
 * "ProjectLoader replays walls with isBatching=false (logged 300x)".
 *
 * THAT HALF IS ALREADY SHIPPED. `§FIX-LOAD-TRAVERSE-BATCH` (commit 4d16580c,
 * present at the diagnosis's OWN profile HEAD c5d0109c) added
 * `apps/editor/src/engine/perAddGeometryGate.ts`, whose
 * `shouldDeferPerAddGeometryPass()` gates the two traverses on
 * `isBatching || isProjectLoadActive()`. ProjectLoader sets
 * `globalThis.__pryzmProjectLoadActive = true` for the whole replay window
 * (ProjectLoader.ts:707) and clears it in `finally` (ProjectLoader.ts:3172)
 * BEFORE `pryzm-project-loaded` fires the ONE consolidated pass
 * (initScene.ts:3764 → runTierPbrPass('post-load')). The diagnosis's
 * "isBatching=false" reading is real but INCOMPLETE — it omitted the
 * `isProjectLoadActive()` half of the same gate, which is exactly what engages
 * during a load.
 *
 * This oracle proves the gate at its decision point (the module's own doc: it is
 * "the DECISION immediately upstream of both" traverses, so its verdict IS
 * whether the traverses run):
 *
 *   • LOAD window   (flag set):   N adds ⇒ 0 undeferred traverses (all deferred).
 *   • INTERACTIVE   (flag clear): N adds ⇒ 2N undeferred traverses (per-add pass).
 *
 * Red-first character: delete the `isProjectLoadActive()` term from
 * `shouldDeferPerAddGeometryPass` and the LOAD arm regresses to 2N traverses —
 * the exact O(N²) the diagnosis feared. It is GREEN on the committed tree,
 * proving the fix is live (not merely present).
 *
 * Reproduce: npx tsx tools/perf/projectload-traverse-gate.assert.mts ; echo RC=$?
 */
import { shouldDeferPerAddGeometryPass, isProjectLoadActive } from '../../apps/editor/src/engine/perAddGeometryGate';
import { armPerf, perfSnapshot, resetPerfCounters, PERF_KEYS } from '@pryzm/frame-scheduler';

const N = 300; // the diagnosis's 300-wall cold-open scale
let failures = 0;
const fail = (m: string) => { console.error(`FAIL: ${m}`); failures++; };
const read = (key: string) => perfSnapshot().counters[key] ?? 0;

armPerf();

// ── Arm LOAD: the ProjectLoader replay window ───────────────────────────────
(globalThis as { __pryzmProjectLoadActive?: boolean }).__pryzmProjectLoadActive = true;
resetPerfCounters();
if (!isProjectLoadActive()) fail('isProjectLoadActive() should be true inside the load window');
let deferredDuringLoad = 0;
for (let i = 0; i < N; i++) {
  // isBatching=false — the diagnosis's exact condition: the loader does NOT open
  // a batchCoordinator batch (it drains under the SEPARATE storeEventBus batch).
  if (shouldDeferPerAddGeometryPass(false)) deferredDuringLoad++;
}
const pbrDuringLoad  = read(PERF_KEYS.TRAVERSE_PER_ADD_PBR);
const tierDuringLoad = read(PERF_KEYS.TRAVERSE_PER_ADD_TIER);
const undeferredLoadTraverses = pbrDuringLoad + tierDuringLoad;
if (deferredDuringLoad !== N) fail(`LOAD: expected all ${N} adds deferred, got ${deferredDuringLoad}`);
if (undeferredLoadTraverses !== 0) fail(`LOAD: expected 0 undeferred traverses, got ${undeferredLoadTraverses} (O(N²) window OPEN)`);

// ── Arm INTERACTIVE: no load, no batch — the per-add pass MUST run ───────────
(globalThis as { __pryzmProjectLoadActive?: boolean }).__pryzmProjectLoadActive = false;
resetPerfCounters();
if (isProjectLoadActive()) fail('isProjectLoadActive() should be false outside the load window');
let deferredInteractive = 0;
for (let i = 0; i < N; i++) {
  if (shouldDeferPerAddGeometryPass(false)) deferredInteractive++;
}
const undeferredInteractive = read(PERF_KEYS.TRAVERSE_PER_ADD_PBR) + read(PERF_KEYS.TRAVERSE_PER_ADD_TIER);
if (deferredInteractive !== 0) fail(`INTERACTIVE: expected 0 deferred, got ${deferredInteractive}`);
if (undeferredInteractive !== 2 * N) fail(`INTERACTIVE: expected ${2 * N} traverses (2/add), got ${undeferredInteractive}`);

console.log('=== §PERF-PROJECTLOADER traverse-gate oracle (N=300) ===');
console.log(`  LOAD window   : ${deferredDuringLoad}/${N} adds deferred, ${undeferredLoadTraverses} undeferred traverses  (want ${N} / 0)`);
console.log(`  INTERACTIVE   : ${deferredInteractive}/${N} adds deferred, ${undeferredInteractive} undeferred traverses  (want 0 / ${2 * N})`);
console.log(`  During a 300-wall load the gate saves ${2 * N} full scene.traverse() walks of a growing scene — the O(N²) the diagnosis feared, already closed.`);
console.log(failures === 0 ? 'OK: §FIX-LOAD-TRAVERSE-BATCH is LIVE — the per-add double-traverse is deferred during load, one consolidated pass at load-end.' : `FAILED: ${failures} assertion(s)`);
process.exit(failures === 0 ? 0 : 1);
