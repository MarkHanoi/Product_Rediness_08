/**
 * §VI-PROBE (L-778) + §FIX-VIEW-INTENT-FIELD-OVERLOAD (L-777)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE BINDING READ, AND A FALLBACK YOU CAN SEE
 * ─────────────────────────────────────────────────────────────────────────────
 * Three separate places used to answer "which intent governs this view?", with three
 * different answers for an UNBOUND view:
 *
 *   GraphicsRulesEngine._intentRules   → the global default intent, silently, no inheritance
 *   resolveBoundIntentWithInheritance  → null (EdgeProjector's visibility veto: hide nothing)
 *   ViewRangeIntentResolver            → no inheritance, hardcoded 1.20 m below-level depth
 *
 * So one drawing could take its PARENT's intent for visibility and the GLOBAL DEFAULT for
 * style, and nothing anywhere reported the disagreement. This suite pins the style path to
 * the SAME read the other consumers use, and pins the property that makes the remaining
 * fall-open honest: `explainStyle().binding` must NAME the origin, so
 * "bound to the default intent" and "bound to nothing" are never the same value.
 *
 * Contracts: C09 §4.3 (precedence + per-view local overrides), §4.5 (per-view resolvability).
 */
import { describe, it, expect } from 'vitest';
import { graphicsRulesEngine } from './GraphicsRulesEngine';
import { visibilityIntentStore } from '../presentation/VisibilityIntentStore';
import { viewIntentInstanceStore } from '../presentation/ViewIntentInstanceStore';
import { viewDefinitionStore } from '../views/ViewDefinitionStore';
import { cloneSystemIntents, SYSTEM_INTENT_IDS, getDefaultSystemIntentId } from '../presentation/SystemIntents';
import type { VisibilityIntent } from '../presentation/VisibilityIntentTypes';

function userIntent(id: string, wallCutColour: string): VisibilityIntent {
    const base = cloneSystemIntents()
        .find(i => i.id === SYSTEM_INTENT_IDS.architecturalDocumentation)!;
    const rules = JSON.parse(JSON.stringify(base.elementRules));
    rules.wall.cut.line.colour = wallCutColour;
    return { ...JSON.parse(JSON.stringify(base)), id, name: id, isSystem: false, elementRules: rules };
}

describe('§VI-PROBE — the style path names its binding origin', () => {
    it('an UNBOUND view reports binding "global-default", NOT a silent success', () => {
        const report = graphicsRulesEngine.explainStyle('CUT', 'wall', {
            viewId: 'vd-never-bound', viewType: 'plan',
        });
        expect(report.binding).toBe('global-default');
        expect(report.intentId).toBe(getDefaultSystemIntentId());
        // …and it still DRAWS. Fall-open is the right behaviour; being silent about it was not.
        expect(report.pen.widthMm).toBeGreaterThan(0);
    });

    it('a BOUND view reports binding "own" and the intent that answered', () => {
        const intentId = 'user-bind-own';
        visibilityIntentStore.create(userIntent(intentId, '#112233'));
        viewIntentInstanceStore.assign('vd-bound-own', intentId);

        const report = graphicsRulesEngine.explainStyle('CUT', 'wall', {
            viewId: 'vd-bound-own', viewType: 'plan',
        });
        expect(report.binding).toBe('own');
        expect(report.intentId).toBe(intentId);
        expect(report.pen.color.toLowerCase()).toBe('#112233');
    });

    it('a CHILD view with no binding INHERITS its parent\'s intent — in the STYLE path too', () => {
        // This is the regression the divergence produced: `resolveBoundIntentWithInheritance`
        // has walked `parentViewId` since Wave 9, but the pen chain did not, so a dependent
        // view was styled by the global default while being FILTERED by its parent's intent.
        const intentId = 'user-bind-parent';
        visibilityIntentStore.create(userIntent(intentId, '#445566'));

        viewDefinitionStore.create({
            id: 'vd-parent', name: 'Parent', viewType: 'plan',
        } as Parameters<typeof viewDefinitionStore.create>[0]);
        viewDefinitionStore.create({
            id: 'vd-child', name: 'Child', viewType: 'detail', parentViewId: 'vd-parent',
        } as Parameters<typeof viewDefinitionStore.create>[0]);
        viewIntentInstanceStore.assign('vd-parent', intentId);

        const report = graphicsRulesEngine.explainStyle('CUT', 'wall', {
            viewId: 'vd-child', viewType: 'detail',
        });
        expect(report.binding).toBe('inherited');
        expect(report.intentId).toBe(intentId);
        expect(report.pen.color.toLowerCase()).toBe('#445566');
    });

    it('the probe reports the SAME pen the render path resolves — it is not a re-derivation', () => {
        const ctx = { viewId: 'vd-parity', viewType: 'section' as const };
        const report = graphicsRulesEngine.explainStyle('CUT', 'wall', ctx);
        expect(report.pen).toEqual(graphicsRulesEngine.resolveStyle('CUT', 'wall', ctx));
    });
});
