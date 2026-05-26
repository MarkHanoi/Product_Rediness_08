// Apartment Layout Generator — validator + scorer contract tests (SPEC §8/§9).
// Pure-core fixtures (no stores/AI). A1–A2 foundation of the #51 capstone.

import { describe, expect, it } from 'vitest';
import { validateLayout } from '../src/workflows/apartmentLayout/validate.js';
import { scoreLayout } from '../src/workflows/apartmentLayout/score.js';
import type {
    LayoutOption,
    ApartmentConstraints,
    ApartmentProgram,
    ScoringWeights,
} from '../src/workflows/apartmentLayout/types.js';

const constraints: ApartmentConstraints = {
    minCorridorWidth: 900, wallThickness: 200, floorToCeiling: 2700, wallTypeId: 'partition',
};
const program: ApartmentProgram = {
    bedrooms: 3, bathrooms: 1, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};
const weights: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };

// A valid 3-bed apartment (master en-suite, open-plan K/D, living, hall).
function validLayout(): LayoutOption {
    return {
        summary: 'valid',
        corridorWidthMin: 1000,
        walls: [],
        doors: [{ wallRef: 0, offset: 300, width: 900 }],
        rooms: [
            { name: 'Hall', type: 'hall', area: 5, windowCount: 0, hasDirectAccess: true, adjacentTo: ['Living', 'Corridor'] },
            { name: 'Living', type: 'living', area: 22, windowCount: 2, hasDirectAccess: true, adjacentTo: ['Hall', 'Dining'] },
            { name: 'Dining', type: 'dining', area: 11, windowCount: 1, hasDirectAccess: true, adjacentTo: ['Living', 'Kitchen'] },
            { name: 'Kitchen', type: 'kitchen', area: 10, windowCount: 1, hasDirectAccess: true, adjacentTo: ['Dining'] },
            { name: 'Corridor', type: 'corridor', area: 4, windowCount: 0, hasDirectAccess: true, adjacentTo: ['Hall', 'Master', 'Bed2', 'Bed3', 'Bath'] },
            { name: 'Master', type: 'master', area: 14, windowCount: 1, hasDirectAccess: true, adjacentTo: ['Corridor', 'Ensuite'] },
            { name: 'Ensuite', type: 'ensuite', area: 4.2, windowCount: 0, hasDirectAccess: false, adjacentTo: ['Master'] },
            { name: 'Bed2', type: 'bedroom', area: 12, windowCount: 1, hasDirectAccess: true, adjacentTo: ['Corridor'] },
            { name: 'Bed3', type: 'bedroom', area: 11.5, windowCount: 1, hasDirectAccess: true, adjacentTo: ['Corridor'] },
            { name: 'Bath', type: 'bathroom', area: 5, windowCount: 0, hasDirectAccess: true, adjacentTo: ['Corridor'] },
        ],
    };
}

describe('validateLayout (SPEC §8)', () => {
    it('accepts a compliant 3-bed layout', () => {
        const r = validateLayout(validLayout(), constraints, program);
        expect(r.valid).toBe(true);
        expect(r.failures).toHaveLength(0);
    });

    it('V1 — rejects an undersized bedroom', () => {
        const l = validLayout();
        l.rooms.find(r => r.name === 'Bed3')!.area = 7;
        const r = validateLayout(l, constraints, program);
        expect(r.valid).toBe(false);
        expect(r.failures.some(f => /Bed3.*below the 11\.5/.test(f))).toBe(true);
    });

    it('V2 — rejects a windowless bedroom', () => {
        const l = validLayout();
        l.rooms.find(r => r.name === 'Bed2')!.windowCount = 0;
        const r = validateLayout(l, constraints, program);
        expect(r.failures.some(f => /Bed2.*no window/.test(f))).toBe(true);
    });

    it('V3 — rejects a non-en-suite room with no direct access', () => {
        const l = validLayout();
        l.rooms.find(r => r.name === 'Bed2')!.hasDirectAccess = false;
        const r = validateLayout(l, constraints, program);
        expect(r.failures.some(f => /Bed2.*through another room/.test(f))).toBe(true);
    });

    it('V4 — rejects a too-narrow corridor', () => {
        const l = validLayout();
        l.corridorWidthMin = 800;
        expect(validateLayout(l, constraints, program).valid).toBe(false);
    });

    it('V5 — rejects a sub-600mm door clearance', () => {
        const l = validLayout();
        l.doors[0]!.width = 550;
        expect(validateLayout(l, constraints, program).valid).toBe(false);
    });

    it('V6 — rejects an en-suite not adjacent to a master', () => {
        const l = validLayout();
        l.rooms.find(r => r.name === 'Ensuite')!.adjacentTo = ['Corridor'];
        const r = validateLayout(l, constraints, program);
        expect(r.failures.some(f => /en-suite.*not adjacent/.test(f))).toBe(true);
    });

    it('V7 — rejects when the program is unmet (needs 4 bedrooms)', () => {
        const r = validateLayout(validLayout(), constraints, { ...program, bedrooms: 4 });
        expect(r.failures.some(f => /bedroom.*requires 4/.test(f))).toBe(true);
    });
});

describe('scoreLayout (SPEC §9)', () => {
    it('produces an overall score in [0,100] with a 4-axis breakdown', () => {
        const s = scoreLayout(validLayout(), weights);
        expect(s.overall).toBeGreaterThanOrEqual(0);
        expect(s.overall).toBeLessThanOrEqual(100);
        expect(s.breakdown).toHaveProperty('naturalLight');
        expect(s.breakdown).toHaveProperty('privacy');
        expect(s.breakdown).toHaveProperty('kitchenWorkflow');
        expect(s.breakdown).toHaveProperty('corridorEfficiency');
    });

    it('naturalLight ≈ lit area / total area; kitchenWorkflow = 1 (adjacent dining + window)', () => {
        const s = scoreLayout(validLayout(), weights);
        expect(s.breakdown.naturalLight).toBeCloseTo(0.808, 1);
        expect(s.breakdown.kitchenWorkflow).toBe(1);
        expect(s.breakdown.corridorEfficiency).toBeGreaterThan(0.85);
        expect(s.breakdown.privacy).toBeGreaterThan(0.4);
    });

    it('more circulation area lowers corridorEfficiency', () => {
        const lean = scoreLayout(validLayout(), weights).breakdown.corridorEfficiency;
        const fat = validLayout();
        fat.rooms.find(r => r.name === 'Corridor')!.area = 20;
        expect(scoreLayout(fat, weights).breakdown.corridorEfficiency).toBeLessThan(lean);
    });
});
