// §PERSIST-LIGHTING-PARAMS (F1, 2026-08-18) — the SAVE half is complete; the LOAD
// half discards 13 authored fields.
//
// ## The premise this file corrects
//
// This lane was briefed as "LIGHTING IS NEVER PERSISTED", measured as zero `lighting`
// matches in `packages/persistence-client/src/loader/{ProjectSerializer,ProjectLoader}.ts`.
// Both greps are accurate and both are about files the app never builds
// (`ProjectSerializer.ts:271` — "The persistence-client copy is not on the save path";
// `ProjectLoader.ts:331` — "which the app never builds"). Lighting IS persisted, on
// every live path, since §PERSIST-LIGHTING (2026-05-22) and §FIX-PERSIST-KITCHEN-
// WARDROBE-LIGHTING (L-85). Grepping ONE copy of a duplicated pipeline decides nothing.
//
// ## The defect that is actually there
//
// `LightingData` (packages/core-app-model/src/lighting/LightingTypes.ts:197) carries the
// user's authored geometry in 12 mutually-exclusive `*Params` blocks plus an `emission`
// override. The serializer writes ALL of them — it maps each record through `deepStrip`,
// which is key-preserving for plain objects — so they reach the file intact.
//
// `CreateLightingPayload` (src/lighting/CreateLightingCommand.ts:25) has NO SLOT for any
// of them. Both restore paths therefore reconstruct a fixture from 9 fields and the other
// 13 are dropped on the floor:
//
//   downlightParams, pendantParams, linearLedParams, pendantPebbleParams,
//   pendantCeramicBellParams, pendantConicalParams, floorWoodPostParams,
//   floorArcBrassParams, tableTerracottaParams, floorTripodBlackParams,
//   mirrorLightParams, pendantClusterParams, emission
//
// User-visible harm: resize a pendant, set a cluster to 7 lamps, or dim a fixture; save;
// reopen. The values are ON DISK and the fixture comes back at code defaults.
//
// ## Why the existing control did not catch it
//
// `persistKitchenWardrobeLighting.test.ts:161` is titled "round-trips every field the
// CreateLightingCommand consumes" and asserts exactly the 9 fields the payload declares.
// That predicate is tautological: it is defined in terms of the implementation's own
// field list, so the 13 absent fields are outside what it can express. A control scoped
// to what the code already does cannot fail for what the code omits.
//
// ## What this file asserts
//
// ARM A — the SAVE half, through the REAL `LightingStore` and a real JSON cycle. Must
// PASS both before and after the fix: the bug was never here, and a test that goes green
// only after the fix would misattribute it.
// ARM B — the LOAD half, through the REAL exported `buildLightingRestorePayload` that
// `ImportProjectCommand:1033` calls. RED before the fix, GREEN after.
//
// Fixtures are NOT hand-written in the mapper's shape — ARM B consumes the object ARM A
// actually produced, so the two halves are joined by real data rather than by assumption.

// `@pryzm/geometry-lighting` deliberately, not `@pryzm/core-app-model`: it is the module
// `CreateLightingCommand.ts:14` itself imports `LightingData` from, so the test and the
// production command agree on the type by construction. (There are THREE copies of
// `LightingTypes.ts` in this repo — geometry-lighting/src, core-app-model/src/lighting and
// core-app-model/src/stores — and two of `LightingStore`. That duplication is reported,
// not fixed here; picking the command's own copy keeps this test from depending on which
// copy happens to win a resolution.)
import { describe, it, expect } from 'vitest';
import { LightingStore } from '@pryzm/geometry-lighting';
import type { LightingData } from '@pryzm/geometry-lighting';
import { buildLightingRestorePayload } from '../src/project/projectLoaderUtils';

/**
 * A pendant-cluster fixture whose every authored value differs from the code default
 * (PENDANT_CLUSTER_DEFAULTS / DEFAULT_EMISSION). If a field is silently defaulted on
 * restore, the assertion fails on VALUE, not merely on presence — a fixture built from
 * defaults would pass a presence check while still having lost the user's authorship.
 */
function authoredCluster(): LightingData {
    return {
        id: 'light-cluster-1',
        type: 'lighting',
        levelId: 'L0',
        fixtureType: 'pendant_cluster',
        position: { x: 2.5, y: 2.7, z: 3.5 },
        rotation: { x: 0, y: 0.7854, z: 0, order: 'XYZ' },
        roomId: 'room-kitchen',
        hostId: 'ceiling-3',
        tags: ['task', 'island'],
        properties: { fixtureCode: 'PC-7' },
        pendantClusterParams: {
            canopyRadius: 0.31,   // default 0.20
            pendantColor: '#b87333',
            clusterRadius: 0.44,  // default 0.22
            minCableLen: 0.55,
            maxCableLen: 1.15,
            count: 7,             // default 3 — the most visible loss
        },
        emission: {
            color: '#ffd9a0',     // default '#fff3d0'
            intensity: 3.4,       // default 1.5
            distance: 9.5,        // default 6.0
            decay: 1,             // default 2
        },
    };
}

/** Every `LightingData` key that carries authored state and is not identity/placement. */
const AUTHORED_PARAM_KEYS = [
    'downlightParams', 'pendantParams', 'linearLedParams', 'pendantPebbleParams',
    'pendantCeramicBellParams', 'pendantConicalParams', 'floorWoodPostParams',
    'floorArcBrassParams', 'tableTerracottaParams', 'floorTripodBlackParams',
    'mirrorLightParams', 'pendantClusterParams', 'emission',
] as const;

/**
 * The serializer's own transform over a lighting record is `deepStrip(l)` followed by
 * `JSON.stringify` of the whole snapshot. `deepStrip` is module-private, but it is
 * key-preserving for plain objects (ProjectSerializer.ts:507 — it recurses over
 * `Object.keys` and rebuilds), and `LightingStore` holds plain DTOs by contract (§01 §3),
 * so a JSON cycle over `getAll()` reproduces exactly what lands in the file.
 */
function saveThenRead(store: LightingStore): any {
    return JSON.parse(JSON.stringify(store.getAll()))[0];
}

describe('§PERSIST-LIGHTING-PARAMS — ARM A: the SAVE half already writes every field', () => {
    it('authored params + emission survive the store and reach the serialized record', () => {
        const store = new LightingStore();
        store.add(authoredCluster());

        const onDisk = saveThenRead(store);

        expect(onDisk.pendantClusterParams).toEqual(authoredCluster().pendantClusterParams);
        expect(onDisk.emission).toEqual(authoredCluster().emission);
        expect(onDisk.pendantClusterParams.count).toBe(7);
    });
});

describe('§PERSIST-LIGHTING-PARAMS — ARM B: the LOAD half must not discard them', () => {
    it('restores pendantClusterParams with the AUTHORED values, not the defaults', () => {
        const store = new LightingStore();
        store.add(authoredCluster());
        const onDisk = saveThenRead(store);

        const restored = buildLightingRestorePayload(onDisk);

        expect(restored).not.toBeNull();
        expect(restored!.pendantClusterParams).toEqual(authoredCluster().pendantClusterParams);
        expect(restored!.pendantClusterParams!.count).toBe(7);
    });

    it('restores the emission override (a dimmed fixture must not come back at full)', () => {
        const store = new LightingStore();
        store.add(authoredCluster());
        const onDisk = saveThenRead(store);

        const restored = buildLightingRestorePayload(onDisk);

        expect(restored!.emission).toEqual(authoredCluster().emission);
        expect(restored!.emission!.intensity).toBe(3.4);
    });

    it('carries every authored param block the record holds — no field is silently dropped', () => {
        const store = new LightingStore();
        store.add(authoredCluster());
        const onDisk = saveThenRead(store);

        const restored = buildLightingRestorePayload(onDisk) as Record<string, unknown>;

        // Presence-on-disk implies presence-after-restore, for every authored key.
        const lostOnLoad = AUTHORED_PARAM_KEYS.filter(
            k => onDisk[k] !== undefined && restored[k] === undefined,
        );
        expect(lostOnLoad).toEqual([]);
    });

    it('a fixture authoring only downlightParams round-trips that block too', () => {
        const store = new LightingStore();
        store.add({
            id: 'light-dl-1',
            type: 'lighting',
            levelId: 'L0',
            fixtureType: 'downlight',
            position: { x: 1, y: 2.6, z: 1 },
            downlightParams: { radius: 0.099, color: '#334455' },
        });
        const onDisk = saveThenRead(store);

        const restored = buildLightingRestorePayload(onDisk);

        expect(restored!.downlightParams).toEqual({ radius: 0.099, color: '#334455' });
    });

    it('a record authoring no params restores none — absence is preserved as absence', () => {
        const store = new LightingStore();
        store.add({
            id: 'light-bare-1',
            type: 'lighting',
            levelId: 'L0',
            fixtureType: 'pendant',
            position: { x: 0, y: 2.6, z: 0 },
        });
        const onDisk = saveThenRead(store);

        const restored = buildLightingRestorePayload(onDisk);

        expect(restored).not.toBeNull();
        expect(restored!.pendantParams).toBeUndefined();
        expect(restored!.emission).toBeUndefined();
    });
});
