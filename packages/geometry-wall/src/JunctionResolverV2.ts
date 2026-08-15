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

    /**
     * §MEASURED-EXACT-VERTEX-INCUMBENT (L-923, C83 §10.2.1, founder 2026-08-15) — the
     * creation-time record of INCUMBENCY, mirrored from `WallData.joinIntent` (L-251,
     * stamped at the single element-creation chokepoint, `CreateWallCommand.ts:415-444`).
     * `'butt'` at an endpoint means: **when this wall was created, a committed junction
     * already existed there** — so at that endpoint this wall is the NEWCOMER and every
     * other arm is an incumbent.
     *
     * WHY THIS FIELD AND NOT A GEOMETRIC TEST. C83 §10 keys the freeze on INCUMBENCY, and
     * the founder closed the type hatch explicitly ("NO MATTER the type of wall"). But
     * incumbency is not recoverable from the figure: an incumbent L plus a newcomer landing
     * on its vertex and three arms drawn as one fresh Y are the SAME three segments — the
     * dead-zone note below says so in as many words ("legitimate for a Y — but only because
     * there all three arms are being solved TOGETHER, FOR THE FIRST TIME"). The
     * disambiguating fact is historical and is knowable only at creation, which is exactly
     * why L-251 captured it there rather than re-deriving it on each resolve.
     *
     * OPTIONAL: absent on every wall ⇒ every consumer below is a strict no-op and V2 is
     * byte-identical to its pre-L-923 behaviour (the same contract `systemTypeId` carries).
     */
    readonly joinIntent?: { readonly start?: 'butt'; readonly end?: 'butt' };

    // ─── §FIX-WALL-ARC-LINEAR-MITRE (founder 2026-08-06) ─────────────────────────────
    // THE founder defect (#2): "CURVED WALLS JOINING LINEAR WALLS DON'T JOIN PROPERLY IN
    // MITRE" — a V-shaped notch / open wedge at the arc↔straight junction, overlapping
    // footprints, a gap on the inner face.
    //
    // ROOT CAUSE (measured): `WallInput` carried NO shape information, so V2 derived every
    // wall's heading from its CHORD (`unit(end − start)`). A curved wall's chord is NOT its
    // heading at the endpoint — for a quadratic-Bézier arc the heading is the TANGENT
    // (∝ control − start at t=0, ∝ end − control at t=1). Probe: an arc (0,0)→(4,0) with
    // control (2,3) has end-tangent (0.5547, −0.8321) but chord (1,0) — 56° apart. Joined to
    // a straight wall leaving (4,0) along +x, V2 compared the two CHORDS, found them
    // anti-parallel, tripped §V2-NEAR-PARALLEL-CAP and emitted NO corner at all — the straight
    // wall square-capped on the plane x=4 while the legacy `WallJoinResolver` (which DOES use
    // the tangent, §CURVED-DETECT-FIX / _wallDirAtJoin) cut the arc on the oblique plane
    // (0.8817,−0.4719). Two different cut planes at one corner ⇒ exactly the founder's wedge
    // on one face and overlap on the other.
    //
    // FIX: carry the per-endpoint unit TANGENT as OPTIONAL input. `WallPipelineV2` derives it
    // from the wall's Bézier control point; every other caller (and every pre-fix test) omits
    // it, in which case the chord is used and behaviour is byte-identical to before. V2 stays
    // PURE and shape-agnostic — it never learns what a "curve" is, it is simply told the
    // heading, which is the only thing the mitre maths ever needed.
    //
    // Orientation convention: BOTH are oriented FORWARD along the wall (start → end), exactly
    // like the chord they replace. The ring sweep negates `endDir` to get the direction AWAY
    // from an end-junction, precisely as it negates the chord today.
    /** Unit tangent at `start`, oriented start→end. Absent ⇒ chord. */
    readonly startDir?: Pt2;
    /** Unit tangent at `end`, oriented start→end. Absent ⇒ chord. */
    readonly endDir?: Pt2;
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

// ─── §CONNECT-3 — the RETAINED junction record (BIM30 deliverable §D-7 / §G Tier 2) ──
//
// The resolver has ALWAYS computed this. `JunctionDraft {point, realEndpoints,
// passthroughWalls}` is built by `detectJunctions`, consumed by `applyRingSweep`,
// and then went out of scope at the end of `resolveJunctions` — so "which walls
// connect to wall Y" was a RE-DETECTION (re-run the resolver) rather than a LOOKUP.
// (BIM30-EVOLUTION-AUDIT §3 Q4, §17.6.)
//
// These three types are the SAME NUMBERS the sweep already used, given a name and a
// lifetime. Nothing new is computed: `applyRingSweep` now RETURNS the record it built
// from its own `entries` + `pivot` instead of dropping them. That is deliberate — a
// record recomputed by a second pass could drift from the sweep that actually produced
// the geometry; a record returned BY the sweep cannot.
//
// HONESTY NOTE on identity: `id` is deterministic for a fixed input (detection order
// is input order), but it is NOT a persistent identity across edits — moving one wall
// can renumber the rest. Treat it as a within-solve handle, never as a stored key.

/** Ring-degree classification, using this module's own vocabulary (see the file header:
 *  "L (2-wall), T (3-wall with one passthrough), Y (3-wall radial), X (4-wall)").
 *  The degree counted is the number of SWEEP ENTRIES — i.e. wall DIRECTIONS meeting at
 *  the node — which is exactly what the sweep sees: a passthrough wall contributes two. */
export type WallJunctionType = 'L' | 'T' | 'Y' | 'X' | 'N-WAY';

export interface WallJunctionParticipant {
    readonly wallId: string;
    /** `endpoint` — the wall's start or end terminates AT this junction.
     *  `passthrough` — the wall's BODY crosses it (a T host). */
    readonly role: 'endpoint' | 'passthrough';
    /** For `endpoint` only: which end of the wall is at this junction. */
    readonly isStart?: boolean;
}

export interface WallJunctionRecord {
    /** Within-solve handle, `J<n>` in detection order. NOT a persistent identity. */
    readonly id: string;
    /** The point the ring sweep actually mitred around (post-§RESI-PERIM-CORNER-PIVOT
     *  refinement) — not the raw cluster centroid, so this is the geometry that was
     *  BUILT, not an approximation of it. */
    readonly point: Pt2;
    readonly type: WallJunctionType;
    /** Ring degree = number of sweep entries (passthrough counts twice). */
    readonly degree: number;
    /** Every participating wall-end / body, in sweep (CCW) order. */
    readonly participants: readonly WallJunctionParticipant[];
    /** Distinct participating wall ids, first-appearance order. The Q4 answer. */
    readonly wallIds: readonly string[];
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

// §NEAR-JUNCTION-DEAD-ZONE (founder 2026-08-07) — the DOUBLED-SOLID hole left by the
// §FIX-WALL-3RD-AT-LCORNER-IMMUTABLE (L-146) T-seat. See the block comment on the guard pass.
//
/** Escape hatch: set `__pryzmWallV2NearJunctionDeadZone = false` to restore the pre-fix
 *  single-host T-seat, where a near-corner newcomer is solved against ONE arm only and
 *  drives up to 7,548 mm² of DOUBLED SOLID through the arm it was not seated on. Default ON. */
function nearJunctionDeadZoneEnabled(): boolean {
    return (globalThis as { __pryzmWallV2NearJunctionDeadZone?: boolean })
        .__pryzmWallV2NearJunctionDeadZone !== false;
}

// §FIX-WALL-LCORNER-COLLINEAR-STEP (founder 2026-08-06) — the EXACTLY-ON-THE-VERTEX hole in
// the §FIX-WALL-3RD-AT-LCORNER-IMMUTABLE (L-146) guard. See the block comment on the guard
// pass in `detectJunctions`.
//
/** Escape hatch: set `__pryzmWallV2LCornerCollinearStep = false` to restore the pre-fix
 *  behaviour, where a third wall co-terminating EXACTLY on an existing L-corner vertex and
 *  COLLINEAR with one of its arms joins the ring sweep as a full member — dissolving the
 *  corner's outer mitre into an uncovered wedge and drawing a stray diagonal cap. Default ON. */
function lCornerCollinearStepEnabled(): boolean {
    return (globalThis as { __pryzmWallV2LCornerCollinearStep?: boolean })
        .__pryzmWallV2LCornerCollinearStep !== false;
}

/** |sin θ| below which two ring entries are treated as COLLINEAR, i.e. the ring sweep's
 *  §V2-NEAR-PARALLEL-CAP guard will skip their shared corner and leave the ring OPEN.
 *  Kept bit-identical to that guard's own threshold so the two can never disagree. */
const RING_COLLINEAR_SIN = 0.05;

/** Minimum half-thickness difference (m) that makes a collinear adjacent pair a genuine STEP.
 *  Below this the two members' facing offset edges are effectively COINCIDENT, the open ring
 *  closes flush anyway, and the pre-fix N-way solve already tiles cleanly → the pass is inert. */
const RING_STEP_EPS_M = 1e-4;

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

// ─── §FIX-WALL-ARC-LINEAR-MITRE — per-endpoint heading ────────────────────────
//
/** Escape hatch: set `__pryzmWallV2ArcTangent = false` to ignore the supplied per-endpoint
 *  tangents and fall back to the pre-fix CHORD heading everywhere (diagnostics only —
 *  this restores the founder's arc↔straight wedge). Default ON. */
function arcTangentJoinEnabled(): boolean {
    return (globalThis as { __pryzmWallV2ArcTangent?: boolean }).__pryzmWallV2ArcTangent !== false;
}

/**
 * §FIX-WALL-ARC-LINEAR-MITRE — the wall's unit heading AT one endpoint, oriented FORWARD
 * (start → end). Uses the caller-supplied tangent when present (a curved wall), else the
 * chord. A supplied tangent that is degenerate (zero-length / non-finite) is rejected in
 * favour of the chord, so bad input can never inject NaN into the sweep.
 */
function forwardDirAt(w: WallInput, isStart: boolean): Pt2 {
    const chord = unit(sub(w.end, w.start));
    if (!arcTangentJoinEnabled()) return chord;
    const t = isStart ? w.startDir : w.endDir;
    if (!t || !Number.isFinite(t.x) || !Number.isFinite(t.z)) return chord;
    const L = Math.hypot(t.x, t.z);
    if (!(L > 1e-9)) return chord;
    return { x: t.x / L, z: t.z / L };
}

/**
 * §FIX-WALL-ARC-LINEAR-MITRE — the unit heading pointing AWAY from the junction at this
 * endpoint, along the wall body. At `start` that is +forward; at `end` it is −forward.
 * For a straight wall this is byte-identical to the pre-fix `unit(end−start)` / `unit(start−end)`.
 */
function awayDirAt(w: WallInput, isStart: boolean): Pt2 {
    const f = forwardDirAt(w, isStart);
    return isStart ? f : { x: -f.x, z: -f.z };
}

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
            // ── §MEASURED-EXACT-VERTEX-INCUMBENT (L-923 / C83 §10.2.1, founder 2026-08-15) ──
            // THE HOLE THIS CLOSES, measured by L-919 and pinned MEASURED-OPEN in
            // `WallCreateOnHostBody.measure.test.ts`: when the newcomer lands EXACTLY on the
            // committed vertex it is tight WITH the corner arms, so it joined the corner group,
            // `newcomers` came out empty, and this guard fell through on "exact N-way Y — leave
            // as-is". The ring sweep then solved a fresh 3-way Y and moved BOTH committed arms by
            // 141.421 mm (= halfT × √2, the mitre-vertex diagonal) on 200 mm walls.
            //
            // The dead-zone note below already adjudicates this exact case and reaches the
            // opposite conclusion to the fall-through: the exact-vertex Y "MOVES BOTH COMMITTED
            // ARMS ... legitimate for a Y — but only because there all three arms are being solved
            // TOGETHER, FOR THE FIRST TIME. A near newcomer arriving at an ALREADY-COMMITTED
            // corner is a different problem." C83 §10.1 makes that binding and removes the
            // remaining discretion: the incumbents come out BYTE-IDENTICAL, and "a symmetric,
            // undistorted 3-way Y" is not an exemption — a moved arm is a moved arm.
            //
            // So: peel the DECLARED newcomers out of the tight groups BEFORE classifying, and the
            // whole existing machinery does the rest — the corner freezes and the guest takes the
            // barrier seat at the frozen vertex (arms as passthrough BARRIERS ⇒ byte-identical by
            // construction, not by assertion). Keyed on INCUMBENCY, never on type or thickness:
            // this fires for a SAME-type, SAME-thickness newcomer, which is the founder's case and
            // the one every type-keyed proxy (L-122/L-130) misses.
            //
            // INERT BY CONSTRUCTION when no wall carries the stamp: `tightGroupsForCorner` is then
            // the identical array, so every V2 caller that predates the field — and every existing
            // V2 test — is byte-identical. It cannot fire on a genuine first-time Y either, because
            // a first-time Y has no wall declaring it arrived onto a COMMITTED junction.
            const isDeclaredNewcomer = (r: EndpointRef): boolean => {
                const ji = walls[r.wallIdx]!.joinIntent;
                return (r.isStart ? ji?.start : ji?.end) === 'butt';
            };
            const anyDeclared = refs.some(isDeclaredNewcomer);
            const tightGroupsForCorner = anyDeclared
                ? tightGroups.map(g => g.filter(r => !isDeclaredNewcomer(r)))
                : tightGroups;
            // Require EXACTLY ONE tight group that forms a genuine corner; ambiguous clusters
            // (≥2 corner groups, or none) are left untouched.
            const cornerGroups = tightGroupsForCorner.filter(g => g.length >= 2 && formsCorner(g));
            if (cornerGroups.length !== 1) continue;
            const cornerRefs = cornerGroups[0]!;
            const cornerSet = new Set<EndpointRef>(cornerRefs);
            const newcomers = refs.filter(r => !cornerSet.has(r));
            if (newcomers.length === 0) continue;             // exact N-way Y (all tight) — leave as-is
            // ── §NEAR-JUNCTION-DEAD-ZONE (founder 2026-08-07) ─────────────────────────────
            // A newcomer joining a COMMITTED junction CONFORMS to it; it does not remodel it.
            //
            // THE DEFECT the plain single-host T-seat below leaves behind. Seating the newcomer
            // against the MOST-PERPENDICULAR arm solves it against ONE arm only. Near a corner the
            // newcomer is inside the solid of BOTH arms, so the arm it was NOT seated on never
            // clips it: measured 7,548 mm² of DOUBLED SOLID (walls A/B 300 mm at the origin, a
            // 200 mm newcomer at 45°, start 20 mm off the vertex). The dead zone runs from the
            // vertex out to the host half-thickness — 452 mm² still doubled at 115 mm.
            //
            // WHY NOT THE EXACT-VERTEX Y. The obvious construction — admit the newcomer and sweep
            // all three arms about the frozen vertex — measures a perfect partition (0 mm² doubled,
            // 0 mm² uncovered) but MOVES BOTH COMMITTED ARMS (measured: A loses 10,748 mm², B loses
            // 10,468 mm² as their inner mitre re-targets the newcomer). That is legitimate for a
            // Y — but only because there all three arms are being solved TOGETHER, FOR THE FIRST
            // TIME. A near newcomer arriving at an ALREADY-COMMITTED corner is a different problem:
            // the corner is authored history and the guest is the only party with freedom left.
            // Resolving the two with the same construction was the category error. (It would also
            // contradict the byte-identical lock in junctionResolverV2.thirdAtLCornerImmutable.)
            //
            // THE CONSTRUCTION. Seat the newcomer at the FROZEN CORNER VERTEX and enter EVERY
            // frozen arm as a PASSTHROUGH BARRIER. Barriers take part in the angular ring and
            // clip the guest, but the sweep NEVER writes into a passthrough's own footprint — so
            // the committed arms are byte-identical BY CONSTRUCTION, not by assertion, while the
            // guest is clipped by whichever arm face it actually meets. No tolerance, no epsilon,
            // no nudge: the clip is the exact half-plane of each arm's offset face-line, and both
            // arm centrelines pass through the vertex, so the barriers are anchored correctly.
            // The junction carries a passthrough, so §WALL-BODY-INNER-FACE already suppresses the
            // guest's centreline pivot — a clean flat butt with no arrow-spike tongue.
            //
            // APPLICABILITY GATE (geometric, not tolerance-based). A passthrough contributes TWO
            // barrier directions — the arm's body AND its mirror, which past a wall END is
            // fictitious solid. That is harmless only while the guest's angular neighbours are
            // the two REAL arm bodies, i.e. while the guest points INTO the convex sector the
            // corner encloses. Outside that sector (a guest heading into the reflex quadrant) a
            // fictitious mirror would become adjacent and clip against solid that is not there,
            // so we fall back to the single-host T-seat unchanged. Restricted to 2-arm corners:
            // an N-way frozen corner has no single convex sector and keeps the existing seat.
            //
            // RELATION TO §FIX-WALL-PREVIEW-COMMIT-LENGTH-LOCK: that fix is the CAUSE fix — the
            // plan tool now commits the point the preview drew, so a wall aimed at a corner lands
            // ON it and far fewer walls enter this band at all. This clip is the BACKSTOP for the
            // ones that still do (free placement, imported/generated geometry, drifted shells).
            const cornerArmIdx = [...new Set(cornerRefs.map(r => r.wallIdx))];
            // The vertex the frozen corner actually mitres about: the crossing of the two arm
            // centrelines (what `refineLJunctionPivot` pins for the arms-only junction), falling
            // back to the tight group's centroid when the arms are parallel/degenerate.
            const cornerVertex: Pt2 = (() => {
                const c = centroid(cornerRefs.map(r => posOf(r)));
                if (cornerArmIdx.length !== 2) return c;
                const [i0, i1] = cornerArmIdx as [number, number];
                const w0 = walls[i0]!, w1 = walls[i1]!;
                const d0 = unit(sub(w0.end, w0.start)), d1 = unit(sub(w1.end, w1.start));
                if (Math.abs(d0.x * d1.z - d0.z * d1.x) < PIVOT_REFINE_MIN_SIN) return c;
                const x = intersectLines(w0.start, d0, w1.start, d1);
                return x ?? c;
            })();
            /** Is `d` strictly inside the convex sector spanned by the two arms' away-dirs? */
            const inConvexSector = (d: Pt2): boolean => {
                if (cornerArmIdx.length !== 2) return false;
                const arms = cornerRefs
                    .filter((r, k) => cornerRefs.findIndex(q => q.wallIdx === r.wallIdx) === k)
                    .map(r => awayDir(r));
                if (arms.length !== 2) return false;
                const [a, b] = arms as [Pt2, Pt2];
                const crossAB = a.x * b.z - a.z * b.x;
                if (crossAB === 0) return false;                 // collinear arms: no sector
                // ADR-0299 §RECOVERY-MUST-REFUSE — REFUSE the barrier seat where the clip cannot
                // be well-posed rather than emitting a sliver. A guest NEAR-COLLINEAR with an arm
                // has offset face-lines that are near-parallel to that arm's: §V2-NEAR-PARALLEL-CAP
                // skips the pair, the ring never closes on that side, and the guest would come back
                // asymmetrically capped (the stray-diagonal shape §FIX-WALL-LCORNER-COLLINEAR-STEP
                // documents). That configuration falls back to the single-host T-seat, which is
                // well-posed there. Reuses the sibling block's ring-collinearity constant — the
                // same threshold the sweep itself uses to decide a pair yields no corner, not a
                // new tolerance invented here.
                for (const arm of [a, b]) {
                    if (Math.abs(arm.x * d.z - arm.z * d.x) < RING_COLLINEAR_SIN) return false;
                }
                const sA = Math.sign(a.x * d.z - a.z * d.x);
                const sB = Math.sign(d.x * b.z - d.z * b.x);
                const s  = Math.sign(crossAB);
                return sA === s && sB === s;                      // strictly between a and b
            };
            // Seat each near newcomer. NEVER moves a baseline — detection frame only.
            for (const G of newcomers) {
                const eG = posOf(G);
                const dG = awayDir(G);
                if (nearJunctionDeadZoneEnabled() && inConvexSector(dG)) {
                    extra.push({ point: cornerVertex, realEndpoints: [G], passthroughWalls: cornerArmIdx });
                    continue;
                }
                // Fallback: the original single-host T-seat against the most-perpendicular arm
                // (a collinear arm would give a degenerate parallel butt). Foot on the host segment.
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

    // §FIX-WALL-LCORNER-COLLINEAR-STEP (founder 2026-08-06) — a THIRD wall co-terminating
    // EXACTLY on an existing L-corner vertex, COLLINEAR with one of the two arms.
    //
    // THE founder defect (recurring, HIGH-visibility — his screenshot): two THICK walls A and
    // B meet in a clean mitred L at a shared corner vertex. A THIN wall C arrives from the
    // opposite side — collinear with arm A — and terminates at that SAME vertex (the normal
    // result of snapping the new wall's endpoint to the corner). The junction then renders a
    // stray DIAGONAL / triangular sliver across the outer corner, the thin wall fails to butt
    // cleanly on the thick wall's face, and the corner reads as OVERLAPPING OUTLINES instead
    // of one welded solid.
    //
    // ROOT CAUSE (reproduced at footprint level). C is admitted to the ring sweep as a full
    // member, so A and B stop mitring against EACH OTHER and instead mitre against the THIN
    // newcomer's offset edges. Because C is collinear with A, their two facing offset edge-
    // lines are PARALLEL and separated by (halfT_A − halfT_C) — they have NO intersection, so
    // §V2-NEAR-PARALLEL-CAP skips that adjacent pair and the angular ring never CLOSES. Both
    // A and B consequently retract their outer mitre corner all the way back to the junction
    // centre, and the L's outer corner square is left with an UNCOVERED wedge of
    // (halfT_A − halfT_C) × halfT_B (measured: 0.015 m² for 300/100 mm walls). C's own cap is
    // mitred against B on one side but square-capped at the centreline on the collinear side —
    // that asymmetric cap IS the stray diagonal.
    //
    // Why the existing guards miss it: §FIX-WALL-3RD-AT-LCORNER-IMMUTABLE (L-146) freezes the
    // corner only when the newcomer is measurably OFF the shared vertex (> 1 mm), on the
    // premise that an exactly-coincident newcomer is "the sound symmetric 3-way Y". That
    // premise holds only when the ring CLOSES; it is false for a collinear pair with a
    // thickness step, which is precisely the common thin-partition-into-thick-corner case.
    // §FIX-WALL-LCORNER-T-CLEAN (L-61) does not apply either: C co-terminates at the vertex,
    // so its foot CLAMPS to the arm's end (not strictly interior) → it is not a tee-attacher.
    //
    // THE INVARIANT. A co-terminating cluster is a well-posed N-way corner only when EVERY
    // adjacent pair in its angular ring yields a shared corner. When an adjacent pair is
    // COLLINEAR and its members have DIFFERENT thicknesses, the ring is OPEN and the sweep's
    // result is not a corner at all. The THINNER member of such a pair is not a corner arm —
    // it is a butt-attacher. EXTRACT it into its OWN T-junction against the most-perpendicular
    // remaining member (the identical seat L-130 / L-146 already use), so the surviving ring
    // closes and resolves BYTE-IDENTICALLY to the corner with no newcomer present (C11: creating
    // an element must not mutate existing ones), while the newcomer butts FLAT on the face it
    // meets. Repeated until the ring closes or fewer than 3 members remain.
    //
    // Guards keeping it inert everywhere it must be: EQUAL-thickness collinear members have no
    // step (their offset edges are coincident, the open ring closes flush) → no-op, byte-
    // identical; a genuine 45°/Y/X cluster has NO collinear adjacent pair → no-op; a 2-member
    // cluster (a plain L, or a genuine collinear pass-through of two walls) is never touched;
    // clusters carrying a passthrough are left to the T machinery. DETECTION-FRAME ONLY: it
    // splits a cluster and points the new junction at a foot on the host body — it NEVER
    // relocates a centreline baseline, so the reverted §CLAMP-COSHARE-WELD / ADR-0072 P3c-b
    // doubling regression mode is unreachable. Pure + deterministic; runs AFTER L-61/L-130/L-146
    // so genuine interior tees and off-vertex newcomers are already peeled.
    if (lCornerCollinearStepEnabled()) {
        const extra: JunctionDraft[] = [];
        const posOf = (r: EndpointRef): Pt2 => (r.isStart ? walls[r.wallIdx]!.start : walls[r.wallIdx]!.end);
        const awayDir = (r: EndpointRef): Pt2 => {
            const w = walls[r.wallIdx]!;
            return unit(r.isStart ? sub(w.end, w.start) : sub(w.start, w.end));
        };
        for (const j of drafts) {
            if (j.passthroughWalls.length !== 0) continue;    // pure co-terminating clusters only
            // Bounded: each iteration removes exactly one member, and we stop at 3.
            for (let guard = 0; guard < walls.length + 1; guard++) {
                if (j.realEndpoints.length < 3) break;        // removing one must leave a real corner
                // Rebuild the angular ring exactly as `buildSweepEntries` will.
                const ring = j.realEndpoints
                    .map(r => ({ r, dir: awayDir(r) }))
                    .map(e => ({ ...e, angle: Math.atan2(e.dir.z, e.dir.x) }))
                    .sort((a, b) => (a.angle - b.angle) || (a.r.wallIdx - b.r.wallIdx));
                // Find an adjacent COLLINEAR pair (wrap-around) whose thicknesses STEP.
                let victim: EndpointRef | null = null;
                for (let i = 0; i < ring.length; i++) {
                    const curr = ring[i]!;
                    const next = ring[(i + 1) % ring.length]!;
                    if (curr.r.wallIdx === next.r.wallIdx) continue;
                    const sinAngle = Math.abs(curr.dir.x * next.dir.z - curr.dir.z * next.dir.x);
                    if (sinAngle >= RING_COLLINEAR_SIN) continue;         // pair yields a real corner
                    const hCurr = walls[curr.r.wallIdx]!.thickness * 0.5;
                    const hNext = walls[next.r.wallIdx]!.thickness * 0.5;
                    if (Math.abs(hCurr - hNext) <= RING_STEP_EPS_M) continue;   // no step → closes flush
                    // The THINNER member butts onto the thicker run — it is not a corner arm.
                    victim = hCurr < hNext ? curr.r : next.r;
                    break;
                }
                if (!victim) break;                                       // ring closes — done
                // Seat the victim as its OWN T-junction on the most-PERPENDICULAR remaining
                // member (a collinear host would give a degenerate parallel butt). Same seat as
                // §FIX-WALL-V2-EXISTING-CORNER-IMMUTABLE / §FIX-WALL-3RD-AT-LCORNER-IMMUTABLE.
                const eG = posOf(victim);
                const dG = awayDir(victim);
                let hostIdx = -1;
                let bestAbsDot = Infinity;
                for (const H of j.realEndpoints) {
                    if (H.wallIdx === victim.wallIdx) continue;
                    const dH = unit(sub(walls[H.wallIdx]!.end, walls[H.wallIdx]!.start));
                    const ad = Math.abs(dot(dG, dH));
                    if (ad >= 0.94) continue;                             // near-collinear → not a seat
                    // Deterministic tie-break on wallIdx so input order cannot change the result.
                    if (ad < bestAbsDot - 1e-12 || (Math.abs(ad - bestAbsDot) <= 1e-12 && hostIdx >= 0 && H.wallIdx < hostIdx)) {
                        bestAbsDot = ad;
                        hostIdx = H.wallIdx;
                    }
                }
                if (hostIdx < 0) break;                                   // no perpendicular seat — leave as-is
                const host = walls[hostIdx]!;
                const foot = projectOnSeg(eG, host.start, host.end).foot;
                extra.push({ point: foot, realEndpoints: [victim], passthroughWalls: [hostIdx] });
                j.realEndpoints = j.realEndpoints.filter(r => r !== victim);
            }
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
 * cluster when BOTH its endpoints are members of the SAME RAW endpoint cluster: the wall is
 * shorter than the cluster band, so both ends snapped to one node (it shows up in the cluster
 * TWICE). Left in the ring sweep it hinges both ends on the one pivot → a bow-tie /
 * negative-area (inverted-normal) footprint = the founder's "black triangular spike" at an
 * L-corner that also receives a tiny stub (the WallJoinResolver multi-cluster degenerate-wall
 * bug, in the V2 footprint path). Returns the set of such wall indices.
 *
 * DETECTS ON THE RAW `clusterEndpoints` OUTPUT, not the post-`detectJunctions` drafts. The
 * detection guard passes (T-projection / §FIX-WALL-3RD-AT-LCORNER) can SPLIT a fused stub —
 * they re-point one of its two ends onto a neighbouring body as a separate T-junction — so by
 * the time the drafts are final the stub no longer appears twice in ONE junction, and a
 * post-draft doubling test misses it (both ends now live in two DIFFERENT junctions). The raw
 * cluster is the frame in which the degeneracy is actually true and is immune to that split.
 *
 * This is the PRECISE degeneracy signature — a genuine wall contributes exactly ONE endpoint
 * to any raw cluster (its start OR its end; the other end is band-lengths away, in a DIFFERENT
 * cluster), so a full-length L/T/Y/X node of real walls never doubles a member (no false
 * positive). It is more precise than the legacy length threshold (`DEGENERATE_STUB_LENGTH`
 * 0.15 m): a 0.158 m stub that doubles into one 0.20 m-band cluster is caught here even though
 * it clears the length gate. Pure; deterministic.
 */
function collectDegenerateClusterWalls(clusters: readonly (readonly EndpointRef[])[]): Set<number> {
    const degen = new Set<number>();
    for (const c of clusters) {
        const seen = new Map<number, number>();
        for (const r of c) seen.set(r.wallIdx, (seen.get(r.wallIdx) ?? 0) + 1);
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
        // §FIX-WALL-ARC-LINEAR-MITRE — for a CURVED wall this is the arc TANGENT at this
        // endpoint, not the chord. A mitre is a cut plane against the wall's actual heading
        // where it meets its neighbour; the chord is the heading only for a straight wall.
        // Straight walls carry no tangent and resolve to the identical chord as before.
        const dir = awayDirAt(w, r.isStart);
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
    // §FIX-WALL-ARC-LINEAR-MITRE — the "centreline crossing" the legacy resolver trims to is
    // the crossing of the two walls' HEADING LINES at the join (legacy `_intersect2D` is fed
    // the TANGENT line through the joining endpoint for a curved wall — see
    // WallJoinResolver §CURVED-DETECT-FIX ~:2019). Anchor each line at its own JOINING
    // endpoint and aim it along that endpoint's forward heading. For a straight wall the
    // line through `start` along the chord and the line through the joining endpoint along
    // the chord are the SAME line, so this is a strict no-op for every straight pair.
    const a0 = r0.isStart ? w0.start : w0.end;
    const a1 = r1.isStart ? w1.start : w1.end;
    const d0 = forwardDirAt(w0, r0.isStart);
    const d1 = forwardDirAt(w1, r1.isStart);
    // Near-parallel pair has no well-defined L crossing → keep the centroid.
    const sinTheta = Math.abs(d0.x * d1.z - d0.z * d1.x);
    if (sinTheta < PIVOT_REFINE_MIN_SIN) return j.point;
    const cross = intersectLines(a0, d0, a1, d1);
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
function applyRingSweep(
    j: JunctionDraft,
    walls: readonly WallInput[],
    miters: WallMiter[],
    // §CONNECT-3 — the retained record's within-solve handle. Passing it in (rather than
    // letting the caller stamp it afterwards) keeps id assignment in one place.
    recordId: string,
): WallJunctionRecord | null {
    const entries = buildSweepEntries(j, walls);
    const n = entries.length;
    // n < 2 is a free wall end, not a junction: the sweep does nothing and no record exists.
    // Returning null here (rather than an empty record) is what keeps "no junction" and
    // "junction with no participants" from collapsing into the same value downstream.
    if (n < 2) return null;

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

    // ── §CONNECT-3 — RETAIN the record instead of dropping it ────────────────────
    // Everything below reads `entries` and `pivot`, both already computed above for the
    // mitre. No geometry is recomputed and no wall is touched; this is purely the
    // lifetime extension the audit asked for (§3 "extension of an existing computation's
    // lifetime, not new architecture").
    //
    // A passthrough wall appears TWICE in `entries` (one entry per body direction) — that
    // duplication is what makes the ring sweep uniform across L/T/Y/X. It is CORRECT for
    // `degree` (two directions really do meet here) and WRONG for `wallIds` (one wall),
    // so the two are derived differently on purpose.
    const participants: WallJunctionParticipant[] = [];
    const wallIds: string[] = [];
    const seenWall = new Set<string>();
    const seenPassthrough = new Set<number>();
    for (const e of entries) {
        const wid = walls[e.wallIdx]!.id;
        if (e.isPassthrough) {
            // Collapse the twin direction-entries into ONE participant.
            if (!seenPassthrough.has(e.wallIdx)) {
                seenPassthrough.add(e.wallIdx);
                participants.push({ wallId: wid, role: 'passthrough' });
            }
        } else {
            participants.push({ wallId: wid, role: 'endpoint', isStart: e.isStart });
        }
        if (!seenWall.has(wid)) { seenWall.add(wid); wallIds.push(wid); }
    }

    const passthroughCount = seenPassthrough.size;
    const type: WallJunctionType =
        n === 2 ? 'L'
      : n === 3 ? (passthroughCount > 0 ? 'T' : 'Y')
      : n === 4 ? 'X'
      : 'N-WAY';

    return { id: recordId, point: pivot, type, degree: n, participants, wallIds };
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
    return resolveJunctionsWithRecords(walls, opts).miters;
}

/**
 * §CONNECT-3 — the SAME solve as {@link resolveJunctions}, additionally returning the
 * L/T/Y/X junction records the ring sweep built on its way to the miters.
 *
 * `resolveJunctions` is now a one-line projection of this function, so the two can never
 * disagree and every existing caller (≈130 sites, all of the wall test suite, and
 * `WallPipelineV2Cache.refresh`) keeps a byte-identical result and an unchanged signature.
 *
 * `junctions` contains one entry per node where ≥2 wall-directions meet, in detection
 * order. A wall with no junction simply never appears in any record — see
 * `WallPipelineV2Cache.junctionsFor` for the lookup that distinguishes that from an
 * unknown wall id.
 */
export function resolveJunctionsWithRecords(
    walls: readonly WallInput[],
    opts: ResolveOptions = {},
): { miters: WallMiter[]; junctions: WallJunctionRecord[] } {
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
    // endpoints collapse into the SAME endpoint cluster is degenerate (shorter than the band).
    // STRIP it from every junction so the OTHER walls' ring sweep is the clean genuine-L /
    // genuine-N-way sweep (the stub no longer distorts their corners), and flag it `invalid`
    // so the consumer skips its mesh instead of extruding the bow-tie. Detect on the RAW
    // clusters (NOT the post-`detectJunctions` drafts): a guard pass can re-point one stub end
    // onto a neighbour body as its own T-junction, splitting the doubling across two drafts and
    // hiding it from a post-draft test. The raw cluster is where the degeneracy is actually
    // true and is immune to that split. Pure detection — never relocates a baseline. Genuine
    // multi-wall clusters never double a member, so N-way full-length L/T/Y/X nodes are
    // unaffected (no false positive).
    const rawClusters = clusterEndpoints(walls, o.snapEpsilonM);
    const degenerate = collectDegenerateClusterWalls(rawClusters);
    if (degenerate.size > 0) {
        for (const j of junctions) {
            j.realEndpoints = j.realEndpoints.filter(r => !degenerate.has(r.wallIdx));
            j.passthroughWalls = j.passthroughWalls.filter(wi => !degenerate.has(wi));
        }
    }

    // §CONNECT-3 — collect the records the sweep returns. The sweep is unchanged in what
    // it WRITES; it merely also hands back what it already knew.
    const records: WallJunctionRecord[] = [];
    for (const j of junctions) {
        const rec = applyRingSweep(j, walls, miters, `J${records.length}`);
        if (rec) records.push(rec);
    }

    if (degenerate.size > 0) {
        for (const wi of degenerate) miters[wi] = { id: walls[wi]!.id, invalid: true };
    }
    return { miters, junctions: records };
}

// ─── Internal exports for testing ─────────────────────────────────────────────

export const __internal = {
    intersectLines, projectOnSeg, leftPerp, unit, clusterEndpoints, detectJunctions, buildSweepEntries,
};
