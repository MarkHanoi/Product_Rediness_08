// Founder v189 furniture defect regression tests (2026-06-12).
//
//   #9  — the dining table (+ chairs) ALWAYS places in a dining room that meets
//         the min area, even on a TILTED plate (the §FURNITURE-BUILDING-RELATIVE
//         v186 regression: a centre-anchored table on a 30° room was silently
//         dropped because its single rotated-footprint try poked the polygon).
//   #5  — no FLOOR furniture lands in a door's swing / approach keep-clear.
//   #10 — the bedroom rotates across the FOUR parametric bed types by room id;
//         the Japanese variants (integrated bedside surfaces) drop the separate
//         bedside tables (consistency).

import { describe, expect, it } from 'vitest';
import { furnishRoom } from '../src/workflows/furnishLayout/furnishRoom.js';
import { footprintCorners, quadsOverlap } from '../src/workflows/furnishLayout/collision.js';
import { chooseBedType } from '../src/workflows/furnishLayout/bedVariety.js';
import type { FurnishRoomInput, Pt, PlacedFurniture } from '../src/workflows/furnishLayout/types.js';

function rectRoom(occupancy: string, w: number, d: number, roomId = 'r1'): FurnishRoomInput {
    const poly: Pt[] = [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];
    return {
        roomId, levelId: 'L0', occupancy,
        polygon: poly, centroid: { x: w / 2, z: d / 2 }, areaM2: w * d,
        walls: [
            { a: { x: 0, z: 0 }, b: { x: w, z: 0 }, inwardNormal: { x: 0, z: 1 }, length: w, isExterior: true },
            { a: { x: 0, z: d }, b: { x: w, z: d }, inwardNormal: { x: 0, z: -1 }, length: w, isExterior: true },
            { a: { x: 0, z: 0 }, b: { x: 0, z: d }, inwardNormal: { x: 1, z: 0 }, length: d, isExterior: true },
            { a: { x: w, z: 0 }, b: { x: w, z: d }, inwardNormal: { x: -1, z: 0 }, length: d, isExterior: true },
        ],
        doors: [{ type: 'door', center: { x: w / 2, z: 0 }, normal: { x: 0, z: 1 }, width: 0.9 }],
        windows: [],
        levelElevation: 0,
    };
}

const rot = (p: Pt, c: Pt, cs: number, sn: number): Pt =>
    ({ x: c.x + (p.x - c.x) * cs - (p.z - c.z) * sn, z: c.z + (p.x - c.x) * sn + (p.z - c.z) * cs });
const rotVec = (v: Pt, cs: number, sn: number): Pt => ({ x: v.x * cs - v.z * sn, z: v.x * sn + v.z * cs });
const rotatedRoom = (occupancy: string, w: number, d: number, theta: number, roomId = 'r1'): FurnishRoomInput => {
    const base = rectRoom(occupancy, w, d, roomId);
    const c = base.centroid; const cs = Math.cos(theta), sn = Math.sin(theta);
    return {
        ...base,
        polygon: (base.polygon as Pt[]).map(p => rot(p, c, cs, sn)),
        walls: base.walls.map(wl => ({ ...wl, a: rot(wl.a, c, cs, sn), b: rot(wl.b, c, cs, sn), inwardNormal: rotVec(wl.inwardNormal, cs, sn) })),
        doors: base.doors.map(dr => ({ ...dr, center: rot(dr.center, c, cs, sn), normal: rotVec(dr.normal, cs, sn) })),
    };
};

// ── #9 — dining table always places (even tilted) ────────────────────────────
describe('founder #9 — dining table + chairs ALWAYS place (tilt-robust)', () => {
    // The reported defect: a tilted dining room showed cabinets (sideboard/buffet,
    // which place via the oriented WALL path) but NO dining table — the centre-
    // anchored table's single rotated-footprint try failed quadInPolygon and the
    // table + its dependent chairs + rug were dropped.
    const tilts = [0, Math.PI / 12, Math.PI / 6, Math.PI / 4, Math.PI / 3, Math.PI / 2.5];

    it('axis-aligned dining room (~17 m²) places a table + ≥3 chairs', () => {
        const items = furnishRoom(rectRoom('dining-room', 5, 3.4));
        expect(items.some(i => i.kind === 'dining_table')).toBe(true);
        expect(items.filter(i => i.kind === 'dining_chair').length).toBeGreaterThanOrEqual(3);
    });

    for (const theta of tilts) {
        it(`tilted ${Math.round((theta * 180) / Math.PI)}° dining room (~17 m²) STILL places a table + chairs`, () => {
            const items = furnishRoom(rotatedRoom('dining-room', 5, 3.4, theta));
            const table = items.find(i => i.kind === 'dining_table');
            expect(table, 'dining table must never be silently dropped').toBeDefined();
            // chairs depend on the table leader → they only exist when the table did.
            expect(items.filter(i => i.kind === 'dining_chair').length).toBeGreaterThanOrEqual(2);
        });
    }

    it('the regression case: a 30°-tilted dining room (the exact pre-fix failure)', () => {
        // Pre-fix this returned [sideboard, buffet, curtain_rod, curtain_panel] — no
        // table, no chairs. Post-fix the required centre table seats robustly.
        const items = furnishRoom(rotatedRoom('dining-room', 5, 3.4, Math.PI / 6));
        expect(items.some(i => i.kind === 'dining_table')).toBe(true);
        expect(items.some(i => i.kind === 'dining_chair')).toBe(true);
    });

    it('is deterministic on a tilted plate (ADR-0061)', () => {
        const a = furnishRoom(rotatedRoom('dining-room', 5, 3.4, Math.PI / 6));
        const b = furnishRoom(rotatedRoom('dining-room', 5, 3.4, Math.PI / 6));
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });
});

// ── #5 — nothing lands in a door's swing/approach ────────────────────────────
describe('founder #5 — no floor furniture in front of a door', () => {
    // Re-derive the door keep-clear (matches placeSolver.doorObstacles) and assert
    // no FLOOR-standing item (baseOffset 0; rug exempt) overlaps it, across rooms.
    const doorQuad = (d: { center: Pt; normal: Pt; width: number }) => {
        // Mirrors placeSolver.doorObstacles: a door-width × 0.9 m keep-clear,
        // centred 0.45 m in front of the leaf (the swing + approach strip).
        const c = { x: d.center.x + d.normal.x * 0.45, z: d.center.z + d.normal.z * 0.45 };
        return footprintCorners(c.x, c.z, d.width, 0.9, Math.atan2(d.normal.x, d.normal.z));
    };
    const itemQuad = (p: PlacedFurniture) =>
        footprintCorners(p.position.x, p.position.z, p.footprint.w, p.footprint.l, p.rotationY);

    for (const occ of ['bedroom', 'living-room', 'dining-room', 'bathroom'] as const) {
        for (const [w, d] of [[4, 3], [5, 4], [3, 2.5]] as Array<[number, number]>) {
            it(`${occ} ${w}×${d}: no floor item overlaps the door keep-clear`, () => {
                const room = rectRoom(occ, w, d);
                const items = furnishRoom(room);
                const dq = doorQuad(room.doors[0]!);
                for (const it of items) {
                    if (it.kind === 'rug') continue;           // rug is collision-exempt by design
                    if (it.footprint.baseOffset > 0.01) continue; // wall-hung / surface items aren't floor obstacles
                    expect(quadsOverlap(itemQuad(it), dq), `${it.kind} blocks the door`).toBe(false);
                }
            });
        }
    }
});

// ── #10 — the four parametric bed types ──────────────────────────────────────
describe('founder #10 — the bedroom uses the 4 parametric bed types', () => {
    const BED_TYPES = ['bed', 'japanese_platform_bed', 'japanese_float_bed', 'japanese_walnut_bed'];

    it('chooseBedType is deterministic and spans all four types across rooms', () => {
        const seen = new Set<string>();
        for (let i = 0; i < 80; i++) {
            const t = chooseBedType(`bedroom-${i}`);
            expect(BED_TYPES).toContain(t);
            seen.add(t);
            expect(chooseBedType(`bedroom-${i}`)).toBe(t);   // deterministic
        }
        expect(seen.size).toBe(4);   // all four bed types appear
    });

    it('a bedroom carries exactly one of the four bed types', () => {
        for (let i = 0; i < 12; i++) {
            const id = `bd-${i}`;
            const placed = furnishRoom(rectRoom('bedroom', 3.6, 5.2, id));
            const beds = placed.filter(p => BED_TYPES.includes(p.kind));
            expect(beds.length, `room ${id}`).toBe(1);
            expect(beds[0]!.kind).toBe(chooseBedType(id));
        }
    });

    it('a Japanese variant bed drops the SEPARATE bedside tables (integrated)', () => {
        // Find a room id that selects each Japanese variant; assert no separate
        // bedside_table is emitted (the variant builds its own nightstands/wings).
        for (const want of ['japanese_platform_bed', 'japanese_float_bed', 'japanese_walnut_bed']) {
            let id = '';
            for (let i = 0; i < 2000; i++) { if (chooseBedType(`q-${i}`) === want) { id = `q-${i}`; break; } }
            expect(id, `a room id for ${want}`).not.toBe('');
            const placed = furnishRoom(rectRoom('bedroom', 3.6, 5.2, id));
            expect(placed.some(p => p.kind === want)).toBe(true);
            expect(placed.filter(p => p.kind === 'bedside_table').length).toBe(0);
        }
    });

    it('the plain bed keeps its 2 SEPARATE bedside tables + 2 lamps', () => {
        let id = '';
        for (let i = 0; i < 2000; i++) { if (chooseBedType(`p-${i}`) === 'bed') { id = `p-${i}`; break; } }
        const placed = furnishRoom(rectRoom('bedroom', 3.6, 5.2, id));
        expect(placed.some(p => p.kind === 'bed')).toBe(true);
        expect(placed.filter(p => p.kind === 'bedside_table').length).toBe(2);
        const lamps = placed.filter(p => p.kind === 'lamp');
        expect(lamps.length).toBeGreaterThanOrEqual(2);
    });

    it('the platform bed gets MORE bedside lamps than the float bed (lamps in the mesh)', () => {
        // The bedroom archetype also places ONE corner floor `lamp` (required) — it
        // is present for every bed type. So we compare the BEDSIDE lamp count: the
        // platform/walnut bed adds inline bedside lamps; the float bed adds none
        // (its lamps are built into the bed mesh). Count lamps NOT on the corner.
        const platformId = (() => { for (let i = 0; i < 2000; i++) if (chooseBedType(`x-${i}`) === 'japanese_platform_bed') return `x-${i}`; return ''; })();
        const floatId = (() => { for (let i = 0; i < 2000; i++) if (chooseBedType(`y-${i}`) === 'japanese_float_bed') return `y-${i}`; return ''; })();
        const platform = furnishRoom(rectRoom('bedroom', 3.6, 5.2, platformId));
        const float = furnishRoom(rectRoom('bedroom', 3.6, 5.2, floatId));
        // platform bed → corner lamp + 2 inline bedside lamps; float → corner lamp only.
        expect(platform.filter(p => p.kind === 'lamp').length)
            .toBeGreaterThan(float.filter(p => p.kind === 'lamp').length);
    });
});
