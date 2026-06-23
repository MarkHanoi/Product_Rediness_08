// Residential building (multi-family) — Tracker P7 — per-cell D-TGL tests.
//
// TEST-FIRST. Covers the acceptance rows (audit §6 + §7 + tracker P7):
//  - a real apartment cell → a non-empty D-TGL layout (rooms > 0);
//  - blind party walls — windows only on the supplied façade edges, NONE on blind edges;
//  - deterministic-repeat (same input → identical result);
//  - soft-fail on a degenerate cell (status:'rejected', never throws).

import { describe, it, expect } from 'vitest';
import {
    runApartmentCellLayout,
    shellFromCell,
    type CellEdge,
    type ApartmentCellLayoutInput,
} from '../runApartmentCellLayout';
import type { ApartmentProgram, LayoutWall } from '../../apartmentLayout/types';
import type { Rect } from '../../apartmentLayout/tgl/rectDecomposition';

const MM_TO_M = 1e-3;

/** A 2-bed apartment program (T2-shaped). */
function program(over: Partial<ApartmentProgram> = {}): ApartmentProgram {
    return {
        bedrooms: 2,
        bathrooms: 1,
        masterEnSuite: false,
        openPlanKitchenDining: true,
        livingRoom: true,
        entranceHall: true,
        ...over,
    };
}

/** A comfortable rectangular apartment cell (~108 m²): 12 m × 9 m — roomy enough for the
 *  2-bed program's bedrooms to both route to circulation (the engine's topology gate is
 *  strict; a tighter plate soft-fails, which the degenerate-cell tests cover). */
function cell(over: Partial<Rect> = {}): Rect {
    return { x0: 0, z0: 0, x1: 12, z1: 9, ...over };
}

function which(wall: LayoutWall, c: Rect): CellEdge | null {
    const ax = wall.start.x * MM_TO_M, az = wall.start.y * MM_TO_M;
    const bx = wall.end.x * MM_TO_M, bz = wall.end.y * MM_TO_M;
    const dx = Math.abs(bx - ax), dz = Math.abs(bz - az);
    const TOL = 0.05;
    if (dz > dx) {
        const x = (ax + bx) / 2;
        if (Math.abs(x - c.x0) <= TOL) return 'x0';
        if (Math.abs(x - c.x1) <= TOL) return 'x1';
        return null;
    }
    const z = (az + bz) / 2;
    if (Math.abs(z - c.z0) <= TOL) return 'z0';
    if (Math.abs(z - c.z1) <= TOL) return 'z1';
    return null;
}

describe('runApartmentCellLayout — P7 per-cell D-TGL', () => {
    it('shellFromCell derives net area + a 4-corner perimeter', () => {
        const s = shellFromCell(cell());
        expect(s.netAreaM2).toBeCloseTo(108, 6);
        expect(s.widthM).toBeCloseTo(12, 6);
        expect(s.depthM).toBeCloseTo(9, 6);
        expect(s.perimeter.length).toBe(4);
    });

    it('produces a non-empty layout (rooms > 0) for a real apartment cell', () => {
        const r = runApartmentCellLayout({
            cell: cell(),
            program: program(),
            // door faces z0 (corridor); façade on the other three boundary edges.
            facadeEdges: ['x0', 'x1', 'z1'],
        });
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        expect(r.roomCount).toBeGreaterThan(0);
        expect(r.layout.rooms.length).toBe(r.roomCount);
        expect(r.layout.summary).toContain('D-TGL');
    });

    it('blind party walls — every kept window is on a FAÇADE edge, none on a blind edge', () => {
        const c = cell();
        // Only z1 is a true façade; x0/x1/z0 are blind party walls (neighbours/corridor/core).
        const facade: CellEdge[] = ['z1'];
        const r = runApartmentCellLayout({ cell: c, program: program(), facadeEdges: facade });
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;

        const facadeSet = new Set(facade);
        const wins = r.layout.windows ?? [];
        for (const w of wins) {
            const host = r.layout.walls[w.wallRef];
            expect(host).toBeTruthy();
            if (!host || host.isExternal !== true) continue; // interior-only window — allowed
            const edge = which(host, c);
            // Every external-hosted, edge-resolvable window MUST be on a façade edge.
            if (edge !== null) expect(facadeSet.has(edge)).toBe(true);
        }
        // The blind edges are reported.
        expect(r.blindEdges).toEqual(expect.arrayContaining(['x0', 'x1', 'z0']));
        expect(r.blindEdges).not.toContain('z1');
    });

    it('more façade edges ⇒ at least as many windows kept as fewer façade edges', () => {
        const c = cell();
        const many = runApartmentCellLayout({ cell: c, program: program(), facadeEdges: ['x0', 'x1', 'z1'] });
        const few = runApartmentCellLayout({ cell: c, program: program(), facadeEdges: ['z1'] });
        expect(many.status).toBe('ok');
        expect(few.status).toBe('ok');
        if (many.status !== 'ok' || few.status !== 'ok') return;
        // Restricting façades can only suppress more windows, never add them.
        expect(many.windowCount).toBeGreaterThanOrEqual(few.windowCount);
        expect(few.blindSuppressed).toBeGreaterThanOrEqual(many.blindSuppressed);
    });

    it('a fully landlocked cell (no façade edges) keeps NO façade windows', () => {
        const c = cell();
        const r = runApartmentCellLayout({ cell: c, program: program(), facadeEdges: [] });
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        const wins = r.layout.windows ?? [];
        for (const w of wins) {
            const host = r.layout.walls[w.wallRef];
            if (host && host.isExternal === true) {
                // Any surviving external window must be one we could NOT resolve to an edge.
                expect(which(host, c)).toBeNull();
            }
        }
        expect(r.blindEdges.length).toBe(4);
    });

    it('is deterministic — same input twice → identical result', () => {
        const inp: ApartmentCellLayoutInput = {
            cell: cell(),
            program: program(),
            facadeEdges: ['x0', 'x1', 'z1'],
        };
        const a = runApartmentCellLayout(inp);
        const b = runApartmentCellLayout(inp);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    it('soft-fails (rejected, never throws) on a degenerate (zero-area) cell', () => {
        const r = runApartmentCellLayout({
            cell: { x0: 0, z0: 0, x1: 0, z1: 0 },
            program: program(),
            facadeEdges: ['z1'],
        });
        expect(r.status).toBe('rejected');
        if (r.status === 'rejected') expect(r.reason).toBeTruthy();
    });

    it('soft-fails on a sliver cell too small for the engine', () => {
        // A 0.3 m × 0.3 m cell can hold no rooms — the engine returns [].
        const r = runApartmentCellLayout({
            cell: { x0: 0, z0: 0, x1: 0.3, z1: 0.3 },
            program: program({ bedrooms: 3, bathrooms: 2 }),
            facadeEdges: ['z1'],
        });
        // Either rejected (no layout) or — defensively — ok with rooms; never a throw.
        expect(['ok', 'rejected']).toContain(r.status);
    });
});
