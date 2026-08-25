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
import type { DetectedBlob, FacadeDiagnostics } from './contracts/Diagnostics.js';
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
import { findBlobs, fitArch, otsuThreshold } from './reconstruction/openings/detect.js';
import { measureCurvature } from './reconstruction/curvature/residual.js';
import { detectSoffits } from './reconstruction/projections/soffit.js';
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

    const periodicityConfidence: FacadeConfidence = capBy(
        rowFit === null || colFit === null
            ? unknown('geometry-incomplete')
            : measured(Math.max(0, Math.min(1, Math.min(rowFit.fit, colFit.fit)))),
        planeConfidence,
    );

    // ── S9 LATTICE (brief §7) ────────────────────────────────────────────────
    const minSepY = Math.max(2, Math.round(rectified.height * opts.minPeakSeparationFraction * 2));
    const minSepX = Math.max(2, Math.round(rectified.width * opts.minPeakSeparationFraction * 2));
    const zoneBands = bandsFromBoundaries(
        boundaries(rectified.height, rowFit, rowBreaks, minSepY),
    );
    const bayBands = bandsFromBoundaries(boundaries(rectified.width, colFit, colBreaks, minSepX));
    notes.push(`lattice: ${zoneBands.length} zone(s) x ${bayBands.length} bay(s)`);

    // ── S11 OPENINGS, DETECTED GLOBALLY (brief §8) ───────────────────────────
    // Global, not per cell — see findBlobs' header: a per-cell search can only ever
    // see SLICES of a multi-storey element, which is the object brief §10 asks to
    // be preserved whole.
    const fullRect: Rect = { x0: 0, y0: 0, x1: rectified.width, y1: rectified.height };
    const threshold = otsuThreshold(rectGray, fullRect);
    const meanCellArea =
        (rectified.width * rectified.height) / Math.max(1, zoneBands.length * bayBands.length);
    const blobs = findBlobs(rectGray, fullRect, threshold, opts, meanCellArea);

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

    for (const blob of blobs) {
        const bx = (blob.bbox.x0 + blob.bbox.x1) / 2;
        const by = (blob.bbox.y0 + blob.bbox.y1) / 2;
        const cell = cellOf(bx, by);
        let matched: { row: number; col: number } | null = null;
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
            // ⭐ brief §10's signature, expressed as a measurement: vertical continuity
            // across two or more zones makes it a FEATURE; anything else is an OUTLIER.
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
        diagBlobs.push({
            bbox: blob.bbox,
            area: blob.area,
            rectangularity: blob.rectangularity,
            matchedCell: matched,
        });
    }
    notes.push(
        `openings: ${assigned.size} matched to cells, ${features.length} feature(s), ${outliers.length} outlier(s)`,
    );

    // ── S15 SOFFITS (brief §11) ──────────────────────────────────────────────
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
            const cue = soffits.find(
                (s) => s.y >= zoneBand.from - 2 && s.y <= zoneBand.from + 2,
            );
            const protrusion: Protrusion | null =
                cue === undefined
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
        return { y: zn.y, height: zn.height, cells, ...pair(periodicityConfidence) };
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
        periodicity: {
            repeatX: colFit === null ? null : Math.max(1, Math.round(rectified.width / colFit.period)),
            repeatY: rowFit === null ? null : Math.max(1, Math.round(rectified.height / rowFit.period)),
            periodX: colFit === null ? null : Math.min(1, colFit.period / rectified.width),
            periodY: rowFit === null ? null : Math.min(1, rowFit.period / rectified.height),
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
        rows: rowsDiag,
        cols: colsDiag,
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
