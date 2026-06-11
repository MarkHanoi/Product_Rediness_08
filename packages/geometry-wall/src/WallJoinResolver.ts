import * as THREE from '@pryzm/renderer-three/three';
import { WallData } from './WallTypes';
import { detectJunctionClusters } from './WallJunctionClustering';
import { SpatialGrid } from '@pryzm/snapping';
import type { JoinData } from '@pryzm/core-app-model';

// ─── Public types ─────────────────────────────────────────────────────────────

// JoinData is defined authoritatively in @pryzm/core-app-model (WallJoinTypes.ts).
// Re-exported here for colocation with WallJoinResolver consumers.
export type { JoinData } from '@pryzm/core-app-model';

// ─── Internal types ───────────────────────────────────────────────────────────

type Side = 'start' | 'end';

interface Ep {
    wallId: string;
    side:   Side;
}

interface CornerJoin {
    kind:         'corner';
    epA:          Ep;
    epB:          Ep;
    intersection: THREE.Vector3;   // true centreline–centreline crossing
}

interface TJoin {
    kind:         't';
    secondary:    Ep;              // wall whose endpoint is trimmed
    hostWallId:   string;
    contactPoint: THREE.Vector3;   // closest point on host centreline
}

type JoinSpec = CornerJoin | TJoin;

// ─── Constants & per-call thresholds ──────────────────────────────────────────
//
// §WALL-AUDIT-2026-W5: SNAP_RADIUS / MIN_WALL_LENGTH used to be module-level
// constants. They are now DEFAULTS that the caller (EngineBootstrap) overrides
// with a per-frame, camera-zoom-aware tolerance computed via
// CameraToleranceService.getWorldToleranceForPixels().  This guarantees the
// snap pipeline (preview) and the post-creation join pass agree on what
// "touching" means for the same camera/canvas/zoom triple.

/** Default snap radius (metres). Overridable per resolveLevel() call. */
export const DEFAULT_SNAP_RADIUS   = 0.5;
/** Minimum wall length below which a trim is refused. */
export const DEFAULT_MIN_WALL_LENGTH = 0.05;

const MIN_ANGLE_RAD = 0.1;   // ~5.7° — skip near-parallel walls

/**
 * Per-call thresholds resolved from `ResolveLevelOptions` once at the top of
 * `resolveLevel()`.  Threaded through every helper that previously read the
 * old module-level constants — `_handleMultiWallClusters`, `_detect`,
 * `_applyT` — so a single resolveLevel pass uses ONE consistent value.
 *
 * §SHORT-WALL-SAFETY (Apr 2026): MAX_CORNER_OFFSET = snapRadius — corner
 * anchors must lie within `snapRadius` of BOTH joining endpoints, and a
 * trim is refused if it would shrink the wall below `minWallLength`.
 * These guards prevent the "100 mm wall stretched to 50 cm" failure mode
 * when a small wall is drawn near a near-parallel neighbour.
 */
interface JoinThresholds {
    snapRadius:      number;
    maxCornerOffset: number;
    minWallLength:   number;
}

/** Public options accepted by {@link WallJoinResolver.resolveLevel}. */
export interface ResolveLevelOptions {
    /**
     * World-space "touching" radius used for endpoint-to-endpoint and
     * endpoint-to-body proximity tests.  Defaults to {@link DEFAULT_SNAP_RADIUS}.
     */
    snapRadius?: number;
    /**
     * Minimum trimmed wall length (metres). Defaults to {@link DEFAULT_MIN_WALL_LENGTH}.
     */
    minWallLength?: number;
}

function _resolveThresholds(opts?: ResolveLevelOptions): JoinThresholds {
    const snapRadius =
        opts?.snapRadius != null && Number.isFinite(opts.snapRadius) && opts.snapRadius > 0
            ? opts.snapRadius
            : DEFAULT_SNAP_RADIUS;
    const minWallLength =
        opts?.minWallLength != null && Number.isFinite(opts.minWallLength) && opts.minWallLength > 0
            ? opts.minWallLength
            : DEFAULT_MIN_WALL_LENGTH;
    // §SHORT-WALL-SAFETY: maxCornerOffset historically equals snapRadius.
    return { snapRadius, maxCornerOffset: snapRadius, minWallLength };
}

// ─── WallJoinResolver ─────────────────────────────────────────────────────────

/**
 * WallJoinResolver
 *
 * CORNER join (endpoint ↔ endpoint within SNAP_RADIUS):
 *   Both walls move their endpoint to the true centreline intersection.
 *   Each wall's end cap is cut by the bisector plane → miter cut.
 *   The shared miter plane passes through the centreline intersection,
 *   with normal = bisector of the two wall directions at the corner.
 *
 * T-join (endpoint near the BODY of another wall):
 *   Only the approaching (secondary) wall moves, trimmed to the host face.
 *   The host wall is unchanged.
 *
 * MULTI-WALL CLUSTER join (§MULTI-CLUSTER — 3+ endpoints at same location):
 *   Pre-clustering pass runs BEFORE the pair-wise loop.
 *   All walls in a cluster are trimmed to a consensus meeting point with
 *   square (perpendicular) end caps so geometry never gaps or overlaps at
 *   complex junctions.  The pair-wise loop then skips handled endpoints.
 *
 * Contract: pure computation — no store writes, no scene access.
 */

// §WALL-DEEP-2026 P3 (RESOLVED 2026-04-24) — module-scoped Vector3 scratch
// pads. Re-used by the corner-detect inner loop so a multi-thousand-pair
// resolve no longer allocates two new Vector3 per pair just to compute a
// tangent endpoint for _intersect2D. Safe because:
//   • _intersect2D only reads x and z from its inputs.
//   • Resolver is single-threaded (browser main thread) and runs to
//     completion synchronously, so no two callers can interleave on the
//     same scratch pad.
const _tmpEpATan = new THREE.Vector3();
const _tmpEpBTan = new THREE.Vector3();

export class WallJoinResolver {

    static resolveLevel(
        walls: WallData[],
        opts?: ResolveLevelOptions,
    ): Map<string, JoinData> {
        const result = new Map<string, JoinData>();
        if (!walls || walls.length < 2) return result;

        // §WALL-AUDIT-2026-W5: Resolve per-call thresholds ONCE here so every
        // helper sees the same values for the whole pass.
        const thresholds = _resolveThresholds(opts);

        // Working copies — never mutate frozen store objects.
        //
        // §SOURCE-BL-FIX: seed from _sourceBaseLine (original user-drawn position)
        // when it exists, falling back to baseLine for new/unmoved walls.
        //
        // After any prior resolution pass, baseLine already holds the trimmed value
        // (e.g. wall A's start was moved to sharedPt_AB by the A-B corner).  If we
        // use that trimmed value as the resolver input on the NEXT flush (triggered
        // by adding a new connecting wall), the direction vectors fed to
        // _wallDirAtJoin / _pickMiterNormal are computed from the post-trim chord —
        // which can differ from the wall's true drawn direction when sharedPt ≠ the
        // original endpoint.  buildMiterPrism computes wallDir from the NEW trimmed
        // baseLine, so the two wallDir values diverge → miter plane is tilted → the
        // outer cap vertices of the two walls don't coincide → triangular gap.
        //
        // Using _sourceBaseLine as the resolver seed means:
        //   • Both the miter bisector (in _pickMiterNormal) and the geometry builder
        //     (buildMiterPrism) work from the same true wall direction.
        //   • Re-resolving after a prior join never causes cascading trim drift.
        //   • The resolver still produces the correct new trimmed baseLine (which
        //     EngineBootstrap writes back), so walls always render at the right spot.
        const bl = new Map<string, [THREE.Vector3, THREE.Vector3]>();
        for (const w of walls) {
            const src = (w as any)._sourceBaseLine ?? w.baseLine;
            bl.set(w.id, [
                new THREE.Vector3(src[0].x, src[0].y, src[0].z),
                new THREE.Vector3(src[1].x, src[1].y, src[1].z),
            ]);
        }

        const byId = new Map<string, WallData>();
        for (const w of walls) byId.set(w.id, w);

        // ── §MULTI-CLUSTER: Handle 3+ endpoint clusters BEFORE pair-wise loop ──
        // This prevents the pair-wise `seen` set from silently dropping the third
        // (and subsequent) pairs in a Y-junction or star junction.
        const handledEndpointKeys = this._handleMultiWallClusters(walls, bl, byId, result, thresholds);

        // ── Snapshot baselines at detection time for stable direction computation ─
        // _detect() runs once against the post-cluster bl. Each _applyCorner call
        // then MUTATES bl (it moves wall endpoints to the shared intersection).
        // For walls that participate in MORE THAN ONE corner join (e.g. both ends
        // corner-joined), the second _applyCorner call would see a bl that has
        // already been modified by the first — causing a drifted dirA/dirB and a
        // slightly wrong bisector miter-normal.  Snapshotting here gives every
        // _applyCorner call a consistent "this is what the wall looked like at
        // detection time" baseline to compute tangent directions from.
        const blAtDetect = new Map<string, [THREE.Vector3, THREE.Vector3]>();
        for (const [id, [s, e]] of bl) {
            blAtDetect.set(id, [s.clone(), e.clone()]);
        }

        // ── Existing pair-wise corner + T-join logic ───────────────────────────
        // Pass the set of pre-handled endpoint keys so _detect skips them.
        for (const join of this._detect(walls, bl, handledEndpointKeys, thresholds)) {
            if (join.kind === 'corner') this._applyCorner(join, bl, blAtDetect, byId, result, thresholds);
            else                        this._applyT(join, bl, byId, result, thresholds);
        }

        // ── §PARTITION-SHELL-INNER-FACE (founder invariant, 2026-06-10) ─────────
        // FINAL clamp: a partition endpoint that terminates ON a shell (perimeter /
        // through) wall must butt the shell's INNER (room-side) face — NEVER the
        // shell centreline, NEVER through to the outer face. The pair-wise _applyT
        // already lands a clean body-T on the inner face, but two routes leave a
        // partition end ON the shell CENTRELINE (→ its square-capped body crosses
        // the shell and pokes out the outer façade — the founder's "partition stubs
        // poking past the outside of the shell"):
        //   (1) the partition endpoint coincides with a shell CORNER → it is
        //       pinned / corner-joined to the centreline crossing (_applyCorner),
        //       not T-joined to a face; and
        //   (2) any residual centreline placement from the multi-cluster pass.
        // This pass runs AFTER all joins, reads the resolved baselines, and for each
        // wall whose joining endpoint sits on/inside a longer "through" host wall's
        // body, pulls that endpoint back to the host's inner face. Shell↔shell
        // L-corner miters are untouched (both walls are long → neither is the
        // "much-shorter partition", see _clampEndToShellInnerFace). §SHELL-ANCHOR-
        // PRESERVE is respected: the HOST (shell) is never moved.
        this._clampPartitionEndsToShellInnerFace(walls, bl, byId, result, thresholds);

        return result;
    }

    // ── §PARTITION-SHELL-INNER-FACE — final inner-face clamp ────────────────────

    /**
     * For every wall, test BOTH endpoints: if a joining endpoint terminates on a
     * longer "through" host (shell) wall's body but lands on the host CENTRELINE
     * side (at/beyond the inner face, i.e. inside the host's lateral half-thickness
     * band toward the host outer face), clamp it back to the host's INNER face — the
     * lateral face on the side of THIS wall's free end. Pure read of `bl` + thickness
     * from `byId`; only the partition's own endpoint moves.
     *
     * Shell-vs-partition is inferred geometrically (the resolver is a pure L2 package
     * and never receives the editor's `isExterior` facade flag): the host must be
     * the perpendicular-foot host, its foot must be strictly INSIDE the host span,
     * and the host must be materially LONGER than the wall being clamped (a shell is
     * long; a terminating partition is the stem). That excludes shell↔shell corners
     * (comparable length) and genuine interior crossings.
     */
    private static _clampPartitionEndsToShellInnerFace(
        walls:      WallData[],
        bl:         Map<string, [THREE.Vector3, THREE.Vector3]>,
        byId:       Map<string, WallData>,
        result:     Map<string, JoinData>,
        thresholds: JoinThresholds,
    ): void {
        const SNAP = thresholds.snapRadius;
        for (const w of walls) {
            const adj = result.get(w.id);
            if (adj?.invalid) continue;
            const cur = bl.get(w.id);
            if (!cur) continue;
            for (const side of ['start', 'end'] as Side[]) {
                this._clampEndToShellInnerFace(w, side, walls, bl, byId, result, SNAP, thresholds.minWallLength);
            }
        }
    }

    private static _clampEndToShellInnerFace(
        wall:       WallData,
        side:       Side,
        walls:      WallData[],
        bl:         Map<string, [THREE.Vector3, THREE.Vector3]>,
        _byId:      Map<string, WallData>,
        result:     Map<string, JoinData>,
        snap:       number,
        minLen:     number,
    ): void {
        const cur = bl.get(wall.id);
        if (!cur) return;
        const [ws, we] = cur;
        const joinPt = side === 'start' ? ws : we;
        const freePt = side === 'start' ? we : ws;
        if (ws.distanceTo(we) < 1e-6) return;

        // Find the best through-host: a wall whose BODY (mid-span) the join endpoint
        // sits on or inside. A "through" host's perpendicular foot is strictly INSIDE
        // its span — that is precisely a partition→shell BODY T-join (the founder's
        // "partition crossing the exterior wall line"). A shell↔shell L-corner is
        // endpoint-to-endpoint (foot AT the host's end), so it is excluded here and
        // its bisector miter is left untouched.
        let host: WallData | null = null;
        let hostContact = new THREE.Vector3();
        let hostHalfT = 0;
        let bestPerp = snap;
        for (const h of walls) {
            if (h.id === wall.id) continue;
            const hbl = bl.get(h.id);
            if (!hbl) continue;
            const [hs, he] = hbl;
            const c = this._closestOnSegment(joinPt, hs, he);
            const perp = joinPt.distanceTo(c);
            if (perp > bestPerp) continue;
            // Foot must be strictly INSIDE the host span (a real body T) — at least
            // one host half-thickness clear of either host end so a genuine corner
            // (endpoint↔endpoint) is never reclassified as a body-T.
            const endMargin = Math.max(0.05, h.thickness / 2);
            if (c.distanceTo(hs) < endMargin || c.distanceTo(he) < endMargin) continue;
            // The host must materially extend PAST the contact on both sides (it
            // "passes through" the junction) — the geometric signature of a shell
            // body relative to a terminating partition stem.
            host = h;
            hostContact = c;
            hostHalfT = h.thickness / 2;
            bestPerp = perp;
        }
        if (!host) return;

        // Lateral (side) face normal of the host, in XZ.
        const [hs, he] = bl.get(host.id)!;
        const hostDir = new THREE.Vector3().subVectors(he, hs).normalize();
        const sideNormal = new THREE.Vector3(-hostDir.z, 0, hostDir.x);

        // Which lateral face is the INNER (room-side) face? The one toward the
        // partition's FREE end (the room side). faceSign points to the free end.
        const toFree = new THREE.Vector3().subVectors(freePt, hostContact);
        const along = toFree.dot(hostDir);
        // Lateral component of the free end relative to the host (room side).
        const faceSign = sideNormal.dot(toFree) >= 0 ? 1 : -1;
        // Signed lateral offset of the CURRENT join endpoint from the host centreline.
        const curLateral = sideNormal.dot(new THREE.Vector3().subVectors(joinPt, hostContact)) * faceSign;
        // curLateral >= hostHalfT  → already at/outside the inner face on the room side
        //                            (clean butt — leave it; _applyT already did this).
        // curLateral <  hostHalfT  → the endpoint is on the centreline side / inside the
        //                            host body / past it toward the outer face → CLAMP it
        //                            out to the inner face so it butts cleanly.
        const INNER_EPS = 0.001;   // 1 mm overlap into the host body (no Z-fighting, no gap)
        const targetLateral = hostHalfT - INNER_EPS;
        if (curLateral >= targetLateral - 1e-4) {
            // Already on (or just inside) the inner face — clean. Nothing to do.
            return;
        }

        // New endpoint: keep the same position ALONG the host, set the lateral offset
        // to the inner face on the room side.
        const newJoin = hostContact.clone()
            .addScaledVector(hostDir, along)
            .addScaledVector(sideNormal, faceSign * targetLateral);
        newJoin.y = joinPt.y;

        // Guard: never collapse / invert this wall.
        const newLen = side === 'start' ? newJoin.distanceTo(we) : ws.distanceTo(newJoin);
        if (newLen < minLen) {
            console.warn(
                `[WallJoinResolver] §PARTITION-SHELL-INNER-FACE REFUSED — clamp would collapse ` +
                `${wall.id}(${side}) newLen=${newLen.toFixed(4)} (MIN=${minLen})`,
            );
            return;
        }

        const newBL: [THREE.Vector3, THREE.Vector3] =
            side === 'start' ? [newJoin, we.clone()] : [ws.clone(), newJoin];
        bl.set(wall.id, newBL);
        const adj: JoinData = result.get(wall.id) ?? { baseLine: newBL, startMN: null, endMN: null };
        adj.baseLine = newBL;
        // Cap the partition flush against the host's inner face (coplanar end cap).
        const miter = { nx: faceSign * sideNormal.x, nz: faceSign * sideNormal.z };
        if (side === 'start') adj.startMN = miter;
        else                  adj.endMN   = miter;
        result.set(wall.id, adj);

        // §DIAG-WALL-JOIN — partition→shell T-join inner-face clamp (always-on).
        // landed=innerFace ✓ once the clamp has run (the endpoint now sits exactly
        // on the room-side face); the BEFORE classification tells whether it was on
        // the centreline (⚠) or had protruded past the inner face toward the outer
        // façade (⚠) — both are the founder's defect, now corrected.
        const beforeCls =
            curLateral <= -hostHalfT + 1e-3 ? 'protrudes⚠'
            : Math.abs(curLateral) <= 1e-3   ? 'centreline⚠'
            : 'insideBody⚠';
        console.log(
            `[WallJoinResolver] §DIAG-WALL-JOIN PARTITION→SHELL ${wall.id}(${side}) host=${host.id} ` +
            `before=${beforeCls} (lateral=${(curLateral * 1000).toFixed(1)}mm of innerFace=${(hostHalfT * 1000).toFixed(1)}mm) ` +
            `clamp=+${((targetLateral - curLateral) * 1000).toFixed(1)}mm landed=innerFace✓`,
        );
        // Touch `along` use to avoid an unused-var lint if the helper is trimmed later.
        void along;
    }

    // ── §WJR-INVALID — durable degenerate-wall flag (A.WJ.MULTICLUSTER) ───────

    /**
     * §WJR-INVALID — flag a wall the resolver cannot validly join as `invalid`
     * in the result map, carrying a human-readable reason, and preserve its
     * current baseline so the record is well-formed. The mesh builder
     * (WallFragmentBuilder.buildWall) reads `JoinData.invalid` FIRST and skips
     * the wall's geometry build by intent — logging once which wall was skipped —
     * instead of relying on the consumer's defensive non-finite/near-zero
     * baseline sniff (which remains as a backstop).
     *
     * Covers every degeneracy vector reachable at resolve time: a self-cluster
     * wall (both endpoints in one junction), a diff-thickness offset that even
     * the clean-butt fallback cannot rescue, and a zero/near-zero-length or
     * non-finite baseline. Idempotent — re-flagging keeps the first reason.
     */
    private static _flagInvalid(
        wallId: string,
        bl:     Map<string, [THREE.Vector3, THREE.Vector3]>,
        result: Map<string, JoinData>,
        reason: string,
    ): void {
        const existing = result.get(wallId);
        const curBL = bl.get(wallId);
        // Preserve the wall's current baseline (un-trimmed for self-cluster, or
        // whatever the partial trim produced) so the flagged record is shaped
        // exactly like a normal JoinData — only `invalid` differs.
        const baseLine: [THREE.Vector3, THREE.Vector3] =
            existing?.baseLine ??
            (curBL ? [curBL[0].clone(), curBL[1].clone()] : [new THREE.Vector3(), new THREE.Vector3()]);
        const adj: JoinData = existing ?? { baseLine, startMN: null, endMN: null };
        adj.baseLine = baseLine;
        if (!adj.invalid) {
            adj.invalid = true;
            adj.invalidReason = reason;
        }
        result.set(wallId, adj);
    }

    /**
     * §WJR-INVALID — flag a wall invalid ONLY when its CURRENT (un-trimmed)
     * baseline is itself degenerate: non-finite coordinate OR length below
     * `minLen`. Used at the diff-thickness refusal points, where the trim is
     * abandoned and the wall is left at its source baseline — we must not flag a
     * perfectly good long wall just because one trim was refused, but a wall
     * whose own input is already zero-length / NaN must be skipped by intent.
     */
    private static _flagInvalidIfDegenerate(
        wallId: string,
        bl:     Map<string, [THREE.Vector3, THREE.Vector3]>,
        result: Map<string, JoinData>,
        minLen: number,
        reason: string,
    ): void {
        const curBL = bl.get(wallId);
        if (!curBL) return;
        const [s, e] = curBL;
        const finite =
            Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.z) &&
            Number.isFinite(e.x) && Number.isFinite(e.y) && Number.isFinite(e.z);
        if (!finite || s.distanceTo(e) < minLen) {
            this._flagInvalid(wallId, bl, result, reason);
        }
    }

    // ── §MULTI-CLUSTER — Multi-wall junction pre-pass ─────────────────────────

    /**
     * Detects junction clusters of 3+ endpoints and applies a consensus-point
     * trim to ALL walls in each cluster simultaneously.
     *
     * Why square (null) end caps for multi-wall junctions?
     *   A miter bisector only has a closed-form solution for EXACTLY two walls.
     *   For three or more walls meeting at a point, each wall's "correct" cut plane
     *   depends on WHICH two neighbours bound it angularly — and for symmetric
     *   junctions the bisector degenerates to the wall's own direction anyway
     *   (equivalent to a square cap).  Square caps guarantee watertight geometry
     *   without any gaps or overlaps, which is the production-safe choice.
     *
     * For each cluster wall, only the join-END (the endpoint inside the cluster)
     * is affected.  The opposite (free) end inherits its normal from the regular
     * pair-wise pass, which runs immediately after this method returns.
     *
     * @returns Set of endpoint keys (`${wallId}:${side}`) that are fully handled
     *          and must be skipped by the subsequent pair-wise `_detect` loop.
     */
    private static _handleMultiWallClusters(
        walls:      WallData[],
        bl:         Map<string, [THREE.Vector3, THREE.Vector3]>,
        _byId:      Map<string, WallData>,
        result:     Map<string, JoinData>,
        thresholds: JoinThresholds,
    ): Set<string> {

        const handledKeys = new Set<string>();

        const clusters = detectJunctionClusters(walls, bl, thresholds.snapRadius);
        if (clusters.length === 0) return handledKeys;

        // PERF-FIX (Apr 2026): Per-endpoint MULTI-CLUSTER logs are gated behind
        // the `__pryzmDebugWalls` flag (same flag WallJunctionClustering uses).
        // Old projects with dense junctions could emit hundreds of console.log
        // lines per resolveLevel pass — with DevTools open this blocks the main
        // thread for many seconds and made loads appear hung at the last
        // "trimmed → (...)" line. We retain ONE concise per-cluster summary
        // line (always logged) so production diagnostics still show how many
        // clusters were resolved and how each endpoint was classified.
        const _verboseClusterLogs = !!(globalThis as any).window?.__pryzmDebugWalls;

        for (const cluster of clusters) {
            const { endpoints, consensusPoint } = cluster;
            // Per-cluster outcome counters used for the always-on summary line.
            let _cntPrimary = 0, _cntTInto = 0, _cntPinned = 0, _cntTrimmed = 0;
            let _cntSkippedSelfCluster = 0;
            // §SHELL-ANCHOR-PRESERVE: endpoints left for the pair-wise T-join because
            // they sit on a non-cluster (shell) wall body — must stay on the perimeter.
            let _cntShellAnchorPreserved = 0;

            if (_verboseClusterLogs) {
                console.log(
                    `[WallJoinResolver] §MULTI-CLUSTER: ${endpoints.length}-way junction at ` +
                    `(${consensusPoint.x.toFixed(3)}, ${consensusPoint.z.toFixed(3)})`
                );
            }

            // §SELF-CLUSTER-GUARD (Apr 2026): a wall whose BOTH endpoints land
            // in the same cluster (transitively through other walls) would have
            // both ends trimmed to the SAME consensus point — collapsing the
            // wall to zero length. Identify those walls up-front so the loop
            // below skips them entirely (leaves their original baseline
            // untouched, no handled key, no result entry). Without this guard
            // downstream geometry construction throws or hangs the project load.
            const _wallEpCount = new Map<string, number>();
            for (const ep of endpoints) {
                _wallEpCount.set(ep.wallId, (_wallEpCount.get(ep.wallId) ?? 0) + 1);
            }
            const _selfClusterWallIds = new Set<string>();
            for (const [wid, cnt] of _wallEpCount) {
                if (cnt >= 2) _selfClusterWallIds.add(wid);
            }

            // ── Identify "pinned" endpoint pairs ─────────────────────────────────
            // A pinned pair is two endpoints from DIFFERENT walls that are already
            // exactly coincident (≤1 mm).  They form a committed corner join that was
            // placed by a prior join pass.
            //
            // §SECONDARY-PINNED-FIX (Apr 2026):
            //   In addition to `pinnedKeys` (which endpoint is pinned at all),
            //   we now also track `pinnedPairMap` (which specific endpoint is
            //   paired with which).  This lets us distinguish:
            //     • PRIMARY pinned pair  — the most-perpendicular pair, deferred to
            //       the pair-wise loop exactly as before.
            //     • SECONDARY pinned pair — a second coincident pair at or near the
            //       same cluster point (e.g. two separate L-corners meeting within
            //       snapRadius).  Previously these were also deferred to the
            //       pair-wise loop, but the premature bl.set (which moved all four
            //       endpoints to the cluster consensus) caused the pair-wise loop to
            //       see all four endpoints at the same position and produce six
            //       cross-pair corner joins instead of two correct ones.
            //       We now detect these secondary pairs and handle them inline.
            const PINNED_TOL = 0.001;
            const pinnedKeys = new Set<string>();
            const pinnedPairMap = new Map<string, { partnerKey: string; coincidentPt: THREE.Vector3 }>();

            for (let i = 0; i < endpoints.length; i++) {
                const posI = this._getEpPos(endpoints[i], bl);
                const keyI = `${endpoints[i].wallId}:${endpoints[i].side}`;
                for (let j = i + 1; j < endpoints.length; j++) {
                    if (endpoints[i].wallId === endpoints[j].wallId) continue;
                    const posJ = this._getEpPos(endpoints[j], bl);
                    if (posI.distanceTo(posJ) <= PINNED_TOL) {
                        const keyJ = `${endpoints[j].wallId}:${endpoints[j].side}`;
                        pinnedKeys.add(keyI);
                        pinnedKeys.add(keyJ);
                        // Track the pair so secondary pairs can be handled inline.
                        // Only the first coincident partner is recorded (nearest wins
                        // if a single endpoint is somehow coincident with multiple others).
                        if (!pinnedPairMap.has(keyI)) {
                            pinnedPairMap.set(keyI, { partnerKey: keyJ, coincidentPt: posI.clone() });
                        }
                        if (!pinnedPairMap.has(keyJ)) {
                            pinnedPairMap.set(keyJ, { partnerKey: keyI, coincidentPt: posI.clone() });
                        }
                    }
                }
            }

            // ── §T-INTO-CORNER (Apr 2026) ────────────────────────────────────────
            // When a NEW wall is drawn whose endpoint snaps onto a junction where
            // two walls already form a committed corner (typically a 90° L), the
            // user's expectation is that the new wall T-joins against the FACE of
            // the perpendicular existing wall — NOT that all three walls participate
            // in a 3-way bisector miter (which produces a triangular wedge at the
            // end cap of the new wall).
            //
            // Strategy:
            //   1. Among the cluster's pinned-pair endpoints, identify a "primary
            //      corner" — the pair (wallA, wallB) whose tangent directions at
            //      the junction are most perpendicular (smallest |dot|), broken
            //      ties by older creation order so the original L corner wins
            //      against any newer wall that may also be pinned coincident.
            //   2. The primary-corner walls keep the existing pinned behaviour:
            //      not added to handledKeys, deferred to the pair-wise loop which
            //      writes the standard bisector miter for the L corner.
            //   3. EVERY OTHER endpoint in the cluster (whether pinned coincident
            //      or merely within snapRadius) is treated as a T-attacher:
            //      _applyT trims its joining endpoint onto the lateral face of the
            //      most perpendicular primary-corner wall and writes a flush miter.
            //      It is then added to handledKeys so the pair-wise loop skips it
            //      and never overrides the T-trim with a stray bisector miter.
            //
            // This change is intentionally narrow: it only kicks in when the cluster
            // has a perpendicular pinned pair (an existing committed L corner). For
            // fresh Y/star junctions where no two walls are pre-joined, the primary
            // corner is null and behaviour is identical to before.
            const PERP_DOT_THRESHOLD = 0.5;            // |dot| < 0.5 ≈ angle > 60°

            interface PrimaryPair {
                idA: string; sideA: Side;
                idB: string; sideB: Side;
                dirA: THREE.Vector3;
                dirB: THREE.Vector3;
            }

            let primaryPair: PrimaryPair | null = null;
            let primaryDot = Infinity;
            let primaryMaxCreatedAt = Infinity;

            for (let i = 0; i < endpoints.length; i++) {
                const epA  = endpoints[i];
                if (!pinnedKeys.has(`${epA.wallId}:${epA.side}`)) continue;
                if (_selfClusterWallIds.has(epA.wallId)) continue; // §SELF-CLUSTER-GUARD
                const wallA = _byId.get(epA.wallId);
                if (!wallA) continue;
                const posA = this._getEpPos(epA, bl);

                for (let j = i + 1; j < endpoints.length; j++) {
                    const epB = endpoints[j];
                    if (epA.wallId === epB.wallId) continue;
                    if (_selfClusterWallIds.has(epB.wallId)) continue; // §SELF-CLUSTER-GUARD
                    if (!pinnedKeys.has(`${epB.wallId}:${epB.side}`)) continue;
                    const wallB = _byId.get(epB.wallId);
                    if (!wallB) continue;
                    const posB = this._getEpPos(epB, bl);

                    // Require the two endpoints to be directly coincident
                    // (not merely sharing a transitive cluster membership).
                    if (posA.distanceTo(posB) > PINNED_TOL) continue;

                    const [aS, aE] = bl.get(epA.wallId)!;
                    const [bS, bE] = bl.get(epB.wallId)!;
                    const dirA = this._wallDirAtJoin(wallA, epA.side, aS, aE);
                    const dirB = this._wallDirAtJoin(wallB, epB.side, bS, bE);
                    const absDot = Math.abs(dirA.dot(dirB));

                    if (absDot >= PERP_DOT_THRESHOLD) continue;

                    const maxCreated = Math.max(
                        wallA.metadata?.createdAt ?? 0,
                        wallB.metadata?.createdAt ?? 0,
                    );

                    // Pick the most perpendicular pair; on ties prefer the
                    // OLDER pair (so a freshly drawn wall snapping onto an
                    // existing corner does not steal "primary" status).
                    const isMorePerpendicular = absDot < primaryDot - 1e-3;
                    const isTiedButOlder      =
                        Math.abs(absDot - primaryDot) <= 1e-3 &&
                        maxCreated < primaryMaxCreatedAt;

                    if (isMorePerpendicular || isTiedButOlder) {
                        primaryDot = absDot;
                        primaryMaxCreatedAt = maxCreated;
                        primaryPair = {
                            idA: epA.wallId, sideA: epA.side,
                            idB: epB.wallId, sideB: epB.side,
                            dirA, dirB,
                        };
                    }
                }
            }

            const primaryWallIds: Set<string> = primaryPair
                ? new Set([primaryPair.idA, primaryPair.idB])
                : new Set();

            // ── §PASS-THROUGH-FLUSH (Jun 2026 — A.21.D40) ────────────────────────
            // The reported field defect ("corners not cleanly joined — gaps/overlaps
            // — `3 endpoints @ (x,y) [primary=2 t-into=1]`") is a 3-way junction that
            // is really a T-JUNCTION: two of the cluster walls are (near-)collinear
            // and pass STRAIGHT THROUGH the junction, while the third is the stem.
            //
            // The §T-INTO-CORNER + primary-corner path treats the most-perpendicular
            // pinned pair as an L corner and writes a 45° bisector miter on BOTH —
            // but for a straight pass-through that bisector PULLS the through-wall's
            // outer cap back off the junction line, opening a triangular gap on the
            // outside of the T (and an overlap on the inside). A bisector miter is
            // only valid when exactly two walls bound the corner sector; with a
            // collinear pass-through present it is geometrically wrong.
            //
            // Fix: if ANY two cluster walls are near-collinear at the junction
            // (|tangent·tangent| ≥ COLLINEAR_DOT, i.e. ~≤10° from a straight line),
            // resolve the WHOLE cluster with square (perpendicular) end caps trimmed
            // to the consensus point — the file's stated watertight doctrine for 3+
            // junctions (see method header). The pass-through walls then meet flush
            // along one plane and the stem butts cleanly against their bodies: no
            // gap, no overrun, in both plan and 3D. Square caps (null MN) are stable
            // and cacheable, so the §rebuildWallBodies cached-miter path is unaffected.
            //
            // Pure Y/star junctions (no collinear pair) keep the existing behaviour.
            const COLLINEAR_DOT = 0.985; // cos(~10°)
            let clusterHasPassThrough = false;
            for (let i = 0; i < endpoints.length && !clusterHasPassThrough; i++) {
                const epI = endpoints[i];
                if (_selfClusterWallIds.has(epI.wallId)) continue;
                const wI = _byId.get(epI.wallId);
                if (!wI) continue;
                const [iS, iE] = bl.get(epI.wallId)!;
                const dirI = this._wallDirAtJoin(wI, epI.side, iS, iE, consensusPoint);
                for (let j = i + 1; j < endpoints.length; j++) {
                    const epJ = endpoints[j];
                    if (epJ.wallId === epI.wallId) continue;
                    if (_selfClusterWallIds.has(epJ.wallId)) continue;
                    const wJ = _byId.get(epJ.wallId);
                    if (!wJ) continue;
                    const [jS, jE] = bl.get(epJ.wallId)!;
                    const dirJ = this._wallDirAtJoin(wJ, epJ.side, jS, jE, consensusPoint);
                    if (Math.abs(dirI.dot(dirJ)) >= COLLINEAR_DOT) {
                        clusterHasPassThrough = true;
                        break;
                    }
                }
            }

            // §SECONDARY-PINNED-FIX: per-cluster counter for secondary pinned
            // pairs handled inline (separate from singleton-pinned deferrals).
            let _cntSecPinned = 0;

            // ── §MULTI-CLUSTER-WHY (2026-06-09 diagnostic) ───────────────────────
            // The founder reported the recurring "rooms merge after creation"
            // defect with EVERY interior cluster logging `primary=0 t-into=0
            // pinned=0 trimmed=3`. That signature means: NO two endpoints from
            // different walls in this cluster are within PINNED_TOL (1 mm), so no
            // pinned pair → no primary corner → no T-into → every member falls to
            // the consensus trim. When one of those members was actually welded
            // ONTO a SHELL (perimeter) wall's BODY — and the shell wall's own
            // endpoints are far away (not cluster members) — the resolver has no
            // idea the endpoint is perimeter-anchored, so the consensus trim pulls
            // it OFF the shell toward the interior partition-only centroid → the
            // room stops sealing. This block surfaces, per cluster + per endpoint,
            // exactly WHY the cluster is unpinned and which endpoints sit on a
            // non-cluster wall body (a shell T-anchor the trim would break).
            const _whyOn = !!(globalThis as any).window?.__pryzmDebugWalls || true; // always on (founder asked)
            // Endpoints in THIS cluster, by key, for "is the body-host a cluster member?" test.
            const _clusterWallIds = new Set(endpoints.map(e => e.wallId));
            // Detect, per endpoint, whether it lies on the BODY (mid-span, not at an
            // endpoint) of some OTHER wall that is NOT part of this cluster. That is
            // the shell-T-anchor case the consensus trim must not break.
            const _bodyAnchorOf = (ep: { wallId: string; side: Side }): { hostId: string; perp: number } | null => {
                const pos = this._getEpPos(ep, bl);
                let bestHost: string | null = null;
                let bestPerp = thresholds.snapRadius;
                for (const w of walls) {
                    if (w.id === ep.wallId) continue;
                    if (_clusterWallIds.has(w.id)) continue;      // only NON-cluster (e.g. shell) bodies
                    const [hs, he] = bl.get(w.id)!;
                    const c = this._closestOnSegment(pos, hs, he);
                    const perp = pos.distanceTo(c);
                    if (perp > bestPerp) continue;
                    // Must be on the BODY, not at one of the host's endpoints (≥0.05 m in).
                    if (c.distanceTo(hs) < 0.05 || c.distanceTo(he) < 0.05) continue;
                    bestPerp = perp; bestHost = w.id;
                }
                return bestHost ? { hostId: bestHost, perp: bestPerp } : null;
            };
            const _hasPinned   = pinnedKeys.size > 0;
            const _hasPrimary  = !!primaryPair;
            if (_whyOn) {
                const _reason =
                    clusterHasPassThrough ? 'PASS-THROUGH (collinear pair → square caps to consensus)'
                    : _hasPrimary         ? 'HAS-PRIMARY-CORNER (pinned perpendicular pair found)'
                    : _hasPinned          ? 'PINNED-BUT-NOT-PERPENDICULAR (pinned pair(s) exist, none < PERP_DOT)'
                    : 'UNPINNED (no two cross-wall endpoints within 1 mm → ALL will trim to consensus)';
                const _epLines = endpoints.map(ep => {
                    const pos = this._getEpPos(ep, bl);
                    const body = _bodyAnchorOf(ep);
                    const dC = Math.hypot(pos.x - consensusPoint.x, pos.z - consensusPoint.z);
                    return `${ep.wallId}(${ep.side}) @(${pos.x.toFixed(3)},${pos.z.toFixed(3)}) ` +
                        `dConsensus=${dC.toFixed(3)}m` +
                        (body ? ` BODY-ANCHORED→${body.hostId} perp=${body.perp.toFixed(3)}m` : ' free') +
                        (_selfClusterWallIds.has(ep.wallId) ? ' SELF-CLUSTER' : '');
                });
                console.log(
                    `[WallJoinResolver] §MULTI-CLUSTER-WHY ${endpoints.length}-way @ ` +
                    `(${consensusPoint.x.toFixed(3)},${consensusPoint.z.toFixed(3)}) reason=${_reason} ` +
                    `pinned=${pinnedKeys.size} primaryPair=${_hasPrimary} passThrough=${clusterHasPassThrough}\n  ` +
                    _epLines.join('\n  ')
                );
            }

            for (const ep of endpoints) {
                // §SELF-CLUSTER-GUARD: skip walls whose BOTH endpoints are in
                // this cluster. Trimming either end would collapse the wall.
                //
                // §WJR-INVALID (Jun 2026 — durable layer): rather than silently
                // leaving the wall untrimmed (relying on the consumer's NaN sniff
                // to notice the resulting degenerate geometry), explicitly FLAG it
                // invalid in the result map. The mesh builder then skips its build
                // BY INTENT — and we KNOW (via the flag/log) which walls were
                // skipped. The original baseline is preserved in the flagged record
                // so a later valid rebuild (e.g. after the user fixes the topology)
                // can restore it.
                if (_selfClusterWallIds.has(ep.wallId)) {
                    _cntSkippedSelfCluster++;
                    this._flagInvalid(ep.wallId, bl, result, 'self-cluster');
                    continue;
                }

                const epKey = `${ep.wallId}:${ep.side}`;

                // §SECONDARY-PINNED-FIX: a secondary pinned pair processes both
                // endpoints at once; skip the partner when we reach it.
                if (handledKeys.has(epKey)) continue;

                const [ws, we] = bl.get(ep.wallId)!;

                // ── §SHELL-ANCHOR-PRESERVE (2026-06-09, THE founder room-merge fix) ──
                // This endpoint may have been welded ONTO the BODY of a perimeter
                // (shell) wall by weldPartitionsToShell. That shell wall's OWN
                // endpoints are at its far corners, so it is NOT a member of THIS
                // cluster — the cluster sees only the nearby PARTITION endpoints and
                // computes an interior-only consensus (or, when two partitions are
                // near-parallel, classifies it as a PASS-THROUGH). EITHER way the
                // cluster pass trims this endpoint to that interior point and pulls
                // the partition OFF the shell — the founder's "wall_…ZRQMW did not
                // reach perimeter wall_…C7XT". The room then never seals →
                // RoomDetectionEngine floods across the gap and merges the social
                // rooms into the 82.4 m² blob (Living/Bedroom/Kitchen/Hall).
                //
                // FIX: if this endpoint currently lies on the BODY (mid-span) of a
                // NON-cluster wall within snapRadius, do NOT let the cluster pass
                // touch it AT ALL (pre-empts pass-through, pinned, primary AND the
                // consensus trim). Leave it UN-handled so the pair-wise T-join pass
                // (_detect → _applyT) trims it cleanly onto that shell wall's lateral
                // face — keeping the partition ON the perimeter where the weld
                // correctly placed it, so the room seals. Pure read of the working
                // baselines; no new state. Regression-safe: a TRUE interior Y/star
                // junction has no non-cluster body under its endpoints → bodyHost is
                // null → behaviour byte-identical. A genuine partition↔partition
                // corner whose host IS a cluster member is excluded by the
                // _clusterWallIds filter inside _bodyAnchorOf, so it is unaffected.
                const _bodyHost = _bodyAnchorOf(ep);
                if (_bodyHost) {
                    _cntShellAnchorPreserved++;
                    console.log(
                        `[WallJoinResolver] §SHELL-ANCHOR-PRESERVE  wall=${ep.wallId}(${ep.side}) ` +
                        `on non-cluster (perimeter) body of ${_bodyHost.hostId} ` +
                        `(perp=${_bodyHost.perp.toFixed(3)}m) — NOT cluster-trimmed; deferred to ` +
                        `pair-wise T-join so it stays on the perimeter and the room seals`
                    );
                    continue;
                }

                // ── §PASS-THROUGH-FLUSH: square cap to consensus for the whole cluster ──
                // When this cluster contains a near-collinear pass-through pair the
                // bisector-miter L path is invalid (it gaps). Trim EVERY endpoint to
                // the consensus point with a square (perpendicular) cap and mark it
                // handled so the pair-wise loop never re-mitres it. This is the same
                // watertight write as the non-pinned default branch below, but it
                // applies UNCONDITIONALLY (incl. pinned + would-be-primary walls) so
                // the through-walls stay straight and the stem butts flush.
                if (clusterHasPassThrough) {
                    const trimPtPT = consensusPoint.clone();
                    trimPtPT.y = ep.side === 'start' ? ws.y : we.y;   // preserve floor Y
                    const newBLPT: [THREE.Vector3, THREE.Vector3] =
                        ep.side === 'start'
                            ? [trimPtPT, we.clone()]
                            : [ws.clone(), trimPtPT];
                    // §DEGENERATE-WALL-GUARD: never collapse a wall below the minimum
                    // length (a self-cluster wall is already excluded above, but a
                    // very short stem could still round to zero against consensus).
                    if (newBLPT[0].distanceTo(newBLPT[1]) < thresholds.minWallLength) {
                        this._flagInvalidIfDegenerate(
                            ep.wallId, bl, result, thresholds.minWallLength, 'pass-through-collapse',
                        );
                        handledKeys.add(epKey);
                        continue;
                    }
                    bl.set(ep.wallId, newBLPT);
                    const adjPT: JoinData = result.get(ep.wallId) ?? {
                        baseLine: newBLPT, startMN: null, endMN: null,
                    };
                    adjPT.baseLine = newBLPT;
                    if (ep.side === 'start') adjPT.startMN = null;
                    else                     adjPT.endMN   = null;
                    result.set(ep.wallId, adjPT);
                    handledKeys.add(epKey);
                    _cntTrimmed++;
                    if (_verboseClusterLogs) {
                        console.log(
                            `[WallJoinResolver] §MULTI-CLUSTER  wall=${ep.wallId}(${ep.side}) ` +
                            `PASS-THROUGH-FLUSH (square cap) → ` +
                            `(${trimPtPT.x.toFixed(3)}, ${trimPtPT.z.toFixed(3)})`
                        );
                    }
                    continue;
                }

                const isPinned        = pinnedKeys.has(epKey);
                const isInPrimaryPair = primaryWallIds.has(ep.wallId);

                // ── Primary-corner wall: defer to pair-wise loop ─────────────
                // The pair-wise loop produces the correct L bisector miter for
                // the two existing committed walls. We must NOT override it here.
                // §SECONDARY-PINNED-FIX: do NOT pre-mutate bl for primary walls.
                // Previously bl.set ran unconditionally before these checks,
                // moving primary endpoints to the consensus point and causing the
                // pair-wise loop to see them coincident with the secondary pair.
                if (isInPrimaryPair) {
                    _cntPrimary++;
                    if (_verboseClusterLogs) {
                        console.log(
                            `[WallJoinResolver] §MULTI-CLUSTER  wall=${ep.wallId}(${ep.side}) ` +
                            `PRIMARY-CORNER — miter deferred to pair-wise loop`
                        );
                    }
                    continue;
                }

                // ── §T-INTO-CORNER: try to T-attach this wall to the primary corner ──
                // Only when a primary corner exists. The host is whichever primary
                // wall is more perpendicular to this attacher (so the attacher's end
                // cap lies flush against the host's lateral face).
                if (primaryPair) {
                    const wallNew = _byId.get(ep.wallId);
                    if (wallNew) {
                        const newDir = this._wallDirAtJoin(wallNew, ep.side, ws, we);
                        const absDotA = Math.abs(newDir.dot(primaryPair.dirA));
                        const absDotB = Math.abs(newDir.dot(primaryPair.dirB));
                        const hostId    = absDotA <= absDotB ? primaryPair.idA : primaryPair.idB;
                        const hostBest  = Math.min(absDotA, absDotB);

                        if (hostBest < PERP_DOT_THRESHOLD) {
                            // Construct a synthetic T-join and let _applyT do the
                            // face projection + miter-normal write.
                            // §SECONDARY-PINNED-FIX: _applyT reads bl[secondary] to
                            // find the joining endpoint and projects from there.
                            // We no longer pre-move bl to consensus before calling it
                            // (the premature move left the wall at consensus if
                            // _applyT bailed, causing incorrect geometry).
                            // _applyT uses currentContact (re-projected endpoint) so
                            // the slight positional difference (pinned pt vs consensus)
                            // is at most PINNED_TOL (1 mm) — negligible in practice.
                            const tJoin: TJoin = {
                                kind:        't',
                                secondary:   { wallId: ep.wallId, side: ep.side },
                                hostWallId:  hostId,
                                contactPoint: consensusPoint.clone(),
                            };
                            this._applyT(tJoin, bl, _byId, result, thresholds);

                            const adjAfterT = result.get(ep.wallId);
                            const mnAfterT  = ep.side === 'start'
                                ? adjAfterT?.startMN
                                : adjAfterT?.endMN;
                            if (mnAfterT) {
                                handledKeys.add(epKey);
                                _cntTInto++;
                                if (_verboseClusterLogs) {
                                    console.log(
                                        `[WallJoinResolver] §MULTI-CLUSTER  wall=${ep.wallId}(${ep.side}) ` +
                                        `T-INTO-CORNER → host=${hostId} (|dot|=${hostBest.toFixed(3)})`
                                    );
                                }
                                continue;
                            }
                            // _applyT bailed (e.g. wall parallel to host face, or
                            // short-wall safety) → fall through to pinned/trimmed.
                        }
                    }
                }

                // ── Pinned endpoint handling ──────────────────────────────────
                if (isPinned) {
                    // §SECONDARY-PINNED-FIX:
                    // Determine if this endpoint's coincident partner is also in
                    // this cluster AND is not a primary-corner wall.  If so, this
                    // is a "secondary pinned pair" — a second L-corner that is
                    // geometrically close to the primary pair.
                    //
                    // OLD behaviour: both endpoints deferred to pair-wise loop with
                    //   bl already moved to consensus → pair-wise saw all 4 endpoints
                    //   at the same point → produced 6 cross-pair corner joins.
                    //
                    // NEW behaviour: secondary pair handled inline with a bisector
                    //   miter at their own coincident point, both added to
                    //   handledKeys → pair-wise loop never touches them.
                    const pairInfo   = pinnedPairMap.get(epKey);
                    const partnerKey = pairInfo?.partnerKey;

                    if (pairInfo && partnerKey) {
                        const partnerWallId = partnerKey.split(':')[0] as string;
                        const partnerIsNotPrimary = !primaryWallIds.has(partnerWallId);
                        const partnerNotHandled   = !handledKeys.has(partnerKey);

                        if (partnerIsNotPrimary && partnerNotHandled) {
                            // Find the partner endpoint descriptor.
                            const partnerEp = endpoints.find(
                                e => `${e.wallId}:${e.side}` === partnerKey
                            );
                            const wallC = _byId.get(ep.wallId);
                            const wallD = partnerEp ? _byId.get(partnerEp.wallId) : undefined;

                            if (partnerEp && wallC && wallD) {
                                const coincidentPt = pairInfo.coincidentPt;
                                const [pWS, pWE]   = bl.get(partnerEp.wallId)!;

                                // Compute bisector miter (same logic as _applyCorner).
                                const dirC = this._wallDirAtJoin(wallC, ep.side,         ws,  we,  coincidentPt);
                                const dirD = this._wallDirAtJoin(wallD, partnerEp.side,  pWS, pWE, coincidentPt);
                                const bisectorSum = new THREE.Vector3().addVectors(dirC, dirD);
                                const base = bisectorSum.length() > 1e-6
                                    ? bisectorSum.normalize()
                                    : new THREE.Vector3(-dirC.z, 0, dirC.x).normalize();
                                const mnC = WallJoinResolver._pickMiterNormal(base, dirC, ep.side);
                                const mnD = WallJoinResolver._pickMiterNormal(base, dirD, partnerEp.side);

                                // Trim both walls to their own coincident point
                                // (NOT the cluster consensus — that could shift them
                                // away from their correctly-placed corner position).
                                const trimPtC = coincidentPt.clone();
                                trimPtC.y = ep.side === 'start' ? ws.y : we.y;
                                const newBLC: [THREE.Vector3, THREE.Vector3] =
                                    ep.side === 'start'
                                        ? [trimPtC, we.clone()]
                                        : [ws.clone(), trimPtC];
                                bl.set(ep.wallId, newBLC);
                                const adjC = result.get(ep.wallId)
                                    ?? { baseLine: newBLC, startMN: null, endMN: null };
                                adjC.baseLine = newBLC;
                                if (ep.side === 'start') adjC.startMN = mnC;
                                else                     adjC.endMN   = mnC;
                                result.set(ep.wallId, adjC);
                                handledKeys.add(epKey);

                                const trimPtD = coincidentPt.clone();
                                trimPtD.y = partnerEp.side === 'start' ? pWS.y : pWE.y;
                                const newBLD: [THREE.Vector3, THREE.Vector3] =
                                    partnerEp.side === 'start'
                                        ? [trimPtD, pWE.clone()]
                                        : [pWS.clone(), trimPtD];
                                bl.set(partnerEp.wallId, newBLD);
                                const adjD = result.get(partnerEp.wallId)
                                    ?? { baseLine: newBLD, startMN: null, endMN: null };
                                adjD.baseLine = newBLD;
                                if (partnerEp.side === 'start') adjD.startMN = mnD;
                                else                            adjD.endMN   = mnD;
                                result.set(partnerEp.wallId, adjD);
                                handledKeys.add(partnerKey);

                                _cntSecPinned += 2;
                                if (_verboseClusterLogs) {
                                    console.log(
                                        `[WallJoinResolver] §MULTI-CLUSTER  wall=${ep.wallId}(${ep.side}) ` +
                                        `SECONDARY-PINNED-PAIR → partner=${partnerEp.wallId}(${partnerEp.side}) ` +
                                        `@ (${coincidentPt.x.toFixed(3)}, ${coincidentPt.z.toFixed(3)})`
                                    );
                                }
                                continue;
                            }
                        }
                    }

                    // Singleton pinned (partner is primary, or partner not in this
                    // cluster, or wall data missing): defer to pair-wise loop.
                    // §SECONDARY-PINNED-FIX: do NOT pre-mutate bl here either.
                    // The pair-wise loop will use the wall's original position.
                    _cntPinned++;
                    if (_verboseClusterLogs) {
                        console.log(
                            `[WallJoinResolver] §MULTI-CLUSTER  wall=${ep.wallId}(${ep.side}) ` +
                            `PINNED-SINGLETON — miter deferred to pair-wise loop`
                        );
                    }
                    continue;
                }

                // ── Non-pinned, non-primary: trim to consensus and mark handled ─
                // §SECONDARY-PINNED-FIX: bl.set is now deferred to this point
                // (only runs for endpoints that actually need the consensus trim).
                //
                // §CONSENSUS-PROXIMITY-GUARD (2026-06-08) — only collapse an endpoint
                // to the averaged consensus when it is GENUINELY at this junction. The
                // level-wide cluster snap radius (≤1.0 m) is far wider than the upstream
                // partition weld band (0.45 m, §WJ-SKEW), so a wide cluster can sweep
                // DISTINCT junctions together and average a consensus near none of them.
                // Trimming such an endpoint drags a partition up to ~1 m off the
                // perimeter → the room never seals (the "Living/Bedroom/Corridor" merge).
                // If the endpoint is farther from consensus (in the XZ plane) than the
                // weld band, do NOT trim it here — leave it un-handled so the pair-wise
                // corner/T-join pass resolves it against its TRUE neighbour, or leaves it
                // on the perimeter where the weld correctly placed it.
                const epPos = ep.side === 'start' ? ws : we;
                const CONSENSUS_TRIM_TOL = Math.min(thresholds.snapRadius, 0.45);
                const _dxC = epPos.x - consensusPoint.x;
                const _dzC = epPos.z - consensusPoint.z;
                if (Math.hypot(_dxC, _dzC) > CONSENSUS_TRIM_TOL) {
                    if (_verboseClusterLogs) {
                        console.log(
                            `[WallJoinResolver] §CONSENSUS-PROXIMITY-GUARD  wall=${ep.wallId}(${ep.side}) ` +
                            `${Math.hypot(_dxC, _dzC).toFixed(3)}m from consensus > ${CONSENSUS_TRIM_TOL.toFixed(3)}m ` +
                            `— NOT trimmed (deferred to pair-wise loop; perimeter weld preserved)`
                        );
                    }
                    continue;
                }

                // §CONSENSUS-ON-CENTRELINE (2026-06-08, THE keystone room-merge fix) —
                // trim to the point on THIS wall's OWN centreline nearest the averaged
                // consensus, NOT the raw consensus. For 3+ non-collinear partition walls
                // whose endpoints are 0.05–0.45 m apart (the §MULTI-CLUSTER primary=0
                // trimmed=3 case), the averaged pairwise-intersection consensus is the
                // centroid of a triangle of DISTINCT crossings, so it sits 25–40 mm OFF
                // every wall's centreline. Trimming the joining endpoint to that off-axis
                // point ROTATES the wall about its fixed free end, so the baseLine chord
                // RoomDetectionEngine traces no longer lies on the room's true perimeter →
                // the social rooms leak together (the founder's 259.8 m² Living/Kitchen/
                // Dining/Hall blob). Projecting onto the wall's own centreline keeps every
                // wall EXACTLY on its axis (zero rotation); the projected joining ends land
                // ≤ ~60 mm apart, which RoomDetectionEngine._snapNearbyCorners(0.30) fuses
                // into one node — so the junction still seals. Regression-safe: for a TRUE
                // star junction (all centrelines crossing at one point) the projection of
                // consensus onto each centreline EQUALS the consensus → byte-identical; for
                // axis-aligned walls the fixed coordinate is preserved → they stay aligned.
                const _free = ep.side === 'start' ? we : ws;        // fixed (free) end
                const _axisX = (ep.side === 'start' ? ws.x : we.x) - _free.x;
                const _axisZ = (ep.side === 'start' ? ws.z : we.z) - _free.z;
                const _axLen2 = _axisX * _axisX + _axisZ * _axisZ;
                const trimPt = consensusPoint.clone();
                if (_axLen2 > 1e-12) {
                    // Perpendicular foot of consensusPoint on the line (free → joinEnd).
                    const _t =
                        ((consensusPoint.x - _free.x) * _axisX +
                         (consensusPoint.z - _free.z) * _axisZ) / _axLen2;
                    trimPt.set(_free.x + _t * _axisX, consensusPoint.y, _free.z + _t * _axisZ);
                }
                trimPt.y = ep.side === 'start' ? ws.y : we.y;   // preserve floor Y

                const newBL: [THREE.Vector3, THREE.Vector3] =
                    ep.side === 'start'
                        ? [trimPt, we.clone()]
                        : [ws.clone(), trimPt];

                bl.set(ep.wallId, newBL);

                // Non-pinned endpoint: write square cap and mark as handled.
                const adj: JoinData = result.get(ep.wallId) ?? {
                    baseLine:         newBL,
                    startMN: null,
                    endMN:   null,
                };
                adj.baseLine = newBL;
                // Square cap at the junction end (null = perpendicular).
                if (ep.side === 'start') adj.startMN = null;
                else                     adj.endMN   = null;
                result.set(ep.wallId, adj);

                // Mark this endpoint as handled so _detect skips it.
                handledKeys.add(epKey);

                _cntTrimmed++;
                if (_verboseClusterLogs) {
                    console.log(
                        `[WallJoinResolver] §MULTI-CLUSTER  wall=${ep.wallId}(${ep.side}) ` +
                        `trimmed → (${trimPt.x.toFixed(3)}, ${trimPt.z.toFixed(3)})`
                    );
                }
            }

            // Always-on per-cluster summary so production diagnostics retain
            // visibility into multi-wall junctions without flooding the console.
            console.log(
                `[WallJoinResolver] §MULTI-CLUSTER cluster: ${endpoints.length} endpoints @ ` +
                `(${consensusPoint.x.toFixed(3)}, ${consensusPoint.z.toFixed(3)}) ` +
                `[primary=${_cntPrimary} t-into=${_cntTInto} pinned=${_cntPinned}` +
                (_cntSecPinned ? ` sec-pinned=${_cntSecPinned}` : '') +
                ` trimmed=${_cntTrimmed}` +
                (_cntShellAnchorPreserved ? ` shellAnchor=${_cntShellAnchorPreserved}` : '') +
                (_cntSkippedSelfCluster ? ` selfCluster=${_cntSkippedSelfCluster}` : '') + `]`
            );
            if (_cntSkippedSelfCluster > 0) {
                console.warn(
                    `[WallJoinResolver] §SELF-CLUSTER-GUARD: skipped ${_cntSkippedSelfCluster} endpoint(s) ` +
                    `from ${_selfClusterWallIds.size} wall(s) whose BOTH ends are in this cluster: ` +
                    Array.from(_selfClusterWallIds).join(', ')
                );
            }
        }

        return handledKeys;
    }

    // ── Detection ─────────────────────────────────────────────────────────────

    /**
     * §CURVED-DETECT-FIX
     *
     * Fixed corner and T-join detection to use arc tangent directions for curved
     * walls instead of chord directions.
     *
     * Root cause of Bug 1 (curved + straight wall):
     *   _intersect2D and _angle previously used the chord direction (aS→aE) for
     *   ALL walls including curved ones.  When a curved wall's chord happened to be
     *   nearly parallel to the adjoining straight wall (shallow arc), _angle returned
     *   a value below MIN_ANGLE_RAD → join silently skipped; or _intersect2D returned
     *   null (parallel denominator) → join silently skipped.  The result was that the
     *   curved wall's end cap remained perpendicular while the straight wall was
     *   correctly mitered, leaving a visible open gap at the corner.
     *
     * Fix:
     *   For each wall, compute the ARC TANGENT direction at the joining endpoint via
     *   _wallDirAtJoin (already handles straight / curved correctly).  Then:
     *     • Use _angleFromDirs(tanA, tanB) for the minimum-angle gate — this compares
     *       actual wall-face angles, not the chord pseudo-angle.
     *     • Call _intersect2D with the TANGENT LINE through epA/epB (i.e. two points
     *       on the tangent line) instead of the chord segment endpoints.  For straight
     *       walls the tangent line IS the chord line → no behavioural change.  For
     *       curved walls the tangent line represents the wall's true heading at the
     *       join, so the intersection lands at the correct geometric corner point.
     *
     * For T-joins: the secondary wall's approach direction uses its tangent at
     * the joining endpoint; the host wall's direction uses the chord (host walls
     * in T-joins are typically straight, so this is unchanged in practice).
     *
     * @param skipEndpointKeys  Endpoint keys (`${wallId}:${side}`) that have been
     *                          fully handled by the multi-cluster pre-pass and must
     *                          not participate in pair-wise corner/T-join detection.
     */
    private static _detect(
        walls:             WallData[],
        bl:                Map<string, [THREE.Vector3, THREE.Vector3]>,
        skipEndpointKeys:  Set<string> = new Set(),
        thresholds:        JoinThresholds = _resolveThresholds(),
    ): JoinSpec[] {

        const { snapRadius: SNAP_RADIUS, maxCornerOffset: MAX_CORNER_OFFSET, minWallLength: MIN_WALL_LENGTH } = thresholds;
        const joins: JoinSpec[] = [];
        const seen  = new Set<string>();

        // §PERF-2026 — Spatial bucketing for the candidate-pair search.
        //
        // The original double loop was strictly O(n²) regardless of layout, which
        // dominated every wall-edit on levels above ~150 walls.  We now bucket
        // every wall's AABB (expanded by SNAP_RADIUS) into a SpatialGrid and only
        // iterate the (i, j) pairs whose AABBs *could* produce a join.
        //
        // Correctness invariant
        // ─────────────────────
        // A wall pair can produce a join only if either:
        //   • CORNER:  |epA − epB| ≤ SNAP_RADIUS  (endpoint-to-endpoint test), or
        //   • T-JOIN:  dist(epA, body_B) ≤ SNAP_RADIUS  (endpoint-to-segment test).
        //
        // In BOTH cases the (epA, body_B) distance is ≤ SNAP_RADIUS, which means
        // wall A's expanded AABB (each axis grown by SNAP_RADIUS) MUST overlap
        // wall B's chord segment, and therefore wall A's expanded AABB MUST
        // overlap wall B's expanded AABB.  Pairs whose expanded AABBs do not
        // overlap CANNOT produce any join — skipping them is provably safe.
        //
        // Iteration order is preserved: we still loop `i` ascending, and for
        // each `i` we loop the surviving `j`s in ascending order.  The `seen`
        // dedup keys and `joins.push()` order are byte-for-byte identical to
        // the original O(n²) detection for every pair that wasn't pruned —
        // and pruned pairs would have produced no joins anyway.
        const aabbGrid    = new SpatialGrid<number>(SNAP_RADIUS * 4); // ≥2 m cells
        const wallBounds  = new Array<THREE.Box3>(walls.length);
        for (let i = 0; i < walls.length; i++) {
            const [aS, aE] = bl.get(walls[i].id)!;
            const bb = new THREE.Box3()
                .expandByPoint(aS)
                .expandByPoint(aE)
                .expandByScalar(SNAP_RADIUS);
            wallBounds[i] = bb;
            aabbGrid.insert(i, bb);
        }
        const neighborsByIndex = new Array<number[]>(walls.length);
        for (let i = 0; i < walls.length; i++) {
            const cands = aabbGrid.query(wallBounds[i]);
            // Drop self, sort ascending so iteration order matches the
            // original `for j = 0..n` loop modulo skipped non-overlap pairs.
            const nbrs: number[] = [];
            for (const c of cands) if (c !== i) nbrs.push(c);
            nbrs.sort((a, b) => a - b);
            neighborsByIndex[i] = nbrs;
        }

        for (let i = 0; i < walls.length; i++) {
            const wA = walls[i];
            const [aS, aE] = bl.get(wA.id)!;

            for (const j of neighborsByIndex[i]) {
                if (i === j) continue;
                const wB = walls[j];
                const [bS, bE] = bl.get(wB.id)!;

                for (const sideA of ['start', 'end'] as Side[]) {
                    // §MULTI-CLUSTER: skip endpoints already handled by the cluster pass.
                    if (skipEndpointKeys.has(`${wA.id}:${sideA}`)) continue;

                    const epA = sideA === 'start' ? aS : aE;

                    // ── CORNER: endpoint of A near endpoint of B ──────────
                    for (const sideB of ['start', 'end'] as Side[]) {
                        // §MULTI-CLUSTER: skip the OTHER endpoint too if handled.
                        if (skipEndpointKeys.has(`${wB.id}:${sideB}`)) continue;

                        const epB = sideB === 'start' ? bS : bE;
                        if (epA.distanceTo(epB) > SNAP_RADIUS) continue;

                        const key = [wA.id + sideA, wB.id + sideB].sort().join('|');
                        if (seen.has(key)) continue;

                        // §CURVED-DETECT-FIX: use arc tangent at the joining endpoint.
                        // _wallDirAtJoin handles both straight (chord) and curved (tangent).
                        // Without adjustedPt here — the post-trim point is not yet known;
                        // _applyCorner will pass it again with the precise sharedPt.
                        const tanA = this._wallDirAtJoin(wA, sideA, aS, aE);
                        const tanB = this._wallDirAtJoin(wB, sideB, bS, bE);

                        // Angle gate — compare tangent directions, not chord directions.
                        if (this._angleFromDirs(tanA, tanB) < MIN_ANGLE_RAD) continue;

                        // Intersection of the two TANGENT LINES through epA and epB.
                        // For straight walls tanA/tanB equal the chord direction, so
                        // _intersect2D(epA, epA+tanA, epB, epB+tanB) produces the same
                        // result as _intersect2D(aS, aE, bS, bE) — no change.
                        // For curved walls it finds where the actual arc headings cross,
                        // which is the geometrically correct corner anchor point.
                        // §WALL-DEEP-2026 P3 — re-use module-scope scratch
                        // Vector3s instead of allocating two per pair. _intersect2D
                        // only reads x/z from its inputs (see method comment).
                        _tmpEpATan.copy(epA).addScaledVector(tanA, 1);
                        _tmpEpBTan.copy(epB).addScaledVector(tanB, 1);
                        const ix = this._intersect2D(
                            epA, _tmpEpATan,
                            epB, _tmpEpBTan,
                        );
                        if (!ix) continue;

                        // §SHORT-WALL-SAFETY: reject runaway intersections.
                        //   The angle gate (MIN_ANGLE_RAD) only filters the worst
                        //   parallel cases — at a 6° angle a tangent crossing can
                        //   still land >2 m away from the endpoints, which would
                        //   stretch a small new wall into a long tilted segment.
                        //   Force the corner anchor to stay near BOTH endpoints.
                        if (ix.distanceTo(epA) > MAX_CORNER_OFFSET) continue;
                        if (ix.distanceTo(epB) > MAX_CORNER_OFFSET) continue;

                        // §SHORT-WALL-SAFETY: don't trim either wall below the
                        //   minimum length (would invert direction or collapse it).
                        const otherA = sideA === 'start' ? aE : aS;
                        const otherB = sideB === 'start' ? bE : bS;
                        if (ix.distanceTo(otherA) < MIN_WALL_LENGTH) continue;
                        if (ix.distanceTo(otherB) < MIN_WALL_LENGTH) continue;

                        seen.add(key);
                        // Also mark the reverse so we don't produce a T-join for the same pair.
                        seen.add(wA.id + sideA + '|' + wB.id);
                        seen.add(wB.id + sideB + '|' + wA.id);

                        joins.push({ kind: 'corner', epA: { wallId: wA.id, side: sideA }, epB: { wallId: wB.id, side: sideB }, intersection: ix });
                    }

                    // ── T-JOIN: endpoint of A near BODY of B ─────────────
                    // Skip if either the A endpoint OR the body of B is in a cluster.
                    // (A cluster endpoint that approaches B's body would be a mis-detection
                    //  — the cluster pass already placed A's endpoint at the consensus pt.)
                    if (skipEndpointKeys.has(`${wA.id}:${sideA}`)) continue;

                    const tKey = wA.id + sideA + '|' + wB.id;
                    if (seen.has(tKey)) continue;

                    const closest = this._closestOnSegment(epA, bS, bE);
                    if (epA.distanceTo(closest) > SNAP_RADIUS) continue;

                    // Skip if the closest point is at an endpoint of B (that's a corner).
                    if (closest.distanceTo(bS) < 0.05 || closest.distanceTo(bE) < 0.05) continue;

                    // §CURVED-DETECT-FIX: use arc tangent of secondary wall at its endpoint.
                    const tanA_t  = this._wallDirAtJoin(wA, sideA, aS, aE);
                    const chordB  = new THREE.Vector3().subVectors(bE, bS).normalize();
                    if (this._angleFromDirs(tanA_t, chordB) < MIN_ANGLE_RAD) continue;

                    seen.add(tKey);
                    joins.push({ kind: 't', secondary: { wallId: wA.id, side: sideA }, hostWallId: wB.id, contactPoint: closest.clone() });
                }
            }
        }

        return joins;
    }

    // ── Corner join ───────────────────────────────────────────────────────────

    /**
     * CORNER JOIN — fixed coordinate-space alignment
     *
     * Key insight: the user's snap point (blue dot) is on the CENTRELINE.
     * Therefore we use join.intersection (centreline ↔ centreline crossing)
     * as the shared anchor — both walls trim to exactly this point.
     *
     * The miter plane passes through this shared point with normal = bisector
     * of the two wall directions pointing INTO the corner. Both walls share
     * the identical miter plane, so their cut faces are coplanar and flush.
     *
     * This eliminates the drift caused by projecting a face-line intersection
     * back onto the centreline (which introduced a thickness-dependent offset).
     *
     * §06-FIX: For curved walls the direction used for the miter bisector is the
     * arc TANGENT at the joining endpoint, not the chord direction.  This ensures
     * the miter plane is perpendicular to the arc's true direction at the join,
     * producing a flush face when paired with projectCapVertex() in the geometry
     * builder.  The chord-based _intersect2D result is still used as the shared
     * anchor (adequate approximation within SNAP_RADIUS).
     */
    private static _applyCorner(
        join:        CornerJoin,
        bl:          Map<string, [THREE.Vector3, THREE.Vector3]>,
        blAtDetect:  Map<string, [THREE.Vector3, THREE.Vector3]>,
        byId:        Map<string, WallData>,
        result:      Map<string, JoinData>,
        thresholds:  JoinThresholds = _resolveThresholds(),
    ): void {
        const { epA, epB } = join;
        const MIN_LEN = thresholds.minWallLength;

        // Current bl for free-end positions (correctly reflects prior join trims).
        const [aS, aE] = bl.get(epA.wallId)!;
        const [bS, bE] = bl.get(epB.wallId)!;

        // Detection-time bl for DIRECTION computation only.
        // Using the detection snapshot avoids direction drift for walls that already
        // had one endpoint moved by an earlier _applyCorner call in the same flush.
        // For curved walls the tangent is evaluated at sharedPt regardless, so
        // blAtDetect only affects straight walls (where it gives the chord direction
        // relative to the original wall axis, not the post-first-corner chord).
        const [aS_d, aE_d] = blAtDetect.get(epA.wallId) ?? [aS, aE];
        const [bS_d, bE_d] = blAtDetect.get(epB.wallId) ?? [bS, bE];

        // ── Step 1: Use centreline intersection as the shared anchor ──────
        // This is where the user snapped (blue dot) — both walls trim here.
        const sharedPt = join.intersection.clone();

        // ── Step 2: Compute wall directions ───────────────────────────────
        // §06-FIX + §CURVED-STRAIGHT-FIX:
        // For curved walls, pass sharedPt as the adjusted endpoint so the
        // tangent is computed at the point where the geometry builder will
        // place the arc end (after store.update sets baseLine = sharedPt).
        // This ensures the miter normal is consistent with the projection
        // direction used in projectCapVertex(), eliminating cap misalignment
        // for curved-vs-straight joins.
        // §DIR-DRIFT-FIX: use detection-snapshot baselines (aS_d / bS_d etc.)
        // so that walls participating in two sequential corners always use the
        // same axis direction for both bisector computations.
        const wallA = byId.get(epA.wallId)!;
        const wallB = byId.get(epB.wallId)!;
        const dirA = this._wallDirAtJoin(wallA, epA.side, aS_d, aE_d, sharedPt);
        const dirB = this._wallDirAtJoin(wallB, epB.side, bS_d, bE_d, sharedPt);

        // ── §DIFF-THICKNESS-FIX (Apr 2026 — option B, Revit-style finish-face butt) ──
        // When walls have different total thicknesses (>1 mm difference) a miter
        // bisector produces misaligned finish faces.  Behaviour:
        //   • Dominant (thicker) wall is NOT extended past the join.  Its endpoint
        //     stays at sharedPt (centreline intersection) with a perpendicular
        //     end cap.
        //   • Subordinate (thinner) wall trims so its end cap sits just inside the
        //     dominant wall's NEAR lateral face — the face closest to the
        //     subordinate's own free end.  1 mm epsilon prevents Z-fighting.
        // Result: clean L-corner where the thinner wall butts cleanly against the
        // thicker wall, with no extension or wrap-around at the corner.
        //
        // Previous behaviour (pre-Apr 2026) extended the dominant by subordinateT/2
        // and pushed the subordinate THROUGH the dominant to its far face, which
        // produced visible wrap-around geometry at L-corners between thicker
        // horizontal walls and a thinner vertical wall.
        const tA = wallA.thickness;
        const tB = wallB.thickness;
        if (Math.abs(tA - tB) > 0.001) {
            const isDomA       = tA >= tB;
            const dominantEp   = isDomA ? epA : epB;
            const subordinateEp = isDomA ? epB : epA;
            const dominantDir  = isDomA ? dirA : dirB;
            const dominantT    = isDomA ? tA : tB;
            const subordinateT = isDomA ? tB : tA;

            const [domWS, domWE] = bl.get(dominantEp.wallId)!;
            const [subWS, subWE] = bl.get(subordinateEp.wallId)!;

            // Subordinate wall trims to the dominant wall's NEAR lateral face.
            // The face chosen is the one closest to the subordinate's free end.
            //   signFree = +1 → free end is on the +outward side → near face at
            //                   sharedPt + outward·(dominantT/2)
            //   signFree = -1 → free end is on the -outward side → near face at
            //                   sharedPt - outward·(dominantT/2)
            // The 1 mm epsilon places the subordinate end-cap just inside the
            // dominant body so the two surfaces overlap by 1 mm (no Z-fighting,
            // no visible seam).
            const domOutward    = new THREE.Vector3(-dominantDir.z, 0, dominantDir.x);
            const subFreeEnd    = subordinateEp.side === 'start' ? subWE : subWS;
            const vecFreeToJoin = new THREE.Vector3().subVectors(subFreeEnd, sharedPt);
            const signFree      = domOutward.dot(vecFreeToJoin) >= 0 ? 1 : -1;
            const subNewPt      = sharedPt.clone().addScaledVector(domOutward, signFree * (dominantT / 2 - 0.001));

            // ── §PERIMETER-CORNER-FILL (Jun 2026 — A.21.D53) ─────────────────────
            // RESIDUAL perimeter-corner defect: at an L-CORNER (endpoint↔endpoint,
            // which is the ONLY topology _applyCorner ever handles) the dominant
            // wall used to stop its square cap exactly at sharedPt (the centreline
            // crossing). But the subordinate butts against the dominant's NEAR
            // lateral face, so the subordinate's body extends OUTWARD past the
            // dominant's end by up to subordinateT/2. With the dominant capped at
            // sharedPt, the convex OUTER quadrant of the corner — the rectangle
            // bounded by the dominant's end plane and the subordinate's far lateral
            // face — is filled by NEITHER wall: an open notch at the building's
            // outer corner (the "perimeter corners not always well done" report).
            //
            // A bisector miter (the same-thickness path) closes this by construction
            // but is geometrically wrong across a thickness step (misaligned finish
            // faces — the very reason option-B butt exists). The watertight fix that
            // does NOT re-introduce the pre-Apr-2026 wrap-around (which pushed the
            // SUBORDINATE through to the dominant's FAR face) is to EXTEND only the
            // DOMINANT wall along its OWN axis, past sharedPt, by subordinateT/2, so
            // its square end cap reaches the subordinate's far lateral face and backs
            // the overhang. The subordinate still butts the NEAR face exactly as
            // before — no wrap-around, no change to the thinner wall.
            //
            // This is a corner-only extension: _applyCorner is never reached for a
            // T-join (those go through _applyT, where the host is unchanged), so
            // extending the dominant here can never overrun a wall's mid-body.
            // Square cap (null MN) → stable + cacheable → §rebuildWallBodies
            // (D40 ground-walls-stay-put) is unaffected.
            const domExtend = dominantDir.clone()
                .multiplyScalar((dominantEp.side === 'end' ? 1 : -1) * (subordinateT / 2));
            const domEndPt  = sharedPt.clone().add(domExtend);

            // Commit dominant wall — endpoint EXTENDED to the subordinate far face,
            // perpendicular (square) cap.
            const newDomBL: [THREE.Vector3, THREE.Vector3] = dominantEp.side === 'end'
                ? [domWS.clone(), domEndPt.clone()]
                : [domEndPt.clone(), domWE.clone()];

            // Commit subordinate wall — endpoint at near face, perpendicular cap.
            const newSubBL: [THREE.Vector3, THREE.Vector3] = subordinateEp.side === 'start'
                ? [subNewPt, subWE.clone()]
                : [subWS.clone(), subNewPt];

            // §DEGENERATE-WALL-GUARD (Apr 2026): refuse the trim if it would
            // collapse either wall below MIN_WALL_LENGTH. This happens when the
            // SAME wall is the dominant in two different option-B butt corners
            // in the same flush (both endpoints land at/near the cluster
            // consensus point). Without this guard the wall becomes near-zero
            // length and downstream geometry construction (buildMiterPrism,
            // curve subdivision) either throws or hangs, freezing the load.
            const newDomLen = newDomBL[0].distanceTo(newDomBL[1]);
            const newSubLen = newSubBL[0].distanceTo(newSubBL[1]);
            if (newDomLen < MIN_LEN || newSubLen < MIN_LEN) {
                console.warn(
                    `[WJR-DIFF-THICKNESS] (option-B butt) REFUSED — would collapse wall: ` +
                    `dom=${dominantEp.wallId}(${dominantEp.side}) newLen=${newDomLen.toFixed(4)} ` +
                    `sub=${subordinateEp.wallId}(${subordinateEp.side}) newLen=${newSubLen.toFixed(4)} ` +
                    `(MIN=${MIN_LEN})`
                );
                // §WJR-INVALID (durable layer): the trim would collapse a wall
                // below MIN_LEN and we are leaving it un-trimmed. If a wall is
                // ALREADY degenerate at its current baseline (the zero-length /
                // self-overlapping input vector), flag it so the builder skips it
                // by intent rather than relying on the NaN sniff. A wall whose
                // un-trimmed baseline is still long stays renderable as-is.
                this._flagInvalidIfDegenerate(dominantEp.wallId, bl, result, MIN_LEN, 'diff-thickness-collapse');
                this._flagInvalidIfDegenerate(subordinateEp.wallId, bl, result, MIN_LEN, 'diff-thickness-collapse');
                return;
            }

            // §WJR-NAN-GUARD (Jun 2026 — diff-thickness project-open HANG fix):
            // The MIN_LEN check above guards LENGTH collapse only. It does NOT
            // catch (a) a non-finite (NaN/Infinity) lateral offset — e.g. when
            // dominantDir degenerated and domOutward is NaN — nor (b) a DIRECTION
            // REVERSAL, where the moved subordinate endpoint slides PAST its own
            // free end (near-collinear walls / a near-parallel offset), inverting
            // the subordinate's axis. Either case produces a near-zero or reversed
            // baseline whose downstream normalize()/unit() yields a NaN
            // BufferGeometry, stalling the synchronous load-time rebuild in the
            // extruder bounding-volume / opening CSG / BVH maths (see
            // docs/03-execution/analysis/WALLJOINRESOLVER-DIFF-THICKNESS-HANG-2026-06-03.md).
            // On reject we FALL BACK to a clean butt: keep the subordinate's
            // ORIGINAL (un-offset) joining endpoint at sharedPt. A wrong-but-fast
            // join beats a frozen tab.
            const allFinite = (v: THREE.Vector3) =>
                Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
            // Original (pre-offset) subordinate baseline direction, free-end → join.
            const subOrigDir = new THREE.Vector3().subVectors(sharedPt, subFreeEnd);
            // New subordinate baseline direction, free-end → moved join point.
            const subNewDir  = new THREE.Vector3().subVectors(subNewPt, subFreeEnd);
            const dirReversed = subOrigDir.lengthSq() > 1e-12
                && subNewDir.lengthSq() > 1e-12
                && subOrigDir.dot(subNewDir) < 0;
            const nonFinite =
                !allFinite(subNewPt) || !allFinite(newSubBL[0]) || !allFinite(newSubBL[1])
                || !allFinite(newDomBL[0]) || !allFinite(newDomBL[1]);
            if (nonFinite || dirReversed) {
                console.warn(
                    `[WJR-DIFF-THICKNESS] (option-B butt) §WJR-NAN-GUARD — degenerate offset, ` +
                    `falling back to clean butt at sharedPt: ` +
                    `sub=${subordinateEp.wallId}(${subordinateEp.side}) ` +
                    `nonFinite=${nonFinite} dirReversed=${dirReversed}`
                );
                // Clean-butt fallback: subordinate joins at sharedPt (un-offset).
                if (subordinateEp.side === 'start') newSubBL[0].copy(sharedPt);
                else                                newSubBL[1].copy(sharedPt);
                // Re-validate the fallback length; if even that collapses, refuse.
                if (newSubBL[0].distanceTo(newSubBL[1]) < MIN_LEN
                    || !allFinite(newSubBL[0]) || !allFinite(newSubBL[1])) {
                    console.warn(
                        `[WJR-DIFF-THICKNESS] (option-B butt) §WJR-NAN-GUARD — clean-butt ` +
                        `fallback still degenerate, REFUSING trim for sub=${subordinateEp.wallId}`
                    );
                    // §WJR-INVALID (durable layer): even the clean butt cannot
                    // rescue the subordinate (its source baseline is itself near-
                    // zero / non-finite). Flag it so the builder skips it by intent.
                    this._flagInvalidIfDegenerate(subordinateEp.wallId, bl, result, MIN_LEN, 'diff-thickness-nan');
                    return;
                }
            }

            bl.set(dominantEp.wallId, newDomBL);
            const adjDom = result.get(dominantEp.wallId)
                ?? { baseLine: newDomBL, startMN: null, endMN: null };
            adjDom.baseLine = newDomBL;
            if (dominantEp.side === 'start') adjDom.startMN = null;
            else                             adjDom.endMN   = null;
            result.set(dominantEp.wallId, adjDom);

            bl.set(subordinateEp.wallId, newSubBL);
            const adjSub = result.get(subordinateEp.wallId)
                ?? { baseLine: newSubBL, startMN: null, endMN: null };
            adjSub.baseLine = newSubBL;
            if (subordinateEp.side === 'start') adjSub.startMN = null;
            else                                adjSub.endMN   = null;
            result.set(subordinateEp.wallId, adjSub);

            console.log(`[WJR-DIFF-THICKNESS] (option-B butt) dominant=${dominantEp.wallId}(${dominantEp.side}) tDom=${dominantT} sub=${subordinateEp.wallId}(${subordinateEp.side}) tSub=${subordinateT}`);

            // §DIAG-WALL-JOIN — diff-thickness L: the subordinate butts the dominant's
            // NEAR lateral face and the dominant is EXTENDED by subordinateT/2 to back the
            // outer overhang (§PERIMETER-CORNER-FILL), so the outer corner notch is filled
            // by construction. The clean-butt + NaN/length guards above prove the trim is
            // finite + non-collapsing; if they refused, this line is not reached (an early
            // return already logged the refusal). So reaching here ⇒ the L closed cleanly.
            const _angDegDT = (this._angleFromDirs(dirA, dirB) * 180) / Math.PI;
            const _clsDT = _angDegDT < 10 ? 'COLLINEAR' : _angDegDT >= 60 ? 'L' : 'SHALLOW-L';
            console.log(
                `[WallJoinResolver] §DIAG-WALL-JOIN CORNER ${epA.wallId}(${epA.side}) ↔ ${epB.wallId}(${epB.side}) ` +
                `class=${_clsDT} angle=${_angDegDT.toFixed(1)}° mitre=diffThk-butt+fill(tDom=${dominantT.toFixed(3)} tSub=${subordinateT.toFixed(3)}) ` +
                `closed=${_clsDT !== 'COLLINEAR' ? '✓' : '⚠ NOT-CLEAN'}`,
            );
            return;
        }

        // ── Step 3: Bisector base = normalize(dirA + dirB) ───────────────────
        // This is the correct base for the miter plane.
        // Each wall then independently selects +base or -base to satisfy its
        // own geometric constraint: for an END cap, MN·outward and MN·wallDir
        // must have the SAME sign (so t<0 pulls the outer vertex back).
        // For a START cap they must have OPPOSITE signs (so t>0 pushes forward).
        const bisectorSum = new THREE.Vector3().addVectors(dirA, dirB);
        let base: THREE.Vector3;

        if (bisectorSum.length() < 1e-6) {
            base = new THREE.Vector3(-dirA.z, 0, dirA.x).normalize();
        } else {
            base = bisectorSum.normalize();
        }

        // Per-wall: pick +base or -base to satisfy the projection sign constraint.
        const miterNormalA = this._pickMiterNormal(base, dirA, epA.side);
        const miterNormalB = this._pickMiterNormal(base, dirB, epB.side);

        // ── Step 5: Trim each wall's endpoint to the shared centreline pt ─
        const newA: [THREE.Vector3, THREE.Vector3] =
            epA.side === 'start'
                ? [sharedPt.clone(), aE.clone()]
                : [aS.clone(), sharedPt.clone()];

        const newB: [THREE.Vector3, THREE.Vector3] =
            epB.side === 'start'
                ? [sharedPt.clone(), bE.clone()]
                : [bS.clone(), sharedPt.clone()];

        // §DEGENERATE-WALL-GUARD (Apr 2026): refuse the bisector trim if it
        // would shrink either wall below MIN_WALL_LENGTH. Mirrors the option-B
        // butt guard above — the same "both endpoints land at one cluster
        // consensus" topology can also reach this branch when wall thicknesses
        // are within 1 mm of each other.
        const newALen = newA[0].distanceTo(newA[1]);
        const newBLen = newB[0].distanceTo(newB[1]);
        if (newALen < MIN_LEN || newBLen < MIN_LEN) {
            console.warn(
                `[WallJoinResolver] CORNER REFUSED — would collapse wall: ` +
                `A=${epA.wallId}(${epA.side}) newLen=${newALen.toFixed(4)} ` +
                `B=${epB.wallId}(${epB.side}) newLen=${newBLen.toFixed(4)} ` +
                `(MIN=${MIN_LEN})`
            );
            return;
        }

        // ── §DIAG-WALL-JOIN (founder verification, 2026-06-09) ───────────────────
        // The founder asked: "make sure all walls JOIN in an L-shape for the outer
        // (perimeter) AND interior walls — add logs so we can understand what's going
        // on." This ALWAYS-ON line classifies every pair-wise CORNER join and reports
        // whether the L mitre CLOSED CLEANLY. The same-thickness corner is the L the
        // generated layout produces (perimeter + interior partitions share thickness),
        // resolved here by the bisector miter. Closure has two parts, both verified:
        //   1. CENTRELINE closure — both walls trim to the IDENTICAL sharedPt (the
        //      centreline×centreline crossing). newA/newB above set BOTH joining ends to
        //      sharedPt.clone(), so the gap is 0 by construction; we measure it to prove
        //      it (any > eps ⇒ a real notch/overrun at the corner).
        //   2. MITRE closure — the bisector base is non-degenerate (the two wall dirs are
        //      not anti-parallel). A degenerate bisector ⇒ the path fell back to a square
        //      cap ⇒ it is NOT a clean L (a collinear pass-through, logged as such).
        // Classification by the inter-wall angle: L (perpendicular-ish corner, ~30..150°),
        // SHALLOW-L (acute/obtuse but still a corner), or COLLINEAR (near-straight → not
        // an L — would be a pass-through, normally handled by the cluster pass).
        const _jointGapM = newA[epA.side === 'start' ? 0 : 1]
            .distanceTo(newB[epB.side === 'start' ? 0 : 1]);
        const _angRad = this._angleFromDirs(dirA, dirB);   // ∈ [0, π/2] (uses |dot|)
        const _angDeg = (_angRad * 180) / Math.PI;          // 90 = perpendicular, 0 = collinear
        const _bisectorOk = bisectorSum.length() >= 1e-6;   // false ⇒ anti-parallel ⇒ square-cap fallback
        const _cls = _angDeg < 10 ? 'COLLINEAR' : _angDeg >= 60 ? 'L' : 'SHALLOW-L';
        const _CLOSE_EPS_M = 0.002;                          // 2 mm — sub-visible
        const _closed = _jointGapM <= _CLOSE_EPS_M && _bisectorOk && _cls !== 'COLLINEAR';
        // §DIAG-CORNER-TURN (founder L-shape verification, 2026-06-10) — the L's INNER
        // (concave/reflex) corner turns the OPPOSITE way to its convex corners. The
        // signed XZ cross of the two join directions gives a deterministic turn sign so
        // the founder can pick the concave corner out of the log (it will read turn=CW
        // where the convex corners read turn=CCW, or vice-versa, for a consistently-wound
        // shell). The bisector miter below is sign-agnostic (`_pickMiterNormal` chooses
        // +base/−base per wall from each wall's own outward·wallDir constraint), so BOTH
        // convex and concave corners close by construction — the turn sign is diagnostic
        // only, it does NOT change the trim. A magnitude near 0 ⇒ collinear (not a turn).
        const _turnCross = dirA.x * dirB.z - dirA.z * dirB.x;
        const _turn = Math.abs(_turnCross) < 1e-6 ? 'STRAIGHT' : (_turnCross > 0 ? 'CCW' : 'CW');
        // Perimeter vs interior is not knowable from wall data alone here; we report the
        // wall ids + thickness so the founder can map them. Same-thickness ⇒ mitred L.
        console.log(
            `[WallJoinResolver] §DIAG-WALL-JOIN CORNER ${epA.wallId}(${epA.side}) ↔ ${epB.wallId}(${epB.side}) ` +
            `class=${_cls} angle=${_angDeg.toFixed(1)}° turn=${_turn} mitre=bisector(sameThk t=${tA.toFixed(3)}) ` +
            `jointGap=${(_jointGapM * 1000).toFixed(1)}mm bisectorOk=${_bisectorOk} ` +
            `closed=${_closed ? '✓' : '⚠ NOT-CLEAN'}`,
        );
        if (!_closed) {
            console.warn(
                `[WallJoinResolver] §DIAG-WALL-JOIN ⚠ L-corner did NOT close cleanly ` +
                `(${epA.wallId}↔${epB.wallId}): class=${_cls} jointGap=${(_jointGapM * 1000).toFixed(1)}mm ` +
                `bisectorOk=${_bisectorOk} — ${_cls === 'COLLINEAR' ? 'near-collinear (expected a pass-through, not an L)' : 'centreline gap/overrun or degenerate bisector'}`,
            );
        }

        // PERF-FIX (Apr 2026): Gate noisy per-corner debug logs behind opt-in flag.
        // Each project load resolves dozens of corners; logging here cost ~50–150 ms
        // of pure main-thread time on the post-load critical path. Re-enable with
        // `localStorage.setItem('pryzm-debug-walls','1')` when investigating join math.
        if (window.__pryzmDebugWalls) {
            console.log(`[WJR-CORNER] epA=${epA.side} epB=${epB.side}`);
            console.log(`[WJR-CORNER] sharedPt=(${sharedPt.x.toFixed(3)},${sharedPt.z.toFixed(3)})`);
            console.log(`[WJR-CORNER] MN_A=(${miterNormalA.nx.toFixed(3)},${miterNormalA.nz.toFixed(3)}) MN_B=(${miterNormalB.nx.toFixed(3)},${miterNormalB.nz.toFixed(3)})`);
        }

        // ── Commit A ──────────────────────────────────────────────────────
        bl.set(epA.wallId, newA);
        const adjA = result.get(epA.wallId)
            ?? { baseLine: newA, startMN: null, endMN: null };
        adjA.baseLine = newA;
        if (epA.side === 'start') adjA.startMN = miterNormalA;
        else                      adjA.endMN   = miterNormalA;
        result.set(epA.wallId, adjA);

        // ── Commit B ──────────────────────────────────────────────────────
        bl.set(epB.wallId, newB);
        const adjB = result.get(epB.wallId)
            ?? { baseLine: newB, startMN: null, endMN: null };
        adjB.baseLine = newB;
        if (epB.side === 'start') adjB.startMN = miterNormalB;
        else                      adjB.endMN   = miterNormalB;
        result.set(epB.wallId, adjB);

        if (window.__pryzmDebugWalls) {
            console.log(`[WallJoinResolver] CORNER: ${epA.wallId}(${epA.side}) ↔ ${epB.wallId}(${epB.side})`);
        }
    }

    // ── Miter normal selection ────────────────────────────────────────────────

    /**
     * Given a candidate miter plane normal `base` (or its negation), returns
     * whichever orientation satisfies the projection sign constraint for this wall.
     *
     * The buildMiterPrism projection formula gives:
     *   t = -halfT * (MN·outward) / (MN·wallDir)
     *
     * For an END cap the outer vertex must be pulled back (t < 0):
     *   → (MN·outward) and (MN·wallDir) must have the SAME sign.
     * For a START cap the outer vertex must be pushed forward (t > 0):
     *   → they must have OPPOSITE signs.
     *
     * If `base` already satisfies the condition it is returned as-is; otherwise
     * its negation is returned.  Both represent the same geometric plane.
     */
    private static _pickMiterNormal(
        base:    THREE.Vector3,
        wallDir: THREE.Vector3,
        side:    Side
    ): { nx: number; nz: number } {
        const outward = new THREE.Vector3(-wallDir.z, 0, wallDir.x);
        const D = base.dot(wallDir);
        const O = base.dot(outward);
        const haveSameSign = D * O > 0;
        const needSameSign = side === 'end';
        if (haveSameSign === needSameSign) {
            return { nx: base.x, nz: base.z };
        }
        return { nx: -base.x, nz: -base.z };
    }

    // ── Arc-tangent direction helper ──────────────────────────────────────────

    /**
     * Returns the direction the wall faces at the given endpoint.
     *
     * For STRAIGHT walls this is the chord direction (end − start), as before.
     * For CURVED walls this is the exact quadratic-Bézier tangent (XZ only):
     *   t=0 (start side): tangent = normalize(control − adjustedPt_or_start)
     *   t=1 (end   side): tangent = normalize(adjustedPt_or_end − control)
     *
     * §CURVED-STRAIGHT-FIX: `adjustedPt` is the shared corner point computed by
     * _intersect2D — i.e., the point that the geometry builder will receive as
     * baseLine[1] (or [0]) after store.update().  Using it here ensures the miter
     * normal is computed with the **same** tangent direction that
     * projectCapVertex() will use in WallFragmentBuilder / CurvedWallLayerBuilder,
     * eliminating the cap misalignment seen in curved-vs-straight joins.
     *
     * Y-component is forced to zero (XZ plane only) to avoid elevation-induced
     * tilt that would corrupt the horizontal miter plane for upper-floor walls.
     *
     * @param wall        WallData — must not be mutated.
     * @param side        Which endpoint of the wall is joining.
     * @param ws          Working start point (may be adjusted by prior joins).
     * @param we          Working end   point (may be adjusted by prior joins).
     * @param adjustedPt  The post-trim shared corner point.  When provided the
     *                    curved-wall tangent is evaluated at this point instead
     *                    of the original baseLine endpoint.
     */
    private static _wallDirAtJoin(
        wall:        WallData,
        side:        Side,
        ws:          THREE.Vector3,
        we:          THREE.Vector3,
        adjustedPt?: THREE.Vector3,
    ): THREE.Vector3 {
        if (wall.curve) {
            // Control point in XZ only — Y=0 prevents elevation-induced tilt.
            const ctrl = new THREE.Vector3(wall.curve.control.x, 0, wall.curve.control.z);

            if (side === 'start') {
                // Tangent at t=0: normalize(ctrl − startPt)  (XZ only)
                // Prefer adjustedPt (= sharedPt after trim) for exact consistency
                // with what the geometry builder will receive as baseLine[0].
                const ep = adjustedPt ?? ws;
                const t  = new THREE.Vector3(ctrl.x - ep.x, 0, ctrl.z - ep.z);
                if (t.lengthSq() < 1e-12) return new THREE.Vector3(we.x - ws.x, 0, we.z - ws.z).normalize();
                return t.normalize();
            } else {
                // Tangent at t=1: normalize(endPt − ctrl)  (XZ only)
                const ep = adjustedPt ?? we;
                const t  = new THREE.Vector3(ep.x - ctrl.x, 0, ep.z - ctrl.z);
                if (t.lengthSq() < 1e-12) return new THREE.Vector3(we.x - ws.x, 0, we.z - ws.z).normalize();
                return t.normalize();
            }
        }
        // Straight wall: chord direction — XZ only to stay horizontal.
        return new THREE.Vector3(we.x - ws.x, 0, we.z - ws.z).normalize();
    }

    // ── T-join ────────────────────────────────────────────────────────────────

    /**
     * Trim secondary endpoint to the host wall's LATERAL (side) face.
     * Host unchanged.
     *
     * Fix: the face the secondary wall approaches is the SIDE face of the host
     * (normal = perpendicular to hostDir), NOT the end face (normal = hostDir).
     * Using hostDir as the face normal caused the ray–plane denom to be zero
     * for perpendicular T-joins (trimPt = null → join silently skipped).
     */
    private static _applyT(
        join:       TJoin,
        bl:         Map<string, [THREE.Vector3, THREE.Vector3]>,
        byId:       Map<string, WallData>,
        result:     Map<string, JoinData>,
        thresholds: JoinThresholds = _resolveThresholds(),
    ): void {
        const { maxCornerOffset: MAX_CORNER_OFFSET, minWallLength: MIN_WALL_LENGTH } = thresholds;
        const { secondary, hostWallId } = join;
        const [sS, sE] = bl.get(secondary.wallId)!;
        const [hS, hE] = bl.get(hostWallId)!;
        const hostWall  = byId.get(hostWallId)!;

        const hostDir  = new THREE.Vector3().subVectors(hE, hS).normalize();

        // Side (lateral) face normal — perpendicular to host direction in XZ.
        // This is the outward-left normal of the host wall.
        const sideNormal = new THREE.Vector3(-hostDir.z, 0, hostDir.x);

        const secFree = secondary.side === 'start' ? sE : sS;

        // Trim direction along secondary axis toward join end.
        const secDir  = new THREE.Vector3().subVectors(sE, sS).normalize();
        const trimDir = secondary.side === 'start' ? secDir.clone().negate() : secDir.clone();

        // §T-JOIN-STALE-CONTACT-FIX:
        // Re-project the secondary's CURRENT joining endpoint onto the CURRENT host
        // centreline.  Using the detection-time contactPoint here is incorrect when
        // the host wall has been moved by its own prior corner joins: the stale point
        // may lie outside the trimmed host body, making the lateral face anchor wrong
        // and the faceSign calculation unreliable.
        const secJoinEp     = secondary.side === 'start' ? sS : sE;
        const currentContact = this._closestOnSegment(secJoinEp, hS, hE);

        // Determine which lateral face the secondary approaches.
        // Use the secondary's current FREE end projected onto the host's sideNormal
        // relative to the current contact — stable even when the host has moved.
        const toFree   = new THREE.Vector3().subVectors(secFree, currentContact);
        const faceSign = sideNormal.dot(toFree) >= 0 ? 1 : -1;

        // Lateral face: offset from the CURRENT contact point along sideNormal
        // by half-thickness.  This keeps the anchor on the host's actual face.
        const faceO = currentContact.clone().addScaledVector(sideNormal, faceSign * hostWall.thickness / 2);
        // Face plane normal points outward from the host toward the secondary.
        const faceN = sideNormal.clone().multiplyScalar(faceSign);

        const trimPt = this._rayPlane(secFree, trimDir, faceO, faceN);

        if (!trimPt) {
            console.warn('[WallJoinResolver] T-JOIN: trim failed, skipping');
            return;
        }

        // §SHORT-WALL-SAFETY: refuse the T-trim if it would push the joining
        //   endpoint far from where the user actually drew it, or collapse the
        //   wall below the minimum length.  Without this guard a small wall
        //   placed near a long perpendicular wall gets stretched/inverted by
        //   the projection onto the host's lateral face.
        if (trimPt.distanceTo(secJoinEp) > MAX_CORNER_OFFSET) {
            console.warn('[WallJoinResolver] T-JOIN: trim distance exceeds safety bound, skipping');
            return;
        }
        if (trimPt.distanceTo(secFree) < MIN_WALL_LENGTH) {
            console.warn('[WallJoinResolver] T-JOIN: trim would shrink wall below minimum length, skipping');
            return;
        }

        const newBl: [THREE.Vector3, THREE.Vector3] =
            secondary.side === 'start' ? [trimPt, sE.clone()] : [sS.clone(), trimPt];
        bl.set(secondary.wallId, newBl);

        const adj = result.get(secondary.wallId)
            ?? { baseLine: newBl, startMN: null, endMN: null };
        adj.baseLine = newBl;
        // Miter normal: the end cap of the secondary wall must be coplanar with the
        // host's lateral face.  The lateral face normal is sideNormal * faceSign.
        const miter = { nx: faceSign * sideNormal.x, nz: faceSign * sideNormal.z };
        if (secondary.side === 'start') adj.startMN = miter;
        else                            adj.endMN   = miter;
        result.set(secondary.wallId, adj);

        if (window.__pryzmDebugWalls) {
            console.log(`[WallJoinResolver] T-JOIN: ${secondary.wallId}(${secondary.side}) → host=${hostWallId}`);
        }
    }

    // ── Geometry helpers ──────────────────────────────────────────────────────

    /** Returns the XZ position of a wall endpoint from the working baseline map. */
    private static _getEpPos(
        ep: { wallId: string; side: 'start' | 'end' },
        bl: Map<string, [THREE.Vector3, THREE.Vector3]>,
    ): THREE.Vector3 {
        const [ws, we] = bl.get(ep.wallId)!;
        return ep.side === 'start' ? ws : we;
    }

    private static _rayPlane(
        origin: THREE.Vector3, dir: THREE.Vector3,
        planePoint: THREE.Vector3, planeNormal: THREE.Vector3
    ): THREE.Vector3 | null {
        const denom = planeNormal.dot(dir);
        if (Math.abs(denom) < 1e-9) return null;
        const t = planeNormal.dot(new THREE.Vector3().subVectors(planePoint, origin)) / denom;
        return origin.clone().addScaledVector(dir, t);
    }

    private static _intersect2D(
        a0: THREE.Vector3, a1: THREE.Vector3,
        b0: THREE.Vector3, b1: THREE.Vector3
    ): THREE.Vector3 | null {
        const dax = a1.x - a0.x, daz = a1.z - a0.z;
        const dbx = b1.x - b0.x, dbz = b1.z - b0.z;
        const denom = dax * dbz - daz * dbx;
        if (Math.abs(denom) < 1e-9) return null;
        const t = ((b0.x - a0.x) * dbz - (b0.z - a0.z) * dbx) / denom;
        return new THREE.Vector3(a0.x + t * dax, a0.y, a0.z + t * daz);
    }

    private static _closestOnSegment(
        p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3
    ): THREE.Vector3 {
        const ab   = new THREE.Vector3().subVectors(b, a);
        const len2 = ab.lengthSq();
        if (len2 < 1e-12) return a.clone();
        const t = Math.max(0, Math.min(1, new THREE.Vector3().subVectors(p, a).dot(ab) / len2));
        return a.clone().addScaledVector(ab, t);
    }

    /**
     * §CURVED-DETECT-FIX: Angle between two pre-computed unit direction vectors.
     * Used by _detect() when arc tangent directions are already available so that
     * we don't rebuild direction vectors from chord endpoints.
     */
    private static _angleFromDirs(
        dA: THREE.Vector3,
        dB: THREE.Vector3,
    ): number {
        return Math.acos(THREE.MathUtils.clamp(Math.abs(dA.dot(dB)), 0, 1));
    }
}
