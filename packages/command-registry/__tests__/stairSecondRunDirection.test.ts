// @vitest-environment happy-dom
//
// ─── §STAIR-SECOND-RUN-DIRECTION (L-10270) ───────────────────────────────────
//
// FOUNDER (2026-08-23): "Once a stair in L or U shape is created — we should be
// able to AFTERWARDS modify, via RAC and via the UI properties panel, the
// DIRECTION OF THE SECOND RUN."
//
// ⛔ THESE TESTS DO NOT ASSERT THAT A FUNCTION WAS CALLED. They run the real
// `CreateStairCommand` and the real `UpdateStairParametersCommand` against a
// store, then RE-DERIVE the handedness from the FLIGHT GEOMETRY the store holds —
// never from the flag the command was asked to write (C16 §5.1 CA-21: read back
// from what the renderer consumes, not from the field the handler set).
//
// ⭐ THE CLAIM UNDER TEST is the founder's round trip: flip → the geometry moves →
// the SAVED RECORD carries it → undo returns the previous direction. A control
// that changes the mesh but not the record is worse than no control.

import { describe, it, expect } from 'vitest';
import { CreateStairCommand, type CreateStairInput } from '../src/stair/CreateStairCommand';
import { UpdateStairParametersCommand } from '../src/stair/UpdateStairParametersCommand';
import { deriveStairSecondRunHandedness, stairSecondRunStampIsStale } from '@pryzm/geometry-stair';
import type { CommandContext } from '../src/types';

const LEVELS = [
    { id: 'L0', elevation: 0, name: 'Ground' },
    { id: 'L1', elevation: 3.0, name: 'Level 1' },
];

function makeHarness() {
    const stairs = new Map<string, any>();
    const openings = new Map<string, any>();
    const stores: any = {
        openingStore: {
            add: (o: any) => { openings.set(o.id, structuredClone(o)); },
            remove: (id: string) => { openings.delete(id); },
            update: (id: string, p: any) => { const o = openings.get(id); if (o) openings.set(id, { ...o, ...p }); },
            get: (id: string) => openings.get(id), getById: (id: string) => openings.get(id),
            getByHostId: () => [], getAll: () => [...openings.values()],
        },
        slabStore: { add: () => {}, getAll: () => [], getById: () => undefined, remove: () => {}, triggerRebuild: () => {} },
        stairStore: {
            add: (s: any) => { stairs.set(s.id, structuredClone(s)); },
            get: (id: string) => stairs.get(id), getById: (id: string) => stairs.get(id),
            update: (id: string, p: any) => { const s = stairs.get(id); if (s) stairs.set(id, { ...s, ...structuredClone(p) }); },
            remove: (id: string) => { stairs.delete(id); },
            restoreSnapshot: (s: any) => { stairs.set(s.id, structuredClone(s)); },
            getStairConnectingLevels: () => undefined, getAll: () => [...stairs.values()],
        },
        stairRailingStore: { add: () => {}, remove: () => {}, getByStairId: () => [], removeByStairId: () => {}, getAll: () => [] },
        floorStore: { getAll: () => [], getById: () => undefined, update: () => {} },
        ceilingStore: { getAll: () => [], getById: () => undefined, update: () => {} },
        wallStore: { getById: () => undefined, getWindow: () => undefined, getDoor: () => undefined, getLevels: () => LEVELS, getAll: () => [] },
    };
    const ctx = {
        stores,
        bimManager: { registerElement: () => {}, unregisterElement: () => {}, getLevelById: (id: string) => LEVELS.find(l => l.id === id) },
        projectContext: { activeLevelId: 'L0' },
    } as unknown as CommandContext;
    return { ctx, stairs };
}

type H = ReturnType<typeof makeHarness>;

// The ElementRegistry is a PROCESS-WIDE singleton and CreateStairCommand registers
// into it, so every stair in this file needs its own id or the second create throws.
let _n = 0;
const nextId = (p: string): string => p + '-' + String(++_n);

/** An L stair turning LEFT: run 1 along +Z, run 2 along −X (cross > 0 ⇒ left). */
function makeLStair(h: H, id = nextId('sL')): string {
    const input = {
        id, baseLevelId: 'L0', topLevelId: 'L1', shape: 'L',
        riserHeight: 0.15, treadDepth: 0.28, width: 1.0,
        startPosition: { x: 0, y: 0, z: 0 },
        flights: [
            { direction: { x: 0, y: 0, z: 1 }, riserCount: 10 },
            { direction: { x: -1, y: 0, z: 0 }, riserCount: 10 },
        ],
        landings: [{ depth: 1.0 }],
        turnDirection: 'left',
    } as unknown as CreateStairInput;
    const res = new CreateStairCommand(input).execute(h.ctx);
    expect(res.success, `stair ${id} not created: ${res.info?.join('; ')}`).toBe(true);
    return id;
}

describe('§STAIR-SECOND-RUN-DIRECTION — the founder’s round trip, at the command', () => {
    it('⭐⭐ flip → the SAVED RECORD carries it in BOTH the flag and the flights', () => {
        const h = makeHarness();
        const sid = makeLStair(h);
        expect(deriveStairSecondRunHandedness(h.stairs.get(sid))).toBe('left');

        const cmd = new UpdateStairParametersCommand({ stairId: sid, updates: { turnDirection: 'right' } });
        const v = cmd.canExecute(h.ctx);
        expect(v.ok, JSON.stringify(v)).toBe(true);
        expect(cmd.execute(h.ctx).success).toBe(true);

        const after = h.stairs.get(sid);
        // ⭐ The GEOMETRY moved — this is what the renderer reads.
        expect(deriveStairSecondRunHandedness(after)).toBe('right');
        expect(after.flights[1].direction.x).toBeCloseTo(1, 9);
        expect(after.flights[1].direction.z).toBeCloseTo(0, 9);
        // ⭐ And the PERSISTED flag moved with it — ProjectLoader:1334 and
        // ImportProjectCommand:975 both map this field, so a reload keeps it.
        expect(after.turnDirection).toBe('right');
        // ⛔ They must not disagree afterwards — that disagreement is the defect
        // that kept this control unpublished in the first place.
        expect(stairSecondRunStampIsStale(after)).toBe(false);
    });

    it('⭐ the FIRST run does not move — the stair keeps its start point', () => {
        const h = makeHarness();
        const sid = makeLStair(h);
        const before = structuredClone(h.stairs.get(sid));
        new UpdateStairParametersCommand({ stairId: sid, updates: { turnDirection: 'right' } }).execute(h.ctx);
        const after = h.stairs.get(sid);
        expect(after.startPosition).toEqual(before.startPosition);
        expect(after.flights[0].direction).toEqual(before.flights[0].direction);
        expect(after.flights[0].riserCount).toBe(before.flights[0].riserCount);
        // The rise invariant survives the turn untouched.
        expect(after.riserHeight * after.riserCount).toBeCloseTo(3.0, 9);
    });

    it('⭐⭐ UNDO returns the previous direction — geometry AND flag', () => {
        const h = makeHarness();
        const sid = makeLStair(h);
        const cmd = new UpdateStairParametersCommand({ stairId: sid, updates: { turnDirection: 'right' } });
        cmd.execute(h.ctx);
        expect(deriveStairSecondRunHandedness(h.stairs.get(sid))).toBe('right');

        expect(cmd.undo(h.ctx).success).toBe(true);
        const back = h.stairs.get(sid);
        expect(deriveStairSecondRunHandedness(back)).toBe('left');
        expect(back.turnDirection).toBe('left');
        expect(back.flights[1].direction.x).toBeCloseTo(-1, 9);
    });

    it('redo is stable — execute() re-resolves and does not double-flip', () => {
        const h = makeHarness();
        const sid = makeLStair(h);
        const cmd = new UpdateStairParametersCommand({ stairId: sid, updates: { turnDirection: 'right' } });
        cmd.execute(h.ctx);
        cmd.undo(h.ctx);
        cmd.execute(h.ctx);                       // CommandManagerImpl.redo() calls execute() directly
        expect(deriveStairSecondRunHandedness(h.stairs.get(sid))).toBe('right');
    });

    it('asking for the direction it already has is a no-op success, not a flip', () => {
        const h = makeHarness();
        const sid = makeLStair(h);
        const cmd = new UpdateStairParametersCommand({ stairId: sid, updates: { turnDirection: 'left' } });
        expect(cmd.canExecute(h.ctx).ok).toBe(true);
        expect(cmd.execute(h.ctx).success).toBe(true);
        expect(deriveStairSecondRunHandedness(h.stairs.get(sid))).toBe('left');
    });
});

describe('§STAIR-SECOND-RUN-DIRECTION — the refusals name what was asked', () => {
    it('⛔ refuses a STRAIGHT stair rather than writing a flag its geometry never reads', () => {
        const h = makeHarness();
        const iid = nextId('sI');
        new CreateStairCommand({
            id: iid, baseLevelId: 'L0', topLevelId: 'L1', shape: 'I',
            riserHeight: 0.15, treadDepth: 0.28, width: 1.0,
            startPosition: { x: 0, y: 0, z: 0 },
            flights: [{ direction: { x: 1, y: 0, z: 0 }, riserCount: 20 }], landings: [],
        } as unknown as CreateStairInput).execute(h.ctx);

        const cmd = new UpdateStairParametersCommand({ stairId: iid, updates: { turnDirection: 'right' } });
        const v = cmd.canExecute(h.ctx);
        expect(v.ok).toBe(false);
        expect(v.blockingIssues!.join(' ')).toMatch(/straight stair has one run/i);
        // ⛔ And execute() refuses identically — the redo path skips canExecute.
        expect(cmd.execute(h.ctx).success).toBe(false);
        expect(h.stairs.get(iid).turnDirection).toBeUndefined();
    });

    it('⛔ refuses secondRunSide on an L — the wrong field is never silently translated', () => {
        const h = makeHarness();
        const sid = makeLStair(h);
        const v = new UpdateStairParametersCommand({ stairId: sid, updates: { secondRunSide: 'right' } }).canExecute(h.ctx);
        expect(v.ok).toBe(false);
        expect(v.blockingIssues!.join(' ')).toContain('does not govern a L-shaped stair');
        expect(v.blockingIssues!.join(' ')).toContain('turnDirection');
    });

    it('⛔ refuses both fields at once — a stair has one shape', () => {
        const h = makeHarness();
        const sid = makeLStair(h);
        const v = new UpdateStairParametersCommand({
            stairId: sid, updates: { turnDirection: 'right', secondRunSide: 'right' },
        }).canExecute(h.ctx);
        expect(v.ok).toBe(false);
        expect(v.blockingIssues!.join(' ')).toMatch(/both supplied/i);
    });
});
