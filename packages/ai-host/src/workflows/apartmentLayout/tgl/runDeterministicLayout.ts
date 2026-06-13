// TGL — offline engine entry: ShellAnalysis → ScoredLayoutOption[].
//
// The single bridge between the editor's generate orchestrator and the pure D-TGL
// engine (P1→P9). Given the analysed shell + program + constraints, it enumerates
// candidate layouts (deterministic Pareto, §2.2), projects each to a LayoutOption
// (P9) and attaches the existing LayoutScore so the modal/score UI is unchanged.
// This REPLACES the strip-slicer `generateProceduralLayout` behind generate.ts's
// opt-in fallback seam — same shape out, real architecture in. Pure + deterministic.

import type { ApartmentConstraints, ApartmentProgram, ScoringWeights, ScoredLayoutOption, LayoutOption, EngineTuning } from '../types.js';
import type { ShellAnalysis } from '../shellAnalysis.js';
import { scoreLayout } from '../score.js';
import { enumerateLayouts } from './enumerate.js';
import { emitGeometry, type EmitGeometryOpts } from './emitGeometry.js';
import { principalAxisAngle, rotatePt, projectPartitionEndpointsToShell, rectifyConvexQuad, polygonBBox, type Pt } from './rectDecomposition.js';
import { equatorFacingDir } from '../windowEmission/solarOrientation.js';
// ST.5 — the StyleRegistry resolves the brief style to a numeric glazing bias.
import { glazingBiasFor } from '../../furnishLayout/style/StyleRegistry.js';

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
    // A.21.h — OPTIONAL gross-area envelope validator. Absent → the apartment §D3.5
    // gate (byte-identical apartment behaviour). The house orchestrator injects
    // `validateHouseStorey` so a house plate is judged by its full programme.
    envelopeValidator?: (args: { program: ApartmentProgram; grossAreaM2: number }) => import('../dimensions/types.js').DimensionalValidation,
    // §STAIR-KEEPOUT (A.21.D21) — OPTIONAL axis-aligned WORLD-XZ keep-out rects
    // (metres) — the vertical stair core(s) a multi-storey house reserves. Each is
    // forward-mapped into the engine's principal-axis frame (the same −angle map as
    // the shell), then subtracted from the decomposed plate BEFORE subdivide so no
    // room/partition crosses the stair (SPEC-CASA §7). Absent ⇒ apartment path is
    // bit-identical.
    keepOutRectsWorld?: ReadonlyArray<{ x0: number; z0: number; x1: number; z1: number }>,
    // A.25.3 — OPTIONAL Living-Design-Parameter engine tuning (adjacency strictness /
    // corridor width / solar weight / habitable-area generosity). Absent ⇒ engine
    // defaults — byte-identical to the pre-A.25.3 baseline (Pareto-equality invariant).
    tuning?: EngineTuning,
    // §DIAG-FILL-RESIDUAL (founder defect §65.2, 2026-06-11) — OPTIONAL extra WORLD-XZ
    // exclusion rect(s) consumed ONLY by the residual-claim pass (NOT the main carve), so
    // a grown/minted leftover cell never tiles into them. Carries the RESERVED stair-core
    // (the modal "Stair" cell), which can sit offset from the shipped-footprint keep-out.
    // Mapped into the engine frame exactly like `keepOutRectsWorld`. Absent ⇒ no effect.
    residualExcludeRectsWorld?: ReadonlyArray<{ x0: number; z0: number; x1: number; z1: number }>,
    // ST.5 (SPEC-INTERIOR-STYLE-SYSTEM §6) — the selected interior STYLE (brief
    // value, e.g. 'mediterranean'/'nordic'/'industrial'). Resolved once via the
    // StyleRegistry to a numeric glazing bias that scales every emitted window
    // (composing with the climate factor). Absent / unknown → no bias (byte-
    // identical window emission, since glazingBias defaults to 1).
    style?: string,
    // §STAIR-KEEPOUT-LAYOUT-TIGHT (founder oversized-stair defect, 2026-06-12) —
    // OPTIONAL keep-out / residual-exclude rect(s) ALREADY EXPRESSED IN THE ENGINE
    // (principal-axis / layout) FRAME, so they BYPASS `mapRectToEngine`. The world-
    // frame `keepOutRectsWorld` path takes the AABB of the rotated stair footprint
    // (inflated once) then `mapRectToEngine` AABBs it AGAIN (inflated twice) — on a
    // SKEWED plate that double-AABB bloated the stair keep-out to ~1.8× the real
    // footprint (the founder's ~33 m² stair + the matching empty cell above it). The
    // house orchestrator instead carves the stair footprint's TIGHT layout-frame AABB
    // (axis-aligned in that frame ⇒ no inflation) and passes it here. When supplied it
    // SUPERSEDES the world keep-out (the orchestrator passes one or the other, never
    // both). Absent ⇒ the legacy world path (apartment + axis-aligned house byte-
    // identical, ADR-0061).
    keepOutRectsLayout?: ReadonlyArray<{ x0: number; z0: number; x1: number; z1: number }>,
    residualExcludeRectsLayout?: ReadonlyArray<{ x0: number; z0: number; x1: number; z1: number }>,
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
    // A.25.3 — the climate slider drives the D6 SolarBias.weight. When the tuning
    // supplies one it OVERRIDES the caller's solar.weight; otherwise the existing
    // value (or the D6 default 0.6 inside the emitter) stands — identity when
    // climate is centred (tuning is null).
    const effectiveSolarWeight = tuning?.solarWeight ?? solar?.weight;
    // ST.5 — resolve the style's glazing bias ONCE. Only thread a non-neutral bias
    // (≠ 1) so the absent/default-style path produces byte-identical window emission.
    const glazingBias = style !== undefined ? glazingBiasFor(style) : 1;
    const hasBias = glazingBias !== 1;
    const emitOpts: EmitGeometryOpts | undefined = emitSun || hasBias
        ? {
            ...(emitSun ? { solar: { sunDir: emitSun, ...(effectiveSolarWeight !== undefined ? { weight: effectiveSolarWeight } : {}), ...(solar?.latDeg !== undefined ? { latDeg: solar.latDeg } : {}) } } : {}),
            ...(hasBias ? { glazingBias } : {}),
        }
        : undefined;

    // Forward map (world → axis-aligned frame): rotate by −angle about the centroid.
    const fwdSpan = (sp: { a: { x: number; z: number }; b: { x: number; z: number } }) => ({
        a: rotatePt(sp.a, -angle, pivot),
        b: rotatePt(sp.b, -angle, pivot),
    });
    const shellPolygon = angle === 0 ? perimeter : perimeter.map(p => rotatePt(p, -angle, pivot));
    const winSpans = angle === 0 ? windowSpansWorld : windowSpansWorld?.map(fwdSpan);
    const doorSpans = angle === 0 ? doorSpansWorld : doorSpansWorld?.map(fwdSpan);

    // §STAIR-KEEPOUT (A.21.D21) — map each WORLD keep-out rect into the engine's
    // principal-axis frame. When angle === 0 the rect passes straight through
    // (house shells are typically axis-aligned). Otherwise we rotate the four
    // corners by −angle about the pivot and take their axis-aligned bbox — a
    // conservative cover of the core in the rotated frame (never under-reserves).
    const mapRectToEngine = (r: { x0: number; z0: number; x1: number; z1: number }) => {
        if (angle === 0) return { x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1 };
        const corners = [
            rotatePt({ x: r.x0, z: r.z0 }, -angle, pivot),
            rotatePt({ x: r.x1, z: r.z0 }, -angle, pivot),
            rotatePt({ x: r.x1, z: r.z1 }, -angle, pivot),
            rotatePt({ x: r.x0, z: r.z1 }, -angle, pivot),
        ];
        return {
            x0: Math.min(...corners.map(c => c.x)), z0: Math.min(...corners.map(c => c.z)),
            x1: Math.max(...corners.map(c => c.x)), z1: Math.max(...corners.map(c => c.z)),
        };
    };
    // §STAIR-KEEPOUT-LAYOUT-TIGHT — a layout-frame keep-out (already axis-aligned in the
    // engine frame) SUPERSEDES the world keep-out so it is NOT re-AABB'd by mapRectToEngine
    // (which would inflate a rotated stair footprint a second time). The orchestrator passes
    // one or the other, never both; when the layout-frame set is present we use it verbatim.
    const keepOutEngine = keepOutRectsLayout && keepOutRectsLayout.length > 0
        ? keepOutRectsLayout.map(r => ({ x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1 }))
        : keepOutRectsWorld?.map(mapRectToEngine);
    const residualExcludeEngine = residualExcludeRectsLayout && residualExcludeRectsLayout.length > 0
        ? residualExcludeRectsLayout.map(r => ({ x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1 }))
        : residualExcludeRectsWorld?.map(mapRectToEngine);

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
        ...(envelopeValidator ? { envelopeValidator } : {}),
        ...(keepOutEngine && keepOutEngine.length > 0 ? { keepOutRects: keepOutEngine } : {}),
        ...(residualExcludeEngine && residualExcludeEngine.length > 0 ? { residualExcludeRects: residualExcludeEngine } : {}),
        // §ENV-E2-SOLAR (E.2) — thread the site latitude so the engine biases
        // daytime rooms toward the sun face. Reuses the SAME `solar.latDeg` the
        // window-orientation pass (A.21.D6) already consumes. Absent ⇒ neutral axis.
        ...(solar && Number.isFinite(solar.latDeg) ? { solarLatDeg: solar.latDeg } : {}),
        // A.25.3 — Living-Design-Parameter engine tuning (adjacency strictness /
        // corridor width / habitable-area generosity). Each is absent unless the
        // user moved its slider off the neutral midpoint (the tuning is null), so
        // the default path is byte-identical (Pareto-equality invariant).
        ...(tuning?.adjacencyStrictness !== undefined ? { adjacencyStrictness: tuning.adjacencyStrictness } : {}),
        ...(tuning?.corridorWidthM !== undefined ? { corridorWidthM: tuning.corridorWidthM } : {}),
        ...(tuning?.spaceGenerosity !== undefined ? { spaceGenerosity: tuning.spaceGenerosity } : {}),
    });

    return candidates.map((c, idx) => {
        // Emit ALL walls (perimeter flagged isExternal) so the preview shows the
        // full plan; the executor builds with skipExteriorWalls so the existing
        // shell is never duplicated (coincident walls break room detection).
        // Boundaries (open-plan virtual splitters) live OUTSIDE the LayoutGraph
        // (they aren't BIM elements, just a room-detection helper) and are merged
        // into the LayoutOption alongside the graph projection.
        const emitted = emitGeometry(c.graph, emitOpts);

        // §RECTIFY-SHELL-PROJECT (multi-storey room-merge cure, 2026-06-09; ADR-0063 §8.5).
        // §RECTIFY-QUAD tiles the interior partitions inside the AXIS-ALIGNED BBOX of the
        // (rotated) sheared shell, so a partition that should terminate on the PERIMETER
        // lands on the bbox edge — up to ~2.1 m INSIDE which the executor's real
        // (`storey.footprint === shell.perimeter`) ring sits → an open seam the 0.60 m weld
        // can't bridge → RoomDetection floods → every room merges into one. CURE: in the
        // SAME rotated frame the partitions were tiled in (BEFORE rotate-back), project the
        // bbox-edge partition endpoints OUTWARD onto the REAL shell polygon (= shellPolygon,
        // the rotated perimeter). Only INTERIOR (non-external) walls are projected — the
        // external/perimeter walls are dropped by the executor's skipExteriorWalls and moving
        // them would shift already-emitted window offsets. When the shell does NOT rectify
        // (axis-aligned rectangle, L/U/T, > 4 vertices, sub-fill quad → no rectify), the helper
        // returns the walls UNCHANGED (same reference) → BYTE-IDENTICAL for the apartment + every
        // rectilinear plate (proven by rectShellProject.test.ts). The weld now degrades from the
        // primary seal to a safety net (composes with §SHELL-SNAP-WIDEN + §SHELL-ANCHOR-PRESERVE).
        const projectedWalls = projectPartitionEndpointsToShell(emitted.option.walls, shellPolygon);
        const emittedOption = projectedWalls === emitted.option.walls
            ? emitted.option
            : { ...emitted.option, walls: projectedWalls as typeof emitted.option.walls };

        // §DIAG-RECTIFY-PROJECT (founder §68.6 open question, 2026-06-13) — the multi-storey
        // room-merge cure is silent today: the founder asked "is §RECTIFY-QUAD even triggering,
        // and is projectPartitionEndpointsToShell reaching the real shell?" — the two unknowns
        // that decide whether a merged-room run is the §RECTIFY gap (C) or another cause. This
        // ALWAYS-ON line answers both per ranked candidate (#0 = the shipped one):
        //   • rectifyFired — did the shell rectify (→ partitions tiled in the bbox, projection active)?
        //   • projected   — how many interior walls had an endpoint moved onto the real shell.
        //   • maxResidual — the largest distance to the REAL shell of any interior endpoint STILL
        //     on the rectified-bbox edge AFTER projection (a successful projection moves it OFF
        //     the bbox edge ONTO the shell → 0 such endpoints). A non-zero residual means a
        //     perimeter-terminating partition FAILED to reach the shell (move > maxMoveM cap, or
        //     no ray hit) → the open seam that floods RoomDetection. Logging only (ADR-0061).
        if (idx === 0 && shellPolygon.length >= 3) {
            const rectified = rectifyConvexQuad(shellPolygon);
            const rectifyFired = rectified.length !== shellPolygon.length
                || rectified.some((p, i) => Math.abs(p.x - shellPolygon[i]!.x) > 1e-9 || Math.abs(p.z - shellPolygon[i]!.z) > 1e-9);
            let projectedCount = 0;
            let maxResidualM = 0;
            if (rectifyFired) {
                for (let wi = 0; wi < emitted.option.walls.length; wi++) {
                    if (projectedWalls[wi] !== emitted.option.walls[wi]) projectedCount++;
                }
                const bb = polygonBBox(rectified);
                const edgeTolM = 0.06;
                const distToRing = (xM: number, zM: number): number => {
                    let best = Infinity;
                    for (let i = 0; i < shellPolygon.length; i++) {
                        const a = shellPolygon[i]!, b = shellPolygon[(i + 1) % shellPolygon.length]!;
                        const ex = b.x - a.x, ez = b.z - a.z;
                        const l2 = ex * ex + ez * ez || 1e-30;
                        const t = Math.max(0, Math.min(1, ((xM - a.x) * ex + (zM - a.z) * ez) / l2));
                        best = Math.min(best, Math.hypot(xM - (a.x + t * ex), zM - (a.z + t * ez)));
                    }
                    return best;
                };
                for (const w of projectedWalls) {
                    if ((w as { isExternal?: boolean }).isExternal === true) continue;
                    for (const e of [w.start, w.end]) {
                        const xM = e.x / 1000, zM = e.y / 1000;
                        const onEdge = Math.abs(xM - bb.x0) <= edgeTolM || Math.abs(xM - bb.x1) <= edgeTolM
                            || Math.abs(zM - bb.z0) <= edgeTolM || Math.abs(zM - bb.z1) <= edgeTolM;
                        if (onEdge) maxResidualM = Math.max(maxResidualM, distToRing(xM, zM));
                    }
                }
            }
            console.log(
                `[D-TGL] §DIAG-RECTIFY-PROJECT rectifyFired=${rectifyFired} projected=${projectedCount} `
                + `maxResidual=${maxResidualM.toFixed(3)}m`
                + `${rectifyFired && maxResidualM > 0.02 ? ' ⚠ a perimeter-terminating partition did NOT reach the shell (open seam → room merge)' : rectifyFired ? ' ✓ all perimeter partitions on the shell' : ' (no rectify — stair-step decomposition; partitions tile the real shell directly)'}`,
            );
        }

        // §PRINCIPAL-AXIS inverse map (axis-aligned frame → world): rotate emitted
        // mm geometry by +angle about the mm pivot. No-op when angle === 0.
        const option = angle === 0 ? emittedOption : rotateOptionBack(emittedOption, angle, pivotMm);
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
                solarOrientation: c.objectives.solarOrientation,
                acousticZoning: c.objectives.acousticZoning,
                naturalVentilation: c.objectives.naturalVentilation,
            },
        };
        return { ...labelled, score };
    });
}

export { makeSeed as __makeSeedForTest };
