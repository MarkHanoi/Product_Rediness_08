// plateFill.ts — §PLATE-FILLS (L-13243, founder 2026-09-07: *"when the 3d site is cut on
// \"rectangle\" the full scope should be with buildings - atm is being kept still on circular"*).
//
// ⭐⭐ THE FINDING, AND IT IS ARITHMETIC RATHER THAN TASTE: **A NEAREST-FIRST CAP OVER A RECTANGLE
// DRAWS A DISC.** Sort a set spread over a plate by distance and truncate at N, and the kept set is
// by definition the largest disc the budget affords. A rectangle's CORNERS are its farthest points,
// so they are exactly what the truncation sheds first — and it sheds them completely, not thinly.
// The founder's screenshot is that sentence: a dense circle of buildings inside a square plate.
//
// ⛔ THE HYPOTHESIS THIS FILE EXISTS TO REPLACE WAS WRONG, AND IT WAS THE OBVIOUS ONE. *"The far
// tier is cut by RADIUS while the scope is a RECTANGLE, so the radius inscribes a circle and empties
// the corners."* The arithmetic refutes it: `farTierRadiusM(scope)` is `scopeOuterRadiusM` — the
// CIRCUMSCRIBING half-diagonal (2 519 m square ⇒ 1 259.36 × √2 = 1 781 m, which is the number the
// founder's own log prints). That disc has area π·1 781² = 9.97 km² against the plate's 6.35 km²:
// it is a strict SUPERSET of the plate and clips no corner. Measured on the shipped tiles, the
// far-on-plate count is identical before and after the radial cull at every city and scope tried.
// **The circle he can see is drawn by `slice(0, cap)`, and its radius (1 264 m at his Paris default)
// is 517 m SHORTER than the radial cull could ever impose.**
//
// ⭐ SO THE FIX IS THE CAP'S **ORDERING**, NOT ITS **VALUE**, AND THE MEASUREMENT SETTLES WHICH.
// At Paris r=3 562 m the budget is ALREADY pinned at BOTH ceilings (`CTX_TOTAL_MAX_BUILDINGS_CEILING`
// 30 000 and `CTX_FAR_TIER_MAX_INSTANCES_CEILING` 24 000) and the corners are still **0 of 34 282**.
// At Dubai r=7 000 m, same — both ceilings pinned, corners 0 of 9 552. **Raising every cap to its
// maximum does not remove the circle; it only enlarges it.** An ordering change makes the drawn set
// plate-shaped at EVERY scope for the same budget, the same draw calls and the same triangle count —
// which is why this lane raises no constant at all (C66 §1: no capacity tier may be described as
// supported while it is CLAIMED, and no GPU capture stands behind any of the four numbers).
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE RULE, IN ONE SENTENCE: **KEEP A CORE AT FULL DENSITY, THEN SPEND WHAT IS LEFT AT A UNIFORM
// RATE ACROSS THE WHOLE REMAINDER OF THE PLATE — CORNERS INCLUDED.**
//
//   · CORE — the nearest `coreShareOfCap × cap` candidates, i.e. a disc. A disc is the RIGHT shape
//     for "nothing near you is lost": the slider caption has always promised it and the near field
//     is what the founder's camera is in. The disc is only a defect when it is the WHOLE drawn set.
//   · RIM  — everything else, decimated at ONE rate. The plate is bucketed into a fixed grid and
//     each cell keeps its PROPORTIONAL share (largest-remainder apportionment, so the total is
//     exactly the residual budget and every cell lands within 1 of its share). A cell in the corner
//     and a cell on the axis therefore keep the SAME FRACTION of what they hold — density falls
//     evenly instead of collapsing to a disc.
//   · WITHIN A CELL — largest first. The thinning sheds garages and sheds before it sheds blocks,
//     so a thinner plate still reads as the same city rather than as a different, emptier one.
//
// ⭐ WHY A GRID AND NOT A STRIDE. A stride over the distance-sorted list also gives a uniform RATE,
// and it is cheaper — but the choice WITHIN a distance shell would then be tile order, so a sector
// whose footprints happen to decode late thins more than its neighbour. The grid makes the rate
// uniform in BOTH dimensions, which is the property the founder is looking at.
//
// ⚠ WHAT THIS DOES NOT DO, STATED SO NOBODY READS MORE INTO IT (§CONTEXT-DATA-HONESTY): it does not
// draw more buildings. The budget is unchanged to the unit. Past the cap the plate is genuinely
// THINNER, everywhere, and the scope caption must say so — an even, thinner plate beats a dense
// disc, but it is not a full plate and must never be captioned as one.
//
// ⛔ LEAF MODULE, PURE, NO CESIUM, NO DOM, NO `SiteScope` IMPORT. It takes metres and a count; the
// two call sites (`contextBuildings.selectFarRingFootprints` — the whole-scene far-ring cap — and
// `CesiumViewport.renderContextFarTierInstanced` — the instanced-tier cap) supply their own
// projection. Two caps in series with two orderings would have re-drawn the disc at the second one,
// which is this repo's `three-invalidation-gates-in-series` scar (L-813) exactly.
//
// P8 — no OTel span, matching every pure sibling in this directory (`scopeClip`, `siteScope`,
// `contextExtentBudget`): this runs once per context load over tens of thousands of footprints on
// the render hot path, and the loaders that call it are already instrumented.

/** One candidate's position on the plate, in metres about the plate centre, plus its size proxy. */
export interface PlateFillPoint {
    /** EAST offset from the plate centre, metres. */
    readonly eM: number;
    /** NORTH offset from the plate centre, metres. */
    readonly nM: number;
    /** Radial distance from the plate centre, metres. Passed in so a caller reuses the one it has. */
    readonly distM: number;
    /**
     * A COMPARABLE size proxy — bigger survives the thinning first. Any monotone-in-plan-area value
     * works (the comparison is only ever made between two candidates in the SAME grid cell, so a
     * proxy that is off by a per-latitude constant is exact for this purpose). 0 = unknown, which
     * sorts last and is a real answer, never an error.
     */
    readonly weight: number;
}

/** The knobs. Supplied by `contextExtentBudget` at the two production call sites; defaulted here so
 *  the module is usable — and testable — on its own. */
export interface PlateFillTuning {
    /**
     * Share of the cap spent on the FULL-DENSITY core disc, 0..1. 0.5 is deliberate and it is a
     * balance of two failures, not a tuned value: at 0 the immediate neighbourhood thins as hard as
     * the rim (the founder's camera is IN the near field), and at 1 this degenerates back into the
     * nearest-first disc that is the whole defect. Half the budget on the nearest half leaves the
     * rim a rate of `(cap/2) / (candidates − cap/2)`, which is what the caption must state.
     */
    readonly coreShareOfCap: number;
    /** Target grid cell edge, metres. Small enough that a cell is a block or two; large enough that
     *  cell counts stay statistically meaningful rather than 0/1 noise. */
    readonly cellTargetM: number;
    readonly minCellsPerAxis: number;
    readonly maxCellsPerAxis: number;
}

export const PLATE_FILL_DEFAULT_TUNING: PlateFillTuning = {
    coreShareOfCap: 0.5,
    cellTargetM: 150,
    minCellsPerAxis: 4,
    maxCellsPerAxis: 64,
};

export interface PlateFillOptions {
    /** The count budget. `<= 0` means "no cap" — everything is kept, matching the far ring's convention. */
    readonly cap: number;
    /**
     * The plate's CIRCUMSCRIBING radius in metres — the half-side of the square the grid spans.
     * Omitted ⇒ the largest candidate distance is used, so the grid still covers every candidate.
     * (It is only ever used to SIZE and PLACE the grid; nothing is culled by it here.)
     */
    readonly plateRadiusM?: number;
    readonly tuning?: Partial<PlateFillTuning>;
}

/** What the selection did — every number the console line and the honesty caption need. */
export interface PlateFillReport {
    readonly candidates: number;
    readonly cap: number;
    readonly kept: number;
    /** Kept at FULL density (the core disc). */
    readonly coreKept: number;
    /** Radius of that disc, metres — the distance of its farthest member. 0 when the core is empty. */
    readonly coreRadiusM: number;
    readonly rimCandidates: number;
    readonly rimKept: number;
    /** `rimKept / rimCandidates` — the ONE rate the rim is thinned at, everywhere. 1 = untouched. */
    readonly rimRate: number;
    readonly cellsPerAxis: number;
    readonly cellsOccupied: number;
    /** `true` when the cap bit at all. `false` ⇒ every candidate is drawn and the rate is 1. */
    readonly capBinds: boolean;
    /** The sentence a caller logs (C12 §13.5: numbers, never a bare "some were dropped"). */
    readonly line: string;
}

export interface PlateFillResult<T> {
    /** The kept items, ordered nearest-first (so a downstream consumer sees the same order it did). */
    readonly kept: T[];
    readonly report: PlateFillReport;
}

function clampInt(v: number, lo: number, hi: number): number {
    if (!Number.isFinite(v)) return lo;
    return v < lo ? lo : v > hi ? hi : Math.round(v);
}

function reportLine(r: Omit<PlateFillReport, 'line'>): string {
    if (!r.capBinds) {
        return `plate fill: ${r.kept} of ${r.candidates} kept — the cap (${r.cap}) does not bite, ` +
            'so the plate is drawn complete to its corners';
    }
    return `plate fill: ${r.kept} of ${r.candidates} kept — ${r.coreKept} at FULL density inside ` +
        `${Math.round(r.coreRadiusM)} m, then the rim thinned EVENLY to 1 in ` +
        `${(1 / Math.max(r.rimRate, 1e-9)).toFixed(1)} across ${r.cellsOccupied} occupied cell(s) of a ` +
        `${r.cellsPerAxis}×${r.cellsPerAxis} grid — the corners keep the SAME fraction as the axes, ` +
        `so the drawn set has the SHAPE OF THE PLATE (§PLATE-FILLS). ⚠ ${r.candidates - r.kept} ` +
        'on-plate footprint(s) are NOT drawn: this is a thinner plate, not a full one.';
}

/**
 * §PLATE-FILLS — spend `cap` over `items` so the kept set has the SHAPE OF THE PLATE.
 *
 * PURE. Deterministic — no RNG, no `Math.random`, no reliance on input order beyond a stable
 * index tiebreak, so the same read produces the same city twice. Never throws: a malformed point
 * (NaN offsets) lands in an edge cell rather than being dropped, because dropping it silently is
 * the failure this whole family exists to stop.
 *
 * Returns EXACTLY `cap` items when `cap < items.length` (the apportionment distributes its
 * remainder), and every item otherwise.
 */
export function selectPlateFill<T>(
    items: readonly T[],
    project: (item: T) => PlateFillPoint,
    options: PlateFillOptions,
): PlateFillResult<T> {
    const tuning: PlateFillTuning = { ...PLATE_FILL_DEFAULT_TUNING, ...(options.tuning ?? {}) };
    const n = items.length;
    const cap = Math.floor(options.cap);

    const pts: PlateFillPoint[] = new Array(n);
    for (let i = 0; i < n; i++) pts[i] = project(items[i]!);

    // Nearest-first index order — the core takes its prefix, and the result is returned in it.
    const order: number[] = new Array(n);
    for (let i = 0; i < n; i++) order[i] = i;
    order.sort((a, b) => {
        const da = pts[a]!.distM, db = pts[b]!.distM;
        const fa = Number.isFinite(da) ? da : Infinity;
        const fb = Number.isFinite(db) ? db : Infinity;
        return fa === fb ? a - b : fa - fb;
    });

    if (cap <= 0 || n <= cap) {
        const kept = order.map((i) => items[i]!);
        const base = {
            candidates: n, cap, kept: kept.length, coreKept: kept.length,
            coreRadiusM: n > 0 ? (pts[order[n - 1]!]!.distM || 0) : 0,
            rimCandidates: 0, rimKept: 0, rimRate: 1,
            cellsPerAxis: 0, cellsOccupied: 0, capBinds: false,
        };
        return { kept, report: { ...base, line: reportLine(base) } };
    }

    // ── CORE — the nearest slice, at FULL density. "Nothing near you is lost." ───────────────
    const coreShare = Math.min(1, Math.max(0, tuning.coreShareOfCap));
    const coreCount = Math.min(n, Math.floor(cap * coreShare));
    const coreRadiusM = coreCount > 0 ? (pts[order[coreCount - 1]!]!.distM || 0) : 0;

    // ── RIM — everything else, decimated at ONE rate over a grid that covers the whole plate ──
    const rimIdx = order.slice(coreCount);
    const rimCandidates = rimIdx.length;
    const residual = Math.max(0, cap - coreCount);

    let radiusM = options.plateRadiusM;
    if (!Number.isFinite(radiusM as number) || (radiusM as number) <= 0) {
        let maxD = 0;
        for (let i = 0; i < n; i++) { const d = pts[i]!.distM; if (Number.isFinite(d) && d > maxD) maxD = d; }
        radiusM = maxD;
    }
    const R = Math.max(1, radiusM as number);
    const cellsPerAxis = clampInt((2 * R) / tuning.cellTargetM, tuning.minCellsPerAxis, tuning.maxCellsPerAxis);
    const cellOf = (p: PlateFillPoint): number => {
        const e = Number.isFinite(p.eM) ? p.eM : 0;
        const nn = Number.isFinite(p.nM) ? p.nM : 0;
        const cx = clampInt(Math.floor(((e + R) / (2 * R)) * cellsPerAxis), 0, cellsPerAxis - 1);
        const cz = clampInt(Math.floor(((nn + R) / (2 * R)) * cellsPerAxis), 0, cellsPerAxis - 1);
        return cz * cellsPerAxis + cx;
    };

    const buckets = new Map<number, number[]>();
    for (const i of rimIdx) {
        const key = cellOf(pts[i]!);
        const b = buckets.get(key);
        if (b) b.push(i); else buckets.set(key, [i]);
    }

    // Largest-remainder apportionment: every cell keeps its PROPORTIONAL share, and the leftover
    // goes to the cells with the largest fractional claim. Exact by construction (Σ quota = residual)
    // and deterministic (cell key breaks a tie, never insertion order).
    const rate = rimCandidates > 0 ? residual / rimCandidates : 0;
    const cells = [...buckets.entries()].sort((a, b) => a[0] - b[0]);
    const quota = new Map<number, number>();
    const remainders: Array<{ key: number; frac: number; room: number }> = [];
    let assigned = 0;
    for (const [key, list] of cells) {
        const exact = list.length * rate;
        const base = Math.min(list.length, Math.floor(exact));
        quota.set(key, base);
        assigned += base;
        remainders.push({ key, frac: exact - base, room: list.length - base });
    }
    let leftover = residual - assigned;
    if (leftover > 0) {
        remainders.sort((a, b) => (b.frac - a.frac) || (a.key - b.key));
        for (const r of remainders) {
            if (leftover <= 0) break;
            if (r.room <= 0) continue;
            const give = Math.min(r.room, leftover);
            quota.set(r.key, (quota.get(r.key) ?? 0) + give);
            leftover -= give;
        }
    }

    // Within a cell: LARGEST first (shed the sheds before the blocks), nearest as the tiebreak,
    // input index last so the result is stable across identical reads.
    const keptIdx: number[] = order.slice(0, coreCount);
    let rimKept = 0;
    for (const [key, list] of cells) {
        const q = quota.get(key) ?? 0;
        if (q <= 0) continue;
        if (q >= list.length) { for (const i of list) keptIdx.push(i); rimKept += list.length; continue; }
        list.sort((a, b) => {
            const wa = Number.isFinite(pts[a]!.weight) ? pts[a]!.weight : 0;
            const wb = Number.isFinite(pts[b]!.weight) ? pts[b]!.weight : 0;
            if (wa !== wb) return wb - wa;
            const da = pts[a]!.distM, db = pts[b]!.distM;
            if (da !== db) return (Number.isFinite(da) ? da : Infinity) - (Number.isFinite(db) ? db : Infinity);
            return a - b;
        });
        for (let k = 0; k < q; k++) keptIdx.push(list[k]!);
        rimKept += q;
    }

    keptIdx.sort((a, b) => {
        const da = pts[a]!.distM, db = pts[b]!.distM;
        const fa = Number.isFinite(da) ? da : Infinity;
        const fb = Number.isFinite(db) ? db : Infinity;
        return fa === fb ? a - b : fa - fb;
    });

    const base = {
        candidates: n, cap, kept: keptIdx.length, coreKept: coreCount, coreRadiusM,
        rimCandidates, rimKept, rimRate: rimCandidates > 0 ? rimKept / rimCandidates : 1,
        cellsPerAxis, cellsOccupied: cells.length, capBinds: true,
    };
    return { kept: keptIdx.map((i) => items[i]!), report: { ...base, line: reportLine(base) } };
}
