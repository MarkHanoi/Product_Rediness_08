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
