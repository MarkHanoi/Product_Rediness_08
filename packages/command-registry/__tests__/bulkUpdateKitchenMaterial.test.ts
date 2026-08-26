// §RACKITCHEN127 — bulk kitchen carcass/door-front/countertop material batch.
//
// Pins the same contract points as the wall batch commands it mirrors
// (UpdateWallsSystemTypeBatchCommand / UpdateWallsColorBatchCommand):
//   1. SCOPE: a single element, a level (and no others), or the whole project.
//   2. ONE undo entry restores every touched kitchen byte-for-byte.
//   3. §CONTEXT-DATA-HONESTY: a scope matching ZERO kitchens is a visible
//      no-op via canExecute (never a throw); a kitchen that vanishes mid-batch
//      is SKIPPED with a reason, and the rest still change ("Changed N of M").
//   4. The child command REPLACES kitchenConfig wholesale (see
//      UpdateFurnitureParametersCommand) — this suite asserts the OTHER two
//      material fields and the layout survive a single-field change.

import { describe, it, expect, beforeEach } from 'vitest';
import {
    BulkUpdateKitchenMaterialCommand,
    resolveKitchenMaterialRef,
} from '../src/furniture/BulkUpdateKitchenMaterialCommand';
import type { CommandContext } from '../src/types';

interface KitchenConfig {
    layoutType: string;
    numUnits: number;
    carcassMaterialId?: string;
    frontMaterialId?: string;
    countertopMaterialId?: string;
}

interface Furniture {
    id: string;
    furnitureType: string;
    levelId: string;
    kitchenConfig?: KitchenConfig;
}

function kitchen(id: string, levelId: string, over: Partial<KitchenConfig> = {}): Furniture {
    return {
        id,
        furnitureType: 'kitchen_l_shape_tall',
        levelId,
        kitchenConfig: {
            layoutType: 'kitchen_l_shape_tall',
            numUnits: 5,
            carcassMaterialId: 'wood-oak',
            frontMaterialId: 'wood-oak',
            countertopMaterialId: 'stone-marble-white',
            ...over,
        },
    };
}

function nonKitchenFurniture(id: string, levelId: string): Furniture {
    return { id, furnitureType: 'sofa_3seat', levelId, kitchenConfig: undefined };
}

/** Faithful in-memory furnitureStore stub — get/update/getAll, mirroring the
 *  real FurnitureStore's surface (and the fixture shape changeFurnitureType.test.ts
 *  already established for this package). `getAll()` returns a SNAPSHOT taken at
 *  construction, refreshed only via `_refreshSnapshot()` — this lets one test
 *  simulate a kitchen vanishing between scope resolution and per-kitchen execute,
 *  exactly like the wall batch tests' explicit 'ghost' id. */
function makeFurnitureStore(seed: Furniture[]) {
    const map = new Map<string, Furniture>(seed.map((f) => [f.id, structuredClone(f)]));
    let snapshot = [...map.values()];
    return {
        map,
        getAll: () => snapshot,
        get: (id: string) => map.get(id),
        update: (id: string, data: Furniture) => { map.set(id, structuredClone(data)); },
        _refreshSnapshot: () => { snapshot = [...map.values()]; },
        _delete: (id: string) => { map.delete(id); },
    };
}

function makeCtx(store: ReturnType<typeof makeFurnitureStore>): CommandContext {
    return { stores: { furnitureStore: store } } as unknown as CommandContext;
}

describe('resolveKitchenMaterialRef — forgiving STANDARD_MATERIAL_LIBRARY lookup', () => {
    it('resolves an exact id', () => {
        expect(resolveKitchenMaterialRef('stone-marble-carrara')?.id).toBe('stone-marble-carrara');
    });

    it('resolves an exact label', () => {
        expect(resolveKitchenMaterialRef('Stone · Marble Carrara')?.id).toBe('stone-marble-carrara');
    });

    it('resolves an unambiguous word-subset match', () => {
        // Exactly one library entry's name+id contain "whitewashed" — a single
        // discriminating word is enough for tier 4 to resolve it. ("smoked oak"
        // is genuinely ambiguous in the real catalogue — THREE entries carry
        // both words (wood-oak-smoked, parquet-smoked-oak-herringbone-wide,
        // floor-smoked-oak-plank) — which is the null-on-ambiguity test below,
        // not this one.)
        expect(resolveKitchenMaterialRef('whitewashed')?.id).toBe('wood-oak-whitewashed');
    });

    it('refuses (null) rather than guess when the reference is ambiguous', () => {
        // Multiple library entries contain "marble" (white / carrara / nero
        // marquina / tile / terrazzo) — bare "marble" must not silently pick one.
        expect(resolveKitchenMaterialRef('marble')).toBeNull();
        // Same for "smoked oak" — THREE entries carry both words (the cabinet
        // finish, a herringbone parquet, and a plank floor); ambiguous, not a
        // coin-flip onto the cabinet one just because this command is about kitchens.
        expect(resolveKitchenMaterialRef('smoked oak')).toBeNull();
    });

    it('refuses (null) on no match at all', () => {
        expect(resolveKitchenMaterialRef('not-a-real-material-xyz')).toBeNull();
    });
});

describe('BulkUpdateKitchenMaterialCommand — §CONTEXT-DATA-HONESTY batch semantics', () => {
    let store: ReturnType<typeof makeFurnitureStore>;
    let ctx: CommandContext;

    beforeEach(() => {
        store = makeFurnitureStore([
            kitchen('k1', 'L0'),
            kitchen('k2', 'L0', { countertopMaterialId: 'stone-marble-white' }),
            kitchen('k3', 'L1'),               // control — a different level
            nonKitchenFurniture('sofa-1', 'L0'), // control — not a kitchen at all
        ]);
        ctx = makeCtx(store);
    });

    it('element scope changes exactly ONE kitchen’s ONE material, and nothing else', () => {
        const cmd = new BulkUpdateKitchenMaterialCommand({
            scope: { kind: 'element', elementId: 'k1' },
            target: 'countertop',
            materialRef: 'stone-marble-carrara',
        });
        expect(cmd.canExecute(ctx).ok).toBe(true);
        const r = cmd.execute(ctx);
        expect(r.success).toBe(true);
        expect(r.affectedElementIds).toEqual(['k1']);
        expect(r.info?.[0]).toContain("Changed 1 of 1 kitchen's countertop");

        expect(store.get('k1')?.kitchenConfig?.countertopMaterialId).toBe('stone-marble-carrara');
        // The OTHER two material fields on the SAME kitchen survive untouched —
        // proof the child spreads the live kitchenConfig rather than replacing it.
        expect(store.get('k1')?.kitchenConfig?.carcassMaterialId).toBe('wood-oak');
        expect(store.get('k1')?.kitchenConfig?.frontMaterialId).toBe('wood-oak');
        expect(store.get('k1')?.kitchenConfig?.numUnits).toBe(5);
        // Every other kitchen (and the non-kitchen) is untouched.
        expect(store.get('k2')?.kitchenConfig?.countertopMaterialId).toBe('stone-marble-white');
        expect(store.get('k3')?.kitchenConfig?.countertopMaterialId).toBe('stone-marble-white');
    });

    it('level scope changes every kitchen on that level and NO others (control kitchen on another level untouched)', () => {
        const cmd = new BulkUpdateKitchenMaterialCommand({
            scope: { kind: 'level', levelId: 'L0' },
            target: 'carcass',
            materialRef: 'wood-oak-smoked',
        });
        expect(cmd.canExecute(ctx).ok).toBe(true);
        const r = cmd.execute(ctx);
        expect(r.success).toBe(true);
        expect(r.affectedElementIds.sort()).toEqual(['k1', 'k2']);
        expect(r.info?.[0]).toContain('Changed 2 of 2');

        expect(store.get('k1')?.kitchenConfig?.carcassMaterialId).toBe('wood-oak-smoked');
        expect(store.get('k2')?.kitchenConfig?.carcassMaterialId).toBe('wood-oak-smoked');
        // The L1 control kitchen is untouched.
        expect(store.get('k3')?.kitchenConfig?.carcassMaterialId).toBe('wood-oak');
    });

    it('project scope changes every kitchen project-wide, across levels, and ignores non-kitchen furniture', () => {
        const cmd = new BulkUpdateKitchenMaterialCommand({
            scope: { kind: 'project' },
            target: 'doorFront',
            materialRef: 'wood-oak-whitewashed',
        });
        expect(cmd.canExecute(ctx).ok).toBe(true);
        const r = cmd.execute(ctx);
        expect(r.success).toBe(true);
        expect(r.affectedElementIds.sort()).toEqual(['k1', 'k2', 'k3']);
        expect(r.info?.[0]).toContain('Changed 3 of 3');

        for (const id of ['k1', 'k2', 'k3']) {
            expect(store.get(id)?.kitchenConfig?.frontMaterialId).toBe('wood-oak-whitewashed');
        }
        // The sofa was never a candidate — it has no kitchenConfig to corrupt.
        expect(store.get('sofa-1')?.kitchenConfig).toBeUndefined();
    });

    it('ONE undo entry restores EVERY touched kitchen byte-for-byte', () => {
        const before = new Map([...store.map.entries()].map(([k, v]) => [k, structuredClone(v)]));
        const cmd = new BulkUpdateKitchenMaterialCommand({
            scope: { kind: 'project' },
            target: 'countertop',
            materialRef: 'stone-marble-carrara',
        });
        cmd.execute(ctx);
        // Sanity: the batch actually changed something before undoing it.
        expect(store.get('k1')?.kitchenConfig?.countertopMaterialId).toBe('stone-marble-carrara');

        const u = cmd.undo(ctx);
        expect(u.success).toBe(true);
        expect(u.affectedElementIds.sort()).toEqual(['k1', 'k2', 'k3']);
        for (const [id, snap] of before) {
            expect(store.get(id)).toEqual(snap);
        }
    });

    it('a level with no kitchens is a VISIBLE, honest no-op — never a throw', () => {
        const cmd = new BulkUpdateKitchenMaterialCommand({
            scope: { kind: 'level', levelId: 'L9-empty' },
            target: 'carcass',
            materialRef: 'wood-oak',
        });
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toContain('no kitchens on level "L9-empty"');
        // execute() re-checks and reports rather than throwing.
        expect(() => cmd.execute(ctx)).not.toThrow();
        const r = cmd.execute(ctx);
        expect(r.success).toBe(false);
        expect(r.affectedElementIds).toEqual([]);
    });

    it('a project with zero kitchens is a VISIBLE, honest no-op', () => {
        const empty = makeCtx(makeFurnitureStore([nonKitchenFurniture('sofa-1', 'L0')]));
        const cmd = new BulkUpdateKitchenMaterialCommand({
            scope: { kind: 'project' },
            target: 'carcass',
            materialRef: 'wood-oak',
        });
        const v = cmd.canExecute(empty);
        expect(v.ok).toBe(false);
        expect(v.reason).toContain('no kitchens in this project');
    });

    it('an element scope naming a NON-kitchen refuses by name, honestly', () => {
        const cmd = new BulkUpdateKitchenMaterialCommand({
            scope: { kind: 'element', elementId: 'sofa-1' },
            target: 'carcass',
            materialRef: 'wood-oak',
        });
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toContain('is not a kitchen');
        expect(v.reason).toContain('sofa-1');
    });

    it('an unknown material reference refuses, listing what it could not resolve', () => {
        const cmd = new BulkUpdateKitchenMaterialCommand({
            scope: { kind: 'project' },
            target: 'carcass',
            materialRef: 'unobtainium-9000',
        });
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toContain('Unknown material "unobtainium-9000"');
    });

    it('a kitchen that vanishes mid-batch is SKIPPED with a reason; the rest still change', () => {
        // Simulate k2 disappearing AFTER scope resolution captured it but BEFORE
        // its own child executes — the stale getAll() snapshot still lists it,
        // `get()` no longer does. Mirrors the wall batch's explicit 'ghost' id.
        const cmd = new BulkUpdateKitchenMaterialCommand({
            scope: { kind: 'level', levelId: 'L0' },
            target: 'carcass',
            materialRef: 'wood-oak-smoked',
        });
        store._delete('k2'); // snapshot (getAll) still contains k2; get('k2') now undefined
        const r = cmd.execute(ctx);
        expect(r.success).toBe(true);
        expect(r.affectedElementIds).toEqual(['k1']);
        expect(r.info?.some((line) => line.includes('1 skipped'))).toBe(true);
        expect(cmd.skipped).toHaveLength(1);
        expect(cmd.skipped[0]?.kitchenId).toBe('k2');
    });
});
