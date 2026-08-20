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
// §FEAT-LOD200-LUMINAIRES (L-1330) — the PRODUCTION key list, so this control cannot
// silently stop covering a key that production added.
import { LIGHTING_AUTHORED_PARAM_KEYS } from '../src/lighting/lightingAuthoredParams';
import { LOD200_FIXTURE_IDS } from '@pryzm/core-app-model/lod200-fixtures';

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
/**
 * §FEAT-LOD200-LUMINAIRES (L-1330, 2026-08-19) — DERIVED from production, not re-typed.
 *
 * This was a hand-copy of the thirteen keys, which made it a RIVAL list: a fourteenth
 * key added to `LIGHTING_AUTHORED_PARAM_KEYS` could be dropped by the loader and this
 * control — the one whose entire job is "no field is silently dropped" — would not
 * have noticed, because it was asserting against its own copy rather than against the
 * production list. That is the same tautology the header above diagnoses in
 * `persistKitchenWardrobeLighting.test.ts`, one level further out.
 *
 * Importing the real list means this control's population grows with the code.
 */
const AUTHORED_PARAM_KEYS = LIGHTING_AUTHORED_PARAM_KEYS;

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

// ── §FEAT-LOD200-LUMINAIRES (L-1330, 2026-08-19) ────────────────────────────────
//
// ⭐ THE SIXTH-HOLE ARM. Five save/load holes were found in this codebase in one
// week, one of them because a whole family's fields were dropped by the DEFAULT-ON
// restore path while the control exercised the dead twin. Twenty new fixture
// families arrive with that history, so the round-trip is asserted through the path
// that actually ships.
//
// ⚠ WHICH PATH IS THAT: `ImportProjectCommand` is the default-on fast load, and at
// its Step 10b it calls `buildLightingRestorePayload(lt)` for every serialised
// fixture and feeds the result to `CreateLightingCommand`. That function — the REAL
// exported one, imported at the top of this file — is therefore the mapper on the
// shipping path, not a stand-in for it. The legacy per-command `ProjectLoader` arm
// and the `persistence-client` copy are the dead twins; neither is exercised here,
// on purpose.

/** A LOD-200 fixture whose every override differs from its catalogue row. */
function authoredLod200(): LightingData {
    return {
        id: 'light-lod200-1',
        type: 'lighting',
        levelId: 'L0',
        fixtureType: 'linear_pendant',
        position: { x: 4.2, y: 2.55, z: 1.8 },
        rotation: { x: 0, y: 1.5708, z: 0, order: 'XYZ' },
        roomId: 'room-office',
        tags: ['desk-run'],
        // Every value differs from the `linear_pendant` row (1500 × 70 × 70 mm,
        // 700 mm drop, aluminium-powder-coated-white), so a silent default on
        // restore fails on VALUE and not merely on presence.
        lod200Params: {
            lengthMm: 2400,
            widthMm: 95,
            depthMm: 85,
            dropMm: 1150,
            tiltDeg: 12,
            bodyMaterialId: 'brass-polished',
        },
    };
}

describe('§FEAT-LOD200-LUMINAIRES — LOD-200 overrides round-trip through the SHIPPING restore path', () => {
    it('ARM A — the save half writes every LOD-200 override to the record', () => {
        const store = new LightingStore();
        store.add(authoredLod200());

        const onDisk = saveThenRead(store);

        expect(onDisk.fixtureType).toBe('linear_pendant');
        expect(onDisk.lod200Params).toEqual(authoredLod200().lod200Params);
    });

    it('ARM B — the load half restores them with the AUTHORED values, not the row defaults', () => {
        const store = new LightingStore();
        store.add(authoredLod200());
        const onDisk = saveThenRead(store);

        const restored = buildLightingRestorePayload(onDisk);

        expect(restored).not.toBeNull();
        expect(restored!.fixtureType).toBe('linear_pendant');
        expect(restored!.lod200Params).toEqual(authoredLod200().lod200Params);
        // Named individually: a 2.4 m brass pendant must not reopen 1.5 m and white.
        expect(restored!.lod200Params!.lengthMm).toBe(2400);
        expect(restored!.lod200Params!.dropMm).toBe(1150);
        expect(restored!.lod200Params!.bodyMaterialId).toBe('brass-polished');
    });

    it('the ONE new key is on the production list the loader actually reads', () => {
        // If `lod200Params` were missing from `LIGHTING_AUTHORED_PARAM_KEYS`, ARM B
        // would fail — but this states the mechanism directly, so a later refactor
        // that keeps the values flowing by some other route still records the contract.
        expect(LIGHTING_AUTHORED_PARAM_KEYS).toContain('lod200Params');
        // ONE key for TWENTY families: the whole reason twenty new `*Params` blocks
        // were not minted. Twelve named blocks + `emission` + this one.
        expect(LIGHTING_AUTHORED_PARAM_KEYS).toHaveLength(14);
    });

    it('a LOD-200 fixture authoring NO overrides restores none — absence stays absence', () => {
        // It must come back on its catalogue row, never on an empty override object
        // that would later read as "the user set every dimension to undefined".
        const store = new LightingStore();
        store.add({
            id: 'light-bollard-1',
            type: 'lighting',
            levelId: 'L0',
            fixtureType: 'bollard_light',
            position: { x: 9, y: 0, z: 4 },
        });
        const onDisk = saveThenRead(store);

        const restored = buildLightingRestorePayload(onDisk);

        expect(restored).not.toBeNull();
        expect(restored!.fixtureType).toBe('bollard_light');
        expect(restored!.lod200Params).toBeUndefined();
    });

    it('every one of the twenty families survives a full save → load cycle', () => {
        // Twenty families, one assertion: a family that cannot round-trip its own
        // identity is unusable however good its photometry is.
        const store = new LightingStore();
        for (const id of LOD200_FIXTURE_IDS) {
            store.add({
                id: 'light-' + id,
                type: 'lighting',
                levelId: 'L0',
                fixtureType: id,
                position: { x: 0, y: 2.6, z: 0 },
                lod200Params: { dropMm: 321 },
            });
        }
        const onDisk = JSON.parse(JSON.stringify(store.getAll()));
        expect(onDisk).toHaveLength(LOD200_FIXTURE_IDS.length);

        for (const rec of onDisk) {
            const restored = buildLightingRestorePayload(rec);
            expect(restored, rec.id + ' restore').not.toBeNull();
            expect(restored!.fixtureType, rec.id + ' fixtureType').toBe(rec.fixtureType);
            expect(restored!.lod200Params?.dropMm, rec.id + ' override').toBe(321);
        }
    });
});
