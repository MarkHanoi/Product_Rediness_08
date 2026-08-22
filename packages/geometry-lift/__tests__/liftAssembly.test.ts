// §FEAT-LIFT-COMPOUND-SYSTEM (L-5700..L-5712) — the PURE assembly.
//
// These cases pin the GEOMETRY and the DIMENSION CHAIN, which the composed-runtime
// reachability suite deliberately does not: that file proves the command is
// dispatchable and its patches land; this one proves the numbers are right.
//
// ⭐ NOT ONE CASE COMPARES AGAINST A DOCUMENTED DEFAULT. A test that asserts
// "shaftWidth === 1.5" goes RED the day someone deliberately changes the default —
// which is not a defect — and stays GREEN if the resolution chain silently ignores
// an explicit user override, which very much is one. So every case below either
// passes a value EXPLICITLY and asserts it is HONOURED, or asserts a RELATIONSHIP
// that must hold for any dimensions whatsoever. That is the lesson the pool suite
// records, applied rather than restated.

import { describe, expect, it } from 'vitest';
import {
    buildLiftAssembly,
    resolveLiftDimensions,
    BUILT_IN_LIFT_TYPES,
    LIFT_PART_CYCLE_ORDER,
    type LiftAssemblyInput,
    type ServedLevel,
} from '../src/index.js';

const IDS = {
    enclosureIds: ['e0', 'e1', 'e2', 'e3'],
    landingDoorIds: ['d0', 'd1', 'd2'],
    cabinPartIds: ['p0', 'p1', 'p2', 'p3', 'p4'],
};

const LEVELS: ServedLevel[] = [
    { levelId: 'L0', elevation: 0, slabId: 's0' },
    { levelId: 'L1', elevation: 3, slabId: 's1' },
    { levelId: 'L2', elevation: 6, slabId: 's2' },
];

function lift(over: Partial<LiftAssemblyInput> = {}): LiftAssemblyInput {
    return {
        id: 'lift-1',
        levelId: 'L0',
        origin: { x: 10, y: 0, z: 20 },
        rotation: 0,
        enclosureType: 'wall-hosted',
        hostWallId: 'w-host',
        ...over,
    };
}

describe('buildLiftAssembly — the shaft', () => {
    it('spans pit-to-overrun, not just floor-to-floor', () => {
        const a = buildLiftAssembly(lift(), IDS, LEVELS);
        // A shaft that stops at the lowest floor has no buffer pit, and one that
        // stops at the top floor has no headroom for the car. Both are spaces that
        // must really be built, and both are silently missing if the shaft is just
        // `top - bottom`. Asserted as a RELATION to the served range.
        expect(a.shaftBaseY).toBeLessThan(0);
        expect(a.shaftTopY).toBeGreaterThan(6);
        expect(a.shaftHeight).toBeGreaterThan(6);
        expect(a.shaftHeight).toBeCloseTo(a.shaftTopY - a.shaftBaseY, 10);
    });

    it('emits FOUR sides, exactly ONE of which is the landing side', () => {
        const a = buildLiftAssembly(lift(), IDS, LEVELS);
        expect(a.enclosure).toHaveLength(4);
        expect(a.enclosure.filter((s) => s.isLandingSide)).toHaveLength(1);
        expect(a.landingSideId).toBe(a.enclosure.find((s) => s.isLandingSide)!.id);
    });

    it('every side is full height and starts at the shaft base', () => {
        const a = buildLiftAssembly(lift(), IDS, LEVELS);
        for (const s of a.enclosure) {
            const r = s.record as { height: number; baseOffset: number };
            expect(r.height, `${s.id} height`).toBeCloseTo(a.shaftHeight, 10);
            // baseOffset is relative to the lift's datum (origin.y = 0 here).
            expect(r.baseOffset, `${s.id} baseOffset`).toBeCloseTo(a.shaftBaseY, 10);
        }
    });

    it('the footprint closes — side i ends where side i+1 begins', () => {
        const a = buildLiftAssembly(lift({ rotation: 0.7 }), IDS, LEVELS);
        const line = (i: number) =>
            (a.enclosure[i]!.record as { baseLine: { x: number; z: number }[] }).baseLine;
        for (let i = 0; i < 4; i++) {
            const end = line(i)[1]!;
            const nextStart = line((i + 1) % 4)[0]!;
            expect(end.x, `side ${i} -> ${(i + 1) % 4} x`).toBeCloseTo(nextStart.x, 10);
            expect(end.z, `side ${i} -> ${(i + 1) % 4} z`).toBeCloseTo(nextStart.z, 10);
        }
    });

    it('rotation MOVES the footprint but preserves its size', () => {
        const straight = buildLiftAssembly(lift({ rotation: 0 }), IDS, LEVELS);
        const turned = buildLiftAssembly(lift({ rotation: Math.PI / 4 }), IDS, LEVELS);
        const lenOf = (asm: typeof straight, i: number) => {
            const b = (asm.enclosure[i]!.record as { baseLine: { x: number; z: number }[] }).baseLine;
            return Math.hypot(b[1]!.x - b[0]!.x, b[1]!.z - b[0]!.z);
        };
        // Same shaft, turned: every side keeps its length. A rotation that changed
        // the size would mean the transform is applied in the wrong space.
        for (let i = 0; i < 4; i++) {
            expect(lenOf(turned, i), `side ${i} length`).toBeCloseTo(lenOf(straight, i), 10);
        }
        // …and it really did move.
        const s0 = (straight.enclosure[0]!.record as { baseLine: { x: number }[] }).baseLine[0]!.x;
        const t0 = (turned.enclosure[0]!.record as { baseLine: { x: number }[] }).baseLine[0]!.x;
        expect(t0).not.toBeCloseTo(s0, 6);
    });
});

describe('buildLiftAssembly — the landing doors', () => {
    it('ONE per served level, on the level it serves, hosted in the landing side', () => {
        const a = buildLiftAssembly(lift(), IDS, LEVELS);
        expect(a.landingDoors).toHaveLength(LEVELS.length);
        a.landingDoors.forEach((d, i) => {
            expect((d as { levelId: string }).levelId).toBe(LEVELS[i]!.levelId);
            expect((d as { wallId: string }).wallId).toBe(a.landingSideId);
        });
    });

    it('⭐ sillHeight puts each door on its OWN storey', () => {
        const a = buildLiftAssembly(lift(), IDS, LEVELS);
        // One tall wall carries all N doors, so sillHeight is the ONLY thing placing
        // a door on the right floor. Asserted as the exact relation to the shaft base
        // rather than as three literals.
        a.landingDoors.forEach((d, i) => {
            expect((d as { sillHeight: number }).sillHeight).toBeCloseTo(
                LEVELS[i]!.elevation - a.shaftBaseY,
                10,
            );
        });
    });

    it('a lift serving ONE level makes ONE door — the storey count is not hard-coded', () => {
        const a = buildLiftAssembly(
            lift(),
            { ...IDS, landingDoorIds: ['only'] },
            [LEVELS[0]!],
        );
        expect(a.landingDoors).toHaveLength(1);
        expect(a.slabVoids).toHaveLength(1);
    });

    it('landing doors are SLIDING — a hinged arc in a lift lobby is a clash that does not exist', () => {
        const a = buildLiftAssembly(lift(), IDS, LEVELS);
        for (const d of a.landingDoors) expect((d as { swing: string }).swing).toBe('sliding');
    });

    it('the door fits inside the landing side, and is centred on it', () => {
        const a = buildLiftAssembly(lift(), IDS, LEVELS);
        const d0 = a.landingDoors[0] as { width: number; offset: number };
        expect(d0.width).toBeLessThanOrEqual(a.dims.shaftWidth);
        expect(d0.offset).toBeCloseTo((a.dims.shaftWidth - d0.width) / 2, 10);
    });
});

describe('buildLiftAssembly — the slab voids', () => {
    it('one void per slab, and the loop IS the shaft footprint', () => {
        const a = buildLiftAssembly(lift(), IDS, LEVELS);
        expect(a.slabVoids).toHaveLength(3);
        expect(a.slabVoids.map((v) => v.slabId)).toEqual(['s0', 's1', 's2']);
        for (const v of a.slabVoids) expect(v.loop).toHaveLength(4);
    });

    it('each void sits at ITS OWN level elevation', () => {
        const a = buildLiftAssembly(lift(), IDS, LEVELS);
        a.slabVoids.forEach((v, i) => {
            for (const p of v.loop) expect(p.y).toBeCloseTo(LEVELS[i]!.elevation, 10);
        });
    });

    it('⭐ a level with NO slab yields NO void — a real state, not a dangling reference', () => {
        const a = buildLiftAssembly(
            lift(),
            IDS,
            [
                { levelId: 'L0', elevation: 0 }, // on grade — no slab here
                { levelId: 'L1', elevation: 3, slabId: 's1' },
                { levelId: 'L2', elevation: 6, slabId: 's2' },
            ],
        );
        // Still three doors — the lift serves three storeys either way…
        expect(a.landingDoors).toHaveLength(3);
        // …but only two floor plates get cut.
        expect(a.slabVoids).toHaveLength(2);
        expect(a.slabVoids.map((v) => v.slabId)).toEqual(['s1', 's2']);
    });
});

describe('buildLiftAssembly — the cabin', () => {
    it('decomposes into the five DECLARED kinds, in the declared order', () => {
        const a = buildLiftAssembly(lift(), IDS, LEVELS);
        expect(a.cabinParts.map((p) => p.kind)).toEqual([...LIFT_PART_CYCLE_ORDER]);
    });

    it('the car FLOOR hangs BELOW the walking surface; the CEILING hangs from the top', () => {
        const a = buildLiftAssembly(lift(), IDS, LEVELS);
        const floor = a.cabinParts.find((p) => p.kind === 'cabin-floor')!;
        const ceil = a.cabinParts.find((p) => p.kind === 'cabin-ceiling')!;
        // Car-local y = 0 IS the surface people stand on, so the build-up is negative.
        expect(floor.offsetY).toBeLessThan(0);
        expect(floor.offsetY).toBeCloseTo(-floor.height, 10);
        // The ceiling raft's underside is one raft-thickness below the car top.
        expect(ceil.offsetY + ceil.height).toBeCloseTo(a.dims.carHeight, 10);
    });

    it('every part is a real dimensioned box — LOD 300, not a marker', () => {
        const a = buildLiftAssembly(lift(), IDS, LEVELS);
        for (const p of a.cabinParts) {
            expect(p.width, `${p.kind} width`).toBeGreaterThan(0);
            expect(p.depth, `${p.kind} depth`).toBeGreaterThan(0);
            expect(p.height, `${p.kind} height`).toBeGreaterThan(0);
        }
    });

    it('the LINING is inside the STRUCTURE, which is inside the SHAFT', () => {
        const a = buildLiftAssembly(lift(), IDS, LEVELS);
        const struct = a.cabinParts.find((p) => p.kind === 'cabin-structure')!;
        const lining = a.cabinParts.find((p) => p.kind === 'cabin-wall-finish')!;
        expect(lining.width).toBeLessThan(struct.width);
        expect(struct.width).toBeLessThan(a.dims.shaftWidth);
    });
});

describe('buildLiftAssembly — the two types', () => {
    it('wall-hosted: ALL FOUR sides are opaque walls', () => {
        const a = buildLiftAssembly(lift({ enclosureType: 'wall-hosted' }), IDS, LEVELS);
        expect(a.enclosure.filter((s) => s.kind === 'wall')).toHaveLength(4);
        expect(a.enclosure.filter((s) => s.kind === 'curtainWall')).toHaveLength(0);
    });

    it('⭐ standalone-glass: THREE curtain-wall sides + a SOLID landing side', () => {
        const a = buildLiftAssembly(
            lift({ enclosureType: 'standalone-glass', hostWallId: undefined }),
            IDS,
            LEVELS,
        );
        expect(a.enclosure.filter((s) => s.kind === 'curtainWall')).toHaveLength(3);
        const solid = a.enclosure.filter((s) => s.kind === 'wall');
        expect(solid).toHaveLength(1);
        // The solid one IS the landing side — because `Door.wallId` hosts in a WALL
        // and a CurtainWall has no opening list. Glass on the landing face would
        // leave the landing doors with nothing to host in.
        expect(solid[0]!.isLandingSide).toBe(true);
        expect(solid[0]!.id).toBe(a.landingSideId);
    });

    it('the glass sides really are curtain-wall records, not walls with a flag', () => {
        const a = buildLiftAssembly(
            lift({ enclosureType: 'standalone-glass', hostWallId: undefined }),
            IDS,
            LEVELS,
        );
        for (const s of a.enclosure.filter((x) => x.kind === 'curtainWall')) {
            const r = s.record as { type: string; mullionThickness: number };
            expect(r.type).toBe('curtainwall');
            expect(r.mullionThickness).toBeGreaterThan(0);
        }
    });
});

describe('resolveLiftDimensions — record -> systemType -> documented default', () => {
    it('an EXPLICIT value WINS over the system type', () => {
        const type = BUILT_IN_LIFT_TYPES.find((t) => t.id === 'passenger-8')!;
        // A width that is deliberately NOT the type's, so a chain that silently fell
        // back to the type would fail here. This is the failure a comparison against
        // the documented default could not see.
        const d = resolveLiftDimensions({ shaftWidth: 2.75 }, type);
        expect(d.shaftWidth).toBeCloseTo(2.75, 10);
    });

    it('the SYSTEM TYPE wins over the documented default', () => {
        const goods = BUILT_IN_LIFT_TYPES.find((t) => t.id === 'goods')!;
        const withType = resolveLiftDimensions({}, goods);
        const bare = resolveLiftDimensions({});
        expect(withType.shaftWidth).toBeCloseTo(goods.defaults.shaftWidth, 10);
        // The two must differ, else this case proves nothing.
        expect(withType.shaftWidth).not.toBeCloseTo(bare.shaftWidth, 6);
    });

    it('⭐ the CAR is DERIVED from the shaft, so the two cannot drift', () => {
        const narrow = resolveLiftDimensions({ shaftWidth: 1.5, shaftDepth: 1.6 });
        const wide = resolveLiftDimensions({ shaftWidth: 2.4, shaftDepth: 2.4 });
        // Widen the shaft -> the car widens. Storing both would let an architect
        // widen the shaft and leave the car small, with nothing complaining.
        expect(wide.carWidth).toBeGreaterThan(narrow.carWidth);
        // And the car is ALWAYS strictly inside the shaft, at any size.
        for (const d of [narrow, wide]) {
            expect(d.carWidth).toBeLessThan(d.shaftWidth);
            expect(d.carDepth).toBeLessThan(d.shaftDepth);
            expect(d.carWidth).toBeGreaterThan(0);
        }
    });

    it('a degenerate shaft yields a degenerate-but-VALID car, never a negative extent', () => {
        // A negative extent would throw inside a Zod `.positive()` at the store
        // boundary — far from the cause. Clamped here, where it can be explained.
        const d = resolveLiftDimensions({ shaftWidth: 0.2, shaftDepth: 0.2 });
        expect(d.carWidth).toBeGreaterThan(0);
        expect(d.carDepth).toBeGreaterThan(0);
    });

    it('⭐ the 6-person type EXISTS and did not displace the standards-cited 8-person one', () => {
        const ids = BUILT_IN_LIFT_TYPES.map((t) => t.id);
        expect(ids).toContain('passenger-6');
        // The whole point of the L-5701 decision: `passenger-8` and `accessible`
        // carry an EN 81-70 citation and are still here, unchanged.
        expect(ids).toContain('passenger-8');
        expect(ids).toContain('accessible');
        const six = BUILT_IN_LIFT_TYPES.find((t) => t.id === 'passenger-6')!;
        const eight = BUILT_IN_LIFT_TYPES.find((t) => t.id === 'passenger-8')!;
        expect(six.defaults.carCapacityPersons).toBe(6);
        expect(eight.defaults.carCapacityPersons).toBe(8);
        // The accessible car keeps its regulatory clear dimensions.
        const acc = BUILT_IN_LIFT_TYPES.find((t) => t.id === 'accessible')!;
        expect(acc.defaults.shaftWidth).toBeCloseTo(1.8, 10);
        expect(acc.defaults.shaftDepth).toBeCloseTo(2.0, 10);
    });
});

describe('buildLiftAssembly — refusals', () => {
    it('refuses an empty served-level set rather than making a lift that serves nothing', () => {
        expect(() => buildLiftAssembly(lift(), IDS, [])).toThrow(/at least one level/i);
    });

    it('refuses a mismatched id count — ids are pre-minted for redo stability (CA-2)', () => {
        expect(() =>
            buildLiftAssembly(lift(), { ...IDS, enclosureIds: ['a', 'b'] }, LEVELS),
        ).toThrow(/enclosure ids/i);
        expect(() =>
            buildLiftAssembly(lift(), { ...IDS, landingDoorIds: ['a'] }, LEVELS),
        ).toThrow(/landing-door ids/i);
        expect(() =>
            buildLiftAssembly(lift(), { ...IDS, cabinPartIds: ['a'] }, LEVELS),
        ).toThrow(/cabin-part ids/i);
    });
});

describe('buildLiftAssembly — ownership', () => {
    it('childrenIds covers EVERY member, and the HOST WALL is not among them', () => {
        const a = buildLiftAssembly(lift(), IDS, LEVELS);
        expect(new Set(a.childrenIds)).toEqual(
            new Set([...IDS.enclosureIds, ...IDS.landingDoorIds, ...IDS.cabinPartIds]),
        );
        // A wall-hosted lift BORROWS its host. If the host were a child, deleting the
        // lift would delete the user's wall.
        expect(a.childrenIds).not.toContain('w-host');
    });

    it('every member carries parentId back to the lift', () => {
        const a = buildLiftAssembly(lift(), IDS, LEVELS);
        for (const s of a.enclosure) {
            expect((s.record as { parentId: string }).parentId).toBe('lift-1');
        }
        for (const d of a.landingDoors) expect((d as { parentId: string }).parentId).toBe('lift-1');
        for (const p of a.cabinParts) expect(p.parentId).toBe('lift-1');
    });

    it('is DETERMINISTIC — same input, same parts (which is what lets delete re-derive them)', () => {
        const a = buildLiftAssembly(lift(), IDS, LEVELS);
        const b = buildLiftAssembly(lift(), IDS, LEVELS);
        // `DeleteLiftHandler` re-runs this function to find the void loops to heal,
        // rather than storing a copy that could drift. That only works if it is pure.
        expect(JSON.stringify(b.slabVoids)).toBe(JSON.stringify(a.slabVoids));
        expect(JSON.stringify(b.cabinParts)).toBe(JSON.stringify(a.cabinParts));
    });
});
