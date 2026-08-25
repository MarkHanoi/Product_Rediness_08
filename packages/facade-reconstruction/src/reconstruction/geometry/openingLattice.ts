// C108 §3.4 / SPEC S9 (brief §7) — THE LATTICE, DERIVED FROM THE DETECTED OPENINGS.
//
// ⭐ WHY THIS FILE EXISTS, AND WHAT IT REPLACES AS THE *PRIMARY* SOURCE.
//
// The pipeline used to compute the zone/bay lattice from an INDEPENDENT signal —
// the row/column gradient projection profile — and then fit the detected openings
// into whatever grid that signal produced. On the founder's first real photograph
// (L-11001, 2026-08-25) the profile comb returned a period of half the extent on
// BOTH axes, so the lattice was 2 zones x 2 bays = FOUR CELLS on a seven-storey,
// five-bay building. Four openings matched because four was the total number of
// cells that existed; the other ~34 detections became outliers; the five arcade
// arches were never examined because archness is fitted per MATCHED CELL.
//
// His own reading of it is the design of this file:
//
//     "it clearly can identify the windows — so therefore the levels too? same with
//      vertical [bays] — as it understands the opening also the vertical lines?"
//
// He is right. ~40 opening boxes on a 5 x 7 grid ALREADY ENCODE the floor lines and
// the bay lines. Computing the lattice from a second, weaker signal and then trying
// to reconcile the two is the defect — the openings ARE the measurement.
//
// ── THE MECHANISM THE PROFILE COMB FAILS BY, MEASURED (§L-10971) ─────────────
// `scoreComb` scores a comb as (mean profile value AT the teeth) / (mean everywhere).
// That ratio REWARDS FEWER TEETH: a comb at twice the true period hits half the
// lines and is free to hit the STRONGEST half. On a perfectly uniform synthetic
// facade every line is equally strong, the fundamental and its first harmonic tie,
// and `fitComb`'s "prefer the shortest period within 5%" tie-break rescues it. On
// anything with real variation the harmonic scores STRICTLY BETTER and the tie-break
// never runs. Measured on corpus case L: clean, rows lock to period 68.9 (7 zones,
// correct); with additive noise of ±6 levels — a fraction of what a camera adds —
// they lock to 139.5, EXACTLY DOUBLE, at a HIGHER fit (0.822 vs 0.800), and the
// lattice collapses 8 zones -> 4, matched 30 -> 20, outliers 0 -> 33.
//
// ⛔ THE PROFILE PATH IS NOT DELETED. It remains the FALLBACK for a facade whose
// openings do not support a lattice (too few, or no repetition), and it remains a
// CROSS-CHECK that is reported in the stage notes when the two disagree. A
// disagreement is information: it is the pipeline saying "the wall says one thing
// and the windows say another", which is exactly what a human wants to know.
//
// ── ANTI-OVERFIT (brief §22, C108 §9) ───────────────────────────────────────
// Nothing here knows about floors, bays, arcades or buildings. It knows that
// openings on a facade repeat, that a repeated thing clusters along an axis, and
// that the SPACING between clusters is a measured quantity. Every threshold below
// is expressed as a fraction of a quantity MEASURED FROM THIS IMAGE (the median
// opening size, the median cluster spacing, the median cluster support) and never as
// a count, a pixel size or a building property.

import type { Rect } from '../../contracts/RasterImage.js';
import type { FacadeReconstructionOptions } from '../../contracts/Options.js';

/** The axis a lattice is derived along. `x` gives bays, `y` gives zones. */
export type LatticeAxis = 'x' | 'y';

export interface OpeningLattice {
    readonly axis: LatticeAxis;
    /** Accepted line positions in samples, ascending. One per zone/bay. */
    readonly centres: readonly number[];
    /** Band edges in samples, ascending, always starting at 0 and ending at `extent`. */
    readonly boundaries: readonly number[];
    /** How many openings voted for each accepted centre, in `centres` order. */
    readonly support: readonly number[];
    /** Median spacing between adjacent centres, in samples. The MEASURED pitch. */
    readonly pitch: number;
    /** Median cluster support — the evidence behind a typical line. */
    readonly medianSupport: number;
    /**
     * Cluster tightness in [0,1]: 1 = every voting opening sits exactly on its line.
     *
     * C108 §4.3 names "cluster tightness" as a legitimate own-support term, and this
     * is that term literally. It is NOT derived from any other confidence.
     */
    readonly tightness: number;
    /** Lines INSERTED into an integer-multiple gap — a bay/zone with no openings. */
    readonly interpolated: number;
    /** Lines added beyond the outermost cluster because a whole pitch still fitted. */
    readonly extended: number;
    /** Clusters REJECTED for insufficient support — aperiodic clutter. */
    readonly rejected: number;
    /**
     * §L-11121 — clusters REJECTED as CONTINUOUS OBJECTS: a column (or row) whose
     * voters are slices of ONE vertically (horizontally) continuous thing, cut into
     * per-storey chunks by slab shadows, rather than distinct repeating openings.
     * Each entry is the member indices into the `blobs` the lattice was derived
     * from, so the caller can reunite them into ONE feature instead of N openings.
     */
    readonly continuousMembers: readonly (readonly number[])[];
    /** Why the derivation refused, when it did. `null` when it succeeded. */
    readonly refusedReason: string | null;
}

/** The ascending-sorted lower median. Stated so ties are a total order (C108 §5.2). */
function median(values: readonly number[]): number {
    if (values.length === 0) return 0;
    const s = [...values].sort((a, b) => a - b);
    return s[Math.floor((s.length - 1) / 2)]!;
}

function centreOf(bbox: Rect, axis: LatticeAxis): number {
    return axis === 'x' ? (bbox.x0 + bbox.x1) / 2 : (bbox.y0 + bbox.y1) / 2;
}

function sizeOf(bbox: Rect, axis: LatticeAxis): number {
    return axis === 'x' ? bbox.x1 - bbox.x0 : bbox.y1 - bbox.y0;
}

function refusal(axis: LatticeAxis, reason: string): OpeningLattice {
    return {
        axis,
        centres: [],
        boundaries: [],
        support: [],
        pitch: 0,
        medianSupport: 0,
        tightness: 0,
        interpolated: 0,
        extended: 0,
        rejected: 0,
        continuousMembers: [],
        refusedReason: reason,
    };
}

/**
 * Cluster detected-opening centres along one axis into the facade's lines.
 *
 * Returns a lattice, or a REFUSAL carrying the reason. A refusal is a real answer —
 * a facade with three irregular holes in it has no lattice, and the caller falls
 * back to the projection profile rather than being handed an invented one.
 *
 * @param blobs   every detection, unfiltered. Filtering happens here, by MEASURED
 *                size and MEASURED support, so the caller needs no policy.
 * @param axis    `x` for bay lines, `y` for zone lines.
 * @param extent  the rectified facade's size along `axis`, in samples.
 */
export function deriveLatticeFromOpenings(
    blobs: readonly { readonly bbox: Rect }[],
    axis: LatticeAxis,
    extent: number,
    opts: FacadeReconstructionOptions,
): OpeningLattice {
    if (blobs.length < 2 || extent < 4) {
        return refusal(axis, `only ${blobs.length} detection(s) — a lattice needs repetition`);
    }

    // ── 1. THE SIZE BAND ────────────────────────────────────────────────────
    // An object several bays wide contributes ONE centre, at its own middle, and
    // that middle is not a bay line. Corpus case B's ground-floor opening spans
    // 4.4 bays; case F's central element spans every storey. Both must be kept out
    // of the vote for the axis they span, and both are excluded by SIZE relative to
    // the median opening — a measured quantity, not a building property.
    //
    // The band is two-sided: a speck a fraction of a window is no more a vote for a
    // line than a slab is.
    const sizes = blobs.map((b) => sizeOf(b.bbox, axis));
    const medianSize = median(sizes);
    if (!(medianSize > 0)) return refusal(axis, 'degenerate opening sizes');
    const lo = medianSize / opts.openingLatticeSizeBandFactor;
    const hi = medianSize * opts.openingLatticeSizeBandFactor;
    // ⭐ §L-11125 — THE BAND IS TWO-DIMENSIONAL. On the founder's real photograph the
    // corner balconies wrap the rounded ends and their railings are detected as
    // blobs at the far left and right — WINDOW-WIDE, so they pass a band measured
    // along x alone, but a third of a window TALL. Six storeys of them voted two
    // phantom bay lines at the edges. A window-sized object is window-sized on
    // BOTH axes; the orthogonal size is checked against the same factor and the
    // same median statistic (the orthogonal median of the blob set), so no second
    // constant enters.
    const ortho: LatticeAxis = axis === 'x' ? 'y' : 'x';
    const orthoSizes = blobs.map((b) => sizeOf(b.bbox, ortho));
    const medianOrtho = median(orthoSizes);
    const loO = medianOrtho / opts.openingLatticeSizeBandFactor;
    const hiO = medianOrtho * opts.openingLatticeSizeBandFactor;
    const voters: { centre: number; idx: number }[] = [];
    for (let i = 0; i < blobs.length; i++) {
        const s = sizes[i]!;
        if (s < lo || s > hi) continue;
        const o = orthoSizes[i]!;
        if (medianOrtho > 0 && (o < loO || o > hiO)) continue;
        voters.push({ centre: centreOf(blobs[i]!.bbox, axis), idx: i });
    }
    if (voters.length < 2) {
        return refusal(axis, `only ${voters.length} detection(s) within the size band`);
    }
    voters.sort((a, b) => a.centre - b.centre);

    // ── 2. 1-D CLUSTERING BY GAP ────────────────────────────────────────────
    // Openings in the SAME bay differ in centre by jitter; openings in ADJACENT
    // bays differ by the bay pitch. The separating threshold is a fraction of the
    // MEDIAN OPENING SIZE, and that choice is geometric rather than tuned: an
    // opening cannot be wider than the cell that contains it, so half an opening
    // width is always strictly less than half a pitch — the gap between two
    // adjacent lines can never fall below it, and the jitter within one line is
    // essentially never above it.
    //
    // Kernel-density peak-picking would do the same job; gap clustering is chosen
    // because it needs no bandwidth constant of its own and no peak-prominence
    // threshold, so it adds ONE named number instead of three.
    const gapThreshold = medianSize * opts.openingLatticeGapFactor;
    const groups: { centre: number; idx: number }[][] = [[voters[0]!]];
    for (let i = 1; i < voters.length; i++) {
        const v = voters[i]!;
        const current = groups[groups.length - 1]!;
        if (v.centre - current[current.length - 1]!.centre > gapThreshold) groups.push([v]);
        else current.push(v);
    }

    // ── 3. THE SUPPORT FILTER ───────────────────────────────────────────────
    // ⭐ THE GUARD THAT KEEPS CLUTTER FROM MINTING A BAY. Corpus case H draws two
    // aperiodic foreground objects in the wall gaps; each is one vote at a position
    // no line occupies. A line supported by ONE opening where the typical line is
    // supported by four is not a line, it is an object — and the comparison is to
    // the MEDIAN support of this image, never to a constant.
    const rawCentres = groups.map((g) => g.reduce((a, b) => a + b.centre, 0) / g.length);
    const rawSupport = groups.map((g) => g.length);
    const medianSupport = median(rawSupport);
    if (medianSupport < 2) {
        // Every line has a single voter, so "line" and "object" are indistinguishable
        // by repetition and there is nothing here to be confident about. The profile
        // fallback may still find structure in the WALL that the openings cannot.
        return refusal(axis, `median line support ${medianSupport} — no repetition to cluster`);
    }
    const minSupport = medianSupport * opts.openingLatticeMinSupportRatio;
    let kept: { centre: number; support: number; members: number[]; idx: number[] }[] = [];
    for (let i = 0; i < groups.length; i++) {
        if (rawSupport[i]! < minSupport) continue;
        kept.push({
            centre: rawCentres[i]!,
            support: rawSupport[i]!,
            members: groups[i]!.map((v) => v.centre),
            idx: groups[i]!.map((v) => v.idx),
        });
    }
    const rejected = groups.length - kept.length;

    // ── 3b. THE CONTINUITY SCREEN (§L-11121 / L-11122, corpus case M) ────────
    // ⭐ THE DEFECT THE FOUNDER'S SECOND PHOTOGRAPH FOUND. A full-height glass-block
    // strip is split by the light slab faces into per-storey chunks the size of a
    // window; each chunk is a vote, the votes line up, support reads 7 — and the
    // clusterer above cannot tell a column of SLICES OF ONE OBJECT from a column of
    // REPEATING OPENINGS. It minted a phantom bay and lost the strip as a feature.
    //
    // What distinguishes them is measurable along the ORTHOGONAL axis: between two
    // windows in the same bay there is wall — sill, lintel, spandrel — a gap
    // comparable to the window itself. Between two slices of one strip there is
    // only the slab shadow that cut it: a gap that is a small fraction of the slice.
    // So per column we measure (LARGEST gap between consecutive members) / (median
    // member size), and compare each column's ratio to the MEDIAN RATIO OF THIS
    // IMAGE'S OTHER COLUMNS — never to a constant. A column far below its peers is
    // one thing, not many, and it must not vote a line.
    //
    // ⛔ THE LARGEST GAP, DELIBERATELY. "One object" means there is no real break
    // anywhere along it. Corpus case H found the alternative wrong: with the MEDIAN
    // gap, a real column that two foreground objects had joined read a small median
    // and was thrown away with its four windows. A column with even ONE wall-sized
    // break is a column of things, whatever clutter sits between them.
    //
    // ⚠ Applied only with three or more supported lines: with two, the median is
    // one of the two and a strip can never fall below itself — the screen stays
    // conservative rather than guessing.
    //
    // Case M measures: window columns ~0.8, the strip column ~0.05. The factor is
    // the SAME family of relative constant as `openingLatticeMinSupportRatio`, and
    // any value from 0.1 to 0.9 separates them — it was not chosen to make the case
    // pass (C108 §9); it sits in the middle of a 16x margin.
    const continuousMembers: number[][] = [];
    const vacated: number[] = [];
    // ⛔ COLUMNS ONLY (§L-11126). The founder's real photograph found the row
    // analogue misfiring: an ARCADE is a row of openings separated by thin piers,
    // and its largest horizontal gap is a small fraction of an arch — exactly the
    // signature of a sliced strip, read along the other axis. The screen removed
    // the ground-floor row and the lattice read 6 zones on a 7-storey building.
    // The physical phenomenon this screen exists for — a full-height element cut
    // into per-storey slices by slab shadows — is VERTICAL; nothing in the corpus
    // or either real photograph shows a horizontal band sliced by pier shadows,
    // while arcades with thin piers are everywhere. Rows are exempt until a
    // measured case says otherwise (C108 §9: no rule without ground truth).
    if (axis === 'x' && kept.length >= 3) {
        const ratioOf = (k: { idx: number[] }): number | null => {
            if (k.idx.length < 2) return null;
            const boxes = k.idx
                .map((i) => blobs[i]!.bbox)
                .sort((a, b) => (ortho === 'y' ? a.y0 - b.y0 : a.x0 - b.x0));
            const gaps: number[] = [];
            for (let i = 1; i < boxes.length; i++) {
                const prev = boxes[i - 1]!;
                const next = boxes[i]!;
                gaps.push(Math.max(0, ortho === 'y' ? next.y0 - prev.y1 : next.x0 - prev.x1));
            }
            const size = median(boxes.map((b) => sizeOf(b, ortho)));
            return size > 0 ? Math.max(...gaps) / size : null;
        };
        const ratios = kept.map(ratioOf);
        const measuredRatios = ratios.filter((r): r is number => r !== null);
        if (measuredRatios.length >= 3) {
            const medianRatio = median(measuredRatios);
            const cut = medianRatio * opts.openingLatticeContinuityRatio;
            const survivors: typeof kept = [];
            for (let i = 0; i < kept.length; i++) {
                const r = ratios[i] ?? null;
                if (r !== null && r < cut) {
                    continuousMembers.push(kept[i]!.idx);
                    vacated.push(kept[i]!.centre);
                } else survivors.push(kept[i]!);
            }
            kept = survivors;
        }
    }
    if (kept.length < opts.openingLatticeMinLines) {
        return refusal(axis, `${kept.length} supported line(s) — below the minimum of ${opts.openingLatticeMinLines}`);
    }

    // ── 4. THE PITCH, AND THE LINES THAT HAVE NO OPENINGS ───────────────────
    // A bay whose windows were all bricked up, an arcade whose arches the detector
    // missed, a storey behind a tree: the LINE still exists and the gap that
    // contains it is an INTEGER MULTIPLE of the measured pitch. Filling those is
    // measurement, not assumption — the alternative is a lattice that silently
    // renumbers every bay after the gap.
    const centres = kept.map((k) => k.centre);
    const spacings: number[] = [];
    for (let i = 1; i < centres.length; i++) spacings.push(centres[i]! - centres[i - 1]!);
    const pitch = median(spacings);
    if (!(pitch > 0)) return refusal(axis, 'degenerate line spacing');

    const filled: number[] = [centres[0]!];
    let interpolated = 0;
    for (let i = 1; i < centres.length; i++) {
        const a = centres[i - 1]!;
        const b = centres[i]!;
        const ratio = (b - a) / pitch;
        const k = Math.round(ratio);
        if (k >= 2 && Math.abs(ratio - k) <= opts.openingLatticeGapIntegerTolerance) {
            for (let j = 1; j < k; j++) {
                const candidate = a + ((b - a) * j) / k;
                // ⛔ A slot the continuity screen VACATED is not a bay whose windows
                // went unreported — it is where the continuous object stands. Refilling
                // it would reinstate the phantom line by another route (case M read 6
                // bays after the screen for exactly this reason). The object is the
                // caller's feature; the lattice leaves its slot to the neighbours.
                if (vacated.some((v) => Math.abs(v - candidate) <= gapThreshold)) continue;
                filled.push(candidate);
                interpolated++;
            }
        }
        filled.push(b);
    }

    // ── 5. THE EDGES ────────────────────────────────────────────────────────
    // Same argument, applied outward: if a WHOLE pitch still fits between the
    // outermost line and the edge of the facade, there is room for another line
    // there and the openings simply did not report it. Corpus case B is exactly
    // this — its lowest storey is one wide opening that the size band excludes, so
    // without this step the ground zone vanishes from the lattice entirely.
    //
    // ⛔ Keyed on the MEASURED pitch and the MEASURED extent. It is not "add a
    // ground floor"; it is "a full period of space is not part of its neighbour".
    let extended = 0;
    while (filled[0]! - pitch > 0) {
        filled.unshift(filled[0]! - pitch);
        extended++;
    }
    while (filled[filled.length - 1]! + pitch < extent) {
        filled.push(filled[filled.length - 1]! + pitch);
        extended++;
    }

    // ── 6. BOUNDARIES ───────────────────────────────────────────────────────
    // Midway between adjacent lines, with the facade's own edges closing the ends.
    // The bands therefore tile [0, extent] exactly, with no gap and no overlap —
    // which is what C108 §2.1 requires of the zones it produces.
    const boundaries: number[] = [0];
    for (let i = 1; i < filled.length; i++) boundaries.push((filled[i - 1]! + filled[i]!) / 2);
    boundaries.push(extent);

    // ── 7. TIGHTNESS — this stage's OWN support (C108 §4.3) ─────────────────
    // Deviation of the voting centres about their own line, as a fraction of the
    // pitch. A lattice whose openings sit dead on its lines is strong evidence; one
    // whose openings scatter a quarter of a pitch is none.
    //
    // ⛔ §CONF72 (L-11220) — MEDIAN deviation about the cluster MEDIAN, not mean
    // about mean. The founder's photograph measured what the mean could not survive:
    // ONE railing-merged blob sitting mid-bay chained two columns into a single
    // cluster of 13 votes (the gap clusterer is transitive), the cluster MEAN landed
    // half a pitch from either column, and the mean deviation of a lattice whose
    // other six columns were dead on their lines read 0.236 of a pitch — tightness
    // 0.055 on a 7 × 5 grid the count had read correctly. The median deviation about
    // the median centre reads the six good columns; the chained one is an outlier
    // the count reports and the confidence must not be destroyed by.
    const deviations: number[] = [];
    for (const k of kept) {
        if (k.members.length < 2) continue;
        const centre = median(k.members);
        for (const m of k.members) deviations.push(Math.abs(m - centre));
    }
    const spread = deviations.length > 0 ? median(deviations) / pitch : 0;
    const tightness = Math.max(0, Math.min(1, 1 - spread / opts.openingLatticeTightnessScale));

    // §CONF72 — the support behind a TYPICAL LINE is measured over the lines that
    // survived the support filter and the continuity screen, never over the raw
    // groups: a rejected clutter cluster of one vote is not a line, and letting it
    // drag the median down reported "3 of 7" on a lattice whose lines each carried
    // 5 to 7 openings. The `< 2` refusal above still reads the RAW median, so an
    // image with no repetition at all still refuses before anything is kept.
    const keptMedianSupport = median(kept.map((k) => k.support));

    return {
        axis,
        centres: filled,
        boundaries,
        support: kept.map((k) => k.support),
        pitch,
        medianSupport: keptMedianSupport,
        tightness,
        interpolated,
        extended,
        rejected,
        continuousMembers,
        refusedReason: null,
    };
}

/** True when a derivation produced a usable lattice rather than a refusal. */
export function latticeIsUsable(lattice: OpeningLattice): boolean {
    return lattice.refusedReason === null && lattice.centres.length >= 2;
}

/**
 * The confidence of one axis's lattice, in [0,1].
 *
 * ⛔ C108 §4.3: computed from THIS stage's own support and then capped by its
 * inputs — never derived from another confidence, and never a product. Two own-
 * support terms are combined by `min`, which is the conservative reading:
 *
 *  • `tightness`     — do the openings actually sit on these lines?
 *  • `supportScore`  — is each line carried by as many openings as there are lines
 *                      on the other axis? A 5 x 7 grid should give every bay seven
 *                      votes; three votes means over half the cells are empty and
 *                      the lattice is correspondingly less certain.
 *
 * `perpendicularLines` is the OTHER axis's line count — the number of openings a
 * fully populated line would have. It is a count, not a confidence, so using it
 * here is not confidence-from-confidence.
 */
export function latticeConfidence(lattice: OpeningLattice, perpendicularLines: number): number {
    if (!latticeIsUsable(lattice)) return 0;
    const expected = Math.max(1, perpendicularLines);
    const supportScore = Math.max(0, Math.min(1, lattice.medianSupport / expected));
    // §CONF72 (L-11220) — the MATCHED FRACTION (C108 §4.3's own words): of the lines
    // this lattice REPORTS, how many did any opening actually vote for? Lines
    // interpolated into gaps and extended to the edges are measurement (steps 4–5),
    // but a lattice that is MOSTLY such lines is a pitch extrapolated from a few
    // clusters. The perturbed case-M sweep found exactly that: three chained
    // clusters, eight filled lines, "11 bays" for 5 at confidence 0.77. With this
    // term it reads 3 / 11 and sits under any floor, where a wrong count belongs.
    const reported = Math.max(1, lattice.centres.length);
    const voted = Math.max(0, reported - lattice.interpolated - lattice.extended);
    const coverage = Math.max(0, Math.min(1, voted / reported));
    return Math.max(0, Math.min(1, Math.min(lattice.tightness, supportScore, coverage)));
}
