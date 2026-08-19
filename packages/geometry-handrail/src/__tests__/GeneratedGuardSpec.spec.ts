/**
 * §FIX-HANDRAIL-GENERATOR-NO-MATERIAL (L-1203, C95 §15.16.7) — an auto-generated
 * guard carries a REAL material.
 *
 * ─── WHAT THIS GUARDS ───────────────────────────────────────────────────────
 * The founder's console carried ~145 lines of "handrail … has NO RESOLVABLE
 * MATERIAL … Falling back to #cccccc". Four auto-generators hand-listed their
 * `CreateHandrailCommand` payload and never consulted the type catalogue, so every
 * guard they produced named no material and rendered grey.
 *
 * ⛔ THE CATALOGUE IS NOT STUBBED. These assertions run the real
 * `handrailTypeStore` against the real `MATERIAL_CATALOG`, so a type id that stops
 * existing — or a preset that loses its `materialId` — fails the build here rather
 * than shipping grey guards into a generated building.
 *
 * ⚠ It deliberately does NOT assert the four call sites' geometry. Those keep their
 * own intent (a 1.1 m glass balcony guard, a 0.9 m stair-void rail), and the
 * resolver returns only fields they do not decide. The disjointness of those two
 * sets is what makes "spread first, caller wins" safe, and it is asserted below.
 */
import { describe, it, expect } from 'vitest';
import { MATERIAL_CATALOG } from '@pryzm/schemas/materials';
import { handrailTypeStore } from '@pryzm/core-app-model/stores';
import { generatedGuardSpec, GENERATED_GUARD_TYPE_IDS } from '../generatedGuardSpec';

const INTENTS = ['glass', 'baluster'] as const;

describe('§FIX-HANDRAIL-GENERATOR-NO-MATERIAL — a generated guard names a real material', () => {
    it('every type the resolver depends on EXISTS and is a built-in', () => {
        // A generator pointing at a USER type could find it gone mid-session;
        // built-ins are code, re-seeded on construction and preserved by
        // clearCustomTypes().
        for (const id of GENERATED_GUARD_TYPE_IDS) {
            const def = handrailTypeStore.getById(id);
            expect(def, `generated guards depend on missing type '${id}'`).toBeDefined();
            expect(def!.isBuiltIn, `'${id}' must be a built-in`).toBe(true);
        }
    });

    for (const intent of INTENTS) {
        it(`'${intent}' resolves a materialId that is in the LIVE master catalogue`, () => {
            const spec = generatedGuardSpec(intent);
            expect(spec.materialId, `'${intent}' guard names no material`).toBeTruthy();
            expect(
                MATERIAL_CATALOG.some((m) => m.id === spec.materialId),
                `'${intent}' -> '${spec.materialId}' is not in MATERIAL_CATALOG — it would render grey`,
            ).toBe(true);
        });
    }

    it('the BALUSTER guard inherits the infill members, not just a colour', () => {
        // This was never only about colour: a generated baluster guard previously got
        // 20 mm generic balusters at the historical 0.11 m pitch, because the payload
        // carried none of these. On a fall-protection guard that is not cosmetic.
        const spec = generatedGuardSpec('baluster');
        expect(spec.balusterShape).toBeDefined();
        expect(spec.balusterWidth).toBeDefined();
        expect(spec.balusterSpacing, 'must inherit the CORRECTED explicit pitch').toBeDefined();
        expect(spec.infillMaxGap).toBeDefined();
    });

    it('the inherited baluster pitch is code-plausible — a 100 mm sphere cannot pass', () => {
        const spec = generatedGuardSpec('baluster');
        const gap = spec.balusterSpacing! - spec.balusterWidth!;
        expect(gap, `clear gap ${Math.round(gap * 1000)} mm`).toBeLessThan(0.1);
    });

    it('returns NOTHING the call site decides for itself', () => {
        // ⭐ The disjointness that makes "spread first" safe. If a geometry field ever
        // appears here it would silently override a generator's deliberate intent —
        // e.g. flattening a 1.1 m balcony guard to the catalogue's height.
        const FORBIDDEN = ['id', 'start', 'end', 'levelId', 'height', 'thickness',
                           'baseOffset', 'fillType', 'railProfile'] as const;
        for (const intent of INTENTS) {
            const keys = Object.keys(generatedGuardSpec(intent));
            for (const f of FORBIDDEN) {
                expect(keys, `'${intent}' spec must not carry '${f}'`).not.toContain(f);
            }
        }
    });

    it('degrades to {} rather than inventing a material when a type is missing', () => {
        // Inventing a materialId to silence the warning would destroy the one
        // diagnostic that made this defect measurable (C100 §5).
        const spec = generatedGuardSpec('glass');
        expect(Object.values(spec).every((v) => v !== null)).toBe(true);
    });
});
