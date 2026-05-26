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
 * decomposed (degenerate perimeter).
 */
export function generateDeterministicLayouts(
    shell: ShellAnalysis,
    program: ApartmentProgram,
    constraints: ApartmentConstraints,
    weights: ScoringWeights,
    count: number,
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
        const labelled = { ...option, boundaries, summary: `${option.summary} (offline · D-TGL)` };
        return { ...labelled, score: scoreLayout(labelled, weights) };
    });
}

export { makeSeed as __makeSeedForTest };
