/**
 * §SELECT-SURVIVES-THE-REBUILD (L-3530) — lane INSP3, 2026-08-22.
 *
 * Pins the founder's report of 2026-08-22:
 *   *"Click a wall → it highlights for about a second, then the highlight is
 *   lost. It should stay selected until I select something else."*
 *
 * ⭐ THE FALSIFIABLE CLAIM. Before this change,
 * `SelectionManager._reresolveSelectionAfterRebuild()` called `unselectAll()`
 * the instant `_resolveLiveObjectById()` returned null — i.e. it read "no
 * SCENE-ATTACHED mesh carries this id" as "this element is gone". Case 1 below
 * fails on the old code: it returned the deselect for a live, registered element
 * whose builder had registered the root but not yet attached it.
 *
 * These drive the PURE decision rather than the SelectionManager, because the
 * decision is what was wrong. What a green run therefore does NOT establish: that
 * the retry window (4 × 50 ms) is long enough for any particular builder, or that
 * the founder's specific symptom had this cause rather than one of the other
 * seventeen `unselectAll()` call sites. §SELECT-CLEARED-SAYS-WHY (L-3531) is the
 * probe that settles the second question, and it settles it in his console, not
 * here.
 */

import { describe, it, expect } from 'vitest';
import { decideReresolveFate, type ReresolveInput } from '../src/reresolveFate';

const input = (over: Partial<ReresolveInput> = {}): ReresolveInput => ({
    domainKnowsId: true,
    attemptsSoFar: 0,
    maxRetries: 4,
    ...over,
});

describe('§SELECT-SURVIVES-THE-REBUILD — a late mesh is not a deleted element', () => {
    it('CASE 1 (the defect): a registered element with no attached mesh RETRIES, it does not deselect', () => {
        // This is the founder's wall: `elementRegistry` still holds it, the
        // builder has registered the root, `scene.add()` has not run yet.
        expect(decideReresolveFate(input({ domainKnowsId: true, attemptsSoFar: 0 })))
            .toBe('retry');
    });

    it('keeps retrying across the whole budget', () => {
        for (let n = 0; n < 4; n++) {
            expect(decideReresolveFate(input({ attemptsSoFar: n }))).toBe('retry');
        }
    });

    it('gives up at the budget — bounded, never forever', () => {
        // An unbounded retry would hold a selection on an element that will never
        // come back, which is a different bug, not a stronger fix.
        expect(decideReresolveFate(input({ attemptsSoFar: 4 }))).toBe('deselect-orphan');
        expect(decideReresolveFate(input({ attemptsSoFar: 99 }))).toBe('deselect-orphan');
    });

    // ── THE ORIGINAL BRANCH'S PURPOSE IS PRESERVED, NOT TRADED AWAY ───────────
    it('an element the registry has FORGOTTEN is deselected on the FIRST miss', () => {
        // The `undo-of-create` / delete case the old comment named. There is
        // nothing to wait for, and spending 200ms of retries here would make
        // delete feel broken.
        expect(decideReresolveFate(input({ domainKnowsId: false, attemptsSoFar: 0 })))
            .toBe('deselect-removed');
    });

    it('the domain verdict OUTRANKS the retry budget in both directions', () => {
        expect(decideReresolveFate(input({ domainKnowsId: false, attemptsSoFar: 3 })))
            .toBe('deselect-removed');
        expect(decideReresolveFate(input({ domainKnowsId: false, attemptsSoFar: 99 })))
            .toBe('deselect-removed');
    });

    // ── THE TWO DESELECTS ARE DIFFERENT VALUES, DELIBERATELY ─────────────────
    it('"removed" and "orphaned registration" are distinguishable, because their fixes differ', () => {
        const removed = decideReresolveFate(input({ domainKnowsId: false }));
        const orphan = decideReresolveFate(input({ domainKnowsId: true, attemptsSoFar: 4 }));
        expect(removed).not.toBe(orphan);
        // A registered root that never attaches is a REAL defect elsewhere. Folding
        // it into the normal-removal case is exactly how it would stay invisible —
        // which is the class of bug this whole change is about.
        expect(orphan).toBe('deselect-orphan');
    });

    it('a zero budget still deselects rather than looping', () => {
        expect(decideReresolveFate(input({ maxRetries: 0 }))).toBe('deselect-orphan');
    });
});
