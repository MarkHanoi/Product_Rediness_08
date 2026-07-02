/**
 * ToolInteractionRef unit tests — §DEFER-TIER-DURING-DRAW.
 *
 * Imports the module DIRECTLY (not via the rendering barrel, which pulls in
 * THREE/window-touching modules that throw under the node test env). The ref
 * itself imports nothing.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { toolInteractionRef } from './ToolInteractionRef';

describe('ToolInteractionRef (§DEFER-TIER-DURING-DRAW)', () => {
    beforeEach(() => {
        toolInteractionRef.reset();
    });

    it('is inactive with zero depth by default', () => {
        expect(toolInteractionRef.active).toBe(false);
        expect(toolInteractionRef.depth).toBe(0);
    });

    it('becomes active on beginInteraction and inactive again on endInteraction', () => {
        toolInteractionRef.beginInteraction();
        expect(toolInteractionRef.active).toBe(true);
        expect(toolInteractionRef.depth).toBe(1);

        toolInteractionRef.endInteraction();
        expect(toolInteractionRef.active).toBe(false);
        expect(toolInteractionRef.depth).toBe(0);
    });

    it('ref-counts nested interactions (stays active until fully unwound)', () => {
        toolInteractionRef.beginInteraction();
        toolInteractionRef.beginInteraction();
        expect(toolInteractionRef.depth).toBe(2);

        toolInteractionRef.endInteraction();
        expect(toolInteractionRef.active).toBe(true); // still one outstanding

        toolInteractionRef.endInteraction();
        expect(toolInteractionRef.active).toBe(false);
    });

    it('ignores an unbalanced endInteraction (never underflows)', () => {
        toolInteractionRef.endInteraction();
        expect(toolInteractionRef.depth).toBe(0);
        expect(toolInteractionRef.active).toBe(false);
    });

    describe('deferTierApply', () => {
        it('returns false and does NOT capture when no interaction is in progress', () => {
            let ran = 0;
            const deferred = toolInteractionRef.deferTierApply(() => { ran++; });
            expect(deferred).toBe(false);
            // Caller applies immediately in this branch; the ref ran nothing itself.
            expect(ran).toBe(0);
        });

        it('returns true and defers the apply while an interaction is in progress', () => {
            toolInteractionRef.beginInteraction();
            let ran = 0;
            const deferred = toolInteractionRef.deferTierApply(() => { ran++; });
            expect(deferred).toBe(true);
            // NOT run yet — still mid-interaction (this is the anti-stutter guarantee).
            expect(ran).toBe(0);
        });

        it('flushes the LATEST deferred apply exactly once when the interaction ends', () => {
            toolInteractionRef.beginInteraction();
            const calls: string[] = [];
            // Multiple deferrals during one draw (e.g. per polyline segment commit) —
            // only the newest (freshest mesh count) survives.
            toolInteractionRef.deferTierApply(() => calls.push('stale'));
            toolInteractionRef.deferTierApply(() => calls.push('latest'));

            expect(calls).toEqual([]); // nothing ran mid-draw

            toolInteractionRef.endInteraction();
            expect(calls).toEqual(['latest']); // exactly one, the newest
        });

        it('only flushes when depth returns to 0 (nested draws hold the escalation)', () => {
            toolInteractionRef.beginInteraction();
            toolInteractionRef.beginInteraction();
            let ran = 0;
            toolInteractionRef.deferTierApply(() => { ran++; });

            toolInteractionRef.endInteraction();
            expect(ran).toBe(0); // still one interaction outstanding

            toolInteractionRef.endInteraction();
            expect(ran).toBe(1); // flushed once at depth 0
        });

        it('swallows a throwing deferred apply so endInteraction never propagates', () => {
            toolInteractionRef.beginInteraction();
            toolInteractionRef.deferTierApply(() => { throw new Error('boom'); });
            expect(() => toolInteractionRef.endInteraction()).not.toThrow();
            expect(toolInteractionRef.active).toBe(false);
        });

        it('clears any pending apply on reset (no ghost flush later)', () => {
            toolInteractionRef.beginInteraction();
            let ran = 0;
            toolInteractionRef.deferTierApply(() => { ran++; });
            toolInteractionRef.reset();

            // A fresh begin/end cycle must not resurrect the discarded apply.
            toolInteractionRef.beginInteraction();
            toolInteractionRef.endInteraction();
            expect(ran).toBe(0);
        });
    });
});
