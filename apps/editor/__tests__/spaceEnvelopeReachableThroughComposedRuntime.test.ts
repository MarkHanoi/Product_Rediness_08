/**
 * @vitest-environment happy-dom
 */
// spaceEnvelopeReachableThroughComposedRuntime — §FEAT-SPACE-ENVELOPE (L-12900).
//   **C114** §2 / §6 / §7 / §9 / §11 / §14a · ADR-0380 · C16 CA-21 · C13 · C47 ·
//   C84 EI-1 / EI-6 · C03 §4.6.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ WHY THIS FILE EXISTS WHEN `plugins/space-envelope/__tests__` IS ALREADY GREEN
// ═══════════════════════════════════════════════════════════════════════════════
//
// That suite says so itself, in its own header: it *"DOES NOT ESTABLISH that the
// family is reachable from the COMPOSED runtime, that it persists into a project
// snapshot, or that anything draws it."* It builds a `CommandBus`, a
// `SpaceEnvelopeStore` and an `UndoStack` BY HAND — which is the right way to prove
// what a handler DOES, and proves nothing at all about what the browser holds.
//
// [[committed-is-not-reachable]] is the memory: four fixes in one session ran
// nowhere. `boundaryLineReachableThroughComposedRuntime` was GREEN on all 13 of its
// cases while the founder's #1 blocker was that `composeRuntime()` produced a runtime
// with `stores.boundaryLine === undefined` — because it booted the DATA half
// directly. P1 makes `composeRuntime()` the only way production obtains a runtime, so
// this file obtains it that way and reads `rt.stores.spaceEnvelope`: the SAME key
// `ProjectSerializer.readPluginStore('spaceEnvelope')` resolves and the SAME key
// `resolveComposedStoreFromWindow('spaceEnvelope')` resolves on undo and on restore.
//
// ⭐ AND THE PERSISTENCE HALF IS THE HEADLINE, NOT AN EXTRA ARM. Measured on the
// commit that introduced the store:
//
//     npx tsx tools/ga-gate/check-snapshot-family-coverage.ts   ->  RC=1
//     "⛔ ARM A — 1 element family/families have a store and NO row saying whether
//      they survive a reload.  · spaceEnvelope"
//
// The tripwire fired exactly as designed. ⛔ AND THE LOSS IT NAMED WOULD HAVE BEEN
// TOTAL RATHER THAN PARTIAL. A balcony that lost its parent still left a slab, a
// finish and railings on screen, which is precisely why nobody noticed for four days
// (L-11530). A space envelope has NO legacy twin, NO member families and NO mirror
// into any other store — C114 §2a declines a plugin DTO twin and a `roomStore` mirror
// by construction — so footprint, height, role, membership and the cited basis vanish
// TOGETHER, leaving nothing behind to hint at it.
//
// ─── STUB LEDGER (read before trusting any green below) ─────────────────────────
//
// Nothing on the measured path is stubbed. The runtime is a real `composeRuntime`;
// the bus is its real bus with its real `UndoStack`; the store is the instance
// `PluginRegistry` built and the bus writes through; the serializer is the one
// `initPersistence.ts` constructs; the restore is the one `ProjectLoader` calls in
// its COMMON TAIL; the undo adapter is the one `buildUndoStoreMap()` returns.
//
// TWO substitutions, both declared:
//  1. `window.runtime = rt` — the REAL composed handle, assigned the one way
//     production assigns it (`engineLauncher.ts`: `if (runtime) window.runtime =
//     runtime`). ⚠ Not the D6 breach the balcony's proof committed: the object is the
//     real runtime, not a literal built to satisfy the reader. ARM A measures the key
//     with no assignment at all, off `rt` directly.
//  2. `serializerBundle()` — inert sentinels for the ~24 LEGACY stores the serializer
//     also reads. They are INPUTS this family does not touch; the `spaceEnvelopes`
//     slice is read off the composed runtime by the serializer's own lazy resolver,
//     not from this bundle.
//
// ⚠ WHAT IS **NOT** PROVEN HERE, stated so nobody reads more into a green run
// (C114 §14a): that a space envelope is DRAWN. Nothing subscribes this store's
// `subscribeDirty` at this commit. `persisted` means the RECORD survives a save and a
// reload — selectable by id, reportable, saveable again — and the render axis is
// untouched and unclaimed. ⛔ Never report a schema's existence as a working element.

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { applyRingBufferSide, RingBufferUndoStack } from '@pryzm/command-bus';
import { composeRuntime } from '@pryzm/runtime-composer';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';
import { SpaceEnvelopeStore } from '@pryzm/plugin-space-envelope';
import { SPACE_ENVELOPE_HANDLER_TYPES } from '@pryzm/plugin-space-envelope';
import { MAXIMUM_BUILDABLE_IS_NOT_AUTHORED } from '@pryzm/schemas';
import { ProjectSerializer } from '../src/engine/persistence/ProjectSerializer';
import { restoreCompoundFamilies } from '../src/engine/persistence/restoreCompoundFamilies';
import { SNAPSHOT_FAMILY_COVERAGE } from '../src/engine/persistence/snapshotFamilyCoverage';
import { buildUndoStoreMap, UNMAPPED_BUS_STORE_KEYS } from '../src/engine/undo/performUndoRedo';

const AUDIT = { actorId: 'space-envelope', projectId: 'space-envelope', clientId: 'node' } as const;
const LEVEL_ID = 'L0';
const BUDGET = 600_000;

/* eslint-disable @typescript-eslint/no-explicit-any */
let rt: any;
let rb: RingBufferUndoStack;
let priorRuntime: unknown;

beforeAll(async () => {
    rt = await composeRuntime({
        audit: AUDIT,
        canvas: null,
        bootstrapFn: bootstrapWithEverything as never,
    });
    priorRuntime = (window as unknown as { runtime?: unknown }).runtime;

    // ⚠ THE RING BUFFER IS ATTACHED EXPLICITLY, AND THE REASON IS A MEASUREMENT
    // RATHER THAN A CONVENIENCE. A first draft of this file read `rt.bus.undo` —
    // the raw `CommandBus`'s legacy `UndoStack` getter — and got `undefined`: the
    // handle `composeRuntime` publishes is not the raw bus, so the ring the
    // application's Ctrl+Z reads is not reachable by that name. Without a ring
    // buffer `CommandBus` skips `_ringBuffer.push()` entirely and NO PatchPair is
    // ever recorded, so a depth assertion would have read 0 forever and passed
    // vacuously on a family that minted nothing. `RingBufferUndoStack` is the same
    // class production installs, attached the same way `strandedUndoRoundTrip.ts`
    // and `liftUndoRoundTrip.ts` attach it — one spelling, not a second.
    rb = new RingBufferUndoStack();
    rt.bus.setRingBuffer(rb);
}, BUDGET);

afterAll(() => {
    (window as unknown as { runtime?: unknown }).runtime = priorRuntime;
    try { rt?.tearDown?.(); } catch { /* non-fatal */ }
});

// ── IDS ──────────────────────────────────────────────────────────────────────
// ⚠ EVERY ID IS A REAL PREFIXED ULID, NOT A READABLE SLUG.
// `defineElement('spaceEnvelope')` enforces
// /^spaceEnvelope_[0-9A-HJKMNP-TV-Z]{26}$/ — Crockford base32, so I, L, O and U are
// excluded. A suite that seeded the store directly would never have met that rule,
// which is one more reason everything below goes through the bus.
const ULID_STEM = '01ARZ3NDEKTSV4RRFFQ69G5F';
function ulidN(n: number): string {
    const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    return ULID_STEM + A[Math.floor(n / 32) % 32] + A[n % 32];
}
const ENV_A = `spaceEnvelope_${ulidN(0)}`;
const ENV_B = `spaceEnvelope_${ulidN(1)}`;
const ENV_C = `spaceEnvelope_${ulidN(2)}`;

/** A 4 × 4 m square at (x0, z0), OPEN (the closing vertex is implied). */
function square(id: string, x0 = 0, z0 = 0, extra: Record<string, unknown> = {}) {
    return {
        spaceEnvelopeId: id,
        levelId: LEVEL_ID,
        footprint: [
            { x: x0, y: 0, z: z0 },
            { x: x0 + 4, y: 0, z: z0 },
            { x: x0 + 4, y: 0, z: z0 + 4 },
            { x: x0, y: 0, z: z0 + 4 },
        ],
        height: 3,
        ...extra,
    };
}

/** ⛔ Read off `rt`, NEVER constructed — a store this file built could falsify nothing. */
function store(): any {
    const s = (rt.stores as Record<string, unknown>)['spaceEnvelope'];
    if (s === undefined) {
        throw new Error(
            '[test] runtime.stores.spaceEnvelope is undefined on the REAL composed runtime — the ' +
            'PluginRegistry descriptor or the StoresSlot key is missing. That is the L-11530 defect ' +
            '(a store that exists and is unreachable) and the L-5200 one (CommandBus.buildContext ' +
            'throws at DISPATCH with the handlers registered).',
        );
    }
    return s;
}

/** ⭐ THE CA-21 READ-BACK. The authoritative record, out of the authoritative store. */
function readBack(id: string): any {
    return store().getState().get(id);
}

function wipe(): void {
    const ids = [...store().getState().keys()];
    if (ids.length > 0) store().applyPatch(ids.map((id: string) => ({ op: 'remove', path: [id] })));
    rb.clear();
}

/** Sentinel for the ~24 LEGACY stores the serializer also reads (declared substitution 2). */
function sentinel(): any {
    return {
        getAll: () => [], getLevels: () => [], isBuiltIn: () => true, getCustom: () => [],
        size: () => 0, serialize: () => ({}), getState: () => new Map(), activeLevelId: LEVEL_ID,
    };
}
function serializerBundle(): any {
    const b: any = {};
    for (const k of [
        'wallStore', 'slabStore', 'columnStore', 'gridStore', 'stairStore', 'beamStore',
        'curtainWallStore', 'roofStore', 'plumbingStore', 'furnitureStore', 'handrailStore',
        'openingStore', 'roomStore', 'ceilingStore', 'floorStore',
        'slabSystemTypeStore', 'wallSystemTypeStore', 'ceilingSystemTypeStore',
        'floorSystemTypeStore', 'doorSystemTypeStore', 'windowSystemTypeStore',
        'handrailTypeStore', 'roomBoundingLineStore', 'curtainPanelStore',
    ]) b[k] = sentinel();
    return b;
}

function saveSnapshot(): any {
    (window as unknown as { runtime: unknown }).runtime = rt;
    return JSON.parse(ProjectSerializer.stringify(
        ProjectSerializer.serialize(serializerBundle(), null as any, { projectName: 'space-envelope' }),
    ));
}

/** The REAL ring depth — the number of Ctrl+Z presses the gesture just cost the user. */
function undoDepth(): number {
    return rb.undoCount();
}

/**
 * Undo ONE ring entry the way `performUndo` does: take the side the ring hands back
 * and apply it through the PRODUCTION `buildUndoStoreMap()`, honouring
 * `affectedStores`. ⛔ Never a hand-rolled inverse — that would prove this file can
 * invert a patch, which nobody doubted.
 */
function undoOne(): void {
    const pair = rb.current();
    expect(pair, 'no PatchPair was minted — there is nothing to undo and nothing to strand').toBeTruthy();
    const side = rb.undoPatch();
    expect(side, 'the ring returned no undo side').toBeTruthy();
    const outcome = applyRingBufferSide(side!, pair!.affectedStores!, buildUndoStoreMap() as never);
    expect(outcome.failed, 'the inverse failed to apply').toEqual([]);
    expect(outcome.applied).toEqual(expect.arrayContaining(['spaceEnvelope']));
}

describe('§FEAT-SPACE-ENVELOPE — the authored volume reaches the composed runtime, and survives a reload', () => {

    it('ARM A — the composition root contributes the `spaceEnvelope` store (the axis that silently throws)', () => {
        expect(store()).toBeInstanceOf(SpaceEnvelopeStore);
        // …and it is the SAME instance the serializer's read channel names. A store
        // can exist and still be unreachable through `window.runtime.stores.<key>` —
        // that gap is what let the `balcony` row read `persisted` for four days.
        (window as unknown as { runtime: unknown }).runtime = rt;
        const viaWindow = (window as unknown as {
            runtime: { stores: Record<string, unknown> };
        }).runtime.stores['spaceEnvelope'];
        expect(viaWindow, 'the READ CHANNEL the serializer uses must resolve').toBe(store());
    }, BUDGET);

    it('ARM B — every declared verb is registered on the REAL bus, and dispatch is what proves it', async () => {
        wipe();
        // ⛔ NOT a descriptor read. A handler can be registered and undispatchable:
        // `CommandBus.buildContext` throws "required store 'spaceEnvelope' is missing
        // from HandlerContext.stores" BEFORE anything mutates when the store
        // descriptor is absent — the trap that bit pool (L-5200), lift (L-5700),
        // lighting, section (L-9922) and bathroomPod (§BATH102).
        await rt.bus.executeCommand('spaceEnvelope.batch.create', { envelopes: [square(ENV_A)] });

        for (const verb of SPACE_ENVELOPE_HANDLER_TYPES) {
            if (verb === 'spaceEnvelope.batch.create') continue;
            // Every remaining verb takes a subject id. A verb that is NOT registered
            // rejects with an "unknown command" shape; a registered verb reaches
            // `canExecute` and rejects (or resolves) on its OWN terms. So the
            // discriminator is the MESSAGE, not the outcome.
            const p = rt.bus.executeCommand(verb, { spaceEnvelopeId: 'spaceEnvelope_missing' });
            await expect(p).rejects.toThrow();
            await p.catch((e: unknown) => {
                expect(String(e), `${verb} must be REGISTERED, not unknown`)
                    .not.toMatch(/unknown command|no handler/i);
            });
        }
    }, BUDGET);

    it('ARM C — create → read back OUT of the authoritative store, with the metrics derived (C16 CA-21)', async () => {
        wipe();
        await rt.bus.executeCommand('spaceEnvelope.batch.create', { envelopes: [square(ENV_A)] });
        const rec = readBack(ENV_A);
        expect(rec, 'THE ENVELOPE IS IN THE ONE STORE').toBeDefined();
        expect(rec.levelId).toBe(LEVEL_ID);
        expect(rec.role, 'the default role is the smaller, safer one').toBe('room');
        expect(rec.standing, 'design intent, always — never a permission').toBe('design-intent');
        // ⭐ The derived pair is RECOMPUTED by the geometry package, never believed
        // from the payload (C114 §2b names ONE writer).
        expect(rec.footprintAreaM2).toBeCloseTo(16, 6);
        expect(rec.volumeM3).toBeCloseTo(48, 6);
    }, BUDGET);

    it('ARM D — ⭐ ONE GESTURE = ONE UNDO, asserted on the REAL bus ring DEPTH, not on the final state', async () => {
        wipe();
        expect(undoDepth(), 'the ring starts empty').toBe(0);

        // THREE envelopes, ONE dispatch. ⚠ `batchCoordinator.runBatch` is
        // undo-NEUTRAL — N commands inside it are N entries — so the ONLY thing that
        // buys one Ctrl+Z is one `produceCommand` inside one handler, which is why
        // C114 §6a declines a singular `spaceEnvelope.create` outright.
        await rt.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [square(ENV_A), square(ENV_B, 10), square(ENV_C, 20)],
        });
        expect(store().getState().size, 'three records').toBe(3);
        expect(undoDepth(), '⭐ THREE ENVELOPES, ONE UNDO ENTRY').toBe(1);

        // A state assertion would pass just as happily with three entries; the depth
        // is the claim, because it is the user's Ctrl+Z that is being spent.
        await rt.bus.executeCommand('spaceEnvelope.move', {
            spaceEnvelopeId: ENV_A, delta: { x: 1, z: 0 },
        });
        expect(undoDepth(), 'each subsequent gesture adds exactly one').toBe(2);
    }, BUDGET);

    it('ARM E — move → undo → IDENTICAL: the inverse RESTORES the geometry, it does not recompute it', async () => {
        wipe();
        (window as unknown as { runtime: unknown }).runtime = rt;
        await rt.bus.executeCommand('spaceEnvelope.batch.create', { envelopes: [square(ENV_A)] });
        const before = JSON.parse(JSON.stringify(readBack(ENV_A)));

        await rt.bus.executeCommand('spaceEnvelope.move', {
            spaceEnvelopeId: ENV_A, delta: { x: 7, y: 2, z: -3 },
        });
        const moved = readBack(ENV_A);
        expect(moved.footprint[0]).toEqual({ x: 7, y: 0, z: -3 });
        // ⭐ The vertical component goes to `baseOffset`, never into the ring — the
        // ring lives on the level plane and the vertical extent has one home.
        expect(moved.baseOffset).toBe(2);
        expect(moved.footprint.every((p: any) => p.y === 0)).toBe(true);

        // Undo through the REAL map with the REAL inverse the bus minted.
        undoOne();

        // ⛔ THE ACCEPTANCE IS BYTE EQUALITY, NOT "looks right". C84 EI-7e records the
        // failure mode this rules out: `RoomTopologyObserver` RECOMPUTES room
        // boundaries from the post-undo wall set instead of restoring them, which is
        // correct for that subsystem and is exactly why ADR-0380 D1 keeps this family
        // out of the room store.
        expect(readBack(ENV_A)).toEqual(before);
    }, BUDGET);

    it('ARM F — delete → undo → RESTORED, and deleting a level envelope does NOT delete the rooms within it (C114 §8)', async () => {
        wipe();
        (window as unknown as { runtime: unknown }).runtime = rt;
        await rt.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [
                square(ENV_A, 0, 0, { role: 'level', height: 3 }),
                square(ENV_B, 1, 1, { role: 'room', withinId: ENV_A, height: 2.7 }),
            ],
        });
        const parentBefore = JSON.parse(JSON.stringify(readBack(ENV_A)));
        const childBefore = JSON.parse(JSON.stringify(readBack(ENV_B)));

        await rt.bus.executeCommand('spaceEnvelope.delete', { spaceEnvelopeId: ENV_A });
        expect(readBack(ENV_A), 'the parent is gone').toBeUndefined();
        // ⛔ `withinId` is a REFERENCE, not ownership. Cascading would destroy an
        // architect's room layout because they removed the storey outline they
        // sketched it against.
        expect(readBack(ENV_B), 'THE CHILD SURVIVES').toBeDefined();
        expect(readBack(ENV_B).withinId, 'and its dangling reference is cleared').toBeNull();

        expect(undoDepth(), 'the delete cost exactly ONE Ctrl+Z').toBe(2);
        undoOne();
        // ONE Ctrl+Z restores the parent AND re-points the child — both halves were in
        // one patch pair by construction.
        expect(readBack(ENV_A)).toEqual(parentBefore);
        expect(readBack(ENV_B)).toEqual(childBefore);
    }, BUDGET);

    it('ARM G — ⭐⭐ SAVE → RELOAD: the authored volume is still there, through the REAL serializer and the REAL restore', async () => {
        wipe();
        await rt.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [
                square(ENV_A, 0, 0, { role: 'level', name: 'Ground floor envelope' }),
                square(ENV_B, 1, 1, { role: 'room', withinId: ENV_A, occupancy: 'living', height: 2.7 }),
            ],
        });
        expect(store().getState().size, 'N BEFORE the save').toBe(2);
        const before = JSON.parse(JSON.stringify([readBack(ENV_A), readBack(ENV_B)]));

        // Cross the JSON boundary, exactly as a save to disk does.
        const saved = saveSnapshot();
        expect(saved.spaceEnvelopes, 'the volumes must be IN THE FILE').toHaveLength(2);
        expect(saved.spaceEnvelopes.map((e: any) => e.id).sort()).toEqual([ENV_A, ENV_B].sort());
        // ⭐ C84 EI-6's counting half: an authored envelope IS an element, so the save
        // log's element count must move. That number is what let the founder count the
        // §PERSIST103 losses at all — *"I can see it is not there"* began as a count.
        expect(saved.elementCount, 'the element count includes the envelopes').toBeGreaterThanOrEqual(2);

        // ── RELOAD ────────────────────────────────────────────────────────────────
        wipe();
        expect(store().getState().size, 'the reload starts from an empty store').toBe(0);

        const result = restoreCompoundFamilies(saved);
        expect(result.errors, 'the restore must report no failures').toEqual([]);
        expect(result.restored['spaceEnvelope'], 'two envelopes restored').toBe(2);

        // ⛔ THE ACCEPTANCE. Read back OUT OF THE AUTHORITATIVE STORE after a full
        // save → JSON → restore — never `result.restored`, which is the restore's own
        // opinion of itself. Byte equality, field for field: the role, the membership,
        // the occupancy tag, the honesty standing and the derived metrics.
        expect([readBack(ENV_A), readBack(ENV_B)]).toEqual(before);
        expect(readBack(ENV_B).withinId, 'the membership edge survives the round trip').toBe(ENV_A);
        expect(readBack(ENV_A).role).toBe('level');
        expect(readBack(ENV_B).occupancy).toBe('living');
    }, BUDGET);

    it('ARM H — NEGATIVE CONTROL for ARM G: an empty store writes NO `spaceEnvelopes` key at all (C47 — omit-when-absent)', () => {
        wipe();
        const saved = saveSnapshot();
        // ⭐ WITHOUT THIS ARM, ARM G's `toHaveLength(2)` could pass on a serializer
        // that wrote a constant. And the omission IS the C47 property: a project with
        // no envelopes produces a snapshot byte-identical to a pre-C114 one, so no
        // `SNAPSHOT_SCHEMA_VERSION` bump and no migration step are owed.
        expect(saved.spaceEnvelopes).toBeUndefined();
        expect(restoreCompoundFamilies(saved).restored['spaceEnvelope']).toBeUndefined();
    }, BUDGET);

    it('ARM I — UNDO IS COVERED: `buildUndoStoreMap()` resolves an adapter, and it is not in the refusal ledger', async () => {
        wipe();
        (window as unknown as { runtime: unknown }).runtime = rt;
        // ⛔ NOT DECORATION. Every verb declares `affectedStores = ['spaceEnvelope']`
        // and `_covered()` is ALL-OR-NOTHING: with no adapter for that key
        // `performUndo` does NOT step the ring cursor and falls through to the legacy
        // `commandManager`, which owns nothing at all for a family with no legacy
        // twin. Ctrl+Z would be a measured no-op — L-11160's *"[Undo] STRANDED … no
        // applyPatch adapter for store(s) [boundaryLine]"*, verbatim.
        const adapter = buildUndoStoreMap()['spaceEnvelope'];
        expect(adapter, 'the `spaceEnvelope` key must have an undo adapter').toBeDefined();
        expect(typeof adapter!.applyPatch).toBe('function');
        // A key can only be in one of the two; a key in both would mean the file
        // contradicts itself.
        expect(UNMAPPED_BUS_STORE_KEYS['spaceEnvelope'], 'adapted, not refused').toBeUndefined();

        await rt.bus.executeCommand('spaceEnvelope.batch.create', { envelopes: [square(ENV_A)] });
        adapter!.applyPatch([{ op: 'remove', path: [ENV_A] } as never]);
        // ⭐ The adapter reached the LIVE store — not a detached instance — which is
        // what `resolveComposedStoreFromWindow` exists to provide and what a cached
        // reference would break on the next recomposition.
        expect(readBack(ENV_A), 'the inverse reverted the REAL record').toBeUndefined();
    }, BUDGET);

    it('ARM J — the refusals refuse ON THE COMPOSED BUS, with the reason the schema owns', async () => {
        wipe();
        // ⛔ C114 §6b / ADR-0380 D2 — the legal ceiling is SOLVED, never drawn. The
        // sentence is the schema's own exported constant; a paraphrase here would be
        // the second copy C84 EI-8a rules out.
        await expect(rt.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [square(ENV_A, 0, 0, { role: 'maximumBuildable' })],
        })).rejects.toThrow(/SOLVED from the zoning rules, not drawn/);
        // …and the sentence the bus carried IS the schema's exported constant, not a
        // paraphrase that could drift from it.
        expect(MAXIMUM_BUILDABLE_IS_NOT_AUTHORED).toMatch(/SOLVED from the zoning rules, not drawn/);
        expect(readBack(ENV_A), 'and nothing was written').toBeUndefined();

        // A zero-height envelope is a footprint pretending to be a volume: every
        // consumer that divides by it produces a confidently wrong number (C114 §12).
        await expect(rt.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [square(ENV_A, 0, 0, { height: 0 })],
        })).rejects.toThrow();

        // The one ENFORCEMENT refusal in the family: a face move that would invert the
        // solid is IMPOSSIBLE, and the reason carries BOTH numbers (C114 §12a).
        await rt.bus.executeCommand('spaceEnvelope.batch.create', { envelopes: [square(ENV_A)] });
        await expect(rt.bus.executeCommand('spaceEnvelope.moveFace', {
            spaceEnvelopeId: ENV_A, face: { kind: 'top' }, deltaM: -99,
        })).rejects.toThrow(/asks for .* the limit is /);
        // ⭐ AND THE REFUSAL LEFT THE MODEL ALONE. A refusal that half-mutated would
        // be worse than the move it declined.
        expect(readBack(ENV_A).height).toBe(3);
    }, BUDGET);

    it('ARM K — the snapshotFamilyCoverage row claims `persisted`, and ARM G is what that claim rests on (audit R11)', () => {
        const row = SNAPSHOT_FAMILY_COVERAGE.find((r) => r.storeKey === 'spaceEnvelope');
        expect(row, 'the family must have a coverage row — ARM A of the gate').toBeDefined();
        expect(row!.status).toBe('persisted');
        expect(row!.snapshotKey).toBe('spaceEnvelopes');
        // ⛔ THE ROW IS NOT THE PROOF, AND THIS ARM EXISTS TO SAY SO IN CODE. The
        // `balcony` row read `persisted` for FOUR DAYS while every balcony was
        // destroyed on reload, because `check-snapshot-family-coverage.ts` verifies
        // that a snapshot FIELD exists and that `serialize()` writes it — never that
        // the writer can READ its store. This arm only pins that the row and the code
        // agree about WHICH key, so the two cannot drift apart in silence.
        expect(row!.reason.length).toBeGreaterThan(0);
    }, BUDGET);
});
