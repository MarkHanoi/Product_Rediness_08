// §WALL-RAKE-INVALIDATION (ADR-0310 follow-up) — the level-flush no-progress gate
// must SEE a rake edit.
//
// THE DEFECT (founder, 2026-08-09): "Vertical angle parameter works, but the wall
// only gets angled after another element is created or modified."
//
// `WallRebuildCoordinator._flush` opens with §FIX-WALLFLUSH-NOPROGRESS-GUARD (L-97):
// it computes `_levelWallSig(levelId, store)` for every affected level and, when no
// level's signature has moved since the last completed flush, RETURNS — no
// `resolveLevel`, no `refreshV2Cache`, no `buildWall`. The signature folded
// baseline, thickness, height, baseOffset, openings, layers, curve and material —
// but NOT `rakeAngleDeg`. So a rake-only edit was, to the gate, a no-op: the flush
// was skipped and the wall kept its vertical mesh. Editing ANY other element on the
// level moved the signature, released the gate, and the already-stored rake was
// finally built — exactly the reported symptom.
//
// `_levelWallSig` reads nothing off `this`, so it is exercised here as the pure
// function it is.

import { describe, it, expect } from 'vitest';
import { WallRebuildCoordinator } from '../WallRebuildCoordinator';

type W = Record<string, unknown>;

const sig = (walls: W[]): string =>
    (WallRebuildCoordinator.prototype as unknown as {
        _levelWallSig(levelId: string, store: { getAll(): W[] }): string;
    })._levelWallSig('L0', { getAll: () => walls });

function wall(over: Partial<W> = {}): W {
    return {
        id: 'wall_A',
        levelId: 'L0',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }],
        thickness: 0.2,
        height: 3,
        baseOffset: 0,
        openings: [],
        layers: [],
        ...over,
    };
}

describe('§WALL-RAKE-INVALIDATION — _levelWallSig must move when a wall is raked', () => {
    it('a rake-only edit CHANGES the level signature (the flush is not gated out)', () => {
        expect(sig([wall({ rakeAngleDeg: 80 })])).not.toBe(sig([wall()]));
    });

    it('an ABSENT rake and an explicit 90 produce the SAME signature', () => {
        expect(sig([wall({ rakeAngleDeg: 90 })])).toBe(sig([wall()]));
    });

    it('two different rake angles produce DIFFERENT signatures', () => {
        expect(sig([wall({ rakeAngleDeg: 80 })])).not.toBe(sig([wall({ rakeAngleDeg: 100 })]));
    });

    it('the signature stays stable for a genuinely unchanged raked level', () => {
        expect(sig([wall({ rakeAngleDeg: 80 })])).toBe(sig([wall({ rakeAngleDeg: 80 })]));
    });
});
