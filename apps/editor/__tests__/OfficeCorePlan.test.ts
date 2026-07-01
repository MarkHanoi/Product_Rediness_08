// §OFFICE-CORE-SERVICES + §OFFICE-CIRCULATION-FIRST — unit tests for the PURE core-service +
// circulation-first floor planners (Phase 1 of SPEC-OFFICE-GENERATION-ENGINE §3/§4/§9).
//
// Pure (no DOM, no store) — every helper is I/O-free, so the default node env is fine. These pin:
//   • toilet cubicle counts SCALE with floor size (SPEC §3: small=2/gender, medium=3–4, large=5+,
//     very-large by occupant load);
//   • the core is NEVER empty — it ALWAYS carries a main stair + a fire-escape stair + ≥1 lift +
//     a fire-rated lobby + M/F/accessible WC + cleaning closet + service shaft;
//   • circulation is solved BEFORE rooms — the pipeline diagnostic proves the 3→4→5 order, and
//     support rooms/glazed enclosures only exist inboard of the circulation rings.

import { describe, it, expect } from 'vitest';
import {
    classifyFloorSize,
    cubiclesPerGender,
    planOfficeCore,
    planOfficeFloorArchitecture,
} from '../src/ui/office-building/officeCorePlan';

describe('classifyFloorSize', () => {
    it('bands GFA into small / medium / large / very-large', () => {
        expect(classifyFloorSize(300)).toBe('small');       // ~10 m plate
        expect(classifyFloorSize(800)).toBe('medium');
        expect(classifyFloorSize(1520)).toBe('large');      // ~22 m demo plate
        expect(classifyFloorSize(3000)).toBe('very-large');
        expect(classifyFloorSize(0)).toBe('small');         // degenerate → small
    });
});

describe('§OFFICE-CORE-SERVICES — cubiclesPerGender scales with floor size (SPEC §3)', () => {
    it('small → 2, medium → 3–4, large → 5+', () => {
        expect(cubiclesPerGender('small', 250)).toBe(2);
        const med = cubiclesPerGender('medium', 700);
        expect(med).toBeGreaterThanOrEqual(3);
        expect(med).toBeLessThanOrEqual(4);
        expect(cubiclesPerGender('large', 1400)).toBeGreaterThanOrEqual(5);
    });
    it('very-large scales by occupant load (≥ 5, monotonic in area)', () => {
        const vlSmallerNIA = cubiclesPerGender('very-large', 3000);
        const vlBiggerNIA = cubiclesPerGender('very-large', 12000);
        expect(vlSmallerNIA).toBeGreaterThanOrEqual(5);
        expect(vlBiggerNIA).toBeGreaterThanOrEqual(vlSmallerNIA);
    });
    it('counts increase monotonically small → medium → large', () => {
        const s = cubiclesPerGender('small', 250);
        const m = cubiclesPerGender('medium', 900);
        const l = cubiclesPerGender('large', 1500);
        expect(m).toBeGreaterThanOrEqual(s);
        expect(l).toBeGreaterThanOrEqual(m);
    });
});

describe('§OFFICE-CORE-SERVICES — planOfficeCore never emits an empty core', () => {
    it('a real core carries a main stair + fire stair + ≥1 lift + fire lobby + the toilet/service rooms', () => {
        // ~22 m demo plate ⇒ core fraction ~0.25 ⇒ coreR ~11 m.
        const plan = planOfficeCore(6, 1520, 1140);
        expect(plan).not.toBeNull();
        if (!plan) return;
        // Vertical circulation — never empty.
        expect(plan.mainStair.widthM).toBeGreaterThan(0);
        expect(plan.fireStair.widthM).toBeGreaterThan(0);
        // The fire escape runs OPPOSITE the main stair (a remote second egress).
        expect(Math.sign(plan.mainStair.runDir.z)).toBe(-Math.sign(plan.fireStair.runDir.z));
        expect(plan.lifts.length).toBeGreaterThanOrEqual(1);
        // Fire-rated lobby is a real rectangle.
        expect(plan.fireLobby.x1).toBeGreaterThan(plan.fireLobby.x0);
        expect(plan.fireLobby.z1).toBeGreaterThan(plan.fireLobby.z0);
        // Toilets: male · female · accessible WC · cleaning closet · service shaft (5 rooms).
        const labels = plan.toiletRooms.map((r) => r.label.toLowerCase());
        expect(labels.some((l) => l.includes('male') && !l.includes('female'))).toBe(true);
        expect(labels.some((l) => l.includes('female'))).toBe(true);
        expect(labels.some((l) => l.includes('accessible'))).toBe(true);
        expect(labels.some((l) => l.includes('cleaning'))).toBe(true);
        expect(labels.some((l) => l.includes('shaft'))).toBe(true);
        // Enclosing partition walls exist for the toilet block.
        expect(plan.toiletWalls.length).toBeGreaterThan(0);
    });

    it('a large floor gets a 2-car lift bank; a small floor gets 1 car', () => {
        const large = planOfficeCore(7, 3000, 2250);   // very-large
        const small = planOfficeCore(4, 350, 260);     // small
        expect(large?.lifts.length).toBeGreaterThanOrEqual(2);
        expect(small?.lifts.length).toBe(1);
    });

    it('degrades to null on a tiny core (caller keeps the shell core)', () => {
        expect(planOfficeCore(1.0, 100, 80)).toBeNull();
    });

    it('the toilet cubicle count is stamped into the WC room labels (SPEC §3 scaling)', () => {
        const plan = planOfficeCore(6, 1520, 1140);   // large ⇒ 5/gender
        const maleLabel = plan?.toiletRooms.find((r) => r.label.toLowerCase().includes('male') && !r.label.toLowerCase().includes('female'))?.label ?? '';
        expect(maleLabel).toContain(String(plan?.cubiclesPerGender));
        expect(plan?.cubiclesPerGender).toBeGreaterThanOrEqual(5);
    });
});

describe('§OFFICE-CIRCULATION-FIRST — planOfficeFloorArchitecture solves circulation BEFORE rooms', () => {
    const input = { discR: 22, coreR: 6, innerCircOuterR: 8, openPlanOuterR: 16, perimMidR: 19 };

    it('the pipeline diagnostic proves the ordered steps 3 → 4 → 5 (circulation first)', () => {
        const arch = planOfficeFloorArchitecture(input);
        const d = arch.diagnostic;
        const iCirc = d.indexOf('3:circulation');
        const iSupport = d.indexOf('4:support');
        const iPartitions = d.indexOf('5:partitions');
        expect(iCirc).toBeGreaterThanOrEqual(0);
        expect(iSupport).toBeGreaterThan(iCirc);          // rooms come AFTER circulation
        expect(iPartitions).toBeGreaterThan(iSupport);    // partitions/glazing come LAST
    });

    it('lays primary + secondary + escape circulation before any room exists', () => {
        const arch = planOfficeFloorArchitecture(input);
        const kinds = arch.circulation.map((c) => c.kind);
        expect(kinds).toContain('primary');
        expect(kinds).toContain('escape');
        // The primary ring hugs the core (inner ≈ coreR); the escape spokes reach the perimeter.
        const primary = arch.circulation.find((c) => c.kind === 'primary')!;
        expect(primary.innerR).toBeGreaterThanOrEqual(input.coreR);
        const escape = arch.circulation.find((c) => c.kind === 'escape')!;
        expect(escape.outerR).toBeLessThanOrEqual(input.discR + 1e-6);
    });

    it('support rooms + glazed enclosures sit inboard of the glass and clear of the core', () => {
        const arch = planOfficeFloorArchitecture(input);
        expect(arch.supportRooms.length).toBeGreaterThan(0);
        for (const r of arch.supportRooms) {
            const rad = Math.hypot((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
            expect(rad).toBeGreaterThan(input.coreR);   // outside the core
            expect(rad).toBeLessThan(input.discR);      // inside the glass
        }
        // At least one glazed office enclosure, each with return + glazed walls.
        expect(arch.glazedEnclosures.length).toBeGreaterThan(0);
        for (const enc of arch.glazedEnclosures) {
            expect(enc.corners.length).toBe(4);
            expect(enc.walls.length).toBeGreaterThan(0);
        }
        // Support-room labels cover meeting · kitchenette · storage · plant.
        const kinds = arch.supportRooms.map((r) => r.kind);
        expect(kinds).toContain('meeting');
        expect(kinds).toContain('kitchenette');
    });

    it('partition walls exist for every support room (4 edges each)', () => {
        const arch = planOfficeFloorArchitecture(input);
        expect(arch.partitionWalls.length).toBe(arch.supportRooms.length * 4);
    });
});
