/**
 * DetailLevelResolver — §FEAT-DOOR-PLAN-SYMBOL-DETAIL-LEVEL (L-241) P2/P3/P6/P7.
 *
 * Proves the ONE precedence chain that every plan-symbol builder shares:
 *   C09 element override → C09 elementType override → C09 category override →
 *   the VIEW's own `output.detailLevel` (the live properties-panel dropdown) →
 *   DEFAULT_DETAIL_LEVEL.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { viewDefinitionStore } from '../views/ViewDefinitionStore';
import { viewIntentInstanceStore } from '../presentation/ViewIntentInstanceStore';
import type { GraphicOverride } from '../presentation/VisibilityIntentTypes';
import { resolveEffectiveDetailLevel, DEFAULT_DETAIL_LEVEL } from './DetailLevelResolver';

const VIEW_ID = 'view-l241';
const DOOR_ID = 'door-l241';

function makeView(detailLevel?: 'coarse' | 'medium' | 'fine'): void {
    viewDefinitionStore.delete?.(VIEW_ID);
    viewDefinitionStore.create({
        id:       VIEW_ID,
        name:     'L-241 plan',
        viewType: 'plan',
        ...(detailLevel ? { output: { detailLevel } } : {}),
    });
}

function withOverrides(overrides: GraphicOverride[]): void {
    viewIntentInstanceStore.assign(VIEW_ID);
    viewIntentInstanceStore.updateOverrides(VIEW_ID, {
        visibilityOverrides: [],
        graphicOverrides:    overrides,
        isolateActive:       false,
    });
}

function dlOverride(
    targetKind: GraphicOverride['targetKind'],
    targetId: string,
    detailLevel: 'coarse' | 'medium' | 'fine',
): GraphicOverride {
    return { targetKind, targetId, state: 'projection', patch: { detailLevel } };
}

describe('resolveEffectiveDetailLevel — L-241 P2 precedence', () => {
    beforeEach(() => {
        viewIntentInstanceStore.delete(VIEW_ID);
        viewDefinitionStore.delete?.(VIEW_ID);
    });

    it('falls back to the default when nothing is set', () => {
        makeView();
        expect(resolveEffectiveDetailLevel(DOOR_ID, VIEW_ID, { elementType: 'door' }))
            .toBe(DEFAULT_DETAIL_LEVEL);
    });

    it('never throws for an unknown view / element (a symbol must always draw)', () => {
        expect(resolveEffectiveDetailLevel(undefined, undefined)).toBe(DEFAULT_DETAIL_LEVEL);
        expect(resolveEffectiveDetailLevel('nope', 'nope')).toBe(DEFAULT_DETAIL_LEVEL);
    });

    // P3 — the LIVE properties-panel dropdown writes exactly this field via
    // SetViewOutputCommand. This test is what makes that dropdown non-dead.
    it("reads the VIEW's output.detailLevel (the properties-panel dropdown)", () => {
        makeView('fine');
        expect(resolveEffectiveDetailLevel(DOOR_ID, VIEW_ID, { elementType: 'door' })).toBe('fine');

        viewDefinitionStore.setOutput(VIEW_ID, { detailLevel: 'coarse' });
        expect(resolveEffectiveDetailLevel(DOOR_ID, VIEW_ID, { elementType: 'door' })).toBe('coarse');
    });

    it('tolerates a legacy Title-Case value persisted on a view', () => {
        makeView();
        viewDefinitionStore.setOutput(VIEW_ID, { detailLevel: 'Fine' as never });
        expect(resolveEffectiveDetailLevel(DOOR_ID, VIEW_ID)).toBe('fine');
    });

    // P6 — the founder's second knob: "ALSO THROUGH THE VISIBILITY INTENT".
    it('a per-CATEGORY intent override beats the view value', () => {
        makeView('coarse');
        withOverrides([dlOverride('category', 'door', 'fine')]);
        expect(resolveEffectiveDetailLevel(DOOR_ID, VIEW_ID, { elementType: 'door', category: 'door' }))
            .toBe('fine');
    });

    it('a per-ELEMENT-TYPE intent override beats the view value', () => {
        makeView('coarse');
        withOverrides([dlOverride('elementType', 'door', 'medium')]);
        expect(resolveEffectiveDetailLevel(DOOR_ID, VIEW_ID, { elementType: 'door', category: 'door' }))
            .toBe('medium');
    });

    it('a per-ELEMENT override beats the elementType, the category AND the view', () => {
        makeView('coarse');
        withOverrides([
            dlOverride('category',    'door',  'medium'),
            dlOverride('elementType', 'door',  'medium'),
            dlOverride('element',     DOOR_ID, 'fine'),
        ]);
        expect(resolveEffectiveDetailLevel(DOOR_ID, VIEW_ID, { elementType: 'door', category: 'door' }))
            .toBe('fine');
        // A *different* door in the same view is untouched by the element override.
        expect(resolveEffectiveDetailLevel('other-door', VIEW_ID, { elementType: 'door', category: 'door' }))
            .toBe('medium');
    });

    it('ignores an override that targets a different element type', () => {
        makeView('coarse');
        withOverrides([dlOverride('elementType', 'window', 'fine')]);
        expect(resolveEffectiveDetailLevel(DOOR_ID, VIEW_ID, { elementType: 'door', category: 'door' }))
            .toBe('coarse');
    });
});
