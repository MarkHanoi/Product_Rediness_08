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

// ── A.21.D34(a) — shell-containment of perimeter candidates ──────────────────
//
// The candidate set ("central / left / right / back flush") is reasoned against the
// plate BOUNDING BOX. On an AXIS-ALIGNED plate the bbox IS the shell, so every
// candidate lands inside it. On a SKEWED plate the engine lays out in the
// principal-axis (rotated) frame, where the shell polygon is NEAR — but not exactly
// — axis-aligned, so the bbox over-covers the polygon: a "flush" candidate hugging a
// bbox edge can poke partly OUTSIDE the real (rotated) shell polygon, and the chosen
// stair core then escapes the shell (the founder's "stair rot −24.1°, core outside"
// report). We therefore optionally take the shell polygon (in the SAME plate-local
// frame as the candidates) and CULL any candidate whose full core rect is not
// contained. `central` is special-cased: it is always retained (the safe fallback),
// and when it too escapes it is pulled inward to a contained position if one exists.
//
// Pure: no THREE/DOM/RNG. Absent shell polygon ⇒ this whole concern is skipped and
// the candidate set is byte-identical to the pre-D34 behaviour (no regression on the
// axis-aligned + apartment paths, which never pass a polygon).

/** A plate-local-mm polygon vertex (x, y) where y === plan-Z. */
export interface PlatePolyPt { readonly x: number; readonly y: number }

const EPS_MM = 1e-6;

/** Point-in-polygon (ray cast), inclusive of the boundary within `EPS_MM`.
 *  `poly` is plate-local mm; (px, py) with py === plan-Z. */
function pointInPoly(px: number, py: number, poly: readonly PlatePolyPt[]): boolean {
    const n = poly.length;
    if (n < 3) return false;
    // On-boundary points count as inside (a flush core edge ON the shell wall is fine).
    for (let i = 0; i < n; i++) {
        const a = poly[i]!, b = poly[(i + 1) % n]!;
        const ex = b.x - a.x, ey = b.y - a.y;
        const L2 = ex * ex + ey * ey;
        if (L2 < EPS_MM * EPS_MM) continue;
        const t = ((px - a.x) * ex + (py - a.y) * ey) / L2;
        if (t < -1e-9 || t > 1 + 1e-9) continue;
        const qx = a.x + t * ex, qy = a.y + t * ey;
        if (Math.hypot(px - qx, py - qy) <= 1e-3) return true;     // within 0.001 mm of an edge
    }
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const yi = poly[i]!.y, yj = poly[j]!.y, xi = poly[i]!.x, xj = poly[j]!.x;
        const hit = ((yi > py) !== (yj > py)) &&
            (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-30) + xi);
        if (hit) inside = !inside;
    }
    return inside;
}

/** True when the whole core rect (min corner x,y; extent coreW×coreH) lies inside
 *  `poly`. Tests the four corners + the four edge midpoints + the centre — enough to
 *  reject any rect that pokes a corner or an edge bulge out of a (near-)convex shell.
 *  Conservative: a rect that is fully inside always passes. */
function rectInsidePoly(
    x: number, y: number, coreW: number, coreH: number, poly: readonly PlatePolyPt[],
): boolean {
    if (poly.length < 3) return true;     // no polygon to test against → treat as contained
    const xs = [x, x + coreW / 2, x + coreW];
    const ys = [y, y + coreH / 2, y + coreH];
    for (const sx of xs) for (const sy of ys) {
        if (!pointInPoly(sx, sy, poly)) return false;
    }
    return true;
}

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
    // A.21.D34(a) — OPTIONAL shell polygon (plate-local mm; y === plan-Z) in the SAME
    // frame as the returned candidates. When supplied, perimeter candidates whose core
    // rect is NOT fully contained are CULLED and `central` is pulled inward to a
    // contained position if it escapes — so the chosen core never pokes outside a
    // skewed/rotated shell. Absent ⇒ byte-identical to the pre-D34 candidate set.
    shellPoly?: readonly PlatePolyPt[],
): Array<{ x: number; y: number; kind: StairCorePositionKind }> {
    const out: Array<{ x: number; y: number; kind: StairCorePositionKind }> = [];

    // Central back-third — ALWAYS present (the safe default / fallback).
    const cx = clamp(plateW / 2 - coreW / 2, 0, Math.max(0, plateW - coreW));
    const backThirdY = clamp(plateH / 3, WALL_LANDING_MM, Math.max(WALL_LANDING_MM, plateH - coreH));
    // A.21.D34(a) — when a shell polygon is given and the canonical central position
    // escapes it (a skewed plate's bbox-centre can fall outside the rotated polygon),
    // search a small deterministic grid of inward-nudged positions for a contained one
    // and use the closest-to-central. If none is contained the canonical central is
    // kept verbatim (no worse than before; the orchestrator's own bbox clamp still
    // applies). Skipped entirely without a polygon → identical central candidate.
    const central = (shellPoly && shellPoly.length >= 3 && !rectInsidePoly(cx, backThirdY, coreW, coreH, shellPoly))
        ? containedCentral(cx, backThirdY, plateW, plateH, coreW, coreH, shellPoly)
        : { x: cx, y: backThirdY };
    out.push({ x: r3(central.x), y: r3(central.y), kind: 'central' });

    // Perimeter candidates only when the plate can actually spare them: flushing the
    // core to a wall must leave a GENUINELY USABLE room/landing on its open side
    // (>= PERIMETER_MIN_OPEN_MM), not a dead sliver. A plate too small to spare that
    // yields central-only (graceful fallback — a tiny plate keeps the historical
    // central placement instead of marooning the core against a wall with no approach).
    const fitsX = plateW - coreW >= PERIMETER_MIN_OPEN_MM;
    const fitsY = plateH - coreH >= PERIMETER_MIN_OPEN_MM;
    // Keep the perimeter cores off the entrance edge: same back-third Z as central.
    const perimY = backThirdY;

    // A.21.D34(a) — only offer a perimeter candidate whose full core rect lies inside
    // the shell polygon (when one is supplied). Absent polygon ⇒ accept all (identical).
    const contained = (x: number, y: number): boolean =>
        !shellPoly || shellPoly.length < 3 || rectInsidePoly(x, y, coreW, coreH, shellPoly);

    if (fitsX) {
        // Flush LEFT wall (x = 0).
        if (contained(0, perimY)) out.push({ x: 0, y: r3(perimY), kind: 'left' });
        // Flush RIGHT wall (x = plateW − coreW).
        if (contained(plateW - coreW, perimY)) out.push({ x: r3(plateW - coreW), y: r3(perimY), kind: 'right' });
    }
    if (fitsY) {
        // Flush BACK wall (y = plateH − coreH), X-centred.
        const by = Math.max(WALL_LANDING_MM, plateH - coreH);
        if (contained(cx, by)) out.push({ x: r3(cx), y: r3(by), kind: 'back' });
    }

    return out;
}

/** A.21.D34(a) — find a shell-contained position for the CENTRAL core as close as
 *  possible to its canonical (cx, backThirdY). Scans a small deterministic grid of
 *  inward offsets (toward the plate centre) and returns the first contained one,
 *  preferring the smallest displacement. Falls back to the canonical position when no
 *  scanned cell is contained (degenerate shell). Pure + deterministic. */
function containedCentral(
    cx: number, cy: number, plateW: number, plateH: number,
    coreW: number, coreH: number, poly: readonly PlatePolyPt[],
): { x: number; y: number } {
    const plateCx = plateW / 2 - coreW / 2;
    const plateCy = plateH / 2 - coreH / 2;
    // Step from the canonical position toward the plate centre in fixed fractions; the
    // plate centre of a (near-)convex rotated rectangle is the most interior point, so
    // a contained position is found quickly. Deterministic fraction ladder.
    for (const f of [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]) {
        const x = clamp(cx + (plateCx - cx) * f, 0, Math.max(0, plateW - coreW));
        const y = clamp(cy + (plateCy - cy) * f, 0, Math.max(0, plateH - coreH));
        if (rectInsidePoly(x, y, coreW, coreH, poly)) return { x, y };
    }
    return { x: cx, y: cy };
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
    // A.21.D34(a) — OPTIONAL shell polygon (plate-local mm) to keep every candidate
    // INSIDE a skewed/rotated shell. Absent ⇒ byte-identical to the pre-D34 choice.
    shellPoly?: readonly PlatePolyPt[],
): StairCorePosition {
    const candidates = stairCorePositionCandidates(plateW, plateH, coreW, coreH, shellPoly);
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
