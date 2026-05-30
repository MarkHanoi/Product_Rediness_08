// F1.1 (2026-05-30) — Desk + desk_chair contract-complete pin tests.
//
// Closes the ai-host SIDE of the §0.1 obligation ladder for the F1.1
// study workstation primitives:
//   • FurnitureKind union contains 'desk' + 'desk_chair' (row 18)
//   • footprints.ts has entries for both (row 19)
//   • archetypes.ts 'private-office' uses them — workaround retired (row 20)
//   • programRules.study requires 'desk' + furnitureSpec uses it (row 21)
//
// The geometry-furniture side of the ladder (FurnitureType union,
// FurnitureCategoryMap, DeskBuilder, DeskChairBuilder, FurnitureFactory
// switch arms) is verified by the geometry-furniture package's own tests.

import { describe, expect, it } from 'vitest';
import { archetypeFor } from '../src/workflows/furnishLayout/archetypes.js';
import { footprintOf, FURNITURE_KINDS } from '../src/workflows/furnishLayout/footprints.js';
import { ROOM_RULES } from '../src/workflows/apartmentLayout/rules/programRules.js';
import type { FurnitureKind } from '../src/workflows/furnishLayout/types.js';

describe('F1.1 — desk + desk_chair contract-complete on the ai-host side', () => {
    it('FurnitureKind union admits desk + desk_chair (footprints table is the proxy)', () => {
        // FURNITURE_KINDS is `Object.keys(FP)` typed as FurnitureKind[] — if
        // either kind were missing from the union it would also be missing
        // from the table (compile-time exhaustiveness via Record<FurnitureKind,…>).
        expect(FURNITURE_KINDS).toContain('desk');
        expect(FURNITURE_KINDS).toContain('desk_chair');
    });

    it('footprints.ts has sane entries for desk + desk_chair', () => {
        const desk = footprintOf('desk');
        expect(desk.w).toBeGreaterThan(1.0);              // worktop wider than 1 m
        expect(desk.w).toBeLessThanOrEqual(1.8);          // not the size of a dining table
        expect(desk.l).toBeGreaterThan(0.5);              // worktop deeper than 0.5 m
        expect(desk.l).toBeLessThanOrEqual(0.9);
        expect(desk.h).toBeGreaterThan(0.7);              // 75 cm worktop height range
        expect(desk.h).toBeLessThanOrEqual(0.8);
        expect(desk.clearFront).toBeGreaterThanOrEqual(0.8); // chair pull-out

        const chair = footprintOf('desk_chair');
        expect(chair.w).toBeGreaterThan(0.4);
        expect(chair.w).toBeLessThanOrEqual(0.7);
        expect(chair.l).toBeGreaterThan(0.4);
        expect(chair.l).toBeLessThanOrEqual(0.7);
        expect(chair.h).toBeGreaterThanOrEqual(0.8);      // backrest reaches ~0.9 m
    });

    it("private-office archetype uses desk + desk_chair (workaround retired)", () => {
        const arch = archetypeFor('private-office');
        expect(arch).not.toBeNull();
        const kinds = arch!.items.map(i => i.kind);
        expect(kinds).toContain('desk' as FurnitureKind);
        expect(kinds).toContain('desk_chair' as FurnitureKind);
        // The workaround used dining_table/dining_chair in this archetype —
        // pin that those are NO LONGER there for the study.
        expect(kinds).not.toContain('dining_table' as FurnitureKind);
        expect(kinds).not.toContain('dining_chair' as FurnitureKind);
    });

    it('desk anchors on the window wall + is required; desk_chair beside + same group', () => {
        const arch = archetypeFor('private-office')!;
        const desk = arch.items.find(i => i.kind === 'desk');
        const chair = arch.items.find(i => i.kind === 'desk_chair');
        expect(desk).toBeDefined();
        expect(chair).toBeDefined();
        expect(desk!.required).toBe(true);
        expect(desk!.anchor).toBe('wall-window');
        expect(chair!.anchor).toBe('beside');
        expect(chair!.group).toBe(desk!.group);          // matched group leader
    });

    it('programRules.study.requiredFurniture lists desk (workaround retired)', () => {
        const study = ROOM_RULES.study;
        expect(study.requiredFurniture).toContain('desk');
        expect(study.requiredFurniture).not.toContain('dining_table');
    });

    it('programRules.study.furnitureSpec carries a desk entry with window-wall placement', () => {
        const study = ROOM_RULES.study;
        const deskSpec = study.furnitureSpec.find(s => s.kind === 'desk');
        expect(deskSpec).toBeDefined();
        expect(deskSpec!.required).toBe(true);
        expect(deskSpec!.placementRule).toBe('window_wall');
        expect(deskSpec!.excludeDoorSwing).toBe(true);
        // workaround retired — dining_table no longer the study's "desk"
        const diningInStudy = study.furnitureSpec.find(s => s.kind === 'dining_table');
        expect(diningInStudy).toBeUndefined();
    });
});
