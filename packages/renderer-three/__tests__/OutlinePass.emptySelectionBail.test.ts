// §OUTLINE-BAILS-ON-EMPTY-SELECTION (L-3320)
//
// Ledger §1.1, measured: ONE OutlineNode with an EMPTY selection still submits
// every mesh in the scene, because updateBefore runs two passes with OPPOSITE
// predicates and pass 1 draws everything NOT selected. PRYZM wires TWO nodes, so
// an idle WebGPU frame pays 4 full scene walks and ~7796 wasted submissions to
// outline nothing. The founder felt exactly this: "in AUTO it is fragmented …
// in WebGL it is much better" — and WebGL has no outline pass at all.
//
// These tests pin the three properties the fix depends on. They drive the SAME
// wrapper the pass installs, not a re-implementation of it.

import { describe, expect, it, vi } from 'vitest';
import { __testing } from '../src/pipeline/OutlinePass.js';

const { installEmptySelectionBail } = __testing;

function makeNode() {
    const inner = vi.fn(() => undefined);
    return { node: { updateBefore: inner } as { updateBefore: (f: unknown) => unknown }, inner };
}

describe('§OUTLINE-BAILS-ON-EMPTY-SELECTION', () => {
    it('⛔ renders ONE final pass after the selection empties, THEN skips', () => {
        // The composite samples the outline render target every frame. Bailing on
        // the very frame the selection empties would leave the PREVIOUS outline
        // frozen in the buffer as a ghost around a deselected object.
        const objects: unknown[] = [{}];
        const { node, inner } = makeNode();
        installEmptySelectionBail(node, objects as never);

        node.updateBefore(null);                       // selected — real pass
        expect(inner).toHaveBeenCalledTimes(1);

        objects.length = 0;                            // user deselects
        expect(node.updateBefore(null)).toBeUndefined(); // ⭐ ONE final clearing pass
        expect(inner).toHaveBeenCalledTimes(2);

        expect(node.updateBefore(null)).toBe(false);   // now it skips
        expect(node.updateBefore(null)).toBe(false);
        expect(inner).toHaveBeenCalledTimes(2);        // …and stays skipped
    });

    it('resumes the moment something is selected again', () => {
        const objects: unknown[] = [];
        const { node, inner } = makeNode();
        installEmptySelectionBail(node, objects as never);

        node.updateBefore(null);                       // first empty frame still runs
        expect(node.updateBefore(null)).toBe(false);
        expect(inner).toHaveBeenCalledTimes(1);

        objects.push({});                              // user selects
        expect(node.updateBefore(null)).toBeUndefined();
        expect(inner).toHaveBeenCalledTimes(2);
    });

    it('⛔ reads the LIVE array, never a snapshot of it', () => {
        // The manager mutates these arrays in place. Capturing by value at install
        // time would pin the bail to boot-time state — permanently on or off.
        const objects: unknown[] = [];
        const { node, inner } = makeNode();
        installEmptySelectionBail(node, objects as never);

        node.updateBefore(null);
        expect(node.updateBefore(null)).toBe(false);

        objects.push({}, {});                          // same array object, mutated
        expect(node.updateBefore(null)).toBeUndefined();
        expect(inner).toHaveBeenCalledTimes(2);
    });

    it('⛔ WARNS rather than silently shipping an unbailed pass', () => {
        // §1.6: the view-switch outline guard spent months suppressing nothing
        // while its own comment asserted that it worked. A failed install must be
        // audible.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        installEmptySelectionBail({ notANode: true }, [] as never);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('UNBAILED'));
        warn.mockRestore();
    });
});
