// ─── §FIX-TYPE-SWAP-ALL-FAMILIES (L-623) — element.changeType coverage + ring parity ──
//
// The uniform "change element type" surface (ADR-0105) is the ONE command every caller —
// the property panel, the AI plane, the Data panel, collaboration replay — uses to swap a
// PLACED element's type in place. It shipped covering wall / furniture / floor / slab /
// door / window / ceiling / plumbing and SILENTLY IGNORED every other family
// (`console.warn(... — ignored)` and a resolved promise, so the caller's `.then()` fired
// and the panel re-rendered as if it had worked).
//
// This spec pins, per newly covered family:
//   (1) ROUTING — the dispatch reaches the LEGACY command that owns the GEOMETRY store the
//       fragment builder subscribes to (the ADR-0105 invariant), with the right payload;
//   (2) IN PLACE — the element id is unchanged by the swap;
//   (3) RING PARITY — exactly ONE invertible whole-element `replace` PatchPair is pushed
//       on the SAME id, under the `affectedStores` key `buildUndoStoreMap()` covers.
//       Without it, ring-first Ctrl+Z pops the element's earlier CREATE and DELETES it
//       (§FIX-FURNITURE-TYPE-LIST-AND-UNDO L-68), which is what every one of these
//       families did;
//   (4) THE `changed` GUARD — a command that mutates nothing (a rejected canExecute)
//       pushes NO ring entry, so a refused swap cannot produce a phantom Ctrl+Z.
//
// It drives the REAL initBusHandlers registration against a fake bus + fake commandManager,
// so it fails if the branch is deleted, misrouted, or loses its ring push.

import { describe, it, expect, beforeEach } from 'vitest';
import { initBusHandlers } from '../initBusHandlers';

// ── Test doubles ─────────────────────────────────────────────────────────────

/** The bus handler shape initBusHandlers registers: `(ctx, cmd)`, ctx-first. */
interface RegisteredHandler {
    type: string;
    canExecute(ctx: unknown, cmd: unknown): { valid: boolean; reason?: string };
    execute(ctx: unknown, cmd: unknown): unknown;
}

interface RingEntry {
    forward: { ops: Array<{ op: string; path: string; value: unknown }> };
    inverse: { ops: Array<{ op: string; path: string; value: unknown }> };
    affectedStores: string[];
}

/** Records every command object handed to `commandManager.execute`. */
const executed: unknown[] = [];
/** Records every PatchPair pushed onto the undo ring buffer. */
const ringPushes: RingEntry[] = [];
/** The registered bus handlers, by type. */
let handlers: Map<string, RegisteredHandler>;

/**
 * A faithful-enough legacy element store: `getById`/`get` return the live record and
 * `update` merges — the same shape every `window.<x>Store` exposes. `mutateOnExecute`
 * lets a test simulate a command that REFUSES (mutates nothing), to pin the `changed` guard.
 */
function makeStore(record: Record<string, unknown>) {
    const map = new Map<string, Record<string, unknown>>([[record.id as string, record]]);
    return {
        get:     (id: string) => map.get(id),
        getById: (id: string) => map.get(id),
        update:  (id: string, updates: Record<string, unknown>) => {
            const cur = map.get(id);
            if (!cur) return undefined;
            const merged = { ...cur, ...updates };
            map.set(id, merged);
            return merged;
        },
    };
}

type AnyWindow = Record<string, unknown>;

/** Every `window.<x>Store` global a newly covered `element.changeType` branch reads. */
const GEOMETRY_STORE_GLOBALS = [
    'stairStore', 'columnStore', 'beamStore', 'handrailStore',
    'roofStore', 'lightingStore', 'plumbingStore',
    // §FIX-STAIR-RAILING-TYPE-PICKER — a STAIR's railing is a separate element in a
    // separate store; L-623 covered only the standalone handrail, so this family fell
    // through to the `console.warn(… ignored)` default and the panel offered no picker.
    'stairRailingStore',
] as const;

function installEnvironment(): void {
    executed.length = 0;
    ringPushes.length = 0;
    handlers = new Map();

    const w = window as unknown as AnyWindow;

    // The legacy commandManager. It records the command object (so the ROUTING assertion
    // can name the class), then applies a marker write to the target element's geometry
    // store — standing in for the store write the real command performs. This spec pins
    // the BRIDGE's contract ("a swap that mutated ⇒ exactly one invertible ring entry on
    // the same id"), not the commands' internals: each legacy command's own store write,
    // rebuild trigger and undo are pinned by its own suite (e.g. hostedTypeChange.test.ts,
    // stairParamRebuild.test.ts). Driving it off the public `targetIds` keeps the stub from
    // encoding any per-family field knowledge it could get wrong.
    let swapSeq = 0;
    w.commandManager = {
        execute: (cmd: unknown) => {
            executed.push(cmd);
            const ids = (cmd as { targetIds?: readonly string[] })?.targetIds ?? [];
            swapSeq += 1;
            for (const id of ids) {
                for (const key of GEOMETRY_STORE_GLOBALS) {
                    const store = w[key] as ReturnType<typeof makeStore> | undefined;
                    if (store?.get(id)) store.update(id, { __swapRevision: swapSeq });
                }
            }
        },
    };

    w.runtime = {
        bus: {
            registry: { has: () => false },
            register: (h: RegisteredHandler) => { handlers.set(h.type, h); },
            ringBuffer: { push: (p: RingEntry) => { ringPushes.push(p); } },
        },
    };

    // Every geometry store the newly covered branches read, seeded with one element.
    w.stairStore    = makeStore({ id: 'st-1',   type: 'stair',    typeId: 'straight-run' });
    w.columnStore   = makeStore({ id: 'col-1',  type: 'column',   profile: 'rectangular', width: 0.3, depth: 0.3 });
    w.beamStore     = makeStore({ id: 'bm-1',   type: 'beam',     sectionType: 'rectangular', width: 0.2, depth: 0.4 });
    w.handrailStore = makeStore({ id: 'hr-1',   type: 'handrail', height: 0.9, fillType: 'open', railProfile: 'round' });
    w.roofStore     = makeStore({ id: 'rf-1',   type: 'roof',     roofType: 'flat' });
    w.lightingStore = makeStore({ id: 'lt-1',   type: 'lighting', fixtureType: 'downlight' });
    w.plumbingStore = makeStore({ id: 'pl-1',   type: 'plumbing', toiletVariant: 'wall-hung' });
    // §FIX-STAIR-RAILING-TYPE-PICKER — a stair's railing (StairRailingConfig).
    w.stairRailingStore = makeStore({
        id: 'sr-1', stairId: 'st-1', side: 'left', railingType: 'flat-bar',
        topRailHeight: 1.1, balusterShape: 'rectangular', balusterWidth: 0.04, material: 'steel',
    });

    initBusHandlers(w.runtime as never);
}

/** Dispatch `element.changeType` through the REGISTERED handler (validation included). */
function changeType(payload: Record<string, unknown>): { valid: boolean; reason?: string } {
    const h = handlers.get('element.changeType');
    if (!h) throw new Error('element.changeType was never registered');
    const ctx = {} as unknown;
    const v = h.canExecute(ctx, payload);
    if (v.valid) h.execute(ctx, payload);
    return v;
}

function lastCommandName(): string {
    return (executed[executed.length - 1] as { constructor: { name: string } })?.constructor?.name;
}

// ── The coverage matrix, as executable assertions ────────────────────────────

describe('element.changeType — §FIX-TYPE-SWAP-ALL-FAMILIES (L-623)', () => {
    beforeEach(() => { installEnvironment(); });

    it('registers the uniform surface', () => {
        expect(handlers.has('element.changeType')).toBe(true);
    });

    /**
     * The families this fix added, with the legacy command each MUST reach, the
     * `affectedStores` key its ring entry MUST carry (these keys are the ones
     * `buildUndoStoreMap()` covers — a typo here means the ring entry is skipped at undo
     * time and the element's CREATE is popped instead), and the swapped element's id.
     */
    const NEWLY_COVERED: Array<{
        family: string;
        id: string;
        newTypeId: string;
        command: string;
        storeKey: string;
    }> = [
        { family: 'stair',    id: 'st-1',  newTypeId: 'l-shaped',    command: 'UpdateStairParametersCommand',    storeKey: 'stair'    },
        { family: 'column',   id: 'col-1', newTypeId: 'circular',    command: 'UpdateColumnCommand',             storeKey: 'column'   },
        { family: 'beam',     id: 'bm-1',  newTypeId: 'UB',          command: 'UpdateBeamCommand',               storeKey: 'beam'     },
        { family: 'railing',  id: 'hr-1',  newTypeId: 'glass-guardrail', command: 'UpdateHandrailCommand',       storeKey: 'handrail' },
        { family: 'roof',     id: 'rf-1',  newTypeId: 'gable',       command: 'UpdateRoofCommand',               storeKey: 'roof'     },
        { family: 'lighting', id: 'lt-1',  newTypeId: 'pendant',     command: 'UpdateLightingParametersCommand', storeKey: 'lighting' },
    ];

    for (const spec of NEWLY_COVERED) {
        describe(`${spec.family}`, () => {
            it('routes to the legacy command that owns the geometry store (ADR-0105)', () => {
                const v = changeType({
                    elementId: spec.id, elementType: spec.family, newTypeId: spec.newTypeId,
                    // The railing family materialises its type — the widget passes the fields.
                    ...(spec.family === 'railing'
                        ? { height: 1.1, thickness: 0.012, baseOffset: 0, fillType: 'glass', railProfile: 'round' }
                        : {}),
                });
                expect(v.valid).toBe(true);
                expect(lastCommandName()).toBe(spec.command);
            });

            it('pushes exactly ONE invertible whole-element replace on the SAME id (L-68 ring parity)', () => {
                changeType({
                    elementId: spec.id, elementType: spec.family, newTypeId: spec.newTypeId,
                    ...(spec.family === 'railing'
                        ? { height: 1.1, thickness: 0.012, baseOffset: 0, fillType: 'glass', railProfile: 'round' }
                        : {}),
                });

                expect(ringPushes).toHaveLength(1);
                const entry = ringPushes[0];
                expect(entry.affectedStores).toEqual([spec.storeKey]);

                // (2)(3) forward and inverse address the SAME, UNCHANGED element id — an
                // inverse on a different id would restore a phantom element.
                expect(entry.forward.ops).toHaveLength(1);
                expect(entry.inverse.ops).toHaveLength(1);
                expect(entry.forward.ops[0].op).toBe('replace');
                expect(entry.inverse.ops[0].op).toBe('replace');
                expect(entry.forward.ops[0].path).toBe(entry.inverse.ops[0].path);
                expect(entry.forward.ops[0].path).toContain(spec.id);
                expect((entry.forward.ops[0].value as { id: string }).id).toBe(spec.id);
                expect((entry.inverse.ops[0].value as { id: string }).id).toBe(spec.id);

                // (3) the inverse is the PRE-swap record and the forward the POST-swap one,
                // so one Ctrl+Z reverses THE SWAP rather than the element's creation.
                expect(entry.forward.ops[0].value).not.toEqual(entry.inverse.ops[0].value);
            });

            it('pushes NO ring entry when the command mutated nothing (no phantom Ctrl+Z)', () => {
                // commandManager that swallows the command — the shape of a rejected
                // canExecute: recorded, but the store is untouched.
                (window as unknown as AnyWindow).commandManager = { execute: () => { /* refused */ } };
                changeType({ elementId: spec.id, elementType: spec.family, newTypeId: spec.newTypeId });
                expect(ringPushes).toHaveLength(0);
            });
        });
    }

    // §FIX-STAIR-RAILING-TYPE-PICKER — the stair-railing family. Not in NEWLY_COVERED
    // because its payload is resolved from the CATALOGUE by the handler (`newTypeId`
    // alone is sufficient) rather than materialised by the widget, which is the whole
    // point of the branch: one projection, reachable identically by the panel, the AI
    // plane and collaboration replay.
    describe('stair-railing', () => {
        it('routes to UpdateStairRailingCommand from a catalogue id alone', () => {
            const v = changeType({ elementId: 'sr-1', elementType: 'stair-railing', newTypeId: 'glass-guardrail' });
            expect(v.valid).toBe(true);
            expect(lastCommandName()).toBe('UpdateStairRailingCommand');
        });

        it('accepts the `stairRailing` spelling too (the store event uses it)', () => {
            changeType({ elementId: 'sr-1', elementType: 'stairRailing', newTypeId: 'timber-baluster' });
            expect(lastCommandName()).toBe('UpdateStairRailingCommand');
        });

        it('pushes exactly ONE invertible replace under the `stairRailing` store key', () => {
            changeType({ elementId: 'sr-1', elementType: 'stair-railing', newTypeId: 'glass-guardrail' });
            expect(ringPushes).toHaveLength(1);
            expect(ringPushes[0].affectedStores).toEqual(['stairRailing']);
            expect((ringPushes[0].inverse.ops[0].value as { id: string }).id).toBe('sr-1');
            expect(ringPushes[0].forward.ops[0].value).not.toEqual(ringPushes[0].inverse.ops[0].value);
        });

        it('REFUSES a type that is not in the catalogue — no command, no ring entry', () => {
            changeType({ elementId: 'sr-1', elementType: 'stair-railing', newTypeId: 'not-a-real-type' });
            expect(executed).toHaveLength(0);
            expect(ringPushes).toHaveLength(0);
        });
    });

    it('plumbing — the L-622 branch now carries ring parity too', () => {
        changeType({
            elementId: 'pl-1', elementType: 'plumbing',
            newTypeId: 'floor-mounted', toiletVariant: 'floor-mounted',
        });
        expect(lastCommandName()).toBe('UpdatePlumbingParametersCommand');
        expect(ringPushes).toHaveLength(1);
        expect(ringPushes[0].affectedStores).toEqual(['plumbing']);
        expect((ringPushes[0].inverse.ops[0].value as { id: string }).id).toBe('pl-1');
    });

    it('`stairs` is accepted as well as `stair` (normalizeType emits the plural)', () => {
        changeType({ elementId: 'st-1', elementType: 'stairs', newTypeId: 'l-shaped' });
        expect(lastCommandName()).toBe('UpdateStairParametersCommand');
    });

    it('`handrail` and `guardrail` are accepted as railing aliases', () => {
        changeType({ elementId: 'hr-1', elementType: 'handrail', newTypeId: 'steel-guardrail', height: 1.1 });
        expect(lastCommandName()).toBe('UpdateHandrailCommand');
        changeType({ elementId: 'hr-1', elementType: 'guardrail', newTypeId: 'timber-baluster', height: 1.0 });
        expect(lastCommandName()).toBe('UpdateHandrailCommand');
    });

    it('still REFUSES a payload with no target type for a non-layer-stack family', () => {
        expect(changeType({ elementId: 'st-1', elementType: 'stair' }).valid).toBe(false);
        expect(executed).toHaveLength(0);
        expect(ringPushes).toHaveLength(0);
    });

    it('an UNROUTED family is still a no-op, and must not fabricate a ring entry', () => {
        // Curtain wall has no type CATALOGUE, so it is deliberately not routed (see the
        // report). The contract for an unrouted family is: warn, mutate nothing, push
        // nothing — never a silent half-swap.
        changeType({ elementId: 'cw-1', elementType: 'curtainwall', newTypeId: 'whatever' });
        expect(executed).toHaveLength(0);
        expect(ringPushes).toHaveLength(0);
    });
});
