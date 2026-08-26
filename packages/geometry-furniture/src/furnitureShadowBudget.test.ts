/**
 * furnitureShadowBudget unit tests — ADR-0076 Axis 2 (§PERF-WEBGPU-FRAGMENT).
 *
 * Pure module (no THREE / DOM); safe under the node test env.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    isDecorativeFurniture,
    setFurnitureShadowBudget,
    getFurnitureShadowBudget,
    furnitureCastsShadowUnderBudget,
} from './furnitureShadowBudget';

describe('furnitureShadowBudget (ADR-0076 §PERF-WEBGPU-FRAGMENT)', () => {
    beforeEach(() => {
        setFurnitureShadowBudget('full'); // restore default between tests
    });

    describe('isDecorativeFurniture', () => {
        it('classifies plants, trees, lamps, rugs, wall decor and curtains as decorative', () => {
            expect(isDecorativeFurniture('plant_03')).toBe(true);
            expect(isDecorativeFurniture('arbol_t_12')).toBe(true);
            expect(isDecorativeFurniture('lamp')).toBe(true);
            expect(isDecorativeFurniture('rug')).toBe(true);
            expect(isDecorativeFurniture('parametric_chevron_carpet')).toBe(true);
            expect(isDecorativeFurniture('wall_art')).toBe(true);
            expect(isDecorativeFurniture('curtain_panel')).toBe(true);
        });
        it('does NOT classify architectural furniture as decorative', () => {
            expect(isDecorativeFurniture('sofa_3seat')).toBe(false);
            expect(isDecorativeFurniture('bed')).toBe(false);
            expect(isDecorativeFurniture('kitchen_l_shape')).toBe(false);
            expect(isDecorativeFurniture('wardrobe_straight')).toBe(false);
            expect(isDecorativeFurniture('dining_table')).toBe(false);
        });
        it('handles undefined safely', () => {
            expect(isDecorativeFurniture(undefined)).toBe(false);
        });
        it('§DESK108 — the four desks + dining table/sets are ARCHITECTURAL, not decorative', () => {
            // A desk or a dining set reads the space the way a bed or kitchen
            // does: it keeps casting shadows at EVERY budget. This follows what
            // the module already decides for 'desk' and 'dining_table' — the
            // eight new types must not silently join the decorative set.
            setFurnitureShadowBudget('decorative-off');
            for (const t of [
                'desk_zen', 'desk_skeleton', 'desk_vertex', 'desk_panel',
                'dining_table_extending', 'dining_set_rustic',
                'dining_set_modern', 'dining_set_shell',
            ]) {
                expect(isDecorativeFurniture(t), t).toBe(false);
                expect(furnitureCastsShadowUnderBudget(t), t).toBe(true);
            }
        });
        it('§TVFURN114 — the TV lowboard + slat console are ARCHITECTURAL, not decorative', () => {
            // A lowboard is casework the way a sideboard or tv_unit is; the slat
            // console is a solid low body. Both keep casting shadows at EVERY
            // budget — the same verdict the module already gives 'tv_unit'.
            setFurnitureShadowBudget('decorative-off');
            for (const t of ['tv_lowboard', 'tv_console_slat']) {
                expect(isDecorativeFurniture(t), t).toBe(false);
                expect(furnitureCastsShadowUnderBudget(t), t).toBe(true);
            }
        });
        it('§CARPET97 — all ten new procedural carpets are decorative too', () => {
            // A 4 mm rug lying on the floor casts a 4 mm sliver. Missing one
            // here would leave it a shadow caster at the `performance` tier
            // while its twelve siblings are not — an invisible perf regression.
            for (const t of [
                'parametric_staggered_stripe_carpet', 'parametric_checkerboard_carpet',
                'parametric_bordered_jute_carpet', 'parametric_braided_jute_carpet',
                'parametric_colour_block_carpet', 'parametric_moons_carpet',
                'parametric_round_braided_carpet', 'parametric_line_art_carpet',
                'parametric_fine_stripe_carpet', 'parametric_diamond_trellis_carpet',
            ]) {
                expect(isDecorativeFurniture(t), t).toBe(true);
            }
        });
    });

    describe('furnitureCastsShadowUnderBudget — default-preserving safety', () => {
        it("default 'full' budget: EVERYTHING casts shadows (today's behaviour)", () => {
            expect(getFurnitureShadowBudget()).toBe('full');
            expect(furnitureCastsShadowUnderBudget('plant_01')).toBe(true);
            expect(furnitureCastsShadowUnderBudget('sofa_3seat')).toBe(true);
            expect(furnitureCastsShadowUnderBudget('lamp')).toBe(true);
        });

        it("'decorative-off' budget: decorative stops casting, architectural still casts", () => {
            setFurnitureShadowBudget('decorative-off');
            expect(furnitureCastsShadowUnderBudget('plant_01')).toBe(false);
            expect(furnitureCastsShadowUnderBudget('lamp')).toBe(false);
            expect(furnitureCastsShadowUnderBudget('rug')).toBe(false);
            // architectural pieces unchanged
            expect(furnitureCastsShadowUnderBudget('sofa_3seat')).toBe(true);
            expect(furnitureCastsShadowUnderBudget('bed')).toBe(true);
            expect(furnitureCastsShadowUnderBudget('kitchen_island')).toBe(true);
        });

        it('is reversible — setting back to full restores all casting', () => {
            setFurnitureShadowBudget('decorative-off');
            expect(furnitureCastsShadowUnderBudget('plant_01')).toBe(false);
            setFurnitureShadowBudget('full');
            expect(furnitureCastsShadowUnderBudget('plant_01')).toBe(true);
        });
    });
});
