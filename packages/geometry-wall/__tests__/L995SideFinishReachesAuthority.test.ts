/**
 * L-995 — THE CHAT SAYS "Done" AND THE AUTHORITY NEVER RECEIVES THE FINISH.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Founder-reported 2026-08-18, the SECOND sighting of the L-960 sentence:
 *
 *   "make all inner finishes walls on the ground floor to wood"
 *   → "Set the interior finish of all 17 walls on Ground to Wood · Oak (Light).
 *      Done — undo with Ctrl+Z."   …and nothing changed in the viewport.
 *
 * L-960 fixed the RENDER leg (§L960-WHOLE-BODY-FINISH) and the finish-NAME leg
 * (§L960-WOOD-IS-A-SURFACE), and proved both. It did NOT prove the WRITE leg —
 * `L960SideFinishDisclosure.test.ts` drives a hand-written store fake whose
 * `updateWall(next) { map.set(next.id, structuredClone(next)) }` accepts every
 * field it is handed. The REAL `WallStore.updateWall()` does not: it projects the
 * snapshot onto a 12-field editable whitelist and DROPS everything else.
 *
 * ⭐ A fake more capable than the real thing cannot falsify the real thing. This
 * file drives the REAL `SetWallSideFinishBatchCommand` against the REAL
 * `@pryzm/geometry-wall` `WallStore` — the named authority for the wall family
 * (C85 §2) — and reads the record back (C16 CA-21), because the command's
 * `{ success: true }` is exactly the value that lied.
 */

import { describe, it, expect } from 'vitest';
import { WallStore } from '../src/WallStore';
import { ProjectContext } from '@pryzm/core-app-model';
import { SetWallSideFinishBatchCommand } from '@pryzm/command-registry';
import { resolveWholeBodyFinishColor } from '../src/WallSideFinishResolver';
import type { WallData } from '../src/WallTypes';

const LEVEL_ID = 'L0';
const OAK = { materialId: 'wood-oak', materialColor: '#c8a96e', materialName: 'Wood · Oak (Light)' };

function makeLevelProvider() {
    const level = { id: LEVEL_ID, name: 'Ground', elevation: 0, height: 3, childrenIds: [] };
    return {
        getLevelById: (id: string) => (id === LEVEL_ID ? { ...level } : undefined),
        getLevels: () => [{ ...level }],
    };
}

function newStore(): WallStore {
    return new WallStore(
        new ProjectContext(),
        makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
    );
}

let _seq = 0;
/** The founder's wall: "Plain Wall", ONE structure layer, 100 mm. */
function plainWall(id: string, x0 = 0, x1 = 5): WallData {
    const now = 1_700_000_000_000 + (++_seq);
    return {
        id, type: 'wall', levelId: LEVEL_ID, properties: {}, childrenIds: [],
        baseLine: [{ x: x0, y: 0, z: 0 }, { x: x1, y: 0, z: 0 }],
        height: 3, thickness: 0.1, baseOffset: 0, openings: [],
        layers: [{ name: 'Layer 1', thickness: 0.1, function: 'structure' }],
        metadata: { createdAt: now, modifiedAt: now, createdBy: 'test', version: 1 },
    } as unknown as WallData;
}

function ctxFor(store: WallStore): any {
    return { stores: { wallStore: store } };
}

describe('L-995 — the interior finish must land in the AUTHORITY, not be reported into a void', () => {
    it('THE FOUNDER\u2019S SENTENCE — the wall record carries the finish after the command says success', () => {
        const store = newStore();
        store.add(plainWall('w0'));
        const ctx = ctxFor(store);

        const cmd = new SetWallSideFinishBatchCommand({ wallIds: 'all', side: 'interior', finish: OAK });
        expect(cmd.canExecute(ctx).ok).toBe(true);
        const r = cmd.execute(ctx);

        // What the chat believed.
        expect(r.success).toBe(true);
        expect(r.affectedElementIds).toEqual(['w0']);

        // §CA-21 EXECUTED READ-BACK — what the model actually holds.
        const after = store.getById('w0') as WallData & { sideFinishes?: any };
        expect(
            after?.sideFinishes?.interior?.materialId,
            'the AUTHORITY must hold the finish the command reported writing',
        ).toBe('wood-oak');
    });

    it('the RENDER leg reads it off the authority record — colour, not just a field', () => {
        const store = newStore();
        store.add(plainWall('w0'));
        new SetWallSideFinishBatchCommand({ wallIds: 'all', side: 'interior', finish: OAK })
            .execute(ctxFor(store));

        const after = store.getById('w0') as never;
        expect(
            resolveWholeBodyFinishColor(after),
            'the colour authority for every PLAIN arm must see the finish on the stored record',
        ).toBe('#c8a96e');
    });

    it('undo restores the previous finish through restoreSnapshot()', () => {
        const store = newStore();
        store.add(plainWall('w0'));
        const ctx = ctxFor(store);

        const first = new SetWallSideFinishBatchCommand({
            wallIds: 'all', side: 'interior',
            finish: { materialId: 'gypsum-skim', materialColor: '#f5f5f0', materialName: 'Plaster' },
        });
        first.execute(ctx);

        const second = new SetWallSideFinishBatchCommand({ wallIds: 'all', side: 'interior', finish: OAK });
        second.execute(ctx);
        expect((store.getById('w0') as any)?.sideFinishes?.interior?.materialId).toBe('wood-oak');

        second.undo(ctx);
        expect(
            (store.getById('w0') as any)?.sideFinishes?.interior?.materialId,
            'Ctrl+Z must put the PREVIOUS finish back, not leave the new one standing',
        ).toBe('gypsum-skim');
    });

    it('the untouched side survives a write to the other one', () => {
        const store = newStore();
        store.add(plainWall('w0'));
        const ctx = ctxFor(store);

        new SetWallSideFinishBatchCommand({
            wallIds: 'all', side: 'exterior',
            finish: { materialId: 'gypsum-skim', materialColor: '#f5f5f0', materialName: 'Plaster' },
        }).execute(ctx);
        new SetWallSideFinishBatchCommand({ wallIds: 'all', side: 'interior', finish: OAK }).execute(ctx);

        const sf = (store.getById('w0') as any)?.sideFinishes;
        expect(sf?.interior?.materialId).toBe('wood-oak');
        expect(sf?.exterior?.materialId, 'the other side is copied BY VALUE, never collapsed').toBe('gypsum-skim');
    });
});
