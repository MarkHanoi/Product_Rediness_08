/**
 * §ELEV-LINEWEIGHT (L-182) — elevation line-weight hierarchy via Visibility Intents.
 *
 * The Visibility Intents panel's Elevation tab previously showed "No modifiers
 * defined for this view type" while Plan carried door/window modifiers, and the
 * rendered elevation collapsed every band into one projection pen weight. These
 * tests lock in the fix at the seed + resolver layer:
 *
 *   1. The default system documentation intent now carries `elevation`
 *      view-type modifiers (UI parity with Plan — the tab is populated).
 *   2. `resolveIntentStyle(..., viewType: 'elevation', ...)` yields the correct
 *      weight ladder: cut (thickest) > projection > beyond (thinner) > hidden
 *      (not drawn), matching the four-band classification an East Elevation
 *      produces (façade = projection, a wall the plane cuts through = cut,
 *      receding = beyond, occluded = hidden).
 *   3. The change is scoped to elevation — Plan door/window symbolic behaviour
 *      and Section cut behaviour are untouched.
 */
import { describe, it, expect } from 'vitest';
import {
    SYSTEM_VISIBILITY_INTENTS,
    getDefaultSystemIntentId,
} from './SystemIntents';
import { resolveIntentStyle } from './IntentRuleResolver';
import type { ElementState, ViewIntentInstance, VisibilityIntent } from './VisibilityIntentTypes';

function defaultIntent(): VisibilityIntent {
    const id = getDefaultSystemIntentId();
    const intent = SYSTEM_VISIBILITY_INTENTS.find(i => i.id === id);
    if (!intent) throw new Error('default system intent not found');
    return intent;
}

function emptyInstance(intentId: string): ViewIntentInstance {
    return {
        id: 'test-instance',
        viewId: 'test-view',
        intentId,
        localOverrides: { visibilityOverrides: [], graphicOverrides: [], isolateActive: false },
        createdAt: '',
        updatedAt: '',
    };
}

function weightFor(elementType: string, state: ElementState, viewType: string): number {
    const intent = defaultIntent();
    const appearance = resolveIntentStyle(
        emptyInstance(intent.id),
        intent,
        elementType,
        state,
        viewType,
        { elementType, category: elementType },
    );
    return appearance.line.weight;
}

describe('§ELEV-LINEWEIGHT — elevation modifiers exist in the seed (UI parity with plan)', () => {
    it('the default documentation intent carries elevation view-type modifiers', () => {
        const intent = defaultIntent();
        const elevationMods = intent.viewTypeModifiers.filter(m => m.viewType === 'elevation');
        expect(elevationMods.length).toBeGreaterThan(0);
    });

    it('populates wall + door + window elevation rows (parity with the plan pattern)', () => {
        const intent = defaultIntent();
        const elevTypes = new Set(
            intent.viewTypeModifiers.filter(m => m.viewType === 'elevation').map(m => m.elementType),
        );
        expect(elevTypes.has('wall')).toBe(true);
        expect(elevTypes.has('door')).toBe(true);
        expect(elevTypes.has('window')).toBe(true);
    });
});

describe('§ELEV-LINEWEIGHT — resolved weight hierarchy for an East Elevation façade', () => {
    it('wall: cut (thickest) > projection > beyond', () => {
        const cut = weightFor('wall', 'cut', 'elevation');
        const projection = weightFor('wall', 'projection', 'elevation');
        const beyond = weightFor('wall', 'beyond', 'elevation');
        expect(cut).toBeGreaterThan(projection);
        expect(projection).toBeGreaterThan(beyond);
    });

    it('a wall the elevation plane cuts through is emphasised (cut ×1.5 over the base cut pen)', () => {
        // Base CUT pen for wall is 0.50 mm (PenWeightTable); the elevation modifier
        // multiplies it by 1.5 → 0.75 mm so the pass-through wall reads as the
        // heaviest line (the building outline).
        const cut = weightFor('wall', 'cut', 'elevation');
        expect(cut).toBeCloseTo(0.75, 5);
    });

    it('hidden geometry is not drawn (thinnest tier — zero pen)', () => {
        const intent = defaultIntent();
        const hidden = resolveIntentStyle(
            emptyInstance(intent.id),
            intent,
            'wall',
            'hidden',
            'elevation',
            { elementType: 'wall', category: 'wall' },
        );
        expect(hidden.visible).toBe(false);
    });

    it('façade openings (door/window) sit below walls in the projection tier', () => {
        const wallProj = weightFor('wall', 'projection', 'elevation');
        const doorProj = weightFor('door', 'projection', 'elevation');
        const windowProj = weightFor('window', 'projection', 'elevation');
        expect(doorProj).toBeLessThanOrEqual(wallProj);
        expect(windowProj).toBeLessThanOrEqual(wallProj);
        // Explicit elevation projection pen for openings = 0.18 mm.
        expect(doorProj).toBeCloseTo(0.18, 5);
        expect(windowProj).toBeCloseTo(0.18, 5);
    });
});

describe('§ELEV-LINEWEIGHT — change is scoped to elevation', () => {
    it('does not alter the plan cut weight for walls', () => {
        // Plan wall cut has no elevation modifier applied → base 0.50 mm.
        const planCut = weightFor('wall', 'cut', 'plan');
        expect(planCut).toBeCloseTo(0.50, 5);
    });

    it('plan door projection still carries its symbolic swing rule (untouched)', () => {
        const intent = defaultIntent();
        const doorPlan = resolveIntentStyle(
            emptyInstance(intent.id),
            intent,
            'door',
            'projection',
            'plan',
            { elementType: 'door', category: 'door' },
        );
        expect(doorPlan.symbolicRule).toBe('plan-door-swing');
    });
});
