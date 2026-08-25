// @vitest-environment happy-dom
//
// ⛔ §HONESTY65-CURTAIN-DROP-NAMED (L-11151) — when the curtain-shopfront mode wins
// (explicit curtain ask + the photo's ground band measured square-headed), the
// executor used to drop the ENTIRE measured lattice in silence: `facadeRuns` stays
// empty in curtain mode, the §GEN-FACADE-OPENINGS pass never ran, and no transcript
// line said so. C74: name what you measured and what you did with it.
//
// The twin control locks the OTHER branch unchanged: an ARCHED ground band beats the
// curtain ask (a curtain wall has no wall to cut an arch in, L-11081), builds the
// arcade, and must NOT emit the drop line.

import { describe, expect, it } from 'vitest';
import { ResidentialBuildingExecutor } from '../src/ui/residential-building/ResidentialBuildingExecutor.js';
import { orchestrateResidentialBuilding, type FacadeOpeningProgram } from '@pryzm/ai-host';

const RECT = [
    { x: 0, z: 0 },
    { x: 24, z: 0 },
    { x: 24, z: 16 },
    { x: 0, z: 16 },
];
const FLOOR_TO_FLOOR_M = 3;

/** A measured 3-bay × 2-band lattice whose GROUND band is uniformly `archness`. */
function programWithGroundArchness(archness: number): FacadeOpeningProgram {
    const cells = [];
    for (let band = 0; band < 2; band++) {
        for (let bay = 0; bay < 3; bay++) {
            cells.push({
                bayIndex: bay, bandIndex: band,
                widthFraction: 0.5, heightFraction: 0.6,
                archness: band === 0 ? archness : 0,
                confidence: 0.9,
            });
        }
    }
    return { bays: 3, bands: 2, bandHeightFractions: [0.5, 0.5], cells, confidence: 0.9 };
}

async function runWithProgram(archness: number): Promise<readonly string[]> {
    (window as unknown as { commandManager?: unknown }).commandManager = {
        execute: () => ({ success: true }),
    };
    (window as unknown as { projectContext?: unknown }).projectContext = { activeLevelId: 'L0-curtain-drop-test' };
    (window as unknown as { bimManager?: unknown }).bimManager = {
        getLevelById: () => ({ elevation: 0, height: FLOOR_TO_FLOOR_M }),
        getActiveLevel: () => ({ id: 'L0-curtain-drop-test', elevation: 0, height: FLOOR_TO_FLOOR_M }),
    };
    (globalThis as { __pryzmProgressiveGeneration?: boolean }).__pryzmProgressiveGeneration = false;

    const res = orchestrateResidentialBuilding({
        footprint: RECT,
        upperLevels: 2,
        coreWidthM: 6,
        coreDepthM: 4,
        corridorWidthM: 1.5,
        minApartmentAreaM2: 45,
        maxApartmentAreaM2: 120,
        typologies: { T2: true, T3: true },
        floorToFloorM: FLOOR_TO_FLOOR_M,
        baseElevationM: 0,
    } as never) as { status: string };
    expect(res.status).toBe('ok');

    const runtime = {
        events: { emit(): void {} },
        bus: { executeCommand(): undefined { return undefined; } },
    };
    const out = await new ResidentialBuildingExecutor().execute(runtime as never, res as never, {
        floorToFloorM: FLOOR_TO_FLOOR_M,
        balconies: false,
        // The founder's explicit curtain ask, alongside the measured lattice.
        groundCommercialCurtain: true,
        facadeOpeningProgram: programWithGroundArchness(archness),
    } as never) as { ok: boolean; facadeNotes?: readonly string[] };
    expect(out.ok).toBe(true);
    return out.facadeNotes ?? [];
}

describe('§HONESTY65-CURTAIN-DROP-NAMED — the dropped lattice reaches the transcript', () => {
    it('curtain mode wins (square-headed band) ⇒ the drop is NAMED: what was measured and why it was not built', async () => {
        const notes = await runWithProgram(0);
        const drop = notes.find((n) => n.includes('was NOT built'));
        expect(drop, `facadeNotes were: ${JSON.stringify(notes)}`).toBeDefined();
        // WHAT was measured — the lattice, by its numbers.
        expect(drop!).toContain('6 opening(s)');
        expect(drop!).toContain('3 bay(s)');
        expect(drop!).toContain('2 band(s)');
        // WHY it was not built — the curtain ask won and a curtain wall cannot host it.
        expect(drop!).toContain('curtain');
    }, 180000);

    it('CONTROL — an arched ground band beats the curtain ask: arcade built, NO drop line', async () => {
        const notes = await runWithProgram(1);
        expect(notes.some((n) => n.includes('was NOT built'))).toBe(false);
        // The pre-existing override note still names the mode decision (L-11081)…
        expect(notes.some((n) => n.includes('ARCADE'))).toBe(true);
        // …and the lattice actually landed as openings.
        expect(notes.some((n) => n.includes('built from the photograph'))).toBe(true);
    }, 180000);
});
