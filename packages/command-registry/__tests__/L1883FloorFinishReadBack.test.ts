/**
 * §FLOOR-FINISH-READBACK (L-1883) + §FEAT-FLOOR-SURFACE-FINISH (L-1881)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * C67 rule 12 requires a "Done" to be backed by a read-back of the AUTHORITATIVE
 * store. The wall family learned that the hard way twice (L-995 → L-1670): the
 * child returns `{success:true}` the instant the store's update method returns,
 * and a store that silently drops a field still returns.
 *
 * ⭐ THE NON-VACUITY GUARD IS THE POINT OF THIS FILE, and it is copied from
 * L-1670 on purpose. A read-back asserted only against a FAITHFUL store proves
 * nothing — it passes just as happily when the read-back is deleted. So the same
 * command is driven against a DROPPING store and is required to REFUSE to count
 * those floors. The oracle is the count, which this test authors, not the store.
 *
 * ⚠ THE DROPPING STORE HERE IS NOT HYPOTHETICAL EITHER. `FloorStore.update`
 * warns-and-deletes a `levelId` key, coerces `boundary.thickness` from the layer
 * sum, and REPLACES a nested object outright via `Object.assign` — which is why
 * `composeFloorFinishUpdate` merges `finishSpec` rather than handing over a bare
 * `{finishColor}`. A store that drops `finishSpec` is one `Object.assign` away.
 */

import { describe, it, expect } from 'vitest';
import {
    SetFloorFinishBatchCommand,
    SetFloorFinishCommand,
    composeFloorFinishUpdate,
    floorCarriesFinish,
} from '../src/floors/SetFloorFinishCommand';
import { floorPatternForMaterialLabel } from '../src/floors/floorFinishPattern';

const OAK_CHEVRON = {
    materialId: 'parquet-oak-chevron-45',
    materialColor: '#c8a96e',
    materialName: 'Parquet · Oak Chevron 45° (90 × 600)',
};

interface FakeFloor {
    id: string;
    levelId: string;
    materialId?: string;
    colour?: string;
    finishSpec: Record<string, unknown>;
    boundary: { polygon: unknown[]; thickness: number; baseOffset: number };
}

/**
 * @param drops when true, `update` accepts the call and SILENTLY discards
 *        `finishSpec` — the shape `Object.assign` over a nested object produces.
 * @param tinted when true, every floor carries a hand-picked `colour` override,
 *        which `resolveFloorColor` ranks ABOVE both finishColor and materialId.
 */
function makeStore(ids: string[], drops: boolean, tinted = false) {
    const map = new Map<string, FakeFloor>();
    for (const id of ids) {
        map.set(id, {
            id,
            levelId: 'L0',
            ...(tinted ? { colour: '#ff0000' } : {}),
            // Every AUTO-GENERATED floor carries one of these
            // (CreateFloorsByRoomTypeCommand → floorFinish.ts), which is exactly
            // why writing `materialId` alone would have been invisible.
            finishSpec: { finishColor: '#E2D6BE', exposedScreed: false, jointWidth: 0.003 },
            boundary: { polygon: [], thickness: 0.015, baseOffset: 0.015 },
        });
    }
    return {
        getById: (id: string) => {
            const f = map.get(id);
            return f === undefined ? undefined : (structuredClone(f) as FakeFloor);
        },
        getAll: () => [...map.values()].map((f) => structuredClone(f) as FakeFloor),
        update: (id: string, updates: Partial<FakeFloor>) => {
            const prev = map.get(id);
            if (!prev) return undefined;
            const { finishSpec, ...rest } = updates;
            const next = drops
                ? ({ ...prev, ...rest } as FakeFloor)
                : ({ ...prev, ...rest, finishSpec: finishSpec ?? prev.finishSpec } as FakeFloor);
            map.set(id, next);
            return structuredClone(next) as FakeFloor;
        },
        restoreSnapshot: (snap: FakeFloor) => { map.set(snap.id, structuredClone(snap) as FakeFloor); },
    };
}

const ctxFor = (store: ReturnType<typeof makeStore>) => ({ stores: { floorStore: store } }) as never;

describe('§FLOOR-FINISH-READBACK — the success count is read back from the authority', () => {
    it('a FAITHFUL store: all three floors count, and the summary says 3 of 3', () => {
        const store = makeStore(['f0', 'f1', 'f2'], false);
        const cmd = new SetFloorFinishBatchCommand({ floorIds: 'all', finish: OAK_CHEVRON });
        const r = cmd.execute(ctxFor(store));
        expect(r.success).toBe(true);
        expect(r.affectedElementIds).toEqual(['f0', 'f1', 'f2']);
        expect(r.info?.[0]).toContain('on 3 of 3 floors');
        expect(cmd.skipped).toHaveLength(0);
    });

    it('⭐ a DROPPING store: the store says success, the RECORD does not — 0 of 3', () => {
        // If the read-back were deleted this would report "3 of 3 — Done" over a
        // model nothing had touched. That sentence is the whole defect class.
        const store = makeStore(['f0', 'f1', 'f2'], true);
        const cmd = new SetFloorFinishBatchCommand({ floorIds: 'all', finish: OAK_CHEVRON });
        const r = cmd.execute(ctxFor(store));
        expect(r.success).toBe(false);
        expect(r.affectedElementIds).toEqual([]);
        expect(r.info?.[0]).toContain('on 0 of 3 floors');
        expect(cmd.skipped).toHaveLength(3);
        // The skip NAMES the failure mode rather than pretending it was a refusal.
        expect(cmd.skipped[0]!.reason).toContain('reported success');
        expect(cmd.skipped[0]!.reason).toContain('did not reach the authority');
    });

    it('the whole finish is written — materialId AND finishSpec, not one of them', () => {
        // Writing `materialId` alone is INVISIBLE on any floor carrying a
        // `finishSpec.finishColor`, which every auto-generated floor does:
        // `resolveFloorColor` ranks colour → finishColor → materialId.
        const store = makeStore(['f0'], false);
        new SetFloorFinishCommand({ floorId: 'f0', finish: OAK_CHEVRON }).execute(ctxFor(store));
        const after = store.getById('f0')!;
        expect(after.materialId).toBe('parquet-oak-chevron-45');
        expect(after.finishSpec['finishMaterialId']).toBe('parquet-oak-chevron-45');
        expect(after.finishSpec['finishColor']).toBe('#c8a96e');
        // Derived from the material's OWN LABEL, so the grid the user sees matches
        // the material they asked for.
        expect(after.finishSpec['finishPattern']).toBe('plank-herringbone');
        // ...and the rest of the authored spec SURVIVES the write.
        expect(after.finishSpec['exposedScreed']).toBe(false);
        expect(after.finishSpec['jointWidth']).toBe(0.003);
    });

    it('a hand-picked colour override is superseded — and SAID OUT LOUD', () => {
        const store = makeStore(['f0', 'f1'], false, true);
        const cmd = new SetFloorFinishBatchCommand({ floorIds: 'all', finish: OAK_CHEVRON });
        const r = cmd.execute(ctxFor(store));
        expect(r.success).toBe(true);
        // Cleared, or the finish would be invisible (colour outranks everything).
        expect(store.getById('f0')!.colour).toBeUndefined();
        expect(cmd.tintCleared).toEqual(['f0', 'f1']);
        // §L960-STEP3 — the disclosure rides the SUCCESS SENTENCE, never a
        // separate line a UI may not render.
        expect(r.info?.[0]).toContain('hand-picked colour override');
        expect(r.info?.[0]).toContain('Ctrl+Z');
    });

    it('undo restores the pre-change record, tint included', () => {
        const store = makeStore(['f0'], false, true);
        const cmd = new SetFloorFinishBatchCommand({ floorIds: 'all', finish: OAK_CHEVRON });
        cmd.execute(ctxFor(store));
        cmd.undo(ctxFor(store));
        const back = store.getById('f0')!;
        expect(back.colour).toBe('#ff0000');
        expect(back.materialId).toBeUndefined();
        expect(back.finishSpec['finishColor']).toBe('#E2D6BE');
    });

    it('an EMPTY project declines visibly rather than reporting a clean run', () => {
        const store = makeStore([], false);
        const cmd = new SetFloorFinishBatchCommand({ floorIds: 'all', finish: OAK_CHEVRON });
        const v = cmd.canExecute(ctxFor(store));
        expect(v.ok).toBe(false);
        expect(v.reason).toContain('no floor finishes in this project');
    });

    it('the render limit rides the success sentence for a material that HAS maps', () => {
        // `parquet-oak-chevron-45` carries `procedural:` maps. FloorPanelBuilder
        // binds none of them (it has no `applyMaterialMaps` call at all), so the
        // caveat must be part of the same sentence as "Set the finish …".
        const store = makeStore(['f0'], false);
        const cmd = new SetFloorFinishBatchCommand({ floorIds: 'all', finish: OAK_CHEVRON });
        const r = cmd.execute(ctxFor(store));
        expect(r.info?.[0]).toContain('does not bind');
        expect(r.info?.[0]).toContain('plank/tile');
    });
});

describe('§FEAT-FLOOR-SURFACE-FINISH — the pattern is DERIVED from the label', () => {
    it.each([
        ['Parquet · Oak Herringbone (70 × 350)', 'plank-herringbone'],
        ['Parquet · Oak Chevron 45° (90 × 600)', 'plank-herringbone'],
        ['Parquet · Oak Hungarian Point 60° (90 × 600)', 'plank-herringbone'],
        ['Parquet · Oak Versailles Panel (900 mm)', 'tile-600x600'],
        ['Parquet · Oak Basket Weave (3 × 70)', 'tile-600x600'],
        ['Timber Floor · Oak Plank 189 × 1860 (1/3 bond)', 'plank-90'],
        ['Tile · Porcelain 600 × 600, stack bond, 3 mm grout', 'tile-600x600'],
        ['Tile · Slate 600 × 300, half bond, 4 mm grout', 'tile-600x300'],
        ['Tile · Metro 103 × 309 herringbone, 3 mm grout', 'tile-herringbone'],
        ['Tile · Hexagon 200 mm white, 3 mm grout', 'tile-600x600'],
        ['Wood · Oak (Light)', 'plank-90'],
        // ⚠ 'none'/'seamless' is a REAL ANSWER, never a failure: a polished
        // concrete floor has no joints and drawing a 600 mm grid on one would be
        // an invented feature.
        ['Concrete · Burnished', 'seamless'],
        ['Paint · Matte White', 'seamless'],
    ])('%s → %s', (label, expected) => {
        expect(floorPatternForMaterialLabel(label)).toBe(expected);
    });
});

describe('the two shared predicates have ONE definition each', () => {
    it('composeFloorFinishUpdate MERGES finishSpec rather than replacing it', () => {
        const existing = {
            finishSpec: { exposedScreed: true, jointWidth: 0.005, coveSkirting: true },
        } as never;
        const out = composeFloorFinishUpdate(existing, OAK_CHEVRON, 'plank-herringbone');
        expect(out.finishSpec).toMatchObject({
            exposedScreed: true,
            jointWidth: 0.005,
            coveSkirting: true,
            finishMaterialId: 'parquet-oak-chevron-45',
            finishPattern: 'plank-herringbone',
        });
    });

    it('floorCarriesFinish is FALSE for a missing record, not a crash', () => {
        expect(floorCarriesFinish(undefined, OAK_CHEVRON)).toBe(false);
        // A record carrying the id but NOT the colour has not taken the finish.
        expect(floorCarriesFinish(
            { materialId: 'parquet-oak-chevron-45', finishSpec: { finishMaterialId: 'parquet-oak-chevron-45' } } as never,
            OAK_CHEVRON,
        )).toBe(false);
    });
});
