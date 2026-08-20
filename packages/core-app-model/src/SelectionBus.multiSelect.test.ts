/**
 * §MULTI-SELECT-SHIFT (L-1550) — the SelectionBus as the ONE owner of the
 * selected SET.
 *
 * The founder asked for "multi select elements via SHIFT + another element".
 * The set model already existed here (`selectMany` / `currentIds`, minted for the
 * marquee) but three things about it were not true enough to build on:
 *
 *   1. `toggle` did not exist — the add/remove rule was written out longhand in
 *      `PlanViewInteraction` and nowhere else, so a second surface could only be
 *      added by copying it.
 *   2. `dispatch()` overwrote the PRIMARY with `elementIds[0]` immediately after
 *      `selectMany()` had set it to the LAST id, so the bus's own two accessors
 *      disagreed about which element the gizmo and inspector describe.
 *   3. `dispatch()` never updated `_currentIds` at all, so the one external raw
 *      dispatcher left the SET stale while the primary moved.
 *
 * These pin all three.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { selectionBus } from './SelectionBus';

/** A SelectionManager stub — the bus calls into it on every state change. */
function stubManager() {
    const calls: { selectById: string[]; marquee: string[][]; unselect: number } = {
        selectById: [], marquee: [], unselect: 0,
    };
    selectionBus.setSelectionManager({
        selectById: (id: string) => { calls.selectById.push(id); },
        applyMarqueeHighlights: (ids: string[]) => { calls.marquee.push([...ids]); },
        unselectAll: () => { calls.unselect++; },
    });
    return calls;
}

beforeEach(() => {
    selectionBus.clear();          // drops handlers + state
    selectionBus.setSelectionManager(null);
});

describe('SelectionBus.toggle — SHIFT+click add / remove / clear', () => {
    it('adds an id that is not in the set, and makes it the PRIMARY', () => {
        stubManager();
        selectionBus.select('a', '3d-canvas');
        const set = selectionBus.toggle('b', '3d-canvas');

        expect(set).toEqual(['a', 'b']);
        expect(selectionBus.currentIds).toEqual(['a', 'b']);
        // Primary is the element just clicked — the one the inspector/gizmo describe.
        expect(selectionBus.currentId).toBe('b');
    });

    it('removes an id that IS in the set, and re-primaries the remainder', () => {
        stubManager();
        selectionBus.selectMany(['a', 'b', 'c'], '3d-canvas', false);
        expect(selectionBus.currentId).toBe('c');

        selectionBus.toggle('c', '3d-canvas');
        expect(selectionBus.currentIds).toEqual(['a', 'b']);
        expect(selectionBus.currentId).toBe('b');
    });

    it('removing the LAST member clears the selection entirely', () => {
        const calls = stubManager();
        selectionBus.select('a', '3d-canvas');
        selectionBus.toggle('a', '3d-canvas');

        expect(selectionBus.currentIds).toEqual([]);
        expect(selectionBus.currentId).toBeNull();
        expect(calls.unselect).toBeGreaterThan(0);
    });

    it('re-adding an id already present moves it to PRIMARY without duplicating', () => {
        stubManager();
        selectionBus.selectMany(['a', 'b'], '3d-canvas', false);
        selectionBus.toggle('a', '3d-canvas');   // removes a
        selectionBus.toggle('a', '3d-canvas');   // adds a back, now last
        expect(selectionBus.currentIds).toEqual(['b', 'a']);
        expect(selectionBus.currentId).toBe('a');
    });

    it('an empty id is ignored rather than poisoning the set', () => {
        stubManager();
        selectionBus.select('a', '3d-canvas');
        selectionBus.toggle('', '3d-canvas');
        expect(selectionBus.currentIds).toEqual(['a']);
    });
});

describe('the SET and the PRIMARY agree (the dispatch() clobber, L-1550)', () => {
    it('selectMany leaves currentId as the LAST id, not the first', () => {
        stubManager();
        selectionBus.selectMany(['w1', 'w2', 'w3'], '3d-canvas', false);
        // Pre-L-1550 this asserted 'w1' — dispatch() overwrote selectMany's primary.
        expect(selectionBus.currentId).toBe('w3');
        expect(selectionBus.currentIds).toEqual(['w1', 'w2', 'w3']);
    });

    it('a RAW dispatch updates the SET, not only the primary', () => {
        stubManager();
        selectionBus.select('a', '3d-canvas');
        // The shape `initDataPlatform` uses — a data-workbench row selection.
        selectionBus.dispatch({ type: 'select', source: 'data-workbench', elementIds: ['x', 'y'] });
        expect(selectionBus.currentIds).toEqual(['x', 'y']);
        expect(selectionBus.currentId).toBe('y');
    });

    it('a HIGHLIGHT dispatch decorates without rewriting the selection', () => {
        stubManager();
        selectionBus.selectMany(['a', 'b'], '3d-canvas', false);
        selectionBus.dispatch({ type: 'highlight', source: 'analytics', elementIds: ['q', 'r', 's'] });
        expect(selectionBus.currentIds).toEqual(['a', 'b']);
        expect(selectionBus.currentId).toBe('b');
    });

    it('a plain select collapses the set to one', () => {
        stubManager();
        selectionBus.selectMany(['a', 'b', 'c'], '3d-canvas', false);
        selectionBus.select('z', 'plan-view');
        expect(selectionBus.currentIds).toEqual(['z']);
        expect(selectionBus.currentId).toBe('z');
    });
});

describe('the 3-D and plan surfaces produce the SAME set', () => {
    it('shift-adding from plan then from 3-D builds one shared set', () => {
        stubManager();
        selectionBus.select('a', 'plan-view');
        selectionBus.toggle('b', 'plan-view');     // plan shift+click
        selectionBus.toggle('c', '3d-canvas');     // 3-D shift+click
        expect(selectionBus.currentIds).toEqual(['a', 'b', 'c']);

        // …and shift-removing from the OTHER surface removes from the same set.
        selectionBus.toggle('b', '3d-canvas');
        expect(selectionBus.currentIds).toEqual(['a', 'c']);
    });

    it('secondary highlights carry every id except the primary', () => {
        const calls = stubManager();
        selectionBus.selectMany(['a', 'b', 'c'], '3d-canvas', false);
        expect(calls.selectById.at(-1)).toBe('c');          // primary
        expect(calls.marquee.at(-1)).toEqual(['a', 'b']);   // the rest
    });
});
