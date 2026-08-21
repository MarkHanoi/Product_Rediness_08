/**
 * §PER-CATEGORY-VIEW-VISIBILITY (L-1894) — the founder's per-category toggle,
 * proven END TO END: real command → real store → real resolver.
 *
 * > *"I need to have somewhere a click boolean for general visibility — imagine
 * >  I don't want to see furniture elements in elevation."*
 *
 * WHY THIS TEST DRIVES THE RESOLVER AND NOT THE COMMAND'S RETURN VALUE
 * ────────────────────────────────────────────────────────────────────────────
 * A command that returns `{ success: true }` proves only that it ran. The
 * repeated failure in this repo is the write that lands somewhere nothing reads
 * ([[committed-is-not-reachable]]). So every case below asserts at the layer the
 * user experiences: the PEN that plan / section / elevation resolve for an
 * element, via the same `resolveIntentStyle` the 2D canvas calls. Nothing under
 * test is stubbed — the store, the command and the resolver are the real ones.
 *
 * The negative and scope controls are the load-bearing half. A "hide" that hides
 * everything, or that leaks into another view, would pass a naive positive-only
 * test and be worse than the gap it closed.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
    visibilityIntentStore,
    viewIntentInstanceStore,
    resolveIntentStyle,
} from '@pryzm/core-app-model/presentation';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import { SetCategoryVisibilityInViewCommand } from '@pryzm/command-registry';

const ELEVATION = 'view-l1874-south-elevation';
const OTHER_VIEW = 'view-l1874-plan';
const INTENT_ID = 'vi-l1874-doc';

/** The real resolver call the 2D canvas makes, reduced to "is it drawn?". */
function isDrawn(viewId: string, elementType: string): boolean {
    const instance = viewIntentInstanceStore.get(viewId);
    if (!instance) throw new Error(`no intent instance for ${viewId}`);
    const intent = visibilityIntentStore.get(instance.intentId);
    if (!intent) throw new Error(`no intent ${instance.intentId}`);
    const appearance = resolveIntentStyle(
        instance, intent, elementType, 'projection', 'elevation',
        { elementId: `elem-of-${elementType}`, category: elementType },
    );
    return appearance.visible !== false && appearance.line.opacity !== 0;
}

function exec(cmd: SetCategoryVisibilityInViewCommand) {
    const validation = cmd.canExecute({} as never);
    expect(validation.ok, `canExecute refused: ${(validation as { reason?: string }).reason}`).toBe(true);
    return cmd.execute({} as never);
}

describe('§PER-CATEGORY-VIEW-VISIBILITY — one write, honoured by the drawing resolver', () => {
    beforeEach(() => {
        visibilityIntentStore.reset();
        viewIntentInstanceStore.reset();
        viewDefinitionStore.reset();

        visibilityIntentStore.create({
            id: INTENT_ID,
            name: 'Doc (test)',
            isSystem: false,
            version: 1,
            // Both are iterated unconditionally by resolveIntentStyle, so a fixture
            // that omits them throws rather than resolving — the resolver treats them
            // as required, whatever the type says.
            viewTypeModifiers: [],
            purposeModifiers: [],
            elementRules: {
                __default__: {
                    projection: { visible: true, line: { colour: '#000', opacity: 1, weight: 0.5, style: 'solid' }, fill: {} },
                },
            },
        } as never);

        for (const id of [ELEVATION, OTHER_VIEW]) {
            viewDefinitionStore.create({ id, name: id, viewType: id === ELEVATION ? 'elevation' : 'plan' });
            viewIntentInstanceStore.assign(id, INTENT_ID);
        }
    });

    afterEach(() => {
        visibilityIntentStore.reset();
        viewIntentInstanceStore.reset();
        viewDefinitionStore.reset();
    });

    it('positive control — furniture and walls are BOTH drawn before any toggle', () => {
        expect(isDrawn(ELEVATION, 'furniture')).toBe(true);
        expect(isDrawn(ELEVATION, 'wall')).toBe(true);
    });

    it('hiding the furniture CATEGORY reaches the resolver — the founder\'s exact ask', () => {
        const res = exec(new SetCategoryVisibilityInViewCommand(ELEVATION, 'furniture', false, 'elementType'));
        expect(res.success).toBe(true);
        expect(isDrawn(ELEVATION, 'furniture')).toBe(false);
    });

    it('negative control — hiding furniture leaves WALLS untouched', () => {
        exec(new SetCategoryVisibilityInViewCommand(ELEVATION, 'furniture', false, 'elementType'));
        expect(isDrawn(ELEVATION, 'wall')).toBe(true);
    });

    it('scope control — the hide is VIEW-scoped and does not leak to the plan', () => {
        exec(new SetCategoryVisibilityInViewCommand(ELEVATION, 'furniture', false, 'elementType'));
        expect(isDrawn(OTHER_VIEW, 'furniture')).toBe(true);
    });

    it('UNDO restores the category', () => {
        const cmd = new SetCategoryVisibilityInViewCommand(ELEVATION, 'furniture', false, 'elementType');
        exec(cmd);
        expect(isDrawn(ELEVATION, 'furniture')).toBe(false);

        cmd.undo({} as never);
        expect(isDrawn(ELEVATION, 'furniture')).toBe(true);
    });

    it('re-showing REMOVES the override rather than writing an opposite one (C09 §4.5.1)', () => {
        exec(new SetCategoryVisibilityInViewCommand(ELEVATION, 'furniture', false, 'elementType'));
        exec(new SetCategoryVisibilityInViewCommand(ELEVATION, 'furniture', true, 'elementType'));

        expect(isDrawn(ELEVATION, 'furniture')).toBe(true);
        const layer = viewIntentInstanceStore.get(ELEVATION)?.localOverrides;
        // A default is not an override: the view is back to PURE INTENT, with no
        // residual "show" row that would shadow a later intent change.
        expect(layer?.visibilityOverrides.filter(o => o.targetId === 'furniture')).toEqual([]);
    });

    it('toggling repeatedly does not accumulate duplicate override rows', () => {
        for (let i = 0; i < 4; i++) {
            exec(new SetCategoryVisibilityInViewCommand(ELEVATION, 'furniture', false, 'elementType'));
        }
        const rows = viewIntentInstanceStore.get(ELEVATION)?.localOverrides.visibilityOverrides
            .filter(o => o.targetId === 'furniture') ?? [];
        expect(rows).toHaveLength(1);
    });

    it('the toggle SURVIVES save → close → reopen (it is snapshot state, not UI state)', () => {
        exec(new SetCategoryVisibilityInViewCommand(ELEVATION, 'furniture', false, 'elementType'));

        // The real wire: serialize → JSON → deserialize, as the project snapshot does.
        const wire = JSON.parse(JSON.stringify(viewIntentInstanceStore.serialize()));
        viewIntentInstanceStore.reset();
        viewIntentInstanceStore.deserialize(wire);

        expect(isDrawn(ELEVATION, 'furniture')).toBe(false);
        expect(isDrawn(ELEVATION, 'wall')).toBe(true);
    });

    it('refuses a malformed targetKind instead of silently writing an unmatchable row', () => {
        const bad = new SetCategoryVisibilityInViewCommand(ELEVATION, 'furniture', false, 'nonsense' as never);
        expect(bad.canExecute({} as never).ok).toBe(false);
    });

    it('refuses a missing viewId', () => {
        const bad = new SetCategoryVisibilityInViewCommand('', 'furniture', false, 'elementType');
        expect(bad.canExecute({} as never).ok).toBe(false);
    });
});
