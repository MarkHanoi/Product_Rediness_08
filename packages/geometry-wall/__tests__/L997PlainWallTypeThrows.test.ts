/**
 * L-997 — CHANGING A WALL'S TYPE TO "Plain Wall" THROWS INSIDE THE STORE.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Founder-reported on the live deploy 2026-08-18. Selected a wall, chose type
 * "Plain Wall", nothing changed, and the console said — twice, on two attempts
 * against the same wall:
 *
 *   [CommandManager] FATAL ERROR DURING EXECUTION
 *   WallSchemaError: [WallStore.update] Schema validation failed for wall … :
 *     layers: Invalid input
 *   Caused by: ZodError: [{ "expected": "array", "code": "invalid_type",
 *                           "path": ["layers"] }]
 *     at WallStore._updateImpl → WallStore.update → WallStore.updateWall
 *     → UpdateWallSystemTypeCommand.execute → CommandManagerImpl.execute
 *
 * `expected: "array"` with `invalid_type` is Zod saying the value was PRESENT and
 * of the wrong type — not absent. `WallDataUpdateSchema` declares
 * `layers: z.array(WallLayerSchema).optional()`, which accepts an array or
 * `undefined` and rejects `null`. A wall type with no layer stack reaches the
 * command as `layers: null` (`PropertyPanelTypeSelector.ts:88` — `payload.layers
 * ?? null`), and `UpdateWallSystemTypeCommand.execute()` forwarded it verbatim
 * with its own `?? null`.
 *
 * ⛔ NOT a malformed type-library entry — asserted below by driving a LAYERED type
 * through the same command, which always worked. The defect is the "clear the
 * stack" spelling, and it therefore breaks EVERY type that carries no layers.
 *
 * This file drives the REAL command against the REAL `WallStore`, because the
 * defect IS the real store's Zod gate: a fake that skips validation hides it
 * completely.
 */

import { describe, it, expect } from 'vitest';
import { WallStore } from '../src/WallStore';
import { ProjectContext } from '@pryzm/core-app-model';
import { UpdateWallSystemTypeCommand } from '@pryzm/command-registry';
import type { WallData } from '../src/WallTypes';

const LEVEL_ID = 'L0';

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
/** A LAYERED wall — the state the founder's wall was in before he re-typed it. */
function layeredWall(id: string): WallData {
    const now = 1_700_000_000_000 + (++_seq);
    return {
        id, type: 'wall', levelId: LEVEL_ID, properties: {}, childrenIds: [],
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
        height: 3, thickness: 0.3, baseOffset: 0, openings: [],
        systemTypeId: 'wt-layered',
        layers: [
            { name: 'render-ext', thickness: 0.02, function: 'finish-exterior' },
            { name: 'core',       thickness: 0.26, function: 'structure' },
            { name: 'render-int', thickness: 0.02, function: 'finish-interior' },
        ],
        metadata: { createdAt: now, modifiedAt: now, createdBy: 'test', version: 1 },
    } as unknown as WallData;
}

function ctxFor(store: WallStore): any {
    return { stores: { wallStore: store } };
}

describe('L-997 — "Plain Wall" is a wall type, not a crash', () => {
    it("THE FOUNDER'S GESTURE — a type with no layer stack does not throw, and clears the stack", () => {
        const store = newStore();
        store.add(layeredWall('w0'));
        const ctx = ctxFor(store);

        // Exactly what `element.changeType` forwards for a type carrying no layers.
        const cmd = new UpdateWallSystemTypeCommand({
            wallId: 'w0',
            systemTypeId: 'wt-monolithic',
            layers: null,
            thickness: 0.1,
        });

        expect(cmd.canExecute(ctx).ok).toBe(true);
        // RED before the fix: WallSchemaError — `layers: Invalid input`.
        expect(() => cmd.execute(ctx)).not.toThrow();

        // §CA-21 executed read-back — the type actually changed.
        const after = store.getById('w0') as WallData & { systemTypeId?: string };
        expect(after.systemTypeId).toBe('wt-monolithic');
        expect(after.layers, 'choosing a plain type CLEARS the stack').toBeUndefined();
        expect(after.thickness).toBe(0.1);
    });

    it('the LAYERED type through the same command still works — the library is not the defect', () => {
        // Measured rather than assumed: if a layered re-type had also thrown, the
        // fault would be in the seeded type library and this fix would be wrong.
        const store = newStore();
        store.add(layeredWall('w0'));
        const ctx = ctxFor(store);

        const cmd = new UpdateWallSystemTypeCommand({
            wallId: 'w0',
            systemTypeId: 'wt-other-layered',
            layers: [
                { name: 'skin', thickness: 0.05, function: 'finish-exterior' },
                { name: 'core', thickness: 0.15, function: 'structure' },
            ],
            thickness: 0.2,
        });
        expect(() => cmd.execute(ctx)).not.toThrow();
        const after = store.getById('w0') as WallData;
        expect(after.layers).toHaveLength(2);
    });

    it('undo puts the original layer stack back', () => {
        const store = newStore();
        store.add(layeredWall('w0'));
        const ctx = ctxFor(store);

        const cmd = new UpdateWallSystemTypeCommand({
            wallId: 'w0', systemTypeId: 'wt-monolithic', layers: null, thickness: 0.1,
        });
        cmd.execute(ctx);
        cmd.undo(ctx);

        const after = store.getById('w0') as WallData;
        expect(after.layers, 'Ctrl+Z restores the three-layer stack').toHaveLength(3);
        expect(after.thickness).toBe(0.3);
    });
});
