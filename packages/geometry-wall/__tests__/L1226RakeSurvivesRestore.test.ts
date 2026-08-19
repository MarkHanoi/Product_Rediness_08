// §FIX-RAKE-RESTORE-PROJECTIONS (L-1226) — a wall's LEAN must survive every door into
// the store, and must be RESTORABLE by the two snapshot projections.
//
// ─── WHAT THIS FILE IS, AND WHAT IT DELIBERATELY IS NOT ──────────────────────────
//
// The founder's report was *"raked walls don't survive the save-project and open cycle
// — they go back to non-raked."* THE PERSISTENCE HALF OF THAT IS NOT THIS FILE'S
// SUBJECT and is not claimed here: it was `ImportProjectCommand` — the DEFAULT-ON
// restore path — never passing `rakeAngleDeg` to `CreateWallCommand`, and it is lane
// PERSIST1's fix (§PERSIST-DEFAULT-PATH). Overreaching into it here would produce a
// test that passes because someone else's file is correct.
//
// What IS this file's subject is the defect that was found on the way, lives in
// `WallStore.ts`, and had been sitting PINNED-AS-UNFIXED since the profile slice
// (`WallProfileNonRegressionBaseline.test.ts` §B1a): the store's TWO snapshot-restore
// projections — `updateWall()` and `restoreSnapshot()` — did not name `rakeAngleDeg`.
//
// ⭐ THE MECHANISM, BECAUSE IT IS NOT THE OBVIOUS ONE. Both projections build a
// `Partial<WallData>` literal and hand it to `update()`, which merges
// `{...wall, ...safeUpdates}`. A key that is NAMED with value `undefined` CLEARS the
// field; a key that is ABSENT leaves whatever is on the record standing. So the
// omission never DESTROYED a rake — it made one **immovable by any snapshot restore**.
// Undo returned `{ success: true }` over a wall it had only half restored. That is C84
// EI-7a (WRITES ⊋ RESTORES), the identical clause L-995 was raised under for
// `sideFinishes`, one field earlier in the same literal.
//
// ─── REAL, NOT FAKED ─────────────────────────────────────────────────────────────
//
// Every assertion below drives the REAL `WallStore` class from `../src/WallStore` and
// reads the record back through the real `getById()`. There is no store fake, because
// L-995's defect survived a whole slice behind a fake whose `updateWall` accepted every
// field it was handed — a fake strictly MORE capable than the real store cannot falsify
// the real store (`fake-more-capable-than-real`). The only stub is the level provider,
// which answers "does level L0 exist"; it is not on any path under test.

import { describe, it, expect, beforeEach } from 'vitest';
import { WallStore } from '../src/WallStore';
import { RAKE_VERTICAL_DEG, resolveRakeDeg, rakeAuthorability } from '../src/WallRake';
import type { WallData, Opening } from '../src/WallTypes';

const LEVEL = 'L0';

function levelProvider() {
    const level = { id: LEVEL, name: 'Ground', elevation: 0, height: 3, childrenIds: [] as string[] };
    return {
        getLevelById: (id: string) => (id === LEVEL ? { ...level } : undefined),
        getLevels: () => [{ ...level }],
    };
}

function makeStore(): WallStore {
    return new WallStore(
        undefined as unknown as ConstructorParameters<typeof WallStore>[0],
        levelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
    );
}

let seq = 0;
function wallRecord(id: string, extra: Partial<WallData> = {}): WallData {
    return {
        id,
        type: 'wall',
        levelId: LEVEL,
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
        height: 3,
        thickness: 0.2,
        baseOffset: 0,
        openings: [],
        childrenIds: [],
        properties: {},
        metadata: { createdAt: ++seq, modifiedAt: seq, createdBy: 'test', version: 1 },
        ...extra,
    } as unknown as WallData;
}

const WINDOW = (id: string, elementId: string): Opening => ({
    id, elementId, type: 'window', offset: 2, width: 1.2, height: 1.4, sillHeight: 0.9,
});

/** Three layers, the shape `CreateWallCommand` stamps from a system type. */
const LAYERS = [
    { name: 'Board A', function: 'finish-interior', thickness: 0.0125, materialColor: '#eeeeee' },
    { name: 'Studs',   function: 'structure',       thickness: 0.075,  materialColor: '#c8a165' },
    { name: 'Board B', function: 'finish-exterior', thickness: 0.0125, materialColor: '#eeeeee' },
] as unknown as WallData['layers'];

describe('§FIX-RAKE-RESTORE-PROJECTIONS (L-1226) — the two snapshot projections', () => {
    let store: WallStore;
    beforeEach(() => { store = makeStore(); });

    // ── THE DEFECT, STATED AS THE THING A USER DOES ─────────────────────────────
    //
    // Draw a wall. Lean it. Ctrl+Z. Before this fix the wall stayed leaning, because
    // `restoreSnapshot` never named the field and the merge therefore left it standing.
    it('restoreSnapshot puts a wall back to VERTICAL when the snapshot was vertical', () => {
        store.add(wallRecord('w-1'));
        const snapshot = store.getById('w-1')!;           // vertical: no rakeAngleDeg
        expect(snapshot.rakeAngleDeg).toBeUndefined();

        store.update('w-1', { rakeAngleDeg: 75 } as Partial<WallData>);
        expect(store.getById('w-1')!.rakeAngleDeg).toBe(75);

        store.restoreSnapshot(snapshot);

        const after = store.getById('w-1')!;
        expect(after.rakeAngleDeg).toBeUndefined();
        // …and the derived answer the geometry actually consumes agrees. Asserting only
        // the raw field would leave "absent" and "90" looking like different states.
        expect(resolveRakeDeg(after.rakeAngleDeg)).toBe(RAKE_VERTICAL_DEG);
    });

    // The other direction, and the one that makes the first non-vacuous: restoring a
    // RAKED snapshot over a wall that has since been straightened must bring the lean
    // back. A projection that simply refused to touch the field would pass the test
    // above and fail this one.
    it('restoreSnapshot puts the LEAN back when the snapshot was raked', () => {
        store.add(wallRecord('w-2', { rakeAngleDeg: 75 } as Partial<WallData>));
        const snapshot = store.getById('w-2')!;
        expect(snapshot.rakeAngleDeg).toBe(75);

        store.update('w-2', { rakeAngleDeg: RAKE_VERTICAL_DEG } as Partial<WallData>);
        expect(store.getById('w-2')!.rakeAngleDeg).toBe(RAKE_VERTICAL_DEG);

        store.restoreSnapshot(snapshot);
        expect(store.getById('w-2')!.rakeAngleDeg).toBe(75);
    });

    // `updateWall` is the FORWARD projection of the same pair. L-995 proved that
    // carrying a field on one and not the other is a defect with a longer fuse, so both
    // are driven here rather than one being taken as evidence for the other.
    it('updateWall carries the lean forward, in both directions', () => {
        store.add(wallRecord('w-3'));
        const raked = { ...store.getById('w-3')!, rakeAngleDeg: 68 } as WallData;
        store.updateWall(raked);
        expect(store.getById('w-3')!.rakeAngleDeg).toBe(68);

        const straightened = { ...store.getById('w-3')!, rakeAngleDeg: undefined } as WallData;
        store.updateWall(straightened);
        expect(store.getById('w-3')!.rakeAngleDeg).toBeUndefined();
    });

    // A wall that never had a lean must come back VERTICAL through both projections —
    // the additive guarantee (C47 §1.2): absent in ⇒ vertical out, never `90` or any
    // other angle materialising on a wall nobody leaned.
    //
    // ⚠ AND THE PRECISE FORM OF THAT GUARANTEE, MEASURED RATHER THAN ASSUMED. Naming the
    // key in a projection means the merged record afterwards HAS the property with value
    // `undefined` — `'rakeAngleDeg' in wall` is TRUE where before it was false. The first
    // draft of this test asserted `false` and went red for exactly that reason.
    //
    // That is not a regression, and it is worth saying why rather than relaxing the
    // assertion silently: the property is `undefined`, `resolveRakeDeg(undefined)` is 90°,
    // and `JSON.stringify` omits `undefined` values — so the SERIALISED snapshot is
    // byte-identical to a pre-rake one and no reader can tell the difference. It is the
    // same shape `wallProfile` and `sideFinishes` already have in these literals.
    it('a wall that was never raked comes back VERTICAL through both projections', () => {
        store.add(wallRecord('w-4'));
        const snapshot = store.getById('w-4')!;
        store.update('w-4', { height: 3.4 } as Partial<WallData>);
        store.restoreSnapshot(snapshot);
        expect(store.getById('w-4')!.rakeAngleDeg).toBeUndefined();
        expect(resolveRakeDeg(store.getById('w-4')!.rakeAngleDeg)).toBe(RAKE_VERTICAL_DEG);

        store.updateWall(store.getById('w-4')!);
        expect(store.getById('w-4')!.rakeAngleDeg).toBeUndefined();

        // The claim that makes the `in`-check irrelevant: nothing reaches a project file.
        expect(JSON.parse(JSON.stringify(store.getById('w-4')!)))
            .not.toHaveProperty('rakeAngleDeg');
    });
});

// ─── THE FALSIFIED HYPOTHESIS, PINNED SO IT IS NOT RE-RAISED ────────────────────
//
// The investigation opened on a strong, explicit hypothesis: that a raked wall which
// also hosts OPENINGS (the founder's building is full of windows) is REFUSED by
// `rakeAuthorability`, so authoring succeeded through a path that skipped the schema
// while LOAD re-validated and refused. If that were true, "raked walls persist" would
// never have been SATISFIABLE for any wall with a window, and the bug would not be in
// persistence at all — a different fix entirely.
//
// ⭐ IT IS FALSE, AND IT IS FALSE BY MEASUREMENT, NOT BY READING THE COMMENTS.
// §RAKE-HOSTED-OPENING (2026-08-18) lifted the `hosted-openings` arm and L-1064
// (2026-08-19) lifted the `layered` arm, so today the exact combination in the
// founder's model — raked × layered × hosting a window — is fully authorable, through
// the store's real `add()` and real `addOpening()` gates.
//
// So there is NO write/read asymmetry in the authorability rule and the rule does NOT
// over-refuse. That is the answer to "how did the founder author a state the schema
// forbids?": the schema does not forbid it. These assertions exist so that a future
// reader who finds the founder's report and re-derives the same hypothesis meets a
// measurement instead of re-running the investigation.
describe('§WALL-RAKE — rake × openings × layers is AUTHORABLE (hypothesis falsified)', () => {
    let store: WallStore;
    beforeEach(() => { store = makeStore(); });

    it('the pure gate says OK for raked + layered + hosting a window', () => {
        const auth = rakeAuthorability({
            rakeAngleDeg: 75,
            layers: LAYERS as unknown as unknown[],
            openings: [WINDOW('op-1', 'win-1')],
        } as Parameters<typeof rakeAuthorability>[0]);
        expect(auth.ok, auth.ok ? '' : auth.reason).toBe(true);
    });

    it('the STORE accepts it too — add() with a lean, then addOpening() a window', () => {
        // The load path's own order: the wall arrives raked and layered, and its
        // openings are replayed onto it afterwards. Both doors run the gate.
        store.add(wallRecord('w-5', {
            rakeAngleDeg: 75,
            layers: LAYERS,
            systemTypeId: 'wt-interior-partition',
        } as Partial<WallData>));
        expect(store.getById('w-5')!.rakeAngleDeg).toBe(75);

        store.addOpening('w-5', WINDOW('op-5', 'win-5'));

        const after = store.getById('w-5')!;
        expect(after.openings?.length).toBe(1);
        expect(after.rakeAngleDeg, 'hosting a window must not straighten the wall').toBe(75);
    });

    // The gate did not simply stop working: an out-of-range angle is still refused, so
    // the two lifts above narrowed the rule rather than deleting it.
    it('…and the ANGLE-RANGE refusal still bites, so the gate is not merely absent', () => {
        expect(() => store.add(wallRecord('w-6', { rakeAngleDeg: 5 } as Partial<WallData>)))
            .toThrow(/rakeAngleDeg/);
    });
});
