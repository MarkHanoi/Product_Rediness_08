// JunctionResolverV2 — Pascal-style per-wall miter trimming (ADR-0055 P1).
//
// PURE module (no THREE, no DOM). Resolves wall miters at L (2-wall), T (3-wall
// with one passthrough), Y (3-wall radial), and X (4-wall) junctions UNIFORMLY,
// in plan view (XZ). For every wall end that participates in a junction this
// module produces a `leftCorner` and `rightCorner` point. Adjacent walls SHARE
// their boundary corner by construction — no void to fill, no infill prism, no
// dark wedge.
//
// Algorithm (port of pascalorg/editor `packages/core/src/systems/wall/wall-mitering.ts`):
//   1. JUNCTION DETECTION — two passes:
//        (a) endpoint cluster: walls whose endpoints fall within `snapEpsilonM`.
//        (b) T-projection:   for each wall, project every OTHER wall's endpoint
//            onto its segment; if the projection lies strictly INTERIOR (not on
//            the wall's own endpoints) and within `snapEpsilonM` perpendicular,
//            attach that endpoint to the passthrough wall as a T-junction.
//   2. RING SWEEP — for each junction with ≥2 participating wall-ends:
//        - Build entries: one per wall-end (real). For passthrough walls in a
//          T-junction, push the passthrough wall TWICE — once with the body's
//          forward direction, once with the reversed direction. The ring then
//          looks like a 4-way cross from the sweep's perspective and the same
//          algorithm produces correct mitres for L / T / Y / X uniformly.
//        - Sort entries CCW by `atan2(dir.z, dir.x)` (direction = AWAY from the
//          junction along the wall body).
//        - For each adjacent pair (curr, next):
//             intersect curr.LEFT_edge_line ∩ next.RIGHT_edge_line.
//             that point becomes BOTH curr's `left` corner AND next's `right`.
//        - Parallel guard: |det| < 1e-9 → fall back to the perpendicular cap.
//
// Output: `WallMiter[]` index-aligned with the input walls. Each `WallMiter`
// carries (optionally) `startLeft / startRight / endLeft / endRight`, plus a
// pivot vertex (`startPivot / endPivot`) at the junction centre for the 5/6-vertex
// footprint that P2 will assemble in `WallFootprint2D`.
//
// Convention (plan XZ, +y up, looking down on the floor with z increasing forward):
//   - direction vector = (end − start), unit-normalised.
//   - LEFT perpendicular = (-dir.z, +dir.x).   RIGHT = (+dir.z, -dir.x).
//   - "left side" of a wall as the observer walks from start → end.

export interface WallInput {
    readonly id: string;
    readonly start: { readonly x: number; readonly z: number };
    readonly end:   { readonly x: number; readonly z: number };
    readonly thickness: number;
    /**
     * §FIX-WALL-V2-EXISTING-CORNER-IMMUTABLE (L-130) — the WallSystemType selected at
     * creation time (e.g. an exterior shell type vs an interior partition type). OPTIONAL:
     * legacy / exact-input callers (and every pre-L-130 test) omit it, in which case ALL
     * walls read as the SAME (empty) type and the existing-corner-immutable guard is a
     * strict no-op — byte-identical to the pre-fix V2 behaviour. When populated (the live
     * WallRebuildCoordinator hand-off), a DIFFERENT-type newcomer joining an existing
     * same-type L-corner is frozen out of the corner miter and adapts instead (mirrors the
     * legacy WallJoinResolver §FIX-EXISTING-CORNER-IMMUTABLE guard). Detection-time metadata
     * only — never affects a wall's centreline baseline.
     */
    readonly systemTypeId?: string;
}

export interface Pt2 { readonly x: number; readonly z: number }

export interface WallMiter {
    readonly id: string;
    /** Inner-side corner at the start-end junction (LEFT of wall direction). */
    readonly startLeft?:  Pt2;
    /** Inner-side corner at the start-end junction (RIGHT of wall direction). */
    readonly startRight?: Pt2;
    /** Inner-side corner at the end junction (LEFT of wall direction). */
    readonly endLeft?:    Pt2;
    /** Inner-side corner at the end junction (RIGHT of wall direction). */
    readonly endRight?:   Pt2;
    /** Pivot vertex at the start junction (= consensus point). The footprint
     *  polygon hinges on this so adjacent walls share corners exactly. */
    readonly startPivot?: Pt2;
    /** Pivot vertex at the end junction. */
    readonly endPivot?:   Pt2;
    /** §FIX-WALL-CLUSTER-DEGENERATE — TRUE when this wall is DEGENERATE at a junction and
     *  MUST NOT be built (the consumer skips its mesh instead of rendering a self-intersecting
     *  spike). Set when the wall's BOTH endpoints collapse into the SAME junction cluster —
     *  i.e. the wall is shorter than the cluster band, so both its ends snap to one node.
     *  Left in the ring sweep, both ends hinge on the same pivot and produce a bow-tie /
     *  negative-area (inverted-normal) footprint: the founder's "black triangular spike" at
     *  an L-corner that also receives a tiny stub. Mirrors the legacy WallJoinResolver
     *  `invalid` + `DEGENERATE_STUB_LENGTH` guard, but for the V2 footprint path — and keyed
     *  to the V2 0.20 m band (a stub the legacy 0.12 m band misses). Additive/optional field:
     *  no existing consumer breaks. */
    readonly invalid?: boolean;
}

export interface ResolveOptions {
    /** Endpoint snap radius (m). Default = the §RESI-L0-CORNER-CLOSE near-junction
     *  band (0.20 m); pass an explicit value to override (e.g. 0.001 for exact input). */
    readonly snapEpsilonM?: number;
    /** Perpendicular tolerance for T-projection (m). Default = the near-junction band
     *  (0.20 m); pass an explicit value to override. */
    readonly tProjectionEpsilonM?: number;
}

// §RESI-L0-CORNER-CLOSE (2026-06-25) — endpoint-cluster + T-projection band.
//
// THE founder defect (defect #1): on a GENERATED / WELDED (often ~45° ROTATED) ground
// shell the two perimeter walls meeting at an L-corner are NOT bit-exact coincident —
// post-weld / post-miter / principal-axis drift leaves them 20–285 mm apart. The legacy
// WallJoinResolver recovers this via §NEAR-CORNER-L (snapRadius-wide endpoint cluster +
// pair-wise bisector miter) and closes the corner to 0 mm. But the DEFAULT-ON V2 pipeline
// (WallPipelineV2) clustered endpoints with a 1 mm epsilon, so those drifted corner
// endpoints fell into SEPARATE single-endpoint clusters → no junction → BOTH walls got a
// square cap → the corner opened (the "tiny diamond of empty space" in plan, vertical seam
// in 3D — even though each wall, taken alone, looks "mitred-eligible"). The same 1 mm
// T-projection tolerance also missed a partition whose end lands a few cm off a shell BODY
// (the room-loop signature) so it never became an edge-coincident T.
//
// FIX: default the cluster + T-projection band to the SAME "touching" floor the rest of the
// stack already treats as one node — RoomDetectionEngine's SNAP_FLOOR (0.20 m) and the legacy
// resolver's §NEAR-CORNER-L band (0.12 m) — so a welded/rotated corner whose endpoints are
// within the band clusters into ONE junction and the ring sweep produces the SHARED,
// edge-coincident corner (corner closes, by construction). This is a DETECTION-TIME band ONLY:
// `resolveJunctions` returns per-end corner POINTS and NEVER relocates a wall's centreline
// baseline — so widening it can never double a wall or split a baseline (the failure mode that
// regressed §CLAMP-COSHARE-WELD / ADR-0072 P3c-b). The band is kept at the touching floor
// (0.20 m), comfortably below any real room dimension / partition spacing, so distinct
// junctions are never fused. An escape hatch (`__pryzmWallV2JunctionBandM`) restores the tight
// 1 mm legacy values for diagnostics / exact-input callers.
const JUNCTION_BAND_FLOOR_M = 0.20;
/** The pre-fix tight cluster epsilon (1 mm). Available via the escape hatch. */
const LEGACY_TIGHT_M = 0.001;

// §FIX-WALL-3RD-AT-LCORNER-IMMUTABLE (L-146, founder 2026-07-07) — two endpoints within this
// distance are treated as the SAME shared corner vertex. A CLEAN, snap-drawn L-corner has its
// two arms at byte-identical coordinates (0 mm apart — the endpoint snap sets identical world
// coords), so a real shared corner tight-clusters at ~0 mm. A THIRD wall started a few mm off
// that vertex sits measurably farther (> this floor) and is a NEAR-COINCIDENT NEWCOMER that must
// NOT drag the existing mitre. Kept at the legacy tight epsilon (1 mm) — far below the 0.20 m
// loose §RESI-L0 band, and below the founder's "a few mm off" newcomer offset — so a genuine
// corner and a near newcomer separate cleanly, while a sub-mm start reads as the exact vertex
// (the founder's "sound" 3-way Y). See the guard pass inside `detectJunctions`.
const SHARED_CORNER_TIGHT_M = LEGACY_TIGHT_M;

/** Default endpoint-cluster + T-projection band (m). The near-junction floor
 *  (0.20 m), overridable to the legacy 1 mm via `__pryzmWallV2JunctionBandM`. */
function defaultJunctionBandM(): number {
    const o = (globalThis as { __pryzmWallV2JunctionBandM?: number }).__pryzmWallV2JunctionBandM;
    if (typeof o === 'number' && Number.isFinite(o) && o >= 0) return o;
    return JUNCTION_BAND_FLOOR_M;
}

const PARALLEL_DET = 1e-9;

// §RESI-PERIM-CORNER-PIVOT (founder 2026-06-26) — align V2's L-junction pivot with the
// LEGACY resolver's `sharedPt`.
//
// THE founder defect (this round): a generated HOUSE / residential BUILDING shows an
// un-mitred SEAM at PERIMETER external corners even where the §DIAG-PERIM-CORNER-WHOLE
// probe reports `bothMitred`. Root cause = TWO miter pipelines pivoting a DRIFTED corner
// at DIFFERENT points:
//   • Legacy `WallJoinResolver` (the path a perimeter wall WITH A WINDOW renders through,
//     via `buildMiterPrism`) trims both walls to `sharedPt` = the centreline×centreline
//     INTERSECTION of the two walls.
//   • V2 `JunctionResolverV2` (the path a PLAIN neighbour renders through, via the
//     footprint extruder) pivots the ring sweep at the endpoint-cluster CENTROID.
// On a PERFECT corner centroid ≡ intersection, so both agree (gap 0). On a generated /
// welded shell the corner endpoints drift tens–hundreds of mm apart, so centroid ≠
// intersection — a window-bearing wall (legacy) and its plain neighbour (V2) then place
// their SHARED outer corner at two different points and the corner opens (a ~tens-of-mm
// seam). `bothMitred` stays true and the legacy-vs-legacy gap probe still reads ~0 because
// it never compares the two PIPELINES — only legacy trimmed baselines against each other.
//
// FIX: for a pure 2-real-endpoint L junction (no passthrough), refine the ring-sweep pivot
// from the centroid to the centreline×centreline intersection — the exact point legacy uses.
// Both V2 corner POINTS still coincide with each other (every existing V2 test holds), AND
// they now coincide with the legacy neighbour's cap, so a mixed-pipeline corner closes.
// This is DETECTION-FRAME ONLY: it changes the reference point the corners are computed
// FROM; it NEVER relocates a wall's centreline baseline (the §CLAMP-COSHARE-WELD / ADR-0072
// P3c-b doubling regression). Guards: skip near-parallel pairs (no well-defined crossing),
// and accept the crossing only when it lies within `PIVOT_REFINE_BAND_M` of the centroid so
// a shallow corner can never teleport the pivot far down the wall.
const PIVOT_REFINE_BAND_M = JUNCTION_BAND_FLOOR_M;
/** Below this |sin θ| the two wall directions are treated as parallel (no L crossing). */
const PIVOT_REFINE_MIN_SIN = 0.05;

// §FIX-WALL-TJUNCTION-BUTT (2026-07-02 — founder T-junction "arrow/spike" fix) ──────
//
// THE founder defect: an existing host wall is in place; a GUEST wall is drawn to
// connect INTO it (a T). The guest's connecting end renders as a weird "arrow"/spike
// (a mitred point) instead of butting flat against the host's face; the host is also
// perturbed. Expected: host stays exactly as-is, guest butts cleanly — a perfect T.
//
// ROOT CAUSE — an L-vs-T MISCLASSIFICATION at detection time. `clusterEndpoints`
// fuses endpoints within the §RESI-L0-CORNER-CLOSE band (0.20 m). When the guest's
// terminating end lands on the host's BODY but NEAR the host's own endpoint, the two
// endpoints cluster together, so `detectJunctions` sees TWO real endpoints and NO
// passthrough → the junction is classified as an L-CORNER. The ring sweep then applies
// a MUTUAL bisector miter: it extends the guest's end to the intersection of the two
// offset edge-lines (one corner pulled back, the other pushed PAST the host's end /
// through the host's outer face) → the asymmetric diagonal cut the founder sees as an
// "arrow", and it MOVES the host's cap too (host perturbed). That is a genuine T being
// force-fit into the closed-form L miter, which is only valid when EXACTLY two walls
// co-TERMINATE at the corner.
//
// THE L-vs-T INVARIANT (this pass enforces it): a clustered endpoint of wall H is a
// PASSTHROUGH (T-host) — not an L-arm — precisely when another cluster-member wall G's
// OWN endpoint projects STRICTLY INTERIOR onto H's segment (0<t<1, not clamped to an
// end) within the T-projection band, AND that contact foot is displaced from H's own
// clustered endpoint by MORE than the cluster band (i.e. H's body genuinely CONTINUES
// PAST the junction — it does not co-terminate there). Then H is a passthrough and G is
// the real T-attacher: G butts H's face (square, flat) and H is left untouched — exactly
// the Pascal T the mid-span case already produces. A genuine L-corner (incl. the welded/
// drifted §RESI-L0 corner) has each wall's endpoint at/near its OWN terminus, so the
// neighbour's foot CLAMPS to H's end (interior=false) OR lands within the cluster band of
// H's endpoint (not "past") → NO reclassification → the L bisector miter is byte-unchanged.
//
// This is DETECTION-FRAME ONLY: it moves H from `realEndpoints` to `passthroughWalls` and
// re-points the junction pivot to the abutter's foot on the host body; it NEVER relocates
// any wall's centreline baseline (the §CLAMP-COSHARE-WELD / ADR-0072 P3c-b doubling
// regression mode). Gated default-ON with an escape hatch; pure + deterministic.

/** Escape hatch: set `__pryzmWallV2TJunctionButt = false` to restore the pre-fix
 *  L-classification of a guest-into-host-body-near-end junction (diagnostics). Default ON. */
function tJunctionButtEnabled(): boolean {
    return (globalThis as { __pryzmWallV2TJunctionButt?: boolean }).__pryzmWallV2TJunctionButt !== false;
}

/** Escape hatch: set `__pryzmWallV2LPivotRefine = false` to restore the pre-fix
 *  centroid pivot (diagnostics / exact-input callers). Default ON. */
function lPivotRefineEnabled(): boolean {
    return (globalThis as { __pryzmWallV2LPivotRefine?: boolean }).__pryzmWallV2LPivotRefine !== false;
}

// §WALL-BODY-INNER-FACE (residual of §ONE-FRAME-MINT, 2026-06-18) — a partition END that
// terminates on a passthrough wall's BODY (the partition→wall T-junction) must stop at that
// host's NEAR (butt) face, NEVER spike a triangular tongue to the host CENTRELINE. The ring
// sweep already lands the partition's two side corners (`endLeft` / `endRight`) on the host
// near face, but it ALSO writes a PIVOT vertex at `j.point` (the host centreline) — and the
// footprint assembler inserts that pivot BETWEEN the two near-face corners, extruding a solid
// tongue from the near face down to the centreline that pokes `hostHalfThickness` (~50–100 mm)
// INTO the host (the founder's "wall extruding wrong / arrow-spike in 3D + chevron tip in
// plan"; the legacy WallJoinResolver inner-face clamp at WallJoinResolver.ts:
// _clampEndToShellInnerFace already removes it on the LEGACY build path, but the default-ON
// V2 pipeline builds from the un-clamped pre-trim baseline and never saw that clamp).
//
// §FIX-WALL-TJUNCTION-BUTT-2 (2026-07-02 — re-open of L-27) — the ORIGINAL fix gated this
// suppression on the passthrough being ≥1.5× THICKER than the abutter (`PASSTHROUGH_THICKER_
// RATIO`). That fixed the partition→shell case but LEFT THE SPIKE for an EQUAL-thickness T:
// a guest wall drawn into a same-thickness host still had its centreline pivot written, so the
// footprint assembler drew the arrow tongue from the near face (z=+halfT) down to the host
// centreline (z=0). The classification (§FIX-WALL-TJUNCTION-BUTT) is CORRECT — the host is a
// passthrough, the two side corners butt flat on the near face — but the ring-sweep PIVOT is
// the residual spike. The real invariant: a real endpoint that abuts ANY passthrough at the
// junction is a T-ATTACHER — it butts the host's SIDE face and must never carry a centreline
// pivot, regardless of the thickness ratio (a T is not an X; only co-terminating corners
// L/X/Y — junctions with NO passthrough — share the centreline pivot). So SUPPRESS the pivot
// for every real endpoint at a junction that has ≥1 passthrough. Thickness is irrelevant.
// The two near-face corners already produced by the sweep make the guest a clean flat butt.
// Gated default-ON with an escape hatch; pure + deterministic.
function partitionInnerFaceV2Enabled(): boolean {
    return (globalThis as { __pryzmWallPartitionInnerFaceV2?: boolean }).__pryzmWallPartitionInnerFaceV2 !== false;
}

// §FIX-WALL-V2-EXISTING-CORNER-IMMUTABLE (L-130, founder 2026-07-06) — mirror the legacy
// WallJoinResolver §FIX-EXISTING-CORNER-IMMUTABLE guard in the DEFAULT-ON V2 footprint
// pipeline. See the block comment on the guard pass inside `detectJunctions`.
//
/** Escape hatch: set `__pryzmWallV2ExistingCornerImmutable = false` to restore the pre-fix
 *  V2 behaviour, where a DIFFERENT-systemTypeId newcomer co-terminating at an existing
 *  same-type L-corner re-mitres (distorts) that corner. Default ON. */
function existingCornerImmutableV2Enabled(): boolean {
    return (globalThis as { __pryzmWallV2ExistingCornerImmutable?: boolean })
        .__pryzmWallV2ExistingCornerImmutable !== false;
}

// §FIX-WALL-3RD-AT-LCORNER-IMMUTABLE (L-146, founder 2026-07-07) — the TYPE-INDEPENDENT
// generalisation of the L-130 guard. See the block comment on the guard pass in `detectJunctions`.
//
/** Escape hatch: set `__pryzmWallV2ThirdAtLCornerImmutable = false` to restore the pre-fix
 *  behaviour, where a NEAR-coincident (a few mm off) third wall started next to an existing
 *  clean L-corner clusters into it and DRAGS the two existing walls' mitre off the shared
 *  vertex (the centroid of {A.end, B.start, C.start} is pulled toward C). Default ON. */
function thirdAtLCornerImmutableEnabled(): boolean {
    return (globalThis as { __pryzmWallV2ThirdAtLCornerImmutable?: boolean })
        .__pryzmWallV2ThirdAtLCornerImmutable !== false;
}

/** systemTypeId of a wall, normalised (undefined → '') so equality tests treat every
 *  type-less wall as one and the same type → the guard is a no-op on legacy inputs. */
function wallSystemType(w: WallInput): string {
    return w.systemTypeId ?? '';
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function sub(a: Pt2, b: Pt2): Pt2 { return { x: a.x - b.x, z: a.z - b.z }; }
function add(a: Pt2, b: Pt2): Pt2 { return { x: a.x + b.x, z: a.z + b.z }; }
function scale(a: Pt2, k: number): Pt2 { return { x: a.x * k, z: a.z * k }; }
function dot(a: Pt2, b: Pt2): number { return a.x * b.x + a.z * b.z; }
function lenSq(a: Pt2): number { return a.x * a.x + a.z * a.z; }
function len(a: Pt2): number { return Math.hypot(a.x, a.z); }
function unit(a: Pt2): Pt2 { const L = len(a) || 1; return { x: a.x / L, z: a.z / L }; }
function leftPerp(d: Pt2): Pt2 { return { x: -d.z, z: d.x }; }     // CCW 90°

/** 2-D line-line intersection: `p1 + t*d1 = p2 + s*d2`. Returns null when parallel. */
function intersectLines(p1: Pt2, d1: Pt2, p2: Pt2, d2: Pt2): Pt2 | null {
    const det = d1.x * d2.z - d1.z * d2.x;
    if (Math.abs(det) < PARALLEL_DET) return null;
    const w = sub(p2, p1);
    const t = (w.x * d2.z - w.z * d2.x) / det;
    return { x: p1.x + t * d1.x, z: p1.z + t * d1.z };
}

/** Closest-point parameter `t ∈ [0,1]` of `p` projected onto segment a→b. */
function projectOnSeg(p: Pt2, a: Pt2, b: Pt2): { t: number; foot: Pt2; perpDist: number } {
    const ab = sub(b, a);
    const L2 = lenSq(ab);
    if (L2 < 1e-12) return { t: 0, foot: a, perpDist: len(sub(p, a)) };
    const tRaw = dot(sub(p, a), ab) / L2;
    const t = Math.max(0, Math.min(1, tRaw));
    const foot = { x: a.x + ab.x * t, z: a.z + ab.z * t };
    return { t, foot, perpDist: len(sub(p, foot)) };
}

// ─── Junction detection (two passes) ──────────────────────────────────────────

interface EndpointRef {
    readonly wallIdx: number;
    readonly isStart: boolean;       // is this the wall's START endpoint?
    /** Original endpoint position (BEFORE snap). */
    readonly origin: Pt2;
}

interface JunctionDraft {
    /** Consensus point — the centroid of clustered endpoints, then refined by T-projection. */
    point: Pt2;
    /** Real endpoint references (the wall's start or end is AT this junction). */
    realEndpoints: EndpointRef[];
    /** Passthrough wall indices (the wall's body crosses this junction; both halves act as separate "directions" in the sweep). */
    passthroughWalls: number[];
}

/** Group endpoints by spatial proximity (within `eps`). Pure greedy clustering. */
function clusterEndpoints(walls: readonly WallInput[], eps: number): EndpointRef[][] {
    const refs: EndpointRef[] = [];
    walls.forEach((w, i) => {
        refs.push({ wallIdx: i, isStart: true,  origin: w.start });
        refs.push({ wallIdx: i, isStart: false, origin: w.end   });
    });
    const used = new Array<boolean>(refs.length).fill(false);
    const clusters: EndpointRef[][] = [];
    for (let i = 0; i < refs.length; i++) {
        if (used[i]) continue;
        used[i] = true;
        const cluster: EndpointRef[] = [refs[i]!];
        for (let j = i + 1; j < refs.length; j++) {
            if (used[j]) continue;
            if (len(sub(refs[i]!.origin, refs[j]!.origin)) <= eps) {
                used[j] = true;
                cluster.push(refs[j]!);
            }
        }
        clusters.push(cluster);
    }
    return clusters;
}

function centroid(pts: readonly Pt2[]): Pt2 {
    const n = pts.length || 1;
    let sx = 0, sz = 0;
    for (const p of pts) { sx += p.x; sz += p.z; }
    return { x: sx / n, z: sz / n };
}

/** Build the junction set: cluster ALL endpoints, attach T-passthroughs, KEEP
 *  every junction that ends up with ≥2 participants (real endpoints + passthroughs
 *  count together). A T-junction has only ONE real endpoint plus the passthrough
 *  wall — discarding single-endpoint clusters before T-projection misses these. */
function detectJunctions(walls: readonly WallInput[], opts: Required<ResolveOptions>): JunctionDraft[] {
    const clusters = clusterEndpoints(walls, opts.snapEpsilonM);
    const drafts: JunctionDraft[] = clusters.map(c => ({
        point: centroid(c.map(r => r.origin)), realEndpoints: c, passthroughWalls: [],
    }));

    // T-projection: for each cluster, find walls whose BODY (not endpoint) crosses
    // the consensus point.
    for (const j of drafts) {
        const ownWalls = new Set(j.realEndpoints.map(r => r.wallIdx));
        for (let i = 0; i < walls.length; i++) {
            if (ownWalls.has(i)) continue;
            const w = walls[i]!;
            const proj = projectOnSeg(j.point, w.start, w.end);
            if (proj.t > 0.001 && proj.t < 0.999 && proj.perpDist <= opts.tProjectionEpsilonM) {
                j.passthroughWalls.push(i);
            }
        }
    }

    // §FIX-WALL-LCORNER-T-CLEAN (L-61, founder 2026-07-03) — an L-CORNER (2 walls
    // co-terminating) that ALSO receives a THIRD wall teeing onto one arm near the corner.
    //
    // THE founder defect: walls A + B are joined in an L (shared endpoint = corner). A third
    // wall C is drawn to butt onto arm A's BODY a little BEFORE the corner. C's terminating
    // endpoint falls INSIDE the §RESI-L0 0.20 m cluster band of the corner node, so
    // `clusterEndpoints` fuses C's endpoint into the A+B corner cluster → the cluster now has
    // THREE real endpoints {A.end, B.start, C.start}. §FIX-WALL-TJUNCTION-BUTT then sees C
    // teeing interior on A's body and reclassifies A → passthrough — but A is ALSO the L-arm
    // co-terminating with B, so making it a passthrough DISSOLVES the A–B miter: A square-caps
    // straight THROUGH the corner (poking its end face past x=corner, the "spike"), and its
    // outer face now OVERLAPS B's body in the junction (the "doubled / overlapping edge" the
    // founder sees on the horizontal wall). The clean answer is that C is a SEPARATE T on A's
    // body — its own junction at C's foot — while A + B keep their untouched L-corner.
    //
    // FIX: BEFORE the in-place §FIX-WALL-TJUNCTION-BUTT reclassification, detect the
    // tee-attacher(s) in a multi-member cluster — a real endpoint G that projects strictly
    // INTERIOR onto another member H's body, on-face, continuing past H's own end by ≥ H's
    // half-thickness, and not collinear (the exact §FIX-WALL-TJUNCTION-BUTT invariant). If
    // removing every tee-attacher STILL leaves ≥2 real endpoints, a genuine corner (L/Y/X)
    // survives among the co-terminating members. EXTRACT each tee-attacher into its OWN
    // T-junction (real end = G, passthrough = its host H, pivot = G's foot on H) and remove it
    // from the corner cluster. The corner cluster then resolves as the clean L/Y/X it is, and
    // A is never reclassified there — so the A–B miter is byte-unchanged and C butts A's face.
    // When removing the tee-attachers leaves <2 real ends (the simple near-end T of L-27, no
    // co-terminating corner), this pass is a no-op and the existing in-place reclassification
    // below handles it exactly as before. DETECTION-FRAME ONLY: it splits a cluster and points
    // the new junction at the foot on the host body; it NEVER relocates a centreline baseline.
    if (tJunctionButtEnabled()) {
        const extra: JunctionDraft[] = [];
        for (const j of drafts) {
            // A corner (≥2 co-terminating) PLUS a tee-attacher (≥1) needs ≥3 real ends.
            if (j.realEndpoints.length < 3) continue;
            // For each real endpoint, is it a tee-attacher, and onto which host?
            const hostOf = new Map<number, number>();   // realEndpoint array-index → host wallIdx
            j.realEndpoints.forEach((G, gi) => {
                const wG = walls[G.wallIdx]!;
                const eG = G.isStart ? wG.start : wG.end;
                const dirG = unit(G.isStart ? sub(wG.end, wG.start) : sub(wG.start, wG.end));
                for (const H of j.realEndpoints) {
                    if (H.wallIdx === G.wallIdx) continue;
                    const wH = walls[H.wallIdx]!;
                    const eH = H.isStart ? wH.start : wH.end;
                    const dirH = unit(sub(wH.end, wH.start));
                    const proj = projectOnSeg(eG, wH.start, wH.end);
                    const interior = proj.t > 0.001 && proj.t < 0.999;
                    const onFace = proj.perpDist <= opts.tProjectionEpsilonM;
                    const continuesPast = len(sub(proj.foot, eH)) >= wH.thickness * 0.5;
                    const notCollinear = Math.abs(dot(dirH, dirG)) < 0.94;
                    if (interior && onFace && continuesPast && notCollinear) {
                        hostOf.set(gi, H.wallIdx);
                        break;
                    }
                }
            });
            if (hostOf.size === 0) continue;
            // A genuine corner must survive the extraction (≥2 non-tee real endpoints).
            if (j.realEndpoints.length - hostOf.size < 2) continue;
            const keep: EndpointRef[] = [];
            j.realEndpoints.forEach((G, gi) => {
                const host = hostOf.get(gi);
                if (host === undefined) { keep.push(G); return; }
                const wG = walls[G.wallIdx]!;
                const eG = G.isStart ? wG.start : wG.end;
                const foot = projectOnSeg(eG, walls[host]!.start, walls[host]!.end).foot;
                extra.push({ point: foot, realEndpoints: [G], passthroughWalls: [host] });
            });
            j.realEndpoints = keep;
        }
        for (const e of extra) drafts.push(e);
    }

    // §FIX-WALL-V2-EXISTING-CORNER-IMMUTABLE (L-130, founder 2026-07-06) — mirror the legacy
    // WallJoinResolver §FIX-EXISTING-CORNER-IMMUTABLE guard in the V2 footprint pipeline.
    //
    // THE founder defect (recurring, HIGH-visibility): two EXTERIOR walls meet in a clean
    // mitred L (inglete). A THIRD interior wall — a DIFFERENT systemTypeId — is drawn to join
    // AT that corner (e.g. STRAIGHT DOWN, collinear with one exterior arm). Plain, opening-free
    // exterior walls render their 3D body through THIS V2 pipeline, whose `WallInput` historically
    // carried NO systemTypeId — so the legacy "different-type ⇒ newcomer adapts, existing corner
    // frozen" guard never engaged here. The newcomer's endpoint clusters into the corner node, so
    // `detectJunctions` sees THREE co-terminating real endpoints and NO passthrough → the ring
    // sweep runs a 3-way miter → the existing exterior corner is RE-MITRED (arm A's outer corner
    // is now bounded by the thin interior wall's edge instead of exterior arm B) = the founder's
    // re-mitred / doubled / notched junction.
    //
    // FIX (faithful mirror, keyed on systemTypeId): in a pure co-terminating cluster (NO
    // passthrough) with ≥3 real endpoints, if EXACTLY ONE systemTypeId group forms a genuine
    // corner (≥2 same-type arms with at least one NON-collinear pair — a real L/Y, not a straight
    // same-type run) and the remaining real endpoints are of a DIFFERENT systemTypeId, FREEZE the
    // same-type corner (leave ONLY its arms in this junction so the ring sweep produces the
    // BYTE-IDENTICAL L / same-type-N-way miter) and EXTRACT each different-type newcomer into its
    // OWN T-junction, butting flat against the corner arm it is MOST PERPENDICULAR to (the legacy
    // T-into-corner seat). The exterior arms stay byte-identical to the no-newcomer solve; only the
    // newcomer adapts. DETECTION-FRAME ONLY: it splits a cluster and points the new junction at the
    // foot on a corner arm — it NEVER relocates a centreline baseline (no §CLAMP-COSHARE-WELD /
    // ADR-0072 doubling). Correctness guards: a GENUINE same-type through-wall / continuation / Y
    // has all arms of ONE type → no different-type newcomer → no-op; when systemTypeId is absent on
    // every wall (all existing V2 tests) all types read equal → no-op → byte-identical. Requiring
    // EXACTLY ONE corner group keeps an ambiguous two-corner cluster untouched. Gated default-ON.
    if (existingCornerImmutableV2Enabled()) {
        const extra: JunctionDraft[] = [];
        // A type group "forms a corner" when ≥2 of its arms meet non-collinearly (a real L/Y),
        // as opposed to a straight same-type run (a pass-through, not a corner to freeze).
        const awayDir = (r: EndpointRef): Pt2 => {
            const w = walls[r.wallIdx]!;
            return unit(r.isStart ? sub(w.end, w.start) : sub(w.start, w.end));
        };
        const formsCorner = (refs: readonly EndpointRef[]): boolean => {
            for (let i = 0; i < refs.length; i++) {
                const dA = awayDir(refs[i]!);
                for (let k = i + 1; k < refs.length; k++) {
                    if (refs[k]!.wallIdx === refs[i]!.wallIdx) continue;
                    if (Math.abs(dot(dA, awayDir(refs[k]!))) < 0.94) return true;   // > ~20° apart
                }
            }
            return false;
        };
        for (const j of drafts) {
            if (j.passthroughWalls.length !== 0) continue;    // pure co-terminating clusters only
            if (j.realEndpoints.length < 3) continue;         // need a corner (≥2) + a newcomer (≥1)
            // Group the real endpoints by systemTypeId; ≥2 distinct types ⇒ a newcomer may exist.
            const byType = new Map<string, EndpointRef[]>();
            for (const r of j.realEndpoints) {
                const t = wallSystemType(walls[r.wallIdx]!);
                const arr = byType.get(t);
                if (arr) arr.push(r); else byType.set(t, [r]);
            }
            if (byType.size < 2) continue;                    // one type ⇒ no different-type newcomer
            // Exactly ONE type group forming a corner ⇒ that is the frozen existing corner; every
            // other real endpoint is a different-type newcomer that must adapt.
            let cornerType: string | null = null;
            let cornerCount = 0;
            for (const [t, refs] of byType) {
                if (refs.length >= 2 && formsCorner(refs)) { cornerType = t; cornerCount++; }
            }
            if (cornerCount !== 1 || cornerType === null) continue;
            const cornerRefs = byType.get(cornerType)!;
            const newcomers = j.realEndpoints.filter(r => wallSystemType(walls[r.wallIdx]!) !== cornerType);
            if (newcomers.length === 0) continue;
            // Seat each newcomer as its OWN T-junction, butting the most-perpendicular corner arm
            // (a collinear arm would give a degenerate parallel butt — the perpendicular arm's
            // face is the clean seat). Foot on the host segment; NEVER moves the baseline.
            for (const G of newcomers) {
                const eG = G.isStart ? walls[G.wallIdx]!.start : walls[G.wallIdx]!.end;
                const dG = awayDir(G);
                let hostIdx = -1;
                let bestAbsDot = Infinity;
                for (const H of cornerRefs) {
                    const dH = unit(sub(walls[H.wallIdx]!.end, walls[H.wallIdx]!.start));
                    const ad = Math.abs(dot(dG, dH));
                    if (ad < bestAbsDot) { bestAbsDot = ad; hostIdx = H.wallIdx; }
                }
                if (hostIdx < 0) continue;
                const host = walls[hostIdx]!;
                const foot = projectOnSeg(eG, host.start, host.end).foot;
                extra.push({ point: foot, realEndpoints: [G], passthroughWalls: [hostIdx] });
            }
            // Freeze: this junction now contains ONLY the same-type corner arms.
            j.realEndpoints = cornerRefs;
        }
        for (const e of extra) drafts.push(e);
    }

    // §FIX-WALL-3RD-AT-LCORNER-IMMUTABLE (L-146, founder 2026-07-07) — the TYPE-INDEPENDENT
    // generalisation of the L-130 existing-corner-immutable guard.
    //
    // THE founder defect (CRITICAL, HIGH-visibility): two walls meet in a clean mitred L (their
    // shared corner vertex = byte-identical coordinates, drawn with endpoint snap). The user
    // starts a THIRD wall whose FIRST point lands a FEW MILLIMETRES off that shared vertex (below
    // the snap tolerance, so the plan tool placed it free rather than snapping it to the corner).
    // `clusterEndpoints` (0.20 m §RESI-L0 band) fuses the third wall's endpoint into the corner
    // node, so `detectJunctions` sees THREE co-terminating real endpoints and NO passthrough →
    // the ring sweep runs a 3-WAY miter around the cluster CENTROID = (A.end + B.start + C.start)/3,
    // which is DRAGGED off the true corner toward the newcomer → the two EXISTING walls' mitre
    // corners + footprints are RECOMPUTED and DEFORM (the founder's "existing walls malform").
    //
    // The founder's decisive refinement pins the mechanism: EXACTLY on the shared vertex the
    // result is sound (centroid == vertex → a clean symmetric 3-way Y — no drag), and starting on
    // a wall MID-POINT is sound (a clean T). ONLY the NEAR-BUT-NOT-EXACT start malforms — a
    // near-coincident cluster whose centroid drags the existing mitre. The L-130 guard already
    // freezes an existing corner + re-seats the newcomer as a clean T, but it is keyed on the
    // newcomer having a DIFFERENT systemTypeId — so a SAME-type (or the common type-less V2)
    // newcomer, which is exactly the founder's case, slips straight through and drags the corner.
    //
    // FIX (systemTypeId-INDEPENDENT, keyed on coincidence TIGHTNESS): in a pure co-terminating
    // cluster (NO passthrough) with ≥3 real endpoints, TIGHT-cluster the endpoints at
    // `SHARED_CORNER_TIGHT_M` (1 mm). A real shared corner's arms are byte-identical (one tight
    // group at ~0 mm); a near newcomer sits alone. If EXACTLY ONE tight group forms a genuine
    // CORNER (≥2 arms with a NON-COLLINEAR pair — a real L/Y, never a collinear straight-run such
    // as the L-44 bar-through-T) and there is ≥1 endpoint OUTSIDE it, FREEZE the corner (leave
    // ONLY its tight arms in this junction, so the ring sweep produces the BYTE-IDENTICAL L/N-way
    // miter — the existing walls are truly immutable) and EXTRACT each near newcomer into its OWN
    // T-junction, butting flat against the corner arm it is MOST PERPENDICULAR to (the same seat
    // as L-130). This maps to the founder's guardrail: a near-corner start becomes a clean T (or,
    // when sub-mm, stays inside the tight corner and resolves as the sound exact-vertex Y).
    //
    // DETECTION-FRAME ONLY: it splits a cluster and points the new junction at the foot on a
    // corner arm — it NEVER relocates a centreline baseline (no §CLAMP-COSHARE-WELD / ADR-0072
    // doubling). Guards keep it inert everywhere it must be: a genuine exact 3-way Y (all arms
    // tight together) has NO outsider → no-op → unchanged; a collinear straight-run+tee is not a
    // corner (formsCorner=false) → no-op → the L-44 path is unchanged; a welded/DRIFTED §RESI-L0
    // corner (arms > 1 mm apart, generated shells) has no tight corner group → no-op → its
    // loose-band closing is preserved. Runs AFTER §FIX-WALL-LCORNER-T-CLEAN + L-130 so genuine
    // interior tees and different-type newcomers are already peeled. Gated default-ON with an
    // escape hatch; pure + deterministic. Maps to ADR-0055 (Pascal wall pipeline P1 junction
    // solve) and C11 (element-creation pipeline: creating an element must not mutate existing ones).
    if (thirdAtLCornerImmutableEnabled()) {
        const extra: JunctionDraft[] = [];
        const posOf = (r: EndpointRef): Pt2 => (r.isStart ? walls[r.wallIdx]!.start : walls[r.wallIdx]!.end);
        const awayDir = (r: EndpointRef): Pt2 => {
            const w = walls[r.wallIdx]!;
            return unit(r.isStart ? sub(w.end, w.start) : sub(w.start, w.end));
        };
        // A set of endpoints "forms a corner" when ≥2 of its arms (from DISTINCT walls) meet
        // NON-COLLINEARLY (a real L/Y) — as opposed to a straight collinear run (the L-44 bar
        // pass-through, which must keep its existing 3-way resolution untouched).
        const formsCorner = (refs: readonly EndpointRef[]): boolean => {
            for (let i = 0; i < refs.length; i++) {
                const dA = awayDir(refs[i]!);
                for (let k = i + 1; k < refs.length; k++) {
                    if (refs[k]!.wallIdx === refs[i]!.wallIdx) continue;
                    if (Math.abs(dot(dA, awayDir(refs[k]!))) < 0.94) return true;   // > ~20° apart
                }
            }
            return false;
        };
        for (const j of drafts) {
            if (j.passthroughWalls.length !== 0) continue;    // pure co-terminating clusters only
            if (j.realEndpoints.length < 3) continue;         // need a corner (≥2) + a newcomer (≥1)
            // Tight-cluster the real endpoints (greedy, 1 mm): a snap-drawn corner's arms share
            // byte-identical coords (one tight group); a near newcomer sits in its own group.
            const refs = j.realEndpoints;
            const usedTight = new Array<boolean>(refs.length).fill(false);
            const tightGroups: EndpointRef[][] = [];
            for (let i = 0; i < refs.length; i++) {
                if (usedTight[i]) continue;
                usedTight[i] = true;
                const g: EndpointRef[] = [refs[i]!];
                for (let k = i + 1; k < refs.length; k++) {
                    if (usedTight[k]) continue;
                    if (len(sub(posOf(refs[i]!), posOf(refs[k]!))) <= SHARED_CORNER_TIGHT_M) {
                        usedTight[k] = true;
                        g.push(refs[k]!);
                    }
                }
                tightGroups.push(g);
            }
            // Require EXACTLY ONE tight group that forms a genuine corner; ambiguous clusters
            // (≥2 corner groups, or none) are left untouched.
            const cornerGroups = tightGroups.filter(g => g.length >= 2 && formsCorner(g));
            if (cornerGroups.length !== 1) continue;
            const cornerRefs = cornerGroups[0]!;
            const cornerSet = new Set<EndpointRef>(cornerRefs);
            const newcomers = refs.filter(r => !cornerSet.has(r));
            if (newcomers.length === 0) continue;             // exact N-way Y (all tight) — leave as-is
            // Seat each near newcomer as its OWN T-junction, butting the most-perpendicular frozen
            // corner arm (a collinear arm would give a degenerate parallel butt). Foot on the host
            // segment; NEVER moves the baseline.
            for (const G of newcomers) {
                const eG = posOf(G);
                const dG = awayDir(G);
                let hostIdx = -1;
                let bestAbsDot = Infinity;
                for (const H of cornerRefs) {
                    if (H.wallIdx === G.wallIdx) continue;
                    const dH = unit(sub(walls[H.wallIdx]!.end, walls[H.wallIdx]!.start));
                    const ad = Math.abs(dot(dG, dH));
                    if (ad < bestAbsDot) { bestAbsDot = ad; hostIdx = H.wallIdx; }
                }
                if (hostIdx < 0) continue;
                const host = walls[hostIdx]!;
                const foot = projectOnSeg(eG, host.start, host.end).foot;
                extra.push({ point: foot, realEndpoints: [G], passthroughWalls: [hostIdx] });
            }
            // Freeze: this junction now contains ONLY the tight same-corner arms.
            j.realEndpoints = cornerRefs;
        }
        for (const e of extra) drafts.push(e);
    }

    // §FIX-WALL-TJUNCTION-BUTT — L-vs-T reclassification (see the block comment above
    // `tJunctionButtEnabled`). A clustered endpoint of wall H is a PASSTHROUGH T-host —
    // not an L-arm — when another cluster-member G's OWN endpoint projects strictly
    // INTERIOR onto H's body within the T-projection band AND the contact foot is
    // displaced from H's clustered endpoint by at least H's HALF-THICKNESS (H's body
    // genuinely continues past its own end cap → G butts H's SIDE face, not its END).
    // Reclassify H so G butts H's face flat (Pascal T) instead of both walls sharing a
    // spike-producing L miter. The welded/drifted §RESI-L0 L-corner is unaffected: the
    // neighbour's foot clamps to H's end (interior=false) or the host continues less than
    // half a thickness past (a corner, not a side-face butt).
    if (tJunctionButtEnabled()) {
        for (const j of drafts) {
            // Need ≥2 real endpoints for a spurious L to exist; a single real end is
            // already a clean T (mid-span) or a free end.
            if (j.realEndpoints.length < 2) continue;

            const reclassify = new Set<number>();
            for (const H of j.realEndpoints) {
                const wH = walls[H.wallIdx]!;
                const eH = H.isStart ? wH.start : wH.end;   // H's OWN clustered endpoint
                const dirH = unit(sub(wH.end, wH.start));
                for (const G of j.realEndpoints) {
                    if (G.wallIdx === H.wallIdx) continue;
                    if (reclassify.has(H.wallIdx)) break;
                    const wG = walls[G.wallIdx]!;
                    const eG = G.isStart ? wG.start : wG.end;
                    const dirG = unit(G.isStart ? sub(wG.end, wG.start) : sub(wG.start, wG.end));
                    const proj = projectOnSeg(eG, wH.start, wH.end);
                    // (a) G's endpoint lands STRICTLY INTERIOR on H's body (not clamped
                    //     to either end — a clamped foot is a co-terminating L-arm).
                    const interior = proj.t > 0.001 && proj.t < 0.999;
                    // (b) within the T-projection band perpendicular to H's face.
                    const onFace = proj.perpDist <= opts.tProjectionEpsilonM;
                    // (c) H's body CONTINUES PAST the contact by at least its own HALF-
                    //     THICKNESS: the host's end cap is clear of the junction, so G butts
                    //     the host's SIDE face (a T), not its END (an L). Below half-thickness
                    //     the guest is at the host's CORNER → keep the mutual L bisector so a
                    //     welded/drifted §RESI-L0 corner (foot ≈ H's end) is byte-unchanged.
                    const continuesPast = len(sub(proj.foot, eH)) >= wH.thickness * 0.5;
                    // (d) G is NOT a near-collinear continuation of H (that is a straight
                    //     run / square-capped pass-through, handled elsewhere — never a butt-T).
                    const notCollinear = Math.abs(dot(dirH, dirG)) < 0.94;   // > ~20° between walls
                    if (interior && onFace && continuesPast && notCollinear) {
                        reclassify.add(H.wallIdx);
                    }
                }
            }
            if (reclassify.size === 0) continue;

            // Move each reclassified H from realEndpoints → passthroughWalls.
            j.realEndpoints = j.realEndpoints.filter(r => !reclassify.has(r.wallIdx));
            for (const wi of reclassify) {
                if (!j.passthroughWalls.includes(wi)) j.passthroughWalls.push(wi);
            }
            // Re-point the junction pivot onto the host body at the abutter's foot so the
            // ring sweep butts the (single) surviving real endpoint flush against the host
            // face. Only do this for the clean 1-real-endpoint T; a Y/X residue keeps its
            // centroid so the multi-way sweep is untouched.
            if (j.realEndpoints.length === 1 && j.passthroughWalls.length >= 1) {
                const g = j.realEndpoints[0]!;
                const eG = g.isStart ? walls[g.wallIdx]!.start : walls[g.wallIdx]!.end;
                const host = walls[j.passthroughWalls[0]!]!;
                j.point = projectOnSeg(eG, host.start, host.end).foot;
            }
        }
    }

    // §FIX-WALL-TJUNCTION-BUTT-2 — snap the ring-sweep pivot of EVERY clean single-real-
    // endpoint T onto the host CENTRELINE foot, not the guest's own endpoint.
    //
    // The ring sweep offsets the host's barrier edge-lines from `j.point`; if `j.point` is
    // the guest's own end (the cluster centroid) and that end does NOT sit on the host
    // centreline (e.g. a partition ending on the shell INNER FACE at z=+halfT, not the
    // centreline), the host barrier lines are placed half a host-thickness off, so the guest
    // butts half a thickness PAST the host's near face (a gap in 3D, mirroring the arrow the
    // pivot suppression just removed). Re-pointing `j.point` to the perpendicular foot on the
    // host centreline places the host barrier lines on the host's TRUE faces, so the guest
    // butts flush on the near face — the geometrically correct T butt. This runs for the
    // naturally-detected mid-span T (single real end + T-projected passthrough) as well as the
    // reclassified near-end T; both now share one pivot rule. A guest whose end is already on
    // the host centreline (foot == endpoint) is unchanged (byte-identical). Only the pure
    // 1-real-end T is touched — a Y/X residue keeps its centroid so the multi-way sweep stands.
    if (tJunctionButtEnabled()) {
        for (const j of drafts) {
            if (j.realEndpoints.length === 1 && j.passthroughWalls.length >= 1) {
                const g = j.realEndpoints[0]!;
                const eG = g.isStart ? walls[g.wallIdx]!.start : walls[g.wallIdx]!.end;
                const host = walls[j.passthroughWalls[0]!]!;
                j.point = projectOnSeg(eG, host.start, host.end).foot;
            }
        }
    }

    // A junction needs at least 2 participants total (≥2 real endpoints, OR ≥1
    // real endpoint and ≥1 passthrough — the T-case). A single endpoint with no
    // passthrough is the wall's free end (no junction).
    return drafts.filter(j => j.realEndpoints.length + j.passthroughWalls.length >= 2);
}

/**
 * §FIX-WALL-CLUSTER-DEGENERATE (2026-07-02 — L-27 cluster case) — a wall is DEGENERATE at a
 * cluster when BOTH its endpoints are real members of the SAME junction: the wall is shorter
 * than the cluster band, so both ends snapped to one node (it shows up in `realEndpoints`
 * TWICE). Left in the ring sweep it hinges both ends on the one pivot → a bow-tie /
 * negative-area (inverted-normal) footprint = the founder's "black triangular spike" at an
 * L-corner that also receives a tiny stub (the WallJoinResolver multi-cluster degenerate-wall
 * bug, in the V2 footprint path). Returns the set of such wall indices.
 *
 * This is the PRECISE degeneracy signature — a genuine wall contributes exactly ONE endpoint
 * to any node (its start OR its end; the other end is band-lengths away), so a full-length
 * L/T/Y/X node of real walls never doubles a member (no false positive). It is more precise
 * than the legacy length threshold (`DEGENERATE_STUB_LENGTH` 0.15 m): a 0.158 m stub that
 * doubles into one 0.20 m-band cluster is caught here even though it clears the length gate.
 * Pure; deterministic.
 */
function collectDegenerateClusterWalls(junctions: readonly JunctionDraft[]): Set<number> {
    const degen = new Set<number>();
    for (const j of junctions) {
        const seen = new Map<number, number>();
        for (const r of j.realEndpoints) seen.set(r.wallIdx, (seen.get(r.wallIdx) ?? 0) + 1);
        for (const [wi, count] of seen) if (count >= 2) degen.add(wi);
    }
    return degen;
}

// ─── Ring sweep ───────────────────────────────────────────────────────────────

interface SweepEntry {
    readonly wallIdx: number;
    readonly isStart: boolean;        // for real endpoints — which end is at this junction
    readonly isPassthrough: boolean;  // passthrough walls produce two entries (one per direction)
    readonly direction: Pt2;          // unit vector AWAY from the junction along the wall body
    readonly thickness: number;
    readonly angle: number;           // atan2(direction.z, direction.x), used for CCW sort
}

function buildSweepEntries(j: JunctionDraft, walls: readonly WallInput[]): SweepEntry[] {
    const entries: SweepEntry[] = [];
    for (const r of j.realEndpoints) {
        const w = walls[r.wallIdx]!;
        // direction AWAY from this endpoint along the wall body.
        const dir = r.isStart ? unit(sub(w.end, w.start)) : unit(sub(w.start, w.end));
        entries.push({
            wallIdx: r.wallIdx, isStart: r.isStart, isPassthrough: false,
            direction: dir, thickness: w.thickness, angle: Math.atan2(dir.z, dir.x),
        });
    }
    // Passthroughs: TWO entries, opposite directions. They become barriers in the
    // sweep — they take part in the angular ordering and produce mitre corners for
    // the *abutting* walls, but their own footprint is NOT modified (the passthrough
    // wall continues straight through; the corners we compute belong to other walls).
    for (const wi of j.passthroughWalls) {
        const w = walls[wi]!;
        const fwd = unit(sub(w.end, w.start));
        const rev = { x: -fwd.x, z: -fwd.z };
        entries.push({
            wallIdx: wi, isStart: false, isPassthrough: true,
            direction: fwd, thickness: w.thickness, angle: Math.atan2(fwd.z, fwd.x),
        });
        entries.push({
            wallIdx: wi, isStart: false, isPassthrough: true,
            direction: rev, thickness: w.thickness, angle: Math.atan2(rev.z, rev.x),
        });
    }
    entries.sort((a, b) => a.angle - b.angle);
    return entries;
}

/**
 * §RESI-PERIM-CORNER-PIVOT — for a pure 2-real-endpoint L junction (no passthrough)
 * return the centreline×centreline INTERSECTION of the two walls (the exact point the
 * legacy `WallJoinResolver` trims to), so a wall that renders via the V2 footprint and a
 * neighbour that renders via the legacy `buildMiterPrism` (e.g. a window-bearing perimeter
 * wall) place their SHARED corner at the same point and the corner closes. Returns the
 * original centroid `j.point` unchanged for every other case (T / X / Y / passthrough,
 * near-parallel, or a crossing that falls outside the near-junction band). NEVER relocates
 * a baseline — this only refines the reference point the ring sweep mitres AROUND.
 */
function refineLJunctionPivot(j: JunctionDraft, walls: readonly WallInput[]): Pt2 {
    if (!lPivotRefineEnabled()) return j.point;
    // Pure L only: exactly two REAL wall-ends and no passthrough barrier.
    if (j.passthroughWalls.length !== 0 || j.realEndpoints.length !== 2) return j.point;
    const r0 = j.realEndpoints[0]!;
    const r1 = j.realEndpoints[1]!;
    if (r0.wallIdx === r1.wallIdx) return j.point;       // both ends of ONE wall — not a corner.
    const w0 = walls[r0.wallIdx]!;
    const w1 = walls[r1.wallIdx]!;
    const d0 = unit(sub(w0.end, w0.start));
    const d1 = unit(sub(w1.end, w1.start));
    // Near-parallel pair has no well-defined L crossing → keep the centroid.
    const sinTheta = Math.abs(d0.x * d1.z - d0.z * d1.x);
    if (sinTheta < PIVOT_REFINE_MIN_SIN) return j.point;
    const cross = intersectLines(w0.start, d0, w1.start, d1);
    if (!cross) return j.point;
    // Accept only a crossing within the near-junction band of the centroid — a shallow
    // corner can otherwise place the crossing far down the wall; never teleport the pivot.
    if (len(sub(cross, j.point)) > PIVOT_REFINE_BAND_M) return j.point;
    return cross;
}

/**
 * Apply the ring sweep to a junction: compute the shared corner between each
 * adjacent pair of wall-ends, and write it as `left` of curr and `right` of next
 * in the `WallMiter[]` accumulator. Passthrough walls are NOT modified (they pass
 * the junction straight); the corner becomes part of the abutting wall only.
 */
function applyRingSweep(j: JunctionDraft, walls: readonly WallInput[], miters: WallMiter[]): void {
    const entries = buildSweepEntries(j, walls);
    const n = entries.length;
    if (n < 2) return;

    // §RESI-PERIM-CORNER-PIVOT — the point the ring sweep mitres around. For a pure L
    // junction this is refined from the cluster centroid to the centreline crossing (the
    // legacy `sharedPt`) so V2 and legacy place a drifted external corner identically.
    const pivot: Pt2 = refineLJunctionPivot(j, walls);

    // Helper to mutate the accumulator entry for a wall (immutable shape: we
    // construct a new object each time we attach a corner, so order doesn't matter).
    const setCorner = (wallIdx: number, isStart: boolean, side: 'Left' | 'Right', p: Pt2): void => {
        const cur = miters[wallIdx] ?? { id: walls[wallIdx]!.id };
        const key = (isStart ? 'start' : 'end') + side as 'startLeft' | 'startRight' | 'endLeft' | 'endRight';
        miters[wallIdx] = { ...cur, [key]: p };
    };
    const setPivot = (wallIdx: number, isStart: boolean, p: Pt2): void => {
        const cur = miters[wallIdx] ?? { id: walls[wallIdx]!.id };
        const key = isStart ? 'startPivot' : 'endPivot';
        if (cur[key] === undefined) miters[wallIdx] = { ...cur, [key]: p };
    };

    // §WALL-BODY-INNER-FACE + §FIX-WALL-TJUNCTION-BUTT-2 — a real endpoint that abuts ANY
    // passthrough at this junction is a T-ATTACHER: it butts the host's side face and must
    // NOT carry a centreline pivot (that pivot is the arrow-spike tongue). Suppress the pivot
    // for EVERY real end here whenever the junction has ≥1 passthrough, independent of the
    // thickness ratio — the two near-face corners the sweep already produced make it a clean
    // flat butt. Junctions with NO passthrough (L / X / Y — co-terminating corners) keep the
    // shared centreline pivot exactly as before, so those tests are byte-unchanged.
    const junctionHasPassthrough = partitionInnerFaceV2Enabled() && j.passthroughWalls.length > 0;
    const suppressInnerFacePivot = (): boolean => junctionHasPassthrough;

    // Sweep each adjacent pair (wrap-around): curr's LEFT meets next's RIGHT.
    for (let i = 0; i < n; i++) {
        const curr = entries[i]!;
        const next = entries[(i + 1) % n]!;

        // LEFT-edge anchor / direction for `curr` (the wall extends FROM junction in
        // `curr.direction`, so the left edge is offset by halfT*leftPerp(direction)).
        const halfTc = curr.thickness * 0.5;
        const halfTn = next.thickness * 0.5;
        const leftAnchorCurr  = add(pivot, scale(leftPerp(curr.direction),  +halfTc));
        const rightAnchorNext = add(pivot, scale(leftPerp(next.direction),  -halfTn));

        // §V2-NEAR-PARALLEL-CAP (founder 2026-06-19) — skip the corner for a NEAR-parallel
        // pair (a collinear pass-through, or a shallow off-axis kink on a tilted plate).
        // `intersectLines` only rejects EXACTLY parallel (det < 1e-9); for a near-parallel
        // pair the two offset edge lines barely cross, so their intersection (the footprint
        // corner) shoots METRES out → the polygon spikes (the 239m/1275m V2 bodies
        // §V2-SPIKE-GUARD catches on the SECOND pass → legacy fallback → the founder's mixed-
        // pipeline miter gap on the outer walls). For such a pair the correct join IS a
        // square cap (the wall passes ~straight through), so skip the corner exactly like
        // the `corner === null` branch below. CRUCIAL: this tests the ANGLE between the wall
        // directions, NOT the corner distance — so EVERY genuine corner keeps its miter,
        // even an acute ~6° one (sin 6° ≈ 0.10 > 0.05). The earlier distance-threshold clamp
        // tripped at ~13° and wrongly square-capped acute corners (the flat-corner regression
        // the founder reported); the angle test is the precise near-parallel condition.
        {
            const _cl = Math.hypot(curr.direction.x, curr.direction.z) || 1;
            const _nl = Math.hypot(next.direction.x, next.direction.z) || 1;
            const _sinAngle = Math.abs(
                (curr.direction.x / _cl) * (next.direction.z / _nl) -
                (curr.direction.z / _cl) * (next.direction.x / _nl),
            );
            if (_sinAngle < 0.05) continue;   // ≈ < 3° between walls → square cap (pass-through), no spike
        }

        const corner = intersectLines(leftAnchorCurr, curr.direction, rightAnchorNext, next.direction);
        if (corner === null) continue;        // parallel — fall back to perpendicular cap (no corner attached)

        // Attach the corner. Passthrough walls' own footprint isn't modified — we
        // skip writing into them. Real endpoints get the corner on the side facing
        // the adjacent wall.
        if (!curr.isPassthrough) setCorner(curr.wallIdx, curr.isStart, 'Left',  corner);
        if (!next.isPassthrough) setCorner(next.wallIdx, next.isStart, 'Right', corner);
        // Pivot vertex at the junction centre (§RESI-PERIM-CORNER-PIVOT: the centreline
        // crossing for a pure L, else the cluster centroid). Each real-endpoint wall
        // pivots on it; pivots are deduplicated (first writer wins). §WALL-BODY-INNER-FACE
        // — a partition meeting a materially-thicker passthrough (shell) BODY does NOT get
        // the centreline pivot, so its footprint ends on the inner-face corners.
        if (!curr.isPassthrough && !suppressInnerFacePivot()) setPivot(curr.wallIdx, curr.isStart, pivot);
        if (!next.isPassthrough && !suppressInnerFacePivot()) setPivot(next.wallIdx, next.isStart, pivot);
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve all junctions for a set of walls on one level. Returns an array
 * INDEX-ALIGNED with the input `walls` — `result[i]` is the miter info for
 * `walls[i]` (with `id` always present). Walls not at any junction have no
 * corner fields, and the consumer falls back to square caps.
 *
 * The result is deterministic for a fixed input (clustering uses input order).
 */
export function resolveJunctions(
    walls: readonly WallInput[],
    opts: ResolveOptions = {},
): WallMiter[] {
    // §RESI-L0-CORNER-CLOSE — a caller-supplied epsilon ALWAYS wins (exact-input
    // callers / the detect unit test still pin 1 mm). Absent → the near-junction band
    // (`defaultJunctionBandM`, default 0.20 m; restore the legacy 1 mm with the escape
    // hatch). `LEGACY_TIGHT_M` documents the pre-fix value for callers that want it.
    const band = defaultJunctionBandM();
    const o: Required<ResolveOptions> = {
        snapEpsilonM: opts.snapEpsilonM ?? band,
        tProjectionEpsilonM: opts.tProjectionEpsilonM ?? band,
    };
    void LEGACY_TIGHT_M;
    const miters: WallMiter[] = walls.map(w => ({ id: w.id }));
    const junctions = detectJunctions(walls, o);

    // §FIX-WALL-CLUSTER-DEGENERATE (2026-07-02 — L-27 cluster case) — a wall whose BOTH
    // endpoints collapse into the SAME junction cluster is degenerate (shorter than the band).
    // STRIP it from every junction so the OTHER walls' ring sweep is the clean genuine-L /
    // genuine-N-way sweep (the stub no longer distorts their corners), and flag it `invalid`
    // so the consumer skips its mesh instead of extruding the bow-tie. Detect on the FINAL
    // junction set (post T-butt reclassification) — the doubling is the exact bow-tie trigger.
    // Pure detection — never relocates a baseline. Genuine multi-wall clusters never double a
    // member, so N-way full-length L/T/Y/X nodes are unaffected (no false positive).
    const degenerate = collectDegenerateClusterWalls(junctions);
    if (degenerate.size > 0) {
        for (const j of junctions) {
            j.realEndpoints = j.realEndpoints.filter(r => !degenerate.has(r.wallIdx));
            j.passthroughWalls = j.passthroughWalls.filter(wi => !degenerate.has(wi));
        }
    }

    for (const j of junctions) applyRingSweep(j, walls, miters);

    if (degenerate.size > 0) {
        for (const wi of degenerate) miters[wi] = { id: walls[wi]!.id, invalid: true };
    }
    return miters;
}

// ─── Internal exports for testing ─────────────────────────────────────────────

export const __internal = {
    intersectLines, projectOnSeg, leftPerp, unit, clusterEndpoints, detectJunctions, buildSweepEntries,
};
