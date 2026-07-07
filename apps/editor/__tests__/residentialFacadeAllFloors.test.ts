// @vitest-environment happy-dom
//
// §FIX-RESI-FACADE-ALL-FLOORS (L-156) — regression lock for the residential-building
// generator emitting the FAÇADE / perimeter shell wall ring on EVERY storey.
//
// The founder reported (L-156) that a multi-storey residential building appeared to
// carry a full brick façade on the GROUND floor only, upper floors showing slabs +
// fragments but "no exterior walls". This test drives the REAL executor headlessly
// (orchestrator → ResidentialBuildingExecutor.execute) and captures every
// `wall.batch.create` the executor dispatches, then asserts the perimeter (footprint-
// boundary) wall ring is emitted on the GROUND level AND on every UPPER storey, each
// wall stamped with that storey's own `levelId` and its per-floor wall height (ground
// = tall commercial storey, uppers = floor-to-floor). This is the generation-layer
// contract for the typology pack (C11 + [[reuse-residential-house-pipeline-patterns]]):
// the shell footprint is looped per storey, never level-0-only.
//
// NOTE: this asserts the GENERATION layer (the walls are created + stamped per storey).
// It intentionally does NOT exercise the 3D render/culling path — whether a level's
// (correctly-created) walls are DRAWN in full detail vs collapsed to a massing LOD proxy
// is a separate rendering concern (LevelScoped3DCullingService, L-164), out of this lane.

import { describe, expect, it } from 'vitest';
import { ResidentialBuildingExecutor } from '../src/ui/residential-building/ResidentialBuildingExecutor.js';
import { orchestrateResidentialBuilding } from '@pryzm/ai-host';

/** A clean rectangular parcel (metres, plan XZ) — deterministic, orthogonal shell. */
const RECT = [
    { x: 0, z: 0 },
    { x: 24, z: 0 },
    { x: 24, z: 16 },
    { x: 0, z: 16 },
];
const UPPER_LEVELS = 4;
const FLOOR_TO_FLOOR_M = 3;
const EPS = 0.05;

/** The four rectangle edges as (axis, constant-coordinate) pairs. A wall lies ON an
 *  edge when BOTH its baseline endpoints share that constant coordinate. */
const EDGES: Array<{ axis: 'x' | 'z'; at: number }> = [
    { axis: 'x', at: 0 },
    { axis: 'x', at: 24 },
    { axis: 'z', at: 0 },
    { axis: 'z', at: 16 },
];

function endpointsOnEdge(a: { x: number; z: number }, b: { x: number; z: number }, edge: { axis: 'x' | 'z'; at: number }): boolean {
    return Math.abs(a[edge.axis] - edge.at) < EPS && Math.abs(b[edge.axis] - edge.at) < EPS;
}
function onBoundary(a: { x: number; z: number }, b: { x: number; z: number }): boolean {
    return EDGES.some((e) => endpointsOnEdge(a, b, e));
}

interface CapturedLevel {
    total: number;
    boundary: number;
    /** distinct rounded heights of the boundary (façade) walls */
    boundaryHeights: Set<number>;
    /** which of the 4 footprint edges are covered by ≥1 boundary wall */
    edgesCovered: Set<number>;
}

/** Drive orchestrator + executor once, capturing wall.batch.create per level. */
async function runAndCapture(): Promise<{ mintedUpperLevelIds: string[]; groundId: string; byLevel: Map<string, CapturedLevel> }> {
    const groundId = 'L0-resi-facade-test';
    const mintedUpperLevelIds: string[] = [];

    (window as unknown as { commandManager?: unknown }).commandManager = {
        execute: (cmd: unknown) => {
            const c = cmd as { constructor?: { name?: string }; payload?: { levelId?: string; name?: string } };
            // Capture the editor levels the executor mints (AddLevelCommand) so we can
            // assert the shell walls stamp exactly those per-storey ids.
            if (c?.constructor?.name === 'AddLevelCommand' && typeof c.payload?.levelId === 'string') {
                const nm = c.payload.name ?? '';
                if (/^Level \d+$/.test(nm)) mintedUpperLevelIds.push(c.payload.levelId);
            }
            return { success: true };
        },
    };
    (window as unknown as { projectContext?: unknown }).projectContext = { activeLevelId: groundId };
    (window as unknown as { bimManager?: unknown }).bimManager = {
        getLevelById: () => ({ elevation: 0, height: FLOOR_TO_FLOOR_M }),
        getActiveLevel: () => ({ id: groundId, elevation: 0, height: FLOOR_TO_FLOOR_M }),
    };
    // Run as one synchronous task (no frame-yield awaits) for a deterministic capture.
    (globalThis as { __pryzmProgressiveGeneration?: boolean }).__pryzmProgressiveGeneration = false;

    const res = orchestrateResidentialBuilding({
        footprint: RECT,
        upperLevels: UPPER_LEVELS,
        coreWidthM: 6,
        coreDepthM: 4,
        corridorWidthM: 1.5,
        minApartmentAreaM2: 45,
        maxApartmentAreaM2: 120,
        typologies: { T2: true, T3: true },
        floorToFloorM: FLOOR_TO_FLOOR_M,
        baseElevationM: 0,
    } as never) as { status: string; levels?: unknown[] };
    expect(res.status).toBe('ok');

    const byLevel = new Map<string, CapturedLevel>();
    const runtime = {
        events: { emit(): void {} },
        bus: {
            executeCommand(cmd: string, payload: { levelId?: string; walls?: Array<{ levelId?: string; height?: number; baseLine?: Array<{ x: number; z: number }> }> }): undefined {
                if (cmd === 'wall.batch.create' && Array.isArray(payload?.walls)) {
                    for (const w of payload.walls) {
                        const lvl = w.levelId ?? payload.levelId ?? '(none)';
                        const g = byLevel.get(lvl) ?? { total: 0, boundary: 0, boundaryHeights: new Set<number>(), edgesCovered: new Set<number>() };
                        g.total++;
                        const bl = w.baseLine;
                        if (bl && bl.length >= 2 && onBoundary(bl[0]!, bl[1]!)) {
                            g.boundary++;
                            g.boundaryHeights.add(Math.round((w.height ?? 0) * 100) / 100);
                            EDGES.forEach((e, i) => { if (endpointsOnEdge(bl[0]!, bl[1]!, e)) g.edgesCovered.add(i); });
                        }
                        byLevel.set(lvl, g);
                    }
                }
                return undefined;
            },
        },
    };

    await new ResidentialBuildingExecutor().execute(runtime as never, res as never, {
        floorToFloorM: FLOOR_TO_FLOOR_M,
        balconies: false,
    });

    return { mintedUpperLevelIds, groundId, byLevel };
}

describe('§FIX-RESI-FACADE-ALL-FLOORS — residential façade ring on every storey (L-156)', () => {
    it('emits perimeter façade walls on the ground floor AND every upper storey', async () => {
        const { mintedUpperLevelIds, groundId, byLevel } = await runAndCapture();

        // The executor mints one editor level per upper storey (ground reuses the active level).
        expect(mintedUpperLevelIds.length).toBe(UPPER_LEVELS);

        // Ground + every upper storey must have received perimeter (footprint-boundary) walls.
        const expectedWalledLevels = [groundId, ...mintedUpperLevelIds];
        for (const lid of expectedWalledLevels) {
            const g = byLevel.get(lid);
            expect(g, `level ${lid} received no wall.batch.create`).toBeDefined();
            // A perimeter ring — at least the 4 footprint edges — on THIS storey.
            expect(g!.boundary, `level ${lid} has no façade/perimeter walls`).toBeGreaterThanOrEqual(4);
        }
    }, 180000);

    it('each upper storey wraps all four footprint edges at its own per-floor wall height', async () => {
        const { mintedUpperLevelIds, byLevel } = await runAndCapture();

        for (const lid of mintedUpperLevelIds) {
            const g = byLevel.get(lid)!;
            // Full perimeter: all four rectangle edges covered by a façade wall on this storey.
            expect(g.edgesCovered.size, `upper level ${lid} does not wrap all 4 footprint edges`).toBe(EDGES.length);
            // Upper storeys carry the floor-to-floor wall height (not the ground commercial height).
            expect([...g.boundaryHeights]).toContain(FLOOR_TO_FLOOR_M);
            for (const h of g.boundaryHeights) {
                expect(h, `upper level ${lid} façade wall height ${h} ≠ floor-to-floor`).toBeCloseTo(FLOOR_TO_FLOOR_M, 2);
            }
        }
    }, 180000);

    it('the ground commercial storey carries a TALLER façade than the residential storeys', async () => {
        const { mintedUpperLevelIds, groundId, byLevel } = await runAndCapture();

        const ground = byLevel.get(groundId)!;
        const groundH = Math.max(...ground.boundaryHeights);
        // Ground is the tall (≥4.5 m) commercial storey; uppers are floor-to-floor.
        expect(groundH).toBeGreaterThan(FLOOR_TO_FLOOR_M);
        for (const lid of mintedUpperLevelIds) {
            const upperH = Math.max(...byLevel.get(lid)!.boundaryHeights);
            expect(groundH).toBeGreaterThan(upperH);
        }
    }, 180000);
});
