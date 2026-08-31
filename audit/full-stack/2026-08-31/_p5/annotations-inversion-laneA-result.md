# LANE A RESULT — annotation subsystem move (F-P5-04 inversion) — 2026-08-31

**Status: COMPLETE, verified green, NOT committed** (per brief). Working tree at HEAD `69d71c81`.
Scout plan executed: `audit/full-stack/2026-08-31/_p5/annotations-inversion-scout.md` §3.1a/e/f + §5 LANE A.

## ⚠ FIRST — a shared-tree event the orchestrator must know

The orchestrator's docs commit **`69d71c81`** (22:48:53, "four parked decisions…ADR-0375")
**swept up this lane's staged `git mv` renames mid-session** — its stat block shows the nine
`plugins/annotations/src/subsystem/*.ts → packages/core-app-model/src/annotations/*.ts` renames
(0 content change). So the RENAME half of LANE A is already in history under a docs commit;
**everything else is uncommitted working-tree state**: content edits show as `M` against the moved
paths, and the 9 plugin shims + `ObcAnnotationIdMap.ts` are untracked `??`. This is the
`multi-agent-shared-tree-collisions` shape — commit the remainder as the scoped LANE A code commit.

## What changed

1. **9-file cluster moved** (git mv, verbatim) → `packages/core-app-model/src/annotations/`:
   AnnotationReference, AnnotationTypes, AnnotationParametersSchema, AnnotationStore,
   AnnotationVisibilityStore, ConstraintStore, ConstraintSolver, AnnotationDependencyGraph,
   DimensionFormatter. Their `@pryzm/core-app-model` imports are now RELATIVE deep imports
   (`../StoreEventBus.js`, `../persistence/ProjectScopeRegistry.js`) — never the own barrel (SCC rule).
2. **OBCAnnotationAdapter SPLIT, not moved**: new `packages/core-app-model/src/annotations/ObcAnnotationIdMap.ts`
   (class + `obcAnnotationIdMap` singleton; `set/get/delete/clear/serialize/deserialize`; disk shape
   unchanged `{version:1, entries}`). The plugin adapter keeps ALL `@thatopen/components` machinery
   and delegates every map op to the singleton via `@pryzm/plugin-sdk`. banned-3p stays flat by design.
3. **Surface**: `packages/core-app-model/src/annotations/index.ts` re-exports the cluster + id map;
   root barrel already `export *`s it (`src/index.ts:565`) — collision-checked clean, so LANE B/C/D
   consumers can `import { … } from '@pryzm/core-app-model'`. New exports-map subpath
   `"./annotations"` added to cam `package.json`.
4. **plugin-sdk** (`src/index.ts`, end of file): re-exports the whole subsystem surface from
   `@pryzm/core-app-model/annotations` (deep subpath, same reasoning as `store-registry`).
   **The two planned aliases**: `AnnotationStore as AnnotationSubsystemStore`,
   `formatDimension as formatAnnotationDimension` (bare names at the SDK barrel were already the
   @pryzm/stores Zustand class and geometry-kernel's formatter). Also exports
   `ObcAnnotationIdMap` / `obcAnnotationIdMap`.
5. **9 same-path shims** in `plugins/annotations/src/subsystem/` re-export from `@pryzm/plugin-sdk`,
   re-aliasing back (`AnnotationSubsystemStore as AnnotationStore`,
   `formatAnnotationDimension as formatDimension`) — **no consumer anywhere sees a rename**; all 45
   in-plugin relative imports, the plugin barrel, and the `./subsystem` exports-map entry work untouched.
6. **cam consumers repointed relative**: `views/PlanViewCanvas.ts:4`,
   `views/PlanViewAnnotationRenderer.ts:22-29` (3 stmts), and the two tests
   (`tagPaperScale.test.ts`, `tagProjection.test.ts`).
7. **C101-ELEMENT-ANNOTATION updated in place** (same change set, risk 1): rows at :60/:62, the
   AS-IS store table row, THE AUTHORITY heading, A-ST-1 — new
   `packages/core-app-model/src/annotations/…` paths, and drifted line anchors corrected to measured
   (`AnnotationStore.ts:86`, singleton `:440`; `DimensionElement` `:216`).

## Risk-9 check (deep subpath imports) — CLEAN

`grep -rn "plugin-annotations/" apps plugins` → 2 hits: `@pryzm/plugin-annotations/handlers`
(handlers stay in the plugin; unaffected) and one comment. No `subsystem` deep import exists
outside the plugin; the shims cover the `./subsystem` exports-map path anyway.

## Manifest edits (⚠ orchestrator: sync `pnpm-lock.yaml` in the same commit — frozen-lockfile)

- `packages/core-app-model/package.json`: **+** exports `"./annotations"`; **−** dep
  `@pryzm/plugin-annotations` (zero remaining imports measured — the package cycle is collapsed).
- `packages/persistence-client/package.json`: **+** dep `@pryzm/core-app-model` (pre-existing
  L-809 gap the plan names; LANE C relies on it).
- `packages/plugin-sdk/package.json`: NO edit needed (already had `@pryzm/core-app-model`).

## Proof (all foreground, this tree)

- **Root tsc**: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json` → **RC=0**.
- **Layer gate before** (this session, pre-move): RC=0,
  `violations 102/102, unclassified 13/13, sdk-bypass 171/182`, banned-3p **86**.
- **Layer gate after**: RC=0, `violations 98/102, unclassified 13/13, sdk-bypass 165/182`,
  banned-3p **86 (FLAT)**. Drop = exactly the 4 cam rows this lane covers (scout §1a rows 23–26);
  sdk-bypass −6 = the moved-out bypass statements. No ceiling raised, no gate-debt entry.
- **Suites**: `pnpm --filter @pryzm/core-app-model test` → **151 files / 1710 tests PASS**;
  `pnpm --filter @pryzm/plugin-annotations test` → **10 files / 125 tests PASS** (these tests import
  through the shims — the shim → SDK → cam ESM chain is runtime-executed, not just typechecked).
  The two repointed cam tests also run directly: **2 files / 22 tests PASS**.
- **Id-map split executed proof**: temporary vitest file (deleted after run) — set via
  `obcAnnotationIdMap`, read via `obcAnnotationAdapter.serialize()` → identical
  `{version:1, entries}`; `deserialize` round-trips into the singleton. **1/1 PASS.**
- **Singleton**: `grep -rn "new AnnotationStore()" plugins packages` (tests excluded) → **exactly 1**:
  `packages/core-app-model/src/annotations/AnnotationStore.ts:440`. The L3 Zustand rival
  (`apps/editor/src/PluginRegistry.ts:779`, class from `@pryzm/stores` — import at `:49`) is a
  different class and stays.
- **Falsification control**: planted a full COPY of the moved AnnotationStore.ts at the old plugin
  path → grep fired with **2** production hits; restored the shim → **1** hit. Control passes both
  directions.
- **Contract gates**: `check-contract-index-equivalence` → **RC=0** (no contract minted).
  `check-contract-cited-paths` → **RC=3, 507 unresolved vs declared 490 — PRE-EXISTING/SIBLING,
  NOT THIS LANE**: zero C101 rows in the unresolved output (this lane's only contracts/ edit), and
  visible rows are C43-ACCESSIBILITY citing paths that today's sibling deletions (e.g. `b7d8c459`,
  17 rival tools deleted) plausibly removed. Reported, not absorbed — no baseline touched.

## For the downstream lanes

- LANE B/C/D: import the subsystem from `@pryzm/core-app-model` (root barrel) — all names are
  surfaced there under their ORIGINAL names (`AnnotationStore`, `formatDimension`, etc.; the
  aliases exist only at the SDK barrel).
- LANE C: `ProjectLoader:1452` / `ProjectSerializer:82` repoint to `obcAnnotationIdMap`
  (`@pryzm/core-app-model`); serialize shape is unchanged on disk.
- LANE B: plugin tests import `../src/commands/*.js` relatively — keep same-path shims there too.
- The scout's §6 expected-delta arithmetic is confirmed exactly for this lane's share.
