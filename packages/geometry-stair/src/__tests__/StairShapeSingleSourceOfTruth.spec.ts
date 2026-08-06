// @vitest-environment happy-dom
// ─── §FIX-STAIR-SHAPE-DESYNC ─────────────────────────────────────────────────
//
// FOUNDER DEFECT (two symptoms, one cause):
//   1. "No matter which stair button the user clicks, the panel ALWAYS DEFAULTS
//      TO THE LINEAR (I) STAIR."
//   2. "We are MISSING ONE FOR CURVED STAIR" in the ARCHITECTURE palette.
// And the log showed it was not cosmetic — the shape actually DESYNCED:
//      [StairPath3DToolHandler] activated in 3D (shape=L …)
//      [StairMeshBuilder] Built group … (U, 17 risers)
//
// ROOT CAUSE: the stair shape had THREE holders.
//   • `StairToolConfigStore` — declares itself "THE SINGLE SOURCE OF TRUTH for the
//     stair configuration the architect chose", but its `StairShapeChoice` union
//     omitted 'C', so curved could not survive a round-trip through it;
//   • `StairPathToolController` — seeds `_currentStraightShape` + the click budget
//     from `config.initialShape` (the palette icon);
//   • `StairPathParamPanel._selectedShape` — a RIVAL copy, hard-initialised to 'I'
//     and written ONLY by a click on the panel's own buttons. The activation shape
//     never reached it, so the panel showed 'I' whatever icon was clicked, and its
//     disagreement with the tool is what let an L activation commit as U.
//
// THE CURE: one CATALOGUE (`STAIR_SHAPES`) that the palette, the panel and the
// creation matrix all derive from; one ACTIVE-shape owner (the tool controller,
// seeded from the palette via `initialShape`) with the panel as its VIEW; and one
// resolver for the click budget (`expectedSegmentsFor`) so the panel and the tool
// can never disagree about how many points the architect must draw.

import { describe, it, expect } from 'vitest';
import {
    STAIR_SHAPES,
    stairShapeDescriptor,
    expectedSegmentsFor,
    type StairShapeChoice,
} from '../stairPath/StairShapeRegistry';
import { StairPathParamPanel } from '../stairPath/StairPathParamPanel';
import {
    getStairToolConfig,
    setStairToolConfig,
    resetStairToolConfig,
    DEFAULT_STAIR_TOOL_CONFIG,
} from '../StairToolConfigStore';

const ALL_SHAPES: StairShapeChoice[] = ['I', 'L', 'U', 'C'];

function makePanel(initialShape?: StairShapeChoice): StairPathParamPanel {
    const params = {
        baseLevelId: 'L0', topLevelId: 'L1', width: 1.2, riserHeight: 0.175,
        riserCount: 0, treadDepth: 0.28, risersBeforeLanding: 0, risersInRun2: 0,
        turnDirection: 'left', uVariant: '2-run', stairMode: 'straight',
        innerRadius: 0.8, sweepAngle: 180,
    } as unknown as ConstructorParameters<typeof StairPathParamPanel>[0];
    return initialShape === undefined
        ? new StairPathParamPanel(params, () => {}, [])
        : new StairPathParamPanel(params, () => {}, [], undefined, initialShape);
}

describe('§FIX-STAIR-SHAPE-DESYNC — one shape catalogue', () => {
    it('declares every authorable shape exactly once', () => {
        expect(STAIR_SHAPES.map(s => s.label)).toEqual(ALL_SHAPES);
        expect(new Set(STAIR_SHAPES.map(s => s.label)).size).toBe(STAIR_SHAPES.length);
    });

    it('includes the CURVED shape the palette was missing', () => {
        const c = stairShapeDescriptor('C');
        expect(c).toBeDefined();
        expect(c!.mode).toBe('curved');
    });

    it('every shape carries a hint, so a palette/panel face can be derived without a second list', () => {
        for (const s of STAIR_SHAPES) {
            expect(s.hint.length).toBeGreaterThan(0);
            expect(['straight', 'curved']).toContain(s.mode);
        }
    });
});

describe('§FIX-STAIR-SHAPE-DESYNC — the panel REFLECTS the activation shape', () => {
    it.each(ALL_SHAPES)('activating with %s opens the panel on %s (never a hard-coded I)', (shape) => {
        expect(makePanel(shape).getSelectedShape()).toBe(shape);
    });

    it('only falls back to I when the caller genuinely supplies no shape', () => {
        expect(makePanel().getSelectedShape()).toBe('I');
    });

    it('the tool can re-seat the panel without re-entering the panel→tool callback', () => {
        let callbackFired = false;
        const params = makePanel('I');
        (params as unknown as { _onShapeSelect: () => void })._onShapeSelect = () => { callbackFired = true; };
        params.setSelectedShape('U');
        expect(params.getSelectedShape()).toBe('U');
        expect(callbackFired).toBe(false); // tool→panel is a VIEW update, not a mutation
    });
});

describe('§FIX-STAIR-SHAPE-DESYNC — ONE click budget, so activation cannot diverge from commit', () => {
    it.each([
        ['I', '2-run', 1],
        ['L', '2-run', 2],
        ['U', '2-run', 2],
        ['U', '3-run', 3],
        ['C', '2-run', 0], // curved commits on its own sweep gesture, not on segments
    ] as const)('%s (%s) expects %i segment(s)', (shape, uVariant, expected) => {
        expect(expectedSegmentsFor(shape, uVariant)).toBe(expected);
    });

    it('an L activation must NOT accept a U-sized click budget', () => {
        // The founder's exact divergence: activated shape=L, 4 points drawn, built U.
        // With one resolver, L can never quote U's segment count.
        expect(expectedSegmentsFor('L')).not.toBe(expectedSegmentsFor('U', '3-run'));
        expect(expectedSegmentsFor('L')).toBe(2);
    });

    it('an unknown/absent shape yields 0 (no auto-commit), never a silent default', () => {
        expect(expectedSegmentsFor(null)).toBe(0);
        expect(expectedSegmentsFor(undefined)).toBe(0);
    });
});

describe('§FIX-STAIR-SHAPE-DESYNC — StairToolConfigStore round-trips every shape', () => {
    it.each(ALL_SHAPES)('%s survives a write/read through the config chokepoint', (shape) => {
        resetStairToolConfig();
        setStairToolConfig({ shape });
        expect(getStairToolConfig().shape).toBe(shape);
        resetStairToolConfig();
        expect(getStairToolConfig().shape).toBe(DEFAULT_STAIR_TOOL_CONFIG.shape);
    });
});
