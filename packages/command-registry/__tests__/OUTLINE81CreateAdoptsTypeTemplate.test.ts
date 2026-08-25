// §OUTLINE81 (SPEC-WINDOW-CUSTOM-OUTLINE D6) — CREATION ADOPTION THROUGH THE COMMIT CHOKEPOINT.
//
// `CreateWallOpeningCommand` is the C15 §8.1 dual-write: the wall's `openings[]` row AND the
// standalone `windowStore` record must BOTH carry the adopted shape, or the frame and the void
// diverge at birth (C86 §11 #1). The undo half is spec §5.5: undoing the creation removes the
// window from BOTH stores.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { wallStore } from '@pryzm/geometry-wall';
import { openingOutlinePreset } from '@pryzm/geometry-wall/opening-profile';
import { windowStore, windowSystemTypeStore } from '@pryzm/geometry-window';
import type { WindowSystemType } from '@pryzm/geometry-window';
import { CreateWallOpeningCommand } from '../src/walls/CreateWallOpeningCommand';

const WALL_ID = 'wall-o81-create';
const TRIANGLE = openingOutlinePreset('triangle');
const RINGED_TYPE_ID = 'wt-o81-create-ringed';

const LEVEL = { id: 'level-0', name: 'Level 0', elevation: 0, height: 3 };
const bimKernel: any = {
    getLevels: () => [LEVEL],
    getLevelById: (id: string) => (id === LEVEL.id ? LEVEL : undefined),
    registerElement: () => {},
    unregisterElement: () => {},
};

function ctx(): any {
    return { stores: { wallStore }, bimManager: bimKernel };
}

beforeEach(() => {
    wallStore.attachEngine({} as never, bimKernel);
    wallStore.clear?.();
    windowStore.clear?.();
    if (!windowSystemTypeStore.has(RINGED_TYPE_ID)) {
        windowSystemTypeStore.add({
            id: RINGED_TYPE_ID,
            name: 'O81 Ringed',
            category: 'custom',
            isBuiltIn: false,
            frameFinish: { name: 'Frame', materialColor: '#e8e8e8' },
            sillFinish:  { name: 'Sill',  materialColor: '#dddddd' },
            glazingOpacity: 0.3,
            customOutline: { vertices: TRIANGLE.vertices.map(v => ({ ...v })) },
            metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'test', version: 1 },
        } as WindowSystemType);
    }
    wallStore.add({
        id: WALL_ID,
        type: 'wall',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
        height: 3,
        thickness: 0.3,
        levelId: 'level-0',
    } as never);
});

afterEach(() => {
    windowSystemTypeStore.remove(RINGED_TYPE_ID);
});

function createWindow(extra: Record<string, unknown> = {}) {
    return new CreateWallOpeningCommand({
        wallId: WALL_ID,
        openingData: {
            type: 'window',
            offset: 2,
            width: 1.2,
            height: 1.4,
            sillHeight: 0.9,
            systemTypeId: RINGED_TYPE_ID,
            ...extra,
        },
    } as never);
}

function wallOpening(elementId: string): any {
    return wallStore.getById(WALL_ID)?.openings?.find((o: any) => o.elementId === elementId);
}

describe('D6 — creation adoption at the C15 §8.1 dual write', () => {
    it('⭐ a window created on a ringed type adopts custom + the ring on BOTH stores', () => {
        const cmd = createWindow();
        const res = cmd.execute(ctx());
        expect(res.success).toBe(true);
        const id = res.affectedElementIds[0]!;

        // The wall's own opening row — the record the geometry arms consume.
        expect(wallOpening(id)?.openingProfile).toBe('custom');
        expect(wallOpening(id)?.customOutline?.vertices?.length).toBe(3);
        // The standalone record — what the plan symbol and panel read.
        expect(windowStore.getById(id)?.openingProfile).toBe('custom');
        expect(windowStore.getById(id)?.customOutline?.vertices?.length).toBe(3);
    });

    it('the copy is OWNED: editing the type template afterwards reaches no placed window', () => {
        const res = createWindow().execute(ctx());
        const id = res.affectedElementIds[0]!;
        windowSystemTypeStore.update(RINGED_TYPE_ID, {
            customOutline: { vertices: [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 1 }, { u: 0, v: 1 }] },
        } as Partial<WindowSystemType>);
        expect(windowStore.getById(id)?.customOutline?.vertices?.length).toBe(3);
        expect(wallOpening(id)?.customOutline?.vertices?.length).toBe(3);
    });

    it('an EXPLICIT profile in openingData wins over the template — the caller decided', () => {
        const res = createWindow({ openingProfile: 'rectangular' }).execute(ctx());
        const id = res.affectedElementIds[0]!;
        expect(wallOpening(id)?.openingProfile).toBe('rectangular');
        expect(windowStore.getById(id)?.customOutline).toBeUndefined();
    });

    it('⭐ UNDO removes the window from BOTH stores (spec §5.5)', () => {
        const cmd = createWindow();
        const res = cmd.execute(ctx());
        const id = res.affectedElementIds[0]!;
        expect(cmd.undo(ctx()).success).toBe(true);
        expect(wallOpening(id)).toBeUndefined();
        expect(windowStore.getById(id)).toBeUndefined();
    });
});
