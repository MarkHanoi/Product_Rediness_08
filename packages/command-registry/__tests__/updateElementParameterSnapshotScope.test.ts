// §FIX-SNAPSHOT-SCOPE-MATCHES-WRITE (L-947) — Contract 01 §2.2 / C03 §4.5-4.8 / C16.
//
// THE DEFECT THIS PINS. Founder-reported 2026-08-17:
//   "i create a slab - i change the outline and it gets corrupted and moved from
//    the place."
// Their console printed the proof one line above the write:
//
//   [CommandManager] EXECUTE: UPDATE_ELEMENT_PARAMETER
//   [CommandManager] snapshot commandType="B0" scope=[wall] elapsed=0.5ms
//   [UpdateElementParameterCommand] Updated slab/6e4ede23-…
//
// `scope=[wall]` ON A SLAB WRITE. `UpdateElementParameterCommand` declared
// `readonly affectedStores = ["wall"] as const` — HARD-CODED — while its
// `resolveStore()` routes by `elementType` to FIFTEEN different stores. So for
// every non-wall element type the command wrote store X and CommandManager
// snapshotted store W.
//
// WHY THAT CORRUPTS. `CommandManagerImpl.execute()` takes the Contract 01 §2.2
// transaction snapshot scoped to `command.affectedStores`, and on a throw during
// execution restores it (CommandManagerImpl.ts:284-292, :404-414). With the
// scope pointing at the wrong store the transaction is a LIE in both directions:
//
//   • the store that WAS written (slabStore) is not in the snapshot, so the
//     half-applied write SURVIVES the rollback — the slab keeps a record it was
//     never supposed to keep. That is "corrupted and moved from the place".
//   • the store that was NOT written (wallStore) IS in the snapshot, so the
//     rollback clear()s and re-add()s every wall in the project for an edit that
//     never touched one.
//
// AND IT IS REACHABLE, not theoretical. `SlabStore.update()` commits the map
// entry (SlabStore.ts:266) and THEN fans out through `emit()`, whose
// `storeEventBus.emit(...)` leg (SlabStore.ts:179) is NOT inside the safe-emit
// try/catch that guards the in-process listeners. A throwing bus subscriber —
// exactly the `ViewDependencyTracker._onStoreEvent` / DependencyResolver crash
// already documented in §FIX-SLAB-PARAM-WIPE in this same command — therefore
// unwinds out of `store.update()` with the store ALREADY MUTATED, straight into
// CommandManager's catch. The fakes below reproduce that write-then-throw order
// verbatim.
//
// EVERY ARM THAT PINS THE FIX HAS A POSITIVE CONTROL alongside it that declares
// the pre-fix `['wall']` scope verbatim and asserts it STILL corrupts, so a
// green run can never mean "this scenario never had a defect".

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CommandManager } from '../src/CommandManagerImpl';
import { UpdateElementParameterCommand } from '../src/generic/UpdateElementParameterCommand';
import type { Command, CommandContext, CommandResult, CommandValidationResult } from '../src/types';

// ─────────────────────────────────────────────────────────────────────────────
// Fakes shaped like the real stores at the seams CommandManager actually uses:
//   createSnapshot  → store.getAll()
//   restoreSnapshot → store.clear() then store.add(record) per record
// ─────────────────────────────────────────────────────────────────────────────

interface SlabRec { id: string; levelId: string; polygon: Array<[number, number]>; thickness: number }
interface WallRec { id: string; height: number; materialColor: string }

/** Mirrors SlabStore: update() COMMITS first, then fans out — and the bus leg of
 *  that fan-out is unguarded, so a throwing subscriber escapes a mutated store. */
function makeSlabStore() {
    const slabs = new Map<string, SlabRec>();
    const calls = { getAll: 0, clear: 0, add: 0 };
    /** Set to make the (unguarded) bus fan-out throw, as production does. */
    let busThrows: string | null = null;
    return {
        __calls: calls,
        throwFromBusOnNextUpdate(msg: string) { busThrows = msg; },
        seed(s: SlabRec) { slabs.set(s.id, structuredClone(s)); },
        getById: (id: string) => slabs.get(id),
        getAll() { calls.getAll++; return [...slabs.values()]; },
        clear() { calls.clear++; slabs.clear(); },
        add(s: SlabRec) { calls.add++; slabs.set(s.id, structuredClone(s)); },
        remove(id: string) { slabs.delete(id); },
        update(id: string, nextState: SlabRec) {
            if (!slabs.has(id)) return;
            slabs.set(id, structuredClone(nextState));   // SlabStore.ts:266 — COMMITTED
            const t = busThrows; busThrows = null;
            if (t) throw new Error(t);                    // SlabStore.ts:179 — unguarded
        },
    };
}

function makeWallStore() {
    const walls = new Map<string, WallRec>();
    const calls = { getAll: 0, clear: 0, add: 0, update: 0 };
    return {
        __calls: calls,
        seed(w: WallRec) { walls.set(w.id, { ...w }); },
        /** Object identity matters here: restoreSnapshot's clear()+add() replaces
         *  the stored object with a structuredClone, so identity is the sharpest
         *  probe for "this store was disturbed by an edit that never touched it". */
        rawRef: (id: string) => walls.get(id),
        getById: (id: string) => walls.get(id),
        getAll() { calls.getAll++; return [...walls.values()]; },
        clear() { calls.clear++; walls.clear(); },
        add(w: WallRec) { calls.add++; walls.set(w.id, { ...w }); },
        remove(id: string) { walls.delete(id); },
        update(id: string, updates: Partial<WallRec>) {
            calls.update++;
            const cur = walls.get(id);
            if (!cur) return;
            for (const [k, v] of Object.entries(updates)) {
                if (v !== undefined) (cur as Record<string, unknown>)[k] = v;
            }
        },
    };
}

type SlabStore = ReturnType<typeof makeSlabStore>;
type WallStore = ReturnType<typeof makeWallStore>;

function makeCtx(wallStore: WallStore, slabStore: SlabStore): CommandContext {
    return {
        stores: { wallStore, slabStore },
        bimManager: { getLevels: () => [] },
        projectContext: { activeLevelId: 'L0' },
    } as unknown as CommandContext;
}

const P0: Array<[number, number]> = [[0, 0], [5, 0], [5, 4], [0, 4]];
const P1: Array<[number, number]> = [[0, 0], [6, 0], [6, 4], [0, 4]];

function seedSlab(): SlabRec {
    return { id: 'slab-1', levelId: 'L0', polygon: structuredClone(P0), thickness: 0.2 };
}

function slabParamCmd(parameters: Record<string, unknown>): UpdateElementParameterCommand {
    return new UpdateElementParameterCommand({
        elementId: 'slab-1', elementType: 'slab', parameters,
    });
}

/** THE PRE-FIX COMMAND, VERBATIM — same routing, same write, hard-coded ['wall']
 *  scope. Every positive control below runs THIS, so the arms prove they are
 *  measuring `affectedStores` and nothing else. */
class PreFixSlabParamCommand implements Command {
    readonly affectedStores = ['wall'] as const;   // ← the defect, reproduced
    readonly id = 'prefix-' + Math.random().toString(36).slice(2);
    readonly type = 'UPDATE_ELEMENT_PARAMETER' as never;
    readonly timestamp = Date.now();
    readonly targetIds: string[];
    private prev: Partial<SlabRec> = {};

    constructor(private slabId: string, private parameters: Record<string, unknown>) {
        this.targetIds = [slabId];
    }
    canExecute(): CommandValidationResult { return { ok: true }; }
    execute(ctx: CommandContext): CommandResult {
        const store = (ctx.stores as unknown as { slabStore: SlabStore }).slabStore;
        const existing = store.getById(this.slabId);
        if (!existing) return { success: false, affectedElementIds: [] };
        for (const k of Object.keys(this.parameters)) {
            (this.prev as Record<string, unknown>)[k] = (existing as Record<string, unknown>)[k];
        }
        store.update(this.slabId, { ...existing, ...this.parameters } as SlabRec);
        return { success: true, affectedElementIds: [this.slabId] };
    }
    undo(ctx: CommandContext): CommandResult {
        const store = (ctx.stores as unknown as { slabStore: SlabStore }).slabStore;
        const existing = store.getById(this.slabId);
        if (existing) store.update(this.slabId, { ...existing, ...this.prev } as SlabRec);
        return { success: true, affectedElementIds: [this.slabId] };
    }
    serialize() {
        return { type: this.type, targetIds: this.targetIds, timestamp: this.timestamp, version: 1, payload: {} };
    }
}

// ─────────────────────────────────────────────────────────────────────────────

describe('L-947 §FIX-SNAPSHOT-SCOPE-MATCHES-WRITE — the snapshot scope must name the store the command writes', () => {
    let wallStore: WallStore;
    let slabStore: SlabStore;
    let cm: CommandManager;

    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        wallStore = makeWallStore();
        wallStore.seed({ id: 'w1', height: 3, materialColor: '#aabbcc' });
        slabStore = makeSlabStore();
        slabStore.seed(seedSlab());
        cm = new CommandManager(makeCtx(wallStore, slabStore));
    });

    afterEach(() => { vi.restoreAllMocks(); });

    // ── ARM 1 — the declaration itself, read at the layer that consumes it ────
    it('declares the SLAB store for a slab edit — and CommandManager reads that per-instance value', () => {
        const cmd = slabParamCmd({ polygon: structuredClone(P1) });

        // The declaration.
        expect([...cmd.affectedStores]).toEqual(['slab']);
        // And it is present on the INSTANCE at the moment CommandManager reads it
        // (createSnapshot(command) runs before execute() — CommandManagerImpl.ts:286).
        expect([...(cmd as Command).affectedStores]).not.toContain('wall');

        cm.execute(cmd);
        // OBSERVED at the deciding layer: createSnapshot cloned the slab store…
        expect(slabStore.__calls.getAll).toBeGreaterThan(0);
        // …and never read the wall store it has no business snapshotting.
        expect(wallStore.__calls.getAll).toBe(0);
    });

    it('POSITIVE CONTROL — the pre-fix ["wall"] declaration still snapshots the WRONG store', () => {
        cm.execute(new PreFixSlabParamCommand('slab-1', { polygon: structuredClone(P1) }));
        expect(wallStore.__calls.getAll).toBeGreaterThan(0);   // wall cloned, pointlessly
        expect(slabStore.__calls.getAll).toBe(0);              // slab never protected
    });

    // ── ARM 2 — THE TRANSACTION (Contract 01 §2.2). The real corruption. ──────
    it('rolls the SLAB back when the write fails mid-flight — the half-applied record does not survive', () => {
        // The founder's sequence: change the outline; the store commits and the
        // unguarded bus fan-out then throws.
        slabStore.throwFromBusOnNextUpdate(
            "Cannot read properties of undefined (reading 'includes')",  // ViewDependencyTracker._onStoreEvent
        );
        const result = cm.execute(slabParamCmd({ polygon: structuredClone(P1) }));

        expect(result.success).toBe(false);
        // THE ASSERTION THE DEFECT FAILS: the slab is back at its authored outline.
        expect(slabStore.getById('slab-1')!.polygon).toEqual(P0);
        // …and no phantom undo entry was minted for a command that did not land.
        expect(cm.getHistory()).toHaveLength(0);
    });

    it('POSITIVE CONTROL — with the pre-fix scope the corrupt outline SURVIVES the rollback', () => {
        slabStore.throwFromBusOnNextUpdate('boom');
        const result = cm.execute(new PreFixSlabParamCommand('slab-1', { polygon: structuredClone(P1) }));

        expect(result.success).toBe(false);
        // The defect, reproduced: "rolled back" and yet the slab kept the write.
        expect(slabStore.getById('slab-1')!.polygon).toEqual(P1);
    });

    // ── ARM 3 — THE CONVERSE. A slab-only edit must not disturb the walls. ────
    it('does NOT disturb the wall store — not on success, and not on a rollback', () => {
        const wallRefBefore = wallStore.rawRef('w1');

        cm.execute(slabParamCmd({ thickness: 0.3 }));                       // succeeds
        slabStore.throwFromBusOnNextUpdate('boom');
        cm.execute(slabParamCmd({ polygon: structuredClone(P1) }));         // rolls back

        expect(wallStore.__calls.getAll).toBe(0);   // never snapshotted
        expect(wallStore.__calls.clear).toBe(0);    // never wiped
        expect(wallStore.__calls.add).toBe(0);      // never re-added
        // Identity, not just value: clear()+add() replaces the record object and
        // fires a remove-all/add-all storm at every renderer subscriber.
        expect(wallStore.rawRef('w1')).toBe(wallRefBefore);
        expect(wallStore.getById('w1')).toEqual({ id: 'w1', height: 3, materialColor: '#aabbcc' });
    });

    it('POSITIVE CONTROL — the pre-fix scope wipes and rebuilds every wall for a slab edit', () => {
        const wallRefBefore = wallStore.rawRef('w1');
        slabStore.throwFromBusOnNextUpdate('boom');
        cm.execute(new PreFixSlabParamCommand('slab-1', { polygon: structuredClone(P1) }));

        expect(wallStore.__calls.clear).toBe(1);
        expect(wallStore.__calls.add).toBe(1);
        expect(wallStore.rawRef('w1')).not.toBe(wallRefBefore);   // a different object now
    });

    // ── ARM 4 — the MANDATED user-visible round-trip, end to end. ─────────────
    it('create slab → change the outline → Ctrl+Z → the SLAB record is restored, walls untouched', () => {
        const wallRefBefore = wallStore.rawRef('w1');

        const r = cm.execute(slabParamCmd({ polygon: structuredClone(P1) }));
        expect(r.success).toBe(true);
        expect(slabStore.getById('slab-1')!.polygon).toEqual(P1);
        expect(cm.getHistory()).toHaveLength(1);

        cm.undo();

        expect(slabStore.getById('slab-1')!.polygon).toEqual(P0);
        // The whole record survived the round-trip — no field was dropped by a
        // partial write (§FIX-SLAB-PARAM-WIPE) and none was invented.
        expect(slabStore.getById('slab-1')).toEqual(seedSlab());
        // The converse, through the full gesture.
        expect(wallStore.rawRef('w1')).toBe(wallRefBefore);
        expect(wallStore.__calls.getAll).toBe(0);
    });

    // ── ARM 5 — a failed slab edit followed by Ctrl+Z lands on the AUTHORED
    //           state, which is the founder's actual sequence. ────────────────
    it('a failed outline edit then Ctrl+Z lands on the authored outline, not a half-written one', () => {
        cm.execute(slabParamCmd({ thickness: 0.3 }));                 // gesture 1, succeeds
        slabStore.throwFromBusOnNextUpdate('boom');
        cm.execute(slabParamCmd({ polygon: structuredClone(P1) }));   // gesture 2, fails

        cm.undo();                                                     // undo gesture 1

        expect(slabStore.getById('slab-1')).toEqual(seedSlab());
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ARM 6 — THE ANTI-DRIFT INVARIANT.
//
// The fix is only durable if the declaration and the write cannot disagree
// again. This arm does not read the routing table; it OBSERVES which store each
// element type's execute() actually wrote, and requires that store to be
// declared. A future element type added to the routing switch without a scope —
// or a scope copied into a second, drifting switch — fails here.
// ─────────────────────────────────────────────────────────────────────────────

/** A store that records every write against the StoreKey it is registered under. */
function makeRecorder(key: string, written: Set<string>) {
    const rec: Record<string, unknown> = { id: 'e-1', wallId: 'w1', height: 3, properties: {} };
    // ⭐ §PARAM-DROP-IS-A-REFUSAL (L-3200) — THE WRITE MUST ACTUALLY PERSIST.
    //
    // These three mutators used to be `{ written.add(key); }` — they recorded that a
    // write happened and threw the values away. That was invisible while the command
    // reported success straight off `applyUpdate`, and it became visible the moment the
    // command started READING BACK what landed: eighteen of these twenty arms began
    // failing with "materialColor did not land", because on this fake it genuinely
    // did not.
    //
    // That is the `fake-more-capable-than-real` defect INVERTED, and it is just as
    // misleading — a stand-in that accepts a call and keeps nothing cannot tell a
    // working store from a dropping one. Merging the patch is what a real store does
    // (`WallStore.update`, `SlabStore.update`, `HandrailStore.update` all merge or
    // replace), so this makes the fake MORE faithful, not more permissive.
    //
    // ⚠ The arm's own subject is UNCHANGED: `written.add(key)` still records which
    // store received the write, which is the whole assertion below.
    const merge = (_id: string, updates: unknown) => {
        written.add(key);
        if (updates !== null && typeof updates === 'object') {
            for (const [k, v] of Object.entries(updates as Record<string, unknown>)) {
                rec[k] = v;
            }
        }
    };
    return {
        __key: key,
        getById: (_id: string) => rec,
        get: (_id: string) => rec,
        getAll: () => [rec],
        getDoor: (_id: string) => rec,
        getWindow: (_id: string) => rec,
        has: (_id: string) => false,
        clear() { /* snapshot restore */ },
        add() { /* snapshot restore */ },
        remove() { /* noop */ },
        update: merge,
        updateDoor: merge,
        updateWindow: merge,
    };
}

/** elementType → the StoreKey the write is expected to land on. Derived from the
 *  routing switch's own `case` labels, INCLUDING every alias, so a type that
 *  routes but was never given a scope shows up as an unlisted write below. */
const ROUTED_TYPES: readonly string[] = [
    'wall', 'slab', 'column', 'beam', 'stair', 'stairs',
    'curtainwall', 'curtain-wall', 'roof',
    'furniture', 'bed', 'table', 'chair', 'sofa',
    'wardrobe', 'wardrobe_glass_door', 'corner_wardrobe',
    'handrail', 'window', 'door',
];

describe('L-947 anti-drift — every store the command WRITES is a store it DECLARED', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => { vi.restoreAllMocks(); });

    for (const t of ROUTED_TYPES) {
        it(`'${t}' — the store it writes is inside affectedStores`, () => {
            const written = new Set<string>();
            const ctx = {
                stores: {
                    wallStore:        makeRecorder('wall', written),
                    slabStore:        makeRecorder('slab', written),
                    columnStore:      makeRecorder('column', written),
                    beamStore:        makeRecorder('beam', written),
                    stairStore:       makeRecorder('stair', written),
                    curtainWallStore: makeRecorder('curtainWall', written),
                    roofStore:        makeRecorder('roof', written),
                    furnitureStore:   makeRecorder('furniture', written),
                    handrailStore:    makeRecorder('handrail', written),
                },
                bimManager: { getLevels: () => [] },
                projectContext: { activeLevelId: 'L0' },
            } as unknown as CommandContext;

            const cmd = new UpdateElementParameterCommand({
                elementId: 'e-1', elementType: t, parameters: { materialColor: '#123456' },
            });
            const declared = new Set<string>(cmd.affectedStores as readonly string[]);

            const res = cmd.execute(ctx);
            // Every routed type must actually route — a silent "no store" here
            // would make the assertion below vacuously true.
            expect(res.success, `'${t}' did not route to a store`).toBe(true);
            expect(written.size, `'${t}' wrote nothing`).toBeGreaterThan(0);

            for (const w of written) {
                expect(
                    declared.has(w),
                    `'${t}' WROTE store '${w}' but declared [${[...declared].join(', ')}] — ` +
                    'the Contract 01 §2.2 snapshot would protect the wrong store.',
                ).toBe(true);
            }
        });
    }

    it('an UNROUTED element type declares no scope and writes nothing', () => {
        const written = new Set<string>();
        const ctx = {
            stores: { wallStore: makeRecorder('wall', written), slabStore: makeRecorder('slab', written) },
            bimManager: { getLevels: () => [] },
        } as unknown as CommandContext;

        const cmd = new UpdateElementParameterCommand({
            elementId: 'e-1', elementType: 'sprinkler-head', parameters: { materialColor: '#123456' },
        });
        expect(cmd.execute(ctx).success).toBe(false);
        expect(written.size).toBe(0);
        // Empty is the honest declaration for "routes nowhere": CommandManager
        // reads length-0 as "undeclared" and falls back to the all-stores
        // snapshot, which is the safe over-approximation for a path that has not
        // told it anything. It must NOT claim 'wall'.
        expect([...cmd.affectedStores]).not.toContain('wall');
    });
});
