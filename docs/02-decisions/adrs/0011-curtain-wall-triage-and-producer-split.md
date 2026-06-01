# ADR-011 — Curtain-wall handler triage (15 → 9) + producer split

* **Status:** Accepted
* **Sprint:** S12 (`phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S12-T3, lines 1368–1371)
* **Date:** 2026-04-27
* **Supersedes:** —
* **Superseded by:** —

## Context

Curtain wall is, by some margin, the most complex element family in
PRYZM 1.  `src/elements/curtainwalls/CurtainWallBuilder.ts` is the
1,247-LOC heart of it, and it both **owns** the geometry pipeline
(panel grid → mullion grid → transom grid → mesh assembly) and
**mutates** the underlying DTO via 15 distinct command classes under
`src/commands/curtainwalls/`.  The two responsibilities are tangled —
several commands call `Builder.recompute()` directly to rebuild
geometry inside the command's `execute` body.

Two problems with carrying that pattern into PRYZM 2:

1. **Producer monolith.**  A single 1,247-LOC `produceCurtainWall`
   function would be the largest producer in the kernel by ~3×.  It
   would also conflate three independent geometry concerns
   (translucent panels, opaque mullions, opaque transoms) into a
   single hash input — invalidating panel-only edits would needlessly
   rebuild the mullion grid.

2. **Handler bloat.**  15 command classes for one element family is
   3.7× the wall surface (which itself ships 14 handlers per ADR-008
   only after wave 3 lands in S10).  Several of the 15 are micro-
   commands that exist only because PRYZM 1's command dispatch is
   non-parametric — `SetCurtainWallHeightCommand`,
   `SetCurtainWallLengthCommand`, and `ResizeCurtainWallCommand` all
   patch the same `(baseLine, height)` pair.

This ADR records the **exact** 15 → 9 handler triage AND the
**three-way producer split** that the S12 implementation ships.

## Decision A — Handler triage (15 → 9)

The PRYZM 2 curtain-wall plugin ships **9 handlers** total in a
single S12 wave:

| # | PRYZM 2 handler                  | PRYZM 1 commands collapsed                                                                    | LOC ratio (1 → 2) |
|---|----------------------------------|------------------------------------------------------------------------------------------------|--------------------|
| 1 | `curtainwall.create`             | `CreateCurtainWallCommand`                                                                     | 416 → ~120         |
| 2 | `curtainwall.delete`             | `DeleteElementCommand` (CW slice)                                                              | 783 → ~70          |
| 3 | `curtainwall.move`               | `TranslateElementCommand` (CW slice)                                                           | 91 → ~85           |
| 4 | `curtainwall.setGrid`            | `SetCurtainWallBayWidthCommand` + `SetCurtainWallBayHeightCommand` + `SetCurtainWallGridCommand`| 71 + 71 + 142 → ~110|
| 5 | `curtainwall.setMullionType`     | `SetCurtainWallMullionTypeCommand` + `SetCurtainWallMullionThicknessCommand`                   | 96 + 73 → ~95      |
| 6 | `curtainwall.setTransomType`     | `SetCurtainWallTransomTypeCommand`                                                             | 88 → ~95           |
| 7 | `curtainwall.setPanelType`       | `SetCurtainWallPanelKindCommand` + `SetCurtainWallPanelMaterialCommand`                        | 102 + 78 → ~125    |
| 8 | `curtainwall.setOutline`         | `SetCurtainWallBaselineCommand` + `SetCurtainWallHeightCommand`                                | 187 + 73 → ~110    |
| 9 | `curtainwall.resize`             | `ResizeCurtainWallCommand` + `SetCurtainWallLengthCommand`                                     | 112 + 81 → ~110    |

LOC ratio is the headline win: **2,464 → ~920** (≈ 2.7× reduction).

### Dropped from PRYZM 2 (6 commands, 15 − 9 = 6)

| PRYZM 1 command                                  | Reason for drop                                                                                                                                                                                                |
|--------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `RecomputeCurtainWallGridCommand`                | Grid is derived state recomputed by the L4 producer on demand — no command needed.                                                                                                                              |
| `RebuildCurtainWallGeometryCommand`              | Same — geometry is committer state, recomputed by `bindStore` dispatcher on every patch flush.                                                                                                                  |
| `LockCurtainWallCommand`                         | Lock state moves to the SelectionStore + a project-wide `locked` set (S16), per ADR-008's wall precedent.                                                                                                       |
| `MigrateCurtainWallSchemaCommand`                | One-shot import-time migration, not a runtime command.                                                                                                                                                          |
| `SetCurtainWallVisibilityCommand`                | View-state concern — moves to V-state store in S17.                                                                                                                                                             |
| `SetCurtainWallProfileCommand`                   | Profile system did not survive PRYZM 1.                                                                                                                                                                          |

## Decision B — Producer split (3 sub-producers + orchestrator)

`packages/geometry-kernel/src/producers/curtainwall.ts` is split into
**4 files** under `src/producers/_internal/curtain-wall/`:

| File                                              | Responsibility                                                                                       | LOC budget |
|---------------------------------------------------|-------------------------------------------------------------------------------------------------------|------------|
| `_internal/curtain-wall/buildPanels.ts`           | Per-cell panel geometry (glazed, spandrel, door, opaque).  Owns the panel kind → material slot map.   | ≤ 220      |
| `_internal/curtain-wall/buildMullions.ts`         | Vertical mullions — extruded from `mullionThickness × bayHeightSpan`.                                | ≤ 180      |
| `_internal/curtain-wall/buildTransoms.ts`         | Horizontal transoms — extruded from `mullionThickness × bayWidthSpan`.  Stub-shares thickness with mullions until the schema separates them in 1C. | ≤ 180      |
| `producers/curtainwall.ts` (orchestrator)         | Calls all three, concatenates the per-slot vertex/index/uv arrays, computes the combined geometry hash, returns a single `BufferGeometryDescriptor` with `materialKeys[]` partitioned by slot. | ≤ 250 |

### Why split

* **Independent invalidation.**  A panel-kind change (`setPanelType`)
  rebuilds only the panel sub-producer's hash component; the
  mullion/transom hashes are byte-for-byte stable, so the committer's
  `descriptorHash === entry.descriptorHash` skip fires for two of the
  three slots.  Measured on the S12 medium fixture this turns a
  panel-edit rebuild from ~9 ms → ~2.5 ms (one slot vs three).
* **Independent unit testability.**  Each sub-producer is a pure
  `(input → vertex/index/uv arrays)` function with a single-purpose
  fixture.  Unit tests under `packages/geometry-kernel/__tests__/
  curtain-wall/{panels,mullions,transoms}.test.ts` cover each in
  isolation; the orchestrator's tests cover composition + hash.
* **Material-slot partitioning.**  The committer's `materialKeys[]`
  carry a `|<slot>` suffix (`mullion`, `transom`, `glazed`,
  `spandrel`, `door`, `opaque`).  The slot is the join key between
  the producer's `groups[]` and the material-bridge's slot-aware
  factory (translucent for `glazed`, anodised aluminium for
  `mullion`/`transom`, opaque PBR for the rest).
* **Future extension.**  When 1C lands separate transom thickness
  + door panel sub-types, only the affected sub-producer needs
  editing; the orchestrator + the other two stay byte-for-byte.

### Hash composition

The combined geometry hash is:

```
H = sha256(
    "cw" |
    H(panels)    |  // sha256 of buildPanels' input slice
    H(mullions)  |  // sha256 of buildMullions' input slice
    H(transoms)  |  // sha256 of buildTransoms' input slice
    "@" | worldY
  )
```

This satisfies ADR-009 §"Pure-function signature" (single hash per
descriptor) while making the per-slot hashes available to the
producer's internal skip logic.  When two of the three sub-producers
short-circuit (their input slice is byte-equal to the previous call's),
the orchestrator still produces a fresh combined `H` — that's expected;
the committer's `descriptorHash` skip is keyed on `H`, and `H` is by
construction stable iff all three slot inputs are stable.

## Deviations from PRYZM 1 (called out in handler JSDoc)

These are intentional contract changes from the PRYZM 1 commands;
each is documented in the corresponding handler's JSDoc.

### A. ULID id minting

PRYZM 1's `CreateCurtainWallCommand` uses `crypto.randomUUID()`.  The
PRYZM 2 handler calls `createId('curtainwall')` per the typed-id
brand contract (ADR-001).

### B. Transom thickness is currently a stub on `mullionThickness`

The S12 schema does not separate transom thickness from mullion
thickness — both share the `mullionThickness` field.
`curtainwall.setTransomType` therefore writes through to
`mullionThickness` for now.  When the schema lands a dedicated
`transomThickness` in 1C, the handler is updated in place and the
payload contract does NOT break (callers already address the field
indirectly through `setTransomType`).

### C. `setPanelType` upserts when `upsertAt` is provided

PRYZM 1's `SetCurtainWallPanelKindCommand` raised `PanelNotFoundError`
when the panel id was unknown.  The PRYZM 2 handler raises the same
error UNLESS the caller supplies `upsertAt: { row, col }`, in which
case the panel is **created** at the given grid coordinates with the
requested kind/material.  This collapses the
`AddCurtainWallPanelCommand` + `SetCurtainWallPanelKindCommand` flow
into one round-trip from the FRP layer.

### D. `setOutline` vs `resize` are kept distinct

`setOutline` accepts a fully new `(baseLine, height)` pair; `resize`
keeps `baseLine[0]` + direction fixed and scales the length only.
This is the same distinction PRYZM 1's `SetCurtainWallBaselineCommand`
vs `ResizeCurtainWallCommand` made — but PRYZM 2 expresses both as
optional-fields payloads on the same handler shape, so the FRP layer
can pick whichever maps better to the user's gesture (drag-to-resize
→ `resize`, type-coords-into-property-panel → `setOutline`).

### E. `affectedStores: ['curtainwall']`

Same rationale as ADR-008 §D for walls and ADR-010 §C for slabs.
Re-declared once `produceWithPatchesPerStore` lands in 1C.

### F. No DOM error event dispatch

PRYZM 1's `CurtainWallSystemError` constructor dispatches a DOM
`CustomEvent`.  The PRYZM 2 hierarchy
(`plugins/curtain-wall/src/errors.ts`) does **not** — error fan-out
belongs to the L7 presentation layer per ADR-002 §3.

## Consequences

* The 9-handler curtain-wall plugin ships behind kill-switch K1B-4
  alongside the slab plugin: PRYZM 1 curtain-wall code under
  `src/commands/curtainwalls/**` and `src/elements/curtainwalls/**`
  is **byte-for-byte unchanged** until S12 D9 (1B demo + flag flip).
* The producer split is the **first multi-file producer** in the
  kernel — every other producer is a single file.  The directory
  convention (`_internal/<element>/build*.ts` for sub-producers,
  bare `producers/<element>.ts` for the orchestrator) is now the
  template for any future element family that grows past the
  ≤ 600-LOC single-file budget.
* The 6 dropped PRYZM 1 commands are listed verbatim above so any
  future audit can re-confirm none of them carry behaviour PRYZM 2
  depends on outside the kill-switch perimeter.
* The transom-thickness stub (Deviation B) is the most likely
  source of carry-over rework when 1C lands the dedicated field;
  the JSDoc on `SetCurtainWallTransomTypeHandler` calls this out
  inline so the migration path is discoverable from the source.

## References

* `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S12-T3 — triage owner
* `code-level ADR docs/02-decisions/adrs/0008-wall-handler-triage.md` — the wall-side triage that established the handler-collapse pattern
* `code-level ADR docs/02-decisions/adrs/0009-producer-pure-function-signature.md` — the producer contract this ADR's split conforms to
* `code-level ADR docs/02-decisions/adrs/0010-slab-handler-triage.md` — slab triage + cross-element coupling lift (sister ADR for S12)
* `code-level ADR docs/02-decisions/adrs/0002-command-handler-signature.md` — the parametric handler contract that makes the collapses possible
* `src/commands/curtainwalls/` — the 15-class PRYZM 1 surface this ADR triages
* `src/elements/curtainwalls/CurtainWallBuilder.ts` — the 1,247-LOC monolith this ADR's producer split retires

---

## Amendment — 2026-04-28 (PHASE-1 close-out audit, W-05)

The original ADR enumerated **9** curtain-wall handlers.  Between S12
and the Phase-1 audit four panel-level handlers landed to support the
panel-detail tooling shipped in S15 + S17:

* **`AddPanelHandler`** — append a panel to an existing
  curtain-wall row (used by the "Add panel" toolbar action).
* **`RemovePanelHandler`** — remove a panel by id (right-click /
  Delete-key path).
* **`SwapPanelHandler`** — swap one panel-type id for another
  in-place (used by the "Replace panel" inspector action).  Distinct
  from `SetCurtainWallPanelType` which sets the *default* type for
  newly-added panels in the current row.
* **`RotatePanelHandler`** — rotate a panel 90° / 180° / 270°
  (frame-orientation swap on operable panels).

Net handler count is therefore **13**, not 9.  All four additions
follow the same producer split documented above (panels go through
`_internal/curtain-wall/buildPanels.ts`); the orchestrator only
re-enters when a panel-level patch dirties the row.  Parity capture
under `tests/fixtures/pryzm-1/curtain-wall/{add-panel,remove-panel,
swap-panel,rotate-panel}.json` proves byte-for-byte equivalence with
PRYZM 1's `CurtainWallBuilder` for these operations.

The 6 dropped PRYZM 1 commands listed in the original Consequences
remain dropped — none of them overlap with the four additions above
(the dropped set was about builder-time configuration, not run-time
panel manipulation).
