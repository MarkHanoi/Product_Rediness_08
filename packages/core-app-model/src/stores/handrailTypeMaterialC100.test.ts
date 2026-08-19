/**
 * §C100-HANDRAIL-MATERIAL-ID — the 20 built-in railing types must REFERENCE a
 * material, not carry a hex.
 *
 * C100 §2.1, verbatim: *"MUST NOT: a family store only a hex and call it a
 * material. A hex is not a material; it is one attribute of one. An element
 * carrying only a hex has irreversibly lost the name — no schedule can count it
 * (C28), no IFC export can classify it (C25), and no library edit can reach it."*
 *
 * ⚠ THIS DEFECT WAS INTRODUCED BY THE LANE THAT WROTE THE CATALOGUE. The five
 * pre-existing types already had the shape; adding fifteen more multiplied it by
 * four. It is recorded that way in C95 §15.6 rather than as inherited debt.
 *
 * WHY THE HEX MUST GO AND NOT MERELY BE JOINED BY AN ID: `resolveMaterialColour`
 * treats a stored hex as an explicit USER OVERRIDE and gives it precedence over
 * the reference (C100 §2.1 step 1). So a type that ships both would materialise an
 * override onto every handrail placed from it — and an override is exactly the
 * thing a library edit is *not allowed* to reach (C100 §2.2). The catalogue would
 * have silently opted every railing out of the master library.
 */

import { describe, it, expect } from 'vitest';
import { MATERIAL_CATALOG } from '@pryzm/schemas/materials';
import { handrailTypeStore } from './HandrailTypeStore';
import { resolveMaterialColour } from '../materialResolution';

const CATALOG_IDS = new Set(MATERIAL_CATALOG.map((m) => m.id));

describe('§C100-HANDRAIL-MATERIAL-ID — every built-in railing type REFERENCES a master material', () => {
    it('all 20 built-ins carry a materialId', () => {
        const missing = handrailTypeStore.getBuiltIn()
            .filter((t) => !t.materialId)
            .map((t) => t.id);
        expect(missing, `built-in types with no materialId: ${missing.join(', ')}`).toEqual([]);
    });

    it('THE TOOTH: every materialId resolves in MATERIAL_CATALOG (T1) — no invented ids', () => {
        const unresolvable = handrailTypeStore.getBuiltIn()
            .filter((t) => t.materialId && !CATALOG_IDS.has(t.materialId))
            .map((t) => `${t.id} -> ${t.materialId}`);
        expect(
            unresolvable,
            `types naming a material that does not exist: ${unresolvable.join(', ')}`,
        ).toEqual([]);
    });

    it('⛔ NO built-in carries a materialColor — a type hex would become a permanent OVERRIDE', () => {
        const withHex = handrailTypeStore.getBuiltIn()
            .filter((t) => t.materialColor !== undefined)
            .map((t) => `${t.id} (${t.materialColor})`);
        expect(
            withHex,
            'a built-in type must reference a material, never ship a hex — C100 §2.1. '
            + `Offenders: ${withHex.join(', ')}`,
        ).toEqual([]);
    });

    it('each type resolves to a real colour through the C100 ladder, tier "builtin"', () => {
        for (const t of handrailTypeStore.getBuiltIn()) {
            const r = resolveMaterialColour(t.materialId, t.materialColor);
            expect(r.state, `${t.id} did not resolve`).toBe('resolved');
            if (r.state === 'resolved') {
                expect(r.tier).toBe('builtin');
                expect(r.hex).toMatch(/^#[0-9a-fA-F]{6}$/);
            }
        }
    });

    it('the materialName (V5) vocabulary SURVIVES — it is not collapsed into the id', () => {
        // C95 §9.2 / C100 §4.5: V5 is the only vocabulary carrying physical intent,
        // and lane ZA owns its unification. This lane must not erase it on the way past.
        const named = handrailTypeStore.getBuiltIn().filter((t) => t.materialName);
        expect(named.length).toBeGreaterThan(0);
        for (const t of named) {
            expect(['steel', 'chrome', 'wood', 'timber', 'concrete', 'glass']).toContain(t.materialName);
        }
    });
});

describe('resolveMaterialColour — the C100 §2.1 ladder, including the state everyone skips', () => {
    it('an explicit override WINS and stays labelled as an override', () => {
        const r = resolveMaterialColour('wood-oak', '#ff0000');
        expect(r.state).toBe('override');
        if (r.state === 'override') {
            expect(r.hex).toBe('#ff0000');
            // C100 §6.1 — the UI must be able to SHOW that a reference is shadowed.
            expect(r.shadowedMaterialId).toBe('wood-oak');
        }
    });

    it('a bare id resolves from T1 and reports the tier', () => {
        const r = resolveMaterialColour('steel-structural');
        expect(r.state).toBe('resolved');
        if (r.state === 'resolved') expect(r.tier).toBe('builtin');
    });

    it('⭐ a MISS is a NAMED state, never a silent colour', () => {
        const r = resolveMaterialColour('material-that-does-not-exist');
        expect(r.state).toBe('unresolved');
        if (r.state === 'unresolved') {
            expect(r.reason).toContain('material-that-does-not-exist');
            expect(r.reason).toMatch(/T2|T1|MATERIAL_CATALOG/);
            // The whole point: there is no `hex` on this branch to accidentally render.
            expect((r as { hex?: string }).hex).toBeUndefined();
        }
    });

    it('no id and no override is ALSO named, and distinguishable from a miss', () => {
        const r = resolveMaterialColour(undefined, undefined);
        expect(r.state).toBe('unresolved');
        if (r.state === 'unresolved') {
            expect(r.materialId).toBeUndefined();
            expect(r.reason).toContain('names no material');
        }
    });
});
