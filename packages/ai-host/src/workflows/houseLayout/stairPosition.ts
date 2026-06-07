// Casa Unifamiliar — stair-core POSITION scoring (A.21.D29 / #6).
//
// PURE + DETERMINISTIC L2 (no THREE/DOM/RNG). The founder-ratified "engine decides
// per-plot" space-efficiency objective for the stair core: instead of HARD-CODING a
// central position, we enumerate a SMALL deterministic set of candidate placements
// (central + perimeter-adjacent on each non-entrance shell edge) and SCORE each by
// circulation WASTE for the SPECIFIC plate shape, then pick the least-waste one.
//
// WHY a separate module: the position depends ONLY on the plate dimensions + the
// chosen core size (both of which `reserveStairCore`/`reserveStairCoreShaped` already
// have from the footprint), so the SAME function is callable from both reservation
// paths. That keeps the orchestrator's stair rect byte-identical to a direct
// `reserveStairCoreShaped(footprint, …)` call (the A.21.D18 equality invariant) and
// guarantees the chosen rect stacks across storeys (the rect is a pure function of
// the footprint, which is identical floor-to-floor → §7 vertical alignment).
//
// FRAME: all inputs/outputs are in the plate-local mm frame whose origin is the
// footprint bbox min corner (i.e. x∈[0,plateW], y∈[0,plateH]); the caller adds the
// world/layout-frame min offset. The entrance is conventionally on the y=0 (min-Z)
// façade, so we NEVER place a candidate on that edge (keeps the hall clear + keeps
// the long-standing `y > 0` invariant).

/** A scored candidate stair-core placement (plate-local mm; min corner). */
export interface StairCorePosition {
    /** Min-corner X (plate-local mm). */
    readonly x: number;
    /** Min-corner Y / plan-Z (plate-local mm). */
    readonly y: number;
    /** Lower = better (circulation waste, dimensionless). For diagnostics/tests. */
    readonly waste: number;
    /** Which candidate won — for diagnostics/tests. */
    readonly kind: StairCorePositionKind;
}

export type StairCorePositionKind = 'central' | 'left' | 'right' | 'back';

/** Minimum landing/clearance the core must leave to a perimeter wall it abuts (mm).
 *  A core flush against a wall still needs a usable approach on its open sides; we
 *  also keep the core off the y=0 entrance edge by at least this margin. */
const WALL_LANDING_MM = 900;

/** Minimum OPEN-SIDE gap (mm) a perimeter candidate must leave for it to be worth
 *  offering. Flushing the core to a wall is only an improvement if the freed open
 *  side can hold a GENUINELY USABLE room/landing — not a dead sliver. A gap below
 *  this is exactly what {@link stairCoreWaste} penalises, so a plate too small to
 *  spare it degrades to central-only (graceful fallback). Equals the `USABLE`
 *  shallow-room depth used by the waste scorer so the guard and the score agree. */
const PERIMETER_MIN_OPEN_MM = 2400;

/** A central placement is only worth abandoning if a perimeter one is clearly
 *  better; this tie-break epsilon (mm-area units) keeps the choice STABLE and
 *  biases to `central` on a genuine tie (the historical default → no needless
 *  shift on plots where central is as good as anything). */
const TIE_EPS = 1e-6;

const clamp = (v: number, lo: number, hi: number): number =>
    hi < lo ? lo : Math.min(hi, Math.max(lo, v));

const r3 = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * Circulation-waste score for placing a `coreW × coreH` core at plate-local min
 * corner (x, y) on a `plateW × plateH` plate. Lower is better. Dimensionless,
 * normalised by the plate area so it's comparable across plot sizes.
 *
 * The model rewards a core that abuts a perimeter wall (frees the central floor for
 * habitable rooms) and penalises a core marooned in the middle (which forces
 * circulation to wrap it on all four sides). Concretely, for each of the four sides
 * of the core we measure the GAP to the nearest plate edge; a gap that is too thin
 * to be a usable room/landing but too thick to be just a wall (a "sliver") is dead
 * circulation space and is penalised. A side flush against a wall (gap ≈ 0) costs
 * nothing — that edge is fully used. A side with a generous gap (≥ a usable room
 * depth) costs little — that becomes a real room. Only the in-between slivers hurt.
 */
export function stairCoreWaste(
    plateW: number,
    plateH: number,
    coreW: number,
    coreH: number,
    x: number,
    y: number,
): number {
    if (plateW <= 0 || plateH <= 0) return 0;
    const plateArea = plateW * plateH;

    // Gaps from each core side to the plate edge (mm).
    const gapLeft = Math.max(0, x);
    const gapRight = Math.max(0, plateW - (x + coreW));
    const gapFront = Math.max(0, y);                       // toward the entrance edge
    const gapBack = Math.max(0, plateH - (y + coreH));

    // A gap is "usable" once it can hold a shallow room/landing; below that it is a
    // dead sliver (too thin to use, too wide to be a wall). The sliver band is
    // (0, USABLE); cost peaks mid-band and falls to 0 at both ends (flush wall vs.
    // real room). We multiply the band cost by the side length → an AREA of waste.
    const USABLE = 2400; // mm — a shallow but real room/landing depth
    const sliverCost = (gap: number): number => {
        if (gap <= 1) return 0;            // flush against the wall → fully used
        if (gap >= USABLE) return 0;       // a genuine room → not waste
        // Triangular peak at USABLE/2: dead-space fraction of an unusable gap.
        const t = gap / USABLE;            // 0..1
        return (t < 0.5 ? t : 1 - t) * 2;  // 0..1, peak 1 at the middle
    };

    // Each sliver's waste AREA = its width-cost × the core side it runs along.
    const wasteArea =
        sliverCost(gapLeft) * coreH +
        sliverCost(gapRight) * coreH +
        sliverCost(gapFront) * coreW +
        sliverCost(gapBack) * coreW;

    // Reward abutting a wall: a core touching ≥1 perimeter wall frees the centre.
    // Count flush sides (gap ≈ 0); each flush side earns a small discount.
    const flush = (g: number): number => (g <= 1 ? 1 : 0);
    const flushSides = flush(gapLeft) + flush(gapRight) + flush(gapBack);
    // The front edge is the entrance — abutting it is NOT a reward (we never place
    // there anyway), so it is excluded from the flush bonus.
    const flushBonus = flushSides * 0.04 * plateArea;

    return (wasteArea - flushBonus) / plateArea;
}

/**
 * Generate the SMALL deterministic candidate set for a `coreW × coreH` core on a
 * `plateW × plateH` plate (plate-local mm). Candidates:
 *   - `central`  — the historical default (X-centre, back-third Z).
 *   - `left`/`right` — flush against a long side wall, back-third Z.
 *   - `back`     — flush against the rear (max-Z) wall, X-centre.
 * Perimeter candidates that can't leave a `WALL_LANDING_MM` approach (or won't fit)
 * are dropped, so a tiny plate degrades to just `central`. All Y values are clamped
 * to keep the core off the y=0 entrance edge (front hall stays clear).
 */
export function stairCorePositionCandidates(
    plateW: number,
    plateH: number,
    coreW: number,
    coreH: number,
): Array<{ x: number; y: number; kind: StairCorePositionKind }> {
    const out: Array<{ x: number; y: number; kind: StairCorePositionKind }> = [];

    // Central back-third — ALWAYS present (the safe default / fallback).
    const cx = clamp(plateW / 2 - coreW / 2, 0, Math.max(0, plateW - coreW));
    const backThirdY = clamp(plateH / 3, WALL_LANDING_MM, Math.max(WALL_LANDING_MM, plateH - coreH));
    out.push({ x: r3(cx), y: r3(backThirdY), kind: 'central' });

    // Perimeter candidates only when the plate can actually spare them: flushing the
    // core to a wall must leave a GENUINELY USABLE room/landing on its open side
    // (>= PERIMETER_MIN_OPEN_MM), not a dead sliver. A plate too small to spare that
    // yields central-only (graceful fallback — a tiny plate keeps the historical
    // central placement instead of marooning the core against a wall with no approach).
    const fitsX = plateW - coreW >= PERIMETER_MIN_OPEN_MM;
    const fitsY = plateH - coreH >= PERIMETER_MIN_OPEN_MM;
    // Keep the perimeter cores off the entrance edge: same back-third Z as central.
    const perimY = backThirdY;

    if (fitsX) {
        // Flush LEFT wall (x = 0).
        out.push({ x: 0, y: r3(perimY), kind: 'left' });
        // Flush RIGHT wall (x = plateW − coreW).
        out.push({ x: r3(plateW - coreW), y: r3(perimY), kind: 'right' });
    }
    if (fitsY) {
        // Flush BACK wall (y = plateH − coreH), X-centred.
        out.push({ x: r3(cx), y: r3(Math.max(WALL_LANDING_MM, plateH - coreH)), kind: 'back' });
    }

    return out;
}

/**
 * Choose the least-waste stair-core position (plate-local mm min corner) for a
 * `coreW × coreH` core on a `plateW × plateH` plate. Deterministic: ties resolve to
 * the FIRST-generated (central-preferring) candidate, so a plate where central is as
 * good as anything keeps the historical placement (no needless shift).
 *
 * Graceful fallback: a degenerate plate (no perimeter candidates fit) yields just
 * the central candidate, so the result equals the previous central behaviour.
 */
export function chooseStairCorePosition(
    plateW: number,
    plateH: number,
    coreW: number,
    coreH: number,
): StairCorePosition {
    const candidates = stairCorePositionCandidates(plateW, plateH, coreW, coreH);
    let best = candidates[0]!;
    let bestWaste = stairCoreWaste(plateW, plateH, coreW, coreH, best.x, best.y);
    for (let i = 1; i < candidates.length; i++) {
        const c = candidates[i]!;
        const w = stairCoreWaste(plateW, plateH, coreW, coreH, c.x, c.y);
        // Strictly-less by more than EPS to beat the central default (stable tie-break).
        if (w < bestWaste - TIE_EPS) {
            best = c;
            bestWaste = w;
        }
    }
    return { x: best.x, y: best.y, waste: r3(bestWaste), kind: best.kind };
}

export {
    stairCorePositionCandidates as __candidatesForTest,
    stairCoreWaste as __wasteForTest,
};
