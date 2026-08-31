# LANE B RESULT — 9 command classes into command-registry (F-P5-04 inversion) — 2026-08-31

**Status: COMPLETE, verified green, NOT committed** (per brief). Working tree at HEAD `79ca9756`.
Scout plan executed: `audit/full-stack/2026-08-31/_p5/annotations-inversion-scout.md` §3.1b/c + §5 LANE B.

## ⚠ FIRST — this lane found PARTIAL LANE B work already in the tree

At session start, 5 of the 10 command-registry annotation files (CreateAnnotation, CreateMany,
Delete, Lock, UpdateAnnotation) already carried moved class bodies WITH spans, and `types.ts`'s six
repoints were done — uncommitted working-tree state from an earlier cut-off lane run. This session
completed the remainder; the whole set below is ONE coherent LANE B change set to commit together.

## What changed

1. **4 remaining class bodies moved** into `packages/command-registry/src/annotations/`
   (replacing the same-path re-export shims): CreateCalloutDetailCommand (+`CreateCalloutDetailParams`),
   CreateSectionMarkCommand (+`CreateSectionMarkParams`), CreateElevationMarkCommand
   (+`CreateElevationMarkParams`), UpdateConstraintCommand. Protocol adopted: `../types`
   (`type: CommandType`; the 8 enum values verified string-identical). Subsystem symbols
   (`makeAnnotationElement`, `ConstraintRecord`, `viewDefinitionStore`, `viewIntentInstanceStore`,
   `ViewSpatialContext`, `ViewSectionVolume`) from `@pryzm/core-app-model` (Lane A's landing).
2. **`pointInPolygonXZ` repointed to `@pryzm/geometry-kernel`** (existing dep, §C73-PIP-CANONICAL
   definition site) in CreateElevationMarkCommand — NOT plugin-sdk, which would have minted a new
   upward L2→L5 import.
3. **P8 spans**: each of the 9 moved `execute()`s wraps in
   `_tracer().startActiveSpan('pryzm.annotation.…', …)` with `span.end()` on every return path and
   `recordException` on throw — the sibling idiom (UpdateAnnotationCommand / UpdateDoorSystemTypeCommand).
4. **Repoints**: `AnnotateViewCommand.ts:18-19`, `project/ClearProjectCommand.ts:37`, and
   `__tests__/GridDeleteSweepsBubbleAnnotations.test.ts:46` → `@pryzm/core-app-model`.
   `grep -rn "@pryzm/plugin-annotations" packages/command-registry` → **ZERO hits**.
5. **`global-window-augment.d.ts`**: +3 optional fields (`constraintStore`, `constraintSolver`,
   `vgGovernanceStore`) — the moved bodies' window fallbacks; NOT `(window as any)` casts
   (cast-gate-neutral by pattern).
6. **plugin-sdk** (`src/index.ts`, end of file): new §7B2-LANE-B block re-exports the 9 classes +
   4 param types from `@pryzm/command-registry` (L5→L2 downward; zero name collisions at the SDK
   barrel, verified). Cycle-checked: zero real `@pryzm/plugin-sdk` imports anywhere in
   command-registry / core-app-model / persistence-client / ai-host sources.
7. **9 same-path shims** in `plugins/annotations/src/commands/` re-export via `@pryzm/plugin-sdk` —
   all in-plugin relative imports, the plugin barrel (`index.ts:207-222`), and external consumers
   work untouched. `UpdateAnnotationPresentationCommand.ts` (not one of the 9) stays verbatim.
8. **`legacy-command-protocol.ts`**: compat note added — canonical protocol is command-registry's
   `types.ts`; the copy stays only for its 2 remaining importers
   (UpdateAnnotationPresentationCommand, the barrel's public `CommandType` re-export).

## Manifest edits (⚠ orchestrator: sync `pnpm-lock.yaml` in the same commit — frozen-lockfile)

- `packages/command-registry/package.json`: **−** dep `@pryzm/plugin-annotations` (zero remaining
  imports — the cycle-half this lane owned is collapsed).
- `packages/plugin-sdk/package.json`: **+** dep `@pryzm/command-registry` (`workspace:*`).

## Proof (all foreground, this tree)

- **Root tsc**: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json` → **RC=0**
  (captured directly, no pipe).
- **Layer gate**: RC=0, `violations 48/102, unclassified 13/13, sdk-bypass 156/182` — whole-tree
  figure (sibling lanes C/D/S1/S2 also in this tree); 48 is EXACTLY the scout §6 predicted
  post-landing number. This lane's share: all 22 command-registry statements gone, zero new upward
  edges. No ceiling raised, no gate-debt entry.
- **check-otel-spans BEFORE**: RC=0, Zone B `52 uninstrumented of 87` (baseline 52 — zero headroom).
  **AFTER**: RC=0, Zone B `52 of 87` — **did NOT grow**. Zone A 274/274.
- **Suites**: `GridDeleteSweepsBubbleAnnotations.test.ts` alone → **6/6 PASS** (real moved
  AnnotationStore + makeAnnotationElement from cam). `pnpm --filter @pryzm/plugin-annotations test`
  → **10 files / 125 tests PASS** — run AFTER the shims landed, so the shim → SDK →
  command-registry ESM chain is runtime-executed, not just typechecked.
- **Rival-singleton**: `grep -rln "^export class <C>"` for each of the 9 → **exactly 1 definition
  each** (command-registry); the plugin bodies are gone behind shims.

## Falsification control — the brief's falsifier CANNOT move this gate, and here is why

- **As briefed** (remove one span): token-stripped `startActiveSpan(` from
  CreateSectionMarkCommand.ts → gate reading **DID NOT MOVE** (RC=0, 52/87). Root cause read from
  the gate source: Zone B participation is `EXPORTED_FN_RE` — a top-level exported **function/arrow
  const**. The moved files export **classes**; they are outside Zone B's participating population
  span or no span. Restored byte-exactly (sha1 verified identical).
- **Working control** (proves the gate watches my directory): planted a spanless
  `export function` in `packages/command-registry/src/annotations/__falsifier_tmp.ts` →
  **RC=3**, `53 uninstrumented of 88 … FAIL (Zone B): 1 NEW uninstrumented exported function
  file(s)`. Deleted it → **RC=0, 52/87**. The gate can move, moves for the right reason, and
  reports my landed set as non-regressing from measurement, not blind spot.
- Implication for the scout's risk 2: "moving them in uninstrumented would push Zone B further
  over" was wrong in MECHANISM for class-only files — but the spans are still the P8 obligation
  discharged (Zone C census counts them, and any future exported helper in these files
  participates instantly). Spans kept.

## Pre-existing failures reported, NOT absorbed

`pnpm --filter @pryzm/command-registry test` → **12 failed / 1193 passed**. All 12 are WALL-family
(§WALL-RAKE pre-flight, addWallLayerBatch, createWindowsParametricBatch, L926/L936 move,
updateWallsSystemTypeBatch) — zero annotation tests. Attribution:
`git diff --name-only HEAD` over the entire failing execution chain (the 6 test files,
`src/generic/**`, `src/refusal/**`, geometry-wall/door/window, event-bus, vitest config) →
**byte-identical to HEAD `79ca9756`**; the only lane-modified file under `__tests__/` is the Grid
test, which PASSES. The failures are pre-existing at HEAD (rake `canExecute` returns ok where the
tests demand refusal) — a sibling/earlier regression, not this lane's. Left for the orchestrator;
no test was skipped, no baseline touched.

## For the orchestrator

- Commit this lane's file set (git status: command-registry 15 files + plugin-sdk 2 + plugins/annotations 10)
  WITH the pnpm-lock sync for the two manifest edits above.
- `packages/command-registry/tsconfig.tsbuildinfo` was already M at session start (stale build
  artifact) — not part of this change set.
- The 12 pre-existing wall failures at HEAD deserve an ISSUE-LOG row if they don't have one.
