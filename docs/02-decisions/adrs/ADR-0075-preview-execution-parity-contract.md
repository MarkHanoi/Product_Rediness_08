# 0075 — Preview↔Execution Parity Contract

**Status**: PROPOSED
**Date**: 2026-06-18
**Deciders**: architecture team (founder-driven — *"I feel like we are moving blind — without a proper vision and architecture — there are new regressions and defects constantly. There is no contract that says built == previewed."*)
**Related ADRs**: [0069](./ADR-0069-graph-authoritative-room-identity-at-execution.md) (graph-authoritative ROOM identity — the room slice of this contract, already shipped), [0073](./ADR-0073-house-execution-frame-parity-with-apartment.md) (house↔apartment frame parity), [0070](./ADR-0070-project-north-vs-true-north-authoring-frame.md) (the weld frame), [0061](./ADR-0061-building-graph-bidirectional-edit-substrate.md) (determinism / projection)
**Related contracts**: C53 §1 (topology is source of truth, geometry is its projection), C11 (element creation pipeline), C16 (command authoring)
**Related reference**: [layout-generation-algorithm.md §17](../../04-reference/layout-generation-algorithm.md) (the authoritative preview→execution map + divergence table + parity-diagnostic spec)

## Context

The pure engine emits **one** deterministic `LayoutOption` (rooms + walls + openings). That option is then realized **twice, independently**:

- **PREVIEW** — the modal cards. `buildLayoutThumbnailSvg` (`apps/editor/src/ui/apartment-layout/layoutThumbnail.ts:256`) draws the option's `rooms[].polygon`, `walls[].{start,end}`, `doors[]`, `windows[]` **RAW** — no weld, no miter, no inset (verified: the only editor inputs are the executor's own `footprint` as `perimeterRingMm` + the engine stair keep-out, so even the shell + stair void are bit-identical to the build's). The preview is a **faithful render of the engine's intent.**
- **EXECUTION** — the built scene. `HouseLayoutExecutor` takes the *same* option and applies a chain of geometry-mutating transforms: `_weldGroundPartitions` / `weldPartitionsToShell` (endpoint snap ≤0.60 m), `§UPPER-SHELL-WELD`, `WallJoinResolver.resolveLevel` (miter/trim ≤wall-thickness), `§PARTITION-SHELL-INNER-FACE` clamp (≤half-thickness), `§COLLINEAR-MERGE`, `§OPENING-REBASE`, `§FLOOR-INNER-FACE` inset.

**The defect class:** the preview shows the engine's intent; execution shows that intent *after* a pile of editor transforms the preview never applies. So a defect is **invisible until you build**, and every "regression" this session was a newly-exposed gap between these two realizations (overlapping walls, opening drift, the L-corner gap, floor bow-ties). There was **no contract** that said *built == previewed*, and **no measurement** of the gap — divergence was discovered in screenshots, not in logs.

The regression taxonomy (every fix this session maps to one):
- **A — execution-only transforms not previewed** (the big class): weld drift, miter/trim, inner-face clamp, floor inset, opening re-base.
- **B — execution re-derivation of identity**: room detection re-deriving rooms → **structurally cured by ADR-0069** (rooms are graph-authoritative; this ADR generalizes that win to walls/floors). Floors still derive from inset geometry.
- **C — ungated experimental engine features**: e.g. the polygon-corridor that doubled walls (`§POLYGON-CORRIDOR-REACH-GATE`).
- **D — diagnostic miscounts that erode trust**: the false `§DIAG-LEVELS EXTRA-N`.

ADR-0069 already proved the cure *for rooms*: make the engine option authoritative and demote the re-derivation to validation-only. This ADR makes that the **governing contract for all generated geometry**, and adds the measurement + the merge gate that stop the whack-a-mole.

## Decision

**Built geometry must be PROVABLY a faithful realization of the previewed engine `LayoutOption`. Divergence is the bug class — it is measured every run, and no executor transform that widens it ships without a preview reflection or a no-op proof.** Four binding sub-decisions:

**PC1 — Parity is measured every run (`§DIAG-PARITY`).**
The executor captures each wall's **option centreline** (world frame, straight off `buildLayoutCommands`, *before* any weld/miter — exactly what the preview drew) keyed by wall id, and after commit compares it to the **live committed centreline**, logging per level `walls / drifted>20mm / max / mean` + a `✓ built == previewed` or `⚠ N drifted` verdict (`HouseLayoutExecutor.ts`, next to `§DIAG-LEVELS`). 20 mm = the `RoomDetection` node grid — the threshold past which a drift can re-open a room loop. Logging-only (ADR-0061-safe). This turns "invisible until built" into a number on every generation. *(Openings and floor-inset parity are the PC1 follow-ups; wall-centreline is the first and highest-signal axis.)*

**PC2 — The merge rule: no new divergence without parity.**
A change that adds or widens an executor geometry transform **MUST** ship with one of: **(a)** a *preview reflection* — the same transform applied in `buildLayoutThumbnailSvg` so the preview is WYSIWYG; or **(b)** a *no-op proof* — a parity test asserting the transform is byte-identical to the option on the apartment / axis-aligned-rectilinear baseline (where it must never fire), plus a `§DIAG-PARITY` reading of `~0 mm` on that baseline. A transform that can only be validated "by screenshot" is not mergeable. This is the gate that converts the firefight into an invariant.

**PC3 — Intentional divergence is allowed, but must be *contained and declared*.**
The execution transforms exist for real reasons (the ground reuses a hand-drawn, mitred, height-raised shell; rotated plates leave principal-axis residuals; floors must not overlap under a partition). Divergence is therefore **permitted where it corrects for a real input difference** — but it must be (i) **bounded** (each transform documents its max displacement — see §17 table), (ii) **gated** so it is a no-op on the clean/apartment path (byte-identical baseline), and (iii) **declared** in `§DIAG-PARITY`. A divergence that is *unbounded*, *fires on the clean path*, or is *undeclared* is a defect.

**PC4 — Drive divergence toward zero by moving authority upstream.**
The strategic direction (not a single change): shrink the execution transform chain so each per-storey plate realizes the option with provable no-ops, exactly as ADR-0069 did for rooms. Concretely: prefer the **engine-authored perimeter** on the ground (so the weld degrades to a safety net — audit §8.4.5), make **floors graph-authoritative** (inset from the option polygon, not a re-detected centreline), and keep experimental engine features (non-rect cells, corridor reach) **flag-gated OFF** until their executor realization is parity-proven. The end state: `§DIAG-PARITY` reads `✓ built == previewed` on every plate, and the preview is a literal contract for the build.

## What changes / what stays

| Aspect | Before | After (this ADR) |
|---|---|---|
| Divergence visibility | discovered in screenshots | **measured every run** (`§DIAG-PARITY`) |
| New executor transform | shipped, validated by eye | **gated** by PC2 (preview reflection OR no-op proof) |
| Intentional transforms (weld/miter/inset) | implicit, unbounded-feeling | **kept**, but bounded + gated-off-on-clean + declared (PC3) |
| Room identity | ADR-0069 graph-authoritative | unchanged (this ADR is the general case ADR-0069 instantiated) |
| Floors | re-detected + inset | PC4 target: graph-authoritative inset (follow-up) |
| Strategic direction | point-fixes | **drive `§DIAG-PARITY` → 0** by moving authority upstream |

## Consequences

**Positive.** Regressions become measurable and gated, not emergent. The preview becomes a literal build contract (the founder's "map"). ADR-0069's room win generalizes to all geometry. The merge rule (PC2) forecloses the next cycle of "looked fine in the modal, broke in 3D."

**Costs / risks.** `§DIAG-PARITY` is logging-only and cheap, but the PC2 gate adds authoring discipline (a no-op proof per transform). PC4 is a direction, not a single PR — the ground-on-engine-perimeter and graph-floors slices are real work (tracked separately). The contract does **not** forbid divergence; it forbids *unmeasured, unbounded, clean-path* divergence — a reviewer must still judge whether a declared divergence is justified.

**Reversibility.** `§DIAG-PARITY` is a pure diagnostic (removable with no behavioural effect). The merge rule is process. No production code path is altered by adopting this ADR beyond the diagnostic already shipped.
