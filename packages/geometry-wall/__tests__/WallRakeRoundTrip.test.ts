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
 * the LIVE serialiser, `apps/editor/src/engine/persistence/ProjectSerializer.ts`.
 * Kept as data so the round-trip below is a real allow-list walk, not a spread that
 * would pass vacuously.
 *
 * ⚠ THIS LIST IS A COPY, AND A COPY MAINTAINED BY A COMMENT IS C84 §8.d — the
 * anti-pattern C84 EI-8a records as having already failed twice in this repo.
 * IT FAILED A THIRD TIME HERE: `joinIntent` was added to the serialiser by L-927
 * (§PERSIST-JOININTENT) and never added to this mirror, so from that day until
 * 2026-08-18 this suite walked 20 of the serialiser's 21 fields and reported a
 * complete round-trip. The drift was found by
 * `WallProfileNonRegressionBaseline.test.ts` §(B4), which reads the real literal
 * out of the serialiser source and compares every entry.
 *
 * ⛔ DO NOT hand-edit this list to match a change you just made to the serialiser
 * and consider the job done — that is precisely the mechanism that failed. §(B4)
 * is the gate; this is the data it checks.
 *
 * The `packages/persistence-client/src/loader/` twin is deliberately NOT mirrored:
 * it is not on the save path (`ProjectSerializer.ts:267-275`), and pinning a dead
 * copy would give a false sense that persistence was covered.
 */
// §FIX-SIDEFINISH-PERSISTS (L-999) — `sideFinishes` joined this list because B4 in
// `WallProfileNonRegressionBaseline.test.ts` compares this MIRROR against the real
// serialiser, and B4 names THIS file as the thing to update rather than itself.
// Without the field the round-trip walk below keeps passing while proving nothing
// about it — the licensed-copy hazard C84 EI-8a describes.
//
// ⚠ KEEP COMMENTS OUT OF THE ARRAY LITERAL BELOW. B4 extracts the field names with
// a plain /'([^']+)'/g sweep over the captured block, so a single apostrophe inside
// it (an English possessive is enough) is read as a quote and the extracted list
// turns to fragments. Measured: putting this note inside the brackets turned B4 RED
// with entries like ", " and "s licensed-copy hazard exactly.". Notes go here.
const SERIALISED_WALL_FIELDS = [
    'id', 'type', 'levelId', 'parentId', 'baseLine', 'height', 'thickness',
    'baseOffset', 'materialId', 'materialColor', 'openings', 'childrenIds',
    'layers', 'systemTypeId', 'curve', 'rakeAngleDeg', 'wallProfile',
    'sideFinishes', 'joinIntent',
    'properties', 'ifcData', 'metadata', 'loadBearing',
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

    it('the schema ACCEPTS a persisted raked wall that hosts an opening', () => {
        // §RAKE-HOSTED-OPENING (founder 2026-08-18) — this used to expect `false`.
        // It matters at the PERSISTENCE boundary specifically: a project saved after
        // the feature must reload, and the refusal it asserted would have rejected
        // the whole wall on load rather than degrading it.
        const ok = {
            ...legacySnapshotWall(),
            rakeAngleDeg: 80,
            openings: [{
                id: 'o1', type: 'window', offset: 1, width: 1, height: 1,
                sillHeight: 0.9, elementId: 'win-1',
            }],
            childrenIds: ['win-1'],
        };
        expect(WallDataAddSchema.safeParse(ok).success).toBe(true);
    });

    // §FEAT-RAKE-CURVED (founder mandate 2026-08-19) — INVERTED. A persisted curved raked
    // wall must now LOAD, and this is the boundary where getting it wrong is worst: a
    // schema that refuses on load does not decline an edit, it makes an existing PROJECT
    // unopenable. The conical sweep is built, so the record is valid.
    it('the schema ACCEPTS a persisted raked wall that is also curved', () => {
        const curvedRaked = {
            ...legacySnapshotWall(),
            rakeAngleDeg: 80,
            curve: { control: { x: 2, y: 0, z: 1 }, segments: 16 },
        };
        const parsed = WallDataAddSchema.safeParse(curvedRaked);
        expect(parsed.success, JSON.stringify((parsed as { error?: { issues?: unknown } }).error?.issues))
            .toBe(true);
    });

    it('…and the ANGLE-RANGE refusal still bites on load — the gate did not simply go away', () => {
        // Non-vacuity for the inversion above. If the schema had stopped consulting
        // `rakeAuthorability` altogether, the test above would also pass.
        const outOfRange = { ...legacySnapshotWall(), rakeAngleDeg: 5 };
        expect(WallDataAddSchema.safeParse(outOfRange).success).toBe(false);
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
