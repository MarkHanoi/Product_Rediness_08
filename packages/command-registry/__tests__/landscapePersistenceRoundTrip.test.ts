// §LANDSCAPE-CATALOGUE (L-1380) — every landscape element the panel offers must
// survive the DEFAULT-ON restore path.
//
// ## Why this file targets `buildFurnitureRestorePayload` and nothing else
//
// There are three project loaders in this repo and two of them are dead twins.
// Five save/load holes were found this week by people who tested a twin: a green
// test against `persistence-client`'s `ProjectLoader` decides nothing, because
// the app never builds it (`ProjectLoader.ts:331` says so in its own header).
//
// The live path is `ImportProjectCommand`, and its furniture step is exactly:
//
//     ImportProjectCommand.ts:1003
//       new CreateFurnitureCommand(buildFurnitureRestorePayload(f))
//
// So this file imports the REAL exported `buildFurnitureRestorePayload` that
// line calls. ⛔ Nothing here is stubbed and no fixture is hand-written in the
// mapper's own shape — the input objects are built from the REAL
// `LANDSCAPE_CATALOGUE`, so a species added upstream is covered here
// automatically and cannot be forgotten.
//
// ## What would be missed without it
//
// A landscape element is only worth offering if reopening the project brings it
// back as the SAME species at the SAME size. `furnitureType` is the field that
// selects the builder — lose it and a 16 m wax palm reloads as an empty group.
// The dimensions are what the plan symbol and the canopy are drawn from.

import { describe, it, expect } from 'vitest';
import { buildFurnitureRestorePayload } from '../src/project/projectLoaderUtils';
import { LANDSCAPE_CATALOGUE, LANDSCAPE_TREE_ENTRIES } from '@pryzm/geometry-furniture';

/**
 * A saved furniture record in the shape the serializer writes — position,
 * rotation, level and the three dimensions the creation route stamped from the
 * catalogue entry.
 */
function savedRecordFor(e: (typeof LANDSCAPE_CATALOGUE)[number], i: number) {
    return {
        id:            `landscape-${i}`,
        furnitureType: e.furnitureType,
        position:      { x: i * 3, y: 0, z: i * 2 },
        rotation:      0.25 * i,
        levelId:       'level-0',
        baseOffset:    0,
        width:         e.footprint.width,
        length:        e.footprint.length,
        height:        e.footprint.height,
        material:      'wood',
    };
}

describe('§LANDSCAPE-PERSIST — the live ImportProjectCommand restore path', () => {
    it('round-trips the species identity of every catalogue entry', () => {
        const lost: string[] = [];
        LANDSCAPE_CATALOGUE.forEach((e, i) => {
            const p = buildFurnitureRestorePayload(savedRecordFor(e, i));
            if (p.furnitureType !== e.furnitureType) lost.push(e.furnitureType);
        });
        expect(lost, 'these types would reload as a different element').toEqual([]);
    });

    it('round-trips the two dimensions the canopy and the plan symbol are drawn from', () => {
        LANDSCAPE_CATALOGUE.forEach((e, i) => {
            const p = buildFurnitureRestorePayload(savedRecordFor(e, i));
            expect(p.width,  `${e.furnitureType} width`).toBe(e.footprint.width);
            expect(p.length, `${e.furnitureType} length`).toBe(e.footprint.length);
            expect(p.height, `${e.furnitureType} height`).toBe(e.footprint.height);
        });
    });

    it('round-trips placement — position, rotation and level', () => {
        LANDSCAPE_CATALOGUE.forEach((e, i) => {
            const rec = savedRecordFor(e, i);
            const p = buildFurnitureRestorePayload(rec);
            expect(p.position).toEqual(rec.position);
            expect(p.rotation).toBe(rec.rotation);
            expect(p.levelId).toBe('level-0');
        });
    });

    it('does NOT silently default a landscape record to the 0.2 m baseOffset', () => {
        // `buildFurnitureRestorePayload` applies `f.baseOffset ?? 0.2`. A tree is
        // ground-planted: 0 is a real, meaningful value and `??` preserves it
        // (unlike `||`, which would turn 0 into 0.2 and lift every tree 200 mm
        // off the ground on reload). Asserted rather than assumed.
        const e = LANDSCAPE_TREE_ENTRIES[0]!;
        const p = buildFurnitureRestorePayload({ ...savedRecordFor(e, 0), baseOffset: 0 });
        expect(p.baseOffset).toBe(0);
    });

    it('CONTROL — a record with no furnitureType round-trips as undefined, so the arms above can fail', () => {
        const e = LANDSCAPE_TREE_ENTRIES[0]!;
        const rec = savedRecordFor(e, 0) as Record<string, unknown>;
        delete rec.furnitureType;
        expect(buildFurnitureRestorePayload(rec).furnitureType).toBeUndefined();
    });
});
