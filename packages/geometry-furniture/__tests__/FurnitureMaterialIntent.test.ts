// F8.3 (2026-05-31) — FurnitureMaterialIntent pin tests.

import { describe, expect, it } from 'vitest';
import {
    FURNITURE_MATERIAL_INTENTS,
    FURNITURE_TYPE_TO_MATERIAL_INTENT,
    deriveMaterialIntent,
    type FurnitureMaterialIntent,
} from '../src/FurnitureMaterialIntent';

describe('FurnitureMaterialIntent (F8.3)', () => {
    it('FURNITURE_MATERIAL_INTENTS list contains every union member exactly once', () => {
        const set = new Set(FURNITURE_MATERIAL_INTENTS);
        expect(set.size).toBe(FURNITURE_MATERIAL_INTENTS.length);
        expect(FURNITURE_MATERIAL_INTENTS.length).toBe(11);
    });

    it('every FurnitureType has a material-intent label (exhaustive lookup)', () => {
        // The TypeScript Record<FurnitureType, FurnitureMaterialIntent> already
        // enforces this at compile time. The runtime check below pins the
        // invariant against accidental edits (e.g. removing an entry or
        // adding `undefined as any`).
        for (const [type, intent] of Object.entries(FURNITURE_TYPE_TO_MATERIAL_INTENT)) {
            expect(FURNITURE_MATERIAL_INTENTS, `unknown intent on ${type}`).toContain(intent);
        }
    });

    // ── deriveMaterialIntent — semantic spot-checks ─────────────────────────

    it('sofas read as fabric-soft (upholstery dominates the silhouette)', () => {
        expect(deriveMaterialIntent('sofa')).toBe('fabric-soft');
        expect(deriveMaterialIntent('corner_sofa')).toBe('fabric-soft');
        expect(deriveMaterialIntent('barcelona_corner_sofa')).toBe('fabric-soft');
    });

    it('dining tables + bookshelves + wardrobes read as timber-warm', () => {
        expect(deriveMaterialIntent('dining_table')).toBe('timber-warm');
        expect(deriveMaterialIntent('bookshelf')).toBe('timber-warm');
        expect(deriveMaterialIntent('wardrobe')).toBe('timber-warm');
        expect(deriveMaterialIntent('bed')).toBe('timber-warm');
    });

    it('Nordic bed reads as timber-light (typology bias)', () => {
        expect(deriveMaterialIntent('nordic_bed')).toBe('timber-light');
    });

    it('wet fixtures read as ceramic-clean', () => {
        expect(deriveMaterialIntent('bath')).toBe('ceramic-clean');
        expect(deriveMaterialIntent('wc_washbasin')).toBe('ceramic-clean');
        expect(deriveMaterialIntent('toilet_radiator')).toBe('ceramic-clean');
    });

    it('mirrors + shower glass + glass-fronted storage read as glass-translucent', () => {
        expect(deriveMaterialIntent('shower_glass_panel')).toBe('glass-translucent');
        expect(deriveMaterialIntent('bathroom_mirror')).toBe('glass-translucent');
        expect(deriveMaterialIntent('wall_mirror')).toBe('glass-translucent');
        expect(deriveMaterialIntent('wc_mirror')).toBe('glass-translucent');
        expect(deriveMaterialIntent('wardrobe_glass_door')).toBe('glass-translucent');
        expect(deriveMaterialIntent('bookshelf_glass')).toBe('glass-translucent');
    });

    it('utility appliances read as plastic-utility', () => {
        expect(deriveMaterialIntent('washing_machine_standalone')).toBe('plastic-utility');
        expect(deriveMaterialIntent('tumble_dryer')).toBe('plastic-utility');
        expect(deriveMaterialIntent('tv')).toBe('plastic-utility');     // TV body is plastic too
    });

    it('coat racks + towel rails + curtain rods read as metal-cool', () => {
        expect(deriveMaterialIntent('coat_rack')).toBe('metal-cool');
        expect(deriveMaterialIntent('towel_rail')).toBe('metal-cool');
        expect(deriveMaterialIntent('curtain_rod')).toBe('metal-cool');
        expect(deriveMaterialIntent('utility_sink')).toBe('metal-cool');
        expect(deriveMaterialIntent('drying_rack')).toBe('metal-cool');
    });

    it('floor lamp reads as metal-warm (brass / bronze aesthetic)', () => {
        expect(deriveMaterialIntent('lamp')).toBe('metal-warm');
    });

    it('every kitchen variant reads as mixed-kitchen', () => {
        for (const k of ['kitchen_straight', 'kitchen_l_shape', 'kitchen_u_shape',
                          'kitchen_island', 'kitchen_straight_tall',
                          'kitchen_l_shape_tall', 'kitchen_u_shape_tall'] as const) {
            expect(deriveMaterialIntent(k), k).toBe('mixed-kitchen');
        }
    });

    it('plants + trees read as plant-natural', () => {
        for (const p of ['plant_01', 'plant_08', 'arbol_t_01', 'arbol_t_25'] as const) {
            expect(deriveMaterialIntent(p), p).toBe('plant-natural');
        }
    });

    it('AI + GLB imports read as mixed-unknown (content-defined)', () => {
        expect(deriveMaterialIntent('ai_element')).toBe('mixed-unknown');
        expect(deriveMaterialIntent('glb_import')).toBe('mixed-unknown');
    });

    it('parametric carpets + curtain panels read as fabric-soft', () => {
        expect(deriveMaterialIntent('parametric_chevron_carpet')).toBe('fabric-soft');
        expect(deriveMaterialIntent('parametric_patchwork_carpet')).toBe('fabric-soft');
        expect(deriveMaterialIntent('parametric_stripe_carpet')).toBe('fabric-soft');
        expect(deriveMaterialIntent('curtain_panel')).toBe('fabric-soft');
    });

    it('deriveMaterialIntent throws on unknown type (fail-explicit contract)', () => {
        // Cast through any to bypass the compile-time check.
        expect(() => deriveMaterialIntent('not_a_real_type' as never)).toThrow(/Unknown FurnitureType/);
    });

    it('every intent is reachable from at least one FurnitureType', () => {
        const reached = new Set<FurnitureMaterialIntent>();
        for (const v of Object.values(FURNITURE_TYPE_TO_MATERIAL_INTENT)) reached.add(v);
        for (const intent of FURNITURE_MATERIAL_INTENTS) {
            expect(reached, `intent "${intent}" is unreachable`).toContain(intent);
        }
    });
});
