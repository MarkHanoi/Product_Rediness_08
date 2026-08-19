/**
 * §ELEMENT-FILTER-WRITES-INTENT — C09 §4.7 / ADR-0336.
 *
 * WHAT THIS PINS, and why it is not a tautology.
 *
 * The founder's report was "the element filter works great in 3D but not in plan".
 * The root cause is that the Project Browser wrote `Object3D.visible`, which ONLY
 * the 3D viewport reads: `EdgeProjectorService` Source B (the native-element path
 * feeding plan / section / elevation) contains ZERO reads of `Object3D.visible`.
 * So the old behaviour was UNSATISFIABLE in plan, not merely broken.
 *
 * These specs therefore assert the PROJECTED-SIDE OUTPUT — the composed PEN that
 * `PlanViewCanvas` paints with — and NOT that a flag was set or that a function
 * was called. A test asserting `bag.elemVisible.get(id) === false` would score
 * 1.000 against the broken build and is worth nothing.
 *
 * NOT STUBBED (the things under test):
 *   - the real `applyElementVisibility` / `resetAllVisibility` browser controls
 *   - the real `HideElementInViewCommand` / `ClearOverrideCommand` /
 *     `ClearAllOverridesCommand`
 *   - the real `viewIntentInstanceStore` + `visibilityIntentStore`
 *   - the real `graphicsRulesEngine.resolveStyle()` — the SAME entry point
 *     `PlanViewCanvas.ts:459` calls, with the same argument shape
 *
 * SUBSTITUTED (transport only, and named honestly): `window.runtime.bus` is wired
 * here to the real command constructors. In the app that wiring is
 * `initBusHandlers.ts:2366-2394`. This spec does NOT prove that registration
 * exists — it proves that IF the verb is dispatched, the projected pen changes.
 * The registration is pinned separately by the app's own bus-handler suite.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { graphicsRulesEngine, viewIntentInstanceStore } from '@pryzm/core-app-model';
import {
    HideElementInViewCommand,
    ClearOverrideCommand,
    ClearAllOverridesCommand,
} from '@pryzm/command-registry';

import { applyElementVisibility, resetAllVisibility } from '../ProjectVisibilitySection';
import type { UBPBag } from '../BrowserDataHelpers';

const PLAN_VIEW  = 'vd-spec-plan-ground';
const OTHER_VIEW = 'vd-spec-plan-first';
const WALL_A     = 'spec-wall-a';
const WALL_B     = 'spec-wall-b';

/** The exact call `PlanViewCanvas.ts:459` makes for one projected line. */
function projectedPen(viewId: string, elementId: string) {
    return graphicsRulesEngine.resolveStyle('CUT' as never, 'wall', {
        viewId, elementId, viewType: 'plan',
    } as never);
}

function makeBag(): UBPBag {
    return {
        sectionId: 'spec', runtime: null, roofStore: null,
        buildingVisible: true, isolateMode: null, selectedElemId: null,
        expandedLevels: new Set(), expandedTypes: new Map(),
        levelVisible: new Map(), typeVisible: new Map(), elemVisible: new Map(),
        catExpanded: new Set(), catTypeExpanded: new Map(),
        catVisible: new Map(), catTypeVisible: new Map(),
        refresh: () => {},
        makeVisBtn: () => document.createElement('div'),
        makeIsoBtn: () => document.createElement('div'),
    } as unknown as UBPBag;
}

beforeEach(() => {
    // Active view — the scope every intent delta is written against (C09 §4.7.3).
    (window as unknown as Record<string, unknown>).viewDefinitionStore = {
        getActiveId: () => PLAN_VIEW,
    };
    // Transport only. Routes the verb to the REAL command, as the app does.
    (window as unknown as Record<string, unknown>).runtime = {
        bus: {
            executeCommand: async (verb: string, p: Record<string, string>) => {
                if (verb === 'view.hideElement') {
                    new HideElementInViewCommand(p.viewId, p.elementId).execute({} as never);
                } else if (verb === 'view.clearOverride') {
                    new ClearOverrideCommand(p.viewId, p.targetKind as never, p.targetId).execute({} as never);
                } else if (verb === 'view.clearAllOverrides') {
                    new ClearAllOverridesCommand(p.viewId).execute({} as never);
                } else {
                    throw new Error(`unexpected verb ${verb}`);
                }
            },
        },
    };
    viewIntentInstanceStore.assign(PLAN_VIEW);
    viewIntentInstanceStore.assign(OTHER_VIEW);
    viewIntentInstanceStore.clearOverrides(PLAN_VIEW);
    viewIntentInstanceStore.clearOverrides(OTHER_VIEW);
});

describe('§ELEMENT-FILTER-WRITES-INTENT — the browser filter reaches PROJECTED views', () => {
    it('POSITIVE CONTROL: with no override, a projected wall draws with a real pen', () => {
        const pen = projectedPen(PLAN_VIEW, WALL_A);
        expect(pen.opacity).toBeGreaterThan(0);
        expect(pen.widthMm).toBeGreaterThan(0);
    });

    it('hiding ONE element in the browser suppresses THAT element in the plan projection', async () => {
        const before = projectedPen(PLAN_VIEW, WALL_A);
        expect(before.opacity).toBeGreaterThan(0);   // guards against a vacuous pass

        applyElementVisibility(makeBag(), WALL_A, false);
        await Promise.resolve();

        const after = projectedPen(PLAN_VIEW, WALL_A);
        expect(after.opacity).toBe(0);
        expect(after.widthMm).toBe(0);
    });

    it('NEGATIVE CONTROL: the hide is ELEMENT-scoped — a sibling wall is untouched', async () => {
        applyElementVisibility(makeBag(), WALL_A, false);
        await Promise.resolve();

        expect(projectedPen(PLAN_VIEW, WALL_A).opacity).toBe(0);
        expect(projectedPen(PLAN_VIEW, WALL_B).opacity).toBeGreaterThan(0);
    });

    it('SCOPE CONTROL (C09 §4.7.3): the hide is VIEW-scoped — another view is unaffected', async () => {
        applyElementVisibility(makeBag(), WALL_A, false);
        await Promise.resolve();

        expect(projectedPen(PLAN_VIEW,  WALL_A).opacity).toBe(0);
        expect(projectedPen(OTHER_VIEW, WALL_A).opacity).toBeGreaterThan(0);
    });

    it('re-showing CLEARS the override rather than stamping a rival "show" tier (C09 §4.5.1)', async () => {
        const bag = makeBag();
        applyElementVisibility(bag, WALL_A, false);
        await Promise.resolve();
        expect(projectedPen(PLAN_VIEW, WALL_A).opacity).toBe(0);

        applyElementVisibility(bag, WALL_A, true);
        await Promise.resolve();

        expect(projectedPen(PLAN_VIEW, WALL_A).opacity).toBeGreaterThan(0);
        const layer = viewIntentInstanceStore.get(PLAN_VIEW)?.localOverrides;
        expect(layer?.visibilityOverrides ?? []).toHaveLength(0);   // "Pure intent", not a second tier
    });

    it('"Reset visibility" clears the OVERRIDES for the active view (C09 §4.7.4)', async () => {
        const bag = makeBag();
        applyElementVisibility(bag, WALL_A, false);
        applyElementVisibility(bag, WALL_B, false);
        await Promise.resolve();
        expect(projectedPen(PLAN_VIEW, WALL_A).opacity).toBe(0);
        expect(projectedPen(PLAN_VIEW, WALL_B).opacity).toBe(0);

        resetAllVisibility(bag);
        await Promise.resolve();

        expect(projectedPen(PLAN_VIEW, WALL_A).opacity).toBeGreaterThan(0);
        expect(projectedPen(PLAN_VIEW, WALL_B).opacity).toBeGreaterThan(0);
        expect(viewIntentInstanceStore.get(PLAN_VIEW)?.localOverrides.visibilityOverrides ?? [])
            .toHaveLength(0);
    });

    it('SURVIVES a view switch: the override is stored per view, not on the panel', async () => {
        applyElementVisibility(makeBag(), WALL_A, false);
        await Promise.resolve();

        // Simulate switching away and back — the panel state is irrelevant, the
        // authority is the persisted per-view override layer.
        (window as unknown as Record<string, unknown>).viewDefinitionStore = {
            getActiveId: () => OTHER_VIEW,
        };
        expect(projectedPen(OTHER_VIEW, WALL_A).opacity).toBeGreaterThan(0);

        (window as unknown as Record<string, unknown>).viewDefinitionStore = {
            getActiveId: () => PLAN_VIEW,
        };
        expect(projectedPen(PLAN_VIEW, WALL_A).opacity).toBe(0);
    });

    it('REFUSES SILENTLY-WRONG SCOPE: with no active view, no override is written anywhere', async () => {
        (window as unknown as Record<string, unknown>).viewDefinitionStore = {
            getActiveId: () => null,
        };
        (window as unknown as Record<string, unknown>).viewController = undefined;

        applyElementVisibility(makeBag(), WALL_A, false);
        await Promise.resolve();

        expect(viewIntentInstanceStore.get(PLAN_VIEW)?.localOverrides.visibilityOverrides ?? [])
            .toHaveLength(0);
        expect(projectedPen(PLAN_VIEW, WALL_A).opacity).toBeGreaterThan(0);
    });
});
