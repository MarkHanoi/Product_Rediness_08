# ADR-010 — Slab handler triage (12 → 8) + cross-element coupling lift

* **Status:** Accepted
* **Sprint:** S12 (`phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S12-T1, lines 1356–1360)
* **Date:** 2026-04-27
* **Supersedes:** —
* **Superseded by:** —

## Context

PRYZM 1's slab command surface in `src/commands/slabs/` lists **12**
distinct command classes plus a peer `src/elements/walls/SlabWallCoupling.ts`
(133 LOC) that hand-rolls the slab→wall edge-pinning cascade.

Several of the 12 commands are micro-commands that exist only because
PRYZM 1's command dispatch is non-parametric:

* `SetSlabThicknessCommand`, `UpdateSlabThicknessCommand`,
  `OffsetSlabBaseCommand`, and `RaiseSlabCommand` are all thin
  wrappers around the same scalar-field-on-slab patch.
* `AddSlabOpeningCommand` and `RemoveSlabOpeningCommand` are paired —
  PRYZM 2 collapses every collection-mutation pair into `add*` /
  `remove*` so the audit log is symmetric.

PRYZM 2's `CommandHandler<TPayload, TStores>` (ADR-002) is parametric
in `TPayload`, so several PRYZM 1 commands collapse into a single
PRYZM 2 handler with an optional-fields payload.  This ADR records the
**exact** 12 → 8 mapping the slab plugin ships in S12, plus the
**lift** of the 133-LOC inline cascade into `plugins/cross/slab-wall.ts`
per ADR-012's `CascadeRule` registry.

## Decision

The PRYZM 2 slab plugin ships **8 handlers** total, in a single S12
wave (no follow-on waves needed because — unlike walls — slab does
not gain new behaviour in any later 1B sprint):

| # | PRYZM 2 handler              | PRYZM 1 commands collapsed                                                  | LOC ratio (1 → 2) |
|---|------------------------------|------------------------------------------------------------------------------|--------------------|
| 1 | `slab.create`                | `CreateSlabCommand`                                                          | 312 → ~110         |
| 2 | `slab.delete`                | `DeleteElementCommand` (slab slice)                                          | 783 → ~70          |
| 3 | `slab.move`                  | `UpdateSlabBoundaryCommand` + `TranslateElementCommand` (slab slice)         | 187 + 91 → ~95     |
| 4 | `slab.setType`               | `SetSlabSystemTypeCommand`                                                   | 64 → ~85           |
| 5 | `slab.addHole`               | `AddSlabOpeningCommand`                                                      | 121 → ~90          |
| 6 | `slab.removeHole`            | `RemoveSlabOpeningCommand`                                                   | 89 → ~70           |
| 7 | `slab.setThickness`          | `SetSlabThicknessCommand` + `UpdateSlabThicknessCommand`                     | 73 + 58 → ~85      |
| 8 | `slab.setBaseOffset`         | `OffsetSlabBaseCommand` + `RaiseSlabCommand`                                 | 66 + 81 → ~85      |

LOC ratio is the headline win: **1,925 → ~690** (≈ 2.8× reduction)
on the command surface alone.  The 133-LOC `SlabWallCoupling.ts` is
**fully retired** by the cross-rule (≈ 195 LOC including JSDoc + the
two payload type guards), so total slab-family code drops by another
~40 % once the cross-rule replaces the inline cascade.

### Dropped from PRYZM 2 (4 commands, 12 − 8 = 4)

| PRYZM 1 command                  | Reason for drop                                                                                                                                                                                                                                                      |
|----------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `SetSlabSlopeCommand`            | Slab schema (`packages/schemas/src/elements/Slab.ts`) ships **flat slabs only** in S12.  Sloped slabs land in the type catalogue in 1C alongside the `SlabType` system type; the handler will be added then under the same triage rules without needing a new ADR.    |
| `RecomputeSlabBoundaryCommand`   | Boundary is derived state recomputed by the L4 producer on demand — no command needed.                                                                                                                                                                                 |
| `RebuildSlabGeometryCommand`     | Same — geometry is committer state, recomputed by the `bindStore` dispatcher on every store-patch flush.                                                                                                                                                              |
| `MigrateSlabSchemaCommand`       | One-shot legacy migration that runs once at PRYZM-1→2 import time, not as a runtime command.                                                                                                                                                                          |

## Cross-element coupling — lift to `plugins/cross/slab-wall.ts`

PRYZM 1's `src/elements/walls/SlabWallCoupling.ts:133` expressed the
coupling as an **inline branch** inside the slab command pipeline:

```ts
// PRYZM 1 — abridged
if (cmd.kind === 'slab.move' || cmd.kind === 'slab.setBaseOffset') {
  for (const wallId of registry.wallsPinnedToSlab(cmd.slabId)) {
    bimManager.execute(new MoveWallCommand(wallId, cmd.delta));
  }
}
```

PRYZM 2 lifts this branch into a `CascadeRule` per ADR-012:

* **File**: `plugins/cross/slab-wall.ts`
* **Rule key**: `cross.slab-wall`
* **`appliesTo`**: `slab.move`, `slab.setBaseOffset`, `slab.setThickness`
* **`extractEntityId`**: `payload.slabId` (overrides ADR-012 default
  of `payload.id ?? payload.wallId`)
* **`resolveAffected`**: caller-injected `wallsPinnedToSlab(slabId)`
  callback.  For `slab.setThickness` only, the rule additionally
  filters down to walls whose pin anchor is `'top'` (top-anchored
  walls hang off the slab below; bottom-anchored walls sit on the
  slab and don't translate when it gets thicker).
* **`synthesize`**: every affected wall id is translated into a
  `wall.transform[kind:'move']` command whose `delta` is derived from
  the root payload (XZ for `slab.move`, Y for `slab.setBaseOffset`
  and `slab.setThickness`).  The synthesised command carries
  `cascadedFrom` + `slabId` attribution fields so the OTel span tree
  distinguishes user-issued moves from cascaded ones.

The pin-registry data (which wall is pinned to which slab edge) is
NOT part of this ADR — it lands in 1C as a per-wall `pinnedToSlabId`
field plus a small index store.  The cascade rule is stable across
that landing because it consumes the registry through injected
lookups (`wallsPinnedToSlab`, `wallPinAnchor`), not direct imports.

### Why the cascade is a separate file under `plugins/cross/` rather than living in `plugins/slab/`

Per ADR-012 §"Decision" the cascade registry is L4 (cross-cutting),
so cross-element rules SHOULD live in a directory that does not
import from a single element family's `src/`.  `plugins/cross/`
hosts these rules so:

1. The slab plugin's `src/` directory has zero `import … from
   '@pryzm/plugin-wall'` lines (and vice versa).  Plugin-pair
   coupling lives entirely in cross/.
2. Adding a new element family that also pins to slab edges (e.g.
   columns whose base sits on a slab) means a new
   `plugins/cross/slab-column.ts` file alongside this one — no edit
   to the slab plugin.
3. The cross rule is unit-testable in isolation: pass a synthetic
   `wallsPinnedToSlab` callback + a `CascadeContext`, assert the
   synthesised commands.  No store wiring required.

## Deviations from PRYZM 1 (called out in handler JSDoc)

These are intentional contract changes from the PRYZM 1 commands;
each is documented in the corresponding handler's JSDoc.

### A. ULID id minting

PRYZM 1's `CreateSlabCommand` uses `crypto.randomUUID()`.  The PRYZM 2
handler calls `createId('slab')` from `@pryzm/schemas/factory/createId.ts`,
producing `slab_<ulid>` per the typed-id brand contract (ADR-001).

### B. Slabs are flat in S12

S12 ships only the flat-slab subset of the PRYZM 1 surface.  The
`Slab.ts` schema does not yet carry `slope` or `pitchAxis` fields;
when 1C lands the type catalogue, sloped slabs come in as a system
type that resolves to the same producer with extended geometry hash
inputs (ADR-009 §"Pure-function signature").

### C. `affectedStores: ['slab']` (not `['slab', 'level']`)

Same rationale as ADR-008 §D for walls — the bus' multi-store patch
filter currently routes per-store patches by `path[0] === storeKey`
which requires patches to carry the store-key prefix.  Slab handlers
produce patches via `produceCommand` against `Record<id, Slab>`,
which does NOT prefix; declaring `['slab', 'level']` today would
silently drop the level patches.  Re-declared once `produceWith
PatchesPerStore` lands in 1C.

### D. No DOM error event dispatch

PRYZM 1's `SlabSystemError` constructor dispatches a DOM `CustomEvent`
(`bim-slab-system-error`).  The PRYZM 2 hierarchy
(`plugins/slab/src/errors.ts`) does **not** — error fan-out belongs
to the L7 presentation layer per ADR-002 §3.

### E. Hole id collisions raise instead of silently renumbering

PRYZM 1's `AddSlabOpeningCommand` silently renumbered colliding hole
ids; PRYZM 2's `slab.addHole` raises `SlabHoleIdCollisionError`.  Hole
ids are caller-supplied so the FRP layer can address them
deterministically; silent renumber would break that.

### F. `slab.move` translates the boundary, not just the origin

PRYZM 1 carried slabs as `(origin, polygonRelative[])`; PRYZM 2 carries
`boundary[]` in absolute world coords.  `slab.move` therefore translates
every boundary vertex by `delta`, not a single `origin` field.  This
removes the `origin/relative` round-trip ambiguity that caused PRYZM-1
issue #3961.

## Consequences

* The 8-handler slab plugin ships behind kill-switch K1B-4 alongside
  the wall plugin: PRYZM 1 slab code under `src/commands/slabs/**`
  and `src/elements/slabs/**` is **byte-for-byte unchanged** until
  S12 D9 (1B demo + flag flip).
* The slab→wall cascade is the **first cross-element rule** in the
  cascade registry — the wall→wall miter rule registered in S10
  exercised the registry's same-family path; this exercises the
  cross-family path.  Any registry bug that escaped S10's coverage
  surfaces here.
* The 4 dropped PRYZM 1 commands are listed verbatim above so any
  future audit can re-confirm none of them carry behaviour PRYZM 2
  depends on outside the kill-switch perimeter.
* The cross rule's `wallsPinnedToSlab` injection point is the
  insertion seam for the 1C pin-registry: when that store lands, the
  bootstrap call `cascadeRunner.register(buildSlabWallCascadeRule({…}))`
  swaps the synthetic test callback for the live store query — no
  changes to the rule itself.

## References

* `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S12-T1 — triage owner
* `code-level ADR docs/architecture/adr/0008-wall-handler-triage.md` — the wall-side companion triage
* `code-level ADR docs/architecture/adr/0012-cross-element-cascade-rule-registration.md` — the cascade contract this rule conforms to
* `code-level ADR docs/architecture/adr/0002-command-handler-signature.md` — the parametric handler contract that makes the collapses possible
* `src/commands/slabs/` — the 12-class PRYZM 1 surface this ADR triages
* `src/elements/walls/SlabWallCoupling.ts:133` — the inline cascade this ADR retires
