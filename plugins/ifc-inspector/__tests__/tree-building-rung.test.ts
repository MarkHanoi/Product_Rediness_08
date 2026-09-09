/**
 * ADR-0385 — the IFC tree's Building rung.
 *
 * `groupings.ts` has declared `RUNG_ORDER = ['project','site','building','storey',
 * 'space']` since it was written, and `groupBySpatial` nests whatever rungs it is
 * given. The renderer was ready; NO SOURCE POPULATED THE BUILDING RUNG — both
 * `tree-source.ts` capabilities declared `deepestSpatialRung: 'storey'`. These arms
 * cover populating it, and — more importantly — cover NOT populating it when there
 * is nothing to populate it with.
 *
 * ⛔ THE PADDING RULE IS THE INTERESTING HALF. `groupBySpatial`'s own header:
 * *"A SHORT CHAIN IS REPORTED, NOT PADDED. Inventing a 'Building' rung to make the
 * tree look like Revit's would be fabricating spatial structure that is not in the
 * file — the exact failure C01 §6 rule 6 forbids."* So a `derived` resolution (the
 * single default-building fallback every ungrouped project gets) emits NO rung,
 * even though the IFC FILE writes one IfcBuilding for that same project because the
 * schema requires one. The two are reading the same resolution and differ only in
 * what they are permitted to draw.
 */

import { describe, expect, it } from 'vitest';
import {
    adaptNativeElements,
    NO_BUILDING_INDEX,
    type BuildingIndex,
    type NativeElementLike,
} from '../src/tree/adapters.js';

const el = (id: string, levelId: string): NativeElementLike => ({
    id,
    type: 'wall',
    name: id,
    levelId,
    levelName: `Level ${levelId}`,
    material: null,
    frameMaterial: null,
    leafMaterial: null,
    wallId: null,
    ifcData: null,
});

/** Backs the rung with a recorded containment, the way the editor wiring does. */
const carrying = (map: Record<string, [string, string]>): BuildingIndex => ({
    resolveLevelBuilding: (levelId) => {
        const hit = levelId ? map[levelId] : undefined;
        return hit
            ? { kind: 'carried', buildingId: hit[0], name: hit[1] }
            : { kind: 'derived', buildingId: 'building-1', name: 'Default Building' };
    },
});

const rungs = (src: ReturnType<typeof adaptNativeElements>, id: string) =>
    src.elements.find((e) => e.id === id)!.spatial.map((r) => r.level);

describe('ADR-0385 — the IFC tree nests storeys under their building', () => {
    it('a CARRIED building inserts a rung between project and storey', () => {
        const src = adaptNativeElements(
            [el('w1', 'L1'), el('w2', 'L2')],
            'PRYZM model',
            undefined,
            carrying({ L1: ['b-a', 'Block A'], L2: ['b-b', 'Block B'] }),
        );

        // RUNG_ORDER is project/site/building/storey/space — the order matters, not
        // just the presence, because groupBySpatial nests in the array's own order.
        expect(rungs(src, 'w1')).toEqual(['project', 'building', 'storey']);
        const w1 = src.elements.find((e) => e.id === 'w1')!;
        expect(w1.spatial[1]).toEqual({ level: 'building', id: 'b-a', name: 'Block A' });
        const w2 = src.elements.find((e) => e.id === 'w2')!;
        expect(w2.spatial[1]).toEqual({ level: 'building', id: 'b-b', name: 'Block B' });

        expect(src.capability.deepestSpatialRung).toBe('building');
    });

    it('⛔ A DERIVED building emits NO rung — the default is not a building the model named', () => {
        // This is the arm that would go green if someone "helpfully" padded the tree.
        const src = adaptNativeElements(
            [el('w1', 'L1')],
            'PRYZM model',
            undefined,
            carrying({}), // everything falls to the default
        );
        expect(rungs(src, 'w1')).toEqual(['project', 'storey']);
        expect(src.capability.deepestSpatialRung).toBe('storey');
    });

    it('⛔ AN UNKNOWN building emits no rung EITHER — but says so, and differently', () => {
        // §CONTEXT-DATA-HONESTY (L-581/L-616). The two arms above and this one all
        // draw the same SHAPE for the ungrouped/unreadable cases; the limit note is
        // the only thing that distinguishes "PRYZM records no buildings" from "the
        // hierarchy could not be read". `NO_BUILDING_INDEX` returns `unknown`, not a
        // default, for exactly this reason.
        const unknown = adaptNativeElements([el('w1', 'L1')], 'PRYZM model', undefined, NO_BUILDING_INDEX);
        const derived = adaptNativeElements([el('w1', 'L1')], 'PRYZM model', undefined, carrying({}));

        expect(rungs(unknown, 'w1')).toEqual(['project', 'storey']);
        expect(unknown.capability.deepestSpatialRung).toBe('storey');
        expect(unknown.capability.limitNote).toContain('could not be resolved');
        expect(unknown.capability.limitNote).toContain('NOT a project with no buildings');

        // The failure and the emptiness must not read the same.
        expect(unknown.capability.limitNote).not.toBe(derived.capability.limitNote);
    });

    it('mixed: a resolved storey gets a rung, an unresolved one does not, and the note says so', () => {
        const mixed: BuildingIndex = {
            resolveLevelBuilding: (levelId) =>
                levelId === 'L1'
                    ? { kind: 'carried', buildingId: 'b-a', name: 'Block A' }
                    : { kind: 'unknown', why: 'two buildings claim this level' },
        };
        const src = adaptNativeElements([el('w1', 'L1'), el('w2', 'L2')], 'PRYZM model', undefined, mixed);

        expect(rungs(src, 'w1')).toEqual(['project', 'building', 'storey']);
        expect(rungs(src, 'w2')).toEqual(['project', 'storey']);
        // Depth is claimed because a building WAS resolved — and the note admits the
        // rest, rather than the depth quietly implying every element has one.
        expect(src.capability.deepestSpatialRung).toBe('building');
        expect(src.capability.limitNote).toContain('without a building rung');
    });

    it('the default index is backwards-compatible: no fourth argument ⇒ the tree PRYZM had', () => {
        const src = adaptNativeElements([el('w1', 'L1')]);
        expect(rungs(src, 'w1')).toEqual(['project', 'storey']);
        expect(src.capability.deepestSpatialRung).toBe('storey');
    });
});
