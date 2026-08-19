/**
 * §SLAB-ASSEMBLY-SURVIVES-RELOAD (L-1178) — the slab's build-up and its HEIGHT were
 * written to the saved file and thrown away on the way back in.
 *
 * ── PROVENANCE ────────────────────────────────────────────────────────────────
 * L-1127 (lane MT2 / C100 ARM E) found that `serializeSlab()` wrote `materialId`
 * and `materialColor` while `CreateSlabCommand`'s payload listed neither, so a
 * reloaded slab lost its material. That was fixed. In fixing it, the author
 * measured FOUR MORE fields with the same shape and wrote them down rather than
 * guessing at them inside a material commit:
 *
 *   "⚠ MEASURED WHILE FIXING THIS, NOT FIXED HERE, and named so it is not mistaken
 *    for covered: `serializeSlab()` also writes `systemTypeId`, `layers`,
 *    `baseOffset` and `properties` … Those four are lost on reload too — a slab's
 *    whole ASSEMBLY, not just its colour."
 *
 * This is that fix, and this is its proof.
 *
 * ── WHY `baseOffset` MAKES THIS A DISPLACEMENT BUG, NOT A METADATA BUG ────────
 * ⭐ C92 §10: the slab datum is the TOP face, and the top face sits at
 * `level.elevation + baseOffset`. So a dropped `baseOffset` does not merely lose a
 * number — IT MOVES THE SLAB, by exactly the offset, on every reopen.
 *
 * That is the SAME SENTENCE the founder used for L-1177 ("the slab is displaced —
 * it moves"), arriving by a completely different route. L-1177 is a LIVE-EDIT
 * defect (a selection constraint overwriting the builder's Y); this is a
 * PERSISTENCE defect (the value never reaching the builder at all). They are
 * independent, they were found separately, and fixing either one alone would have
 * left the founder still able to say the slab moved.
 *
 * ── WHERE THIS ASSERTS, AND WHY NOT FURTHER OUT ───────────────────────────────
 * §COMMITTED-IS-NOT-REACHABLE: the evidence a reviewer reaches for — open the JSON,
 * find the field — SAYS IT WORKED. The file was never the problem. So this asserts
 * on the STORE RECORD the command produces, which is what the builder reads and
 * therefore what the user sees. It does not assert on the payload it just passed
 * in, which would only prove the test can construct an object.
 */
import { describe, it, expect } from 'vitest';
import { CreateSlabCommand } from '../src/slabs/CreateSlabCommand';

/** The record `serializeSlab()` writes (ProjectSerializer.ts:639-654), trimmed. */
const SAVED_SLAB = {
    id: 'slab-parcel-1',
    levelId: 'L0',
    width: 12, depth: 8, thickness: 0.35,
    position: { x: 0, y: 0, z: 0 },
    polygon: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 0, y: 8 }],
    // ⭐ the founder's "bottom offset" — C92 §10's datum offset.
    baseOffset: 1.25,
    materialId: 'mat-concrete-c30',
    materialColor: '#b8b8b8',
    systemTypeId: 'slab-type-generic-350',
    layers: [
        { name: 'Screed', thickness: 0.05, function: 'finish', materialColor: '#d0d0d0' },
        { name: 'Structure', thickness: 0.30, function: 'structure', materialColor: '#909090' },
    ],
    properties: { mark: 'SB007', comment: 'podium deck' },
    ifcData: { guid: 'guid-parcel-1', ifcClass: 'IfcSlab' },
};

/** Minimal CommandContext — only what CreateSlabCommand.execute() actually touches. */
function makeContext() {
    const added: any[] = [];
    return {
        added,
        ctx: {
            projectContext: { activeLevelId: 'L0' },
            bimManager: {
                getLevelById: (id: string) => ({ id, elevation: 0 }),
                registerElement: () => {},
                unregisterElement: () => {},
            },
            stores: {
                slabStore: {
                    add: (d: any) => { added.push(d); },
                    getAll: () => added,
                    getById: (id: string) => added.find(a => a.id === id),
                    remove: () => {},
                },
                openingStore: { getAll: () => [], add: () => {}, remove: () => {} },
                stairStore: { getAll: () => [] },
            },
        } as any,
    };
}

/** Exactly the payload `ProjectLoader` builds for each saved slab. */
function loaderPayload(slab: typeof SAVED_SLAB) {
    return {
        id: slab.id,
        ifcGuid: slab.ifcData?.guid,
        width: slab.width,
        depth: slab.depth,
        thickness: slab.thickness,
        position: slab.position,
        levelId: slab.levelId,
        polygon: slab.polygon,
        materialId: slab.materialId,
        materialColor: slab.materialColor,
        baseOffset: slab.baseOffset,
        layers: slab.layers,
        systemTypeId: slab.systemTypeId,
        properties: slab.properties,
    } as any;
}

describe('SLAB-ASSEMBLY-SURVIVES-RELOAD (L-1178) — a reloaded slab keeps its height and its build-up', () => {
    it('⭐ baseOffset survives — the slab reloads at the height it was saved at, not at 0', () => {
        const { ctx, added } = makeContext();
        new CreateSlabCommand(loaderPayload(SAVED_SLAB)).execute(ctx);

        expect(added).toHaveLength(1);
        // C92 §10 — the top face sits at `level.elevation + baseOffset`. A dropped
        // baseOffset defaults to 0 and moves the slab down by 1.25 m on reopen.
        expect(added[0].baseOffset).toBe(1.25);
    });

    it('the ASSEMBLY survives — layers and the system type that identifies them', () => {
        const { ctx, added } = makeContext();
        new CreateSlabCommand(loaderPayload(SAVED_SLAB)).execute(ctx);

        expect(added[0].systemTypeId).toBe('slab-type-generic-350');
        expect(added[0].layers).toHaveLength(2);
        expect(added[0].layers[0]).toMatchObject({ name: 'Screed', thickness: 0.05 });
        expect(added[0].layers[1]).toMatchObject({ name: 'Structure', thickness: 0.30 });
        // Cloned, not aliased — the store must not share the caller's array.
        expect(added[0].layers).not.toBe(SAVED_SLAB.layers);
        expect(added[0].layers[0]).not.toBe(SAVED_SLAB.layers[0]);
    });

    it('the saved MARK wins over a freshly minted one — the schedule must not renumber on reopen', () => {
        const { ctx, added } = makeContext();
        new CreateSlabCommand(loaderPayload(SAVED_SLAB)).execute(ctx);

        expect(added[0].properties.mark).toBe('SB007');
        // …and the rest of the persisted properties come with it.
        expect(added[0].properties.comment).toBe('podium deck');
    });

    it('a slab that never had these fields is UNCHANGED — every existing caller still works', () => {
        const { ctx, added } = makeContext();
        new CreateSlabCommand({
            id: 'slab-plain', width: 4, depth: 4, thickness: 0.2,
            position: { x: 0, y: 0, z: 0 }, levelId: 'L0',
        } as any).execute(ctx);

        expect(added[0].baseOffset).toBeUndefined();
        expect(added[0].layers).toBeUndefined();
        expect(added[0].systemTypeId).toBeUndefined();
        // The stable-mark fallback still fires for a slab that never carried one.
        expect(typeof added[0].properties.mark).toBe('string');
        expect(added[0].properties.mark).toMatch(/^SB\d{3}$/);
        // C100 §2.1 — the grey default is still the default (L-1127's behaviour).
        expect(added[0].materialColor).toBe('#808080');
    });
});
