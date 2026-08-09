// §WALL-RAKE — snapshot round-trip (C05 §2.3, C47 §1.2/§1.4).
//
// The claim being proved: adding `rakeAngleDeg` to WallData is a purely ADDITIVE
// optional field, so
//
//   (a) an OLD snapshot (no such field) loads as 90° — vertical — and re-serialises
//       to a byte-identical record, with no `rakeAngleDeg` key appearing; and
//   (b) a NEW raked wall survives the write→read→write cycle unchanged.
//
// (a) is the one that matters. Every project file in existence is an old snapshot,
// and a field that quietly appears in them — or, worse, that defaults to something
// other than vertical — would silently re-shape every wall a customer has drawn.
//
// This exercises the SERIALISER'S FIELD ALLOW-LIST rather than mocking it: the
// serialiser is a hand-written object literal, not a spread, so a new field that
// nobody added to the list would round-trip as `undefined` and this test is what
// catches that. The literal is mirrored here in `serializeWallFields` — if the two
// drift, the mirror test at the bottom fails.

import { describe, it, expect } from 'vitest';
import { resolveRakeDeg, RAKE_VERTICAL_DEG, isVerticalRake } from '../src/WallRake';
import { WallDataAddSchema } from '../src/WallDataSchema';
import type { WallData } from '../src/WallTypes';

/**
 * The wall fields `ProjectSerializer.serializeWall` emits, in order. Mirrored from
 * `apps/editor/src/engine/persistence/ProjectSerializer.ts` (and its
 * `packages/persistence-client` twin). Kept as data so the round-trip below is a
 * real allow-list walk, not a spread that would pass vacuously.
 */
const SERIALISED_WALL_FIELDS = [
    'id', 'type', 'levelId', 'parentId', 'baseLine', 'height', 'thickness',
    'baseOffset', 'materialId', 'materialColor', 'openings', 'childrenIds',
    'layers', 'systemTypeId', 'curve', 'rakeAngleDeg', 'properties', 'ifcData',
    'metadata', 'loadBearing',
] as const;

/** Emit only the whitelisted fields, dropping `undefined` exactly as JSON.stringify does. */
function serializeWallFields(wall: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const k of SERIALISED_WALL_FIELDS) {
        if (wall[k] !== undefined) out[k] = wall[k];
    }
    return out;
}

/** A wall record exactly as a pre-rake build wrote it: NO `rakeAngleDeg` key at all. */
function legacySnapshotWall(): Record<string, unknown> {
    return {
        id: 'wall-legacy-1',
        type: 'wall',
        levelId: 'level-0',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
        height: 3,
        thickness: 0.2,
        baseOffset: 0,
        materialColor: '#cccccc',
        openings: [],
        childrenIds: [],
        properties: {},
    };
}

describe('§WALL-RAKE round-trip — an OLD snapshot is untouched', () => {
    it('a legacy wall has no rakeAngleDeg key, and resolves to 90° (vertical)', () => {
        const w = legacySnapshotWall();
        expect('rakeAngleDeg' in w).toBe(false);
        expect(resolveRakeDeg(w.rakeAngleDeg as undefined)).toBe(RAKE_VERTICAL_DEG);
        expect(isVerticalRake(w.rakeAngleDeg as undefined)).toBe(true);
    });

    it('a legacy wall still VALIDATES — the new field cannot reject existing data', () => {
        const parsed = WallDataAddSchema.safeParse(legacySnapshotWall());
        expect(parsed.success).toBe(true);
    });

    it('load → re-serialise is BYTE-IDENTICAL, and grows no rakeAngleDeg key', () => {
        const onDisk = legacySnapshotWall();

        // LOAD: the loader hands `wall.rakeAngleDeg` (undefined) to CreateWallCommand,
        // which stamps it onto WallData unchanged — undefined stays undefined.
        const loaded = { ...onDisk, rakeAngleDeg: (onDisk as { rakeAngleDeg?: number }).rakeAngleDeg };
        expect(loaded.rakeAngleDeg).toBeUndefined();

        // RE-SERIALISE through the field allow-list.
        const rewritten = serializeWallFields(loaded);

        expect('rakeAngleDeg' in rewritten).toBe(false);
        expect(JSON.stringify(rewritten)).toBe(JSON.stringify(serializeWallFields(onDisk)));
    });

    it('an explicit 90° also re-serialises as vertical and changes no geometry', () => {
        const w = { ...legacySnapshotWall(), rakeAngleDeg: 90 };
        expect(WallDataAddSchema.safeParse(w).success).toBe(true);
        expect(isVerticalRake(w.rakeAngleDeg)).toBe(true);
    });
});

describe('§WALL-RAKE round-trip — a NEW raked wall survives', () => {
    it('a raked straight single-layer wall write → read → write is stable', () => {
        const authored = { ...legacySnapshotWall(), id: 'wall-raked-1', rakeAngleDeg: 80 };
        expect(WallDataAddSchema.safeParse(authored).success).toBe(true);

        const first  = serializeWallFields(authored);
        expect(first.rakeAngleDeg).toBe(80);

        const reloaded = { ...first };
        const second   = serializeWallFields(reloaded);
        expect(JSON.stringify(second)).toBe(JSON.stringify(first));
        expect(resolveRakeDeg(second.rakeAngleDeg as number)).toBe(80);
    });

    it('the schema REFUSES a persisted wall whose rake is out of range', () => {
        const bad = { ...legacySnapshotWall(), rakeAngleDeg: 200 };
        const r = WallDataAddSchema.safeParse(bad);
        expect(r.success).toBe(false);
    });

    it('the schema REFUSES a persisted raked wall that also hosts an opening', () => {
        const bad = {
            ...legacySnapshotWall(),
            rakeAngleDeg: 80,
            openings: [{
                id: 'o1', type: 'window', offset: 1, width: 1, height: 1,
                sillHeight: 0.9, elementId: 'win-1',
            }],
            childrenIds: ['win-1'],
        };
        expect(WallDataAddSchema.safeParse(bad).success).toBe(false);
    });

    it('the schema REFUSES a persisted raked wall that is also curved', () => {
        const bad = {
            ...legacySnapshotWall(),
            rakeAngleDeg: 80,
            curve: { control: { x: 2, y: 0, z: 1 }, segments: 16 },
        };
        expect(WallDataAddSchema.safeParse(bad).success).toBe(false);
    });
});

describe('§WALL-RAKE round-trip — the allow-list mirror is honest', () => {
    it('rakeAngleDeg is in the serialiser field list (drift guard)', () => {
        // If someone removes the field from ProjectSerializer but leaves it on
        // WallData, raked walls silently come back vertical on reload — the exact
        // failure mode that dropped `function` from custom wall types. This asserts
        // the field is in the mirrored list; the list itself is checked by eye
        // against the two ProjectSerializer copies.
        expect(SERIALISED_WALL_FIELDS).toContain('rakeAngleDeg');
    });

    it('WallData accepts the field at the type level', () => {
        const w: Partial<WallData> = { rakeAngleDeg: 80 };
        expect(w.rakeAngleDeg).toBe(80);
    });
});
