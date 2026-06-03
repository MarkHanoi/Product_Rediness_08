/**
 * ADR-057 P1 (OI-053h) — WallDeltaClassifier focused suite.
 *
 * Proves the delta-classification predicate that gates the single-wall
 * openings-only fast path in `WallRebuildCoordinator._flush`:
 *
 *   (a) an openings-only delta (door/window OFFSET edit) on one (or many) wall(s)
 *       of one level classifies as `openings-only` → the coordinator takes the
 *       fast branch and `WallJoinResolver.resolveLevel` is NOT called.
 *   (b) a baseline-move OR a wall-add/remove delta classifies as `whole-level`
 *       → the coordinator falls back to the existing whole-level rebuild.
 *   (c) the fast branch rebuilds EXACTLY the edited wall(s) — same wall set the
 *       full rebuild would produce body geometry for — and nothing else, which
 *       is why the produced geometry matches a full rebuild for this delta (both
 *       call the identical `builder.updateWall(fresh, null, renderMap, slabOff)`
 *       for that wall; see the integration-seam note at the bottom).
 *
 * The classifier is the unit-testable core; the coordinator integration seam is
 * documented (and exercised at runtime) — see `_flushOpeningsOnly` in
 * `apps/editor/src/engine/WallRebuildCoordinator.ts`.
 */

import { describe, it, expect } from 'vitest';
import { classifyWallDelta, type WallDeltaEntry } from '../src/WallDeltaClassifier';
import type { WallData, Opening } from '../src/WallTypes';

let _seq = 0;
function makeWall(
    overrides: Partial<WallData> & { openings?: Opening[] } = {},
): WallData {
    const id = overrides.id ?? `wall_${_seq++}`;
    return {
        id,
        type: 'wall',
        levelId: 'level-0',
        properties: {},
        childrenIds: [],
        baseLine: [
            { x: 0, y: 0, z: 0 },
            { x: 4, y: 0, z: 0 },
        ],
        height: 3,
        thickness: 0.2,
        baseOffset: 0,
        openings: [],
        ...overrides,
    } as WallData;
}

function makeOpening(over: Partial<Opening> = {}): Opening {
    return {
        id: over.id ?? 'op_1',
        type: over.type ?? 'door',
        offset: over.offset ?? 1.0,
        width: over.width ?? 0.9,
        height: over.height ?? 2.1,
        sillHeight: over.sillHeight ?? 0,
        elementId: over.elementId ?? 'door_1',
        ...over,
    };
}

describe('classifyWallDelta — (a) openings-only fast path', () => {
    it('single wall, door OFFSET change → openings-only (resolveLevel must be skipped)', () => {
        const op = makeOpening({ offset: 1.0 });
        const prev = makeWall({ id: 'w1', openings: [op] });
        const next = makeWall({ id: 'w1', openings: [{ ...op, offset: 2.5 }] });

        const result = classifyWallDelta([{ event: 'update', wall: next, prevState: prev }]);

        expect(result.kind).toBe('openings-only');
        if (result.kind === 'openings-only') {
            expect(result.wallIds).toEqual(['w1']);
            expect(result.levelId).toBe('level-0');
        }
    });

    it('width/height/sill value changes only → still openings-only', () => {
        const op = makeOpening();
        const prev = makeWall({ id: 'w1', openings: [op] });
        const next = makeWall({
            id: 'w1',
            openings: [{ ...op, width: 1.2, height: 2.4, sillHeight: 0.3 }],
        });
        const result = classifyWallDelta([{ event: 'update', wall: next, prevState: prev }]);
        expect(result.kind).toBe('openings-only');
    });

    it('multiple walls on ONE level, all openings-only (batch door-move / batch create-after-move) → openings-only with all ids', () => {
        const a0 = makeOpening({ id: 'opA', elementId: 'dA', offset: 1 });
        const b0 = makeOpening({ id: 'opB', elementId: 'dB', offset: 1 });
        const prevA = makeWall({ id: 'wA', openings: [a0] });
        const nextA = makeWall({ id: 'wA', openings: [{ ...a0, offset: 2 }] });
        const prevB = makeWall({ id: 'wB', openings: [b0] });
        const nextB = makeWall({ id: 'wB', openings: [{ ...b0, offset: 3 }] });

        const result = classifyWallDelta([
            { event: 'update', wall: nextA, prevState: prevA },
            { event: 'update', wall: nextB, prevState: prevB },
        ]);

        expect(result.kind).toBe('openings-only');
        if (result.kind === 'openings-only') {
            expect(result.wallIds.sort()).toEqual(['wA', 'wB']);
        }
    });
});

describe('classifyWallDelta — (b) whole-level fallback', () => {
    it('baseline MOVE → whole-level', () => {
        const prev = makeWall({ id: 'w1' });
        const next = makeWall({
            id: 'w1',
            baseLine: [
                { x: 0, y: 0, z: 0 },
                { x: 5, y: 0, z: 0 }, // end moved 1 m
            ],
        });
        const result = classifyWallDelta([{ event: 'update', wall: next, prevState: prev }]);
        expect(result.kind).toBe('whole-level');
        if (result.kind === 'whole-level') expect(result.reason).toBe('join-geometry-changed');
    });

    it('wall ADD (no prevState) → whole-level', () => {
        const next = makeWall({ id: 'w1', openings: [makeOpening()] });
        const result = classifyWallDelta([{ event: 'add', wall: next }]);
        expect(result.kind).toBe('whole-level');
        if (result.kind === 'whole-level') expect(result.reason).toBe('non-update-event:add');
    });

    it('wall REMOVE → whole-level', () => {
        const prev = makeWall({ id: 'w1' });
        const next = makeWall({ id: 'w1' });
        const result = classifyWallDelta([{ event: 'remove', wall: next, prevState: prev }]);
        expect(result.kind).toBe('whole-level');
    });

    it('thickness change → whole-level', () => {
        const prev = makeWall({ id: 'w1', thickness: 0.2 });
        const next = makeWall({ id: 'w1', thickness: 0.3 });
        const result = classifyWallDelta([{ event: 'update', wall: next, prevState: prev }]);
        expect(result.kind).toBe('whole-level');
    });

    it('opening SET change (new opening created) → whole-level', () => {
        const op = makeOpening({ id: 'op_1', elementId: 'd1' });
        const prev = makeWall({ id: 'w1', openings: [op] });
        const next = makeWall({
            id: 'w1',
            openings: [op, makeOpening({ id: 'op_2', elementId: 'd2', offset: 3 })],
        });
        const result = classifyWallDelta([{ event: 'update', wall: next, prevState: prev }]);
        expect(result.kind).toBe('whole-level');
        if (result.kind === 'whole-level') expect(result.reason).toBe('opening-set-changed');
    });

    it('opening REMOVED → whole-level', () => {
        const op = makeOpening();
        const prev = makeWall({ id: 'w1', openings: [op] });
        const next = makeWall({ id: 'w1', openings: [] });
        const result = classifyWallDelta([{ event: 'update', wall: next, prevState: prev }]);
        expect(result.kind).toBe('whole-level');
    });

    it('missing prevState on an update → whole-level (cannot prove invariance)', () => {
        const next = makeWall({ id: 'w1', openings: [makeOpening()] });
        const result = classifyWallDelta([{ event: 'update', wall: next }]);
        expect(result.kind).toBe('whole-level');
        if (result.kind === 'whole-level') expect(result.reason).toBe('no-prevState');
    });

    it('multi-level batch → whole-level', () => {
        const op = makeOpening();
        const prevA = makeWall({ id: 'wA', levelId: 'level-0', openings: [op] });
        const nextA = makeWall({ id: 'wA', levelId: 'level-0', openings: [{ ...op, offset: 2 }] });
        const prevB = makeWall({ id: 'wB', levelId: 'level-1', openings: [op] });
        const nextB = makeWall({ id: 'wB', levelId: 'level-1', openings: [{ ...op, offset: 2 }] });
        const result = classifyWallDelta([
            { event: 'update', wall: nextA, prevState: prevA },
            { event: 'update', wall: nextB, prevState: prevB },
        ]);
        expect(result.kind).toBe('whole-level');
        if (result.kind === 'whole-level') expect(result.reason).toBe('multi-level-batch');
    });

    it('mixed batch — one openings-only + one baseline-move → whole-level (the whole batch falls back)', () => {
        const op = makeOpening();
        const prevA = makeWall({ id: 'wA', openings: [op] });
        const nextA = makeWall({ id: 'wA', openings: [{ ...op, offset: 2 }] });
        const prevB = makeWall({ id: 'wB' });
        const nextB = makeWall({
            id: 'wB',
            baseLine: [{ x: 0, y: 0, z: 0 }, { x: 9, y: 0, z: 0 }],
        });
        const result = classifyWallDelta([
            { event: 'update', wall: nextA, prevState: prevA },
            { event: 'update', wall: nextB, prevState: prevB },
        ]);
        expect(result.kind).toBe('whole-level');
    });

    it('empty batch → whole-level (no-op safe)', () => {
        const result = classifyWallDelta([]);
        expect(result.kind).toBe('whole-level');
    });
});

describe('classifyWallDelta — (c) fast branch rebuilds EXACTLY the edited wall(s)', () => {
    // The geometry-equivalence guarantee: the fast branch (`_flushOpeningsOnly`)
    // and the whole-level branch produce identical body geometry for an
    // openings-only delta because BOTH call the same builder entry point —
    //   builder.updateWall(fresh, null, resolveOpeningRenderMap(fresh, store), slabOff)
    // — for the edited wall (the whole-level path reaches it via the
    // "event !== 'remove' && !adjustments.has(wallId)" branch, since an
    // openings-only change leaves the baseline put so resolveLevel returns no
    // adjustment for it). The classifier guarantees the fast branch is fed
    // EXACTLY that wall set and no neighbours, which is the load-bearing claim
    // we assert here at the unit level.
    it('selects only the walls whose openings changed (no neighbour expansion)', () => {
        const op = makeOpening();
        const prev = makeWall({ id: 'edited', openings: [op] });
        const next = makeWall({ id: 'edited', openings: [{ ...op, offset: 2.7 }] });
        const batch: WallDeltaEntry[] = [{ event: 'update', wall: next, prevState: prev }];

        const result = classifyWallDelta(batch);
        expect(result.kind).toBe('openings-only');
        if (result.kind === 'openings-only') {
            // EXACTLY the edited wall — nothing else. (No baseline moved, so the
            // whole-level path would also touch only this wall's body; the fast
            // path therefore produces the same geometry while skipping the
            // O(walls-per-level) join resolve.)
            expect(result.wallIds).toEqual(['edited']);
        }
    });
});
