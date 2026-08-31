# LANE C RESULT — consumer repoints, annotations (F-P5-04) — 2026-08-31

**Status: COMPLETE, verified green, NOT committed** (per brief). HEAD `79ca9756` (LANE A landed).
Scout plan executed: `audit/full-stack/2026-08-31/_p5/annotations-inversion-scout.md` §4 + §5 LANE C,
plus `command-registry/src/types.ts` ×6 (§3.1c) per the orchestrator's lane brief.

## ⚠ FIRST — shared-tree state on arrival

When this lane started, MOST of its file list was ALREADY EDITED (uncommitted) in the shared
working tree: `types.ts` ×6, `ProjectLoader.ts` (:68 static + :1427/:1430/:1439 dynamic +
:1452 → `obcAnnotationIdMap`), `ProjectSerializer.ts` (:78/:80/:81 + :82 → `obcAnnotationIdMap`,
call site :967), `RoofSlopeSymbolBuilder.ts` (:40,:41), `RoomTagAutoPopulator.ts` (:25,:26), and
`geometry-roof/package.json` (− `@pryzm/plugin-annotations`). Author unknown to this lane — the
tree also carries LANE B/D/S1/S2 edits (command-registry/annotations, input-host, structural moves).
Every pre-applied edit was DIFF-VERIFIED against the scout plan line-by-line — all exact.
This lane COMPLETED the remainder (nothing else had touched it):

1. `packages/file-format/src/export/sheets/AnnotationDxfBridge.ts:3,4` → `@pryzm/core-app-model` (2 stmts)
2. `packages/file-format/src/export/sheets/SVGCompositeRenderer.ts:27` → `@pryzm/core-app-model` (1 stmt, type-only)
3. `packages/file-format/src/export/sheets/ViewportSvgComposer.ts:55,56` → `@pryzm/core-app-model` (2 stmts)
   (this file showed `M` in status but was CONTENT-IDENTICAL to HEAD — mtime/CRLF touch only)
4. `packages/file-format/package.json`: **− dep `@pryzm/plugin-annotations`** (zero imports remain
   package-wide, measured). `@pryzm/core-app-model` already present.

ProjectLoader dynamic imports STAY dynamic — only specifiers changed (scout risk 7 honored).

## Manifest edits (⚠ orchestrator: sync `pnpm-lock.yaml` in the same commit)

- BY THIS LANE: `packages/file-format/package.json` − `@pryzm/plugin-annotations`.
- PRE-EXISTING UNCOMMITTED (sibling): `packages/geometry-roof/package.json` − `@pryzm/plugin-annotations`;
  plus sibling-lane manifests (geometry-beam, geometry-column, input-host, plugin-sdk) also modified in tree.
- `persistence-client` + `room-topology`: NO manifest change needed (cam dep present; neither ever
  declared plugin-annotations).

## Proof (all foreground, this tree)

- **Zero plugin-annotations imports in lane scope**:
  `grep -rn "@pryzm/plugin-annotations" packages/file-format/src packages/persistence-client/src
  packages/geometry-roof/src packages/room-topology/src packages/command-registry/src/types.ts` → **0 hits** (RC=1).
  Package-wide incl. tests + json: only remaining hit was the file-format manifest dep, now dropped.
- **Falsification control**: planted `import type { AnnotationElement as __Planted } from
  '@pryzm/plugin-annotations'` into SVGCompositeRenderer.ts → grep fired (1 hit, RC=0); removed →
  silence (RC=1), file tail byte-identical. The verifying grep can fire.
- **Root tsc**: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json` → **RC=0**
  (captured directly, not through a pipe).
- **Layer gate**: `npx tsx tools/ga-gate/check-layer-boundaries.ts` → **RC=0**,
  `violations 56/102, unclassified 13/13, sdk-bypass 164/182`, banned-3p **86 FLAT**.
  ⚠ The 56 is the SHARED-TREE reading (all lanes' uncommitted edits) — remaining
  plugin-annotations rows in the gate sample are LANE B files (command-registry/src/annotations/*,
  ClearProjectCommand), not this lane's. No ceiling raised, no gate-debt entry.
- **Suites**: persistence-client **30 files / 287 tests PASS** · geometry-roof **16/190 PASS** ·
  room-topology **43/384 PASS** · file-format **25 of 26 files PASS, 250/250 tests pass** — the 1
  failing file is PRE-EXISTING, see below.
- **Id-map round-trip** (temp vitest, deleted after run — repo pattern "execute the store half,
  source-pin the wiring half"): `obcAnnotationIdMap` set→serialize → exact `{version:1, entries}`
  shape; clear→deserialize→get round-trips; source-pin asserts ProjectSerializer contains
  `obcAnnotationMap: … obcAnnotationIdMap.serialize()` and ProjectLoader contains
  `obcAnnotationIdMap.deserialize(obcSlice)`, and NEITHER contains `obcAnnotationAdapter`.
  **2/2 PASS.** Disk shape unchanged.

## Pre-existing failure reported, NOT absorbed, NOT this lane's

`packages/file-format/__tests__/family-round-trip.test.ts` fails at SUITE LOAD:
`ReferenceError: DOMMatrix is not defined` from `pdfjs-dist@5.7.284` canvas.js via
`src/import/PDFToImageConverter.ts:17` (Node vitest env lacks the browser global).
**Proven pre-existing by revert-and-rerun**: with ALL four of this lane's file-format edits
restored to HEAD content, the same suite fails identically (RC=1, same error). Unrelated to
annotations (PDF import path). Candidate ISSUE-LOG row for the orchestrator.

## Notes for the orchestrator

- `types.ts` appears in LANE B's §5 file list but its ×6 repoint was assigned to (and verified by)
  this lane per the lane brief — coordinate so LANE B does not re-edit it.
- LANE C's commit scope: the 3 file-format sheet files + file-format/package.json (+ the
  pre-applied 5 files above if the orchestrator attributes them to this lane) + lockfile sync.
