// ─── §FIX-STAIR-RAILING-TYPE-PICKER — the catalogue → stair-railing projection ────
//
// THE DEFECT THIS PINS: the product had TWO railing vocabularies that never met —
// the five NAMED catalogue definitions in `handrailTypeStore` (what the draw-time
// "Handrail Type" picker offers, and what the founder knew existed) and the four
// CONSTRUCTION FORMS in `RailingType` (none / flat-bar / glass-panel / circular)
// that `StairRailingBuilder` switches on and that the console reports as
// `type=flat-bar`. Nothing projected one onto the other, so a stair railing could
// not be given a named type at all.
//
// Asserted here:
//   (1) the catalogue can express a swap (>1 entry) and reaches this layer;
//   (2) EVERY built-in projects to the construction form its infill + rail profile
//       imply — the mapping is a RULE, checked against all five by name;
//   (3) the definition's HEIGHT drives topRailHeight and its THICKNESS drives
//       baluster width — the geometry follows the type, not a hard-coded default;
//   (4) `postSpacing === 0` ("Stair Handrail" — no posts) suppresses the newel
//       posts, and a silent definition leaves them alone;
//   (5) 'none' is unreachable from the catalogue — "no railing" is a deletion, not
//       a type;
//   (6) the projection touches ONLY the fields the catalogue describes: a type
//       change must not silently reset baluster spacing or the railing's side.

import { describe, it, expect } from 'vitest';
// Deep import, not the root barrel: the barrel drags in DOM-dependent tool modules
// (@thatopen/ui via geometry-slab) that a node-env suite cannot load. The catalogue
// itself is pure data.
import { handrailTypeStore } from '@pryzm/core-app-model/stores';
import {
    resolveStairRailingTypeFields,
    railingTypeForHandrailType,
} from '../StairRailingTypeMapping';

describe('stair-railing type mapping — §FIX-STAIR-RAILING-TYPE-PICKER', () => {
    it('(1) the named catalogue reaches this layer and can express a swap', () => {
        const all = handrailTypeStore.getAll();
        expect(all.length).toBeGreaterThan(1);
        // The five the founder's screenshot lists, by id.
        expect(all.map(t => t.id).sort()).toEqual([
            'glass-guardrail', 'stainless-handrail', 'stair-handrail',
            'steel-guardrail', 'timber-baluster',
        ]);
    });

    const EXPECTED: Array<{ id: string; form: string; height: number; material: string }> = [
        { id: 'glass-guardrail',    form: 'glass-panel', height: 1.1, material: 'steel'  },
        { id: 'stainless-handrail', form: 'circular',    height: 0.9, material: 'chrome' },
        { id: 'timber-baluster',    form: 'flat-bar',    height: 1.0, material: 'timber' },
        { id: 'steel-guardrail',    form: 'flat-bar',    height: 1.1, material: 'steel'  },
        { id: 'stair-handrail',     form: 'circular',    height: 0.9, material: 'steel'  },
    ];

    for (const spec of EXPECTED) {
        it(`(2)(3) "${spec.id}" projects to ${spec.form} at ${spec.height} m`, () => {
            const def = handrailTypeStore.getById(spec.id)!;
            expect(def).toBeDefined();
            const f = resolveStairRailingTypeFields(def);

            expect(f.railingType).toBe(spec.form);
            // (3) geometry is DRIVEN by the definition, not by a default.
            expect(f.topRailHeight).toBe(def.height);
            expect(f.topRailHeight).toBe(spec.height);
            expect(f.balusterWidth).toBe(def.thickness);
            expect(f.material).toBe(spec.material);
            // Provenance: which catalogue entry this railing came from.
            expect(f.typeId).toBe(spec.id);
        });
    }

    it('(2) the mapping is a rule, so a user-defined type maps too', () => {
        expect(railingTypeForHandrailType('glass', 'rectangular')).toBe('glass-panel');
        expect(railingTypeForHandrailType('baluster', 'round')).toBe('flat-bar');
        expect(railingTypeForHandrailType('open', 'round')).toBe('circular');
        expect(railingTypeForHandrailType('open', 'rectangular')).toBe('flat-bar');
    });

    it('(3) the rail profile drives the baluster shape', () => {
        expect(resolveStairRailingTypeFields(handrailTypeStore.getById('timber-baluster')!).balusterShape)
            .toBe('rectangular');
        expect(resolveStairRailingTypeFields(handrailTypeStore.getById('stainless-handrail')!).balusterShape)
            .toBe('round');
    });

    it('(4) postSpacing === 0 ("Stair Handrail") suppresses the newel posts', () => {
        const def = handrailTypeStore.getById('stair-handrail')!;
        expect(def.postSpacing).toBe(0);
        const f = resolveStairRailingTypeFields(def);
        expect(f.postAtStart).toBe(false);
        expect(f.postAtEnd).toBe(false);
    });

    it('(4) a positive postSpacing keeps the posts', () => {
        const f = resolveStairRailingTypeFields(handrailTypeStore.getById('steel-guardrail')!);
        expect(f.postAtStart).toBe(true);
        expect(f.postAtEnd).toBe(true);
    });

    it('(4) a definition SILENT on postSpacing leaves the posts alone', () => {
        const def = { ...handrailTypeStore.getById('steel-guardrail')!, postSpacing: undefined };
        const f = resolveStairRailingTypeFields(def);
        expect(f.postAtStart).toBeUndefined();
        expect(f.postAtEnd).toBeUndefined();
    });

    it('(5) no catalogue type can produce the "none" construction form', () => {
        for (const def of handrailTypeStore.getAll()) {
            expect(resolveStairRailingTypeFields(def).railingType).not.toBe('none');
        }
    });

    it('(6) the projection does NOT invent fields the catalogue has no concept of', () => {
        const f = resolveStairRailingTypeFields(handrailTypeStore.getById('glass-guardrail')!) as Record<string, unknown>;
        // A type change must not silently reset the railing's spacing, its side, or
        // which stair hosts it.
        expect(f.balusterSpacing).toBeUndefined();
        expect(f.side).toBeUndefined();
        expect(f.stairId).toBeUndefined();
        expect(f.handrailHeight).toBeUndefined();
    });
});
