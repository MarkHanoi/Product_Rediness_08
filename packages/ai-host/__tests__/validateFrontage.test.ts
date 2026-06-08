// T2.5 / D2.5 — validateFrontage pin tests.

import { describe, expect, it } from 'vitest';
import {
    validateFrontage, rectTouchesPerimeter,
} from '../src/workflows/apartmentLayout/dimensions/validateFrontage.js';
import type { RoomType } from '../src/workflows/apartmentLayout/types.js';

// 12×10 rectilinear shell for the tests.
const SHELL = [
    { x: 0, z: 0 }, { x: 12, z: 0 },
    { x: 12, z: 10 }, { x: 0, z: 10 },
];

const r = (id: string, type: RoomType, x0: number, z0: number, x1: number, z1: number, name?: string) =>
    ({ roomId: id, type, ...(name !== undefined ? { name } : {}), rect: { x0, z0, x1, z1 } });

describe('rectTouchesPerimeter', () => {
    it('rect flush with south façade (z0 = 0) returns true', () => {
        expect(rectTouchesPerimeter({ x0: 2, z0: 0, x1: 6, z1: 3 }, SHELL)).toBe(true);
    });

    it('rect flush with west façade (x0 = 0) returns true', () => {
        expect(rectTouchesPerimeter({ x0: 0, z0: 4, x1: 3, z1: 7 }, SHELL)).toBe(true);
    });

    it('fully interior rect returns false', () => {
        expect(rectTouchesPerimeter({ x0: 3, z0: 3, x1: 6, z1: 6 }, SHELL)).toBe(false);
    });

    it('rect touching only at a single point (corner kiss) returns false', () => {
        // x1 = 0 touches the west façade but rect z-range is zero-extent
        // beyond the corner — collinear kiss only.
        expect(rectTouchesPerimeter({ x0: -1, z0: 0, x1: 0, z1: 0.0001 }, SHELL)).toBe(false);
    });

    it('degenerate shell (< 3 vertices) returns false', () => {
        expect(rectTouchesPerimeter({ x0: 0, z0: 0, x1: 1, z1: 1 }, [{ x: 0, z: 0 }, { x: 1, z: 0 }])).toBe(false);
    });
});

describe('T2.5 — validateFrontage', () => {
    it('all required-frontage rooms on the perimeter → admissible + no findings', () => {
        const result = validateFrontage({
            shellPolygon: SHELL,
            rooms: [
                r('liv', 'living',  0, 0, 6, 4),    // south façade
                r('mas', 'master',  6, 0, 12, 5),   // south + east façade
                r('bed', 'bedroom', 0, 5, 4, 10),   // north + west façade
                r('kit', 'kitchen', 8, 5, 12, 10),  // north + east façade
            ],
        });
        expect(result.admissible).toBe(true);
        expect(result.hardFindings).toEqual([]);
        expect(result.softFindings).toEqual([]);
    });

    it('required-frontage room buried inside → HARD-rejects', () => {
        const result = validateFrontage({
            shellPolygon: SHELL,
            rooms: [
                r('liv', 'living',  0, 0, 4, 4),     // on south façade — OK
                r('mas', 'master',  5, 4, 9, 7),     // FULLY INTERIOR — HARD reject
            ],
        });
        expect(result.admissible).toBe(false);
        expect(result.hardFindings).toHaveLength(1);
        expect(result.hardFindings[0]!.roomId).toBe('mas');
        expect(result.hardFindings[0]!.metric).toBe('frontageRequired');
    });

    it('preferred-frontage room buried inside → SOFT penalty, still admissible', () => {
        const result = validateFrontage({
            shellPolygon: SHELL,
            rooms: [
                r('liv', 'living',  0, 0, 6, 4),     // OK
                r('mas', 'master',  6, 0, 12, 5),    // OK
                r('std', 'study',   4, 5, 8, 8),     // FULLY INTERIOR; study is 'preferred'
            ],
        });
        expect(result.admissible).toBe(true);
        expect(result.hardFindings).toEqual([]);
        expect(result.softFindings).toHaveLength(1);
        expect(result.softFindings[0]!.roomId).toBe('std');
        expect(result.softFindings[0]!.metric).toBe('frontagePreferred');
    });

    it("rooms with frontage 'none' (corridor / hall / utility) are skipped entirely", () => {
        const result = validateFrontage({
            shellPolygon: SHELL,
            rooms: [
                r('cor', 'corridor', 4, 4, 8, 6),    // interior — frontage 'none', not flagged
                r('hal', 'hall',     4, 6, 6, 8),    // interior — frontage 'none', not flagged
                r('uti', 'utility',  6, 6, 7, 8),    // interior — frontage 'none', not flagged
            ],
        });
        expect(result.admissible).toBe(true);
        expect(result.hardFindings).toEqual([]);
        expect(result.softFindings).toEqual([]);
    });

    // §A.21.D55 — DAYLIGHT IN EVERY ROOM. The wet rooms (bathroom / ensuite / wc)
    // were promoted from frontage 'none' → 'preferred': a window in a wet room is
    // desirable (obscure-glazed) where the plate allows, so a fully-interior wet
    // room is now a SOFT penalty (the ranker nudges toward fronting it), but it is
    // NEVER a hard reject — a small internal bath/wc is still a legal last resort.
    it("interior wet rooms (bathroom / ensuite / wc) → SOFT penalty, still admissible", () => {
        const result = validateFrontage({
            shellPolygon: SHELL,
            rooms: [
                r('liv', 'living',  0, 0, 6, 4),     // on façade — OK
                r('bat', 'bathroom', 4, 5, 6, 7),    // FULLY INTERIOR; now 'preferred'
                r('ens', 'ensuite',  6, 5, 8, 7),    // FULLY INTERIOR; now 'preferred'
                r('wc',  'wc',       8, 5, 9, 7),    // FULLY INTERIOR; now 'preferred'
            ],
        });
        expect(result.admissible).toBe(true);              // soft-only, never hard
        expect(result.hardFindings).toEqual([]);
        expect(result.softFindings).toHaveLength(3);
        expect(result.softFindings.every(f => f.metric === 'frontagePreferred')).toBe(true);
        expect(result.softFindings.map(f => f.roomId).sort()).toEqual(['bat', 'ens', 'wc']);
    });

    it('empty room list / degenerate shell → admissible no-op', () => {
        expect(validateFrontage({ shellPolygon: SHELL, rooms: [] }).admissible).toBe(true);
        expect(validateFrontage({
            shellPolygon: [{ x: 0, z: 0 }],
            rooms: [r('liv', 'living', 0, 0, 5, 4)],
        }).admissible).toBe(true);
    });
});
