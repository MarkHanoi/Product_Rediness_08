# LANE PERF-2 — the PLANNED-fix queue, executed (2026-09-03)

Respawn after capacity cut. Follows `diagnosis.md` + `fixes.md` (fixes 1/2a/4/5/6 already
landed and committed into the tree — verified live below). This lane's charter was the PLANNED
queue: (1) resolve the mirror sub-cost probe → §PERF-MIRROR-BATCH, (2) §PERF-PROJECTLOADER,
(3) §PERF-WEBIFC-BOOT, (4) §PERF-SHADER if time, plus the correctness riders L-12894 / L-12895.

Environment: Windows 11, node v24.15.0, AMD Ryzen 5 7235HS. HEAD `dc942d01`, working tree clean
(only untracked audit/country-adapter dirs) — re-checked before every step. **No commit made.**

Files this lane created (guard honoured — only NEW tool + audit files, no source edits):
`tools/perf/diagnose-mirror-subcost.mts`, `tools/perf/projectload-traverse-gate.assert.mts`,
`audit/perf/2026-09-02/postfix-mirror-subcost.json`, this file. The single source-file edit made
(a `sed` falsification of `perAddGeometryGate.ts`) was reverted **byte-identical** (sha1 verified).

---

## HEADLINE — the mirror sub-cost probe changed the target. §PERF-MIRROR-BATCH is REDIRECTED.

**Do-this-first per the respawn note, and it settles the whole question: the authoritative
mirror is a PROVABLE NO-OP in the browser, so batch-bracketing it saves ~0 user-felt ms.**

Probe `tools/perf/diagnose-mirror-subcost.mts` (real `WallStore` + real
`wireAuthoritativeElementMirror` + real `storeEventBus`, N=1000, reproduce:
`npx tsx tools/perf/diagnose-mirror-subcost.mts`):

| arm | total | mirror `add()`s performed |
|---|---|---|
| 1 MIRROR-HEADLESS (empty store, mirror does the adds) | 49.0 ms | **1000** |
| 2 MIRROR-BROWSER (§P2.1 pre-added first, as the browser always does) | 2.4 ms | **0** |

The 228 ms → (post-2a) ~44 ms the BASE-INNER harness attributes to
`emit_authoritativeMirrorAdd` is an **artefact of the headless harness**, which never wires the
L7 §P2.1 bridge (`apps/editor/src/engine/initTools.ts:1225`). In the browser the §P2.1 bridge
subscribes to CEB's `wall.created` and calls `legacyWallStore.add()` SYNCHRONOUSLY, strictly
before the mirror's patch listener runs (the mirror's own `WHY IT CANNOT REGRESS THE BROWSER §2
DEDUP` contract, verified from source: `PatchEmitter.listeners` is an insertion-ordered `Set`,
`wireCommandEventBridge` subscribes first, mirror strictly after). So by the time the mirror
iterates the forward patches, every `store.getById(id)` is non-empty → `continue`. **Arm 2
measures ZERO mirror adds — not "fast", zero.**

**Where the browser per-add cost actually goes (the redirect):** §P2.1's own `legacyWallStore.add()`
(store-internal cost **already flattened by fix 2a** — `wallstore-add-scaling.assert.mts` green on
the committed tree: 17.9 ms / growth 1.2× for 1000 disjoint), plus `viewDependencyTracker` +
`bimManager` register per wall, plus the `WallStore.emit()` fan-out (local listeners +
`storeEventBus` + DOM bridge).

**There is NO throughput win left to take here, and the probe proves it** (arms 3/4): wrapping the
1000 adds in `storeEventBus.batch(fn)` did NOT reduce work — 44.6 ms unbatched vs 55.6 ms batched.
`storeEventBus.batch()` BUFFERS then flushes all N deliveries at `endBatch` (`StoreEventBus.ts:148`);
it changes *when* subscribers run, not *how much*. Batching the fan-out is a **jank / longtask**
mitigation (the 5,859-events-in-one-task freeze `BatchCoordinator` was built for), and it is
**already owned** by `BatchCoordinator.endBatchYielded` (200 events/frame). Adding a batch bracket
to `authoritativeElementMirror.ts` — a code path that executes zero `add()`s in the browser — is
pure risk (a new suspend/flush seam around a dead path) with zero benefit. **§PERF-MIRROR-BATCH is
withdrawn, not deferred.** Artifact: `postfix-mirror-subcost.json`.

---

## §PERF-PROJECTLOADER — the traverse half is ALREADY SHIPPED and LIVE (proven).

The diagnosis (rank 3) attributed an O(N²) hydrate leg to `initScene.ts`'s per-`bim-wall-added`
DOUBLE `scene.traverse()` (`collectNewPbrMeshes` + `countMeshes`) running per wall because
"ProjectLoader replays walls with isBatching=false (logged 300×)". **That reading is real but
INCOMPLETE — it omitted the second half of the gate.** `§FIX-LOAD-TRAVERSE-BATCH` (commit
`4d16580c`, **present at the diagnosis's own profile HEAD `c5d0109c`**) added
`apps/editor/src/engine/perAddGeometryGate.ts`, whose `shouldDeferPerAddGeometryPass()` gates the
two traverses on `isBatching || isProjectLoadActive()`. ProjectLoader sets
`globalThis.__pryzmProjectLoadActive = true` for the whole replay (`ProjectLoader.ts:707`) and
clears it in `finally` (`:3172`) BEFORE `pryzm-project-loaded` fires the ONE consolidated pass
(`initScene.ts:3764` → `runTierPbrPass('post-load')`). `isBatching` alone is false during a load;
`isProjectLoadActive()` is the term that engages.

Oracle `tools/perf/projectload-traverse-gate.assert.mts` (reproduce:
`npx tsx tools/perf/projectload-traverse-gate.assert.mts`), N=300:

| arm | adds deferred | undeferred traverses |
|---|---|---|
| LOAD window (flag set, isBatching=false) | 300 / 300 | **0** (want 0) |
| INTERACTIVE (flag clear) | 0 / 300 | **600** (2/add — the per-add pass still runs) |

**Red-first falsification (oracle binds the subject):** `sed` the `isProjectLoadActive()` term out
of the gate → LOAD arm regresses to 600 undeferred traverses, oracle **FAILS RC=1**; restore
**byte-identical** (sha1 `71b39660…` before and after) → oracle **PASSES RC=0**. During a 300-wall
load the gate saves **600 full `scene.traverse()` walks of a growing scene** — the exact O(N²) the
diagnosis feared, already closed. The replay-batching half is likewise already in place
(`ImportProjectCommand` single-dispatch default, `WallStore.beginHydration()` fast path measured at
arm E ~13 ms, load-suppress + autosave-batch windows). **No code change warranted; PROVEN live.**

The residual profiled hydrate cost (988 ms / 300 walls) is therefore NOT the double-traverse —
it is legitimate per-element work the profile itself names: `redetect executeChunked` (279 incl),
wall deep-clone (`cloneWallData` freeze, 85 self), room-label `_makeSprite` (97 self), and the
actual `WallRebuildCoordinator` mesh build. None of that is batchable-away without changing an
observed value (C11/C16), so it is out of a perf lane's charter.

---

## §PERF-WEBIFC-BOOT — precise culprit identified; the fix needs a production build to verify.

web-ifc (3.5 MB) is on the boot graph. **Root cause pinned this lane, and it is NOT a boot-path
value import:** `deleteIfcElement.ts` (the only web-ifc-*adjacent* symbol BimService value-imports
at boot) imports only THREE + event-bus — web-ifc-free. Every boot-path IFC-heavy symbol
(`exportIFC`, `auditIfcWorkflow`) is `import type` (erased). web-ifc reaches boot **solely because
`packages/file-format/src/index.ts` statically RE-EXPORTS** `IfcExporter` / `IfcImporter` /
`IfcGeometryRenderer` / `auditIfcWorkflow` / `IfcConversionCoordinator` (each `import * as WEBIFC
from 'web-ifc'` at module scope), **AND `web-ifc`'s package.json has `sideEffects: undefined`** (not
`false`) — so Rollup cannot prove the unused IFC modules are inert and keeps the whole chain.

The correct fix is a barrel change: move the IFC-heavy exports behind a lazily-imported subpath
(`@pryzm/file-format/ifc`, dynamic-`import()` behind first-IFC-use), OR give `file-format` a precise
`sideEffects` allowlist that lets Rollup drop the IFC re-export chain. **Both are high-blast-radius
(the barrel is imported by ~9 apps/editor + plugin consumers) and — decisively — neither can be
ACCEPTED without a production `npm run build` + bundle analysis** to confirm web-ifc actually left
the boot chunk. Running that against a live multi-wave tree from inside this lane would misattribute
any failure (the prior lane's stated reason for holding it, which stands). **Recommended acceptance
for the orchestrator/render wave: a static import-reachability scan from the editor boot entry
asserting `web-ifc` is no longer statically reachable, then a build + boot re-profile.** Est. saving
200–400 ms parse + memory. **Stays PLANNED — culprit now exact, fix specified.**

## §PERF-SHADER — PLANNED (needs the owed probe first; renderer held).

~1.2 s at 300 walls (`_completeCompile` 418 self + program ctor 363 self). The direct probe the
diagnosis owed — `renderer.info.programs.length` vs element count, to confirm the per-element-unique-
material instancing defeat — is unrun, and `packages/renderer/SceneBootstrap.ts` is the render
wave's. Optimising before the program-count probe would be guessing. **Stays PLANNED, owner: render
wave, probe-first.**

---

## Correctness riders — root causes pinned; NEITHER is a contained fix. Documented, not applied.

- **L-12895 (door-vocab refusal).** The generator's `door.batch.create` refuses because of a
  **two-registry vocabulary split**, not a one-line default: `packages/ai-host/.../defaultElementTypes.ts`
  emits `dt-solid-timber` / `dt-white-primed` / `dt-glazed-timber` / `dt-modern-entrance-glazed`,
  while `plugins/door/src/handlers/CreateDoorBatch.ts:81` validates `getDoorType(systemTypeId)`
  against a registry that does not carry the `dt-*` ids — `packages/types-builtin/src/door/index.ts`
  uses a DIFFERENT vocabulary (`DEFAULT_DOOR_TYPE_ID = 'door.interior.single.standard'`), while
  `packages/geometry-door/src/DoorSystemTypeStore.ts` DOES carry `dt-solid-timber`. Reconciling
  which registry is authoritative (the `resolveCatalogueRef` ladder, ADR-0314) is a real
  architectural change with wide door-creation blast radius — a correctness lane's job, exactly as
  `fixes.md §Refused` judged. **Not applied on a shared tree.**

- **L-12894 (composition-root undo no-op).** `runtime.undoStack.undo()` (Phase-D slot,
  `composeRuntime` `buildPhaseDUndoStackSlot`) pops the cursor but applies nothing to element stores:
  `bus.fetchStores` returns the `storesAsRecordView` DTO snapshot (plain objects, no `applyPatch`),
  and `applyRingBufferSide` refuses (C03 §4.7 B1). Production Ctrl+Z already uses L7
  `performUndoRedo` (works), but `packages/runtime-undo-stack/src/UndoStack.ts` still advertises the
  broken surface to Phase-C panels. The honest fix (make the slot refuse LOUDLY, or make
  `fetchStores` `applyPatch`-capable) is a **behaviour change** in C03 §4.6/4.7 ownership territory,
  needing panel-caller verification — not a perf-lane change. **Documented; deferred to a
  correctness lane.**

---

## The warm/cold question — NAMED.

"Warm NOT faster than cold" is not unexplained: **boot is CPU-bound, and the Service Worker only
accelerates the network, not the CPU.** BASE-OUTER measured cold shell DCL 3.46 s vs warm 0.78 s
(SW serves 32/36 assets warm) — yet warm *interactive* did not improve. The interactive budget is
dominated by JS parse/compile of ~25 MB on the boot path (`(program)` 5.8 s self) + engine boot
orchestration + shader/program compile (~1.2 s) + the hydrate leg — all of which the browser
**re-parses, re-compiles and re-executes on every load** regardless of whether the bytes came from
SW cache or the WAN. The SW removes the WAN fetch (shell); it removes none of the CPU. So warm ≈
cold at the interactive mark is the *expected* signature of a CPU-bound boot, and it is why the
ranked wins are all CPU reducers (defer DOM build, memoise theme CSS, defer viewpoint snapshot,
take web-ifc off the parse graph) rather than caching.

---

## Acceptance

- **Harness deltas measured + written to postfix JSON**: `postfix-mirror-subcost.json` (mirror
  decision, arms 1–4). The pre-existing `postfix-inner.json` (fixes 1/2a/4/5/6) is the current
  committed-tree state; this lane added no perf source change to re-baseline (the mirror fix was
  WITHDRAWN by the probe, not applied). Baselines `baseline-inner.json` / `baseline-outer.json`
  untouched (never ran the baseline-rewriting inner vitest config).
- **Behavioural proofs**: mirror no-op invariant (arm 2 = 0 adds, run-stable); traverse-gate oracle
  green + red-first falsification with byte-identical restore; fix 2a scaling assert green on the
  committed tree.
- **Touched-package suites**: this lane touched no package source (two standalone `tools/perf`
  probes + audit docs). The perf asserts it added/ran are green (RC=0).
- **Root tsc @6144MB** (`NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit --skipLibCheck`):
  RC=2 with **10 errors — ALL attributable to concurrent waves, NONE to this lane** (verified by
  file). This lane's two probe files produce **zero** errors in the whole-repo tsc. The 10 errors
  landed in the working tree *during* the tsc run (the tree gained `M` site-parcel-data +
  component-editor changes mid-run): 6 in `countryAdapters/ro/index.ts` (UNTRACKED), 3 in
  `parcelProviders/registry.ts` (TS6192 unused-import, wave-modified), 1 in
  `component-type-catalog/ComponentTypeCatalog.ts` (UNTRACKED) — **all inside this lane's HARD-RULE
  untouched set** (countryAdapters + component-editor U3/U4/U6). This is precisely the
  "tsc against a half-landed concurrent tree misattributes failure" hazard; at the committed HEAD
  `dc942d01` + this lane's two untracked probes, tsc is clean. Not fixed (other waves' code; `git
  stash` is forbidden on the shared worktree stack).
- **Byte-identical-restore falsification on the biggest change**: the only source-file mutation was
  the `perAddGeometryGate.ts` falsification, reverted byte-identical (sha1 verified) — see
  §PERF-PROJECTLOADER.

## What stays PLANNED (with owners)

- §PERF-WEBIFC-BOOT — culprit exact (barrel re-export + web-ifc `sideEffects: undefined`); barrel
  lazy-subpath or `sideEffects` allowlist; **needs `npm run build` + bundle/reachability acceptance**
  on a buildable tree. Owner: orchestrator / file-format.
- §PERF-SHADER — program-count probe FIRST, then shared-material/program cache. Owner: render wave
  (`packages/renderer` held).
- L-12895 door vocab, L-12894 undo no-op — correctness lane (both change behaviour).
- §PERF-MIRROR-BATCH — **WITHDRAWN** (no-op in browser), not merely deferred.
