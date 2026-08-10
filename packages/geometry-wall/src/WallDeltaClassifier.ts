/**
 * WallDeltaClassifier — ADR-057 P1 (OI-053h) — single-wall openings-only rebuild.
 *
 * Pure classifier consumed by `WallRebuildCoordinator._flush` (apps/editor).
 * Given the batch of dirty wall entries collected for a single rebuild flush,
 * it decides whether the entire batch is a **provably openings-only change on
 * known, baseline-stable walls**. When (and only when) that proof holds, the
 * coordinator may take the fast single-wall branch: rebuild ONLY the affected
 * wall bodies (the holes) and SKIP the whole-level
 * `WallJoinResolver.resolveLevel` / level-wide `refreshV2Cache` /
 * `computeJunctionInfills` pass.
 *
 * ── The invariance proof (why the skip is correct) ──────────────────────────
 * `WallJoinResolver.resolveLevel`, the V2 miter cache, and `computeJunctionInfills`
 * are functions of (wall endpoints, wall thickness, neighbour adjacency) ONLY.
 * None of them read `wall.openings`. An openings-only delta — by construction —
 * leaves every wall's `baseLine`, `thickness`, `layers`, and the wall *set*
 * (no add, no remove) unchanged. Therefore the join geometry, the miter cache,
 * and the junction infills are bit-for-bit identical to what a full rebuild
 * would produce. Only the affected wall's own body geometry (the void cut by the
 * opening) changes, so only `buildWall(thatWall)` + its hosted-child re-anchor is
 * required. This mirrors `cross.wall-room`'s documented "DOES NOT FIRE FOR …
 * wall.createOpening" invariant (`plugins/cross/src/wall-room.ts`).
 *
 * ── Safety doctrine ─────────────────────────────────────────────────────────
 * The classifier is deliberately CONSERVATIVE. It returns the fast path ONLY
 * when every guard passes; ANY uncertainty (missing prevState, baseline moved,
 * wall added/removed, thickness/layers/curve changed, multi-level batch, or an
 * opening set whose membership changed) returns `kind: 'whole-level'`, i.e. the
 * existing byte-for-byte behaviour. A correct-but-slow fallback is mandatory;
 * a fast-but-wrong branch is not acceptable.
 */

import type { WallData, Opening } from './WallTypes';

/** Endpoint-move epsilon (metres). Matches the existing `_flush` baseline diff. */
export const BASELINE_EPS_M = 0.001;

/** Result of classifying a single rebuild batch. */
export type WallDeltaClassification =
    | {
          /** Fast path: rebuild only these wall ids' bodies; skip resolveLevel/infill/V2-cache. */
          kind: 'openings-only';
          /** The wall ids whose openings changed (1+). All share `levelId`. */
          wallIds: string[];
          /** The single level all affected walls belong to. */
          levelId: string;
      }
    | {
          /**
           * §PERF-WALL-MOVE-INCREMENTAL-REBUILD (L-234) — a pure BASELINE MOVE of one
           * or more walls on a single level, with NO other join-geometry change
           * (thickness / layers / curve stable) and NO opening-set membership change.
           *
           * This is NOT a licence to skip `resolveLevel`. A move changes junction
           * geometry, so the whole-level solve (and the ADR-0055 V2 miter-cache
           * refresh that follows it) MUST still run — see the "why we did not make
           * `resolveLevel` partial" note at the bottom of this file. What this kind
           * buys is the *consumer* side: the coordinator knows the batch is a move,
           * can name the moved walls for telemetry, and applies the incremental
           * BUILD gate (rebuild only the wall bodies whose geometry inputs actually
           * changed) instead of re-extruding every wall on the level.
           */
          kind: 'moved-wall';
          /** The walls whose baseline actually moved (>= BASELINE_EPS_M). Never empty. */
          movedWallIds: string[];
          /** Every wall in the batch (moved + any openings-value-only edits alongside). */
          wallIds: string[];
          /** The single level all batch walls belong to. */
          levelId: string;
      }
    | {
          /** Slow path: the existing whole-level rebuild, unchanged. */
          kind: 'whole-level';
          /** Human-readable reason (for telemetry / tests); not load-bearing. */
          reason: string;
      };

/** Minimal shape of a dirty-batch entry the classifier needs. */
export interface WallDeltaEntry {
    event: 'add' | 'update' | 'remove';
    wall: WallData;
    prevState?: WallData;
}

function pt3dDist(
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number },
): number {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

/** True if the two baselines differ by more than the endpoint epsilon. */
export function baselineMoved(prev: WallData, next: WallData): boolean {
    const pb = prev.baseLine;
    const nb = next.baseLine;
    if (!pb || !nb || pb.length < 2 || nb.length < 2) return true; // can't prove stable → treat as moved
    return (
        pt3dDist(pb[0], nb[0]) > BASELINE_EPS_M ||
        pt3dDist(pb[1], nb[1]) > BASELINE_EPS_M
    );
}

/**
 * True if the wall's join-relevant geometry (anything `resolveLevel` /
 * `computeJunctionInfills` / the V2 miter cache reads) changed: endpoints,
 * thickness, layer set, or curve descriptor. Openings are intentionally NOT
 * part of this — they are the one field the fast path is allowed to vary.
 */
export function joinGeometryChanged(prev: WallData, next: WallData): boolean {
    if (baselineMoved(prev, next)) return true;
    return joinGeometryChangedExcludingBaseline(prev, next);
}

/**
 * §PERF-WALL-MOVE-INCREMENTAL-REBUILD (L-234) — the NON-BASELINE half of
 * {@link joinGeometryChanged}: thickness, layer count, curve descriptor.
 *
 * Extracted so the classifier can distinguish the two reasons a batch fails the
 * ADR-0057 openings-only gate:
 *
 *   • baseline moved, everything else stable   → `moved-wall`  (the L-234 case)
 *   • thickness / layers / curve changed       → `whole-level` (unchanged)
 *
 * This is a REFACTOR, not a relaxation: `joinGeometryChanged` still returns
 * exactly what it returned before (`baselineMoved || thisFunction`), so the
 * openings-only fast path is gated identically. Nothing is loosened.
 */
export function joinGeometryChangedExcludingBaseline(prev: WallData, next: WallData): boolean {
    if ((prev.thickness ?? 0) !== (next.thickness ?? 0)) return true;
    // §WALL-RAKE-JOINT-ONE-EDIT-BEHIND (founder 2026-08-09, ADR-0312 follow-up) —
    // the rake is now a JOIN-GEOMETRY input. The invariance proof in this file's
    // header ("the V2 miter cache is a function of endpoints/thickness/adjacency
    // ONLY") was true before ADR-0312 and is FALSE after it: `refreshV2Cache`
    // receives `rakeAngleDeg` per wall and runs the twin-solve probe from it, and
    // every joined wall's built TOP geometry consumes that probe. Classifying a
    // rake-only edit `openings-only` therefore sent it down `_flushOpeningsOnly`,
    // which skips `refreshV2Cache` and never rebuilds a neighbour — the edited
    // wall re-rendered against the PREVIOUS refresh's probe, i.e. the founder's
    // "the joint arrives one edit late". Absent ⇒ 90 (vertical), so a wall that
    // has never been raked cannot fail this gate.
    if ((prev.rakeAngleDeg ?? 90) !== (next.rakeAngleDeg ?? 90)) return true;
    // Layered-wall geometry feeds the infill/footprint path — any change is unsafe.
    if ((prev.layers?.length ?? 0) !== (next.layers?.length ?? 0)) return true;
    // Curve presence/shape changes the baseline path → join geometry changes.
    const pc = prev.curve;
    const nc = next.curve;
    if ((pc === undefined) !== (nc === undefined)) return true;
    if (pc && nc) {
        if (
            pt3dDist(pc.control, nc.control) > BASELINE_EPS_M ||
            pc.segments !== nc.segments
        ) {
            return true;
        }
    }
    return false;
}

/**
 * True if the two opening arrays describe the SAME SET of openings (same ids,
 * same elementIds, same types) — i.e. only the per-opening
 * offset/width/height/sill VALUES may differ. Membership changes
 * (create/delete opening) are NOT openings-value-only: a created opening can
 * abut a junction and a removed opening can re-merge wall segments, so those
 * fall back to the whole-level path. (This branch handles the door-MOVE /
 * window-MOVE offset edit; opening creation is governed separately.)
 */
export function openingSetUnchanged(prev: WallData, next: WallData): boolean {
    const po = prev.openings ?? [];
    const no = next.openings ?? [];
    if (po.length !== no.length) return false;
    const key = (o: Opening) => `${o.id}|${o.elementId}|${o.type}`;
    const prevKeys = new Set(po.map(key));
    for (const o of no) {
        if (!prevKeys.has(key(o))) return false;
    }
    return true;
}

/**
 * Classify a single rebuild batch.
 *
 * Returns `openings-only` (fast path) iff EVERY guard holds:
 *   1. the batch is non-empty;
 *   2. every entry is an `update` (no add, no remove);
 *   3. every entry carries a `prevState` (we can prove invariance);
 *   4. no entry's join geometry changed (baseline/thickness/layers/curve stable);
 *   5. every entry's opening SET is unchanged (only offset/width/height/sill values may differ);
 *   6. all affected walls are on a single level.
 *
 * §PERF-WALL-MOVE-INCREMENTAL-REBUILD (L-234) — returns `moved-wall` iff guards
 * 1,2,3,5,6 hold, the NON-baseline join geometry (thickness/layers/curve) is
 * stable, AND at least one baseline moved. That is: exactly the batches that
 * previously returned `whole-level / join-geometry-changed` *because a wall was
 * dragged*, and nothing else. Guard 4 is NOT relaxed — a thickness / layer /
 * curve change still returns `whole-level / join-geometry-changed`, and
 * `moved-wall` still requires the caller to run the full whole-level
 * `resolveLevel` + V2-cache refresh (see the type doc).
 *
 * Otherwise returns `whole-level` with a reason.
 */
export function classifyWallDelta(
    batch: ReadonlyArray<WallDeltaEntry>,
): WallDeltaClassification {
    if (batch.length === 0) return { kind: 'whole-level', reason: 'empty-batch' };

    const wallIds: string[] = [];
    const movedWallIds: string[] = [];
    let levelId: string | undefined;

    for (const entry of batch) {
        const { event, wall, prevState } = entry;

        if (event !== 'update') {
            return { kind: 'whole-level', reason: `non-update-event:${event}` };
        }
        if (!prevState) {
            return { kind: 'whole-level', reason: 'no-prevState' };
        }
        // NOT relaxed: thickness / layers / curve still force the whole-level path.
        if (joinGeometryChangedExcludingBaseline(prevState, wall)) {
            return { kind: 'whole-level', reason: 'join-geometry-changed' };
        }
        if (!openingSetUnchanged(prevState, wall)) {
            return { kind: 'whole-level', reason: 'opening-set-changed' };
        }
        if (prevState.levelId !== wall.levelId) {
            // Level move is a structural change (was on level A, now level B).
            return { kind: 'whole-level', reason: 'level-changed' };
        }
        if (levelId === undefined) {
            levelId = wall.levelId;
        } else if (levelId !== wall.levelId) {
            return { kind: 'whole-level', reason: 'multi-level-batch' };
        }
        wallIds.push(wall.id);
        if (baselineMoved(prevState, wall)) movedWallIds.push(wall.id);
    }

    if (movedWallIds.length > 0) {
        // §PERF-WALL-MOVE-INCREMENTAL-REBUILD — a pure baseline move (the founder's
        // wall-drag). Junction geometry DID change, so the consumer must still run
        // the whole-level solve; what it must NOT do is re-extrude every wall body
        // on the level. See WallRebuildCoordinator's incremental build gate.
        return { kind: 'moved-wall', movedWallIds, wallIds, levelId: levelId! };
    }

    // Every guard passed: provably openings-only on baseline-stable walls of one level.
    return { kind: 'openings-only', wallIds, levelId: levelId! };
}

/*
 * ── Why `resolveLevel` is NOT made partial here (ADR-0099's deferred item) ─────
 *
 * The obvious next step is to hand `resolveLevel` a "moved set" and have it solve
 * only the moved wall + its junction neighbours. We deliberately did NOT do that,
 * and the reason is a correctness one, not an effort one:
 *
 * `WallJoinResolver.resolveLevel` is not a per-junction function. It is a SEQUENCE
 * of whole-level passes that mutate one shared working-baseline map:
 * §MULTI-CLUSTER (transitive union-find over ALL endpoints) → the pair-wise
 * corner/T `_detect` → §PARTITION-SHELL-INNER-FACE (whose host search scans every
 * wall) → §RESOLVED-STUB-SWEEP. Several of those passes read walls that are NOT in
 * the cluster (§SHELL-ANCHOR-PRESERVE explicitly looks for a NON-cluster shell body
 * under a partition endpoint), and each pass consumes the baselines the previous
 * pass moved. The influence of a moved wall therefore propagates along the junction
 * graph, and on a real floor plate that graph is CONNECTED — so a "conservative
 * closure" of the affected set is the whole level again, and any smaller bound is a
 * heuristic we cannot prove. `§CLAMP-COSHARE-WELD` was reverted for exactly this
 * class of "seemed local, wasn't" mistake.
 *
 * So we keep the solve exact and whole-level, and instead make the CONSUMER
 * incremental: `resolveLevel` returns adjustments for every wall as before, and the
 * coordinator rebuilds only the wall bodies whose *geometry inputs actually
 * changed* (content hash over baseline+dims+openings+layers+joinData+worldY). That
 * yields the same O(affected) rebuild count with a correctness guarantee that is a
 * MEMOIZATION rather than an approximation — a skipped wall is skipped because its
 * inputs are byte-identical, so `buildWall` would have produced the identical mesh.
 * It also keeps the level-wide V2 miter cache (ADR-0055 P4b / L-242) fresh, which a
 * partial solve would not.
 *
 * The cost of the whole-level solve itself is attacked separately, and safely, by
 * removing the O(N²) allocation storm in the resolver's two host-search loops
 * (§PERF-WALL-MOVE-INCREMENTAL-REBUILD in WallJoinResolver.ts) — a pure
 * constant-factor change with byte-identical output.
 */
