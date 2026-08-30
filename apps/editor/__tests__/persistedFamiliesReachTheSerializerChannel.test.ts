/**
 * @vitest-environment happy-dom
 */
// persistedFamiliesReachTheSerializerChannel —
//   §PERSIST-BALCONY (L-11530) · §FIX-BOUNDARY-LINE-RESTORE-STRANDED (L-11528)
//   C13 · C47 · C67 rule 12 · C84 EI-6 · C84 EI-9 · C103 · C106 · ADR-0348.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ THE ARM THE EXISTING ROUND-TRIP PROOF COULD NOT CONTAIN, AND WHY.
// ═══════════════════════════════════════════════════════════════════════════════
//
// `snapshotFamilyRoundTrip.spec.ts` proves five families survive save→reload and is
// 8/8 green. It is also, for the READ-CHANNEL question, structurally incapable of
// failing — because it opens with:
//
//     w.window.runtime = { stores: { lift, liftPart, pool, water, balcony } };
//
// The serializer reads this family as `readPluginStore('balcony')`, i.e.
// `window.runtime.stores.balcony`. In production `window.runtime` is not a literal:
// it is the `composeRuntime()` handle, assigned at ONE site
// (`engineLauncher.ts:191`, `if (runtime) window.runtime = runtime`). Its `stores`
// slot is a FRESH OBJECT built by `composeRuntime` from an explicit field list, and
// `balcony` was not on it — no key, no index signature. So the read was `undefined`,
// `readPluginStore` returned `undefined`, the `balconies` slice was never written,
// and EVERY BALCONY WAS DESTROYED ON RELOAD.
//
// A test that supplies the object whose absence is the defect cannot observe the
// defect. That is D6, and it is not a technicality here: the row this file exists to
// correct read `persists: YES` with an EXECUTED proof attached, for four days, while
// the capability was dead in every browser session.
//
// ─── SO WHAT DOES THIS FILE DO DIFFERENTLY ───────────────────────────────────
// ARM A CONSTRUCTS NOTHING AND ASSIGNS NOTHING. It boots the REAL composition root
// (`composeRuntime({ bootstrapFn: bootstrapWithEverything })` — P1's only legal way
// to obtain a runtime) and asks whether the keys the serializer's read channel names
// actually resolve on it. The key set is not hand-written: it is SCANNED OUT OF THE
// SERIALIZER'S OWN SOURCE, so the next family added with `readPluginStore('foo')`
// and no `StoresSlot.foo` fails this arm on the day it is written, without anybody
// remembering to extend a list. That join — READ CHANNEL vs COMPOSITION ROOT — is
// precisely what `check-snapshot-family-coverage.ts` says it does not do: its own
// closing lines read *"NOT ESTABLISHED HERE: that any family ROUND-TRIPS"*, and it
// verifies a snapshot FIELD and a WRITER exist, never that the writer can READ.
//
// ARM B is the NEGATIVE CONTROL for ARM A, so a green ARM A is not vacuous.
//
// ARMS C/D execute the round trip through stores THIS FILE DID NOT BUILD — the
// handles the composed runtime itself exposes — and print N-before / N-after.
//
// ─── STUB LEDGER (read before trusting any green below) ──────────────────────
//  1. THE ~24 LEGACY STORES the serializer also reads are SENTINELS (empty
//     `getAll()` / `getLevels()` / …), the same device `snapshotFamilyRoundTrip` and
//     `mt05StoreIdentityHeap` use. Those families are not the subject; hand-building
//     two dozen real geometry stores would be a much larger fake than the one it
//     replaces.
//  2. `window.runtime = rt` IS PERFORMED IN ARMS C/D, and it is NOT the D6 breach
//     above, for a stated reason: the object assigned is the REAL composed runtime,
//     not a literal built to satisfy the reader. The defect was never "nothing
//     assigns window.runtime" — engineLauncher does, unconditionally, and ARM E pins
//     that it is still the one site and still assigns the composeRuntime handle. The
//     defect was that the REAL handle lacked the key, which is exactly what ARM A
//     measures with no assignment at all.
//  3. NOT PROVEN HERE: that a mesh appears. The boundary line's 3-D linework and plan
//     symbol are built by `initTools.ts` §FT-BOUNDARY-LINE off the `boundaryLine.created`
//     event, which needs WebGL and a live canvas. ARM D asserts the RECORD is back in
//     the authority the builder reads; it does not assert a pixel, and says so.

import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { composeRuntime } from '@pryzm/runtime-composer';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';
import { ProjectSerializer } from '../src/engine/persistence/ProjectSerializer';
import { restoreCompoundFamilies } from '../src/engine/persistence/restoreCompoundFamilies';

const REPO = resolve(__dirname, '../../..');
const SERIALIZER_SRC = resolve(REPO, 'apps/editor/src/engine/persistence/ProjectSerializer.ts');
const AUDIT = { actorId: 'persist-channel', projectId: 'persist-channel', clientId: 'node' } as const;
const LEVEL_ID = 'L0';
const BUDGET = 600_000;

/* eslint-disable @typescript-eslint/no-explicit-any */
let rt: any;

beforeAll(async () => {
    rt = await composeRuntime({
        audit: AUDIT,
        canvas: null,
        bootstrapFn: bootstrapWithEverything as never,
    });
}, BUDGET);

/**
 * Every plugin storeKey the SERIALIZER reads off `window.runtime.stores`, scanned
 * out of its source rather than transcribed.
 *
 * ⛔ TWO PATTERNS, BECAUSE THE FILE HAS TWO READERS AND ONLY ONE IS THE HELPER.
 * `readPluginStore('lift')` is the §PERSIST103 resolver; the `boundaryLines` block
 * two dozen lines above it predates the helper and reads
 * `.runtime?.stores?.['boundaryLine']` inline. A scan that saw only the helper would
 * miss the family whose restore this same lane repaired — the exact "the detector
 * cannot see it because of where it lives" shape `snapshotFamilyCoverage.ts` already
 * records for `level` and `bathroomPod`.
 */
function serializerReadChannelKeys(): string[] {
    const src = readFileSync(SERIALIZER_SRC, 'utf8');
    const keys = new Set<string>();
    for (const m of src.matchAll(/readPluginStore\(\s*'([A-Za-z][A-Za-z0-9_-]*)'\s*\)/g)) {
        keys.add(m[1]!);
    }
    for (const m of src.matchAll(/runtime\?\.stores\?\.\[\s*'([A-Za-z][A-Za-z0-9_-]*)'\s*\]/g)) {
        keys.add(m[1]!);
    }
    return [...keys].sort();
}

/** The `getState()` handle the composed runtime exposes, plus the write door. */
interface LiveStore {
    getState(): ReadonlyMap<string, unknown>;
    applyPatch(patches: readonly unknown[]): unknown;
}

/** ⛔ Read off `rt`, never constructed — a store this file built could not falsify anything. */
function composed(key: string): LiveStore {
    const s = (rt.stores as Record<string, unknown>)[key] as LiveStore | undefined;
    if (s === undefined) {
        throw new Error(
            `[test] runtime.stores.${key} is undefined on the REAL composed runtime — ` +
            `that IS the defect this file measures; see ARM A.`,
        );
    }
    return s;
}

/** `Store.applyPatch` is the very method the bus calls on execute. */
function seed(store: LiveStore, records: readonly Record<string, unknown>[]): void {
    store.applyPatch(records.map((r) => ({ op: 'add', path: [r['id'] as string], value: r })));
}

function wipe(store: LiveStore): void {
    const ids = [...store.getState().keys()];
    if (ids.length > 0) store.applyPatch(ids.map((id) => ({ op: 'remove', path: [id] })));
}

/** Sentinel for the ~24 LEGACY stores the serializer also reads (stub ledger item 1). */
function sentinel(): any {
    return {
        getAll: () => [],
        getLevels: () => [],
        isBuiltIn: () => true,
        getCustom: () => [],
        size: () => 0,
        serialize: () => ({}),
        getState: () => new Map(),
        activeLevelId: LEVEL_ID,
    };
}

function serializerBundle(): any {
    const keys = [
        'wallStore', 'slabStore', 'columnStore', 'gridStore', 'stairStore', 'beamStore',
        'curtainWallStore', 'roofStore', 'plumbingStore', 'furnitureStore', 'handrailStore',
        'openingStore', 'roomStore', 'ceilingStore', 'floorStore',
        'slabSystemTypeStore', 'wallSystemTypeStore', 'ceilingSystemTypeStore',
        'floorSystemTypeStore', 'doorSystemTypeStore', 'windowSystemTypeStore',
        'handrailTypeStore', 'roomBoundingLineStore', 'curtainPanelStore',
    ];
    const b: any = {};
    for (const k of keys) b[k] = sentinel();
    return b;
}

/** Save through the REAL serializer and cross the JSON boundary. */
function saveAndReadBackText(): any {
    return JSON.parse(
        ProjectSerializer.stringify(
            ProjectSerializer.serialize(serializerBundle(), null as any, { projectName: 'persist-channel' }),
        ),
    );
}

const BALCONY = {
    id: 'balc-CH', levelId: LEVEL_ID, type: 'balcony',
    hostWallId: 'w-host', childrenIds: ['s-b1', 'f-b1', 'h-b1'],
    profile: [{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 3, z: 1.5 }, { x: 0, z: 1.5 }],
    depth: 1.5, thickness: 0.22, mark: 'BAL-01',
};

const BOUNDARY_LINE = {
    id: 'bl-CH', levelId: LEVEL_ID, type: 'boundaryLine',
    vertices: [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 9 }],
    closed: false, drawMode: 'polyline', hasVolume: false,
    name: 'Setting-out line A',
    // ⭐ THE FIELD THE BUS-VERB RESTORE COULD NOT CARRY (L-9950):
    // `CreateBoundaryLineHandler` writes `attachments: []` by construction, so the
    // old ProjectLoader Step 10c destroyed these edges even on the load path where
    // it ran. The patch route restores the SERIALIZED RECORD verbatim.
    attachments: [{ elementId: 'w-1', elementType: 'wall', vertexIndex: 0 }],
};

describe('§L-11530 / §L-11528 — the persisted families the SERIALIZER reads must exist on the COMPOSED runtime', () => {

    it('ARM A — every storeKey the serializer reads off window.runtime.stores RESOLVES on a real composeRuntime()', () => {
        const keys = serializerReadChannelKeys();
        // ⛔ A SCAN THAT FINDS NOTHING IS A VACUOUS PASS. Pin the floor so a refactor
        // that renames the helper turns this arm RED instead of silently empty
        // ([[grep-silence-has-three-causes]]).
        expect(keys.length, 'the source scan must find the read channel').toBeGreaterThanOrEqual(6);
        expect(keys).toContain('balcony');
        expect(keys).toContain('boundaryLine');

        // THE JOIN NO GATE PERFORMS. `check-snapshot-family-coverage.ts` verifies a
        // snapshot FIELD and a WRITER exist; it does not evaluate the writer's READ
        // CHANNEL, and says so in its own closing lines.
        const unreadable = keys.filter((k) => (rt.stores as Record<string, unknown>)[k] === undefined);
        expect(
            unreadable,
            `these storeKey(s) are READ by ProjectSerializer through window.runtime.stores and are ` +
            `UNDECLARED/UNATTACHED on the composed runtime, so the save reads undefined and the ` +
            `slice is silently dropped: [${unreadable.join(', ')}]`,
        ).toEqual([]);
    }, BUDGET);

    it('ARM B — NEGATIVE CONTROL: the arm above can fail. `wall` is deliberately NOT on rt.stores, and is deliberately NOT read this way', () => {
        // ADR-0318 / MT-01: `rt.stores.wall` is undefined ON PURPOSE — the wall's
        // authority is the module singleton reached via `rt.stores.elements`, and
        // `composedBusElementReadback.test.ts` pins that. So if ARM A's filter were
        // broken (always empty), THIS pairing would still be inconsistent and visible.
        expect((rt.stores as Record<string, unknown>)['wall']).toBeUndefined();
        expect(serializerReadChannelKeys()).not.toContain('wall');
        // …and the filter itself demonstrably detects an absent key.
        expect(['wall', 'balcony'].filter((k) => (rt.stores as Record<string, unknown>)[k] === undefined))
            .toEqual(['wall']);
    }, BUDGET);

    it('ARM C — BALCONY (L-11530): N before = 0, saved = 1, restored N after = 1 — through the composed runtime', () => {
        // ⛔ RESOLVED BEFORE ANYTHING IS ASSIGNED TO `window`. If `composeRuntime`
        // does not expose the key, this throws HERE, naming the real cause, rather
        // than producing an empty snapshot that reads like "the user drew nothing".
        const store = composed('balcony');
        wipe(store);
        const before = store.getState().size;
        expect(before, 'the store must start EMPTY or the count below proves nothing').toBe(0);

        // Stub ledger item 2: the REAL runtime, published the one way production
        // publishes it (engineLauncher.ts:191 — pinned by ARM E).
        (window as unknown as { runtime: unknown }).runtime = rt;

        seed(store, [BALCONY]);
        expect(store.getState().size, 'N BEFORE the save').toBe(1);

        const saved = saveAndReadBackText();
        expect(saved.balconies, 'the balcony must be IN THE FILE — this is the half that was dead').toHaveLength(1);
        expect(saved.balconies[0].mark).toBe('BAL-01');
        expect(saved.balconies[0].profile, 'C103 — the authored profile is the element').toHaveLength(4);

        // Reload: empty the live model, then read it back out of the TEXT.
        wipe(store);
        expect(store.getState().size, 'the reload starts from an empty store').toBe(0);

        const r = restoreCompoundFamilies(saved);
        expect(r.errors).toEqual([]);
        expect(r.restored['balcony']).toBe(1);

        const after = store.getState().size;
        expect(after, 'N AFTER the reload — 0 here was the founder-visible defect').toBe(1);
        const back = store.getState().get('balc-CH') as any;
        expect(back.childrenIds, 'ownership-by-childrenIds is what makes it a balcony').toEqual(['s-b1', 'f-b1', 'h-b1']);
        expect(back.hostWallId).toBe('w-host');
    }, BUDGET);

    it('ARM D — BOUNDARY LINE (L-11528): saved AND read back, in the COMMON TAIL — including attachments[]', () => {
        const store = composed('boundaryLine');
        wipe(store);
        expect(store.getState().size, 'N BEFORE').toBe(0);

        (window as unknown as { runtime: unknown }).runtime = rt;

        seed(store, [BOUNDARY_LINE]);
        const saved = saveAndReadBackText();
        expect(saved.boundaryLines, 'the SAVE half was already real (L-9948)').toHaveLength(1);

        wipe(store);
        expect(store.getState().size).toBe(0);

        // ⭐ THE HALF THAT DID NOT EXIST IN PRODUCTION. L-9948's restore lived in the
        // LEGACY branch of ProjectLoader while `_useImportCommandPath()` defaults TRUE,
        // so it never ran. It is now in `restoreCompoundFamilies`, past the branch join.
        const r = restoreCompoundFamilies(saved);
        expect(r.errors).toEqual([]);
        expect(r.restored['boundaryLine']).toBe(1);
        expect(store.getState().size, 'N AFTER — this was 0 in every production reload').toBe(1);

        const back = store.getState().get('bl-CH') as any;
        expect(back.vertices, 'C106 — the setting-out geometry').toHaveLength(3);
        expect(back.name).toBe('Setting-out line A');
        // L-9950: the bus-verb route wrote `attachments: []` by construction and
        // destroyed these edges. The patch route carries the record verbatim.
        expect(back.attachments, 'the propagation edges must survive the reload').toHaveLength(1);
        expect(back.attachments[0].elementId).toBe('w-1');
    }, BUDGET);

    it('ARM E — SOURCE: ONE assignment of window.runtime, and NO rival boundary-line restore left behind', () => {
        // Named as source assertions: `engineLauncher.bootstrap()` needs a canvas and
        // `ProjectLoader.load()` needs a BimManager + CommandManager + scene, so
        // neither call can be executed headless — but WHERE they sit is checkable, and
        // it is the load-bearing fact for stub-ledger item 2 and for C84 EI-9.
        const launcher = readFileSync(resolve(REPO, 'apps/editor/src/engine/engineLauncher.ts'), 'utf8');
        const assigns = [...launcher.matchAll(/window\.runtime\s*=/g)];
        expect(assigns, 'exactly one production site publishes the runtime').toHaveLength(1);
        expect(launcher).toContain('if (runtime) window.runtime = runtime as typeof window.runtime;');

        // C84 EI-9 — the boundary-line restore must exist in exactly ONE place. Two
        // roads to one store is the defect; and the async `create` racing the
        // synchronous patch would non-deterministically wipe `attachments[]`.
        const loader = readFileSync(resolve(REPO, 'apps/editor/src/engine/persistence/ProjectLoader.ts'), 'utf8');
        expect(loader, 'Step 10c must be GONE, not merely bypassed')
            .not.toContain("executeCommand('boundaryLine.create'");
        // ⛔ EXACTLY ONE OCCURRENCE, so `indexOf` cannot silently land on a mention in
        // a comment instead of the call. It already did once while this arm was being
        // written — the deleted-Step-10c note above named the call and moved the index
        // 16 KB earlier, which would have turned a PASS into a lie about placement.
        const CALL = 'restoreCompoundFamilies(snapshot)';
        expect(loader.split(CALL).length - 1, 'the call must appear exactly once in the file').toBe(1);
        const callAt = loader.indexOf(CALL);
        const joinAt = loader.indexOf('} // end legacy per-command path');
        expect(joinAt, 'the legacy/import join marker must exist').toBeGreaterThan(0);
        expect(callAt, 'the restore must sit AFTER the two load paths rejoin').toBeGreaterThan(joinAt);
    }, BUDGET);

    it('ARM F — C47: a snapshot with none of these keys reloads without error and without inventing records', () => {
        (window as unknown as { runtime: unknown }).runtime = rt;
        wipe(composed('balcony'));
        wipe(composed('boundaryLine'));
        const r = restoreCompoundFamilies({ schemaVersion: 5, walls: [], slabs: [] });
        expect(r.errors).toEqual([]);
        expect(r.total).toBe(0);
        expect(composed('balcony').getState().size).toBe(0);
        expect(composed('boundaryLine').getState().size).toBe(0);
    }, BUDGET);
});
