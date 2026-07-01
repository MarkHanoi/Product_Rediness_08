// §OFFICE-INTERIOR-FITOUT (founder 2026-07-01) — unit tests for the PURE interior fit-out
// placement math the office tower uses to seed desks/chairs, meeting rooms, cafe clusters,
// the square core enclosure, the reception lobby, and the ceiling-light grid.
//
// Pure (no DOM, no store) — every helper is I/O-free, so the default node env is fine. The
// invariants under test are what keep the emitted furniture BELIEVABLE + clear of the core /
// glass so nothing pokes out of the plate or into the shaft.

import { describe, it, expect } from 'vitest';
import {
    deskGrid,
    meetingRooms,
    cafeClusters,
    coreSquare,
    lobbyPlan,
    ceilingLightGrid,
} from '../src/ui/office-building/officeInteriorFitout';

const radial = (x: number, z: number): number => Math.hypot(x, z);

describe('deskGrid — §OFFICE-DESK-GRID', () => {
    it('places desk+chair pairs strictly inside the open-plan annulus, capped at maxDesks', () => {
        const desks = deskGrid(6, 16, 40);
        expect(desks.length).toBeGreaterThan(0);
        expect(desks.length).toBeLessThanOrEqual(40);
        for (const dc of desks) {
            // Desk sits inside the band (with a footprint margin) — never in the core, never past glass.
            expect(radial(dc.desk.x, dc.desk.z)).toBeGreaterThan(6);
            expect(radial(dc.desk.x, dc.desk.z)).toBeLessThan(16);
            // Chair sits toward the core relative to its desk (smaller radius).
            expect(radial(dc.chair.x, dc.chair.z)).toBeLessThanOrEqual(radial(dc.desk.x, dc.desk.z) + 1e-6);
        }
    });
    it('honours the desk cap', () => {
        expect(deskGrid(4, 24, 12).length).toBeLessThanOrEqual(12);
    });
    it('returns empty for a degenerate band', () => {
        expect(deskGrid(10, 10, 20)).toEqual([]);
        expect(deskGrid(10, 5, 20)).toEqual([]);
    });
});

describe('meetingRooms — §OFFICE-MEETING-ROOMS', () => {
    it('spreads N boardroom clusters (table + 6 chairs) evenly around the ring', () => {
        const rooms = meetingRooms(12, 3);
        expect(rooms.length).toBe(3);
        for (const m of rooms) {
            expect(m.chairs.length).toBe(6);
            expect(radial(m.table.x, m.table.z)).toBeCloseTo(12, 3);
        }
        // Distinct angular positions (no two clusters coincide).
        const angles = rooms.map((m) => Math.atan2(m.centre.z, m.centre.x));
        expect(new Set(angles.map((a) => a.toFixed(3))).size).toBe(3);
    });
    it('returns empty for count<=0 or bad radius', () => {
        expect(meetingRooms(12, 0)).toEqual([]);
        expect(meetingRooms(0, 3)).toEqual([]);
    });
});

describe('cafeClusters — §OFFICE-CAFE', () => {
    it('places round tables with 4 chairs each on the ring', () => {
        const cafes = cafeClusters(8, 4);
        expect(cafes.length).toBe(4);
        for (const c of cafes) {
            expect(c.chairs.length).toBe(4);
            expect(radial(c.table.x, c.table.z)).toBeCloseTo(8, 3);
        }
    });
});

describe('coreSquare — §OFFICE-CORE-WALLS', () => {
    it('inscribes a square inside the core circle with one door edge', () => {
        const core = coreSquare(6);
        expect(core).not.toBeNull();
        expect(core!.corners.length).toBe(4);
        // Every corner is inside the core radius (inscribed square).
        for (const c of core!.corners) expect(radial(c.x, c.z)).toBeLessThanOrEqual(6 + 1e-6);
        expect(core!.doorEdgeIndex).toBeGreaterThanOrEqual(0);
        expect(core!.doorEdgeIndex).toBeLessThan(4);
    });
    it('returns null for a core too small to enclose', () => {
        expect(coreSquare(0.5)).toBeNull();
    });
});

describe('lobbyPlan — §OFFICE-LOBBY', () => {
    it('sets the reception desk back from the glass toward the core, with two waiting seats', () => {
        const r = 18;
        const plan = lobbyPlan(r, 0);
        expect(radial(plan.reception.x, plan.reception.z)).toBeLessThan(r);   // set back from glass
        expect(plan.seats.length).toBe(2);
    });
});

describe('ceilingLightGrid — §OFFICE-CEILING-LIGHTS', () => {
    it('grids downlights inside the disc, skipping the core keep-out, capped at max', () => {
        const pts = ceilingLightGrid(16, 5, 3.5, 40);
        expect(pts.length).toBeGreaterThan(0);
        expect(pts.length).toBeLessThanOrEqual(40);
        for (const p of pts) {
            const rr = radial(p.x, p.z);
            expect(rr).toBeGreaterThan(5);     // clear of the core
            expect(rr).toBeLessThan(16);       // inside the glass
        }
    });
});
