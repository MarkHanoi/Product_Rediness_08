// TGL — offline engine entry: ShellAnalysis → ScoredLayoutOption[].
//
// The single bridge between the editor's generate orchestrator and the pure D-TGL
// engine (P1→P9). Given the analysed shell + program + constraints, it enumerates
// candidate layouts (deterministic Pareto, §2.2), projects each to a LayoutOption
// (P9) and attaches the existing LayoutScore so the modal/score UI is unchanged.
// This REPLACES the strip-slicer `generateProceduralLayout` behind generate.ts's
// opt-in fallback seam — same shape out, real architecture in. Pure + deterministic.

import type { ApartmentConstraints, ApartmentProgram, ScoringWeights, ScoredLayoutOption, LayoutOption } from '../types.js';
import type { ShellAnalysis } from '../shellAnalysis.js';
import { scoreLayout } from '../score.js';
import { enumerateLayouts } from './enumerate.js';
import { emitGeometry } from './emitGeometry.js';
import { principalAxisAngle, rotatePt, type Pt } from './rectDecomposition.js';
import { equatorFacingDir } from '../windowEmission/solarOrientation.js';

const r3 = (n: number): number => Math.round(n * 1000) / 1000;

/** Below this residual dominant-edge angle a shell is treated as already
 *  axis-aligned and NO rotation is applied — preserves bit-identical output for
 *  rectangles / L / U / T shells (no-regression) and skips a pointless transform.
 *  ~0.6° (0.01 rad). */
const PRINCIPAL_AXIS_MIN_RAD = 0.01;

/** Centroid of a polygon (metres, plan frame) — the pivot for the principal-axis
 *  rotation so the rotated shell stays near its world position. */
function polyCentroidM(poly: readonly Pt[]): Pt {
    if (poly.length === 0) return { x: 0, z: 0 };
    let sx = 0, sz = 0;
    for (const p of poly) { sx += p.x; sz += p.z; }
    return { x: sx / poly.length, z: sz / poly.length };
}

/** Rotate a mm-{x,y} layout point (plan-y = world-z) by `angleRad` about a
 *  mm-{x,y} pivot. Mirrors `rotatePt` but in the emitted mm/{x,y} convention. */
function rotateXY(
    p: { x: number; y: number }, angleRad: number, about: { x: number; y: number },
): { x: number; y: number } {
    const c = Math.cos(angleRad), s = Math.sin(angleRad);
    const dx = p.x - about.x, dy = p.y - about.y;
    const x = about.x + dx * c - dy * s;
    const y = about.y + dx * s + dy * c;
    return { x: Math.round(x * 1e6) / 1e6, y: Math.round(y * 1e6) / 1e6 };
}

/** Map an axis-aligned (rotated-frame) LayoutOption back into the real world frame
 *  by rotating every absolute plan coordinate (+walls, room centroid/polygon) by
 *  `+angleRad` about `aboutMm`. Door/window offsets are distances ALONG a wall and
 *  so are rotation-invariant — left untouched. Boundaries are rotated separately by
 *  the caller (they live outside the LayoutOption). */
function rotateOptionBack(
    option: LayoutOption, angleRad: number, aboutMm: { x: number; y: number },
): LayoutOption {
    const r = (p: { x: number; y: number }): { x: number; y: number } => rotateXY(p, angleRad, aboutMm);
    return {
        ...option,
        walls: option.walls.map(w => ({ ...w, start: r(w.start), end: r(w.end) })),
        rooms: option.rooms.map(rm => ({
            ...rm,
            ...(rm.centroid ? { centroid: r(rm.centroid) } : {}),
            ...(rm.polygon ? { polygon: rm.polygon.map(r) } : {}),
        })),
    };
}

/** Stable seed from the shell geometry + program (§6: derived, never random). */
function makeSeed(poly: readonly Pt[], program: ApartmentProgram): string {
    const pts = poly.map(p => `${r3(p.x)},${r3(p.z)}`).join(';');
    const prog = `b${program.bedrooms}ba${program.bathrooms}` +
        `${program.masterEnSuite ? 'E' : ''}${program.openPlanKitchenDining ? 'O' : ''}` +
        `${program.livingRoom ? 'L' : ''}${program.entranceHall ? 'H' : ''}`;
    return `tgl|${prog}|${pts}`;
}

/**
 * Generate ranked, scored offline layouts for a shell using the D-TGL engine.
 * Returns up to `count` options, best-first. Empty only when the shell can't be
 * decomposed (degenerate perimeter). `windowSpansWorld` (optional) — axis-aligned
 * WORLD-XZ window spans on the shell perimeter; when supplied, the subdivide step
 * snaps interior partition coords clear of every window opening.
 * `doorSpansWorld` (optional, §DOOR-AVOIDANCE 2026-05-29) — same shape for
 * pre-existing exterior doors; the snap pass treats both opening kinds
 * identically so an interior wall never lands inside the front-door opening.
 */
export function generateDeterministicLayouts(
    shell: ShellAnalysis,
    program: ApartmentProgram,
    constraints: ApartmentConstraints,
    weights: ScoringWeights,
    count: number,
    windowSpansWorld?: ReadonlyArray<{ a: { x: number; z: number }; b: { x: number; z: number } }>,
    doorSpansWorld?: ReadonlyArray<{ a: { x: number; z: number }; b: { x: number; z: number } }>,
    // A.21.D6 — optional site latitude (decimal degrees) for climate-driven window
    // orientation. Absent → pure-length window placement (no behaviour change).
    solar?: { readonly latDeg: number; readonly weight?: number },
): ScoredLayoutOption[] {
    const perimeter = shell.perimeter as Pt[];
    if (!perimeter || perimeter.length < 3) return [];

    // §PRINCIPAL-AXIS (LAYOUT-QUALITY-DEEP, 2026-06-04) — a SKEWED (off-axis) plot
    // stair-steps in the axis-aligned slab-sweep decomposition, dropping rooms and
    // forcing the bounding-box strip-slicer bailout. Rotate the shell to its
    // dominant-edge orientation, run the ENTIRE axis-aligned D-TGL pipeline in that
    // frame, then rotate the emitted geometry back. Rectilinear shells (rectangle /
    // L / U / T) have angle ≈ 0 → no rotation → bit-identical output (no regression).
    const rawAngle = principalAxisAngle(perimeter);
    const angle = Math.abs(rawAngle) >= PRINCIPAL_AXIS_MIN_RAD ? rawAngle : 0;
    const pivot = polyCentroidM(perimeter);
    const pivotMm: { x: number; y: number } = { x: pivot.x * 1000, y: pivot.z * 1000 };

    // A.21.D6 — the sun/equator-facing direction in the EMIT frame. equatorFacingDir
    // returns it in the world frame (x=East, y=world-z=South); emitGeometry runs in
    // the principal-axis-rotated frame, so rotate the direction by the SAME −angle
    // forward map (about the origin — it's a direction, not a point).
    const worldSun = solar ? equatorFacingDir(solar.latDeg) : null;
    const emitSun = worldSun
        ? (() => { const r = rotatePt({ x: worldSun.x, z: worldSun.y }, -angle, { x: 0, z: 0 }); return { x: r.x, y: r.z }; })()
        : null;
    const emitOpts = emitSun
        ? { solar: { sunDir: emitSun, ...(solar?.weight !== undefined ? { weight: solar.weight } : {}) } }
        : undefined;

    // Forward map (world → axis-aligned frame): rotate by −angle about the centroid.
    const fwdSpan = (sp: { a: { x: number; z: number }; b: { x: number; z: number } }) => ({
        a: rotatePt(sp.a, -angle, pivot),
        b: rotatePt(sp.b, -angle, pivot),
    });
    const shellPolygon = angle === 0 ? perimeter : perimeter.map(p => rotatePt(p, -angle, pivot));
    const winSpans = angle === 0 ? windowSpansWorld : windowSpansWorld?.map(fwdSpan);
    const doorSpans = angle === 0 ? doorSpansWorld : doorSpansWorld?.map(fwdSpan);

    const candidates = enumerateLayouts({
        shellPolygon,
        program,
        levelId: 'shell',                         // graph-internal; real level applied at build
        seed: makeSeed(perimeter, program),       // seed off the REAL shell (rotation is internal)
        weights,
        count: Math.max(1, count),
        ...(shell.netAreaM2 > 0 ? { shellAreaM2: shell.netAreaM2 } : {}),
        ...(constraints.wallThickness > 0 ? { wallThicknessM: constraints.wallThickness / 1000 } : {}),
        ...(constraints.floorToCeiling > 0 ? { wallHeightM: constraints.floorToCeiling / 1000 } : {}),
        ...(winSpans && winSpans.length > 0 ? { windowSpansWorld: winSpans } : {}),
        ...(doorSpans && doorSpans.length > 0 ? { doorSpansWorld: doorSpans } : {}),
    });

    return candidates.map(c => {
        // Emit ALL walls (perimeter flagged isExternal) so the preview shows the
        // full plan; the executor builds with skipExteriorWalls so the existing
        // shell is never duplicated (coincident walls break room detection).
        // Boundaries (open-plan virtual splitters) live OUTSIDE the LayoutGraph
        // (they aren't BIM elements, just a room-detection helper) and are merged
        // into the LayoutOption alongside the graph projection.
        const emitted = emitGeometry(c.graph, emitOpts);
        // §PRINCIPAL-AXIS inverse map (axis-aligned frame → world): rotate emitted
        // mm geometry by +angle about the mm pivot. No-op when angle === 0.
        const option = angle === 0 ? emitted.option : rotateOptionBack(emitted.option, angle, pivotMm);
        const MM = 1000;
        const mm = (n: number): number => Math.round(n * MM * 1e6) / 1e6;
        const rotateBoundary = (pt: { x: number; y: number }): { x: number; y: number } =>
            angle === 0 ? pt : rotateXY(pt, angle, pivotMm);
        const boundaries = c.boundaries.map(b => ({
            start: rotateBoundary({ x: mm(b.a.x), y: mm(b.a.z) }),
            end:   rotateBoundary({ x: mm(b.b.x), y: mm(b.b.z) }),
        }));
        // §INTERIOR-HEIGHT-MATCH (2026-05-29): thread the partition height
        // (constraints.floorToCeiling, mm) onto the LayoutOption so the
        // executor can size generated partitions to match the shell without
        // reaching into the wall store. Skipped when 0 / unset → executor
        // falls back to level.height.
        const labelled = {
            ...option,
            boundaries,
            summary: `${option.summary} (offline · D-TGL)`,
            ...(constraints.floorToCeiling > 0 ? { floorToCeilingMm: constraints.floorToCeiling } : {}),
        };
        // §L1-α-4 PREP — pin the cognition-stack / validator axes onto the
        // breakdown so the modal renderer (follow-on commit) can surface
        // them without re-deriving from the layout. AI-path layouts that
        // never go through enumerate.ts have no candidate.objectives →
        // these fields stay undefined and the modal renders the legacy
        // four bars.
        const base = scoreLayout(labelled, weights);
        const score = {
            ...base,
            breakdown: {
                ...base.breakdown,
                hierarchy: c.objectives.hierarchy,
                shapeQuality: c.objectives.shapeQuality,
                topologyQuality: c.objectives.topologyQuality,
                edgeRealisation: c.objectives.edgeRealisation,
                openingCadence: c.objectives.openingCadence,
                proportionalElegance: c.objectives.proportionalElegance,
                spatialClimax: c.objectives.spatialClimax,
                entrySightline: c.objectives.entrySightline,
                arrivalSequence: c.objectives.arrivalSequence,
                wetStackAlignment: c.objectives.wetStackAlignment,
                alignmentField: c.objectives.alignmentField,
                facadeAlignment: c.objectives.facadeAlignment,
            },
        };
        return { ...labelled, score };
    });
}

export { makeSeed as __makeSeedForTest };
