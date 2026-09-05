// §MT-05 / ADR-0318 I-1 — THE HEAP-IDENTITY PROBE.
//
// ─── Why this file exists ────────────────────────────────────────────────────
// `mt05WindowStoreSameInstance.spec.ts` (the sibling) passes 3/3 and PINS
// STRINGS. It reads engineLauncher.ts as TEXT. It cannot see a single object.
// A spec that cannot observe the thing it claims to guard is exactly the
// false-green shape this programme keeps finding, and the MT-05 register row
// was held UNPROVEN for precisely that reason.
//
// This file observes the heap. The claim under test is ADR-0318 I-1:
//
//     the instance the StoreRegistry holds for kind K IS the instance the
//     ProjectSerializer reads for kind K — the SAME REFERENCE, not an equal
//     copy.
//
// ─── How it is proved, and what each arm is worth ────────────────────────────
// The claim has two halves and NEITHER arm alone establishes it:
//
//   ARM A (HEAP · the real assertion) — drives the PRODUCTION hand-off
//     functions `toRegistryBundle` / `toSerializerBundle` with sentinel store
//     objects, pushes the first through the REAL `registerAllStores` into the
//     REAL module-singleton `storeRegistry`, pushes the second through the
//     REAL `ProjectSerializer.serialize`, and records — from inside the
//     sentinel's own `getAll()` — WHICH OBJECT the serializer actually called.
//     Then asserts `storeRegistry.getStoreForType(k) === <that object>` with
//     `toBe`. Fifteen kinds, fifteen reference comparisons on live heap
//     objects. This proves the PLUMBING cannot substitute, clone or fall back.
//
//   ARM B (NEGATIVE CONTROL) — the same comparison run against a deliberately
//     DIVERGED pair (serializer half repointed at a fresh object) must come
//     back UNEQUAL. An arm never observed failing is unproven; this one is
//     observed failing on every run.
//
//   ARM C (COMPLETENESS) — the shared-key set is computed from the two
//     production functions' own outputs, not typed out here. A kind added to
//     both bundles without being added to `SHARED_STORE_KEYS` goes RED. This
//     is the guard against closing the row by narrowing the probe's subject —
//     the failure mode tracker §3.10 already refused once.
//
//   ARM D (CONSTRUCTION) — proves the LAUNCHER actually routes both consumers
//     through those two functions and no longer reads `window.*Store` into the
//     serializer bundle. ARM A proves the functions are honest; ARM D proves
//     they are the ones on the wire. Stated plainly: ARM D is a source check.
//     It is not the proof — it is the reachability half of it, and it is here
//     because engineLauncher's `bootstrap()` needs WebGL, `@thatopen`
//     components and a live canvas, so it cannot be executed under any headless
//     runner in this repo today. That limitation is NAMED, not papered over.
//
// The two together: the launcher builds ONE record (ARM D) and the derivation
// of both bundles from one record preserves references (ARM A) ⇒ divergence is
// unreachable by construction. Before this change the launcher used two
// different expressions for column / curtain-wall — `columnStoreInstance` for
// the registry, `window.columnStore ?? columnStoreInstance` for the serializer
// — and only a bootstrap-time `throw` stood between them and silent data loss.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { storeRegistry } from '@pryzm/core-app-model/store-registry';
import { registerAllStores } from '../initStores';
import { ProjectSerializer } from '../persistence/ProjectSerializer';
import {
    toRegistryBundle,
    toSerializerBundle,
    SHARED_STORE_KEYS,
} from '../authoritativeStores';
import type { AuthoritativeStores } from '../authoritativeStores';

const REPO_ROOT = resolve(__dirname, '../../../../..');
const LAUNCHER = resolve(REPO_ROOT, 'apps/editor/src/engine/engineLauncher.ts');

/**
 * Strip `//` and block comments so ARM D scans CODE, not prose.
 *
 * This is not incidental hygiene — the first run of ARM D went RED against a
 * COMMENT in engineLauncher that quotes the old `window.columnStore ??
 * columnStoreInstance` expression while explaining why it was deleted. A
 * scanner that counts its own documentation is the P4 "52% prose" defect, and
 * the cure is to strip comments, never to stop writing them.
 */
function codeOnly(text: string): string {
    // ⛔ CRLF FIRST, and this line is load-bearing. `/\/\/.*$/` without the `m` flag
    // anchors `$` at END OF STRING, and `.` never matches a carriage return - so on a working tree
    // where the file happens to be checked out CRLF (`.gitattributes` says `eol=lf`,
    // but a local editor can and does rewrite it) EVERY `//` comment survived the
    // strip and this scanner counted its own documentation. That is the same
    // comment-blindness §RAF-GATE-COMMENT-BLIND records, arriving through a line
    // ending instead of a missing flag, and it made a passing engineLauncher read RED
    // on one machine and GREEN on CI — the worst failure direction, because whichever
    // reading you trust the other one is invisible.
    return text
        .replace(/\r\n/g, '\n')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .split('\n')
        .map((line) => line.replace(/\/\/.*$/, ''))
        .join('\n');
}

/** bundle key → the canonical type key `registerAllStores` files it under. */
const REGISTRY_TYPE_KEY: Record<(typeof SHARED_STORE_KEYS)[number], string> = {
    wallStore:        'wall',
    slabStore:        'slab',
    columnStore:      'column',
    gridStore:        'grid',
    stairStore:       'stair',
    beamStore:        'beam',
    curtainWallStore: 'curtainwall',
    curtainPanelStore: 'curtain-panel',   // initStores.ts: r('curtain-panel', …)
    roofStore:        'roof',
    plumbingStore:    'plumbing',
    furnitureStore:   'furniture',
    handrailStore:    'handrail',
    openingStore:     'opening',
    roomStore:        'room',
    ceilingStore:     'ceiling',
    floorStore:       'floor',
};

/**
 * A sentinel store. It satisfies both duck types the two consumers need
 * (`getAll` for everyone, `getLevels` for the wall store, `isBuiltIn` for the
 * system-type stores) and — the load-bearing part — records ITSELF in
 * `seenBy` whenever `getAll()` is called, so the probe can ask the serializer
 * "which object did you actually read?" rather than assuming.
 */
interface Sentinel {
    readonly label: string;
    getAll(): unknown[];
    getLevels(): unknown[];
    /**
     * ⚠ NOT EVERY CONSUMER READS THROUGH `getAll()`, and assuming they do is how a
     * vacuous pass gets minted. `ProjectSerializer` reaches the curtain-PANEL store
     * through `curtainPanelStore.getByCurtainWallId(cw.id)` — inside a loop over the
     * curtain WALLS — and never calls `getAll()` on it at all. A sentinel that only
     * instruments `getAll` would therefore report the panel store as UNREAD, and
     * ARM A's own vacuity guard (correctly) refuses to assert identity for a kind it
     * cannot observe being read. Instrumenting the method the product actually calls
     * is the fix; excusing the kind from the guard would not be.
     */
    getByCurtainWallId(_id: string): unknown[];
    isBuiltIn(_id: string): boolean;
    size(): number;
    serialize(): unknown;
}

/** label → the object whose getAll() the serializer invoked. */
const seenBy = new Map<string, Sentinel>();

function makeSentinel(label: string): Sentinel {
    const self: Sentinel = {
        label,
        getAll() { seenBy.set(label, self); return []; },
        getLevels() { seenBy.set(label, self); return []; },
        getByCurtainWallId() { seenBy.set(label, self); return []; },
        isBuiltIn() { return true; },
        size() { return 0; },
        serialize() { return {}; },
    };
    return self;
}

/** A fresh, fully-populated `AuthoritativeStores` of sentinels. */
function makeRecord(): Record<string, Sentinel> & AuthoritativeStores {
    const keys = [
        ...SHARED_STORE_KEYS,
        'slabSystemTypeStore', 'wallSystemTypeStore',
        'ceilingSystemTypeStore', 'floorSystemTypeStore',
        'stairLandingStore', 'stairRailingStore', 'stairTypeStore',
        'liftStore', 'liftTypeStore',
        'doorStore', 'windowStore', 'lightingStore', 'annotationStore',
    ];
    const rec: Record<string, Sentinel> = {};
    for (const k of keys) rec[k] = makeSentinel(k);

    // ⭐ ONE probe curtain wall, and it is load-bearing. The serializer's panel-override
    // branch is `for (const cw of curtainWallStore.getAll()) { curtainPanelStore
    // .getByCurtainWallId(cw.id) … }` — so with an EMPTY curtain-wall store the loop
    // body never runs and the panel store is never touched, which would leave ARM A's
    // identity assertion vacuous for `curtainPanelStore` while looking green. The probe
    // wall makes the read really happen; `getByCurtainWallId` returns `[]`, so the
    // serializer `continue`s immediately and no grid/override machinery is exercised,
    // and `serializeCurtainWall` is defensive about every field (`stripBaseline` falls
    // back to two zero points), so the minimal shape below is enough.
    const cwSentinel = rec.curtainWallStore;
    rec.curtainWallStore = {
        ...cwSentinel,
        getAll() {
            seenBy.set('curtainWallStore', rec.curtainWallStore);
            return [{ id: 'cw-probe', type: 'curtainwall', levelId: 'L0', properties: {} }];
        },
    };
    return rec as Record<string, Sentinel> & AuthoritativeStores;
}

/**
 * Run the FULL production path once: one record → both hand-off functions →
 * the real registry and the real serializer.
 */
function runHandoff(record: AuthoritativeStores): void {
    seenBy.clear();
    storeRegistry.clear();
    registerAllStores(toRegistryBundle(record));
    // The serializer only ever READS. `_bimManager` is unused by `serialize`
    // (its own signature marks it `_`), so a null stand-in is honest here — it
    // is not a mock of behaviour under test, it is an unread parameter.
    ProjectSerializer.serialize(
        toSerializerBundle(record),
        null as unknown as Parameters<typeof ProjectSerializer.serialize>[1],
        { projectName: 'mt05-heap-probe' },
    );
}

// The cold module graph here is large (ProjectSerializer pulls the geometry
// codecs and the data-platform stores). Measured cold on this tree: ~75 s.
const BUDGET = 300_000;

describe('§MT-05 · ADR-0318 I-1 — registry identity IS serializer identity (heap)', () => {
    let record: Record<string, Sentinel> & AuthoritativeStores;

    beforeAll(() => {
        record = makeRecord();
        runHandoff(record);
    }, BUDGET);

    it('ARM A — for every shared kind, the registry holds the SAME REFERENCE the serializer read', () => {
        // Sanity first: if the serializer never touched a kind, the identity
        // assertion below would pass vacuously. `[]` must mean "zero results",
        // never "I could not look" (C70 L-INV-1).
        const unread = SHARED_STORE_KEYS.filter((k) => !seenBy.has(k));
        expect(
            unread,
            'the serializer never called getAll() on these kinds — the identity check below '
            + 'would have been VACUOUS for them. Either ProjectSerializer stopped reading the '
            + 'kind, or the sentinel is missing a method it needs.',
        ).toEqual([]);

        for (const key of SHARED_STORE_KEYS) {
            const typeKey = REGISTRY_TYPE_KEY[key];
            const held = storeRegistry.getStoreForType(typeKey) as unknown as Sentinel | undefined;
            const read = seenBy.get(key);

            expect(held, `storeRegistry has no entry for '${typeKey}'`).toBeDefined();
            expect(read, `the serializer never read '${key}'`).toBeDefined();
            // ── THE ASSERTION THE ROW WAS WAITING FOR ────────────────────────
            expect(
                held,
                `§MT-05 DIVERGENCE on '${key}': the StoreRegistry holds a DIFFERENT object `
                + `than the one ProjectSerializer read. The project would serialise from a `
                + `store nobody is writing (ADR-0318 I-1 violated).`,
            ).toBe(read);
        }
    }, BUDGET);

    it('ARM B — negative control: a diverged pair is DETECTED (the arm can fail)', () => {
        // Point the serializer half at a FRESH object for one kind, exactly as a
        // reintroduced `window.columnStore ?? columnStoreInstance` fallback would
        // if the global were ever republished as a different instance.
        const registryHalf = makeRecord();
        const serializerHalf = { ...registryHalf, columnStore: makeSentinel('columnStore#IMPOSTOR') };

        seenBy.clear();
        storeRegistry.clear();
        registerAllStores(toRegistryBundle(registryHalf));
        ProjectSerializer.serialize(
            toSerializerBundle(serializerHalf as unknown as AuthoritativeStores),
            null as unknown as Parameters<typeof ProjectSerializer.serialize>[1],
            { projectName: 'mt05-heap-probe-negative' },
        );

        const held = storeRegistry.getStoreForType('column') as unknown as Sentinel | undefined;
        const read = seenBy.get('columnStore#IMPOSTOR');

        expect(held, 'registry entry for column').toBeDefined();
        expect(read, 'the impostor was never read — the negative control did not exercise').toBeDefined();
        // The whole point: THIS is what a real divergence looks like on the heap,
        // and ARM A's `toBe` is what catches it.
        expect(held).not.toBe(read);
        expect(held!.label).toBe('columnStore');
        expect(read!.label).toBe('columnStore#IMPOSTOR');
        // …and the registry must NOT be holding the impostor either — i.e. the
        // two halves really were independent objects, not aliases.
        expect(seenBy.get('columnStore')).toBeUndefined();

        // Restore the honest wiring for anything running after this.
        runHandoff(record);
    }, BUDGET);

    it('ARM C — completeness: every key BOTH bundles carry is inside SHARED_STORE_KEYS', () => {
        const probe = makeRecord();
        const reg = toRegistryBundle(probe) as unknown as Record<string, unknown>;
        const ser = toSerializerBundle(probe) as unknown as Record<string, unknown>;

        const shared = Object.keys(reg)
            .filter((k) => reg[k] !== undefined && ser[k] !== undefined)
            .sort();

        expect(
            shared,
            'a kind is now handed to BOTH the registry and the serializer without being listed '
            + 'in SHARED_STORE_KEYS, so ARM A never asserts identity for it. Add it to '
            + 'SHARED_STORE_KEYS and to REGISTRY_TYPE_KEY in this file — do NOT narrow the list.',
        ).toEqual([...SHARED_STORE_KEYS].sort());
    }, BUDGET);

    it('ARM D — construction: the launcher builds ONE record and derives BOTH bundles from it', () => {
        const text = codeOnly(readFileSync(LAUNCHER, 'utf8'));

        // One record, declared once.
        const decls = text.match(/const authoritativeStores\s*:/g) ?? [];
        expect(decls.length, 'engineLauncher must declare exactly one authoritativeStores record').toBe(1);

        // Both consumers derive from it — not from separate literals.
        expect(
            text,
            'registerAllStores no longer receives the shared record',
        ).toContain('registerAllStores(toRegistryBundle(authoritativeStores))');
        expect(
            text,
            'initPersistence no longer receives the shared record',
        ).toContain('stores: toSerializerBundle(authoritativeStores)');

        // And the two mutable-global reads MT-05 named are gone from the wire.
        // (The globals themselves survive for ~40 legacy UI readers — TASK-08 —
        // and the bootstrap §MT-05 guard is what keeps THOSE honest. What must
        // never come back is a `window.*` read feeding the serializer bundle.)
        expect(
            text,
            'a `window.columnStore ?? columnStoreInstance` fallback was reintroduced into the '
            + 'serializer hand-off — that is the exact MT-05 divergence hazard',
        ).not.toMatch(/window\.columnStore\s*\?\?/);
        expect(
            text,
            'a `window.curtainWallStore ?? curtainWallStoreInstance` fallback was reintroduced '
            + 'into the serializer hand-off',
        ).not.toMatch(/window\.curtainWallStore\s*\?\?/);
    });
});
