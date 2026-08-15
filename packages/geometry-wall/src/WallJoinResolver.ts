import * as THREE from '@pryzm/renderer-three/three';
import { COINCIDENT_M } from '@pryzm/geometry-kernel';
import { WallData } from './WallTypes';
import { detectJunctionClusters } from './WallJunctionClustering';
import { SpatialGrid } from '@pryzm/snapping';
import type { JoinData } from '@pryzm/core-app-model';

// ─── Public types ─────────────────────────────────────────────────────────────

// JoinData is defined authoritatively in @pryzm/core-app-model (WallJoinTypes.ts).
// Re-exported here for colocation with WallJoinResolver consumers.
export type { JoinData } from '@pryzm/core-app-model';

// ─── §LOAD-FLOOD-GATE (2026-06-29) — wall-join diagnostic gate ──────────────────
//
// A whole-level `resolveLevel` pass over a residential building (hundreds of
// partition→shell T-joins + multi-wall clusters + diff-thickness corners × 5-7
// floors) emits THOUSANDS of `console.log`/`console.warn` lines. With DevTools
// open every line is serialised + painted on the MAIN THREAD, so the resolver
// log alone is measurable jank during a project open (the load-time resolve is
// deferred off the critical path by §WALL-JOIN-LOAD-SKIP, but it still runs and
// still floods). These four diagnostic sites were previously ALWAYS-ON:
//   • §PARTITION-SHELL-INNER-FACE REFUSED   • §SHELL-ANCHOR-PRESERVE
//   • §MULTI-CLUSTER per-cluster summary    • §WJR-DIFF-THICKNESS butt
//
// Gate them behind a single opt-in flag (default OFF) so a normal load/resolve
// pays ZERO console cost while the full diagnostic capability survives for
// debugging. `wallJoinDiagOn()` is a cheap boolean read; callers wrap the whole
// `console.*(...)` call (including the string interpolation) in `if (...)` so
// the message is never even built when the flag is off. The legacy
// `__PRYZM_WALL_JOIN_DEBUG` flag is honoured too (back-compat alias) so existing
// debug sessions keep working; `__pryzmWallJoinDiag` is the canonical name.
function wallJoinDiagOn(): boolean {
    const g = globalThis as unknown as {
        __pryzmWallJoinDiag?: boolean;
        __PRYZM_WALL_JOIN_DEBUG?: boolean;
    };
    return g.__pryzmWallJoinDiag === true || g.__PRYZM_WALL_JOIN_DEBUG === true;
}

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
/**
 * §PARTITION-SHELL-DEGENERATE-STUB — a partition whose CURRENT (un-trimmed)
 * length is already below this threshold is an unusable stub: even if its
 * inner-face clamp is refused (it would collapse below `minWallLength`), the
 * un-clamped baseline still protrudes through the shell and would feed the heavy
 * CSG/extrude build path with degenerate overlapping geometry → phantom spike +
 * rebuild hang. Such a wall is flagged `invalid` so the mesh builder skips it.
 * A LONG partition whose single end-clamp is refused is NOT degenerate and is
 * left un-clamped (rendered), exactly as before.
 */
export const DEGENERATE_STUB_LENGTH = 0.15;

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

/**
 * §PERF-WALL-MOVE-INCREMENTAL-REBUILD (L-234) — allocation-free EXACT lower bound
 * on the distance from point `p` to the segment `[a,b]`: the distance from `p` to
 * that segment's axis-aligned bounding box.
 *
 * ── Why this prune is EXACT, not a heuristic ────────────────────────────────────
 * The closest point on the segment necessarily lies INSIDE the segment's AABB, so
 *
 *     dist(p, segment) >= dist(p, aabb(segment))        for every p
 *
 * always. Both call sites below run the shape
 *
 *     const c = _closestOnSegment(p, hs, he);
 *     const perp = p.distanceTo(c);
 *     if (perp > bestPerp) continue;                    // bestPerp only ever SHRINKS
 *
 * so a candidate rejected by `_segAabbDistSq(p, hs, he) > bestPerp²` would have been
 * rejected by that exact `perp > bestPerp` test one line later. Iteration order,
 * tie-breaking (last-equal-perp wins) and the chosen host are therefore byte-
 * identical to the unpruned loop. Nothing is approximated and no tolerance is
 * widened. It is also staleness-proof: the AABB is derived from the SAME live
 * `bl` entry the exact test then uses, never from a precomputed index.
 *
 * ── Why it matters ──────────────────────────────────────────────────────────────
 * `_closestOnSegment` allocates three THREE.Vector3 per call. Both host searches —
 * `_bodyAnchorOf` (§SHELL-ANCHOR-PRESERVE) and `_clampEndToShellInnerFace`
 * (§PARTITION-SHELL-INNER-FACE) — scan EVERY wall on the level, per endpoint. On a
 * 200-wall plate that is ~160 000 calls / ~half a million Vector3 allocations per
 * `resolveLevel`, which is where the measured 156 ms of a wall-move resolve went
 * (L-234). The AABB reject is ~12 scalar ops and no allocation.
 */
function _segAabbDistSq(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
    const minX = a.x < b.x ? a.x : b.x, maxX = a.x < b.x ? b.x : a.x;
    const minY = a.y < b.y ? a.y : b.y, maxY = a.y < b.y ? b.y : a.y;
    const minZ = a.z < b.z ? a.z : b.z, maxZ = a.z < b.z ? b.z : a.z;
    const dx = p.x < minX ? minX - p.x : (p.x > maxX ? p.x - maxX : 0);
    const dy = p.y < minY ? minY - p.y : (p.y > maxY ? p.y - maxY : 0);
    const dz = p.z < minZ ? minZ - p.z : (p.z > maxZ ? p.z - maxZ : 0);
    return dx * dx + dy * dy + dz * dz;
}

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

        // ── §FIX-WALL-FACE-TRIM-NO-CLASH (founder 2026-08-06) ───────────────────
        // THE INVARIANT this pass enforces, stated plainly:
        //
        //   A wall that TERMINATES against another wall is trimmed to that wall's FACE.
        //   No resolved wall footprint on a level penetrates another wall's solid by
        //   more than `CLASH_EPS_M`.
        //
        // The founder: "I create a wall in the L-shape mitred join between two walls —
        // using the MID POINT (basically the INNER JOINT MITRE POINT). Why not? Still PRYZM
        // needs to be clear and not allow CLASHES. The joint should be similar but just
        // CLEAN TO THE FACE of the wall." The snap stays ALLOWED; the OUTPUT must be clean.
        //
        // MEASURED root cause (probe, 0.30 m L-corner arms + a 0.10 m guest ending exactly
        // on the inner mitre vertex (0.15, 0.15)): 2 520 mm² of DOUBLED SOLID — the founder's
        // "small square notch / overlapping box". No existing pass claims it:
        //   • `_applyT` / T-projection only fire for a MID-SPAN contact;
        //   • `_clampEndToShellInnerFace` rejects the candidate host twice over — the
        //     `endMargin` test (~:434) requires the perpendicular foot to be ≥ one host
        //     half-thickness clear of the host's ENDS, and at a CORNER it never is, and the
        //     §PARTITION-SHELL-COLLINEAR-GUARD (~:437) rejects anything more than 30° off
        //     perpendicular, which an oblique guest out of a corner always is.
        // So the endpoint is simply left where the author put it — inside the host's solid.
        //
        // WHY TRIM ALONG THE WALL'S OWN AXIS (and not laterally, as the shell clamp does):
        // an axial pull-back never moves the endpoint OFF its own centreline. The lateral
        // displacement used by the old §DIFF-THICKNESS-FIX butt is exactly what produced the
        // `§DIAG-ROOM-LOOP BREAK … NNNmm from centreline` room-loop failures (see
        // §FIX-WALL-TYPECHANGE-MITRE). This pass therefore cannot re-open that defect.
        // The HOST is never moved (§SHELL-ANCHOR-PRESERVE holds).
        this._trimEndsOutOfNeighbourSolids(walls, bl, byId, result, thresholds);

        // ── §RESOLVED-STUB-SWEEP (founder 2026-06-19) ───────────────────────────
        // FINAL net for the degenerate dead-band. A wall can be collapsed into
        // `[minWallLength, DEGENERATE_STUB_LENGTH)` = [0.05, 0.15) m by the SUM of
        // several individually-legal trims — e.g. RBZ9: a corner crossing on its
        // start + a SUCCESSFUL shell inner-face clamp (+99 mm) + a multi-cluster
        // consensus on its end → a ~0.10 m residual that every pass reports
        // `closed=✓ invalid=false`. The per-pass guards refuse only a trim that
        // would land BELOW minWallLength (0.05); §WJR-INVALID's 0.15 m guard fires
        // ONLY on the shell-clamp-REFUSED branch (which a SUCCESSFUL clamp skips);
        // and the mesh backstop is < 1e-3 m. So a 0.10 m stub sails through every
        // guard and the builder extrudes it into the down-spike the founder saw.
        //
        // This sweep judges the FINAL resolved length — after every legitimate trim
        // has had its chance — and flags such a stub `invalid` so WallFragmentBuilder
        // skips it ("wrong-but-skipped beats a 0.1 m spike"). It only ADDS a flag:
        // it never moves an endpoint and never widens a tolerance, so it composes
        // with all four shell/clamp passes and is parity-safe. It is scoped to walls
        // the resolver ACTUALLY ADJUSTED (`result.has`) — an unadjusted wall keeps
        // its upstream-validated source length untouched (a legitimate short jog the
        // user drew is not the resolver's to refuse). NB: do NOT raise the per-pass
        // minWallLength to 0.15 as a shortcut — that would refuse legitimate
        // 0.05–0.15 m corner trims; only the FULLY-COLLAPSED final result is skipped.
        for (const w of walls) {
            const adj = result.get(w.id);
            if (!adj || adj.invalid) continue;            // unadjusted ⇒ keep source; already-flagged ⇒ keep first reason
            const cur = bl.get(w.id);
            if (!cur) continue;
            const len = cur[0].distanceTo(cur[1]);
            if (len >= thresholds.minWallLength && len < DEGENERATE_STUB_LENGTH) {
                this._flagInvalid(w.id, bl, result, `§RESOLVED-STUB-SWEEP collapsed to ${len.toFixed(3)}m`);
            }
        }

        return result;
    }

    // ── §FIX-WALL-FACE-TRIM-NO-CLASH — output non-overlap invariant ─────────────

    /** Penetration below this depth (m) is not a clash — it is the deliberate ~1 mm butt
     *  overlap the T / inner-face passes leave to avoid Z-fighting, plus float noise. */
    private static readonly CLASH_EPS_M = 0.0015;

    /**
     * Flag: `__pryzmWallFaceTrimNoClash = true` enables the clash trim. **DEFAULT OFF —
     * deliberately, and this needs a decision before it flips.**
     *
     * The pass is complete and proven (see `WallJoinResolver.clashFreeFootprints.test.ts`:
     * it takes the inner-mitre-point join from 2 520 mm² of doubled solid to the sampler
     * floor). It is default-OFF because turning it on CHANGES A SHIPPED CONTRACT, not
     * because it is unfinished:
     *
     *   §FIX-NEWWALL-LCORNER-FLUSH (L-94) seats a 3rd wall snapped to an L corner by putting
     *   its CENTRELINE endpoint on an arm's lateral face, and pins that seat with
     *   `hypot(join − corner) < 0.16` (WallJoinResolver.newWallLCornerFlush.test.ts:85).
     *   For an OBLIQUE wall, a centreline-on-face seat still leaves the DEEPER cap corner
     *   inside the arm — which is precisely the founder's residual "square notch". Clearing
     *   the CAP (what "CLEAN TO THE FACE" requires) necessarily retreats the centreline
     *   FURTHER than 0.16, so the two rules are in direct conflict: the clash-free invariant
     *   supersedes the L-94 tolerance, and L-94's assertion must be re-expressed as "the cap
     *   clears the face" rather than "the centreline is within 160 mm of the corner".
     *
     * Enabling it turns 20 existing assertions across 11 files red — all of them pins on the
     * OLD seat (L-94 flush seat, consensus-star byte-identity, pass-through square caps).
     * Re-baselining those is a founder-level call on shipped join behaviour, not something
     * this pass should make silently. Set the flag to true to evaluate it.
     *
     * ⚠ KNOWN OPEN DESIGN GAP — THE CASCADE. The rule as written is symmetric: it retreats
     * ANY endpoint whose cap penetrates ANY other wall's solid. At the founder's inner-mitre
     * junction that is too strong. Measured (0.30 m arms + a 0.10 m guest ending on the inner
     * mitre vertex): the guest correctly retreats 69 mm, but the two ARMS' own mitre corners
     * — which legitimately live AT (0.15, 0.15), inside the guest's band — are read as clashes
     * too, so both arms retreat 69 mm and LOSE their miter normals. The committed L is
     * destroyed in order to clean up the newcomer. The missing ingredient is a PRIORITY rule:
     * at a junction, the newcomer yields and the committed corner is immutable (the same
     * principle §FIX-WALL-3RD-AT-LCORNER-IMMUTABLE / §FIX-EXISTING-CORNER-IMMUTABLE already
     * encode for detection). Until that is designed, the pass must stay off — an unprioritised
     * clash trim trades the founder's small notch for a broken mitre, which is worse.
     * `WallJoinResolver.clashFreeFootprints.test.ts` measures both figures so neither the
     * defect nor this cascade can regress silently.
     */
    private static _faceTrimNoClashEnabled(): boolean {
        return (globalThis as { __pryzmWallFaceTrimNoClash?: boolean }).__pryzmWallFaceTrimNoClash === true;
    }

    /**
     * §FIX-WALL-FACE-TRIM-NO-CLASH — pull any wall endpoint whose END CAP penetrates another
     * wall's solid back ALONG ITS OWN AXIS until the cap clears that wall's face.
     *
     * Runs LAST, on the fully-resolved baselines, so it can only ever REMOVE overlap that
     * every legitimate join pass has already declined to claim. Idempotent: a second
     * `resolveLevel` over the trimmed baselines finds penetration ≤ `CLASH_EPS_M` and does
     * nothing, so reopening a project does not drift the geometry.
     *
     * DELIBERATE NON-GOALS (each would be wrong, not merely unimplemented):
     *   • NEAR-PARALLEL pairs are skipped. Two walls drawn along one another overlap for
     *     their whole shared run; that is an AUTHORING collision, not a joint, and no axial
     *     trim expresses a fix for it (trimming would delete the wall). Reported, not patched.
     *   • The trim is capped at `hostT + wallT`. A wall lying wholly inside another is the
     *     parallel case above; it must never be annihilated by this pass.
     *   • A trim that would take the wall below `minWallLength` is refused outright — the
     *     §RESOLVED-STUB-SWEEP below then judges the final length as it does for every pass.
     */
    private static _trimEndsOutOfNeighbourSolids(
        walls:      WallData[],
        bl:         Map<string, [THREE.Vector3, THREE.Vector3]>,
        byId:       Map<string, WallData>,
        result:     Map<string, JoinData>,
        thresholds: JoinThresholds,
    ): void {
        if (!this._faceTrimNoClashEnabled()) return;
        const EPS = this.CLASH_EPS_M;
        const MIN_LEN = thresholds.minWallLength;
        /** cos 15° — above this the two axes are "along one another", not a joint. */
        const PARALLEL_DOT = 0.966;

        for (const w of walls) {
            const adj = result.get(w.id);
            if (adj?.invalid) continue;
            for (const side of ['start', 'end'] as Side[]) {
                const cur = bl.get(w.id);
                if (!cur) break;
                const [ws, we] = cur;
                const joinPt = side === 'start' ? ws : we;
                const freePt = side === 'start' ? we : ws;
                const axis = new THREE.Vector3(freePt.x - joinPt.x, 0, freePt.z - joinPt.z);
                const curLen = axis.length();
                if (curLen < 1e-6) continue;
                axis.divideScalar(curLen);                        // unit, pointing INTO the wall
                const halfT = (byId.get(w.id)?.thickness ?? w.thickness) / 2;
                const lat = new THREE.Vector3(-axis.z, 0, axis.x).multiplyScalar(halfT);
                // The end-cap corners AS RENDERED — i.e. AFTER the miter-plane projection
                // `buildMiterPrism` will apply. Measuring the un-mitred square cap instead
                // would read every legitimate mitred L as a deep clash (each arm's square
                // cap reaches the other's centreline) and trim corners that are already
                // perfect. The invariant is about the RENDERED footprint, so measure that.
                const mn = side === 'start' ? adj?.startMN : adj?.endMN;
                const projectCap = (p: THREE.Vector3): THREE.Vector3 => {
                    if (!mn) return p;
                    // `axis` points INTO the wall; buildMiterPrism projects along the wall
                    // direction, which at this end is −axis. Sign cancels in the ratio.
                    const dotD = mn.nx * axis.x + mn.nz * axis.z;
                    if (Math.abs(dotD) < 1e-9) return p;
                    const t = (mn.nx * (joinPt.x - p.x) + mn.nz * (joinPt.z - p.z)) / dotD;
                    return new THREE.Vector3(p.x + t * axis.x, 0, p.z + t * axis.z);
                };
                const capCorners = [
                    projectCap(new THREE.Vector3(joinPt.x + lat.x, 0, joinPt.z + lat.z)),
                    projectCap(new THREE.Vector3(joinPt.x - lat.x, 0, joinPt.z - lat.z)),
                ];

                let pullBack = 0;
                let culprit = '';
                for (const h of walls) {
                    if (h.id === w.id) continue;
                    if (result.get(h.id)?.invalid) continue;
                    const hbl = bl.get(h.id);
                    if (!hbl) continue;
                    const [hs, he] = hbl;
                    const hVec = new THREE.Vector3(he.x - hs.x, 0, he.z - hs.z);
                    const hLen = hVec.length();
                    if (hLen < 1e-6) continue;
                    const hDir = hVec.clone().divideScalar(hLen);
                    if (Math.abs(hDir.dot(axis)) > PARALLEL_DOT) continue;   // along one another — not a joint
                    const hHalfT = (byId.get(h.id)?.thickness ?? h.thickness) / 2;
                    const hNorm = new THREE.Vector3(-hDir.z, 0, hDir.x);
                    // How far along OUR axis must we retreat so that EVERY cap corner is out
                    // of this host's lateral band, considering only corners that are also
                    // within the host's longitudinal extent (else they miss the host anyway)?
                    const denom = Math.abs(hNorm.dot(axis));
                    if (denom < 1e-6) continue;                              // cannot escape laterally along our axis
                    for (const c of capCorners) {
                        const rel = new THREE.Vector3(c.x - hs.x, 0, c.z - hs.z);
                        const along = rel.dot(hDir);
                        if (along < -hHalfT || along > hLen + hHalfT) continue;   // past the host's ends
                        const lateral = Math.abs(rel.dot(hNorm));
                        const depth = hHalfT - lateral;                     // >0 ⇒ inside the host solid
                        if (depth <= EPS) continue;
                        // Retreating δ along `axis` reduces the lateral penetration by
                        // δ·|axis·hNorm|. Solve for the δ that puts the corner ON the face.
                        const need = (depth - EPS) / denom;
                        if (need > pullBack) { pullBack = need; culprit = h.id; }
                    }
                }

                if (pullBack <= 0) continue;
                const maxPull = halfT * 2 + (byId.get(culprit)?.thickness ?? 0);
                if (pullBack > maxPull) {
                    // Deeper than a joint can explain (a wall buried in another) — refuse.
                    continue;
                }
                const newLen = curLen - pullBack;
                if (newLen < MIN_LEN) continue;                              // never collapse a wall
                const newPt = new THREE.Vector3(
                    joinPt.x + axis.x * pullBack, joinPt.y, joinPt.z + axis.z * pullBack,
                );
                const newBL: [THREE.Vector3, THREE.Vector3] = side === 'start'
                    ? [newPt, we.clone()]
                    : [ws.clone(), newPt];
                if (!Number.isFinite(newBL[0].x) || !Number.isFinite(newBL[0].z)
                    || !Number.isFinite(newBL[1].x) || !Number.isFinite(newBL[1].z)) continue;
                bl.set(w.id, newBL);
                const rec = result.get(w.id) ?? { baseLine: newBL, startMN: null, endMN: null };
                rec.baseLine = newBL;
                // The cap now butts a FACE — a square cap is the correct, stable geometry
                // there (a mitre normal inherited from a join this end no longer reaches
                // would re-introduce the oblique overshoot this pass just removed).
                if (side === 'start') rec.startMN = null; else rec.endMN = null;
                result.set(w.id, rec);
                if (wallJoinDiagOn()) {
                    console.log(
                        `[WallJoinResolver] §FIX-WALL-FACE-TRIM-NO-CLASH ${w.id}(${side}) pulled back ` +
                        `${(pullBack * 1000).toFixed(1)}mm out of ${culprit}'s solid → clean face butt`,
                    );
                }
            }
        }
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
        // §PARTITION-SHELL-COLLINEAR-GUARD (2026-06-30) — the clamp below places the
        // join endpoint at `hostContact + hostDir*along + sideNormal*targetLateral`,
        // where `along = (freePt − hostContact)·hostDir`. That is only correct when the
        // partition meets the host near-PERPENDICULARLY (then `along ≈ 0`, so the new
        // endpoint stays at the join end and only its lateral offset moves to the inner
        // face). For a partition running NEAR-COLLINEAR with / grazing the host, `along ≈
        // ±(full wall length)`, so `newJoin` is placed ~a wall-length down the host and
        // only `hostHalfT` off-axis → `newLen ≈ hostHalfT` (≈0.049 m), collapsing a long
        // (e.g. 6.2 m) wall (the founder's `§PARTITION-SHELL-INNER-FACE REFUSED … newLen=
        // 0.0490 curLen=6.2383`). A real partition-T is never collinear with its host, so
        // reject any candidate host whose axis is within ~30° of THIS wall's axis. The
        // existing inner-face tests are all near-perpendicular → byte-identical.
        const _partDir = new THREE.Vector3().subVectors(freePt, joinPt).normalize();
        const PERP_COLLINEAR_DOT = 0.5;   // cos 60° — reject hosts >30° from perpendicular
        let host: WallData | null = null;
        let hostContact = new THREE.Vector3();
        let hostHalfT = 0;
        let bestPerp = snap;
        for (const h of walls) {
            if (h.id === wall.id) continue;
            const hbl = bl.get(h.id);
            if (!hbl) continue;
            const [hs, he] = hbl;
            // §PERF-WALL-MOVE-INCREMENTAL-REBUILD (L-234) — EXACT allocation-free
            // reject. dist(joinPt, segment) >= dist(joinPt, aabb(segment)), and
            // `bestPerp` only ever shrinks, so any host pruned here would have hit
            // the `perp > bestPerp` continue below. Byte-identical outcome.
            if (_segAabbDistSq(joinPt, hs, he) > bestPerp * bestPerp) continue;
            const c = this._closestOnSegment(joinPt, hs, he);
            const perp = joinPt.distanceTo(c);
            if (perp > bestPerp) continue;
            // Foot must be strictly INSIDE the host span (a real body T) — at least
            // one host half-thickness clear of either host end so a genuine corner
            // (endpoint↔endpoint) is never reclassified as a body-T.
            const endMargin = Math.max(0.05, h.thickness / 2);
            if (c.distanceTo(hs) < endMargin || c.distanceTo(he) < endMargin) continue;
            // §PARTITION-SHELL-COLLINEAR-GUARD — skip a near-collinear/grazing host. A
            // genuine partition-T meets the host near-perpendicular (|partDir·hostDir| ≈
            // 0); a grazing neighbour (≈1) is NOT a wall terminating on this host's body.
            const _hDir = new THREE.Vector3().subVectors(he, hs).normalize();
            if (Math.abs(_hDir.dot(_partDir)) > PERP_COLLINEAR_DOT) continue;
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
        const INNER_OVERLAP_M = 0.001;   // §C73 §2.3 — NOT a tolerance: a deliberate 1 mm overlap DIMENSION added into the geometry (no Z-fighting, no gap). Nothing is compared against it; it is subtracted from a lateral offset. Named for what it is, in metres.
        const targetLateral = hostHalfT - INNER_OVERLAP_M;
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
            // §PARTITION-SHELL-DEGENERATE-STUB — the inner-face clamp would
            // collapse this wall below `minLen`. Two distinct cases:
            //
            //   (1) DEGENERATE STUB — the wall's CURRENT (un-trimmed) length is
            //       itself already below DEGENERATE_STUB_LENGTH. This is an
            //       unusable near-0.1 m partition whose end protrudes through the
            //       shell. Left un-clamped it feeds the heavy CSG/extrude build
            //       path with degenerate overlapping geometry → phantom spike +
            //       rebuild HANG. Flag it `invalid` so WallFragmentBuilder.buildWall
            //       skips its geometry build entirely (the §WJR-NAN-GUARD near-zero
            //       sniff at 1e-3 m does NOT catch a 0.1 m stub, so the durable
            //       invalid flag is the only thing that keeps it out of the build).
            //
            //   (2) LEGITIMATE LONG WALL — a long partition whose ONE end-clamp is
            //       refused. We must NOT drop it (§WJR-INVALID guidance ~L424):
            //       leave it un-clamped (rendered at its source baseline), exactly
            //       as the bare `return` did before this fix.
            const curLen = ws.distanceTo(we);
            // §LOAD-FLOOD-GATE — gated (default OFF). The clamp-refusal is handled
            // (degenerate stubs are flagged invalid below); the log is diagnostic only
            // and fired per-refused-join, flooding a heavy load.
            if (wallJoinDiagOn()) {
                console.warn(
                    `[WallJoinResolver] §PARTITION-SHELL-INNER-FACE REFUSED — clamp would collapse ` +
                    `${wall.id}(${side}) newLen=${newLen.toFixed(4)} (MIN=${minLen}) curLen=${curLen.toFixed(4)}`,
                );
            }
            if (curLen < DEGENERATE_STUB_LENGTH) {
                this._flagInvalid(
                    wall.id, bl, result,
                    '§PARTITION-SHELL-INNER-FACE unclampable degenerate stub',
                );
            }
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
        // §WALL-JOIN-LOAD-SKIP (2026-06-24) — this per-join log fires once per
        // partition→shell T-join inside resolveLevel. For a residential building
        // (hundreds of partitions × 5–6 floors) the whole-level resolve emits thousands
        // of console writes, which on its own measurably slows the resolve and drowns the
        // load console. Gate it behind `window.__PRYZM_WALL_JOIN_DEBUG` (default OFF) so
        // it is opt-in for debugging and silent in production / on load.
        if (wallJoinDiagOn()) {
            const beforeCls =
                curLateral <= -hostHalfT + 1e-3 ? 'protrudes⚠'
                : Math.abs(curLateral) <= 1e-3   ? 'centreline⚠'
                : 'insideBody⚠';
            console.log(
                `[WallJoinResolver] §DIAG-WALL-JOIN PARTITION→SHELL ${wall.id}(${side}) host=${host.id} ` +
                `before=${beforeCls} (lateral=${(curLateral * 1000).toFixed(1)}mm of innerFace=${(hostHalfT * 1000).toFixed(1)}mm) ` +
                `clamp=+${((targetLateral - curLateral) * 1000).toFixed(1)}mm landed=innerFace✓`,
            );
        }
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
            const pinnedKeys = new Set<string>();   // §C73-EPSILON-POLICY: "pinned" = within the kernel's declared COINCIDENT_M (1 mm), replacing the local PINNED_TOL = 0.001 — same value, same question, same verdicts
            const pinnedPairMap = new Map<string, { partnerKey: string; coincidentPt: THREE.Vector3 }>();

            for (let i = 0; i < endpoints.length; i++) {
                const posI = this._getEpPos(endpoints[i], bl);
                const keyI = `${endpoints[i].wallId}:${endpoints[i].side}`;
                for (let j = i + 1; j < endpoints.length; j++) {
                    if (endpoints[i].wallId === endpoints[j].wallId) continue;
                    const posJ = this._getEpPos(endpoints[j], bl);
                    if (posI.distanceTo(posJ) <= COINCIDENT_M) {
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
                    if (posA.distanceTo(posB) > COINCIDENT_M) continue;

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

            // ── §NEAR-CORNER-L (Jun 2026 — founder perimeter-corner-close fix) ──────
            // THE founder defect: on a GENERATED / WELDED (often ~45° ROTATED) shell the
            // two perimeter walls meeting at a corner are NOT bit-exact coincident — they
            // sit a few mm–cm apart (post-weld / post-miter / principal-axis drift). When
            // an interior partition T-joins the shell mid-span NEAR that corner, the
            // editor's ZOOM-DEPENDENT (large) snapRadius sweeps all three endpoints into
            // ONE cluster. Because the two shell endpoints are > COINCIDENT_M (1 mm) apart,
            // the pinned primary-pair loop above finds NO primary corner → the two shell
            // walls fall to the §MULTI-CLUSTER consensus-trim branch and each gets a
            // SQUARE (perpendicular) end cap trimmed to its own axis. Two perpendicular
            // square caps at a corner do NOT share a miter plane → the corner opens (the
            // founder's "tiny diamond of empty space" in plan, vertical seam in 3D).
            //
            // FIX: when the pinned loop found NO primary pair, fall back to a GEOMETRIC
            // near-corner detection — the CLOSEST endpoint↔endpoint pair from two
            // DIFFERENT, materially-long, perpendicular-ish walls whose endpoints are
            // within NEAR_CORNER_TOL of each other (well below the cluster snapRadius, so
            // a genuine interior Y/star — whose members are spread further apart — is NOT
            // captured). Treat that pair EXACTLY like a pinned primary corner: leave both
            // un-handled so the pair-wise _detect → _applyCorner mitres them to the shared
            // centreline intersection (a closed bisector L), and route every OTHER cluster
            // member (the partition) through T-INTO-CORNER. This is the SAME deferral the
            // bit-exact corner already gets, just keyed off near-coincidence instead of
            // 1 mm coincidence — so a slightly-gapped shell corner closes identically to a
            // perfect one. Deterministic (ADR-0061): closest-pair + creation-order tie-break.
            //
            // Safety: (a) endpoint↔endpoint only (cluster members are endpoints by
            // construction — never a body-T); (b) both walls must exceed NEAR_CORNER_MIN_LEN
            // so a degenerate stub never poses as a corner wall; (c) perpendicular-ish gate
            // (|dot| < PERP_DOT_THRESHOLD) so a near-collinear pass-through is left to
            // §PASS-THROUGH-FLUSH; (d) only fires when primaryPair is still null, so the
            // pinned path is byte-unchanged.
            const NEAR_CORNER_TOL     = Math.min(thresholds.snapRadius, 0.12); // ≤120 mm corner cluster
            const NEAR_CORNER_MIN_LEN = 0.30;                                   // both walls clearly real
            if (!primaryPair) {
                let bestDist = NEAR_CORNER_TOL;
                let bestDot  = Infinity;
                let bestCreated = Infinity;
                for (let i = 0; i < endpoints.length; i++) {
                    const epA = endpoints[i];
                    if (_selfClusterWallIds.has(epA.wallId)) continue;
                    const wallA = _byId.get(epA.wallId);
                    if (!wallA) continue;
                    const [aS, aE] = bl.get(epA.wallId)!;
                    if (aS.distanceTo(aE) < NEAR_CORNER_MIN_LEN) continue;
                    const posA = this._getEpPos(epA, bl);
                    for (let j = i + 1; j < endpoints.length; j++) {
                        const epB = endpoints[j];
                        if (epA.wallId === epB.wallId) continue;
                        if (_selfClusterWallIds.has(epB.wallId)) continue;
                        const wallB = _byId.get(epB.wallId);
                        if (!wallB) continue;
                        const [bS, bE] = bl.get(epB.wallId)!;
                        if (bS.distanceTo(bE) < NEAR_CORNER_MIN_LEN) continue;
                        const posB = this._getEpPos(epB, bl);
                        const d = posA.distanceTo(posB);
                        if (d > NEAR_CORNER_TOL) continue;
                        const dirA = this._wallDirAtJoin(wallA, epA.side, aS, aE);
                        const dirB = this._wallDirAtJoin(wallB, epB.side, bS, bE);
                        const absDot = Math.abs(dirA.dot(dirB));
                        if (absDot >= PERP_DOT_THRESHOLD) continue;   // leave pass-throughs to §PASS-THROUGH-FLUSH
                        const maxCreated = Math.max(
                            wallA.metadata?.createdAt ?? 0,
                            wallB.metadata?.createdAt ?? 0,
                        );
                        // Prefer the CLOSEST pair; ties → most perpendicular; then older.
                        const closer       = d < bestDist - 1e-4;
                        const tiedMorePerp = Math.abs(d - bestDist) <= 1e-4 && absDot < bestDot - 1e-3;
                        const tiedOlder    = Math.abs(d - bestDist) <= 1e-4
                            && Math.abs(absDot - bestDot) <= 1e-3 && maxCreated < bestCreated;
                        if (closer || tiedMorePerp || tiedOlder) {
                            bestDist = d;
                            bestDot = absDot;
                            bestCreated = maxCreated;
                            primaryPair = {
                                idA: epA.wallId, sideA: epA.side,
                                idB: epB.wallId, sideB: epB.side,
                                dirA, dirB,
                            };
                        }
                    }
                }
                // §NEAR-CORNER-L DISCRIMINATOR — a perpendicular near-coincident endpoint
                // pair is AMBIGUOUS: it is EITHER a slightly-gapped shell L-corner (the
                // founder defect, which needs a bisector miter) OR two arms of a pure
                // interior Y/star junction (which must keep the §CONSENSUS-ON-CENTRELINE
                // trim so the room seals — regressing that re-merges rooms). The decisive
                // difference: at the SHELL corner a THIRD cluster member (the partition)
                // T-attaches to the BODY (mid-span) of one of the L-pair walls — that is
                // why they cluster at all; in a pure Y the third arm meets the other two
                // at their ENDS, never on a body. So only accept the recovered L when some
                // OTHER cluster member's clustered endpoint sits on the mid-span (not the
                // end) of one L-pair wall — the T-attacher signature. No T-attacher ⇒ this
                // is a Y/star ⇒ leave primaryPair null ⇒ the consensus-trim path is
                // byte-unchanged (no §CONSENSUS regression).
                if (primaryPair) {
                    const pp = primaryPair;
                    const ppPos = this._getEpPos({ wallId: pp.idA, side: pp.sideA }, bl);
                    // (1) SEPARATION — the L-pair endpoints must be SUBSTANTIALLY closer to
                    // each other than to any OTHER cluster member. A shell corner: the two
                    // perimeter ends are ~mm–cm apart while the partition that swept them
                    // into this (large-snapRadius) cluster is much farther (it runs into
                    // the room). A pure interior Y/star: all arms meet at a tight triple,
                    // so no member is well-separated → the pair is NOT a distinct corner →
                    // keep the consensus trim (no §CONSENSUS-ON-CENTRELINE regression).
                    const SEP_FACTOR = 2.0;
                    const SEP_ABS_MIN = 0.10;   // ≥100 mm clear of the corner point
                    let nearestOther = Infinity;
                    for (const ep of endpoints) {
                        if (ep.wallId === pp.idA || ep.wallId === pp.idB) continue;
                        if (_selfClusterWallIds.has(ep.wallId)) continue;
                        nearestOther = Math.min(nearestOther, ppPos.distanceTo(this._getEpPos(ep, bl)));
                    }
                    const wellSeparated =
                        nearestOther === Infinity ||   // 2-wall cluster: pair IS the corner
                        (nearestOther >= SEP_ABS_MIN && nearestOther >= SEP_FACTOR * bestDist);
                    // (2) T-ATTACHER — at least one other member sits on the BODY (mid-span)
                    // of an L-pair wall (the partition welded onto the shell), OR the cluster
                    // is just the 2 corner walls. This is the shell-corner signature; a pure
                    // Y has its third arm meeting at the ENDS, not on a body.
                    let hasTAttacher = nearestOther === Infinity;
                    for (const ep of endpoints) {
                        if (hasTAttacher) break;
                        if (ep.wallId === pp.idA || ep.wallId === pp.idB) continue;
                        if (_selfClusterWallIds.has(ep.wallId)) continue;
                        const pos = this._getEpPos(ep, bl);
                        for (const hostId of [pp.idA, pp.idB]) {
                            const [hs, he] = bl.get(hostId)!;
                            const c = this._closestOnSegment(pos, hs, he);
                            if (pos.distanceTo(c) > thresholds.snapRadius) continue;
                            const host = _byId.get(hostId);
                            const endMargin = Math.max(0.05, (host?.thickness ?? 0.2) / 2);
                            if (c.distanceTo(hs) < endMargin || c.distanceTo(he) < endMargin) continue;
                            hasTAttacher = true;
                            break;
                        }
                    }
                    // §NEAR-CORNER-L-PERP (Defect 3, audit 2026-06-18 §3a) — BROADEN the
                    // discriminator. The `hasTAttacher` mid-span test FAILS for the founder's
                    // gappy shell L when the partition that swept the corner into this cluster
                    // was DROPPED by the weld (sub-floor collapse) OR T-attaches near a wall END
                    // (inside `endMargin`) rather than the mid-span body → `hasTAttacher=false` →
                    // both shell ends fall to §CONSENSUS square-cap → caps don't share a plane →
                    // the GAP=2271mm corner. RECOVER it via the UNAMBIGUOUS shell-L signature: a
                    // near-coincident, strongly-PERPENDICULAR pair of two LONG walls in a SMALL
                    // cluster (≤1 OTHER arm). Critical guards to never mis-fire on a 4-way '+',
                    // a Y, or a star (which also expose perpendicular pairs but are NOT L-corners):
                    //   • STRICT perpendicular gate (|dot| < 0.34 ≈ >70°): a pure 120° Y has
                    //     |dot|=0.5 → excluded; a '+' has |dot|≈0 → would pass the angle test, so…
                    //   • ≤1 distinct OTHER (non-pair, non-self-cluster) wall in the cluster: an
                    //     L-corner is 2 walls + at most 1 partition; a '+'/Y/star has ≥2 other
                    //     arms → excluded by the count.
                    //   • both pair walls already pass NEAR_CORNER_MIN_LEN (0.30 m) above → "long".
                    // Pure-Y/star and '+' consensus paths stay byte-identical (excluded here); only
                    // the genuine 2-(or-3-)wall perpendicular shell corner is added.
                    //
                    // NOTE on `wellSeparated`: this OR-branch deliberately does NOT require it.
                    // The exact failing input is a partition attaching WITHIN ~endMargin of the
                    // corner (so it is close, NOT well-separated); demanding separation would
                    // re-discard the case. The '+'/Y/star false positives are instead excluded
                    // by the two structural guards below (count ≤1 and the strict perp gate),
                    // which do not depend on separation. The T-attacher path above keeps its own
                    // `wellSeparated` requirement unchanged (byte-identical for that signature).
                    let perpShellL = false;
                    if (!hasTAttacher && bestDot < 0.34) {
                        const otherWallIds = new Set<string>();
                        for (const ep of endpoints) {
                            if (ep.wallId === pp.idA || ep.wallId === pp.idB) continue;
                            if (_selfClusterWallIds.has(ep.wallId)) continue;
                            otherWallIds.add(ep.wallId);
                        }
                        if (otherWallIds.size <= 1) perpShellL = true;
                    }
                    if ((wellSeparated && hasTAttacher) || perpShellL) {
                        // ADR-0299 §RECOVERY-MUST-REFUSE clause 4 — this recovery PROCEEDS
                        // (removing it would visibly reopen every persisted drifted corner),
                        // but its output is DEGRADED, not authored data, and the log must say
                        // so. The previous success-toned message ("recovered … so the corner
                        // closes") is exactly the ADR-0299 failure mode: the bisector miter
                        // makes a corner whose endpoints do NOT meet look closed, so every
                        // later wall builds on geometry that reads as sound. On a GENERATED /
                        // welded shell the gap is by-design drift; on a USER-drawn corner it
                        // is evidence of an upstream commit defect (e.g. the founder's 115 mm
                        // gap — see §FIX-WALL-PREVIEW-COMMIT-LENGTH-LOCK, where the plan
                        // tool's click path committed a different point than the preview
                        // solved). Keep this WARN loud so the gap stays investigable.
                        console.warn(
                            `[WallJoinResolver] §NEAR-CORNER-L DEGRADED recovery (ADR-0299): un-pinned L-corner in cluster ` +
                            `@(${consensusPoint.x.toFixed(3)},${consensusPoint.z.toFixed(3)}): ` +
                            `${pp.idA}(${pp.sideA}) ↔ ${pp.idB}(${pp.sideB}) ` +
                            `gap=${(bestDist * 1000).toFixed(0)}mm |dot|=${bestDot.toFixed(3)} ` +
                            `via=${hasTAttacher ? 'T-attacher' : 'perp-pair'} — ` +
                            `deferred to pair-wise bisector miter (NOT square-capped) so the corner closes VISUALLY. ` +
                            `The endpoints do NOT actually meet: on a user-drawn corner this gap is evidence of an ` +
                            `upstream commit defect, not a corner to be trusted.`,
                        );
                    } else {
                        // Neither a mid-span T-attacher NOR an unambiguous perpendicular shell-L
                        // pair (pure Y/star, or a '+'/multi-arm junction) → discard the recovered
                        // pair so the consensus-trim path runs unchanged (no §CONSENSUS regression).
                        primaryPair = null;
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
            // §MULTI-CLUSTER-PARTITION-TRIM (2026-06-18) — remember the collinear
            // through-line direction so an ANGLED partition arm in this cluster (not
            // collinear with it) can be square-capped to the junction consensus rather
            // than deferred to a nearby shell face (the over-run bug).
            let passThroughDir: THREE.Vector3 | null = null;
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
                    // §FIX-NEWWALL-LCORNER-SKEW (L-63 Part-1 / L-74 / L-76, founder 2026-07-03) —
                    // a genuine pass-through pair is two segments of ONE straight wall: collinear
                    // in DIRECTION *and* on the SAME LINE. The old test checked direction only, so
                    // a NEW wall drawn PERPENDICULAR to one L-arm (hence PARALLEL to the other arm)
                    // was mis-classified as a pass-through with that arm even though their
                    // centrelines are hundreds of mm apart — the whole cluster then went through
                    // §PASS-THROUGH-FLUSH, square-capping the new wall to the corner consensus →
                    // the founder's skewed/tapered baseline (preview ≠ result, L-76) + a self-
                    // intersecting negative-area (bow-tie) footprint at the junction (L-74). Require
                    // the two candidate walls to be LATERALLY COINCIDENT too: the perpendicular
                    // offset between their junction endpoints (≈ the offset between their parallel
                    // centrelines) must be within a half-thickness band. A true collinear pass-
                    // through (incl. the resi §_repro_passthrough) has offset ≈ 0 → unchanged; the
                    // 0.313 m-offset parallel new wall is now correctly NOT a pass-through, so it
                    // routes to the T-into-corner path and butts the arm's body cleanly. Gated ON.
                    const passThroughCoincidenceGate =
                        (globalThis as any).window?.__pryzmPassThroughCoincidentGate === false;
                    let laterallyCoincident = true;
                    if (!passThroughCoincidenceGate) {
                        const iPos = epI.side === 'start' ? iS : iE;
                        const jPos = epJ.side === 'start' ? jS : jE;
                        const delta = new THREE.Vector3().subVectors(jPos, iPos);
                        const along = delta.dot(dirI);
                        const perpOffset = new THREE.Vector3().copy(delta).addScaledVector(dirI, -along).length();
                        const coincidentTol = Math.max(0.05, Math.max(wI.thickness, wJ.thickness) * 0.5);
                        laterallyCoincident = perpOffset <= coincidentTol;
                    }
                    // §FIX-EXISTING-CORNER-IMMUTABLE (L-122, founder 2026-07-04) — an EXISTING
                    // mitred L-corner (its two arms A,B are the committed `primaryPair`) must stay
                    // BYTE-IDENTICAL when a NEW wall joins; only the newcomer adapts (ADR-0055
                    // baseline immutability). THE founder defect: two exterior walls meet in a
                    // clean L; a NEW interior wall (a DIFFERENT systemTypeId, thinner) comes
                    // STRAIGHT DOWN — i.e. COLLINEAR with one arm B — to join at the corner. The
                    // pass-through detection then paired the committed arm B with the newcomer C
                    // (collinear + coincident) → the WHOLE cluster went through §PASS-THROUGH-FLUSH,
                    // so arm A tees onto the B+C "through-line" and BOTH A and B LOSE their corner
                    // mitre (eMN/sMN → null; V2 moves A's outer corner) — the corner notch/gap the
                    // founder reports. But B is a frozen L-arm, not half of a straight through-wall:
                    // a genuine pass-through pair is two segments of ONE run — EITHER both are
                    // committed-corner arms (the collinear resi §_repro_passthrough through-pair,
                    // both in primaryWallIds → allowed), OR NEITHER is (two newcomers forming a run
                    // → allowed). A MIX — exactly one candidate is a committed primary-corner arm —
                    // is a new wall abutting an existing corner, NOT a pass-through: reject it so the
                    // committed L (A,B) is left untouched and the newcomer C falls to the T-into-
                    // corner / flush-butt path (L-94), seating cleanly onto the frozen corner. The
                    // partition's own body-T onto an arm (offset, non-collinear) is unaffected (it
                    // never reached the COLLINEAR_DOT test). Gated default-ON.
                    //
                    // DISAMBIGUATION (crucial — must NOT regress §PASS-THROUGH-FLUSH): a genuine
                    // through-wall is ONE wall (its two collinear segments share a systemTypeId; the
                    // §cornerFlush `collinear-pass-through + perpendicular-stem` T-junction, and the
                    // resi §_repro_passthrough through-pair, are SAME-type). The founder's L-122 case
                    // is TWO DISTINCT walls of DIFFERENT type — an exterior L-arm and a new interior
                    // wall — that merely happen to be collinear. So reject the pass-through ONLY when
                    // (i) exactly ONE candidate is a committed primary-corner arm (a frozen existing
                    // L) AND (ii) the two candidates are DIFFERENT systemTypeId (a distinct newcomer,
                    // not a straight continuation). Same-type collinear runs (through-walls) are
                    // byte-unchanged; a same-type newcomer still passes through. The founder's note
                    // "different type must not change the rule" is honoured — a different type is
                    // exactly what marks the newcomer as a distinct wall that adapts, never an excuse
                    // to distort the frozen exterior L.
                    // §WALL-JOIN-INTENT (L-251) — ASK THE GESTURE, NOT THE GEOMETRY.
                    //
                    // The type test below (L-122) is a PROXY, and the comment above admits its
                    // hole: "a same-type newcomer still passes through." The founder draws every
                    // wall with the DEFAULT type, so the proxy never fires for him and
                    // §PASS-THROUGH-FLUSH square-caps his committed corner — deleting the miter
                    // normals of a mitre he had already drawn (L-251: `707107,707107` → `null`).
                    //
                    // The information needed to disambiguate is NOT IN THE GEOMETRY. A mitred
                    // corner plus a butting newcomer, and a through-wall plus a stem, are the
                    // SAME topology — identical shape, order and types. They differ only in what
                    // the author MEANT, and the authoring tool is the only thing that knows.
                    //
                    // So: if this endpoint was SNAPPED ONTO AN EXISTING JUNCTION, the author is
                    // butting a newcomer onto something already committed — never continuing a
                    // run. Freeze the corner; the newcomer adapts (ADR-0055 baseline immutability).
                    // If the intent says `through`, or is absent (legacy walls, generated walls,
                    // every pre-existing test), behaviour is EXACTLY as before — the type proxy
                    // still applies, so nothing regresses and genuine T-junctions still square-cap.
                    const _wallType = (w: WallData): string | undefined => (w as unknown as { systemTypeId?: string }).systemTypeId;
                    const _buttsHere = (w: WallData, side: 'start' | 'end'): boolean =>
                        (w as unknown as { joinIntent?: { start?: string; end?: string } })
                            .joinIntent?.[side] === 'butt';

                    const iIsCommitted = primaryWallIds.has(epI.wallId);
                    const jIsCommitted = primaryWallIds.has(epJ.wallId);
                    const exactlyOneCommitted = iIsCommitted !== jIsCommitted;

                    // The NON-committed candidate is the newcomer. Did the author snap its
                    // endpoint onto the committed corner? Then it butts — it is not a continuation.
                    const newcomerButtsOntoCorner =
                        exactlyOneCommitted &&
                        (iIsCommitted
                            ? _buttsHere(wJ, epJ.side as 'start' | 'end')
                            : _buttsHere(wI, epI.side as 'start' | 'end'));

                    // §FIX-WALL-LCORNER-COLLINEAR-STEP (founder 2026-08-06) — the GEOMETRIC
                    // discriminator the L-122 type-proxy / L-251 intent-proxy above both miss.
                    //
                    // THE founder defect (his screenshot, and the residual L-251 explicitly
                    // records as unclosed): two THICK walls meet in a committed mitred L; a THIN
                    // wall — DEFAULT type, no `joinIntent` (the generated / legacy / plain-drawn
                    // case) — arrives COLLINEAR with one arm and terminates at the corner. Both
                    // existing proxies read "same type, no intent" → `freezeExistingCorner` stays
                    // false → the pass-through predicate fires → §PASS-THROUGH-FLUSH square-caps
                    // the WHOLE cluster to the consensus and the committed L's miter normals are
                    // DELETED (measured: the 2-wall L's ±(0.707,−0.707) become null on all three
                    // walls the moment the thin wall lands). On the legacy render path (LAYERED
                    // walls and opening-bearing walls → `buildMiterPrism`) that is the founder's
                    // open corner + overlapping outlines.
                    //
                    // The discriminator IS in the geometry, and it is the same invariant the V2
                    // fix uses: a genuine pass-through is two segments of ONE straight run, and
                    // one run has ONE THICKNESS. §FIX-NEWWALL-LCORNER-SKEW already tightened this
                    // predicate with lateral coincidence ("on the same line"); thickness equality
                    // is the remaining half of "segments of the same wall". A collinear, laterally
                    // coincident candidate of a DIFFERENT thickness paired with a COMMITTED corner
                    // arm is a distinct newcomer butting the corner — never a continuation of it.
                    //
                    // Conservative by construction: it is an additional OR-term gated behind the
                    // pre-existing `exactlyOneCommitted` test, so it can only ever fire where a
                    // committed primary L-corner pair is being dissolved by a newcomer. Genuine
                    // same-thickness through-runs (the resi §_repro_passthrough pair, the
                    // §cornerFlush collinear-pass-through + stem) have zero thickness delta → the
                    // term is inert → byte-unchanged. Detection frame only — it changes which
                    // branch the cluster takes, never a baseline.
                    const _thicknessStep =
                        Math.abs((wI.thickness ?? 0) - (wJ.thickness ?? 0)) > 1e-4;

                    const freezeExistingCorner =
                        (globalThis as any).window?.__pryzmExistingCornerImmutable !== false &&
                        exactlyOneCommitted &&
                        (_wallType(wI) !== _wallType(wJ) || newcomerButtsOntoCorner ||
                         ((globalThis as { __pryzmWallLCornerCollinearStep?: boolean })
                              .__pryzmWallLCornerCollinearStep !== false && _thicknessStep));
                    if (Math.abs(dirI.dot(dirJ)) >= COLLINEAR_DOT && laterallyCoincident && !freezeExistingCorner) {
                        clusterHasPassThrough = true;
                        passThroughDir = dirI.clone();
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
            // different walls in this cluster are within COINCIDENT_M (1 mm), so no
            // pinned pair → no primary corner → no T-into → every member falls to
            // the consensus trim. When one of those members was actually welded
            // ONTO a SHELL (perimeter) wall's BODY — and the shell wall's own
            // endpoints are far away (not cluster members) — the resolver has no
            // idea the endpoint is perimeter-anchored, so the consensus trim pulls
            // it OFF the shell toward the interior partition-only centroid → the
            // room stops sealing. This block surfaces, per cluster + per endpoint,
            // exactly WHY the cluster is unpinned and which endpoints sit on a
            // non-cluster wall body (a shell T-anchor the trim would break).
            // Endpoints in THIS cluster, by key, for "is the body-host a cluster member?" test.
            // NB: `_clusterWallIds` + `_bodyAnchorOf` are LOAD-BEARING — the §SHELL-ANCHOR-
            // PRESERVE branch below (~L1207) calls `_bodyAnchorOf(ep)` to decide whether to
            // defer an endpoint to the pair-wise T-join. They MUST stay outside the diag gate.
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
                    // §PERF-WALL-MOVE-INCREMENTAL-REBUILD (L-234) — EXACT allocation-free
                    // reject (see `_segAabbDistSq`). Pruned hosts are exactly the hosts the
                    // `perp > bestPerp` test below would have skipped; the chosen host and
                    // the tie-breaking are byte-identical. This loop is O(walls) per cluster
                    // endpoint and was the single biggest cost in a wall-move resolve.
                    if (_segAabbDistSq(pos, hs, he) > bestPerp * bestPerp) continue;
                    const c = this._closestOnSegment(pos, hs, he);
                    const perp = pos.distanceTo(c);
                    if (perp > bestPerp) continue;
                    // Must be on the BODY, not at one of the host's endpoints (≥0.05 m in).
                    if (c.distanceTo(hs) < 0.05 || c.distanceTo(he) < 0.05) continue;
                    bestPerp = perp; bestHost = w.id;
                }
                return bestHost ? { hostId: bestHost, perp: bestPerp } : null;
            };
            // §MULTI-CLUSTER-WHY-FLOOD-GATE (2026-06-30) — this diagnostic used to be
            // hard `|| true` ("always on, founder asked"). On a 5-storey resi building it
            // printed HUNDREDS of 3-4-line blocks per generation/open, and the per-endpoint
            // `_bodyAnchorOf` re-scan + multi-line string concat ran on the main thread even
            // though nothing consumes the output in prod. Gate the entire diagnostic block
            // (the second `_bodyAnchorOf` sweep + string interpolation + log) behind
            // `wallJoinDiagOn()` (default OFF in prod; `globalThis.__pryzmWallJoinDiag = true`
            // restores it). The load-bearing §SHELL-ANCHOR-PRESERVE call above is untouched.
            // Mirrors every other gated resolver diagnostic here. §LOAD-FLOOD-GATE / ADR-060.
            if (wallJoinDiagOn()) {
                const _hasPinned   = pinnedKeys.size > 0;
                const _hasPrimary  = !!primaryPair;
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

                // ── §MULTI-CLUSTER-PARTITION-TRIM (2026-06-18) ──────────────────────
                // In a PASS-THROUGH cluster, an ANGLED partition arm whose off-end
                // happens to lie near a perimeter (shell) wall body is caught by
                // §SHELL-ANCHOR-PRESERVE below and deferred to the pair-wise T-join,
                // which trims it onto the SHELL FACE — 145–431 mm OFF the junction
                // consensus → the partition OVER-RUNS past the corner and the room loop
                // fails to close (§DIAG-ROOM-LOOP BREAK … EXCEEDS hostSnap). The collinear
                // through-pair already defines the junction line, so a real angled T/X
                // arm MUST trim to consensus, not to a nearby shell face. Intercept it
                // here (BEFORE the shell-anchor deferral) and square-cap to consensus —
                // the same write as §PASS-THROUGH-FLUSH. Excluded: the through-pair / any
                // continuing collinear wall (angle test — keeps genuine pass-through and
                // collinear shell walls on their line), endpoints already on consensus
                // (>1mm no-op → clean clusters byte-identical), and arms beyond a junction
                // snap tol. Gated default-ON. Pure read of the working baselines.
                if (
                    clusterHasPassThrough && passThroughDir &&
                    (globalThis as any).window?.__pryzmMultiClusterPartitionTrim !== false
                ) {
                    const wArm = _byId.get(ep.wallId);
                    if (wArm) {
                        const armDir = this._wallDirAtJoin(wArm, ep.side, ws, we, consensusPoint);
                        const armPos = this._getEpPos(ep, bl);
                        const dConsArm = Math.hypot(armPos.x - consensusPoint.x, armPos.z - consensusPoint.z);
                        const isCollinearArm = Math.abs(armDir.dot(passThroughDir)) >= COLLINEAR_DOT;
                        const snapTolArm = Math.min(thresholds.snapRadius, 0.5);
                        // §MC-PARTITION-TRIM-SHELL-YIELD (2026-06-30) — if this angled arm's
                        // endpoint ALSO lies on a NON-cluster (shell/perimeter) wall body, the
                        // interior partition-only `consensusPoint` is ~0.27–0.30 m OFF that
                        // shell face. Square-capping to consensus here pulls the arm OFF the
                        // shell and leaves a PERPENDICULAR gap the room detector can't bridge
                        // (the resi `unresolvedLoopBreaks=9` defect — the arm should butt onto
                        // the shell, not the interior centroid). Yield those endpoints to the
                        // §SHELL-ANCHOR-PRESERVE branch below → pair-wise T-join, which (with
                        // §T-JOIN-PERP-GATE) now CONNECTS the near-miss onto the shell face so
                        // the room loop closes. A pure interior Y/star arm has no shell body
                        // under its end → bodyHost null → behaviour unchanged.
                        const armBodyHost = _bodyAnchorOf(ep);
                        if (armBodyHost) {
                            // Fall through to §SHELL-ANCHOR-PRESERVE (it re-tests _bodyAnchorOf
                            // and defers to the T-join). Do NOT square-cap, do NOT mark handled.
                        } else if (!isCollinearArm && dConsArm > 1e-3 && dConsArm <= snapTolArm) {
                            const trimPtMC = consensusPoint.clone();
                            trimPtMC.y = ep.side === 'start' ? ws.y : we.y;   // preserve floor Y
                            const newBLMC: [THREE.Vector3, THREE.Vector3] =
                                ep.side === 'start' ? [trimPtMC, we.clone()] : [ws.clone(), trimPtMC];
                            if (newBLMC[0].distanceTo(newBLMC[1]) < thresholds.minWallLength) {
                                this._flagInvalidIfDegenerate(
                                    ep.wallId, bl, result, thresholds.minWallLength, 'partition-trim-collapse',
                                );
                                handledKeys.add(epKey);
                                continue;
                            }
                            bl.set(ep.wallId, newBLMC);
                            const adjMC: JoinData = result.get(ep.wallId) ?? {
                                baseLine: newBLMC, startMN: null, endMN: null,
                            };
                            adjMC.baseLine = newBLMC;
                            if (ep.side === 'start') adjMC.startMN = null;
                            else                     adjMC.endMN   = null;
                            result.set(ep.wallId, adjMC);
                            handledKeys.add(epKey);
                            _cntTrimmed++;
                            console.log(
                                `[WallJoinResolver] §MULTI-CLUSTER-PARTITION-TRIM wall=${ep.wallId}(${ep.side}) ` +
                                `angled arm ${dConsArm.toFixed(3)}m off junction → square-cap to consensus ` +
                                `(${trimPtMC.x.toFixed(3)},${trimPtMC.z.toFixed(3)})`
                            );
                            continue;
                        }
                    }
                }

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
                    // §LOAD-FLOOD-GATE — gated (default OFF). The preserve count is
                    // still rolled into the per-cluster summary line; this per-endpoint
                    // line is diagnostic only and floods a heavy load.
                    if (wallJoinDiagOn()) {
                        console.log(
                            `[WallJoinResolver] §SHELL-ANCHOR-PRESERVE  wall=${ep.wallId}(${ep.side}) ` +
                            `on non-cluster (perimeter) body of ${_bodyHost.hostId} ` +
                            `(perp=${_bodyHost.perp.toFixed(3)}m) — NOT cluster-trimmed; deferred to ` +
                            `pair-wise T-join so it stays on the perimeter and the room seals`
                        );
                    }
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

                        // §FIX-NEWWALL-LCORNER-FLUSH (L-94, founder 2026-07-04) — seat a NEW wall
                        // that meets an existing mitred L-corner (its endpoint snapped to the
                        // corner NODE, or to the two-wall intersection MIDPOINT) FLUSH against the
                        // two arms. THE founder defect (after L-91 fixed the baseline TILT): a
                        // DIAGONAL 3rd wall (≈45° to BOTH arms, |dot|≈0.71) missed the old
                        // perpendicularity gate (0.5), so it fell to the on-axis SQUARE cap — which
                        // pokes past the corner and reads as a broken/spiky joint on the legacy
                        // miter-prism render path (the V2 preview mitres the near cap INTO the
                        // corner, so preview ≠ executed). Relax the T-into-corner gate to ≈cos 20°
                        // so such a diagonal partition T-butts onto the more-perpendicular arm:
                        // `_applyT` ray-casts along the wall's OWN axis onto that arm's lateral
                        // face (ZERO rotation — L-91's no-tilt guarantee holds; the endpoint is
                        // trimmed ALONG its axis to land on the corner's inner/outer vertex, flush
                        // against BOTH arms), matching the V2 preview's flush seat. A near-collinear
                        // attacher (|dot|→1) is excluded — it was already handled by
                        // §PASS-THROUGH-FLUSH — and if `_applyT` bails (short-wall safety / parallel
                        // face) we fall through to the pinned / on-axis cap (L-91), so nothing
                        // regresses. §MITER-SEGMENT-CLAMP (L-93) keeps the butted sliver spike-free.
                        const T_INTO_CORNER_MAX_DOT = 0.94;      // ≈ >20° from the host arm
                        if (hostBest < T_INTO_CORNER_MAX_DOT) {
                            // Construct a synthetic T-join and let _applyT do the
                            // face projection + miter-normal write.
                            // §SECONDARY-PINNED-FIX: _applyT reads bl[secondary] to
                            // find the joining endpoint and projects from there.
                            // We no longer pre-move bl to consensus before calling it
                            // (the premature move left the wall at consensus if
                            // _applyT bailed, causing incorrect geometry).
                            // _applyT uses currentContact (re-projected endpoint) so
                            // the slight positional difference (pinned pt vs consensus)
                            // is at most COINCIDENT_M (1 mm) — negligible in practice.
                            //
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
                                // §FIX-WALL-TYPECHANGE-MITRE — use the SAME thickness-aware
                                // mitre plane as `_applyCorner` (this block advertises itself
                                // as "same logic as _applyCorner", so it must stay in step).
                                const bisectorSum = new THREE.Vector3().addVectors(dirC, dirD);
                                const asymCD = WallJoinResolver._miterPlaneBase(
                                    dirC, ep.side, wallC.thickness / 2,
                                    dirD, partnerEp.side, wallD.thickness / 2,
                                );
                                const base = asymCD ?? (bisectorSum.length() > 1e-6
                                    ? bisectorSum.normalize()
                                    : new THREE.Vector3(-dirC.z, 0, dirC.x).normalize());
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

                    // §FIX-NEWWALL-LCORNER-BIAS (L-91, founder 2026-07-04) — a pinned wall that
                    // is NOT part of the primary corner pair is a 3rd+ wall meeting AT an existing
                    // L-corner (its endpoint snapped onto the corner node). Deferring it to the
                    // pair-wise loop makes `_applyCorner` bisector-miter it against a neighbour,
                    // which ROTATES its baseline OFF its authored axis (the founder's "preview shows
                    // a clean perpendicular/snapped wall but the EXECUTED wall is biased/skewed":
                    // the V2 preview keeps the baseline immutable and computes footprint corners,
                    // but the legacy pair-wise miter tilts the stored baseline — e.g. a diagonal 3rd
                    // wall's join end drifts (5.000,0)→(5.099,0) with a ~2° tilt). Route it to the
                    // on-axis §CONSENSUS-ON-CENTRELINE trim below instead: the endpoint is projected
                    // onto the wall's OWN centreline (zero rotation — the wall stays EXACTLY on its
                    // authored axis and length), so the executed baseline matches the previewed one.
                    // A GENUINE 2-wall L corner (both walls IN the primary pair) still defers, so the
                    // pair-wise bisector miter that correctly closes an L is byte-unchanged; and when
                    // there is no primary pair at all the old defer is kept (no behaviour change).
                    // Gated default-ON. Detection frame — the baseline is only trimmed ALONG its own
                    // axis, never rotated. Fixes the residual bias L-63/L-74/L-76 did not cover.
                    const routeThirdWallOnAxis =
                        (globalThis as any).window?.__pryzmNewWallLCornerBiasFix !== false
                        && !!primaryPair && !isInPrimaryPair;
                    if (!routeThirdWallOnAxis) {
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
                    if (_verboseClusterLogs) {
                        console.log(
                            `[WallJoinResolver] §FIX-NEWWALL-LCORNER-BIAS wall=${ep.wallId}(${ep.side}) ` +
                            `3rd wall at existing corner → on-axis trim (no pair-wise tilt)`
                        );
                    }
                    // fall through to the on-axis §CONSENSUS-ON-CENTRELINE trim.
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
                    // _t is the axis parameter: _t=0 is the free end, _t=1 is the CURRENT
                    // join endpoint. _t<1 ⇒ the foot lies BEHIND the join end (a RETREAT
                    // toward the free end); _t>1 ⇒ the foot lies AHEAD (a forward EXTENSION).
                    let _t =
                        ((consensusPoint.x - _free.x) * _axisX +
                         (consensusPoint.z - _free.z) * _axisZ) / _axLen2;

                    // §CONSENSUS-OVERTRIM-GUARD (2026-06-29) — cap the BACKWARD retreat.
                    //
                    // THE residual over-trim (ADR-0072/ADR-0073 "interior partition ends land
                    // ~0.3–1.0 m short of / outside their host"; founder "some walls start but
                    // don't go until the perimeter wall"): when this wall's join end already
                    // reaches (or OVERSHOOTS) the junction — i.e. it should terminate ON a
                    // SHELL host (or a neighbour) at/just past the cluster — but the averaged
                    // cluster consensus happens to sit BEHIND that end along the wall's own
                    // axis, the on-centreline foot RETREATS the endpoint up to ~0.45 m back
                    // toward the free end (the §CONSENSUS-PROXIMITY-GUARD band). That retreat
                    // pulls the wall off its host, leaving the ~285 mm physical gap that breaks
                    // the closed wall LOOP RoomDetectionEngine needs → unclassified room →
                    // §FURNISH-EMPTY. The §SHELL-ANCHOR-PRESERVE / proximity guards catch the
                    // gross cases; this is the residual that slips through inside their bands.
                    //
                    // The forward (extension, _t≥1) direction is the LEGITIMATE gap-closing
                    // trim (a member drawn SHORT of the junction reaching forward to it — the
                    // genuine-star / near-collinear-Y / shallow-Y cases). It is left untouched,
                    // so those paths stay BYTE-IDENTICAL. Only an over-long BACKWARD retreat is
                    // capped: the endpoint may retreat at most OVERTRIM_BACK_ALLOWANCE_M (a tiny align-
                    // to-neighbour trim); beyond that it is pinned at its original on-axis
                    // position. The endpoint stays EXACTLY on its own centreline (zero lateral
                    // drift) and is never pushed forward beyond the foot (no over-extend spike),
                    // mirroring decidePreservedBaseline's tolerances. A pinned overshoot end
                    // still seals the junction: it sits ≤ snapRadius from consensus (proximity
                    // guard) and within RoomDetectionEngine._snapNearbyCorners(0.30) of the
                    // other cluster members.
                    const _tJoin = 1;                       // axis param of the current join end
                    const _axisLen = Math.sqrt(_axLen2);
                    const OVERTRIM_BACK_ALLOWANCE_M = 0.05; // §C73 §2.3 — an ALLOWANCE, not a coincidence tolerance: the furthest an endpoint may legitimately retreat (50 mm) before the retreat is treated as over-trim. Metres.
                    const _minT = _tJoin - OVERTRIM_BACK_ALLOWANCE_M / _axisLen;
                    if (_t < _minT) {
                        if ((globalThis as any).window?.__pryzmDebugWalls) {
                            const _retreat = (_tJoin - _t) * _axisLen;
                            console.log(
                                `[WallJoinResolver] §CONSENSUS-OVERTRIM-GUARD wall=${ep.wallId}(${ep.side}) ` +
                                `consensus would RETREAT join end ${(_retreat * 1000).toFixed(0)}mm back along axis ` +
                                `(> ${(OVERTRIM_BACK_ALLOWANCE_M * 1000).toFixed(0)}mm) — pinned at original end so it keeps ` +
                                `reaching its host (no ~285mm short-fall; loop seals via snap tol)`,
                            );
                        }
                        _t = _minT;
                    }

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

            // §LOAD-FLOOD-GATE — per-cluster summary, gated (default OFF). One line
            // per junction cluster; a dense residential plate has hundreds of clusters
            // × N floors, so this floods a heavy load. Opt-in for debugging.
            if (wallJoinDiagOn()) {
                console.log(
                    `[WallJoinResolver] §MULTI-CLUSTER cluster: ${endpoints.length} endpoints @ ` +
                    `(${consensusPoint.x.toFixed(3)}, ${consensusPoint.z.toFixed(3)}) ` +
                    `[primary=${_cntPrimary} t-into=${_cntTInto} pinned=${_cntPinned}` +
                    (_cntSecPinned ? ` sec-pinned=${_cntSecPinned}` : '') +
                    ` trimmed=${_cntTrimmed}` +
                    (_cntShellAnchorPreserved ? ` shellAnchor=${_cntShellAnchorPreserved}` : '') +
                    (_cntSkippedSelfCluster ? ` selfCluster=${_cntSkippedSelfCluster}` : '') + `]`
                );
            }
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
        // §FIX-WALL-TYPECHANGE-MITRE (founder 2026-08-06) — the option-B butt below is now
        // OPT-IN ONLY (`__pryzmWallDiffThicknessButt = true`). By default a 2-wall L corner
        // ALWAYS mitres, whatever the two thicknesses are, via the asymmetric mitre plane
        // computed further down (`_miterPlaneBase`). See the block comment on that method for
        // the measured defect, the maths, and why this is not the pre-Apr-2026 wrap-around.
        if (Math.abs(tA - tB) > 0.001 && this._diffThicknessButtEnabled()) {
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

            // §LOAD-FLOOD-GATE — gated (default OFF). Fires once per diff-thickness
            // corner inside resolveLevel → floods a heavy load.
            if (wallJoinDiagOn()) {
                console.log(`[WJR-DIFF-THICKNESS] (option-B butt) dominant=${dominantEp.wallId}(${dominantEp.side}) tDom=${dominantT} sub=${subordinateEp.wallId}(${subordinateEp.side}) tSub=${subordinateT}`);
            }

            // §DIAG-WALL-JOIN — diff-thickness L: the subordinate butts the dominant's
            // NEAR lateral face and the dominant is EXTENDED by subordinateT/2 to back the
            // outer overhang (§PERIMETER-CORNER-FILL), so the outer corner notch is filled
            // by construction. The clean-butt + NaN/length guards above prove the trim is
            // finite + non-collapsing; if they refused, this line is not reached (an early
            // return already logged the refusal). So reaching here ⇒ the L closed cleanly.
            // §WALL-JOIN-LOAD-SKIP (2026-06-24) — gate behind __PRYZM_WALL_JOIN_DEBUG
            // (default OFF); fires once per corner-join inside resolveLevel → floods on
            // large buildings.
            if (wallJoinDiagOn()) {
                const _angDegDT = (this._angleFromDirs(dirA, dirB) * 180) / Math.PI;
                const _clsDT = _angDegDT < 10 ? 'COLLINEAR' : _angDegDT >= 60 ? 'L' : 'SHALLOW-L';
                console.log(
                    `[WallJoinResolver] §DIAG-WALL-JOIN CORNER ${epA.wallId}(${epA.side}) ↔ ${epB.wallId}(${epB.side}) ` +
                    `class=${_clsDT} angle=${_angDegDT.toFixed(1)}° mitre=diffThk-butt+fill(tDom=${dominantT.toFixed(3)} tSub=${subordinateT.toFixed(3)}) ` +
                    `closed=${_clsDT !== 'COLLINEAR' ? '✓' : '⚠ NOT-CLEAN'}`,
                );
            }
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

        // §FIX-WALL-TYPECHANGE-MITRE — the general (thickness-aware) mitre plane. It is the
        // SAME plane the bisector gives when tA === tB, and the correct asymmetric plane when
        // they differ, so ONE branch now serves every 2-wall L. Only a degenerate /
        // near-parallel pair (null) falls through to the historical bisector fallback.
        const asymBase = this._miterPlaneBase(dirA, epA.side, tA / 2, dirB, epB.side, tB / 2);
        if (asymBase) {
            base = asymBase;
        } else if (bisectorSum.length() < 1e-6) {
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
        // §WALL-JOIN-LOAD-SKIP (2026-06-24) — this per-corner diagnostic block (compute
        // + log) fires once per corner-join inside resolveLevel. On a residential
        // building it emits thousands of console writes and (per the PERF-FIX note below)
        // cost ~50–150 ms per load. Gate the whole block behind __PRYZM_WALL_JOIN_DEBUG
        // (default OFF) — opt-in for debugging, silent in production / on load.
        if (wallJoinDiagOn()) {
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
            `class=${_cls} angle=${_angDeg.toFixed(1)}° turn=${_turn} ` +
            `mitre=${asymBase ? 'asym' : 'bisector'}(tA=${tA.toFixed(3)} tB=${tB.toFixed(3)}) ` +
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
        } // §WALL-JOIN-LOAD-SKIP — end __PRYZM_WALL_JOIN_DEBUG gate

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
    // ── §FIX-WALL-TYPECHANGE-MITRE (founder 2026-08-06) ──────────────────────────
    //
    // THE founder requirement, verbatim: "If I change one wall type, I would expect to STILL
    // have robust and correct wall joints — no matter which wall joins with what. ALWAYS
    // DEFAULT MITRE when only TWO walls join."
    //
    // THE defect (measured — see WallJoinResolver.typeChangeMitre.test.ts): changing ONE
    // wall's system type changes its `thickness` (resolveWallSystemType → SetWallSystemType
    // `w.thickness = type.totalThickness`). The moment the two arms of an L differ by >1 mm,
    // the §DIFF-THICKNESS-FIX "option-B butt" branch below REFUSED to mitre: it square-capped
    // both walls (startMN/endMN = null) and MOVED the thin wall's joining endpoint LATERALLY
    // onto the thick wall's near face by `dominantT/2 − 1 mm`. Probe, 300 mm ⟂ 100 mm L at the
    // origin: thick wall start extended to (−0.05, 0), thin wall start displaced to (0, 0.149),
    // both MN null. The identical corner through the V2 pipeline mitres correctly, with
    // INDEPENDENT half-thicknesses (JunctionResolverV2 ~:1060-1088 — probe corners
    // (0.05, 0.15) / (−0.05, −0.15)). So the SAME corner rendered two different ways purely by
    // which pipeline each wall took — and a type change is exactly what flips a wall from the
    // V2 footprint path to the legacy path (a layered type, or any wall carrying an opening).
    //
    // That lateral displacement is ALSO the root of the founder's console
    // `[RoomDetectionEngine] §DIAG-ROOM-LOOP BREAK … endpoint NNNmm from centreline EXCEEDS
    // hostSnap 200mm`: a 430 mm layered shell displaces its partner's endpoint by
    // 430/2 − 1 = 214 mm, just over the 200 mm floor — the reported 217 mm. The room loop then
    // cannot close. Trimming both arms to `sharedPt` (as the equal-thickness path already
    // does) removes the displacement at source.
    //
    // THE MATHS. A mitre across a thickness step IS a single plane — the earlier rationale
    // ("geometrically wrong across a thickness step") is only true of the SYMMETRIC bisector.
    // Offset the two walls' edge lines by their OWN half-thicknesses and intersect them: the
    // two corner points are `sharedPt ± u`, because the intersection is a linear function of
    // the offsets and negating both offsets negates the solution. So the corner line always
    // passes through the centreline crossing, and the plane normal is simply `perp(u)`. When
    // the thicknesses are equal this reduces EXACTLY to the away-direction bisector — the
    // formula is a strict generalisation, not a replacement.
    //
    /**
     * §FIX-WALL-TYPECHANGE-MITRE — the shared mitre-plane normal for a 2-wall L corner,
     * valid for EQUAL and UNEQUAL thickness alike.
     *
     * Intersects wall A's LEFT offset edge line with wall B's RIGHT offset edge line, each
     * offset by its OWN half-thickness about `sharedPt`; the plane through that corner and
     * `sharedPt` is the mitre. Returns `null` for a degenerate / near-parallel pair, where
     * the caller keeps the existing bisector (or square-cap) fallback.
     *
     * @param dirA/dirB  Wall AXIS directions (start→end), as `_wallDirAtJoin` returns them —
     *                   arc TANGENT for a curved wall, chord for a straight one.
     * @param sideA/sideB Which endpoint of each wall is at this corner.
     * @param halfTA/halfTB Each wall's OWN half-thickness. Never averaged.
     */
    private static _miterPlaneBase(
        dirA: THREE.Vector3, sideA: Side, halfTA: number,
        dirB: THREE.Vector3, sideB: Side, halfTB: number,
    ): THREE.Vector3 | null {
        // Direction AWAY from the junction along each wall body.
        const awayA = sideA === 'end' ? dirA.clone().negate() : dirA.clone();
        const awayB = sideB === 'end' ? dirB.clone().negate() : dirB.clone();
        const nA = new THREE.Vector3(-awayA.z, 0, awayA.x);   // left perpendicular
        const nB = new THREE.Vector3(-awayB.z, 0, awayB.x);
        const det = awayA.x * awayB.z - awayA.z * awayB.x;
        if (!Number.isFinite(det) || Math.abs(det) < 1e-9) return null;   // parallel — no corner
        // Solve (halfTA*nA) + t*awayA = (−halfTB*nB) + s*awayB, relative to sharedPt.
        const p1x = halfTA * nA.x, p1z = halfTA * nA.z;
        const p2x = -halfTB * nB.x, p2z = -halfTB * nB.z;
        const wx = p2x - p1x, wz = p2z - p1z;
        const t = (wx * awayB.z - wz * awayB.x) / det;
        const ux = p1x + t * awayA.x;
        const uz = p1z + t * awayA.z;
        if (!Number.isFinite(ux) || !Number.isFinite(uz)) return null;
        const uLen = Math.hypot(ux, uz);
        // Degenerate (zero-thickness input) or a near-parallel blow-up that would throw the
        // corner metres down the wall — both fall back to the caller's bisector.
        if (!(uLen > 1e-9) || uLen > 20 * (halfTA + halfTB + 1e-6)) return null;
        return new THREE.Vector3(-uz, 0, ux).normalize();
    }

    /** Escape hatch: set `__pryzmWallDiffThicknessButt = true` to restore the pre-2026-08-06
     *  §DIFF-THICKNESS-FIX option-B butt (square caps + lateral endpoint displacement) instead
     *  of the §FIX-WALL-TYPECHANGE-MITRE asymmetric mitre. Diagnostics only. Default OFF. */
    private static _diffThicknessButtEnabled(): boolean {
        return (globalThis as { __pryzmWallDiffThicknessButt?: boolean }).__pryzmWallDiffThicknessButt === true;
    }

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
        //
        // §T-JOIN-PERP-GATE (2026-06-30) — the original guard measured the
        //   ALONG-AXIS trim length `trimPt.distanceTo(secJoinEp)`. At a SHALLOW
        //   approach angle that length blows up far past MAX_CORNER_OFFSET even
        //   when the endpoint is only a SMALL PERPENDICULAR gap from the host face
        //   — exactly the resi-partition near-miss the prompt describes (arm 0.27–
        //   0.30 m off the cluster junction, square-capped into a gap the room
        //   detector can't bridge → "T-JOIN: trim distance exceeds safety bound,
        //   skipping" ×28 + unresolvedLoopBreaks=9). _detect already proved the
        //   endpoint is within SNAP_RADIUS of the host BODY (perpendicular), so a
        //   shallow-angle along-axis overshoot is NOT evidence of a stray wall.
        //   Gate on the TRUE perpendicular gap of the endpoint from the host face
        //   instead: if the endpoint sits within MAX_CORNER_OFFSET of the face
        //   (the sane snap the prompt asks for), CONNECT it by extending to the
        //   host face so the room loop closes — never reject a genuine near-miss.
        //   A generous along-axis runaway cap (3× MAX_CORNER_OFFSET) still rejects
        //   pathological grazing trims that would stretch a small wall across a room.
        // §FIX-T-JOIN-PENETRATION-IS-NOT-A-REACH (L-919, founder — reported REPEATEDLY)
        //   — the first implementation of C83 §10 (§JOINT-AUTHORITY-IS-THE-INCUMBENT).
        //   Specifically C83 §10.2.3: a snap onto a wall's body may NOT be interpreted as
        //   "start my centreline here"; it means "join here", and the newcomer terminates at
        //   the incumbent's FACE. C83 §10.3 (refusal) is the `return` arms below — a newcomer
        //   that cannot be resolved against the host face is left un-trimmed and reported with
        //   both numbers, never resolved by moving the incumbent. C83 §10.4 (mandatory
        //   incumbent-unchanged assertion) is discharged in
        //   `WallCreateOnHostBody.measure.test.ts` §JOINT-AUTHORITY-IS-THE-INCUMBENT.
        //
        //   the gate above was written with `Math.abs`, and THAT is the founder's defect:
        //
        //     "even if the insertion point is mid a wall it should ALWAYS connect with the face
        //      of the wall — never create a clash — never should the created wall go THROUGH
        //      the other wall."
        //
        //   `MAX_CORNER_OFFSET` is `snapRadius`, and in the app that is CAMERA-DERIVED —
        //   `getWorldToleranceForActiveCamera(8 px, …)` clamped to [0.05, 1.0] m
        //   (WallRebuildCoordinator.ts ~:1570). Snapping to a wall's Midpoint — or to ANY point
        //   on its body — resolves to that wall's CENTRELINE, because that is what a wall
        //   feature IS geometrically. So the endpoint starts one host HALF-THICKNESS inside the
        //   host's solid, and the absolute gap it is measured by is EXACTLY `hostHalfT`, always.
        //   Zoomed in — which is when walls get drawn — the radius falls to its 0.05 m clamp and
        //   every host thicker than 100 mm exceeds the bound, so the trim was SKIPPED and the new
        //   wall kept its centreline endpoint: half the host's thickness occupied by the new
        //   wall's body at the moment of creation. Nothing downstream re-asks. That is why this
        //   reproduces for the founder and not in review, and why every previous fix measured
        //   green: every T-join test in this package calls `resolveLevel` with no options, at
        //   DEFAULT_SNAP_RADIUS = 0.5 m, where this gate never fires.
        //   `WallCreateOnHostBody.measure.test.ts` pins all of it.
        //
        //   THE DISTINCTION THE `Math.abs` DESTROYED. The two signs are different questions:
        //
        //     signedGap > 0 — the endpoint sits OUTSIDE the host's face, in OPEN SPACE. Closing
        //       that is a REACH, and how far we may reach is properly a question about how close
        //       the user aimed — so bounding it by the (zoom-dependent) snap radius is exactly
        //       right. This is what §T-JOIN-PERP-GATE was written for and it is UNCHANGED below.
        //
        //     signedGap < 0 — the endpoint is INSIDE the host's SOLID. That is not a reach, it is
        //       a CLASH, and it needs no snap radius to prove it is not a stray wall: its depth is
        //       bounded BY CONSTRUCTION by the host's own thickness. Two solids cannot share a
        //       volume at any zoom, so the camera must not get a vote. This branch is NEW.
        //
        //   NOT FIXED BY MOVING THE SNAP POINT, deliberately. Snapping to a Midpoint is correct
        //   and useful — the user is aiming at a real feature of the host, and the dimension
        //   readouts in the UI are driven by that snap. Offsetting the snap to a face would break
        //   both the user's intent and the numbers they are reading. The snap stays exactly where
        //   it lands; it is the CREATION that must interpret "on the body" as "join here" rather
        //   than "start my centreline here". So the endpoint is trimmed, never refused, and never
        //   displaced laterally off its own axis.
        //
        //   HOST-IMMUTABLE BY CONSTRUCTION. This is `_applyT`, which only ever moves the
        //   SECONDARY (the approaching newcomer) and never the host. That is precisely the
        //   PRIORITY rule §FIX-WALL-FACE-TRIM-NO-CLASH lacks and is default-OFF for (its
        //   symmetric retreat destroys committed mitres — see `_faceTrimNoClashEnabled`). Fixing
        //   the clash HERE therefore needs no second, parallel trimming routine and cannot
        //   re-open that cascade. The flag stays OFF and untouched.
        const signedGap   = new THREE.Vector3().subVectors(secJoinEp, faceO).dot(faceN);
        const reach       = Math.max(0,  signedGap);   // endpoint short of the face — open space
        const penetration = Math.max(0, -signedGap);   // endpoint inside the host solid — a clash
        const alongTrim   = trimPt.distanceTo(secJoinEp);
        const ALONG_RUNAWAY_CAP = MAX_CORNER_OFFSET * 3;

        if (penetration > 0) {
            // The endpoint is inside the host's band. `faceO` sits on the face the secondary
            // approaches from, so a penetration beyond the FULL host thickness means the wall has
            // emerged out the far side and terminates past it — a CROSSING, not a T-join, and not
            // something an axial trim to this face expresses. Left alone (declared, not silently
            // mis-handled).
            //
            // The along-axis retreat is not free to choose: clearing `penetration` costs
            // `penetration / sin(approach)` along the secondary's own axis. It is therefore
            // DETERMINED, and the only thing worth bounding is the approach angle — at a grazing
            // approach the retreat grows without limit, and a wall running nearly ALONG its host
            // is an authoring collision rather than a junction (the same case
            // §FIX-WALL-FACE-TRIM-NO-CLASH declares out of scope as "trimming would delete the
            // wall"). Capping the retreat at one host THICKNESS expresses exactly that: with a
            // penetration of at most `hostHalfT` it admits every approach down to 30° off the
            // host axis and refuses the grazing tail. Derived from the HOST, never from the
            // camera — so the same drawing resolves identically at every zoom.
            const PENETRATION_ALONG_CAP = hostWall.thickness;
            if (penetration > hostWall.thickness + this.CLASH_EPS_M || alongTrim > PENETRATION_ALONG_CAP) {
                console.warn(
                    `[WallJoinResolver] §FIX-T-JOIN-PENETRATION T-JOIN: ${secondary.wallId}(${secondary.side}) ` +
                    `penetrates host=${hostWallId} by ${(penetration * 1000).toFixed(1)} mm but the axial ` +
                    `retreat (${(alongTrim * 1000).toFixed(1)} mm) exceeds one host thickness — grazing or ` +
                    `through-crossing, not a T-join. Left un-trimmed.`,
                );
                return;
            }
        } else if (reach > MAX_CORNER_OFFSET || alongTrim > ALONG_RUNAWAY_CAP) {
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
