/**
 * OpenedRegionDetector — §OPENED-REGION (L-880, 2026-08-14)
 *
 * ## The question this module answers
 *
 * The founder moved a perimeter wall. Everything that landed that morning behaved:
 * the floor followed (`§C79-5.2 resized: 195.510 m² → 134.192 m²`), `§GR12-BOUNDARY-
 * INVALIDATION` marked the affected rooms undetermined, `§MOVE-REWELD-DISPATCH`
 * re-welded the junctions. And then the move left **a region that used to be a room
 * standing open on one side**, and PRYZM said nothing.
 *
 * ## WHY THE EXISTING SIGNALS DO NOT ANSWER IT — measured, not assumed
 *
 * Three candidate signals existed. All three were checked against the founder's log
 * before a line of this file was written, and **none of them is this signal**:
 *
 * 1. **`unresolvedLoopBreaks` (RoomDetectionEngine.`_diagRoomLoop`, §DIAG-ROOM-LOOP)
 *    read 0 — CORRECTLY.** That counter is not a general "the loop did not close"
 *    metric. Read the predicate: it counts a *guest endpoint that projects onto
 *    another wall's mid-span* (`0.01 < t < 0.99`) at a centreline distance that is
 *    **both** greater than that host's snap radius **and `< 1.0` m**. It is a
 *    thick-shell T-junction *clamp* diagnostic with a one-metre ceiling. A perimeter
 *    wall that moves far enough to shed 61 m² of floor leaves the partition endpoints
 *    projecting onto nothing at all — `t` falls outside the body span, or the distance
 *    exceeds the 1 m ceiling. So the detector did not classify this as a loop break,
 *    and it was right not to: **the region simply stopped being a room.** Detection
 *    therefore cannot live inside that diagnostic — it has to live where rooms are
 *    compared BEFORE and AFTER a re-derivation, which is this module.
 *
 * 2. **`RoomBoundaryBuilder`'s "Compliance overlay: 1 error room(s) tracked"** is the
 *    ConstraintEngine channel — `_complianceStatus` is populated ONLY from
 *    `pryzm-constraints-updated` results (`ROOM_MIN_AREA`, `ROOM_NEEDS_DOOR`,
 *    `HABITABLE_NEEDS_WINDOW`, …), keyed by room id. It is a *downstream symptom*
 *    channel (L-862), not a boundary-topology channel. It cannot name a missing edge.
 *
 * 3. **`getBoundingWalls` / the `boundedBy` undetermined mark (§GR12, Lane K)** is the
 *    graph half and it is genuinely the right *state*: after the move the room is
 *    `boundary-undetermined-after-element-move`, and a room that never comes back from
 *    the detection pass never gets the fresh `boundedBy` write that clears it. But the
 *    graph holds a *mark*, not a *geometry*: it can say "I do not know this room's
 *    boundary any more", and it cannot say **where the missing edge is**. The founder
 *    asked for a wall "in the expected space". That needs the polygon, which is here.
 *
 * ## WHAT THIS MODULE DOES
 *
 * A pure, THREE-free, DOM-free, store-free comparison of the room set BEFORE a
 * re-detection against the room set AFTER it, plus the walls that survive:
 *
 *   · **merged**   — two or more before-rooms now fall inside ONE after-room. The
 *                    boundary between them stopped existing.
 *   · **vanished** — a before-room falls inside NO after-room. The region stopped
 *                    closing altogether.
 *
 * Either way the proposal is computed from the region's OWN former perimeter: the
 * perimeter is sampled, every sample is tested against the surviving walls, and the
 * longest contiguous run of *unwalled* samples is the gap. That is not a guess about
 * where a wall "should" go — it is the stretch of boundary the region already had and
 * no longer has, at the coordinates it already occupied.
 *
 * ## WHAT IT REFUSES TO PROPOSE (C71 §4.4 — refusal beats a confident wrong answer)
 *
 * A finding is emitted either way, but `kind: 'position-unknown'` carries a named
 * reason instead of a segment when the position is not defensible:
 *
 *   · `no-unwalled-edge`        — the region stopped being a room and yet every metre
 *                                 of its former perimeter still has a wall on it. The
 *                                 cause is something other than a missing edge; this
 *                                 module will not invent one.
 *   · `gap-dominates-perimeter` — more than half the former perimeter is unwalled. The
 *                                 region was not *opened*, it was *demolished*; one
 *                                 wall does not restore it.
 *   · `multiple-disjoint-gaps`  — two or more significant unwalled runs. Which one the
 *                                 user meant is genuinely unknown, and picking the
 *                                 longest would be a coin-flip presented as a decision.
 *   · `gap-turns-corner`        — the single run bends. One straight wall cannot close
 *                                 it, and a straight wall drawn across the chord would
 *                                 be a *different* room, not the one that was lost.
 *
 * ## SILENCE IS A FEATURE
 *
 * A wall move that grows a room (the room follows the wall, ring intact) produces ONE
 * before-room and ONE after-room that mutually contain each other — no merge, no
 * vanish, no finding. A system that cries wolf gets muted, which is strictly worse
 * than saying nothing.
 */

import type { RoomVertex } from './RoomTypes';
import { polygonAreaM2, pointInPolygon } from './RoomPolygonUtils';

// ── Tunables, each with the reason it has the value it has ───────────────────
//
// §C73-EPSILON-POLICY — NONE of these is a tolerance in the policy module's sense,
// and two of them were originally MIS-NAMED as one. See the note above
// `WALL_COVER_BAND_M` for the classification and the migration that was declined.

/**
 * Extra clearance added to a wall's half-thickness when asking "is this point on a
 * wall?". Room polygons are traced along wall INNER faces, so a perimeter sample sits
 * ≈ thickness/2 from the wall centreline by construction; this absorbs the join-trim
 * and corner-snap slop on top of that.
 *
 * §C73-EPSILON-POLICY — **a DOMAIN BAND, not a tolerance**, and named accordingly.
 *
 * It was first written with a `_TOL_M` suffix, which `check-epsilon-policy` counted as
 * a rival tolerance declaration (E2 258 → 260, exit [3]) hours after another lane had
 * drained that ratchet 382 → 357. The name was the error, not the value:
 *
 *   · **Migration onto `COINCIDENT_M` (0.001 m) was considered and DECLINED.** That
 *     role answers "are these two model points THE SAME POINT?" at 1 mm. This asks
 *     "does this stretch of former boundary still have a wall along it?" at 150 mm —
 *     a coverage question, not an identity one. Consuming `COINCIDENT_M` here would
 *     TIGHTEN the band 150×, so `coveredByWall` would answer false almost everywhere,
 *     every room would read as fully unwalled, and the detector would fire constantly.
 *     C73 §2.5 forbids widening a declared tolerance; silently narrowing a call site
 *     by two orders of magnitude is the same class of harm in the other direction.
 *   · `EPSILON_ZERO` / `RECOMPUTE_IDENTITY_M` (1e-9) and `PARALLEL_RAD` (radians) are
 *     not this question at all. **No declared role fits.**
 *
 * `tolerance.ts`'s own header settles the disposition: *"Domain bands are not epsilons:
 * `defaultJunctionBandM` (0.20 m wall-junction band) and `CENTROID_MATCH_RADIUS` (2.0 m
 * room-identity radius) are correct where they are, under their own owners"*, and
 * *"domain bands stay under their own domain owner — do NOT fold them onto
 * `COINCIDENT_M`; only true 'same point' tests migrate"* (C73 §2.1). Note that BOTH
 * blessed exemplars carry band/radius names rather than `TOL`/`EPS` ones. This constant
 * is the same kind of thing as `defaultJunctionBandM`, at a comparable magnitude, and
 * now says so. The value is unchanged and no behaviour moves.
 */
const WALL_COVER_BAND_M = 0.15;
/** Half-thickness assumed for a wall that reports none. The repo's plain-wall default. */
const DEFAULT_WALL_THICKNESS_M = 0.20;
/** Perimeter sampling pitch. Fine enough to localise a gap to ~1 door-leaf. */
const PERIMETER_SAMPLE_PITCH_M = 0.25;
/** Hard cap so a pathological ring cannot make this loop unbounded. */
const MAX_PERIMETER_SAMPLES = 600;
/**
 * An unwalled run shorter than this is noise (a trimmed corner, a curved-wall facet),
 * not a missing wall. Narrower than any door leaf, so a real opening still registers.
 */
const MIN_SIGNIFICANT_GAP_M = 0.40;
/** Above this fraction of the perimeter the region was demolished, not opened. */
const MAX_GAP_FRACTION_OF_PERIMETER = 0.5;
/**
 * A run whose samples deviate further than this from its own chord bends.
 *
 * §C73-EPSILON-POLICY — **a DOMAIN BAND, not a tolerance** (same disposition and the
 * same declined migration as `WALL_COVER_BAND_M` above; it too originally carried a
 * `_TOL_M` suffix). It classifies a SHAPE — "is this stretch straight enough
 * for one wall to close it, or does it turn a corner?" — at architectural scale. It is
 * not an identity test, and at 150 mm it is 150× `COINCIDENT_M`; migrating it would
 * make every real gap read as bent and turn every offer into a `gap-turns-corner`
 * refusal. Value unchanged.
 */
const GAP_STRAIGHTNESS_MAX_DEVIATION_M = 0.15;
/** Interior-sample grid resolution per axis when testing region containment. */
/**
 * §WD32-EXTEND-BEFORE-CREATE (L-10810) — how nearly parallel an existing wall
 * must be to the proposed gap before extending it counts as the same line.
 *
 * 2° is deliberately TIGHT. This predicate only ever SUPPRESSES a proposal, so a
 * false positive costs the user a wall he wanted; a false negative costs nothing
 * he does not already have. At 2° a 7 m gap admits ~244 mm of lateral drift over
 * its length, which the perpendicular test below bounds independently and far
 * more tightly. Both must hold.
 */
const COLLINEAR_MAX_ANGLE_RAD = 0.035;  // ~2°

/**
 * …and how far off that wall's own infinite line the gap may sit. One wall
 * thickness: inside that band the extended wall's BODY would cover the gap, so
 * "extend it" is a true statement about the geometry and not merely about the
 * centrelines.
 */
const COLLINEAR_MAX_OFFSET_M = DEFAULT_WALL_THICKNESS_M;

const CONTAINMENT_GRID = 9;
/** Fraction of a region's interior samples that must land inside a candidate successor. */
const CONTAINMENT_MIN_FRACTION = 0.7;
/**
 * A sample must be at least this far inside the merged room's own boundary to count as
 * "interior to it" — otherwise the region's former perimeter, where it coincides with
 * the merged room's perimeter, would read as a vanished interior boundary.
 */
const INTERIOR_MARGIN_M = 0.20;

// ── Inputs ───────────────────────────────────────────────────────────────────

/** A room as it stood at one instant: durable id, name for the message, polygon. */
export interface RegionSnapshot {
    readonly id: string;
    readonly name?: string;
    /** Closed ring in world XZ. Last vertex implicitly connects to the first. */
    readonly polygon: readonly RoomVertex[];
}

/** A wall as it stands AFTER the move — the evidence for "is this stretch walled?". */
export interface SurvivingWall {
    readonly id: string;
    readonly start: RoomVertex;
    readonly end: RoomVertex;
    readonly thickness?: number;
    readonly height?: number;
    readonly systemTypeId?: string;
}

export interface OpenedRegionScanInput {
    readonly levelId: string;
    readonly roomsBefore: readonly RegionSnapshot[];
    readonly roomsAfter: readonly RegionSnapshot[];
    readonly wallsAfter: readonly SurvivingWall[];
}

// ── Outputs ──────────────────────────────────────────────────────────────────

export type OpenedRegionCause = 'merged-into-neighbour' | 'no-longer-detected';

export type UnknownPositionReason =
    | 'no-unwalled-edge'
    | 'gap-dominates-perimeter'
    | 'multiple-disjoint-gaps'
    | 'gap-turns-corner'
    /**
     * §WD32-A-PROPOSAL-NEEDS-BOTH-ANCHORS (L-10603) — fewer than TWO of the
     * proposed segment's endpoints land on a wall that is still standing.
     *
     * ── THE FOUNDER'S FOURTH REPORT, AND WHY THIS IS A REFUSAL ───────────────
     *
     * He moved an interior partition and got, in his words, *"a random wall not
     * connected to any other — corrupted and angled in plan view."* The console
     * had ALREADY MEASURED the reason and printed it inside the offer:
     *
     *     §OPENED-REGION … The proposal is that exact stretch, at the
     *     coordinates the room already had — one end lands on a wall that is
     *     still there, the other does not — CHECK IT BEFORE ACCEPTING.
     *     (gap 1.65 m, anchored 1/2, rooms 9 → 8)
     *
     * ⭐ **The anchor count was computed, printed, and then not used for
     * anything.** It was a caveat in a sentence where it needed to be a
     * precondition on the branch.
     *
     * ⛔ A SEGMENT ANCHORED AT ONE END HAS NO DEFENSIBLE GEOMETRY. Its far end
     * is wherever the room's former boundary sampling happened to stop, so its
     * ANGLE is an artefact of the sampling, not a measurement of anything. There
     * is no version of that wall a reviewer could sensibly accept — which is why
     * this is not a proposal with a warning attached. It is noise wearing a
     * proposal's clothes, and offering it manufactures work and, when accepted,
     * corrupt geometry.
     *
     * Founder, when told the headline defect was that the offer auto-applied
     * without consent: *"even if it was a proposal — clearly wrong one."* He is
     * right, and it reorders the two: the consent gap is real and separate; the
     * PRIMARY defect is that this was offered at all.
     *
     * ── WHAT THE RIGHT ANSWER LOOKS LIKE, STATED SO IT IS NOT LOST ───────────
     *
     * Founder: *"the algorithm should just extend the wall to connect with
     * whatever it can."* ⭐ **EXTENDING an existing wall to a reachable anchor is
     * the sound repair; MINTING a new element floating at one end is not.** That
     * is a capability this detector does not have — it proposes segments, it
     * does not author extensions — so this lane REFUSES rather than half-builds,
     * and the extension path is recorded as the follow-on work
     * (C85 §12 W-R-3, ADR-0336 stage 2). A refusal that names the missing
     * capability is honest; a floating wall is not.
     */
    | 'gap-not-anchored-at-both-ends'
    /**
     * §WD32-EXTEND-BEFORE-CREATE (L-10810) — an EXISTING wall is collinear with
     * this gap and simply extending it would close it. Minting a new wall across
     * it would leave two collinear walls meeting end-to-end where the user has
     * one wall that is too short.
     *
     * ── THE FOUNDER'S NINTH REPORT, AND THE CHAIN HIS LOG PRINTS IN FULL ─────
     *
     * *"I moved a wall — I was expecting an EXTENSION — however I got a NEW
     * WALL … Did you tackle this? Why is it not solved?"*
     *
     * ```
     * 1. §L-1571-UNREPAIRED-JUNCTION … the re-weld will leave 1 junction(s)
     *      UNREPAIRED [wall_…VSVR:INCUMBENT_EXTENSION_REQUIRED]
     * 2. §MOVE-REWELD-REFUSED: INCUMBENT_EXTENSION_REQUIRED × 1
     * 3. §OPENED-REGION — Room 00-002 … 7.14 m of boundary now has no wall on it
     * 4. §OPENED-REGION accepted: wall.create on level L0
     * ```
     *
     * ⭐⭐ **The re-weld KNOWS the incumbent must be EXTENDED and refuses; a
     * SECOND system then fills the hole it left with a NEW WALL.** Refuse-to-
     * extend → room opens → create. That is the founder's stated principle
     * exactly inverted, and the two systems were contradicting each other with
     * no channel between them.
     *
     * ⚠ THE REFUSAL IN STEP 2 IS DEFENSIBLE AND IS NOT CHANGED HERE. C83 §10.2.2
     * forbids a re-weld from re-baselining a wall the user did not touch — the
     * same log shows it would have moved a non-subject wall **1716 mm**, and
     * L-922 is the scar from doing exactly that. ⛔ **But refusing to move
     * somebody's wall and then minting a different wall on top of the gap is the
     * worst of both**: the user gets an element he did not ask for INSTEAD of the
     * one he expected.
     *
     * ⭐ So this closes the contradiction from the side that is safe to close
     * before production: **the CREATE rung stands down when rung 1 (EXTEND) is
     * geometrically available.** It does not implement the extension — that is
     * C85 §10.7 W-M-12 / ADR-0336 stage 2 — and it says so, naming the wall that
     * should have grown. A refusal that names the missing capability is honest;
     * a phantom wall is not.
     */
    | 'gap-closable-by-extending-an-existing-wall';

/** The proposed closing segment, in world XZ, with the evidence that produced it. */
export interface OpenedRegionGap {
    readonly start: RoomVertex;
    readonly end: RoomVertex;
    readonly lengthM: number;
    /** How much of the former perimeter reads unwalled, as a fraction. */
    readonly unwalledFractionOfPerimeter: number;
    /**
     * How many of the two endpoints land on a surviving wall (so the new wall would
     * actually meet something). 2 = both ends anchored; 0 = the segment floats and the
     * message must say so.
     */
    readonly anchoredEndpoints: 0 | 1 | 2;
    /** Thickness/height/type carried from the nearest surviving wall — never invented. */
    readonly matchedWallId?: string;
    readonly thicknessM?: number;
    readonly heightM?: number;
    readonly systemTypeId?: string;
}

export type OpenedRegionFinding =
    | {
        readonly kind: 'region-opened';
        readonly levelId: string;
        readonly cause: OpenedRegionCause;
        readonly roomId: string;
        readonly roomName: string;
        readonly roomAreaM2: number;
        readonly gap: OpenedRegionGap;
        readonly detail: string;
    }
    | {
        readonly kind: 'position-unknown';
        readonly levelId: string;
        readonly cause: OpenedRegionCause;
        readonly roomId: string;
        readonly roomName: string;
        readonly roomAreaM2: number;
        readonly reason: UnknownPositionReason;
        readonly detail: string;
    };

export interface OpenedRegionScan {
    readonly findings: readonly OpenedRegionFinding[];
    readonly roomsBefore: number;
    readonly roomsAfter: number;
    /** Before-rooms with a mutually-containing successor — the healthy, silent case. */
    readonly survivedIntact: number;
}

// ── Geometry primitives (local, pure) ────────────────────────────────────────

function dist(a: RoomVertex, b: RoomVertex): number {
    return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Distance from p to segment ab, and the clamped parameter t along ab. */
function distToSegment(p: RoomVertex, a: RoomVertex, b: RoomVertex): number {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-12) return dist(p, a);
    let t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

/** Shortest distance from p to any edge of the closed ring. */
function distToRing(p: RoomVertex, ring: readonly RoomVertex[]): number {
    let best = Infinity;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        const d = distToSegment(p, a, b);
        if (d < best) best = d;
    }
    return best;
}

function perimeterM(ring: readonly RoomVertex[]): number {
    let total = 0;
    for (let i = 0; i < ring.length; i++) {
        total += dist(ring[i]!, ring[(i + 1) % ring.length]!);
    }
    return total;
}

/** Is this point within the covered band of ANY surviving wall? */
function coveredByWall(p: RoomVertex, walls: readonly SurvivingWall[]): SurvivingWall | undefined {
    for (const w of walls) {
        const half = (w.thickness && w.thickness > 0 ? w.thickness : DEFAULT_WALL_THICKNESS_M) / 2;
        if (distToSegment(p, w.start, w.end) <= half + WALL_COVER_BAND_M) return w;
    }
    return undefined;
}

/**
 * Interior sample points of a ring: a bbox grid filtered by point-in-polygon. Used
 * instead of a centroid because a non-convex room's centroid can fall outside itself,
 * and a containment test that silently mis-answers on L-shaped rooms would emit exactly
 * the false offers this module exists to avoid.
 */
function interiorSamples(ring: readonly RoomVertex[]): RoomVertex[] {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const v of ring) {
        if (v.x < minX) minX = v.x;
        if (v.x > maxX) maxX = v.x;
        if (v.z < minZ) minZ = v.z;
        if (v.z > maxZ) maxZ = v.z;
    }
    const out: RoomVertex[] = [];
    const poly = ring as RoomVertex[];
    for (let i = 1; i <= CONTAINMENT_GRID; i++) {
        for (let j = 1; j <= CONTAINMENT_GRID; j++) {
            const x = minX + ((maxX - minX) * i) / (CONTAINMENT_GRID + 1);
            const z = minZ + ((maxZ - minZ) * j) / (CONTAINMENT_GRID + 1);
            if (pointInPolygon(x, z, poly)) out.push({ x, z });
        }
    }
    return out;
}

/** Fraction of `samples` that fall inside `ring`. Returns 0 for an empty sample set. */
function containedFraction(samples: readonly RoomVertex[], ring: readonly RoomVertex[]): number {
    if (samples.length === 0) return 0;
    const poly = ring as RoomVertex[];
    let n = 0;
    for (const s of samples) if (pointInPolygon(s.x, s.z, poly)) n++;
    return n / samples.length;
}

// ── Perimeter walk ───────────────────────────────────────────────────────────

interface PerimeterSample {
    readonly p: RoomVertex;
    readonly covered: boolean;
    /** True when the sample lies strictly inside the merged successor (merge case). */
    readonly interiorToSuccessor: boolean;
}

function walkPerimeter(
    ring: readonly RoomVertex[],
    walls: readonly SurvivingWall[],
    successor: readonly RoomVertex[] | undefined,
): PerimeterSample[] {
    const per = perimeterM(ring);
    if (per <= 0) return [];
    const pitch = Math.max(PERIMETER_SAMPLE_PITCH_M, per / MAX_PERIMETER_SAMPLES);
    const out: PerimeterSample[] = [];
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        const len = dist(a, b);
        if (len < 1e-9) continue;
        const steps = Math.max(1, Math.round(len / pitch));
        for (let s = 0; s < steps; s++) {
            const t = (s + 0.5) / steps;
            const p: RoomVertex = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
            const interiorToSuccessor = successor === undefined
                ? true
                : pointInPolygon(p.x, p.z, successor as RoomVertex[])
                  && distToRing(p, successor) > INTERIOR_MARGIN_M;
            out.push({ p, covered: coveredByWall(p, walls) !== undefined, interiorToSuccessor });
        }
    }
    return out;
}

interface GapRun {
    readonly points: readonly RoomVertex[];
    readonly lengthM: number;
}

/**
 * Maximal circular runs of samples that are BOTH unwalled AND (in the merge case)
 * interior to the successor. Circular because a gap may straddle the ring's seam.
 */
function findGapRuns(samples: readonly PerimeterSample[]): GapRun[] {
    const n = samples.length;
    if (n === 0) return [];
    const open = samples.map(s => !s.covered && s.interiorToSuccessor);
    if (open.every(v => v)) {
        return [{ points: samples.map(s => s.p), lengthM: runLength(samples.map(s => s.p), true) }];
    }
    // Start immediately after a closed sample so runs are never split by the seam.
    let start = open.findIndex(v => !v);
    if (start < 0) return [];
    const runs: GapRun[] = [];
    let current: RoomVertex[] = [];
    for (let k = 0; k < n; k++) {
        const idx = (start + 1 + k) % n;
        if (open[idx]) {
            current.push(samples[idx]!.p);
        } else if (current.length > 0) {
            runs.push({ points: current, lengthM: runLength(current, false) });
            current = [];
        }
    }
    if (current.length > 0) runs.push({ points: current, lengthM: runLength(current, false) });
    return runs;
}

function runLength(points: readonly RoomVertex[], closed: boolean): number {
    if (points.length < 2) return 0;
    let total = 0;
    for (let i = 0; i + 1 < points.length; i++) total += dist(points[i]!, points[i + 1]!);
    if (closed) total += dist(points[points.length - 1]!, points[0]!);
    return total;
}

/** Max perpendicular deviation of the run's samples from its own chord. */
function chordDeviation(points: readonly RoomVertex[]): number {
    if (points.length < 3) return 0;
    const a = points[0]!;
    const b = points[points.length - 1]!;
    let worst = 0;
    for (const p of points) {
        const d = distToSegment(p, a, b);
        if (d > worst) worst = d;
    }
    return worst;
}

// ── The scan ─────────────────────────────────────────────────────────────────

function nameOf(r: RegionSnapshot): string {
    return r.name && r.name.trim() !== '' ? r.name.trim() : `room ${r.id.slice(0, 8)}`;
}

/**
 * Turn one lost region into a finding — either a proposed segment or a NAMED refusal.
 * `successor` is the merged after-room for the merge case, `undefined` when the region
 * is simply no longer detected.
 */
function assessRegion(
    levelId: string,
    region: RegionSnapshot,
    cause: OpenedRegionCause,
    walls: readonly SurvivingWall[],
    successor: readonly RoomVertex[] | undefined,
): OpenedRegionFinding {
    const areaM2 = Math.abs(polygonAreaM2(region.polygon as RoomVertex[]));
    const per = perimeterM(region.polygon);
    const base = {
        levelId,
        cause,
        roomId: region.id,
        roomName: nameOf(region),
        roomAreaM2: areaM2,
    } as const;

    const samples = walkPerimeter(region.polygon, walls, successor);
    const runs = findGapRuns(samples).filter(r => r.lengthM >= MIN_SIGNIFICANT_GAP_M);
    const unwalledTotal = runs.reduce((s, r) => s + r.lengthM, 0);
    const fraction = per > 0 ? unwalledTotal / per : 0;

    if (runs.length === 0) {
        return {
            ...base,
            kind: 'position-unknown',
            reason: 'no-unwalled-edge',
            detail:
                `${base.roomName} (${areaM2.toFixed(1)} m²) stopped being a closed room, but every ` +
                `metre of its former boundary still has a wall on it. Whatever opened it is not a ` +
                `missing edge on this ring, so there is no wall position to propose.`,
        };
    }
    if (fraction > MAX_GAP_FRACTION_OF_PERIMETER) {
        return {
            ...base,
            kind: 'position-unknown',
            reason: 'gap-dominates-perimeter',
            detail:
                `${base.roomName} (${areaM2.toFixed(1)} m²) has ${(fraction * 100).toFixed(0)}% of its ` +
                `former boundary standing unwalled. That region was not opened by one wall leaving — ` +
                `one wall will not restore it.`,
        };
    }
    if (runs.length > 1) {
        return {
            ...base,
            kind: 'position-unknown',
            reason: 'multiple-disjoint-gaps',
            detail:
                `${base.roomName} (${areaM2.toFixed(1)} m²) stopped being a closed room and its former ` +
                `boundary now has ${runs.length} separate unwalled stretches ` +
                `(${runs.map(r => r.lengthM.toFixed(2) + ' m').join(', ')}). Which one you meant to keep ` +
                `is genuinely unknown, so no single wall is proposed.`,
        };
    }

    const run = runs[0]!;
    if (chordDeviation(run.points) > GAP_STRAIGHTNESS_MAX_DEVIATION_M) {
        return {
            ...base,
            kind: 'position-unknown',
            reason: 'gap-turns-corner',
            detail:
                `${base.roomName} (${areaM2.toFixed(1)} m²) stopped being a closed room and the unwalled ` +
                `stretch (${run.lengthM.toFixed(2)} m) turns a corner. One straight wall cannot close it, ` +
                `and a wall drawn straight across would enclose a different room than the one that was lost.`,
        };
    }

    // Extend the run to the first covered sample on each side so the proposed wall
    // reaches the walls it must meet, rather than stopping half a pitch short.
    const first = run.points[0]!;
    const last = run.points[run.points.length - 1]!;
    const startPt = extendToNearestWall(first, last, walls);
    const endPt = extendToNearestWall(last, first, walls);

    const anchored = ((coveredByWall(startPt, walls) ? 1 : 0) +
        (coveredByWall(endPt, walls) ? 1 : 0)) as 0 | 1 | 2;

    const donor = nearestWall(midpoint(startPt, endPt), walls);
    const lengthM = dist(startPt, endPt);

    // ⭐⭐ §WD32-A-PROPOSAL-NEEDS-BOTH-ANCHORS (L-10603) — THE PRECONDITION THIS
    //    FUNCTION MEASURED AND THEN DID NOT APPLY.
    //
    // `anchored` is computed six lines up and, until now, was spent entirely on
    // the WORDING of an offer that went out regardless. The founder accepted one
    // at `anchored 1/2` and got a wall joined to nothing at one end, at an angle
    // the sampling chose rather than the geometry.
    //
    // It belongs here, with the module's three existing refusals, because it is
    // the same kind of fact they are: `multiple-disjoint-gaps` refuses because
    // WHICH gap is unknown; `gap-turns-corner` refuses because one straight wall
    // cannot close it; this refuses because WHERE THE FAR END GOES is unknown.
    // All three are "the position is not determined", which is exactly what
    // `position-unknown` means — so this needs no new channel, no new consumer
    // branch, and no new user-facing surface. It joins a queue that already
    // behaves correctly.
    //
    // ⚠ THE REFUSAL STILL CARRIES BOTH NUMBERS. The gap length and the anchor
    // count are in the sentence, so a reader can see the size of the miss rather
    // than be told "no" — C83 §10.3, applied to a repair channel rather than a
    // weld.
    if (anchored < 2) {
        return {
            ...base,
            kind: 'position-unknown',
            reason: 'gap-not-anchored-at-both-ends',
            detail:
                `${base.roomName} (${areaM2.toFixed(1)} m²) stopped being a closed room and ` +
                `${lengthM.toFixed(2)} m of its former boundary now has no wall on it — but only ` +
                `${anchored} of that stretch's 2 endpoints lands on a wall that is still standing. ` +
                `A wall built across it would be joined to nothing at ` +
                `${anchored === 1 ? 'one end' : 'either end'}, and its angle would be an artefact of ` +
                `where the old room's boundary happened to stop rather than a measurement of ` +
                `anything. No wall is proposed. To close this gap, EXTEND an existing wall to reach ` +
                `it — a new element floating at one end is a corrupt wall, not a repair.`,
        };
    }

    // ⭐⭐ §WD32-EXTEND-BEFORE-CREATE (L-10810) — RUNG 1 BEFORE RUNG 3.
    //
    // C85 §10.7 states the repair ladder — EXTEND, then JOIN/TRIM, then CREATE —
    // and records that this channel can only ever perform the third rung. The
    // founder watched that happen: the re-weld refused `INCUMBENT_EXTENSION_
    // REQUIRED`, the room opened, and this proposal minted a wall across the
    // hole. *"I was expecting an EXTENSION — however I got a NEW WALL."*
    //
    // ⛔ The ladder cannot be climbed here (there is no extend capability in this
    // module), but the CREATE rung can STAND DOWN when rung 1 is visibly
    // available — and it must, because creating a second collinear wall
    // end-to-end with an existing one is not a repair, it is a duplicate that
    // every downstream consumer then has to reconcile.
    //
    // ⚠ NOT a silent drop: the refusal NAMES the wall that should have grown, so
    // the sentence is actionable by a human and by the lane that implements the
    // extension (ADR-0336 stage 2).
    const extendable = wallCollinearWithGap(startPt, endPt, walls);
    if (extendable) {
        return {
            ...base,
            kind: 'position-unknown',
            reason: 'gap-closable-by-extending-an-existing-wall',
            detail:
                `${base.roomName} (${areaM2.toFixed(1)} m²) stopped being a closed room and ` +
                `${lengthM.toFixed(2)} m of its former boundary now has no wall on it — but wall ` +
                `${extendable.id} already lies on that exact line. The repair is to EXTEND that ` +
                `wall, not to create a second one end-to-end with it, so no new wall is proposed. ` +
                `(Extending an existing wall is not yet something I can do automatically — ` +
                `C85 §10.7 W-M-12.)`,
        };
    }

    const anchorText = 'both ends land on walls that are still there';

    return {
        ...base,
        kind: 'region-opened',
        gap: {
            start: startPt,
            end: endPt,
            lengthM,
            unwalledFractionOfPerimeter: fraction,
            anchoredEndpoints: anchored,
            matchedWallId: donor?.id,
            thicknessM: donor?.thickness,
            heightM: donor?.height,
            systemTypeId: donor?.systemTypeId,
        },
        detail:
            (cause === 'merged-into-neighbour'
                ? `${base.roomName} (${areaM2.toFixed(1)} m²) is no longer its own room — it has merged into the space next to it. `
                : `${base.roomName} (${areaM2.toFixed(1)} m²) is no longer detected as a room at all. `) +
            `${lengthM.toFixed(2)} m of the boundary it used to have now has no wall on it. ` +
            `The proposal is that exact stretch, at the coordinates the room already had — ${anchorText}.`,
    };
}

function midpoint(a: RoomVertex, b: RoomVertex): RoomVertex {
    return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
}

function nearestWall(p: RoomVertex, walls: readonly SurvivingWall[]): SurvivingWall | undefined {
    let best: SurvivingWall | undefined;
    let bestD = Infinity;
    for (const w of walls) {
        const d = distToSegment(p, w.start, w.end);
        if (d < bestD) { bestD = d; best = w; }
    }
    return best;
}

/**
 * Push `from` outward along the `from → away-from-other` direction until it reaches a
 * surviving wall, up to one sample pitch plus a corner allowance. Without this the
 * proposed wall stops half a pitch short at each end and closes nothing.
 */
function extendToNearestWall(
    from: RoomVertex,
    other: RoomVertex,
    walls: readonly SurvivingWall[],
): RoomVertex {
    const dx = from.x - other.x;
    const dz = from.z - other.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-9) return from;
    const ux = dx / len;
    const uz = dz / len;
    const maxStep = PERIMETER_SAMPLE_PITCH_M * 2;
    const step = 0.02;
    let last = from;
    for (let d = 0; d <= maxStep; d += step) {
        const p: RoomVertex = { x: from.x + ux * d, z: from.z + uz * d };
        if (coveredByWall(p, walls)) return p;
        last = p;
    }
    return last;
}

/**
 * §OPENED-REGION — compare the room set before a re-derivation with the room set after
 * it, and report every region that stopped being enclosed.
 *
 * PURE. No stores, no THREE, no DOM, no clock. Every threshold is a named constant at
 * the top of this file with the reason it holds its value.
 */
/**
 * §WD32-EXTEND-BEFORE-CREATE (L-10810) — is an EXISTING wall simply too short?
 *
 * Returns the wall that is collinear with `[a,b]` and would close it by growing
 * along its own line, or `undefined` when no such wall exists and a new one is
 * genuinely the only option.
 *
 * ⭐ TWO CONDITIONS, BOTH REQUIRED, and they answer different questions:
 *   · the wall's DIRECTION matches the gap's (within `COLLINEAR_MAX_ANGLE_RAD`)
 *     — it points the same way;
 *   · BOTH gap endpoints lie within `COLLINEAR_MAX_OFFSET_M` of the wall's own
 *     INFINITE line — it is the same line, not a parallel one a room away.
 *
 * The second is what makes this safe: a parallel wall on the far side of the
 * room satisfies the first and fails the second by metres.
 */
function wallCollinearWithGap(
    a: RoomVertex, b: RoomVertex, walls: readonly SurvivingWall[],
): SurvivingWall | undefined {
    const gx = b.x - a.x, gz = b.z - a.z;
    const gLen = Math.hypot(gx, gz);
    if (gLen < 1e-6) return undefined;
    for (const w of walls) {
        const wx = w.end.x - w.start.x, wz = w.end.z - w.start.z;
        const wLen = Math.hypot(wx, wz);
        if (wLen < 1e-6) continue;
        // Direction, as an UNDIRECTED line angle: a wall's stored winding is an
        // authoring accident, so |sin| is the whole test (mirrors the re-weld
        // engine's own `MIN_ANGLE_RAD` convention).
        const sinAng = Math.abs(gx * wz - gz * wx) / (gLen * wLen);
        if (sinAng > Math.sin(COLLINEAR_MAX_ANGLE_RAD)) continue;
        // Perpendicular distance of BOTH gap ends from the wall's infinite line.
        const off = (p: RoomVertex): number =>
            Math.abs((p.x - w.start.x) * wz - (p.z - w.start.z) * wx) / wLen;
        if (off(a) <= COLLINEAR_MAX_OFFSET_M && off(b) <= COLLINEAR_MAX_OFFSET_M) return w;
    }
    return undefined;
}

export function scanForOpenedRegions(input: OpenedRegionScanInput): OpenedRegionScan {
    const { levelId, roomsBefore, roomsAfter, wallsAfter } = input;

    const usableBefore = roomsBefore.filter(r => r.polygon.length >= 3);
    const usableAfter = roomsAfter.filter(r => r.polygon.length >= 3);

    const beforeSamples = new Map<string, RoomVertex[]>();
    for (const r of usableBefore) beforeSamples.set(r.id, interiorSamples(r.polygon));
    const afterSamples = new Map<string, RoomVertex[]>();
    for (const s of usableAfter) afterSamples.set(s.id, interiorSamples(s.polygon));

    /** before-room id → the after-room that swallows it (if any). */
    const containedBy = new Map<string, RegionSnapshot>();
    /** after-room id → the before-rooms it swallowed. */
    const absorbed = new Map<string, RegionSnapshot[]>();
    /**
     * before-room ids that have a successor by the REVERSE test — an after-room that
     * fits inside them. A wall moved inward SHRINKS a room, and a shrunk room is not
     * ≥70% inside its own successor; without this arm a room that legitimately lost a
     * third of its area would be reported as vanished. That is the cry-wolf failure,
     * and it was caught by an executed test before this arm existed.
     */
    const shrunkInto = new Set<string>();
    let survivedIntact = 0;
    const intact = new Set<string>();

    for (const before of usableBefore) {
        const mine = beforeSamples.get(before.id) ?? [];
        for (const after of usableAfter) {
            const theirs = afterSamples.get(after.id) ?? [];
            const reverse = containedFraction(theirs, before.polygon);
            if (containedFraction(mine, after.polygon) < CONTAINMENT_MIN_FRACTION) {
                if (reverse >= CONTAINMENT_MIN_FRACTION) shrunkInto.add(before.id);
                continue;
            }
            containedBy.set(before.id, after);
            const list = absorbed.get(after.id) ?? [];
            list.push(before);
            absorbed.set(after.id, list);
            // Mutual containment = the SAME room, resized. This is the healthy move.
            if (reverse >= CONTAINMENT_MIN_FRACTION) {
                survivedIntact++;
                intact.add(before.id);
            }
            break;
        }
    }

    const findings: OpenedRegionFinding[] = [];

    // (a) MERGED — one after-room swallowed two or more before-rooms. The boundary
    //     between them stopped existing. One finding per merge group: the founder saw
    //     ONE wall leave, and N cards for one missing edge is the cry-wolf failure.
    for (const [afterId, group] of absorbed) {
        if (group.length < 2) continue;
        const after = usableAfter.find(s => s.id === afterId);
        if (!after) continue;
        const candidates = group
            .filter(r => !intact.has(r.id))
            .sort((a, b) =>
                Math.abs(polygonAreaM2(b.polygon as RoomVertex[])) -
                Math.abs(polygonAreaM2(a.polygon as RoomVertex[])));
        let best: OpenedRegionFinding | undefined;
        for (const region of candidates) {
            const f = assessRegion(levelId, region, 'merged-into-neighbour', wallsAfter, after.polygon);
            if (f.kind === 'region-opened') { best = f; break; }
            if (!best) best = f;
        }
        if (best) findings.push(best);
    }

    // (b) VANISHED — a before-room falls inside no after-room at all, AND no after-room
    //     fits inside it. The second half is what keeps a room that merely SHRANK
    //     (wall moved inward) out of this branch: it still has a successor, just a
    //     smaller one, and reporting it would be a false offer.
    for (const before of usableBefore) {
        if (containedBy.has(before.id) || shrunkInto.has(before.id)) continue;
        findings.push(assessRegion(levelId, before, 'no-longer-detected', wallsAfter, undefined));
    }

    return {
        findings,
        roomsBefore: usableBefore.length,
        roomsAfter: usableAfter.length,
        survivedIntact,
    };
}

// ── The notifier — how the detector reaches the offer without a layer inversion ──

type OpenedRegionListener = (finding: OpenedRegionFinding) => void;

/**
 * §OPENED-REGION — the single channel from detection (L3, room-topology) to the offer
 * (L7, the AI chat surface). Deliberately a subscribe/publish singleton and NOT a
 * runtime-event key: the detector must not depend on the chat surface being reachable,
 * and the chat surface must not be imported downward. Same idiom as
 * `ambientIntelligence.subscribe` in `@pryzm/ai-host`.
 *
 * No subscriber = the finding is still logged by the publisher. Detection is not
 * contingent on anybody listening.
 */
class OpenedRegionNotifier {
    private readonly _listeners = new Set<OpenedRegionListener>();

    subscribe(fn: OpenedRegionListener): () => void {
        this._listeners.add(fn);
        return () => { this._listeners.delete(fn); };
    }

    publish(finding: OpenedRegionFinding): void {
        for (const fn of [...this._listeners]) {
            try {
                fn(finding);
            } catch (err) {
                console.warn('[OpenedRegionDetector] listener threw — ignored:', err);
            }
        }
    }

    get listenerCount(): number {
        return this._listeners.size;
    }
}

export const openedRegionNotifier = new OpenedRegionNotifier();
