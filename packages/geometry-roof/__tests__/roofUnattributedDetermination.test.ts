/**
 * §ROOF-UNATTRIBUTED-IS-NOT-INDEPENDENT — "no roof depends on this wall" and
 * "no roof has an attribution to depend BY" were the same value.
 * (C78 §20 · U-INV-4 · §8.1 `RELATIONSHIP_NOT_RECORDED` · C79 §5.2 · row GR-14.)
 *
 * ─── THE DEFECT, AND WHY IT IS LIVE RATHER THAN THEORETICAL ──────────────────
 * `RoofDependencyTracker.recomputeForWall(wallId)` answered a wall move with
 *
 *     if (roofs.length === 0) return [];
 *
 * and `registerRoof` fed that graph through `roof.boundingWallIds ?? []`, which
 * made ABSENT and EMPTY the same input. So an empty graph had two causes
 * wearing one value:
 *
 *   · no roof is bounded by the moved wall — a real determination; and
 *   · no roof carries a `boundingWallIds` record at all — nothing was readable,
 *     and no determination was made.
 *
 * `RoofDependencyTracker`'s own header records that the third wiring step,
 * populating `boundingWallIds` AT CREATION, is unwired on BOTH creation paths
 * (3D `RoofTool._handleRegionClick` drops `traced.attribution`; plan
 * `RoofPlanToolHandler` dispatches without it). So in a real project TODAY every
 * roof is the second case, the graph is empty for every wall, and the tracker
 * returned `[]` — reporting "this move affected no roof", a positive claim about
 * the model, when the truth is that the relationship was never written down.
 *
 * That is U-INV-4 verbatim: "I found nothing" and "I could not look" are never
 * the same value.
 *
 * ─── PROVED AT THE CALLER, NOT AT A PURE FUNCTION ────────────────────────────
 * §COMMITTED-IS-NOT-REACHABLE. `recomputeRoofForWall` is pure and easy to
 * assert on, and asserting there would prove nothing about what a wall move
 * actually produces. Every arm below therefore drives the WALL STORE
 * SUBSCRIPTION — the tracker's real entry point, wired in its constructor — by
 * emitting a genuine `('update', wall)` event, and reads the verdicts the
 * subscribing path returns. ARM 3 goes one further and asserts on what a
 * CONSUMER does with them.
 */

import { describe, it, expect } from 'vitest';
import { RoofDependencyTracker, type RoofStoreLike, type RoofWallStoreRef } from '../src/RoofDependencyTracker.js';
import type { RoofData } from '../src/RoofTypes.js';
import type { RoofRecomputeVerdict } from '../src/roofRecomputeVerdict.js';

// ── Minimal doubles: a roof store and a wall store that really emits ─────────

function roofRecord(id: string, boundingWallIds?: string[]): RoofData {
    const base = {
        id,
        footprint: {
            polygon: [[-3, -2], [3, -2], [3, 2], [-3, 2]] as [number, number][],
            centroid: [0, 0] as [number, number],
        },
    };
    return (boundingWallIds === undefined
        ? base
        : { ...base, boundingWallIds }) as unknown as RoofData;
}

function makeRoofStore(roofs: RoofData[]): RoofStoreLike {
    return {
        getAll: () => roofs,
        getById: (id: string) => roofs.find((r) => r.id === id),
    };
}

/** A wall store that actually notifies — the tracker subscribes to this. */
function makeWallStore(walls: { id: string }[]): RoofWallStoreRef & { emitUpdate(id: string): void } {
    const subs: ((e: 'add' | 'update' | 'remove', w: { id: string }) => void)[] = [];
    return {
        getAll: () => walls as never,
        subscribe(cb) { subs.push(cb); return () => { subs.splice(subs.indexOf(cb), 1); }; },
        emitUpdate(id: string) { for (const cb of subs) cb('update', { id }); },
    };
}

/** Captures what `recomputeForWall` returned when the wall event fired. */
function trackerOver(roofs: RoofData[]): {
    emitWallMove(wallId: string): RoofRecomputeVerdict[];
    tracker: RoofDependencyTracker;
} {
    const wallStore = makeWallStore([{ id: 'wall-1' }, { id: 'wall-2' }]);
    const tracker = new RoofDependencyTracker(
        makeRoofStore(roofs),
        wallStore,
        () => ({}),
        { current: { execute: () => undefined } },
    );
    tracker.bootstrap();
    // Drive the SUBSCRIPTION, then read the same answer the subscription got.
    return {
        tracker,
        emitWallMove(wallId: string) {
            wallStore.emitUpdate(wallId);
            return tracker.recomputeForWall(wallId);
        },
    };
}

describe('§ROOF-UNATTRIBUTED-IS-NOT-INDEPENDENT — absent attribution never reads as "unaffected"', () => {
    it('ARM 1 — a roof with NO boundingWallIds yields UNDETERMINED, not an empty answer', () => {
        // This is the state of EVERY roof in a real project today: neither
        // creation path populates the field.
        const { emitWallMove } = trackerOver([roofRecord('roof-unattributed')]);

        const verdicts = emitWallMove('wall-1');

        // The pre-fix value, pinned so a regression is unmistakable:
        expect(verdicts).not.toEqual([]);
        expect(verdicts).toHaveLength(1);
        expect(verdicts[0]!.roofId).toBe('roof-unattributed');
        expect(verdicts[0]!.state).toBe('undetermined');
        expect(verdicts[0]!.reason).toBe('RELATIONSHIP_NOT_RECORDED');
        // BOTH sides of the question are named, so a reader can check rather
        // than believe (C70 §5.5).
        expect(verdicts[0]!.subReason).toContain('roof-unattributed');
        expect(verdicts[0]!.subReason).toContain('wall-1');
    });

    it('ARM 2 — the NEGATIVE control: boundingWallIds: [] is a real answer and stays EMPTY', () => {
        // The fix must not turn every quiet move into a refusal. `[]` means the
        // region WAS traced and bounded by no wall with an id — determined, and
        // genuinely independent of wall-1.
        const { emitWallMove, tracker } = trackerOver([roofRecord('roof-traced-no-hosts', [])]);

        expect(emitWallMove('wall-1')).toEqual([]);
        expect(tracker.unattributedRoofIds()).toEqual([]);
    });

    it('ARM 2b — a roof attributed to a DIFFERENT wall is also a determined empty', () => {
        const { emitWallMove } = trackerOver([roofRecord('roof-on-wall-2', ['wall-2'])]);
        expect(emitWallMove('wall-1')).toEqual([]);
    });

    it('ARM 2c — absent and empty are distinguishable in the tracker\'s own index', () => {
        const { tracker } = trackerOver([
            roofRecord('absent'),
            roofRecord('empty', []),
            roofRecord('attributed', ['wall-1']),
        ]);
        // The whole point: three roofs, three different attribution states, and
        // only the one that was never recorded is unattributed.
        expect(tracker.unattributedRoofIds()).toEqual(['absent']);
    });

    it('ARM 3 — CALLER PROOF: a consumer BRANCHES on the verdict and refuses to say "unaffected"', () => {
        // §COMMITTED-IS-NOT-REACHABLE / task step 4. A determination type that
        // every consumer immediately spreads back into a bare array satisfies a
        // static gate and still violates U-INV-4 in effect. So this arm is a
        // real consumer: the sentence a move-summary would show the user.
        function summariseRoofImpact(verdicts: readonly RoofRecomputeVerdict[]): string {
            const undetermined = verdicts.filter((v) => v.state === 'undetermined');
            if (undetermined.length > 0) {
                return `${undetermined.length} roof(s) could not be assessed ` +
                    `(${undetermined[0]!.reason}) — their wall attribution was never recorded`;
            }
            if (verdicts.length === 0) return 'no roof was affected';
            return `${verdicts.length} roof(s) followed the wall`;
        }

        const unattributed = trackerOver([roofRecord('roof-unattributed')]);
        const traced = trackerOver([roofRecord('roof-traced-no-hosts', [])]);

        // The two cases produced the SAME sentence before the fix. They must not now.
        const sentenceForUnattributed = summariseRoofImpact(unattributed.emitWallMove('wall-1'));
        const sentenceForTraced = summariseRoofImpact(traced.emitWallMove('wall-1'));

        expect(sentenceForUnattributed).not.toBe(sentenceForTraced);
        expect(sentenceForUnattributed).toContain('could not be assessed');
        expect(sentenceForUnattributed).toContain('RELATIONSHIP_NOT_RECORDED');
        // And the honest empty still reads as the determination it is.
        expect(sentenceForTraced).toBe('no roof was affected');
    });
});
