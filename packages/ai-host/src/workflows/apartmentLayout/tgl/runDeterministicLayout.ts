// TGL — offline engine entry: ShellAnalysis → ScoredLayoutOption[].
//
// The single bridge between the editor's generate orchestrator and the pure D-TGL
// engine (P1→P9). Given the analysed shell + program + constraints, it enumerates
// candidate layouts (deterministic Pareto, §2.2), projects each to a LayoutOption
// (P9) and attaches the existing LayoutScore so the modal/score UI is unchanged.
// This REPLACES the strip-slicer `generateProceduralLayout` behind generate.ts's
// opt-in fallback seam — same shape out, real architecture in. Pure + deterministic.

import type { ApartmentConstraints, ApartmentProgram, ScoringWeights, ScoredLayoutOption } from '../types.js';
import type { ShellAnalysis } from '../shellAnalysis.js';
import { scoreLayout } from '../score.js';
import { enumerateLayouts } from './enumerate.js';
import { emitGeometry } from './emitGeometry.js';
import type { Pt } from './rectDecomposition.js';

const r3 = (n: number): number => Math.round(n * 1000) / 1000;

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
): ScoredLayoutOption[] {
    const perimeter = shell.perimeter as Pt[];
    if (!perimeter || perimeter.length < 3) return [];

    const candidates = enumerateLayouts({
        shellPolygon: perimeter,
        program,
        levelId: 'shell',                         // graph-internal; real level applied at build
        seed: makeSeed(perimeter, program),
        weights,
        count: Math.max(1, count),
        ...(shell.netAreaM2 > 0 ? { shellAreaM2: shell.netAreaM2 } : {}),
        ...(constraints.wallThickness > 0 ? { wallThicknessM: constraints.wallThickness / 1000 } : {}),
        ...(constraints.floorToCeiling > 0 ? { wallHeightM: constraints.floorToCeiling / 1000 } : {}),
        ...(windowSpansWorld && windowSpansWorld.length > 0 ? { windowSpansWorld } : {}),
        ...(doorSpansWorld && doorSpansWorld.length > 0 ? { doorSpansWorld } : {}),
    });

    return candidates.map(c => {
        // Emit ALL walls (perimeter flagged isExternal) so the preview shows the
        // full plan; the executor builds with skipExteriorWalls so the existing
        // shell is never duplicated (coincident walls break room detection).
        // Boundaries (open-plan virtual splitters) live OUTSIDE the LayoutGraph
        // (they aren't BIM elements, just a room-detection helper) and are merged
        // into the LayoutOption alongside the graph projection.
        const { option } = emitGeometry(c.graph);
        const MM = 1000;
        const mm = (n: number): number => Math.round(n * MM * 1e6) / 1e6;
        const boundaries = c.boundaries.map(b => ({
            start: { x: mm(b.a.x), y: mm(b.a.z) },
            end:   { x: mm(b.b.x), y: mm(b.b.z) },
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
