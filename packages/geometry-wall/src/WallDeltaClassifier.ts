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
    if ((prev.thickness ?? 0) !== (next.thickness ?? 0)) return true;
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
 * Otherwise returns `whole-level` with a reason.
 */
export function classifyWallDelta(
    batch: ReadonlyArray<WallDeltaEntry>,
): WallDeltaClassification {
    if (batch.length === 0) return { kind: 'whole-level', reason: 'empty-batch' };

    const wallIds: string[] = [];
    let levelId: string | undefined;

    for (const entry of batch) {
        const { event, wall, prevState } = entry;

        if (event !== 'update') {
            return { kind: 'whole-level', reason: `non-update-event:${event}` };
        }
        if (!prevState) {
            return { kind: 'whole-level', reason: 'no-prevState' };
        }
        if (joinGeometryChanged(prevState, wall)) {
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
    }

    // Every guard passed: provably openings-only on baseline-stable walls of one level.
    return { kind: 'openings-only', wallIds, levelId: levelId! };
}
