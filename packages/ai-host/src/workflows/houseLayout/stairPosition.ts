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

// ── §STAIR-WORST-ASPECT (Casa, founder explicit ask 2026-06-08) ──────────────
//
// The founder's rule: "in each house the stair should occupy the LEAST space
// possible and always tend to be ADJACENT TO A WALL — ideally the wall where the
// view / sunlight is WORST (normally NORTH unless the view is good)." The stair is
// pure circulation; spending the BEST (sun-facing / good-view) façade on it wastes
// the plot's most valuable frontage. So we bias the perimeter candidate choice
// toward the POOR-ASPECT wall and AWAY from the good (sun) façade.
//
// Frame: the plate-local frame here has y=0 on the ENTRANCE (front, min-Z) façade
// and y=plateH on the BACK (max-Z) façade; `left`=x0 / `right`=x1 are the two side
// walls. The sun/equator-facing direction (from latitude, via
// `aspectFromSunDir`) is expressed in the SAME frame (y === plan-Z): Northern
// hemisphere → sun toward +y (the BACK wall is the good one), Southern → −y (the
// FRONT/entrance wall is the good one). The stair therefore avoids the wall whose
// outward normal points at the sun, and prefers the opposite (worst-aspect) wall.
// A façade explicitly flagged GOOD-VIEW is avoided the same way.

/** Per-candidate-kind aspect preference: which perimeter wall a candidate abuts,
 *  scored by how POOR its aspect is (higher = poorer = better for a stair). */
export interface AspectBias {
    /** Sun/equator-facing unit direction in the plate-local frame (x=East, y=plan-Z
     *  where +y is the BACK/max-Z wall). Null ⇒ no solar preference (equatorial /
     *  no latitude) → every wall is aspect-neutral. */
    readonly sunDir: { readonly x: number; readonly y: number } | null;
    /** OPTIONAL set of candidate kinds whose façade is flagged GOOD-VIEW — the stair
     *  avoids these the same way it avoids the sun wall. */
    readonly goodViewKinds?: readonly StairCorePositionKind[];
}

/** The outward normal of the wall a perimeter candidate abuts, in the plate-local
 *  frame (x=East, y=plan-Z). `left` faces −x, `right` faces +x, `back` faces +y
 *  (away from the entrance). `central` has no wall → {0,0}. */
function wallOutwardNormal(kind: StairCorePositionKind): { x: number; y: number } {
    switch (kind) {
        case 'left':  return { x: -1, y: 0 };
        case 'right': return { x: 1, y: 0 };
        case 'back':  return { x: 0, y: 1 };
        default:      return { x: 0, y: 0 };       // central — no façade
    }
}

/**
 * Aspect SCORE for a perimeter candidate: 0 (best aspect — the stair should avoid
 * this wall) … 1 (worst aspect — ideal for a stair). Derived from how much the
 * wall faces AWAY from the sun: a wall whose outward normal points at the sun is
 * the GOOD façade (score → 0); a wall facing away is the POOR façade (score → 1);
 * a side wall is neutral (~0.5). A wall flagged good-view is forced to 0. With no
 * sun direction every wall is neutral 0.5 (aspect-blind → no behaviour change).
 */
export function aspectScore(kind: StairCorePositionKind, bias: AspectBias | undefined): number {
    if (kind === 'central') return 0;              // central is not a perimeter wall
    if (bias?.goodViewKinds?.includes(kind)) return 0;   // explicit good-view → avoid
    const sun = bias?.sunDir;
    if (!sun) return 0.5;                          // aspect-blind → neutral
    const n = wallOutwardNormal(kind);
    const dot = n.x * sun.x + n.y * sun.y;         // +1 faces sun, −1 faces away
    // Map dot ∈ [−1,1] → poorness ∈ [1,0]: facing-away (−1) is the WORST aspect → 1.
    return (1 - dot) / 2;
}

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

// ── A.21.D52 — shell-jitter tolerance for perimeter-candidate containment ─────
//
// A REAL drawn boundary is never a mathematically perfect rectangle: the user
// draws edge-by-edge and the WallJoinResolver mitres the corners, so the shell
// polygon the orchestrator hands us wobbles by a few cm around its ideal line. The
// A.21.D34(a) containment cull (kept for SKEWED/CONCAVE shells) tested with a
// 0.001 mm boundary tolerance — so a candidate flushed to the bbox edge (x=0) was
// culled whenever the shell's matching edge dipped even 1 mm inward of x=0. On a
// jittery real plate that culled EVERY perimeter candidate, collapsing the choice
// to `central` (the founder's centred stair in real houses, even though every unit
// test on a perfect rectangle placed it at a wall). We therefore treat a sampled
// point as contained when it is inside the polygon OR within this realistic
// draw/miter jitter band of its boundary. The band (150 mm) is far smaller than a
// genuine skew/notch (the L-shape's `right` candidate is metres outside → still
// culled), so D34(a)'s real purpose — keeping candidates inside a genuinely
// rotated/concave shell — is preserved, while ordinary wall wobble no longer
// marooned the stair in the centre.
const SHELL_JITTER_MM = 150;

// ── A.21.D59 — TIGHT containment band (genuine draw jitter, not a wall overrun) ──
//
// `SHELL_JITTER_MM` (150) is the band within which a candidate is still OFFERED on a
// wobbly shell (so D52's perimeter candidates survive). But "offered" is not the same
// as "well-placed": a flush candidate anchored to the bbox edge on a SKEWED / rotated /
// sheared plate can sit up to a full 150 mm PROUD of the real wall — the core then pokes
// visibly OUTWARD past the perimeter (the founder's A.21.D59 screenshot: U-stair flush to
// a wall but extending OUTside the footprint). 150 mm conflated two things: cm-scale
// draw/miter wobble (legitimately absorbed) and a real geometric overrun (must NOT be).
//
// This TIGHT band is the genuine hand-draw/miter wobble (≈3 cm). The inward-nudge ladder
// (`containedNudged`) prefers the first position contained at THIS tight tolerance — i.e.
// genuinely INSIDE the shell — and only falls back to a loosely-contained (≤150 mm proud)
// flush position when no inward nudge can reach tight containment. So a flush perimeter
// anchor is pulled INWARD until the core is fully inside (all corners within ~30 mm of, or
// inside, the wall), never left poking metres — or even decimetres — past the wall.
const SHELL_TIGHT_JITTER_MM = 30;

/** Point-in-polygon (ray cast), inclusive of the boundary within `tolMm` (mm).
 *  `poly` is plate-local mm; (px, py) with py === plan-Z. A point within `tolMm` of
 *  any edge counts as inside — this absorbs real shell draw/miter jitter so a core
 *  flushed to a slightly-wobbly wall is not spuriously culled (A.21.D52). */
function pointInPoly(px: number, py: number, poly: readonly PlatePolyPt[], tolMm = 1e-3): boolean {
    const n = poly.length;
    if (n < 3) return false;
    // On-boundary points (within `tolMm`) count as inside (a flush core edge ON — or a
    // jitter-width proud of — the shell wall is fine).
    for (let i = 0; i < n; i++) {
        const a = poly[i]!, b = poly[(i + 1) % n]!;
        const ex = b.x - a.x, ey = b.y - a.y;
        const L2 = ex * ex + ey * ey;
        if (L2 < EPS_MM * EPS_MM) continue;
        const t = ((px - a.x) * ex + (py - a.y) * ey) / L2;
        if (t < -1e-9 || t > 1 + 1e-9) continue;
        const qx = a.x + t * ex, qy = a.y + t * ey;
        if (Math.hypot(px - qx, py - qy) <= tolMm) return true;
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
 *  Conservative: a rect that is fully inside always passes. Boundary samples within
 *  `tolMm` (default {@link SHELL_JITTER_MM} — real shell draw/miter jitter) of an
 *  edge count as contained so a flush perimeter candidate survives ordinary wall
 *  wobble (A.21.D52); genuine skew/notch overruns (metres) are still culled. */
function rectInsidePoly(
    x: number, y: number, coreW: number, coreH: number, poly: readonly PlatePolyPt[],
    tolMm = SHELL_JITTER_MM,
): boolean {
    if (poly.length < 3) return true;     // no polygon to test against → treat as contained
    const xs = [x, x + coreW / 2, x + coreW];
    const ys = [y, y + coreH / 2, y + coreH];
    for (const sx of xs) for (const sy of ys) {
        if (!pointInPoly(sx, sy, poly, tolMm)) return false;
    }
    return true;
}

/**
 * §STAIR-OFF-SHELL (2026-06-08, tracker §22.7) — FINAL containment guard for a
 * plate-local core rect. Given a rect (min corner x,y; coreW×coreH) and the shell
 * polygon (plate-local mm), return a position whose WHOLE rect is TIGHTLY inside the
 * polygon. If the input is already tightly contained it is returned VERBATIM — on an
 * axis-aligned plate the bbox === the shell, so the core is already contained and this
 * is a no-op (A.21.D18 byte-identical). Otherwise it walks a deterministic inward grid
 * (toward the plate centre, the same fraction ladder as `containedCentral`) and returns
 * the first tightly-contained cell; failing that, the first loosely-contained; failing
 * both, the input unchanged (degenerate shell — no worse than today).
 *
 * WHY: `reserveStairCore`/`reserveStairCoreShaped` clamp the chosen position to the
 * plate BOUNDING BOX, not the shell POLYGON. On a ROTATED plate bbox ⊋ polygon, so a
 * wall-flush (or ≤150 mm-proud, loosely-contained) core sits inside the bbox yet OUTSIDE
 * the rotated shell — the founder's "stair pokes outside the perimeter" defect. This
 * re-validates the post-clamp rect against the real polygon and nudges it back in.
 * Pure + deterministic.
 */
export function snapRectInsidePoly(
    x: number, y: number, coreW: number, coreH: number,
    plateW: number, plateH: number, poly: readonly PlatePolyPt[],
): { x: number; y: number } {
    if (poly.length < 3) return { x, y };
    if (rectInsidePoly(x, y, coreW, coreH, poly, SHELL_TIGHT_JITTER_MM)) return { x, y };
    const cx = plateW / 2 - coreW / 2;
    const cy = plateH / 2 - coreH / 2;
    const ladder = [0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
    // Pass 1: first cell genuinely inside (tight band).
    for (const f of ladder) {
        const nx = clamp(x + (cx - x) * f, 0, Math.max(0, plateW - coreW));
        const ny = clamp(y + (cy - y) * f, 0, Math.max(0, plateH - coreH));
        if (rectInsidePoly(nx, ny, coreW, coreH, poly, SHELL_TIGHT_JITTER_MM)) return { x: nx, y: ny };
    }
    // Pass 2: fall back to the first loosely-contained cell (cm-wobble shell).
    for (const f of ladder) {
        const nx = clamp(x + (cx - x) * f, 0, Math.max(0, plateW - coreW));
        const ny = clamp(y + (cy - y) * f, 0, Math.max(0, plateH - coreH));
        if (rectInsidePoly(nx, ny, coreW, coreH, poly, SHELL_JITTER_MM)) return { x: nx, y: ny };
    }
    return { x, y };
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

    // §STAIR-CORNER-ANCHOR (2026-06-08, Defect A) — the side-wall (left/right)
    // candidates are anchored to the BACK CORNER (flush to a side wall AND flush to
    // the rear max-Z wall), NOT the mid-height back-third. WHY: a stair carved out
    // of the MIDDLE of an edge fractures the plate into THREE comparable bands
    // (full-width top + full-width bottom + a side band), none dominant — so the
    // subdivider can't keep a corridor spine and the rooms merge (the founder's
    // central-stair blob, which a mid-edge perimeter stair reproduces). A CORNER
    // stair instead carves a clean L = ONE dominant rectangle + one small corner
    // sliver, so §STAIR-OBSTACLE-CARVE can run the corridor carve on the dominant
    // rect and every room encloses + links. The back corner is the only clean-carve
    // corner available (the front corners sit on the entrance edge, which must stay
    // clear), and it keeps the stair OFF the prime front façade — consistent with
    // the worst-aspect rule (habitable rooms keep the best frontage). The core stays
    // off the entrance edge because it abuts the REAR wall (y = plateH − coreH > 0).
    const cornerY = Math.max(WALL_LANDING_MM, plateH - coreH);

    // A.21.D34(a) — only offer a perimeter candidate whose full core rect lies inside
    // the shell polygon (when one is supplied). Absent polygon ⇒ accept all (identical).
    // `tolMm` lets the caller test TIGHT containment (genuinely inside, A.21.D59) or the
    // loose D52 offer band (≤150 mm proud); default = the loose band (legacy behaviour).
    const containedAt = (x: number, y: number, tolMm: number): boolean =>
        !shellPoly || shellPoly.length < 3 || rectInsidePoly(x, y, coreW, coreH, shellPoly, tolMm);

    // A.21.D52 + A.21.D59 — place a flush perimeter candidate that is GENUINELY INSIDE
    // the (possibly jittery / skewed / rotated) shell, hugging the wall but never poking
    // OUTWARD past it.
    //
    // D52 fixed the over-cull (a jittery flush candidate culled by the 0.001 mm test →
    // every perimeter candidate dropped → central). But its 150 mm offer band ALSO let a
    // flush candidate that sits up to 150 mm PROUD of the real wall (a skewed/rotated
    // plate's bbox-anchored flush position) be accepted verbatim — the core then extends
    // OUTSIDE the footprint (A.21.D59 founder screenshot). So we now NUDGE INWARD:
    //   1. Walk a deterministic ladder of inward offsets (toward the plate interior) and
    //      take the FIRST position contained at the TIGHT jitter band (≈30 mm — i.e. the
    //      whole core inside the shell, no real overrun). This pulls a proud flush anchor
    //      in until the core's outer edge sits AT/INSIDE the wall, still hugging it (the
    //      retreat is at most one wall-landing — the founder's "adjacent to a wall" rule).
    //   2. Only if NO inward nudge reaches tight containment do we fall back to the first
    //      position contained at the LOOSE band (≤150 mm — genuine cm-scale wobble only),
    //      so a truly jittery-but-fine wall still yields its perimeter candidate.
    //   3. If neither band is ever satisfied the candidate drops (genuine skew/notch —
    //      D34(a) preserved).
    // The ladder STARTS at 0 (the flush position itself) so an already-tight flush anchor
    // is returned unchanged (axis-aligned plate → bit-identical to pre-D59). Pure/det.
    // The nudge retreats INWARD off the abutted wall. `(normX, normY)` is that wall's
    // INWARD normal (the perpendicular that reduces the outward overrun): left → +x,
    // right → −x, back → −y. We retreat along THAT axis FIRST (it is the axis on which a
    // skewed wall makes the core proud), then — only if a pure-perpendicular retreat
    // can't seat the core (e.g. the proud corner is on an adjacent slanted edge) — also
    // back off the secondary corner axis. Retreating along the WRONG axis is what left
    // the D59 sweep proud: the old `(−1,−1)` retreat for `right` moved the core DOWN a
    // slanted wall into its NARROWER part, INCREASING the overrun. `secX/secY` is the
    // optional corner-anchor axis (toward the entrance, −y) tried only as a 2nd pass.
    const PERIM_NUDGE_MM = WALL_LANDING_MM;   // cap the inward retreat at one landing depth
    const NUDGE_LADDER = [0, 25, 50, 100, 150, 250, 400, 600, PERIM_NUDGE_MM];
    const containedNudged = (
        flushX: number, flushY: number,
        normX: number, normY: number, secX: number, secY: number,
    ): { x: number; y: number } | null => {
        if (!shellPoly || shellPoly.length < 3) return { x: flushX, y: flushY };
        const at = (dx: number, dy: number): { x: number; y: number } => ({
            x: clamp(flushX + dx, 0, Math.max(0, plateW - coreW)),
            y: clamp(flushY + dy, 0, Math.max(0, plateH - coreH)),
        });
        // Search order: along the wall's inward normal first (primary), then a small grid
        // that ALSO backs off the secondary corner axis — so a proud corner on an adjacent
        // slanted edge is still resolved. Each (tight-then-loose) at the smallest retreat.
        const candidatesInward: Array<{ x: number; y: number }> = [];
        for (const a of NUDGE_LADDER) {
            // primary axis only (the common, single-wall-proud case)
            candidatesInward.push(at(normX * a, normY * a));
        }
        for (const a of NUDGE_LADDER) {
            for (const b of NUDGE_LADDER) {
                if (a === 0 && b === 0) continue;            // (already covered above)
                candidatesInward.push(at(normX * a + secX * b, normY * a + secY * b));
            }
        }
        // Pass 1: first position GENUINELY inside (tight band → no outward overrun).
        for (const p of candidatesInward) {
            if (containedAt(p.x, p.y, SHELL_TIGHT_JITTER_MM)) return p;
        }
        // Pass 2: fall back to the first loosely-contained position (cm-wobble shell).
        for (const p of candidatesInward) {
            if (containedAt(p.x, p.y, SHELL_JITTER_MM)) return p;
        }
        return null;
    };

    if (fitsX) {
        // Flush LEFT wall (x = 0), back corner. Inward normal = +x (off the left wall);
        // secondary corner axis = −y (off the back wall). Primary retreat is +x so a
        // slanted left wall pulls the core RIGHT (off the wall), not down it.
        const l = containedNudged(0, cornerY, +1, 0, 0, -1);
        if (l) out.push({ x: r3(l.x), y: r3(l.y), kind: 'left' });
        // Flush RIGHT wall (x = plateW − coreW), back corner. Inward normal = −x;
        // secondary = −y. Primary retreat is −x so a slanted right wall pulls the core
        // LEFT (off the wall) — fixing the D59 "retreat down a slanted wall" overrun.
        const r = containedNudged(plateW - coreW, cornerY, -1, 0, 0, -1);
        if (r) out.push({ x: r3(r.x), y: r3(r.y), kind: 'right' });
    }
    if (fitsY) {
        // Flush BACK wall (y = plateH − coreH), X-centred — the full-edge band variant
        // (still a clean single-dominant carve: one big front band). Inward normal = −y
        // (off the back wall); secondary = −x (off whichever side it drifts toward).
        const by = Math.max(WALL_LANDING_MM, plateH - coreH);
        const b = containedNudged(cx, by, 0, -1, -1, 0);
        if (b) out.push({ x: r3(b.x), y: r3(b.y), kind: 'back' });
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
    // §STAIR-WORST-ASPECT (2026-06-08) — OPTIONAL aspect bias (sun direction +
    // good-view flags, plate-local frame). When supplied, the chooser STRONGLY
    // prefers a PERIMETER candidate over central (Defect A — a central stair holes
    // the subdivision so rooms can't enclose) and, among perimeter candidates,
    // prefers the POOR-ASPECT wall (Defect B — keep the best façade for habitable
    // rooms). Absent ⇒ byte-identical to the pre-aspect waste-only choice.
    aspect?: AspectBias,
): StairCorePosition {
    const candidates = stairCorePositionCandidates(plateW, plateH, coreW, coreH, shellPoly);

    // §STAIR-WORST-ASPECT — combined cost when an aspect bias is supplied:
    //   cost = waste + PERIMETER_PREFERENCE·(central?1:0) − ASPECT_WEIGHT·aspectScore
    // The perimeter-preference term makes any feasible PERIMETER candidate beat the
    // central default whenever one exists (so the stair hugs a wall — fixing both
    // the central-hole subdivision break AND the founder's "adjacent to a wall"
    // rule). The aspect term then orders the perimeter candidates so the POOREST-
    // aspect (e.g. North) wall wins. Both terms are bounded below the waste scale's
    // own range, so on a plate where central is genuinely the only sane option
    // (no perimeter candidate offered) central still wins. Without an aspect bias
    // we fall back to the pure waste tie-break (byte-identical legacy path).
    const PERIMETER_PREFERENCE = 1.0;   // central pays this; perimeter pays 0
    const ASPECT_WEIGHT = 0.25;         // tunes perimeter ordering; < PERIMETER_PREFERENCE
    // §STAIR-ANTI-FRAGMENT (2026-06-08, founder "stair location critical") — a CORNER
    // carve (core flush to a side wall AND the rear wall) leaves ONE dominant rectangle
    // the subdivider can spine + fill; a MID-EDGE carve (flush to one wall only — e.g. a
    // back-corner candidate the shell-containment nudge pulled OFF the corner on a
    // skewed plate) fractures the plate into bands → §FEASIBILITY-ALLOC drops rooms (the
    // founder's "stair conflicts the layout / rooms merge"). The waste term alone can let
    // a flush-on-one-wall MID-EDGE beat a true CORNER (its single flush bonus). Add an
    // explicit fragmentation penalty so a genuine CORNER always wins when one exists.
    // Sits ABOVE the aspect ordering (< PERIMETER_PREFERENCE so central is still last) so
    // among perimeter candidates a clean corner beats a fragmenting mid-edge. Applied
    // ONLY on the aspect path (house) → the legacy waste-only path is byte-identical.
    const FRAGMENT_PENALTY = 0.5;       // MID-EDGE perimeter pays this; a CORNER pays 0
    const flushS = (g: number): number => (g <= 1 ? 1 : 0);
    const isCornerCarve = (c: { kind: StairCorePositionKind; x: number; y: number }): boolean => {
        if (c.kind === 'central') return false;
        const flushSide = flushS(c.x) + flushS(plateW - (c.x + coreW));   // a left/right wall
        const flushBack = flushS(plateH - (c.y + coreH));                  // the rear wall
        return flushSide >= 1 && flushBack >= 1;                           // abuts TWO walls = clean L-carve
    };
    const cost = (c: { kind: StairCorePositionKind; x: number; y: number }): number => {
        const waste = stairCoreWaste(plateW, plateH, coreW, coreH, c.x, c.y);
        if (!aspect) return waste;
        const centralPenalty = c.kind === 'central' ? PERIMETER_PREFERENCE : 0;
        const fragPenalty = (c.kind !== 'central' && !isCornerCarve(c)) ? FRAGMENT_PENALTY : 0;
        return waste + centralPenalty + fragPenalty - ASPECT_WEIGHT * aspectScore(c.kind, aspect);
    };

    let best = candidates[0]!;
    let bestCost = cost(best);
    for (let i = 1; i < candidates.length; i++) {
        const c = candidates[i]!;
        const w = cost(c);
        // Strictly-less by more than EPS to beat the central default (stable tie-break).
        if (w < bestCost - TIE_EPS) {
            best = c;
            bestCost = w;
        }
    }
    // Report the pure circulation waste for diagnostics/tests (unchanged metric).
    const bestWaste = stairCoreWaste(plateW, plateH, coreW, coreH, best.x, best.y);

    // §DIAG-STAIR — log every candidate considered + why the winner was chosen
    // (logging only; no behaviour change). The CORNER vs MID-EDGE vs CENTRAL
    // classification predicts plate fragmentation: a CORNER carve keeps one
    // dominant rectangle (good); a CENTRAL/MID-EDGE carve fractures the plate
    // (the founder's merged-room blob). flushSides counts walls the core abuts.
    const flushOf = (g: number): number => (g <= 1 ? 1 : 0);
    const classify = (c: { kind: StairCorePositionKind; x: number; y: number }): string => {
        if (c.kind === 'central') return 'CENTRAL';
        const flushX = flushOf(c.x) + flushOf(plateW - (c.x + coreW));
        const flushBack = flushOf(plateH - (c.y + coreH));
        // Abuts a side wall AND the rear wall ⇒ a clean corner carve.
        return flushX >= 1 && flushBack >= 1 ? 'CORNER' : 'MID-EDGE';
    };
    for (const c of candidates) {
        console.log(
            `[D-TGL] §DIAG-STAIR cand kind=${c.kind} pos=${classify(c)} ` +
            `x=${Math.round(c.x)} y=${Math.round(c.y)} ` +
            `waste=${stairCoreWaste(plateW, plateH, coreW, coreH, c.x, c.y).toFixed(4)} ` +
            `aspect=${aspect ? aspectScore(c.kind, aspect).toFixed(2) : 'n/a'}` +
            `${c === best ? ' <-- WINNER' : ''}`,
        );
    }
    console.log(
        `[D-TGL] §DIAG-STAIR winner kind=${best.kind} pos=${classify(best)} ` +
        `waste=${r3(bestWaste)} plate=${Math.round(plateW)}x${Math.round(plateH)} ` +
        `core=${Math.round(coreW)}x${Math.round(coreH)} aspectBias=${aspect ? 'on' : 'off'} ` +
        `${classify(best) === 'CENTRAL' || classify(best) === 'MID-EDGE'
            ? '(predicts plate fragmentation — rooms may merge)'
            : '(clean corner carve — one dominant rect)'}`,
    );

    return { x: best.x, y: best.y, waste: r3(bestWaste), kind: best.kind };
}

/**
 * §STAIR-WORST-ASPECT — derive the plate-local sun direction from a site latitude.
 * Reuses the SAME convention as the window-orientation engine: the equator-facing
 * direction in the emit frame is (x=East, y=South where +y is increasing plan-Z =
 * the BACK/max-Z wall). Northern hemisphere → sun toward +y; Southern → −y. Near
 * the equator (|lat| < 10°) there is no clear preference → null (aspect-neutral).
 *
 * Kept here (not imported from windowEmission) so stairPosition stays a leaf with
 * zero cross-module coupling; the threshold + sign match `equatorFacingDir`.
 */
export function aspectFromSunDir(latDeg: number | undefined): { x: number; y: number } | null {
    if (latDeg === undefined || !Number.isFinite(latDeg) || Math.abs(latDeg) < 10) return null;
    return latDeg >= 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
}

export {
    stairCorePositionCandidates as __candidatesForTest,
    stairCoreWaste as __wasteForTest,
    aspectScore as __aspectScoreForTest,
};
