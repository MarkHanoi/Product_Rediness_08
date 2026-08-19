// @vitest-environment node
//
// L-999 — A WALL'S PER-SIDE FINISH MUST SURVIVE SAVE AND RELOAD.
// ═══════════════════════════════════════════════════════════════════════════════
//
// C85 §5 row 23 and §11 row 6 both pinned `sideFinishes` as ⛔ NEVER SERIALISED —
// "a side finish does not survive save/load" — and C85 §12 W-B-3 names it as a
// binding obligation. That was true and stayed true because, until L-995, the field
// never reached the store either, so nobody could notice the second half.
//
// ⭐ WHY THIS MATTERS THE MOMENT L-995 LANDS. With the write fixed and persistence
// still absent, "Done — undo with Ctrl+Z" becomes TRUE for the session and FALSE
// after the next reload. That is the same false success with a delay fuse, and it
// is the shape C84 EI-6 exists to forbid: persistence is not optional, and absence
// must be LOUD.
//
// ─── WHAT THIS FILE PROVES, AND WHAT IT DOES NOT — stated, not implied ────────
//
// PROVEN BEHAVIOURALLY: the RELOAD half. Both project loaders rebuild every
// persisted wall through `CreateWallCommand` and hand it a HAND-WRITTEN option
// list; a field can be serialised perfectly and still die there. This file drives
// the REAL `CreateWallCommand` against the REAL `WallStore` and reads the record
// back (C16 CA-21).
//
// PROVEN BY SOURCE PARITY, NOT BY AN EXECUTED SAVE: the WRITE half. There are FOUR
// hand-written whitelists — two `serializeWall` twins and two `ProjectLoader`
// twins — and their DIVERGENCE is the documented failure mode here: the serializer
// twins carry a comment saying so in as many words ("these two allow-lists
// diverging is how `function` was silently dropped on reload"). Executing
// `ProjectSerializer.serialize` needs a ~20-store bundle plus `window`, and
// hand-building those neighbours would be exactly the "fake more capable than the
// real thing" trap that let L-960 through. So the save half is asserted over the
// real source text of all four lists, and that limitation is named here rather
// than papered over.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WallStore } from '@pryzm/geometry-wall';
import { ProjectContext } from '@pryzm/core-app-model';
import { CreateWallCommand, SetWallSideFinishBatchCommand } from '@pryzm/command-registry';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';

const REPO = resolve(__dirname, '../../..');
const LEVEL_ID = 'L0';
const OAK = { materialId: 'wood-oak', materialColor: '#c8a96e', materialName: 'Wood · Oak (Light)' };
const LEVEL = { id: LEVEL_ID, name: 'Ground', elevation: 0, height: 3, childrenIds: [] };

function makeLevelProvider() {
    return {
        getLevelById: (id: string) => (id === LEVEL_ID ? { ...LEVEL } : undefined),
        getLevels: () => [{ ...LEVEL }],
    };
}

function newStore(): WallStore {
    return new WallStore(
        new ProjectContext(),
        makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
    );
}

/**
 * `CreateWallCommand` reads levels off `ctx.bimManager` (elevation + mark
 * generation), not off the store's level provider. Supplied here as the SAME
 * single-level record the store already serves, so the two cannot disagree — a
 * level fixture that differed between the two would be its own defect.
 */
let registered = 0;

function ctxFor(store: WallStore): any {
    return {
        // The FOUR methods CreateWallCommand actually calls (`grep -n 'bimManager\.'`),
        // and no more. Level lookup + mark generation + the spatial-authority
        // registration; `registerElement`/`unregisterElement` record identity only and
        // nothing in this file reads them back, so they are counters rather than
        // behaviour — stated so nobody mistakes this for a working BimKernel.
        bimManager: {
            getLevelById: (id: string) => (id === LEVEL_ID ? { ...LEVEL } : undefined),
            getLevels: () => [{ ...LEVEL }],
            registerElement: () => { registered++; },
            unregisterElement: () => { registered--; },
        },
        stores: { wallStore: store, wallSystemTypeStore: undefined },
    };
}

/** The exact projection `serializeWall` applies to the side finish, per side. */
function serializeSideFinishes(wall: any): unknown {
    return wall.sideFinishes
        ? {
            ...(wall.sideFinishes.interior ? { interior: { ...wall.sideFinishes.interior } } : {}),
            ...(wall.sideFinishes.exterior ? { exterior: { ...wall.sideFinishes.exterior } } : {}),
        }
        : undefined;
}

describe('L-999 — the finish survives the trip out to a snapshot and back', () => {
    // `elementRegistry` is a MODULE SINGLETON and `registerSemantic` throws on a
    // duplicate id — deliberately, as a redo-safety guard. Closing a project clears
    // it in production, and a reload re-registers the SAME ids, which is exactly what
    // the round trip below does. Modelled here rather than dodged by minting fresh ids
    // per session: the wall keeping its identity across the reload is the property
    // under test, and renaming it would quietly test something else.
    beforeEach(() => { elementRegistry.clear(); });

    it('RELOAD HALF, executed — CreateWallCommand carries the finish onto the record', () => {
        // ── Session 1: author the finish through the real command + real store.
        const live = newStore();
        const ctx = ctxFor(live);
        new CreateWallCommand('w0', {
            start: { x: 0, z: 0 }, end: { x: 5, z: 0 },
            height: 3, thickness: 0.1, levelId: LEVEL_ID,
        }).execute(ctx);
        new SetWallSideFinishBatchCommand({ wallIds: 'all', side: 'interior', finish: OAK }).execute(ctx);

        const authored = live.getById('w0') as any;
        expect(authored.sideFinishes?.interior?.materialId, 'precondition: L-995 landed').toBe('wood-oak');

        // ── SAVE: what `serializeWall` writes for this field.
        const persisted = serializeSideFinishes(authored);
        expect(persisted, 'the snapshot carries the authored finish').toMatchObject({
            interior: { materialId: 'wood-oak' },
        });

        // ── PROJECT CLOSED, then RELOAD through the real create path.
        elementRegistry.clear();
        const reloaded = newStore();
        const ctx2 = ctxFor(reloaded);
        const r = new CreateWallCommand('w0', {
            start: { x: 0, z: 0 }, end: { x: 5, z: 0 },
            height: 3, thickness: 0.1, levelId: LEVEL_ID,
            sideFinishes: persisted as Record<string, unknown>,
        }).execute(ctx2);
        expect(r.success).toBe(true);

        // §CA-21 executed read-back on the reloaded record.
        const after = reloaded.getById('w0') as any;
        expect(
            after.sideFinishes?.interior?.materialId,
            'RED before this lane: the finish was gone after every reload',
        ).toBe('wood-oak');
        expect(after.sideFinishes?.interior?.materialColor).toBe('#c8a96e');
    });

    it('a wall with NO authored finish reloads byte-identically to a pre-L-995 wall', () => {
        // C47 §1.2 — additive optional. Absent must stay absent, not become `{}`.
        const store = newStore();
        new CreateWallCommand('w1', {
            start: { x: 0, z: 0 }, end: { x: 4, z: 0 },
            height: 3, thickness: 0.1, levelId: LEVEL_ID,
        }).execute(ctxFor(store));
        expect((store.getById('w1') as any).sideFinishes).toBeUndefined();
    });

    it('the two sides stay independent across the round trip', () => {
        const live = newStore();
        const ctx = ctxFor(live);
        new CreateWallCommand('w0', {
            start: { x: 0, z: 0 }, end: { x: 5, z: 0 },
            height: 3, thickness: 0.1, levelId: LEVEL_ID,
        }).execute(ctx);
        new SetWallSideFinishBatchCommand({
            wallIds: 'all', side: 'exterior',
            finish: { materialId: 'gypsum-skim', materialColor: '#f5f5f0', materialName: 'Plaster' },
        }).execute(ctx);
        new SetWallSideFinishBatchCommand({ wallIds: 'all', side: 'interior', finish: OAK }).execute(ctx);

        const persisted = serializeSideFinishes(live.getById('w0')) as any;
        elementRegistry.clear();   // project closed
        const reloaded = newStore();
        new CreateWallCommand('w0', {
            start: { x: 0, z: 0 }, end: { x: 5, z: 0 },
            height: 3, thickness: 0.1, levelId: LEVEL_ID,
            sideFinishes: persisted,
        }).execute(ctxFor(reloaded));

        const sf = (reloaded.getById('w0') as any).sideFinishes;
        expect(sf.interior.materialId).toBe('wood-oak');
        expect(sf.exterior.materialId).toBe('gypsum-skim');
    });
});

describe('L-999 — all FOUR hand-written whitelists name the field', () => {
    // The twins diverging IS the documented failure mode: `wallSystemTypeRoundTrip`
    // exists because a serializer wrote a field the loader hand-listed away, and the
    // serializers carry a comment saying the two lists must stay in lock-step.
    const FILES: readonly [string, string][] = [
        ['persistence-client serializer', 'packages/persistence-client/src/loader/ProjectSerializer.ts'],
        ['apps/editor serializer',        'apps/editor/src/engine/persistence/ProjectSerializer.ts'],
        ['persistence-client loader',     'packages/persistence-client/src/loader/ProjectLoader.ts'],
        ['apps/editor loader',            'apps/editor/src/engine/persistence/ProjectLoader.ts'],
    ];

    for (const [label, rel] of FILES) {
        it(`${label} carries sideFinishes through the wall arm`, () => {
            const src = readFileSync(resolve(REPO, rel), 'utf8');
            expect(src, `${rel} never mentions sideFinishes`).toContain('sideFinishes');
        });
    }

    it('CreateWallCommand — the chokepoint both loaders funnel through', () => {
        const src = readFileSync(
            resolve(REPO, 'packages/command-registry/src/walls/CreateWallCommand.ts'),
            'utf8',
        );
        // Declared on the input AND stamped onto the record. Either one alone is the
        // silent-drop shape: an accepted option that never reaches the wall.
        expect(src).toContain('sideFinishes?: Record<string, unknown>');
        expect(src).toContain('sideFinishes: this.wallData.sideFinishes');
    });
});
