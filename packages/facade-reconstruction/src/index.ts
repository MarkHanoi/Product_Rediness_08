// @pryzm/facade-reconstruction — PHOTO -> FACADE GEOMETRY -> PRYZM BIM.
//
// Contract: C108 · ADR-0371 · SPEC-FACADE-RECONSTRUCTION-PIPELINE
// Requirement source: the founder's brief §1-§24, 2026-08-24.
//
// ⛔ READ C108 §0.2 BEFORE TRUSTING ANY NUMBER THIS PRODUCES.
// The photograph the brief was written about is NOT in this repository. Everything
// here is proven against SYNTHETIC inputs with known ground truth (brief §19) and
// against nothing else (L-11001).
//
// ── WHAT THE PIPELINE DOES WHEN IT CANNOT FIND THE FACADE PLANE ──────────────
// Brief §6 forbids forcing automatic detection, and brief §23 still wants a
// preliminary result. Both are satisfied without compromise:
//
//   the stages downstream RUN on the un-rectified frame, and the facade-plane
//   confidence is UNKNOWN, so C108 §4.3's "unknown in ⇒ unknown out" propagation
//   makes every derived confidence unknown too.
//
// ⭐ The user gets something to look at (§18) and NOT ONE NUMBER claims to be a
// measurement. That is the difference between a preliminary answer and a wrong one.

import { trace } from '@opentelemetry/api';

import type { FacadeReconstructionOptions } from './contracts/Options.js';
import { resolveOptions } from './contracts/Options.js';
import type {
    Cell,
    Facade,
    FacadeIR,
    Feature,
    Opening,
    Outlier,
    Protrusion,
    Zone,
} from './contracts/FacadeIR.js';
import type { DetectedBlob, FacadeDiagnostics, LatticeAxisDiagnostic } from './contracts/Diagnostics.js';
import type { Point2, Quad, RasterImage, Rect } from './contracts/RasterImage.js';
import { cropRaster, grayToRaster, toGray } from './contracts/RasterImage.js';
import type { FacadeConfidence } from './contracts/FacadeConfidence.js';
import { capBy, measured, scalarOf, unknown } from './contracts/FacadeConfidence.js';

import { blur, cannyEdges, sobel } from './reconstruction/preprocess/filters.js';
import { detectChromeCrop } from './reconstruction/crop/detectChrome.js';
import { facadeQuad, houghLines, vanishingPoint } from './reconstruction/facadePlane/hough.js';
import { estimateAspect, warpQuadToRect } from './reconstruction/rectification/homography.js';
import {
    detectBreaks,
    fitComb,
    measureSymmetry,
    profileDiagnostic,
    projectionProfiles,
} from './reconstruction/periodicity/comb.js';
import { bandsFromBoundaries, bandToNormalizedX, bandToNormalizedY, boundaries } from './reconstruction/geometry/lattice.js';
import type { OpeningLattice } from './reconstruction/geometry/openingLattice.js';
import {
    deriveLatticeFromOpenings,
    latticeConfidence,
    latticeIsUsable,
} from './reconstruction/geometry/openingLattice.js';
import { findBlobs, fitArch, otsuThreshold } from './reconstruction/openings/detect.js';
import { measureCurvature } from './reconstruction/curvature/residual.js';
import { detectSoffits, soffitCueForBoundary, soffitShadowIndex } from './reconstruction/projections/soffit.js';
import { measureColour } from './reconstruction/surface/colour.js';
import { measureSurface } from './reconstruction/surface/tiling.js';
import { unknownScale } from './reconstruction/scale/referenceDimension.js';

export type { FacadeReconstructionOptions } from './contracts/Options.js';
export { DEFAULT_OPTIONS, resolveOptions } from './contracts/Options.js';
export * from './contracts/FacadeIR.js';
export * from './contracts/RasterImage.js';
export * from './contracts/Diagnostics.js';
export * from './contracts/FacadeConfidence.js';
export { applyReferenceDimension, toMeters, unknownScale } from './reconstruction/scale/referenceDimension.js';

export interface FacadeReconstructionResult {
    /** The brief §17 contract. */
    readonly ir: FacadeIR;
    /** The brief §18 overlay layers. NOT part of the IR (C108 §1.3). */
    readonly diagnostics: FacadeDiagnostics;
}

const tracer = trace.getTracer('@pryzm/facade-reconstruction');

/** Build a confidence pair for an IR node from one `FacadeConfidence`. */
function pair(c: FacadeConfidence): { confidence: number | null; evidence: FacadeConfidence } {
    return { confidence: scalarOf(c), evidence: c };
}

/**
 * PHOTO -> FACADE IR. The brief §21 entry point, signature included.
 *
 * `async` although Milestone 1 is entirely synchronous: the brief specifies it, and
 * it is the seam a worker slides behind without changing a single call site.
 *
 * ⛔ Never throws on a plausible image. A stage that cannot answer emits an
 * `unknownReason` and the pipeline continues — an exception would deprive the user
 * of the diagnostics that explain WHY it could not answer, which is the one thing
 * brief §18 exists to guarantee.
 */
export async function reconstructFacade(
    image: RasterImage,
    options?: Partial<FacadeReconstructionOptions>,
): Promise<FacadeReconstructionResult> {
    const span = tracer.startSpan('reconstructFacade');
    try {
        return runPipeline(image, resolveOptions(options));
    } finally {
        span.end();
    }
}

function runPipeline(image: RasterImage, opts: FacadeReconstructionOptions): FacadeReconstructionResult {
    const notes: string[] = [];

    // ── S1 CROP (brief §1) ───────────────────────────────────────────────────
    const sourceGray = toGray(image);
    const crop = detectChromeCrop(image, sourceGray, opts);
    notes.push(...crop.notes);
    const cropped = crop.applied ? cropRaster(image, crop.rect) : image;
    const croppedGray = crop.applied ? toGray(cropped) : sourceGray;

    // ── S2 EDGES ─────────────────────────────────────────────────────────────
    const blurred = blur(croppedGray, opts.blurSigma);
    const grads = sobel(blurred);
    const { edges, highThreshold } = cannyEdges(grads, opts.edgeHighPercentile, opts.edgeLowRatio);

    // ── S3/S4/S5 LINES -> VANISHING POINTS -> QUAD (brief §6) ────────────────
    const lines = houghLines(edges, opts);
    const vpH = vanishingPoint(lines.filter((l) => l.family === 'horizontal'), opts);
    const vpV = vanishingPoint(lines.filter((l) => l.family === 'vertical'), opts);

    let quad: Quad | null;
    let quadStatus: 'detected' | 'user-supplied' | 'needs-user';
    let quadConfidence: number;
    if (opts.facadeQuad !== undefined) {
        // ⭐ brief §6/§23 step 5: the user's quad ALWAYS wins over detection.
        quad = opts.facadeQuad;
        quadStatus = 'user-supplied';
        quadConfidence = 1;
        notes.push('facadeQuad: user-supplied — detection skipped (brief §6)');
    } else if (!opts.autoDetectFacadePlane) {
        // ⭐ brief §6's "do not force automatic detection", as a DEFAULT rather than
        // a fallback. The caller has declared that the four corners are to be ASKED
        // FOR. Nothing is guessed, nothing downstream claims a measurement, and the
        // pipeline still runs so there is a photograph and an edge map to click on.
        quad = null;
        quadStatus = 'needs-user';
        quadConfidence = 0;
        notes.push(
            'facadeQuad: NOT DETECTED — automatic detection was not requested. The four corners are ' +
                'ASKED FOR, never assumed (brief §6). Every derived confidence is UNKNOWN until they ' +
                'are set (C108 §4.3), and detection remains available as a labelled shortcut.',
        );
    } else {
        const detected = facadeQuad(lines, cropped.width, cropped.height, opts);
        notes.push(...detected.notes);
        quad = detected.quad;
        quadStatus = detected.status;
        quadConfidence = detected.confidence;
    }

    // C108 §4.3 — this is the value every later confidence is capped by.
    const planeConfidence: FacadeConfidence =
        quad === null ? unknown('geometry-incomplete') : measured(Math.max(0, Math.min(1, quadConfidence)));

    // ── S6 RECTIFY (brief §6) ────────────────────────────────────────────────
    const aspectEstimate = quad === null ? null : estimateAspect(quad, vpH, vpV);
    let rectified: RasterImage;
    let aspect: number | null = null;
    if (quad !== null && aspectEstimate !== null) {
        const a = Math.max(0.1, Math.min(10, aspectEstimate.aspect));
        const outW = a >= 1 ? opts.rectifiedLongSide : Math.max(16, Math.round(opts.rectifiedLongSide * a));
        const outH = a >= 1 ? Math.max(16, Math.round(opts.rectifiedLongSide / a)) : opts.rectifiedLongSide;
        const warped = warpQuadToRect(cropped, quad, outW, outH);
        if (warped === null) {
            notes.push('rectify: REFUSED — degenerate quad; continuing on the un-rectified frame');
            rectified = cropped;
        } else {
            rectified = warped.image;
            aspect = a;
            notes.push(`rectify: ${outW}x${outH}, aspect ${a.toFixed(3)} via ${aspectEstimate.method}`);
        }
    } else {
        // ⭐ The needs-user path. Downstream still runs; every confidence is UNKNOWN.
        notes.push(
            'rectify: SKIPPED — no facade plane. Structure is measured on the raw frame and EVERY derived confidence is UNKNOWN (C108 §4.3)',
        );
        rectified = cropped;
    }
    const rectGray = toGray(rectified);

    // ── S7/S8 PROFILES + PERIODICITY (brief §7, §14) ─────────────────────────
    const { rows, cols } = projectionProfiles(rectGray);
    const rowFit = fitComb(rows, opts);
    const colFit = fitComb(cols, opts);
    const rowBreaks = rowFit === null ? [] : detectBreaks(rows, rowFit, opts);
    const colBreaks = colFit === null ? [] : detectBreaks(cols, colFit, opts);
    const rowsDiag = profileDiagnostic(rows, opts);
    const colsDiag = profileDiagnostic(cols, opts);

    // ── S9a THE PROJECTION-PROFILE LATTICE (brief §7) ────────────────────────
    // ⛔ NOT DELETED, and not demoted to dead code: this is the FALLBACK for a
    // facade whose openings support no lattice, and the CROSS-CHECK reported
    // whenever the two readings disagree (C108 §3.4).
    const minSepY = Math.max(2, Math.round(rectified.height * opts.minPeakSeparationFraction * 2));
    const minSepX = Math.max(2, Math.round(rectified.width * opts.minPeakSeparationFraction * 2));
    const profileZoneBoundaries = boundaries(rectified.height, rowFit, rowBreaks, minSepY);
    const profileBayBoundaries = boundaries(rectified.width, colFit, colBreaks, minSepX);
    const profileZoneBands = bandsFromBoundaries(profileZoneBoundaries);
    const profileBayBands = bandsFromBoundaries(profileBayBoundaries);

    // ── S11 OPENINGS, DETECTED GLOBALLY (brief §8) ───────────────────────────
    // Global, not per cell — see findBlobs' header: a per-cell search can only ever
    // see SLICES of a multi-storey element, which is the object brief §10 asks to
    // be preserved whole.
    const fullRect: Rect = { x0: 0, y0: 0, x1: rectified.width, y1: rectified.height };
    const threshold = otsuThreshold(rectGray, fullRect);
    const cellAreaFor = (zoneCount: number, bayCount: number): number =>
        (rectified.width * rectified.height) / Math.max(1, zoneCount * bayCount);
    let blobs = findBlobs(
        rectGray,
        fullRect,
        threshold,
        opts,
        cellAreaFor(profileZoneBands.length, profileBayBands.length),
    );

    // ── S9b ⭐ THE LATTICE, DERIVED FROM THOSE OPENINGS (C108 §3.4) ──────────
    //
    // The founder's reading of his own first real run, and it is the correct one:
    // the pipeline "clearly can identify the windows — so therefore the levels too".
    // ~40 opening boxes on a 5 x 7 grid ALREADY ENCODE the floor lines and the bay
    // lines. Computing the lattice from the weaker projection signal and then
    // fitting the openings into it is the ordering that produced a 2 x 2 lattice on
    // a seven-storey building (L-10971).
    let zoneLattice = deriveLatticeFromOpenings(blobs, 'y', rectified.height, opts);
    let bayLattice = deriveLatticeFromOpenings(blobs, 'x', rectified.width, opts);

    // ⚠ THE ONE CIRCULARITY IN THE PIPELINE, RESOLVED IN EXACTLY TWO PASSES.
    // `openingMinArea` is a floor relative to a CELL; the cell is not known until
    // the lattice is; the lattice is not known until the openings are. Pass 1 used
    // the profile lattice's cells. If the opening-derived lattice implies a
    // materially different cell, pass 2 re-detects against it and the lattice is
    // re-derived from THAT set. ⛔ Two passes, never a loop to convergence: an
    // iteration whose stopping point depends on the image is not deterministic in
    // any way worth defending (C108 §5.2).
    let refinedPass = false;
    if (
        opts.latticeSource === 'openings' &&
        opts.openingLatticeRefine &&
        latticeIsUsable(zoneLattice) &&
        latticeIsUsable(bayLattice)
    ) {
        const derivedCells = (zoneLattice.centres.length) * (bayLattice.centres.length);
        const pass1Cells = profileZoneBands.length * profileBayBands.length;
        if (derivedCells !== pass1Cells) {
            const refined = findBlobs(
                rectGray,
                fullRect,
                threshold,
                opts,
                cellAreaFor(zoneLattice.centres.length, bayLattice.centres.length),
            );
            const zone2 = deriveLatticeFromOpenings(refined, 'y', rectified.height, opts);
            const bay2 = deriveLatticeFromOpenings(refined, 'x', rectified.width, opts);
            // Keep pass 2 only if it still yields a lattice. A refinement that
            // REFUSES is a refinement that found nothing, not a reason to lose the
            // answer pass 1 already had.
            if (latticeIsUsable(zone2) && latticeIsUsable(bay2)) {
                blobs = refined;
                zoneLattice = zone2;
                bayLattice = bay2;
                refinedPass = true;
                notes.push(
                    `lattice: refined — detection re-run against the derived cell ` +
                        `(${pass1Cells} -> ${derivedCells} cells), ${refined.length} opening(s)`,
                );
            }
        }
    }

    const useOpeningLattice =
        opts.latticeSource === 'openings' && latticeIsUsable(zoneLattice) && latticeIsUsable(bayLattice);
    const zoneBands = useOpeningLattice
        ? bandsFromBoundaries(zoneLattice.boundaries)
        : profileZoneBands;
    const bayBands = useOpeningLattice ? bandsFromBoundaries(bayLattice.boundaries) : profileBayBands;

    const latticeDiagnostic = (
        lat: OpeningLattice,
        used: boolean,
        bands: readonly { from: number; to: number }[],
        profileBands: number,
        boundsUsed: readonly number[],
    ): LatticeAxisDiagnostic => ({
        source: used ? 'openings' : 'projection-profile',
        boundaries: boundsUsed,
        bands: bands.length,
        fromOpenings: lat.refusedReason === null ? lat.centres.length : null,
        fromProfile: profileBands,
        refusedReason: lat.refusedReason,
        pitch: used ? lat.pitch : null,
        medianSupport: lat.refusedReason === null ? lat.medianSupport : null,
        interpolated: lat.interpolated,
        extended: lat.extended,
        rejected: lat.rejected,
    });
    const zoneBoundsUsed = useOpeningLattice ? zoneLattice.boundaries : profileZoneBoundaries;
    const bayBoundsUsed = useOpeningLattice ? bayLattice.boundaries : profileBayBoundaries;

    notes.push(
        `lattice: ${zoneBands.length} zone(s) x ${bayBands.length} bay(s) from ` +
            `${useOpeningLattice ? 'THE DETECTED OPENINGS' : 'the projection profile'}` +
            (refinedPass ? ' (refined)' : ''),
    );
    if (!useOpeningLattice && opts.latticeSource === 'openings') {
        // ⭐ The refusal is NAMED, not swallowed. A fallback that happens silently is
        // a fallback nobody can debug.
        notes.push(
            `lattice: opening-derived lattice REFUSED — zones: ${zoneLattice.refusedReason ?? 'ok'}; ` +
                `bays: ${bayLattice.refusedReason ?? 'ok'}. Falling back to the projection profile.`,
        );
    }
    if (useOpeningLattice) {
        // ⛔ THE CROSS-CHECK. Where the wall and the windows disagree, SAY SO. This
        // is the sentence that would have made the 2 x 2 collapse obvious on the
        // first real run instead of on the second.
        const zd = zoneBands.length !== profileZoneBands.length;
        const bd = bayBands.length !== profileBayBands.length;
        if (zd || bd) {
            notes.push(
                `lattice: ⚠ SOURCES DISAGREE — openings say ${zoneBands.length}x${bayBands.length}, ` +
                    `the projection profile says ${profileZoneBands.length}x${profileBayBands.length} ` +
                    `(comb period rows ${rowFit === null ? 'none' : rowFit.period.toFixed(1)}, ` +
                    `cols ${colFit === null ? 'none' : colFit.period.toFixed(1)} samples). ` +
                    'The openings were used (C108 §3.4).',
            );
        }
        notes.push(
            `lattice: pitch ${zoneLattice.pitch.toFixed(1)} x ${bayLattice.pitch.toFixed(1)} samples, ` +
                `median support ${zoneLattice.medianSupport} / ${bayLattice.medianSupport} opening(s) per line, ` +
                `${zoneLattice.interpolated + bayLattice.interpolated} line(s) interpolated into gaps, ` +
                `${zoneLattice.extended + bayLattice.extended} extended to the edge, ` +
                `${zoneLattice.rejected + bayLattice.rejected} low-support cluster(s) rejected`,
        );
    }

    // ── STRUCTURE CONFIDENCE (C108 §4.3) ─────────────────────────────────────
    // Computed from the SOURCE THAT WAS ACTUALLY USED — cluster tightness and line
    // support for the opening lattice, comb fit for the profile — then capped by the
    // facade plane. Never derived from another confidence, never a product.
    const structureConfidence: FacadeConfidence = capBy(
        useOpeningLattice
            ? measured(
                  Math.min(
                      latticeConfidence(zoneLattice, bayLattice.centres.length),
                      latticeConfidence(bayLattice, zoneLattice.centres.length),
                  ),
              )
            : rowFit === null || colFit === null
              ? unknown('geometry-incomplete')
              : measured(Math.max(0, Math.min(1, Math.min(rowFit.fit, colFit.fit)))),
        planeConfidence,
    );
    const periodicityConfidence = structureConfidence;
    // ⛔ §CONF72 (L-11220) — A ZONE'S CONFIDENCE IS THE ZONE AXIS'S OWN MEASUREMENT.
    // The storey count rests on the horizontal lattice alone; stamping every zone
    // with the JOINT structure confidence let the BAY axis's support ratio (3 of 7
    // on the founder's photograph, where the detector had missed half the windows)
    // report "7 storeys — 0.43" for a zone lattice whose lines each carried 5 to 7
    // openings. C108 §4.3: a reading's confidence is its OWN support capped by its
    // INPUTS; the bay lattice is a sibling of the zone lattice, not an input to it.
    // Cells keep the joint cap — a cell IS the product of both axes.
    const zoneAxisConfidence: FacadeConfidence = useOpeningLattice
        ? capBy(measured(latticeConfidence(zoneLattice, bayLattice.centres.length)), planeConfidence)
        : structureConfidence;

    // ── S15 SOFFITS (brief §11) ──────────────────────────────────────────────
    //
    // ⭐ BEFORE S13, NOT AFTER IT (§L-11124 / §L-11180). The classifier below asks
    // "is this unmatched blob the shadow S15 measured?", so S15 must already have
    // measured it. It used to run after the match loop, which is exactly how ten
    // soffit-shadow segments on case M — each straddling the zone boundary at its
    // floor line — reached §3.8's `zoneSpan >= 2` and were minted as features.
    // Nothing S15 reads (the row peaks, the rectified gray) is produced by S13.
    //
    // ⚠ THE STRUCTURE ROWS, NOT THE LATTICE BOUNDARIES. Those are different lines and
    // conflating them made both this stage and curvature measure nothing: since the
    // lattice is placed where the profile is QUIET (see CombFit.latticePhase), a
    // "slab line" taken from a zone boundary is by construction a row where no
    // horizontal edge exists. Curvature then traced noise and reported 0.003 on a
    // facade bent by 9%.
    //
    // The detected row PEAKS are the answer to "where are the horizontal lines",
    // which is the question brief §7 actually asks.
    const slabRows = rowsDiag.peaks.filter((y) => y > 2 && y < rectified.height - 2);
    const soffits = detectSoffits(rectGray, slabRows, opts);

    // ── S13 MATCH: cell / feature / outlier (brief §10, §15) ─────────────────
    // ONE measured rule serves both clauses. Nothing here knows what a lightwell is.
    const cellOf = (bx: number, by: number): { row: number; col: number } | null => {
        const row = zoneBands.findIndex((b) => by >= b.from && by < b.to);
        const col = bayBands.findIndex((b) => bx >= b.from && bx < b.to);
        return row < 0 || col < 0 ? null : { row, col };
    };
    const assigned = new Map<string, (typeof blobs)[number]>();
    const diagBlobs: DetectedBlob[] = [];
    const features: Feature[] = [];
    const outliers: Outlier[] = [];
    // §L-11180 — unmatched blobs that ARE a measured soffit band's shadow.
    let shadowSegments = 0;

    // ── §L-11122 — REUNITE what the slab shadows cut apart ───────────────────
    // The lattice's continuity screen (openingLattice.ts §3b) rejected columns and
    // rows whose voters are slices of ONE continuous object. Those slices must not
    // reach the matcher as N openings, and they must not scatter into N outliers
    // either: brief §10's own example — a vertically continuous element — is ONE
    // feature. Its box is the union of its slices; its zoneSpan is measured against
    // the zone bands like any other feature. The slices are consumed here so the
    // S13 loop below never sees them.
    const consumed = new Set<number>();
    let reunited = 0;
    if (useOpeningLattice) {
        const groups = [...bayLattice.continuousMembers, ...zoneLattice.continuousMembers];
        for (const idx of groups) {
            const members = idx.map((i) => blobs[i]!).filter((b) => b !== undefined);
            if (members.length === 0) continue;
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
            for (const m of members) {
                x0 = Math.min(x0, m.bbox.x0); y0 = Math.min(y0, m.bbox.y0);
                x1 = Math.max(x1, m.bbox.x1); y1 = Math.max(y1, m.bbox.y1);
            }
            const union = { x0, y0, x1, y1 };
            const zoneSpan = zoneBands.filter((b) => union.y0 < b.to && union.y1 > b.from).length;
            features.push({
                ...normalizedBox(union, rectified),
                zoneSpan,
                note: 'continuous-object-reunited',
                ...pair(periodicityConfidence),
            });
            for (const i of idx) consumed.add(i);
            reunited++;
        }
        if (reunited > 0) {
            notes.push(
                `lattice: ${reunited} continuous column/row(s) rejected from the lattice and reunited ` +
                    `as ${reunited} feature(s) — slices of one object, not repeating openings (L-11121/L-11122)`,
            );
        }
    }

    for (let blobIndex = 0; blobIndex < blobs.length; blobIndex++) {
        const blob = blobs[blobIndex]!;
        if (consumed.has(blobIndex)) {
            diagBlobs.push({
                bbox: blob.bbox,
                area: blob.area,
                rectangularity: blob.rectangularity,
                matchedCell: null,
                soffitBand: null,
            });
            continue;
        }
        const bx = (blob.bbox.x0 + blob.bbox.x1) / 2;
        const by = (blob.bbox.y0 + blob.bbox.y1) / 2;
        const cell = cellOf(bx, by);
        let matched: { row: number; col: number } | null = null;
        let soffitBand: number | null = null;
        if (cell !== null) {
            const zone = zoneBands[cell.row]!;
            const bay = bayBands[cell.col]!;
            const cw = bay.to - bay.from;
            const ch = zone.to - zone.from;
            const dx = Math.abs(bx - (bay.from + cw / 2)) / Math.max(1, cw);
            const dy = Math.abs(by - (zone.from + ch / 2)) / Math.max(1, ch);
            // ⛔ A detection must FIT the cell as well as sit near its centre. The
            // central element of corpus case F spans every storey and is centred in a
            // middle cell — without the size guard it is recorded as that cell's
            // window and brief §10's "do NOT force it into the standard window grid"
            // is violated by the one object the clause was written about.
            const fits =
                (blob.bbox.x1 - blob.bbox.x0) <= cw * opts.combMatchMaxSizeRatio &&
                (blob.bbox.y1 - blob.bbox.y0) <= ch * opts.combMatchMaxSizeRatio &&
                blob.area <= cw * ch * opts.openingMaxArea;
            if (fits && dx <= opts.combMatchTolerance && dy <= opts.combMatchTolerance) {
                const key = `${cell.row},${cell.col}`;
                const existing = assigned.get(key);
                // One opening per cell (the §17 shape). The LARGER detection wins; the
                // loser is not discarded, it becomes an outlier — because "we found two
                // things here" is information, and silently dropping one is not.
                if (existing === undefined || blob.area > existing.area) {
                    if (existing !== undefined) {
                        outliers.push(makeOutlier(existing.bbox, rectified, periodicityConfidence));
                    }
                    assigned.set(key, blob);
                    matched = cell;
                } else {
                    outliers.push(makeOutlier(blob.bbox, rectified, periodicityConfidence));
                }
            }
        }
        if (matched === null && !isAssigned(assigned, blob)) {
            // ⛔ §L-11180 — FIRST: is it the shadow S15 already measured? A soffit
            // band interrupted by a strip or a slab face reaches here as segments,
            // each wider than tall and lying inside a detected band. That is the
            // CUE, and the IR already carries it as `cell.protrusion`; minting it
            // again as a feature (it straddles a floor line, so `zoneSpan` reads 2)
            // or an outlier would report one measurement twice under two names.
            soffitBand = soffitShadowIndex(blob.bbox, soffits, opts.soffitShadowMinInside);
            if (soffitBand !== null) {
                shadowSegments++;
            } else {
                // ⭐ brief §10's signature, expressed as a measurement: vertical
                // continuity across two or more zones makes it a FEATURE; anything
                // else is an OUTLIER.
                const zoneSpan = zoneBands.filter(
                    (b) => blob.bbox.y0 < b.to && blob.bbox.y1 > b.from,
                ).length;
                if (zoneSpan >= 2) {
                    features.push({
                        ...normalizedBox(blob.bbox, rectified),
                        zoneSpan,
                        note: 'unmatched-vertically-continuous',
                        ...pair(periodicityConfidence),
                    });
                } else {
                    outliers.push(makeOutlier(blob.bbox, rectified, periodicityConfidence));
                }
            }
        }
        diagBlobs.push({
            bbox: blob.bbox,
            area: blob.area,
            rectangularity: blob.rectangularity,
            matchedCell: matched,
            soffitBand,
        });
    }
    notes.push(
        `openings: ${assigned.size} matched to cells, ${features.length} feature(s), ${outliers.length} outlier(s)` +
            (shadowSegments > 0
                ? `, ${shadowSegments} soffit-shadow segment(s) folded into the S15 cue — not features, not outliers (L-11180)`
                : ''),
    );

    // ── S17 COLOUR (§L-11128) — the wall between the openings, and the openings ──
    // Measured on the RECTIFIED colour raster with every detected blob masked out
    // of the wall sample; reported, never gated here (the mapper's floor decides).
    const colour = measureColour(
        quad === null ? null : rectified,
        diagBlobs.map((b) => ({ bbox: b.bbox, matched: b.matchedCell !== null })),
        quad !== null,
    );
    notes.push(...colour.notes);

    // ── S14 CURVATURE (brief §12) ────────────────────────────────────────────
    const curvature = measureCurvature(rectGray, slabRows, opts);
    notes.push(...curvature.notes);

    // ── S16 SURFACE (brief §13) ──────────────────────────────────────────────
    const surface = measureSurface(rectGray, opts);
    notes.push(...surface.notes);

    // ── S10 SYMMETRY (brief §7) ──────────────────────────────────────────────
    const sym = measureSymmetry(cols);
    const symConfidence = capBy(
        sym.score === null ? unknown('geometry-incomplete') : measured(sym.score),
        planeConfidence,
    );

    // ── ASSEMBLE THE IR (brief §17) ──────────────────────────────────────────
    const heatmap: (number | null)[] = [];
    const zones: Zone[] = zoneBands.map((zoneBand, row) => {
        const zn = bandToNormalizedY(zoneBand, rectified.height);
        const cells: Cell[] = bayBands.map((bayBand, col) => {
            const bn = bandToNormalizedX(bayBand, rectified.width);
            const blob = assigned.get(`${row},${col}`);
            const cellConfidence: FacadeConfidence =
                blob === undefined
                    ? periodicityConfidence
                    : capBy(measured(Math.max(0, Math.min(1, blob.rectangularity))), periodicityConfidence);
            heatmap.push(scalarOf(cellConfidence));

            let opening: Opening | null = null;
            if (blob !== undefined) {
                const arch = fitArch(blob.topProfile, opts);
                const box = normalizedBox(blob.bbox, rectified);
                const openingConfidence = capBy(
                    measured(Math.max(0, Math.min(1, 1 - arch.residual))),
                    cellConfidence,
                );
                opening = {
                    a: box.width / 2,
                    b: box.height / 2,
                    n: arch.n,
                    archness: arch.archness,
                    width: box.width,
                    height: box.height,
                    ...pair(openingConfidence),
                };
            }

            // ⛔ brief §11 / C108 §3.10: the CUE is measured, the DEPTH is UNKNOWN.
            // §L-11181 — and the LINK from band to zone is measured too: the band
            // whose centre lies within its own height of this zone's top boundary,
            // never "top row within ±2". The constant lost four of five cues on M.
            const cue = soffitCueForBoundary(zoneBand.from, soffits);
            const protrusion: Protrusion | null =
                cue === null
                    ? null
                    : {
                          depth: null,
                          profile: [],
                          unknownReason: 'geometry-incomplete',
                          soffitBandHeight: cue.bandHeight / rectified.height,
                          ...pair(capBy(measured(Math.min(1, cue.drop / 255)), cellConfidence)),
                      };

            return {
                x: bn.x,
                y: zn.y,
                width: bn.width,
                height: zn.height,
                opening,
                protrusion,
                ...pair(cellConfidence),
            };
        });
        return { y: zn.y, height: zn.height, cells, ...pair(zoneAxisConfidence) };
    });

    const facade: Facade = {
        width: 1,
        height: 1,
        zones,
        features,
        outliers,
        symmetry: {
            axisX: sym.axis === null ? null : sym.axis / rectified.width,
            score: sym.score,
            ...pair(symConfidence),
        },
        // ⭐ brief §14's repeated structure, read off THE SOURCE THAT PRODUCED THE
        // LATTICE. Reporting a comb period here while the zones came from the
        // openings would put two rival answers in one IR and let a consumer pick
        // the wrong one — which is precisely how the founder's run reported
        // "repeat Y 2" beside a facade with seven storeys of windows in it.
        // ⛔ Still MEASURED, never a constant: it is a count of clustered lines or
        // `round(extent / period)`, and there is nowhere here for `if (fiveFloors)`
        // to live (C108 §9.1).
        periodicity: {
            repeatX: useOpeningLattice
                ? bayBands.length
                : colFit === null
                  ? null
                  : Math.max(1, Math.round(rectified.width / colFit.period)),
            repeatY: useOpeningLattice
                ? zoneBands.length
                : rowFit === null
                  ? null
                  : Math.max(1, Math.round(rectified.height / rowFit.period)),
            periodX: useOpeningLattice
                ? Math.min(1, bayLattice.pitch / rectified.width)
                : colFit === null
                  ? null
                  : Math.min(1, colFit.period / rectified.width),
            periodY: useOpeningLattice
                ? Math.min(1, zoneLattice.pitch / rectified.height)
                : rowFit === null
                  ? null
                  : Math.min(1, rowFit.period / rectified.height),
            ...pair(periodicityConfidence),
        },
        surface: {
            pattern: surface.pattern,
            scaleX: surface.scaleX,
            scaleY: surface.scaleY,
            ...pair(
                capBy(
                    surface.confidence === null
                        ? unknown('geometry-incomplete')
                        : measured(Math.max(0, Math.min(1, surface.confidence))),
                    planeConfidence,
                ),
            ),
        },
        curvature: {
            left: curvedEdge(curvature.left, planeConfidence),
            right: curvedEdge(curvature.right, planeConfidence),
        },
        ...pair(planeConfidence),
    };

    const ir: FacadeIR = {
        version: '0.1',
        units: 'normalized',
        scale: unknownScale(),
        facade,
    };

    const diagnostics: FacadeDiagnostics = {
        crop: {
            rect: crop.rect,
            applied: crop.applied,
            refusedReason: crop.refusedReason,
            image: cropped,
        },
        edges: { image: grayToRaster(edges), highThreshold },
        lines,
        vanishingPoints: { horizontal: vpH, vertical: vpV },
        facadeQuad: { quad, status: quadStatus, confidence: quad === null ? null : quadConfidence },
        rectified: { image: quad === null ? null : rectified, aspect },
        colour: { wall: colour.wall, openings: colour.openings, confidence: colour.confidence },
        rows: rowsDiag,
        cols: colsDiag,
        lattice: {
            zones: latticeDiagnostic(
                zoneLattice,
                useOpeningLattice,
                zoneBands,
                profileZoneBands.length,
                zoneBoundsUsed,
            ),
            bays: latticeDiagnostic(
                bayLattice,
                useOpeningLattice,
                bayBands,
                profileBayBands.length,
                bayBoundsUsed,
            ),
        },
        blobs: diagBlobs,
        symmetry: {
            axisX: sym.axis === null ? null : sym.axis / rectified.width,
            score: sym.score,
        },
        soffits: soffits.map((s) => ({
            y: s.y,
            bandHeight: s.bandHeight,
            drop: s.drop,
        })),
        confidenceHeatmap: heatmap,
        notes,
    };

    return { ir, diagnostics };
}

function isAssigned(
    assigned: Map<string, { bbox: Rect }>,
    blob: { bbox: Rect },
): boolean {
    for (const v of assigned.values()) if (v.bbox === blob.bbox) return true;
    return false;
}

function normalizedBox(
    bbox: Rect,
    image: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
    const clamp = (v: number): number => Math.max(0, Math.min(1, v));
    return {
        x: clamp(bbox.x0 / image.width),
        // ⚠ The Y flip (C108 §2.1). Image rows count down; facade Y counts up.
        y: clamp(1 - bbox.y1 / image.height),
        width: clamp((bbox.x1 - bbox.x0) / image.width),
        height: clamp((bbox.y1 - bbox.y0) / image.height),
    };
}

function makeOutlier(
    bbox: Rect,
    image: { width: number; height: number },
    confidence: FacadeConfidence,
): Outlier {
    return { ...normalizedBox(bbox, image), note: 'unclassified', ...pair(confidence) };
}

function curvedEdge(
    edge: { normalizedDeviation: number | null; consistency: number | null },
    planeConfidence: FacadeConfidence,
): Facade['curvature']['left'] {
    const c = capBy(
        edge.consistency === null
            ? unknown('geometry-incomplete')
            : measured(Math.max(0, Math.min(1, edge.consistency))),
        planeConfidence,
    );
    return {
        normalizedDeviation: edge.normalizedDeviation,
        // ⛔ ALWAYS null in Milestone 1 (C108 §3.9, L-11004).
        normalizedRadius: null,
        ...pair(c),
    };
}

/** The two points of a brief §16 reference dimension, re-exported for the UI. */
export type { Point2 };
