// ADR-0069 (GR4) — roomDataFromGraphSpec: the graph-authoritative RoomData factory.
//
// The decisive assertion: a RoomData built from an engine spec PASSES the real
// `RoomDataAddSchema` (the same Zod gate `RoomStore.add` runs) — so the editor can
// dispatch it without the runtime throwing. This proves the schema-correctness of
// the spec→RoomData mapping (UUID id, simple CCW polygon, valid occupancyType +
// detectionMethod) rather than discovering it in the browser.

import { describe, expect, it } from 'vitest';
import { roomDataFromGraphSpec, type GraphRoomSpec } from '../src/roomFromGraphSpec';
import { RoomDataAddSchema } from '../src/RoomDataSchema';

const UUID = '00000000-0000-4000-8000-000000000001';
const OPTS = { levelHeightM: 2.7, roomNumber: '01', idGen: () => UUID, now: 1_700_000_000_000 };

const rect = (w: number, d: number): Array<{ x: number; z: number }> =>
    [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];

const spec = (over: Partial<GraphRoomSpec> = {}): GraphRoomSpec => ({
    levelId: 'L0', name: 'Bedroom 1', type: 'bedroom', occupancyType: 'bedroom',
    polygon: rect(4, 3.5), ...over,
});

describe('roomDataFromGraphSpec — schema validity (the de-risking proof)', () => {
    it('produces a RoomData that PASSES RoomDataAddSchema', () => {
        const room = roomDataFromGraphSpec(spec(), OPTS);
        expect(room).not.toBeNull();
        expect(() => RoomDataAddSchema.parse(room)).not.toThrow();
    });

    it('carries name + occupancyType + UUID id + ai-generated detection method', () => {
        const room = roomDataFromGraphSpec(spec(), OPTS)!;
        expect(room.id).toBe(UUID);
        expect(room.name).toBe('Bedroom 1');
        expect(room.occupancyType).toBe('bedroom');
        expect(room.boundary.detectionMethod).toBe('ai-generated');
        expect(room.roomNumber).toBe('01');
        expect(room.levelId).toBe('L0');
        // computed area ≈ 4 × 3.5 = 14 m² (recomputed from the polygon).
        expect(room.computed.area).toBeCloseTo(14, 1);
    });

    it('falls back to occupancyType="unclassified" for an unknown occupancy', () => {
        const room = roomDataFromGraphSpec(spec({ occupancyType: 'not-a-real-occupancy' }), OPTS)!;
        expect(room.occupancyType).toBe('unclassified');
        expect(() => RoomDataAddSchema.parse(room)).not.toThrow();
    });

    it('falls back to unclassified when occupancy is absent', () => {
        const room = roomDataFromGraphSpec(spec({ occupancyType: undefined }), OPTS)!;
        expect(room.occupancyType).toBe('unclassified');
    });

    it('normalises a CW polygon to CCW (RoomStore-compatible winding)', () => {
        const cw = [{ x: 0, z: 0 }, { x: 0, z: 3 }, { x: 4, z: 3 }, { x: 4, z: 0 }]; // clockwise
        const room = roomDataFromGraphSpec(spec({ polygon: cw }), OPTS)!;
        expect(() => RoomDataAddSchema.parse(room)).not.toThrow();
        expect(room.computed.area).toBeCloseTo(12, 1);
    });

    it('returns null for a degenerate polygon (<3 verts) — caller falls back to detection', () => {
        expect(roomDataFromGraphSpec(spec({ polygon: [{ x: 0, z: 0 }, { x: 1, z: 0 }] }), OPTS)).toBeNull();
    });

    it('returns null for a zero-area polygon', () => {
        const collapsed = [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }]; // collinear → ~0 area
        expect(roomDataFromGraphSpec(spec({ polygon: collapsed }), OPTS)).toBeNull();
    });

    it('repairs a self-intersecting ring or drops it (never emits an invalid polygon)', () => {
        // Bowtie (self-intersecting). Either repaired to a simple ring (passes schema) or null.
        const bowtie = [{ x: 0, z: 0 }, { x: 4, z: 4 }, { x: 4, z: 0 }, { x: 0, z: 4 }];
        const room = roomDataFromGraphSpec(spec({ polygon: bowtie }), OPTS);
        if (room !== null) expect(() => RoomDataAddSchema.parse(room)).not.toThrow();
    });
});
