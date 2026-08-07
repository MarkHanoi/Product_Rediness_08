// @vitest-environment happy-dom
//
// §FIX-STAIR-CURVED-MODE-SEED — founder, live build 096e12b4:
//   "the new [C] button renders perfect, on creation it selects the correct mode —
//    but while DRAWING IN 3D it goes back to LINEAR, not working. Then if I select
//    the normal stair and then change the mode, it creates the circular stair."
//
// The shape and the DRAWING MODE were seeded from two different places: the panel's
// `_selectedShape` from `config.initialShape` (so the C button rendered active) and
// `stairMode` from a hard-coded 'straight' literal. `_isCurvedMode()` reads
// `stairMode` LIVE per click, so a session opened as C drew straight polylines.
//
// The mode is now DERIVED from `STAIR_SHAPES` — the one registry that already
// declares a mode per shape — so no surface can hold a rival copy of it.

import { beforeAll, describe, expect, it } from 'vitest';
import { StairPathToolController } from '../StairPathToolController';
import { STAIR_SHAPES, type StairShapeChoice } from '../StairShapeRegistry';
import type { StairSketchCoordinateProvider } from '../StairSketchCoordinateProvider';

// happy-dom ships no Canvas2D implementation; the preview/HUD renderers only need a
// context OBJECT to exist. Nothing under test draws.
beforeAll(() => {
    const ctx2d = new Proxy({}, { get: () => () => undefined });
    (HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext =
        () => ctx2d;
});

const coordinateProvider: StairSketchCoordinateProvider = {
    worldToScreen: (x: number, z: number) => ({ x, y: z }),
} as unknown as StairSketchCoordinateProvider;

function makeController(initialShape: StairShapeChoice): StairPathToolController {
    return new StairPathToolController({
        baseLevelId:        'level:0',
        topLevelId:         'level:1',
        baseLevelElevation: 0,
        topLevelElevation:  3,
        typeId:             'stair-type:default',
        commandManager:     { execute: () => {} },
        coordinateProvider,
        coordinateCanvas:   document.createElement('canvas'),
        initialShape,
    } as unknown as ConstructorParameters<typeof StairPathToolController>[0]);
}

/** The mode the controller is actually drawing in (the value `_isCurvedMode` reads). */
function seededMode(c: StairPathToolController): string {
    return (c as unknown as { _paramPanel: { getParams(): { stairMode: string } } })
        ._paramPanel.getParams().stairMode;
}

describe('§FIX-STAIR-CURVED-MODE-SEED — drawing mode is derived from the shape registry', () => {
    it('opens a C session in curved mode (the founder-reported regression)', () => {
        const c = makeController('C');
        expect(seededMode(c)).toBe('curved');
        c.destroy();
    });

    it('opens I / L / U sessions in straight mode', () => {
        for (const shape of ['I', 'L', 'U'] as const) {
            const c = makeController(shape);
            expect(seededMode(c)).toBe('straight');
            c.destroy();
        }
    });

    it('agrees with STAIR_SHAPES for every catalogued shape — no rival mode table', () => {
        for (const s of STAIR_SHAPES) {
            const c = makeController(s.label);
            expect(seededMode(c)).toBe(s.mode);
            c.destroy();
        }
    });
});
