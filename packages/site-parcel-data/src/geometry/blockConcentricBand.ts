// §L-590b / ADR-0273 — THE **FRANJA CONCÈNTRICA**: PGM Art. 350.2.b's block band.
//
// WHY THIS EXISTS AND IS NOT A CALL TO `solveBlockDerivedDepth`
// -------------------------------------------------------------
// Art. 350.2.b (Barcelona clau `22a`, *zona industrial*) says that above the ground floor the
// building must sit inside
//
//   "la franja concèntrica a les alineacions de l'illa DE SUPERFÍCIE IGUAL AL 70 PER 100 d'aquesta"
//
// — a band, concentric with the BLOCK's alignments, whose AREA EQUALS 70 % of the block. Like
// Art. 242.2 it states an algorithm rather than a number (C58 §1.12), and like Art. 242.2 the
// answer is a depth measured inward from the street frontages. **It is nonetheless a different
// construction, and the difference is not cosmetic:**
//
//   | | Art. 242.2 (`solveBlockDerivedDepth`) | Art. 350.2.b (this module) |
//   |---|---|---|
//   | quantifier | *"com a MÍNIM el 30 per 100"* — a MINIMUM | *"de superfície IGUAL al 70 per 100"* — an EQUALITY |
//   | quantity | interior free space left OVER | the band itself |
//   | admissible depths | an INTERVAL; the ordinance picks with clamps | a POINT; nothing to clamp |
//   | ordinance bounds | 11 m floor / 30 m cap, both stated | **NONE stated anywhere in Art. 350** |
//
// `BlockDerivedDepthInput` REQUIRES `minDepth_m` and `maxDepth_m`. Art. 350 states neither, so
// reaching for that solver forces a choice between importing Art. 242's clamps under a citation to
// Art. 350 — the L-526 failure verbatim — and synthesising a pair, which C58 §1.7a forbids. A
// minimum-with-clamps solver and an equality solver are different legal contracts and this repo
// has already paid for collapsing two such contracts into one shape.
//
// ⚠ WHAT IS SHARED IS THE MEASUREMENT, AND IT IS SHARED BY REUSE, NOT BY COPY. "The part of the
// block further than `d` from EVERY street frontage" is exactly a per-edge inset of the block with
// `d` on frontage edges and 0 elsewhere, so this module calls the SAME `insetPolygonPerEdge` that
// `blockDerivedDepth.ts` calls — the capsule-union erosion hardened in L-586 and measured against
// an independent grid oracle. Neither module owns a second offset routine, and a change to the
// erosion moves both constructions together, which is the only way two compliance numbers derived
// from the same geometry can be kept from drifting apart.
//
// THE SEARCH BRACKET, AND WHY IT IS NOT A HIDDEN ORDINANCE CLAMP
// --------------------------------------------------------------
// Bisection needs a bracket. This one is derived **from the block's own geometry**, never from any
// article: at `d = 0` the erosion is the identity, so the free ratio is 1 and the band ratio is 0;
// at `d = ` half the bounding-box diagonal the erosion is certainly empty, so the band ratio is 1.
// The target lies strictly between, so a solution always exists inside the bracket. That is a fact
// about polygons, and it is why this solver needs no `minDepth_m` / `maxDepth_m` at all — the
// question the schema deliberately does not ask.
//
// ⚠ AND THE ANSWER IS CHECKED AGAINST ITS OWN TARGET. The erosion is monotone in theory but our
// implementation of it is not continuous on a dissolved cadastral ring (L-581: it drops a different
// set of lines at different depths, so the curve jumps). A bisection on a discontinuous function
// converges to a jump, not to the equality. So the achieved ratio is measured at the answer and the
// result is REFUSED when it misses the target — the equality is its own verification, which is the
// property Art. 242.2's minimum does not have and is the reason the L-581 machinery there needed a
// separate monotonicity tripwire to notice the same class of failure.
//
// MEASURED AGAINST AN INDEPENDENT ORACLE, BLOCK BY BLOCK
// -------------------------------------------------------
// `scratchpad/probe-l590b-band-oracle.mts`, 65 real dissolved Eixample manzanas. The oracle is a
// DIFFERENT ALGORITHM, not a variant of this one: rasterise the block, take the distance from every
// interior cell to the nearest street frontage, and read the 70th percentile of that distance
// field — which IS the band depth by Art. 350.2.b's own definition. No offsetting, no bisection,
// no polygon area.
//
//     answered (passed the self-check)          58/65  (89.2 %)
//     |code − oracle| depth   median / max      0.327 m / 1.424 m
//     code/oracle depth ratio min / med / max   0.9377 / 0.9873 / 0.9983
//     ⚠ DEEPER than the oracle (C58 §1.4)       **0/58**
//
// ⚠ THE DIRECTION IS NOT LUCK, AND THE REASON IS WORTH KNOWING BEFORE ANYONE "IMPROVES" IT. The
// band is where the TALL tier stands, so a too-DEEP band over-states buildable volume. Every block
// comes out shallower than the oracle, and it does so *because* §INSET-ROUND-JOIN guarantees the
// erosion is never larger than the exact one (L-586): an under-stated interior is reached at a
// shallower depth, so the solver stops early. **The erosion's conservatism propagates into this
// construction as depth conservatism.** Anything that made the erosion "tighter" without preserving
// that one-sidedness would flip the sign of the error here, silently, on the tall tier.
//
// ⚠ ONE HONEST BLEMISH, RECORDED RATHER THAN ROUNDED AWAY: measured as an AREA at the code's own
// depth, the BLOCK band comes out 2–5 % larger than the oracle's cell count on 9 of 58 blocks. That
// is the same fact wearing the opposite sign — the band is measured as `block − erosion`, so an
// under-stated erosion inflates the band's complement. It does NOT reach the published envelope,
// because what the engine consumes is the DEPTH (conservative on 58/58) and the parcel tier is cut
// from the parcel at that depth. Stated so nobody re-discovers it and reads it as an over-statement
// of someone's buildable area.
//
// PURE + deterministic (C58 §1.1): fixed iteration count, no tolerance-driven loop, no RNG, no
// clock. Strategic context: ADR-0273, ADR-0271 (extended), C58 §1.1/§1.4/§1.7a/§1.12, L-526,
// L-581, L-586, L-590.

import type { Pt, ParcelEdgeClassification } from '@pryzm/schemas';
import { polygonSignedArea } from '@pryzm/site-validators';
import { insetPolygonPerEdge } from './insetPolygon.js';

/**
 * Fixed bisection budget — deterministic by construction (C58 §1.1). Matches
 * `BLOCK_DEPTH_BISECTION_STEPS`: 40 halvings of a ≤ 200 m bracket resolves below a nanometre, so
 * the answer is decided by the geometry rather than by where the loop stopped.
 */
export const BLOCK_BAND_BISECTION_STEPS = 40;

/**
 * ⚠ THE ONE THRESHOLD IN THIS MODULE, AND IT IS A VERIFICATION, NOT A TUNING KNOB.
 *
 * Art. 350.2.b is an EQUALITY, so a correct solve lands ON the target band ratio. This is how far
 * off the achieved ratio may be before the answer is refused, expressed as a share of the BLOCK's
 * area: 0.005 = half a percent of the block, roughly 60 m² on a 12 000 m² Eixample manzana.
 *
 * WHY IT IS NOT A "tunable standing between a cadastral block and a compliance number" (the L-525b
 * charge, which was correct about a size threshold used to CHOOSE geometry): nothing here selects,
 * clamps or reshapes anything. The solve either hits its own stated target or it is thrown away.
 * Loosening this constant cannot change which depth is returned — it can only start publishing
 * depths that failed their own check.
 *
 * ⚠ **MEASURED, AND THE MEASUREMENT IS WHY THE VALUE IS 0.005 RATHER THAN A ROUND GUESS.** On the
 * 65 real dissolved Eixample blocks (`scratchpad/probe-l590b-band-oracle.mts`) the achieved ratios
 * do not form a continuum — they form two clusters with a clear gap:
 *
 *     accepted : 69.8 – 70.0 %   (58 blocks)   ⟵ the equality genuinely solved
 *     refused  : 66.0 – 69.4 %   ( 7 blocks)   ⟵ the bisection landed on a discontinuity
 *     ── nothing at all between 69.4 % and 69.8 % ──
 *
 * The threshold sits IN that gap, so it is not slicing through a distribution: moving it anywhere
 * inside 69.4–69.8 % changes no block's outcome. That is the property a threshold on a compliance
 * number has to have, and it is checkable — re-run the probe if this file changes.
 */
export const BLOCK_BAND_RATIO_TOLERANCE = 0.005;

export interface BlockConcentricBandInput {
    /** The BLOCK ring (*illa*) in scene-XZ metres — never the parcel. */
    readonly blockRing: ReadonlyArray<Pt>;
    /**
     * Per-edge classification of `blockRing`. Edges classified `front` are the *alineacions de
     * l'illa* the band is concentric with; everything else bounds no street.
     */
    readonly blockEdgeClassifications: ReadonlyArray<ParcelEdgeClassification>;
    /** Art. 350.2.b ⇒ 0.70. The band's area as a share of the block. An EQUALITY. */
    readonly bandAreaRatio: number;
}

export interface BlockConcentricBandResult {
    /** The band's depth from the block alignments, metres. */
    readonly depth_m: number;
    /** The band ratio actually achieved at `depth_m`. A sound answer sits ON `bandAreaRatio`. */
    readonly achievedBandRatio: number;
    /**
     * TRUE when the construction did not solve its own equality — the achieved ratio missed the
     * target by more than `BLOCK_BAND_RATIO_TOLERANCE`.
     *
     * ⚠ **THIS IS A STATEMENT ABOUT OUR GEOMETRY, NOT ABOUT THE ORDINANCE.** Art. 350.2.b always
     * has a solution on a well-formed block (the band ratio runs continuously from 0 to 1 in the
     * ideal). A miss therefore means the erosion we measure with is discontinuous here — the
     * L-581 pathology — and the caller MUST refuse citing OUR failure, never "the article cannot
     * be satisfied on this block". Publishing a legal tier boundary from a search that failed its
     * own target is the L-529 defect (an ordinance floor shipped as a computed answer).
     */
    readonly degenerate: boolean;
    /**
     * §L-581 — TRUE when the erosion COLLAPSED at the answer depth, i.e. the 0 free area came from
     * `insetPolygonPerEdge` giving up rather than from the courtyard genuinely being consumed.
     * Reported alongside `degenerate` so a caveat can name the real cause.
     */
    readonly insetDegenerate: boolean;
}

/** Absolute polygon area (m²). Winding-agnostic. */
function area(ring: ReadonlyArray<Pt>): number {
    return ring.length < 3 ? 0 : Math.abs(polygonSignedArea(ring));
}

interface InteriorFree {
    readonly area_m2: number;
    /** TRUE when the 0 came from the OFFSET FAILING, not from the interior being consumed. */
    readonly insetDegenerate: boolean;
}

/**
 * The part of the block further than `d` from EVERY street frontage — i.e. the block INTERIOR left
 * outside the band. The band is its complement, which is why the whole solve is expressed on the
 * free area: one erosion call, no polygon boolean (this repo has none, deliberately — see the
 * header of `insetPolygon.ts`).
 */
function interiorFreeAt(input: BlockConcentricBandInput, d: number): InteriorFree {
    const res = insetPolygonPerEdge(
        input.blockRing,
        input.blockEdgeClassifications as ParcelEdgeClassification[],
        { front: d, side: 0, rear: 0, unclassified: 0 },
    );
    return { area_m2: res.degenerate ? 0 : area(res.polygon), insetDegenerate: res.degenerate };
}

/**
 * Half the block's bounding-box diagonal — a depth at which the erosion is certainly empty.
 *
 * ⚠ A GEOMETRIC bracket, never an ordinance cap. Art. 350 states no maximum depth and this module
 * must not invent one: the value below cannot appear in any answer, because the solve refuses
 * unless the achieved ratio hits the article's own target, and the band ratio at this depth is 1.
 */
function searchCeiling(ring: ReadonlyArray<Pt>): number {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of ring) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
    }
    return Math.hypot(maxX - minX, maxZ - minZ) / 2;
}

/**
 * Solve Art. 350.2.b for this block. PURE, deterministic, never throws.
 *
 * Returns the depth at which the band's area EQUALS `bandAreaRatio` of the block, or `null` when
 * the block cannot support the construction at all (degenerate ring, no identified frontage, an
 * out-of-range ratio). `null` and `degenerate: true` are different answers and both are refusals:
 * `null` means the question could not be asked, `degenerate` means it was asked and our own
 * geometry failed to answer it.
 */
export function solveBlockConcentricBandDepth(
    input: BlockConcentricBandInput,
): BlockConcentricBandResult | null {
    const { blockRing, blockEdgeClassifications, bandAreaRatio } = input;
    if (blockRing.length < 3) return null;
    if (blockEdgeClassifications.length !== blockRing.length) return null;
    if (!Number.isFinite(bandAreaRatio) || bandAreaRatio <= 0 || bandAreaRatio >= 1) return null;

    // §BLOCK-DEPTH-REQUIRES-FRONTAGE (L-465), applied to Art. 350.2.b. The band is defined as
    // CONCENTRIC WITH THE BLOCK'S ALIGNMENTS. With no edge classified `front` there are no
    // alignments to be concentric with, `interiorFreeAt` erodes nothing at every depth, and a
    // naive bisection would run to the search ceiling and hand back a band covering the whole
    // block — maximum buildability, produced by a construction that had no input. `null` is the
    // honest answer and the caller shows no envelope (C58 §1.2 tier 3, §1.4).
    if (!blockEdgeClassifications.some((c) => c === 'front')) return null;

    const blockArea = area(blockRing);
    if (!(blockArea > 0)) return null;

    // Target expressed on the FREE area, because that is what one erosion call measures.
    // band = block − interiorFree  ⇒  free = (1 − bandAreaRatio) × blockArea.
    const targetFree = blockArea * (1 - bandAreaRatio);

    // Bracket: free(0) = blockArea > targetFree; free(ceiling) = 0 < targetFree. Both endpoints
    // are facts about polygons, not about Art. 350 (see `searchCeiling`).
    const ceiling = searchCeiling(blockRing);
    if (!(ceiling > 0)) return null;

    // Largest `d` whose remaining free area is still at least the target. Invariant: `lo` keeps at
    // least `targetFree`, `hi` does not. Fixed iteration count — never a convergence tolerance,
    // which would make the last bit input-sensitive and break C58 §1.1 byte-determinism.
    let lo = 0;
    let hi = ceiling;
    for (let i = 0; i < BLOCK_BAND_BISECTION_STEPS; i++) {
        const mid = (lo + hi) / 2;
        if (interiorFreeAt(input, mid).area_m2 >= targetFree) lo = mid;
        else hi = mid;
    }

    const atLo = interiorFreeAt(input, lo);
    const achievedBandRatio = 1 - atLo.area_m2 / blockArea;
    // THE EQUALITY IS ITS OWN VERIFICATION — see `BLOCK_BAND_RATIO_TOLERANCE`. A bisection that
    // converged on a DISCONTINUITY of our erosion rather than on the article's target lands far
    // from `bandAreaRatio`, and that answer is thrown away rather than published.
    const degenerate = Math.abs(achievedBandRatio - bandAreaRatio) > BLOCK_BAND_RATIO_TOLERANCE;

    return {
        depth_m: lo,
        achievedBandRatio,
        degenerate,
        insetDegenerate: atLo.insetDegenerate,
    };
}
