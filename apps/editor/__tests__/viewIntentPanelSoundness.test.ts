// @vitest-environment happy-dom
/**
 * §VIEW-MODIFIER-KEY-IS-UNIQUE (L-1602) + §PANEL-SECTIONS-MUST-BE-REACHABLE (L-1604)
 *
 * The founder, on the Visibility Intent panel:
 *   • *"i changed the CUT fill colour for slab and walls — and nothing changed"*, with a
 *     screenshot showing TWO IDENTICAL `elevation / slab` rows carrying DIFFERENT fills.
 *   • *"in the Elevation Section/ view modifiers — i can not scroll down to check other
 *     elements"*, with an arrow drawn at the cut-off.
 *
 * Both are pinned here at the layer that produces the user-visible artefact: the
 * modifier list the resolver actually consumes, and the CSS text the panel actually
 * ships. Neither assertion can be satisfied by a store write.
 */
import { describe, it, expect } from 'vitest';
import {
    normaliseViewTypeModifiers,
    findViewTypeModifierIndex,
    resolveIntentStyle,
    cloneSystemIntents,
    SYSTEM_INTENT_IDS,
} from '@pryzm/core-app-model/presentation';
import { VISIBILITY_GRAPHICS_STYLES } from '../src/ui/styles/panels/visibilityGraphics';

/** The founder's screenshot, as data: two `elevation / slab` rows, different fills. */
const FOUNDER_DUPLICATE = [
    {
        viewType: 'elevation', elementType: 'slab',
        statePatch: { cut: { fill: { style: 'solid', colour: '#9a9a9a' } } },
    },
    {
        viewType: 'elevation', elementType: 'slab',
        statePatch: { cut: { fill: { colour: '#8b6914' } } },
    },
] as never[];

describe('§VIEW-MODIFIER-KEY-IS-UNIQUE (L-1602)', () => {
    it('collapses two rows sharing (viewType, elementType) into ONE', () => {
        const out = normaliseViewTypeModifiers(FOUNDER_DUPLICATE);
        expect(out).toHaveLength(1);
        expect(out[0]!.viewType).toBe('elevation');
        expect(out[0]!.elementType).toBe('slab');
    });

    it('MERGES rather than drops — the later row wins per FIELD, the earlier survives elsewhere', () => {
        const out = normaliseViewTypeModifiers(FOUNDER_DUPLICATE);
        const fill = (out[0]!.statePatch as Record<string, { fill: Record<string, unknown> }>).cut.fill;
        // later row's colour wins (the resolver's own last-writer order) …
        expect(fill.colour).toBe('#8b6914');
        // … and `style`, set only on the EARLIER row, is not thrown away.
        expect(fill.style).toBe('solid');
    });

    it('normalising does NOT change what the resolver produces — that is what makes it safe', () => {
        const base = cloneSystemIntents()
            .find(i => i.id === SYSTEM_INTENT_IDS.architecturalDocumentation)!;
        const instance = {
            id: 'i', viewId: 'v', intentId: base.id,
            localOverrides: { visibilityOverrides: [], graphicOverrides: [], isolateActive: false },
            createdAt: '', updatedAt: '',
        };
        const withDupes = { ...base, viewTypeModifiers: FOUNDER_DUPLICATE };
        const normalised = { ...base, viewTypeModifiers: normaliseViewTypeModifiers(FOUNDER_DUPLICATE) };

        const a = resolveIntentStyle(instance as never, withDupes as never, 'slab', 'cut', 'elevation');
        const b = resolveIntentStyle(instance as never, normalised as never, 'slab', 'cut', 'elevation');
        expect(b.fill).toEqual(a.fill);
    });

    it('`elementType: undefined` ("all types") is a DISTINCT key and is never folded into a named row', () => {
        const out = normaliseViewTypeModifiers([
            { viewType: 'elevation', statePatch: {} },
            { viewType: 'elevation', elementType: 'slab', statePatch: {} },
        ] as never[]);
        expect(out).toHaveLength(2);
        // The resolver treats a bare modifier as applying to ALL element types
        // (`if (modifier.elementType && modifier.elementType !== elementType) continue`),
        // so collapsing it into `slab` would silently narrow it to one category.
        expect(out[0]!.elementType).toBeUndefined();
        expect(out[1]!.elementType).toBe('slab');
    });

    it('different view types never collapse', () => {
        const out = normaliseViewTypeModifiers([
            { viewType: 'plan', elementType: 'slab', statePatch: {} },
            { viewType: 'elevation', elementType: 'slab', statePatch: {} },
        ] as never[]);
        expect(out).toHaveLength(2);
    });

    it('findViewTypeModifierIndex locates the row "Add Modifier" must reveal instead of duplicating', () => {
        const list = normaliseViewTypeModifiers(FOUNDER_DUPLICATE);
        expect(findViewTypeModifierIndex(list, 'elevation', 'slab')).toBe(0);
        expect(findViewTypeModifierIndex(list, 'elevation', undefined)).toBe(-1);
        expect(findViewTypeModifierIndex(list, 'plan', 'slab')).toBe(-1);
    });

    it('is order-stable, so rows do not jump under the cursor when a duplicate merges away', () => {
        const out = normaliseViewTypeModifiers([
            { viewType: 'plan', elementType: 'wall', statePatch: {} },
            { viewType: 'elevation', elementType: 'slab', statePatch: {} },
            { viewType: 'plan', elementType: 'wall', statePatch: {} },
        ] as never[]);
        expect(out.map(m => `${m.viewType}/${m.elementType}`))
            .toEqual(['plan/wall', 'elevation/slab']);
    });
});

describe('§PANEL-SECTIONS-MUST-BE-REACHABLE (L-1604)', () => {
    /** Reads one declaration out of the shipped CSS text for a given selector block. */
    function block(selector: string): string {
        const i = VISIBILITY_GRAPHICS_STYLES.indexOf(`${selector} {`);
        expect(i, `selector ${selector} missing from the shipped stylesheet`).toBeGreaterThan(-1);
        return VISIBILITY_GRAPHICS_STYLES.slice(i, VISIBILITY_GRAPHICS_STYLES.indexOf('}', i));
    }

    /**
     * The `min-height: 0` chain is the whole fix. `.vi-editor` has always carried
     * `overflow-y: auto`; it could not use it because every ancestor defaulted to
     * `min-height: auto` and refused to shrink inside `.vg-panel`'s bounded,
     * `overflow: hidden` box — so the content was sheared off with no scrollbar.
     *
     * Asserting on the shipped CSS text is a weaker instrument than a layout
     * measurement, and is named as such: happy-dom does no layout, so a real
     * scrollHeight assertion is not available here. What this DOES pin is the
     * specific chain whose absence caused the defect — if anyone deletes one link,
     * this fails and names it.
     */
    for (const selector of ['.vi-shell', '.vi-sidebar', '.vi-main', '.vi-editor', '.vi-intent-list']) {
        it(`${selector} declares min-height: 0 so the constraint can reach the scroller`, () => {
            expect(block(selector)).toMatch(/min-height:\s*0/);
        });
    }

    it('.vi-editor — the scroll container for ALL FOUR tabs — can scroll', () => {
        const b = block('.vi-editor');
        expect(b).toMatch(/overflow-y:\s*auto/);
        expect(b).toMatch(/flex:\s*1/);
    });

    it('.vi-shell no longer carries the unshrinkable min-height that caused the clip', () => {
        expect(block('.vi-shell')).not.toMatch(/min-height:\s*440px/);
    });

    it('.vi-panel is given a bounded height, replacing the job min-height:440px did', () => {
        expect(block('.vi-panel')).toMatch(/height:\s*min\(/);
    });
});
