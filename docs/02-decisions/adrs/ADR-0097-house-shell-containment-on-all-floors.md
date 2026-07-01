# ADR-0097 — House shell containment on ALL floors + paths (§DIAG-HOUSE-SHELL-CONTAINMENT)

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-01 |
| Owner | House generation (`apps/editor/src/ui/house-layout/HouseLayoutExecutor.ts`) |
| Builds on | §SHELL-CONTAIN (`clampPartitionsInsideShell`) · §CONTAIN-CHECK (`checkShellContainment`) · the §GROUND-WELD / §UPPER-SHELL-WELD reconciler |
| Governs | The generated-house walls-off-shell / out-of-boundary defect |
| Tags | §DIAG-HOUSE-SHELL-CONTAINMENT |
| Contracts | P6 (all geometry still ships through the command bus — this only rewrites the pure `LayoutCommandSet` before dispatch) · P2/P4 (no THREE, no `(window as any)` beyond the existing flag shim) |

## Context

The founder reported (live "Design your house — live" modal) that on BOTH floors of a generated
house several room rectangles / partition walls poke OUTSIDE the house shell outline — most visibly
along the long angled side of the plot. Detection still ran (Circulation 100%, score 81) but the room
geometry breached the footprint.

Root cause. The pipeline already had a proven containment clamp — `clampPartitionsInsideShell`
(ai-host §SHELL-CONTAIN) — which projects any partition endpoint sitting strictly outside the shell
ring back onto the perimeter. But it was invoked ONLY inside `_weldGroundPartitions`, the weld
reconciler. That reconciler is BYPASSED on the two COMMON no-weld paths:

1. Ground ENGINE-PERIMETER path — when the drawn shell is on the footprint ring (`_groundShellOnEnginePerimeter`), the weld (and its clamp) is skipped as a no-op.
2. Upper BIT-EXACT path — when the footprint is an axis-aligned rectangle with `openSeams === 0`, or the upper-weld flag is off, no weld runs.

On an angled / rotated plate the engine tiles interior partitions against the principal-axis bounding
box, which pushes perimeter-terminating endpoints ~0.9–1.5 m PAST the true (rotated) footprint. With
no weld on those paths, nothing clamped them, so the partition walls (and the room rectangles that
follow them) rendered outside the shell on BOTH floors. The containment guard was effectively
conditional on the weld decision instead of being a floor-independent invariant.

## Decision

Make shell containment an UNCONDITIONAL step that runs on EVERY storey, on EVERY path, AFTER all the
weld decisions and BEFORE openings/boundaries are emitted. A new
`HouseLayoutExecutor._containWithinShell(set, shellRing, levelId)`:

- clamps every interior-partition endpoint onto the shell ring by REUSING `clampPartitionsInsideShell`
  (the same helper the weld path already trusted — no new geometry math);
- clamps the boundary (open-plan splitter) endpoints onto the ring too;
- drops any wall a clamp collapses below the editor's 0.05 m min-wall length and reconciles its
  openings / doors / windows (identical to the weld reconciler) so no opening references a removed wall;
- runs the `checkShellContainment` validator BEFORE and AFTER and logs a `§DIAG-HOUSE-SHELL-CONTAINMENT`
  summary (walls checked, breaches clipped, dropped, residual) — the queued walls-off-shell checker.

Ground uses the drawn shell ring (`shell.perimeter`); each upper storey uses its minted footprint ring
(`storey.footprint`). Because `clampPartitionsInsideShell` moves ONLY endpoints strictly outside the
ring (inside / on-perimeter endpoints are untouched), the step is a byte-identical no-op wherever the
weld already clamped, or on an axis-aligned plate whose endpoints already land on the ring. Guarded by
`window.__pryzmHouseShellContain` (default ON; `=== false` restores the legacy weld-path-only
behaviour). Best-effort: any failure passes the input set through unchanged.

Scope note. This clamps the STRUCTURAL breach (partition walls + boundaries — the visible planes and
the geometry room detection traces). Room-fill polygons (`roomCommands`, ADR-0069) follow the same
walls; clipping the polygons themselves (Sutherland–Hodgman against the ring) is a larger, higher-risk
change deferred for now — no polygon-clip helper exists in this pipeline and a malformed clip would
break `roomDataFromGraphSpec`. Once the walls are contained, the rooms bounded by them are contained.

## Consequences

- No generated partition wall or open-plan boundary extends past the footprint on any floor / any path.
- Every run logs a measurable containment summary instead of relying on 3D screenshots.
- Byte-identical on clean axis-aligned / already-contained plates; reversible via the flag.
- Follow-up: optional room-polygon clipping for the residual visual fill on extreme angled plots.
