# ADR-0073 — House execution must reach apartment-grade joint quality via FRAME PARITY

- **Status:** Accepted (mitigation shipped) / Proposed (source fix) — 2026-06-16
- **Layer:** L5 editor executor (`apps/editor/src/ui/house-layout/`) + L2 engine emit (`packages/ai-host/src/workflows/apartmentLayout/`)
- **Relates to:** §UPPER-SHELL-WELD, §GROUND-WELD, §SHELL-CONTAIN (ADR-0072 sibling), §WJ-SKEW; ADR-0070 (Project-North frame).
- **Contracts:** C11 (element-creation pipeline), C15 (hosted elements), P2 (single THREE owner — geometry stays in `renderer-three`). No contract change; this is an execution-frame invariant.

## Context — the observed gap

The user's goal: the multi-storey **HOUSE** generator's wall/joint **execution** should match the **APARTMENT** generator's, which is clean (interior partitions meet their host walls; corners close). Today the house is worse: interior partition endpoints land **~0.9–1.2 m short of / outside** their host (`§DIAG-PARTITION-REACH … closed a 935/957/1031/1066 mm dangling gap (resolver-trim recovery)`), some walls poke past the shell, and `§DIAG-PERIM-CORNER-WHOLE … bothMitred=5/17`.

## The root cause (audited 2026-06-16)

Both paths use the **same** pure D-TGL engine and the **same** `WallJoinResolver`. The difference is the **frame the partitions are tiled in vs the frame the shell lives in**:

| | Shell origin | Partition emit frame | Result |
|---|---|---|---|
| **Apartment** | the user's **hand-drawn** ring | engine tiles against **that same ring** (rotated through the engine and rotated back as one rigid transform) | endpoints land **on** the ring → clean joints, no weld needed |
| **House — ground** | reuses the user's drawn ring (`shell.perimeter`) | same engine | bit-exact on a clean plate |
| **House — upper** | **minted** from raw world `storey.footprint` (`_buildPerimeterShell`) — **never round-tripped** through the rotate | engine tiles against the **axis-aligned BBOX of the principal-axis-rotated shell**, then rotates emitted geometry back | a perimeter-terminating endpoint lands **OFF** the world ring by the principal-axis/bbox-inflation residual (~1 m) |

The off-ring endpoint is not on any perimeter-wall **body**, so `WallJoinResolver`'s `§SHELL-ANCHOR-PRESERVE` guard can't fire → the interior cluster **consensus-trims** the endpoint (`§MULTI-CLUSTER primary=0 pinned=0 trimmed=N`), pulling it further off. `RoomDetectionEngine.§DIAG-PARTITION-REACH` then only **recovers** the ~1 m gap for *detection* (ceiling `REACH_MAX_M=1.25 m`) — the rendered wall body still ends short, and corners don't all mitre.

**The architectural principle:** *execution joint quality is a function of FRAME PARITY — the partitions must be emitted in the same frame the shell perimeter lives in.* The apartment is clean not because it welds harder (it welds **not at all**), but because its frame == its shell. The house upper floors violate this.

## Decision

1. **Shipped mitigation (downstream, both floors): §SHELL-CONTAIN** — a pure L2 `clampPartitionsInsideShell(partitions, shellRing)` (in `weldPartitionsToShell.ts`), applied after the weld in `_weldGroundPartitions` for ground (commit `b1ccf669`) and both upper-weld call sites (commit `24d761ea`). It projects any endpoint *outside* the shell ring back onto the perimeter → removes the visible walls-off-shell pokes. This is a *band-aid*: it fixes endpoints that escape the ring, not the underlying frame residual on interior joints.

2. **Source fix (the real parity fix): mint the upper-floor perimeter in the SAME frame the partitions were emitted.** Round-trip `_buildPerimeterShell`'s ring through the identical transform the partitions took (forward-rotate by −θ about the engine pivot, build/grid, rotate back by +θ), or equivalently apply the already-threaded §PROJECT-NORTH `weldFrame` to the perimeter mint — not just the weld. On an axis-aligned plate (θ=0) this is a **byte-identical no-op**; on a rotated plate the minted ring then coincides with where the partition endpoints actually land, so:
   - `§SHELL-ANCHOR-PRESERVE` fires (endpoint on a perimeter body),
   - the `§MULTI-CLUSTER` consensus-trim no longer pulls the endpoint off,
   - `§DIAG-PARTITION-REACH`'s 1.25 m recovery becomes a no-op, and
   - `bothMitred` rises (corners are the engine's own emitted corners).

   This is strictly better than the three current downstream band-aids (§UPPER-SHELL-WELD, §SHELL-CONTAIN clamp, the detector's §DIAG-PARTITION-REACH recovery), and it is exactly the architecture the apartment relies on.

## Consequences

- **Positive:** house execution converges on apartment-grade joints; removes the ~1 m residual at SOURCE so the resolver and detector run on correct geometry; fewer band-aids over time.
- **Risk:** the source fix touches `_buildPerimeterShell` + the emit-frame coupling — the regression-prone executor. Land **test-first** (a frame-parity test: minted ring vertices coincide with partition perimeter-endpoints within a tight tol on a rotated plate) and **browser-verify before deploy** (the §CLAMP-COSHARE-WELD lesson). Keep §SHELL-CONTAIN as the belt-and-braces backstop.
- **Out of scope:** the `detected=N / expected=M` room over-split (separate detect-vs-graph race), the corridor-spine §52.6 layout work, and the floor-inset bow-tie — all tracked independently.

## Key files
- `apps/editor/src/ui/house-layout/HouseLayoutExecutor.ts` — `_buildPerimeterShell` (perimeter mint, the residual source), `_weldGroundPartitions` (+§SHELL-CONTAIN), §UPPER-SHELL-WELD weld calls, `deriveProjectNorthFrame`/`weldFrame`.
- `apps/editor/src/ui/apartment-layout/ApartmentLayoutExecutor.ts` — the reference (no weld, no clamp; shell == frame).
- `packages/ai-host/src/workflows/apartmentLayout/tgl/runDeterministicLayout.ts` — the shared principal-axis rotate→tile→rotate-back.
- `packages/ai-host/src/workflows/houseLayout/weldPartitionsToShell.ts` — weld (shell-snap 0.60 m) + `clampPartitionsInsideShell`.
- `packages/geometry-wall/src/WallJoinResolver.ts` — §MULTI-CLUSTER consensus-trim, §SHELL-ANCHOR-PRESERVE guard.
- `packages/room-topology/src/RoomDetectionEngine.ts` — `REACH_MAX_M=1.25`, §DIAG-PARTITION-REACH recovery.
