// §DOC-ROOM-INTERIOR-ELEVATIONS — pure helper tests (2026-06-26).
//
// Covers the scope resolver (All / This level / Specific room) + the per-room
// interior-elevation view-definition builder. We mock @pryzm/ai-host with the pure
// DS4 shapes the real helpers return (the real barrel pulls in @thatopen/ui / THREE
// which the node test env lacks) — so this is a pure transform-contract check.

import { describe, it, expect, vi } from 'vitest';

// Reimplement the deterministic DS4 shapes the real ai-host helpers return.
vi.mock('@pryzm/ai-host', () => ({
    computeRoomInteriorElevationMarks: (poly: Array<{ x: number; z: number }>) => {
        if (!poly || poly.length < 3) return [];
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const p of poly) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z; }
        if (!(maxX > minX) || !(maxZ > minZ)) return [];
        const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
        return [
            { wall: 'N', anchor: { x: cx, z: cz }, facing: { x: 0, z: 1 },  label: 'Interior Elevation — North wall' },
            { wall: 'S', anchor: { x: cx, z: cz }, facing: { x: 0, z: -1 }, label: 'Interior Elevation — South wall' },
            { wall: 'E', anchor: { x: cx, z: cz }, facing: { x: 1, z: 0 },  label: 'Interior Elevation — East wall' },
            { wall: 'W', anchor: { x: cx, z: cz }, facing: { x: -1, z: 0 }, label: 'Interior Elevation — West wall' },
        ];
    },
    roomCropRegion: (poly: Array<{ x: number; z: number }>, margin = 0.5) => {
        if (!poly || poly.length < 3) return null;
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const p of poly) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z; }
        if (!(maxX > minX) || !(maxZ > minZ)) return null;
        return { minX: minX - margin, minZ: minZ - margin, maxX: maxX + margin, maxZ: maxZ + margin };
    },
}));

import {
    resolveRoomScope,
    buildRoomInteriorElevationViews,
    buildScopedRoomInteriorElevations,
    type ElevationRoomInput,
} from '../src/ui/documentation/roomInteriorElevations.js';

// A 4 (x) × 3 (z) room at min corner (2, 1).
const SQUARE = [{ x: 2, z: 1 }, { x: 6, z: 1 }, { x: 6, z: 4 }, { x: 2, z: 4 }];

const ROOMS: ElevationRoomInput[] = [
    { id: 'r1', name: 'Living', levelId: 'lvl-0', polygon: SQUARE },
    { id: 'r2', name: 'Bedroom', levelId: 'lvl-0', polygon: SQUARE },
    { id: 'r3', name: 'Study', levelId: 'lvl-1', polygon: SQUARE },
    { id: 'r4', name: 'Degenerate', levelId: 'lvl-1', polygon: [{ x: 0, z: 0 }, { x: 1, z: 1 }] },
];

describe('§DOC-ROOM-INTERIOR-ELEVATIONS — resolveRoomScope', () => {
    it('all → every valid room (degenerate filtered out)', () => {
        const r = resolveRoomScope(ROOMS, { kind: 'all' });
        expect(r.map(x => x.id)).toEqual(['r1', 'r2', 'r3']);
    });
    it('level → only rooms on that level', () => {
        expect(resolveRoomScope(ROOMS, { kind: 'level', levelId: 'lvl-0' }).map(x => x.id)).toEqual(['r1', 'r2']);
        expect(resolveRoomScope(ROOMS, { kind: 'level', levelId: 'lvl-1' }).map(x => x.id)).toEqual(['r3']);
    });
    it('room → just the single matching room', () => {
        expect(resolveRoomScope(ROOMS, { kind: 'room', roomId: 'r2' }).map(x => x.id)).toEqual(['r2']);
    });
    it('room → [] when the id is unknown or degenerate', () => {
        expect(resolveRoomScope(ROOMS, { kind: 'room', roomId: 'nope' })).toEqual([]);
        expect(resolveRoomScope(ROOMS, { kind: 'room', roomId: 'r4' })).toEqual([]); // degenerate
    });
    it('is deterministic + preserves input order', () => {
        expect(resolveRoomScope(ROOMS, { kind: 'all' })).toEqual(resolveRoomScope(ROOMS, { kind: 'all' }));
    });
});

describe('§DOC-ROOM-INTERIOR-ELEVATIONS — buildRoomInteriorElevationViews', () => {
    const views = buildRoomInteriorElevationViews({ id: 'r1', name: 'Living', levelId: 'lvl-0', polygon: SQUARE });

    it('produces 4 elevation views, one per wall, with stable ids', () => {
        expect(views).toHaveLength(4);
        expect(views.every(v => v.viewType === 'elevation')).toBe(true);
        expect(views.map(v => v.id)).toEqual([
            'vd-room-elev-r1-N', 'vd-room-elev-r1-S', 'vd-room-elev-r1-E', 'vd-room-elev-r1-W',
        ]);
        expect(views.map(v => v.wall)).toEqual(['N', 'S', 'E', 'W']);
    });

    it('names each view per the room + wall (contract naming convention)', () => {
        expect(views[0].name).toBe('Living — Interior Elevation (N)');
        expect(views[3].name).toBe('Living — Interior Elevation (W)');
    });

    it('projectionDirection looks AT the wall (the DS4 outward facing)', () => {
        const by = (w: string) => views.find(v => v.wall === w)!;
        expect(by('N').spatial.projectionDirection).toEqual({ x: 0, y: 0, z: 1 });
        expect(by('S').spatial.projectionDirection).toEqual({ x: 0, y: 0, z: -1 });
        expect(by('E').spatial.projectionDirection).toEqual({ x: 1, y: 0, z: 0 });
        expect(by('W').spatial.projectionDirection).toEqual({ x: -1, y: 0, z: 0 });
    });

    it('crops to the room bbox + margin (centered on the room) and a floor-to-ceiling range', () => {
        const v = views[0];
        // 4×3 room at (2,1) → bbox [2,1]..[6,4]; default margin 0.5 → [1.5,0.5]..[6.5,4.5].
        expect(v.spatial.cropRegion).toEqual({ minX: 1.5, minZ: 0.5, maxX: 6.5, maxZ: 4.5 });
        expect(v.crop.region.min).toEqual([1.5, 0.5]);
        expect(v.crop.region.max).toEqual([6.5, 4.5]);
        expect(v.crop.enabled).toBe(true);
        expect(v.spatial.viewRange).toEqual({ nearOffset: 0, farOffset: 3.0 });
    });

    it('carries the room level id onto every view', () => {
        expect(views.every(v => v.spatial.levelId === 'lvl-0')).toBe(true);
    });

    it('degenerate room → []', () => {
        expect(buildRoomInteriorElevationViews({ id: 'x', name: 'X', levelId: 'l', polygon: [{ x: 0, z: 0 }] })).toEqual([]);
    });

    it('honours custom near/far/margin options', () => {
        const v = buildRoomInteriorElevationViews(
            { id: 'r1', name: 'Living', levelId: 'lvl-0', polygon: SQUARE },
            { nearOffsetM: 0.1, farOffsetM: 2.7, cropMarginM: 0 },
        );
        expect(v[0].spatial.viewRange).toEqual({ nearOffset: 0.1, farOffset: 2.7 });
        expect(v[0].spatial.cropRegion).toEqual({ minX: 2, minZ: 1, maxX: 6, maxZ: 4 });
    });
});

describe('§DOC-ROOM-INTERIOR-ELEVATIONS — buildScopedRoomInteriorElevations', () => {
    it('all rooms → 4 views per valid room (3 rooms × 4 = 12)', () => {
        expect(buildScopedRoomInteriorElevations(ROOMS, { kind: 'all' })).toHaveLength(12);
    });
    it('one level → 4 views per room on that level (2 rooms × 4 = 8)', () => {
        expect(buildScopedRoomInteriorElevations(ROOMS, { kind: 'level', levelId: 'lvl-0' })).toHaveLength(8);
    });
    it('single room → exactly 4 views', () => {
        const v = buildScopedRoomInteriorElevations(ROOMS, { kind: 'room', roomId: 'r3' });
        expect(v).toHaveLength(4);
        expect(v.every(x => x.roomId === 'r3')).toBe(true);
    });
});
