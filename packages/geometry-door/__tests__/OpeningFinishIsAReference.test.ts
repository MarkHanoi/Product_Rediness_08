/**
 * §OPENING-FINISH-IS-A-REFERENCE (L-7700 … L-7705)
 * =================================================
 *
 * Pins the invariant the founder's report is actually about: **a finish on a
 * hosted opening NAMES a material from the master, and the hex beside it is that
 * material's hex — not a second opinion about it.**
 *
 * ⚠ WHY THE SECOND HALF MATTERS AS MUCH AS THE FIRST. Seeding `materialId`
 * alone would have left every preset carrying an id AND a disagreeing hex.
 * C100 §2.1 makes the hex a CACHE of the id, and `doorFinishColour.ts` /
 * `windowFinishColour.ts` infer an explicit USER OVERRIDE precisely from the two
 * disagreeing. A built-in shipping id≠hex would therefore have read as *"the user
 * deliberately overrode this colour"* on every door in every project — a lie the
 * UI would then have faithfully reported (C100 §6.1). So the two are asserted
 * TOGETHER, and a future preset edit that changes one without the other fails
 * here rather than in a founder screenshot.
 *
 * ⛔ The catalogue is read through `findMaterialRecord` (C100 §1.3's designated
 * L0 accessor), NOT through a transcribed list of ids. A test carrying its own
 * copy of the expected ids would be the seventh material vocabulary (C100 §1.1)
 * wearing a test's clothes.
 */

import { describe, it, expect } from 'vitest';
// ⚠ THE SUBPATH, NOT THE ROOT BARREL. `@pryzm/schemas` does NOT re-export the
// materials module — `grep -n materials packages/schemas/src/index.ts` is EMPTY — so
// `from '@pryzm/schemas'` resolves, imports nothing, and every symbol arrives
// `undefined` at call time rather than failing at import. That is a barrel SUBSET
// hiding exports, and it cost this test one red run to find.
import { findMaterialRecord, MATERIAL_CATALOG } from '@pryzm/schemas/materials';
import { doorSystemTypeStore } from '../src/DoorSystemTypeStore';
import { windowSystemTypeStore } from '../../geometry-window/src/WindowSystemTypeStore';
import {
    finishMaterialState,
    suggestMaterialForLegacyName,
} from '../src/FinishMaterialSelect';

interface FinishLike {
    name: string;
    materialColor: string;
    materialId?: string | undefined;
}

/** Every finish slot of every BUILT-IN type, flattened, with a name for the failure message. */
function builtInFinishSlots(): Array<{ where: string; finish: FinishLike }> {
    const out: Array<{ where: string; finish: FinishLike }> = [];
    for (const t of doorSystemTypeStore.getAll()) {
        if (!t.isBuiltIn) continue;
        out.push({ where: `door ${t.id} frameFinish`, finish: t.frameFinish });
        out.push({ where: `door ${t.id} leafFinish`, finish: t.leafFinish });
    }
    for (const t of windowSystemTypeStore.getAll()) {
        if (!t.isBuiltIn) continue;
        out.push({ where: `window ${t.id} frameFinish`, finish: t.frameFinish });
        out.push({ where: `window ${t.id} sillFinish`, finish: t.sillFinish });
    }
    return out;
}

describe('§OPENING-FINISH-IS-A-REFERENCE — built-in opening types reference the master', () => {
    it('has a subject to measure (§RATCHET-R5: a scan that finds nothing must FAIL, not pass quietly)', () => {
        const slots = builtInFinishSlots();
        // 9 door types x 2 slots + 8 window types x 2 slots = 34 at the time of writing.
        // Asserted as a FLOOR, not an equality: adding a preset must not fail this test,
        // but silently measuring zero presets must.
        expect(slots.length).toBeGreaterThanOrEqual(30);
        expect(MATERIAL_CATALOG.length).toBeGreaterThan(100);
    });

    it('every built-in finish slot carries a materialId — C100 §2.1 MUST', () => {
        const missing = builtInFinishSlots()
            .filter((s) => !s.finish.materialId)
            .map((s) => s.where);
        expect(missing).toEqual([]);
    });

    it('every materialId RESOLVES against the master — C100 §5, no unresolved id ships', () => {
        const dead = builtInFinishSlots()
            .filter((s) => s.finish.materialId && !findMaterialRecord(s.finish.materialId))
            .map((s) => `${s.where} -> ${s.finish.materialId}`);
        expect(dead).toEqual([]);
    });

    it("materialColor equals the master's hex — the cache agrees with the reference", () => {
        const disagreeing = builtInFinishSlots()
            .filter((s) => {
                const rec = s.finish.materialId ? findMaterialRecord(s.finish.materialId) : undefined;
                if (!rec) return false; // covered by the test above
                return rec.color.toLowerCase() !== String(s.finish.materialColor).toLowerCase();
            })
            .map((s) => {
                const rec = findMaterialRecord(s.finish.materialId!)!;
                return `${s.where}: stored ${s.finish.materialColor}, master ${rec.color}`;
            });
        expect(disagreeing).toEqual([]);
    });

    it('the row L-7703 added to the master exists and is the Crittal frame colour', () => {
        const rec = findMaterialRecord('steel-powder-coated-dark');
        expect(rec).toBeDefined();
        expect(rec!.color).toBe('#444444');
        expect(rec!.category).toBe('Metal');
    });
});

describe('§OPENING-FINISH-IS-A-REFERENCE — the four finish states are distinguishable', () => {
    it('separates resolved / unresolved / legacy / empty — C100 §5', () => {
        expect(finishMaterialState('wood-oak', 'Timber Leaf')).toBe('resolved');
        // An id that names nothing is NOT the same value as no id at all.
        expect(finishMaterialState('wood-oak-that-was-deleted', 'Timber Leaf')).toBe('unresolved');
        // ⭐ THE DEFECT THE FOUNDER CIRCLED: a free-text finish with no id. It must not
        // read as "nobody has chosen one yet".
        expect(finishMaterialState(undefined, 'Steel Frame')).toBe('legacy');
        expect(finishMaterialState(undefined, undefined)).toBe('empty');
        expect(finishMaterialState('   ', '  ')).toBe('empty');
    });
});

describe('§OPENING-FINISH-IS-A-REFERENCE — legacy-name suggestion is conservative', () => {
    it('matches a master label exactly, normalised', () => {
        expect(suggestMaterialForLegacyName('Wood · Oak (Light)')).toBe('wood-oak');
    });

    it('⛔ REFUSES to guess "Steel Frame" — a near-miss guess is how wood-oak and wood-walnut became one colour', () => {
        // There is no master row called "Steel Frame". C100 §5's last MUST: inference
        // that passes for resolution is the same lie one layer up. Returning
        // `steel-structural` here would be a guess wearing a resolution's clothes.
        expect(suggestMaterialForLegacyName('Steel Frame')).toBeUndefined();
    });

    it('refuses on too-short and empty input rather than matching something', () => {
        expect(suggestMaterialForLegacyName(undefined)).toBeUndefined();
        expect(suggestMaterialForLegacyName('')).toBeUndefined();
        expect(suggestMaterialForLegacyName('a')).toBeUndefined();
    });
});
