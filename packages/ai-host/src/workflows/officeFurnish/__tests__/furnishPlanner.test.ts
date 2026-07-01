// §OFFICE-FURNISH-MODULAR — tests for the modular Furnish Office engine (SPEC §5/§6/§7/§8/§9-8).
//
// Pins: the §5 module recipes compose the right pieces; occupancy (§8) drives the module MIX; the
// placement engine fills the open-plan band with workstation rows RESPECTING circulation clearances
// (§7); and the final §9-8 validation reports ZERO violations by construction — no module obstructs a
// circulation ring or fire-egress spoke. Pure — node env is fine.

import { describe, it, expect } from 'vitest';
import {
    benchWorkstation, linearWorkstation, singleWorkstation,
    meetingRoomBlock, kitchenBlock, breakoutBlock, executiveOffice, phoneBooth, collaborativeBlock,
    moduleDesks,
} from '../moduleRecipes.js';
import { planModuleMix } from '../occupancyPlan.js';
import { planFloorFurnish, type FurnishFloorInput } from '../furnishPlanner.js';
import { validateFurnish, type FloorKeepouts } from '../clearanceValidation.js';

describe('§5 module recipes compose the right cluster', () => {
    it('bench workstation places 2 back-to-back desk rows + a shared spine screen + end planters', () => {
        const m = benchWorkstation(10, 0, 3, 0);
        expect(m.kind).toBe('bench-workstation');
        expect(moduleDesks(m)).toBe(6);                                   // 3 desks × 2 rows
        expect(m.items.some((i) => i.furnitureType === 'desk_chair')).toBe(true);
        expect(m.items.filter((i) => i.furnitureType.startsWith('plant')).length).toBeGreaterThanOrEqual(2);
    });
    it('linear + single workstations scale desk count', () => {
        expect(moduleDesks(linearWorkstation(0, 0, 4, 0))).toBe(4);
        expect(moduleDesks(singleWorkstation(0, 0, 0))).toBe(1);
    });
    it('meeting room rings a table with chairs + TV + whiteboard + storage', () => {
        const m = meetingRoomBlock(0, 0, 3, 0);
        expect(m.items.filter((i) => i.furnitureType === 'chair').length).toBe(6);
        expect(m.items.some((i) => i.furnitureType === 'tv')).toBe(true);
        expect(m.items.some((i) => i.furnitureType === 'sideboard')).toBe(true);
    });
    it('kitchen / breakout / exec / booth / collab all emit their signature pieces', () => {
        expect(kitchenBlock(0, 0, 0).items.some((i) => i.furnitureType === 'kitchen_island')).toBe(true);
        expect(breakoutBlock(0, 0, 0).items.some((i) => i.furnitureType === 'lounge_chair')).toBe(true);
        expect(executiveOffice(0, 0, 0).items.some((i) => i.furnitureType === 'desk')).toBe(true);
        expect(phoneBooth(0, 0, 0).items.some((i) => i.furnitureType === 'desk_chair')).toBe(true);
        expect(collaborativeBlock(0, 0, 0).items.some((i) => i.furnitureType.startsWith('sofa'))).toBe(true);
    });
});

describe('§8 planModuleMix scales all amenities with occupancy', () => {
    it('more usable area → more desks, meeting rooms, booths', () => {
        const small = planModuleMix(400);
        const big = planModuleMix(2000);
        expect(big.occupancy).toBeGreaterThan(small.occupancy);
        expect(big.meetingRooms).toBeGreaterThanOrEqual(small.meetingRooms);
        expect(big.phoneBooths).toBeGreaterThanOrEqual(small.phoneBooths);
    });
    it('a desk budget caps desks while amenity ratios still scale to occupancy', () => {
        const mix = planModuleMix(2000, { desksTargetOverride: 30 });
        expect(mix.desks).toBe(30);
        expect(mix.meetingRooms).toBeGreaterThan(1);   // 200 occupants → several meeting rooms
    });
});

describe('§9-8 validateFurnish flags any module that overlaps a keep-out', () => {
    const keepouts: FloorKeepouts = {
        coreR: 6, discR: 22,
        annuli: [{ label: 'primary circulation', innerR: 6, outerR: 8 }],
        spokes: [{ label: 'escape spoke 0', angle: 0, halfWidthM: 1.2, innerR: 6, outerR: 22 }],
    };
    it('a module inside the primary corridor is a violation', () => {
        const bad = benchWorkstation(7, 0, 3, 0);   // r=7 sits inside the [6,8] corridor
        const v = validateFurnish([bad], keepouts);
        expect(v.ok).toBe(false);
        expect(v.violations.length).toBeGreaterThan(0);
    });
    it('a module in the clear open-plan band passes', () => {
        const good = benchWorkstation(0, 14, 3, Math.PI / 2);   // r=14, off the escape spoke (angle 0)
        const v = validateFurnish([good], keepouts);
        expect(v.ok).toBe(true);
    });
});

describe('§5/§7/§8 planFloorFurnish — occupancy-driven, circulation-clean by construction', () => {
    const input: FurnishFloorInput = {
        floorIndex: 1,
        usableAreaM2: 1140,
        discR: 22, coreR: 6,
        openPlanInnerR: 8, openPlanOuterR: 18,
        primaryCorridor: { innerR: 6, outerR: 8 },
        secondaryCorridor: { innerR: 20, outerR: 22 },
        escapeAngles: [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2],
        rooms: [
            { kind: 'meeting', x0: 9, z0: 9, x1: 13, z1: 13 },
            { kind: 'kitchenette', x0: -13, z0: 9, x1: -9, z1: 13 },
            { kind: 'glazed-exec', x0: 15, z0: -2, x1: 19, z1: 2 },
        ],
        deskBudget: 60,
    };

    it('places workstation desks up to the budget and reports occupancy', () => {
        const plan = planFloorFurnish(input);
        expect(plan.mix.occupancy).toBeGreaterThan(0);
        expect(plan.desksPlaced).toBeGreaterThan(0);
        expect(plan.desksPlaced).toBeLessThanOrEqual(60);
        expect(plan.modules.length).toBeGreaterThan(0);
        expect(plan.items.length).toBeGreaterThan(plan.modules.length);
    });

    it('the final §9-8 validation is CLEAN — no module obstructs circulation or egress', () => {
        const plan = planFloorFurnish(input);
        expect(plan.validation.ok).toBe(true);
        expect(plan.validation.violations.length).toBe(0);
        expect(plan.validation.diagnostic).toContain('§DIAG-OFFICE-FURNISH-VALIDATION');
    });

    it('is deterministic — the same input yields the same item count (seeded decor)', () => {
        const a = planFloorFurnish(input);
        const b = planFloorFurnish(input);
        expect(a.items.length).toBe(b.items.length);
    });
});
