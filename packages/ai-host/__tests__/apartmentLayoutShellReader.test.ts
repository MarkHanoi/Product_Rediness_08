// Apartment Layout Generator — store-backed shell reader tests (SPEC §5, A5.2).
//
// Pure: injects fake wall + orientation accessors; asserts the bridge to
// analyseShell (window counts, orientations, entrance-side, dimensions).

import { describe, expect, it, vi } from 'vitest';
import { createStoreShellReader, type ShellWallRecord, type Compass } from '../src/workflows/apartmentLayout/shellReader.js';
import type { ApartmentGenerateLayoutPayload } from '../src/workflows/apartmentLayout/types.js';

// A 10 m × 8 m rectangle: n(north,+windows) e s(entrance) w.
const RECT: Record<string, ShellWallRecord> = {
    n: { id: 'n', levelId: 'L0', baseLine: [{ x: 0, z: 0 }, { x: 10, z: 0 }], openings: [{ type: 'window' }, { type: 'window' }] },
    e: { id: 'e', levelId: 'L0', baseLine: [{ x: 10, z: 0 }, { x: 10, z: 8 }], openings: [{ type: 'window' }] },
    s: { id: 's', levelId: 'L0', baseLine: [{ x: 10, z: 8 }, { x: 0, z: 8 }], openings: [{ type: 'door', elementId: 'entranceDoor' }] },
    w: { id: 'w', levelId: 'L0', baseLine: [{ x: 0, z: 8 }, { x: 0, z: 0 }], openings: [] },
};
const ORIENT: Record<string, Compass> = { n: 'N', e: 'E', s: 'S', w: 'W' };

function payload(over: Partial<ApartmentGenerateLayoutPayload> = {}): ApartmentGenerateLayoutPayload {
    return {
        levelId: 'L0', shellWallIds: ['n', 'e', 's', 'w'], entranceDoorId: 'entranceDoor', windowIds: [],
        program: { bedrooms: 2, bathrooms: 1, masterEnSuite: false, openPlanKitchenDining: true, livingRoom: true, entranceHall: true },
        constraints: { minCorridorWidth: 900, wallThickness: 200, floorToCeiling: 2700, wallTypeId: 'partition' },
        options: { count: 2, scoringWeights: { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 } },
        ...over,
    };
}

const reader = (over: Partial<Record<string, ShellWallRecord>> = {}, orient = ORIENT) =>
    createStoreShellReader({
        getWall: (id) => ({ ...RECT, ...over })[id],
        getOrientation: (_lvl, id) => orient[id] ?? null,
    });

describe('createStoreShellReader (A5.2)', () => {
    it('derives area + dimensions from the wall baselines', () => {
        const shell = reader()(payload());
        expect(shell.netAreaM2).toBeCloseTo(80, 6);   // 10 × 8
        expect(shell.widthM).toBeCloseTo(10, 6);
        expect(shell.depthM).toBeCloseTo(8, 6);
        expect(shell.faces).toHaveLength(4);
    });

    it('counts windows per wall + classifies the best-light face', () => {
        const shell = reader()(payload());
        const byId = new Map(shell.faces.map(f => [f.wallId, f]));
        expect(byId.get('n')!.windowCount).toBe(2);
        expect(byId.get('n')!.class).toBe('best-light');   // most windows
        expect(byId.get('e')!.class).toBe('secondary-light');
        expect(byId.get('w')!.class).toBe('blind');         // no windows
    });

    it('marks the entrance wall (host of the entrance door) as entrance-side', () => {
        const shell = reader()(payload());
        const byId = new Map(shell.faces.map(f => [f.wallId, f]));
        expect(byId.get('s')!.class).toBe('entrance-side');
    });

    it('passes through SL-3 orientations', () => {
        const shell = reader()(payload());
        const byId = new Map(shell.faces.map(f => [f.wallId, f]));
        expect(byId.get('n')!.orientation).toBe('N');
        expect(byId.get('e')!.orientation).toBe('E');
    });

    it('skips missing walls (loud-fail-soft) and still analyses the rest', () => {
        const r = createStoreShellReader({ getWall: (id) => (id === 'w' ? undefined : RECT[id]) });
        const shell = r(payload());
        expect(shell.faces).toHaveLength(3);                // 'w' dropped
        expect(shell.faces.every(f => f.wallId !== 'w')).toBe(true);
    });

    it('falls back to the first wall as entrance when the door is unmatched', () => {
        const shell = reader()(payload({ entranceDoorId: 'nope' }));
        const byId = new Map(shell.faces.map(f => [f.wallId, f]));
        expect(byId.get('n')!.class).toBe('entrance-side'); // first wall in shellWallIds
    });

    it('defaults orientation to null when no orientation accessor is given', () => {
        const r = createStoreShellReader({ getWall: (id) => RECT[id] });
        const shell = r(payload());
        expect(shell.faces.every(f => f.orientation === null)).toBe(true);
    });

    it('queries orientation with the wall level id', () => {
        const getOrientation = vi.fn(() => 'N' as Compass);
        const r = createStoreShellReader({ getWall: (id) => RECT[id], getOrientation });
        r(payload());
        expect(getOrientation).toHaveBeenCalledWith('L0', 'n');
    });
});
