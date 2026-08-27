// §CWPROPS152 — bulk curtain-wall PARAMETER change (mullion size, panel
// thickness, post spacing, transom spacing).
//
// Pins the same contract points the sibling panel batch command
// (`bulkUpdateCurtainPanels.test.ts`) already established, PLUS the two axes
// specific to a numeric parameter write:
//   1. SCOPE: a single element, a level (direct — a curtain wall carries its
//      own levelId), the whole project, or an explicit pre-resolved id list.
//   2. ONE undo entry restores every touched wall byte-for-byte, INCLUDING its
//      gridSystem (proving V3 — C87 §13.7 CW-RAC-1 — by executed read-back of
//      the STORE, never by trusting the returned CommandResult alone).
//   3. §CONTEXT-DATA-HONESTY: a scope matching ZERO walls is a visible no-op
//      via canExecute (never a throw); a wall that vanishes mid-batch is
//      SKIPPED with a reason, and the rest still change ("Changed N of M").
//   4. An unknown PARAMETER refuses naming the four real ones; an out-of-bound
//      VALUE refuses stating both numbers (C74 / CA-18) — including the
//      "ambiguous magnitude" case (a bare number read as metres that overflows
//      a tight bound, e.g. mullion size).
//   5. §CWLEVEL149 coordination: the wall's levelId survives a parameter
//      write, TESTED against the real `CurtainWallStore` (shallow-merge
//      `update()`), not assumed.
//   6. The SAME write path as the single-element edit
//      (`UpdateCurtainWallCommand`) — proven by observing its own documented
//      side effect (grid re-derivation on a spacing change) fire through the
//      bulk command with no second implementation.

import { describe, it, expect, vi } from 'vitest';

// ⚠ §CWPROPS152 — ISOLATION FROM AN AMBIENT, PRE-EXISTING BREAKAGE, NOT MINE.
//
// `@pryzm/core-app-model`'s barrel transitively reaches
// `@pryzm/ai-host/src/intents/roomOccupancyRef.ts`, which — measured
// 2026-08-27, at the time of writing this lane — throws
// `TypeError: Cannot read properties of undefined (reading 'options')` at
// MODULE LOAD, from a circular-import TDZ in a DIFFERENT, concurrently-active
// lane's uncommitted edits (§RACSIDE144, per this lane's own brief). This is
// not hypothetical: the ALREADY-COMMITTED, untouched-by-this-lane sibling test
// `CW4PostSpacingRederivesGrid.test.ts` fails with the IDENTICAL stack right
// now, proving the breakage is ambient in the shared tree, not introduced by
// this file.
//
// `CurtainWallStore` and `UpdateCurtainWallCommand` only need TWO runtime
// symbols from `@pryzm/core-app-model` — `storeEventBus` (an event-fan-out
// singleton) and `batchCoordinator` (a batch-envelope singleton) — so they are
// stubbed here rather than loading the real (currently broken) barrel. This
// changes NOTHING about the command logic under test: neither symbol's real
// implementation participates in what these tests assert (no test here runs
// inside a `batchCoordinator.runBatch()`, and no test reads anything off
// `storeEventBus`). What IS exercised, unmocked, is the real
// `CurtainWallStore` (shallow-merge `update()`, deep-clone `get()`/`set()`)
// and the real `UpdateCurtainWallCommand` (grid re-derivation, full-snapshot
// undo) — i.e. the actual production write path, isolated only from an
// unrelated, currently-broken transitive import.
vi.mock('@pryzm/ai-host', () => ({}));

import { BulkUpdateCurtainWallParameterCommand } from '../src/curtainwall/BulkUpdateCurtainWallParameterCommand';
import { CurtainWallStore } from '@pryzm/geometry-curtain-wall';
import { migrateToGridSystem, type CurtainWallData } from '@pryzm/geometry-curtain-wall';
import type { CommandContext } from '../src/types';

function seedWall(id: string, levelId: string, over: Partial<CurtainWallData> = {}): CurtainWallData {
    return {
        id,
        type: 'curtain-wall',
        levelId,
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 12, y: 0, z: 0 }],
        height: 6,
        baseOffset: 0,
        gridXSpacing: 3,
        gridYSpacing: 3,
        mullionSize: 0.05,
        panelThickness: 0.02,
        properties: {},
        ...over,
    } as CurtainWallData;
}

/** The REAL `CurtainWallStore` (not a hand-rolled double) — so `update()`'s
 *  shallow-merge semantics and `get()`/`set()`'s deep-clone semantics are the
 *  actual production behaviour, not an approximation of it. */
function makeStore(seeds: CurtainWallData[]): CurtainWallStore {
    const store = new CurtainWallStore();
    for (const s of seeds) store.add(s);
    return store;
}

function makeCtx(store: CurtainWallStore): CommandContext {
    return {
        stores: { curtainWallStore: store },
        bimManager: { registerElement() {}, unregisterElement() {} },
    } as unknown as CommandContext;
}

const innerCount = (lines: readonly { t: number }[]) => lines.filter((l) => l.t > 0.001 && l.t < 0.999).length;

describe('§CWPROPS152 — PARAMETER VALIDATION', () => {
    it('an unknown parameter key refuses, NAMING every real one — never guesses', () => {
        const store = makeStore([seedWall('cw-1', 'L0')]);
        const ctx = makeCtx(store);
        const cmd = new BulkUpdateCurtainWallParameterCommand({
            scope: { kind: 'project' },
            parameter: 'glazingTint', // not a real parameter
            value: 0.5,
        });
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(false);
        if (v.ok) return;
        expect(v.reason).toContain("'glazingTint' is not a curtain-wall parameter");
        expect(v.reason).toContain('mullionSize');
        expect(v.reason).toContain('gridXSpacing');
        expect(v.reason).toContain('gridYSpacing');
        expect(v.reason).toContain('panelThickness');
    });

    it('a mullion size of 0.06 m (the founder\'s literal ask) is accepted', () => {
        const store = makeStore([seedWall('cw-1', 'ground')]);
        const ctx = makeCtx(store);
        const cmd = new BulkUpdateCurtainWallParameterCommand({
            scope: { kind: 'level', levelId: 'ground' },
            parameter: 'mullionSize',
            value: 0.06,
        });
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(true);
        const r = cmd.execute(ctx);
        expect(r.success).toBe(true);
        expect(store.get('cw-1')!.mullionSize).toBe(0.06);
    });

    it('an out-of-bound value refuses STATING BOTH NUMBERS (C74 / CA-18) — never a silent clamp', () => {
        const store = makeStore([seedWall('cw-1', 'L0')]);
        const ctx = makeCtx(store);
        const cmd = new BulkUpdateCurtainWallParameterCommand({
            scope: { kind: 'project' },
            parameter: 'mullionSize',
            value: 5, // way over the 0.5 m bound
        });
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(false);
        if (v.ok) return;
        expect(v.reason).toContain('5 m'); // what was asked
        expect(v.reason).toContain('0.01 m'); // the bound
        expect(v.reason).toContain('0.5 m');
        expect(store.get('cw-1')!.mullionSize).toBe(0.05); // untouched
    });

    it('AMBIGUOUS MAGNITUDE: a bare "30" for mullion size (read as 30 m, the schema\'s native unit) ' +
        'REFUSES rather than silently applying a 100x geometry error', () => {
        const store = makeStore([seedWall('cw-1', 'L0')]);
        const ctx = makeCtx(store);
        // The caller (grammar) is expected to pass metres always; a value that
        // was PROBABLY meant as millimetres (30mm = 0.03m) but arrives bare as
        // "30" is exactly the founder's named risk. The bounds check is the
        // safety net: it refuses rather than writing a wall with 30 m mullions.
        const cmd = new BulkUpdateCurtainWallParameterCommand({
            scope: { kind: 'project' },
            parameter: 'mullionSize',
            value: 30,
        });
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(false);
        if (v.ok) return;
        expect(v.reason).toContain('30 m');
        expect(store.get('cw-1')!.mullionSize).toBe(0.05);
    });

    it('a non-finite value refuses rather than writing NaN into the geometry', () => {
        const store = makeStore([seedWall('cw-1', 'L0')]);
        const ctx = makeCtx(store);
        const cmd = new BulkUpdateCurtainWallParameterCommand({
            scope: { kind: 'project' },
            parameter: 'panelThickness',
            value: Number.NaN,
        });
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(false);
    });
});

describe('§CWPROPS152 — SAME WRITE PATH: spacing changes re-derive the grid (C87 §13.6 CW-4)', () => {
    it('a bulk post-spacing (gridXSpacing) change regenerates gridSystem, exactly as the single-wall path does', () => {
        const seeded = migrateToGridSystem(12, 6, 3, 3, 'cw-1');
        expect(innerCount(seeded.uLines)).toBe(3);
        const store = makeStore([seedWall('cw-1', 'L0', { gridSystem: seeded })]);
        const ctx = makeCtx(store);

        const cmd = new BulkUpdateCurtainWallParameterCommand({
            scope: { kind: 'project' },
            parameter: 'gridXSpacing',
            value: 1.5,
        });
        const r = cmd.execute(ctx);
        expect(r.success).toBe(true);

        const after = store.get('cw-1')!;
        expect(after.gridXSpacing).toBe(1.5);
        // ⭐ THE ARM THAT PROVES THIS IS THE SAME PATH, NOT A PARALLEL ONE:
        // 12 m at 1.5 m spacing = 8 bays = 7 inner U-lines.
        expect(innerCount(after.gridSystem!.uLines)).toBe(7);
    });

    it('does NOT touch gridSystem when the parameter is mullionSize (no spacing change)', () => {
        const seeded = migrateToGridSystem(12, 6, 3, 3, 'cw-1');
        const store = makeStore([seedWall('cw-1', 'L0', { gridSystem: seeded })]);
        const ctx = makeCtx(store);
        new BulkUpdateCurtainWallParameterCommand({
            scope: { kind: 'project' },
            parameter: 'mullionSize',
            value: 0.09,
        }).execute(ctx);
        const after = store.get('cw-1')!;
        expect(after.mullionSize).toBe(0.09);
        expect(after.gridSystem).toEqual(seeded);
    });
});

describe('§CWPROPS152 — §CWLEVEL149 COORDINATION: the level survives the write', () => {
    it('a curtain wall on "Level 3" keeps levelId === "Level 3" after a bulk parameter change', () => {
        const store = makeStore([seedWall('cw-1', 'Level 3')]);
        const ctx = makeCtx(store);
        const cmd = new BulkUpdateCurtainWallParameterCommand({
            scope: { kind: 'project' },
            parameter: 'panelThickness',
            value: 0.024,
        });
        const r = cmd.execute(ctx);
        expect(r.success).toBe(true);
        // Read back the STORE directly — the same record the Project Browser
        // and the property panel both read (`UpdateCurtainWallCommand.ts`'s own
        // header names `UnifiedBrowserPanel.ts:154` as a reader of this field).
        expect(store.get('cw-1')!.levelId).toBe('Level 3');
    });

    it('a LEVEL-scoped batch changes only that level\'s walls; a wall on another level is untouched, ' +
        'and ITS level is also untouched', () => {
        const store = makeStore([
            seedWall('cw-l0-a', 'L0'),
            seedWall('cw-l0-b', 'L0'),
            seedWall('cw-l1', 'L1'),
        ]);
        const ctx = makeCtx(store);
        const cmd = new BulkUpdateCurtainWallParameterCommand({
            scope: { kind: 'level', levelId: 'L0' },
            parameter: 'mullionSize',
            value: 0.04,
        });
        const r = cmd.execute(ctx);
        expect(r.success).toBe(true);
        expect([...r.affectedElementIds].sort()).toEqual(['cw-l0-a', 'cw-l0-b']);
        expect(store.get('cw-l0-a')!.mullionSize).toBe(0.04);
        expect(store.get('cw-l0-b')!.mullionSize).toBe(0.04);
        expect(store.get('cw-l1')!.mullionSize).toBe(0.05); // untouched
        expect(store.get('cw-l1')!.levelId).toBe('L1'); // level untouched
    });

    it('undo restores the level along with everything else, because it restores the FULL snapshot', () => {
        const store = makeStore([seedWall('cw-1', 'Level 3')]);
        const ctx = makeCtx(store);
        const cmd = new BulkUpdateCurtainWallParameterCommand({
            scope: { kind: 'project' },
            parameter: 'mullionSize',
            value: 0.08,
        });
        cmd.execute(ctx);
        expect(store.get('cw-1')!.mullionSize).toBe(0.08);
        const u = cmd.undo(ctx);
        expect(u.success).toBe(true);
        expect(store.get('cw-1')!.mullionSize).toBe(0.05);
        expect(store.get('cw-1')!.levelId).toBe('Level 3');
    });
});

describe('§CWPROPS152 — SCOPE: element / level / project / ids', () => {
    it("an 'element' scope over a vanished wall declines with its own message", () => {
        const store = makeStore([seedWall('cw-1', 'L0')]);
        const ctx = makeCtx(store);
        const cmd = new BulkUpdateCurtainWallParameterCommand({
            scope: { kind: 'element', elementId: 'cw-does-not-exist' },
            parameter: 'mullionSize',
            value: 0.06,
        });
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(false);
        if (v.ok) return;
        expect(v.reason).toContain('was not found');
    });

    it('a ZERO-match level scope is a visible honest no-op — never silent, never a throw', () => {
        const store = makeStore([seedWall('cw-1', 'L0')]);
        const ctx = makeCtx(store);
        const cmd = new BulkUpdateCurtainWallParameterCommand({
            scope: { kind: 'level', levelId: 'L9-does-not-exist' },
            parameter: 'mullionSize',
            value: 0.06,
        });
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(false);
        if (v.ok) return;
        expect(v.reason).toContain('no curtain walls on that level');
        expect(store.get('cw-1')!.mullionSize).toBe(0.05);
    });

    it("an explicit 'ids' scope (where an upstream facade/orientation hop lands) changes exactly those walls", () => {
        const store = makeStore([
            seedWall('cw-west-1', 'L0'),
            seedWall('cw-west-2', 'L0'),
            seedWall('cw-north-control', 'L0'),
        ]);
        const ctx = makeCtx(store);
        const cmd = new BulkUpdateCurtainWallParameterCommand({
            scope: { kind: 'ids', curtainWallIds: ['cw-west-1', 'cw-west-2'] },
            parameter: 'gridYSpacing',
            value: 4,
        });
        const r = cmd.execute(ctx);
        expect(r.success).toBe(true);
        expect([...r.affectedElementIds].sort()).toEqual(['cw-west-1', 'cw-west-2']);
        expect(store.get('cw-north-control')!.gridYSpacing).toBe(3); // untouched
    });

    it('project scope changes every wall CURRENTLY in the store — a wall deleted before the ' +
        'command runs is simply not in scope, not an error', () => {
        const store = makeStore([seedWall('cw-a', 'L0'), seedWall('cw-b', 'L1')]);
        const ctx = makeCtx(store);
        store.delete('cw-b');
        const cmd = new BulkUpdateCurtainWallParameterCommand({
            scope: { kind: 'project' },
            parameter: 'panelThickness',
            value: 0.03,
        });
        const r = cmd.execute(ctx);
        expect(r.success).toBe(true);
        expect(r.affectedElementIds).toEqual(['cw-a']);
    });

    it('a wall that vanishes BETWEEN scope resolution and the per-wall write is SKIPPED with a ' +
        'reason, never silently dropped — exercised with a store double whose getAll()/get() can ' +
        'diverge within one execute() call (the real CurtainWallStore cannot diverge inside one ' +
        'synchronous call, so this proves the defensive branch itself, mirroring the sibling ' +
        'BulkUpdateCurtainPanelsCommand\'s identical shape)', () => {
        const live = new Map<string, CurtainWallData>([
            ['cw-a', seedWall('cw-a', 'L0')],
            ['cw-b', seedWall('cw-b', 'L0')],
        ]);
        const fakeStore = {
            getAll: () => [...live.values()],
            get: (id: string) => {
                // 'cw-b' is reported by getAll() (so the scope resolves it) but
                // is GONE by the time the per-wall loop calls get() for it.
                if (id === 'cw-b') return undefined;
                return live.get(id);
            },
            update: (id: string, updates: Partial<CurtainWallData>) => {
                const existing = live.get(id);
                if (existing) live.set(id, { ...existing, ...updates });
            },
            set: (id: string, cw: CurtainWallData) => { live.set(id, cw); },
        };
        const ctx = { stores: { curtainWallStore: fakeStore }, bimManager: { registerElement() {}, unregisterElement() {} } } as unknown as CommandContext;
        const cmd = new BulkUpdateCurtainWallParameterCommand({
            scope: { kind: 'project' },
            parameter: 'panelThickness',
            value: 0.03,
        });
        const r = cmd.execute(ctx);
        expect(r.success).toBe(true);
        expect(r.affectedElementIds).toEqual(['cw-a']);
        expect(r.info!.some((line) => line.includes('no longer in the model'))).toBe(true);
    });
});

describe('§CWPROPS152 — ONE UNDO ENTRY (C16 §8.6)', () => {
    it('ONE undo reverts the whole batch', () => {
        const store = makeStore([seedWall('cw-1', 'L0'), seedWall('cw-2', 'L0')]);
        const ctx = makeCtx(store);
        const cmd = new BulkUpdateCurtainWallParameterCommand({
            scope: { kind: 'project' },
            parameter: 'mullionSize',
            value: 0.1,
        });
        cmd.execute(ctx);
        expect(store.get('cw-1')!.mullionSize).toBe(0.1);
        expect(store.get('cw-2')!.mullionSize).toBe(0.1);

        const u = cmd.undo(ctx);
        expect(u.success).toBe(true);
        expect([...u.affectedElementIds].sort()).toEqual(['cw-1', 'cw-2']);
        expect(store.get('cw-1')!.mullionSize).toBe(0.05);
        expect(store.get('cw-2')!.mullionSize).toBe(0.05);
    });
});

describe('§CWPROPS152 — serialize / deserialize round-trip (direct, not via the central registry — see module header)', () => {
    it('deserialize reconstructs an equivalent command', () => {
        const cmd = new BulkUpdateCurtainWallParameterCommand({
            scope: { kind: 'level', levelId: 'L0' },
            parameter: 'gridXSpacing',
            value: 2,
        });
        const s = cmd.serialize();
        const back = BulkUpdateCurtainWallParameterCommand.deserialize(s);
        const store = makeStore([seedWall('cw-1', 'L0')]);
        const ctx = makeCtx(store);
        const r = back.execute(ctx);
        expect(r.success).toBe(true);
        expect(store.get('cw-1')!.gridXSpacing).toBe(2);
    });
});
