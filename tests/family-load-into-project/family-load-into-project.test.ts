// family-load-into-project — end-to-end gate (S56 D4).
//
// Spec source: `phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md` §13 + §19.5.
//
// What this gate proves:
//   1. A real `.pryzm-family` (3-type door) round-trips through
//      packFamily → loadFamilyFromBytes → bakeFamilyInstance with no
//      diagnostics.
//   2. The family-loader cache short-circuits the second placement.
//   3. The bake-worker `processFamilyInstanceJob` accepts the same
//      bytes and produces content-addressed chunks via the storage
//      driver.
//   4. A 50-instance batch completes within a generous wall-clock
//      ceiling.  (The 200-instance perf bench is documented as
//      DEFERRED to S57 — it requires the constraint solver loop
//      lighting up sweep / loft / revolve.)
//
// The fixture lives entirely in this file so the gate is hermetic.

import { describe, it, expect, beforeAll } from 'vitest';
import {
  packFamily,
  type FamilyDocument,
  type FamilyManifest,
} from '@pryzm/file-format';
import {
  loadFamilyFromBytes,
  defaultFamilyCache,
} from '@pryzm/family-loader';
import { bakeFamilyInstance } from '@pryzm/family-instance';
import { InMemoryStorageDriver } from '@pryzm/storage-driver';
import { processFamilyInstanceJob } from '@pryzm/bake-worker/jobs/family-instance';

const NOW = '2026-04-28T12:00:00.000Z';

function makeThreeTypeDoorDocument(): FamilyDocument {
  return {
    formatVersion: '1.0',
    referencePlanes: [
      { id: 'plane_01HZ00000000000000000PNE01', name: 'Host', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, isHost: true },
    ],
    parameters: [
      { id: 'par_01HZ00000000000000000HGT01', name: 'Height', kind: 'type', dataType: 'length', defaultValue: 2100, expression: null, ifcMapping: { psetName: 'Pset_DoorCommon', propertyName: 'OverallHeight' }, exposed: true },
      { id: 'par_01HZ00000000000000000WHT01', name: 'Width', kind: 'type', dataType: 'length', defaultValue: 900, expression: null, ifcMapping: { psetName: 'Pset_DoorCommon', propertyName: 'OverallWidth' }, exposed: true },
      { id: 'par_01HZ00000000000000000THK01', name: 'Thickness', kind: 'type', dataType: 'length', defaultValue: 50, expression: null, ifcMapping: null, exposed: true },
    ],
    profiles: [
      {
        id: 'prof_01HZ00000000000000000DRP01',
        name: 'DoorPlan',
        planeId: 'plane_01HZ00000000000000000PNE01',
        entities: [
          { id: '01HZE0000000000000000PT001', kind: 'point', data: { x: 0, z: 0 } },
          { id: '01HZE0000000000000000PT002', kind: 'point', data: { x: 0.9, z: 0 } },
          { id: '01HZE0000000000000000PT003', kind: 'point', data: { x: 0.9, z: 0.05 } },
          { id: '01HZE0000000000000000PT004', kind: 'point', data: { x: 0, z: 0.05 } },
        ],
        constraints: [],
      },
    ],
    solids: [
      {
        id: 'sol_01HZ00000000000000000DRS01',
        kind: 'extrude',
        profileId: 'prof_01HZ00000000000000000DRP01',
        materialSlotId: null,
        lod: { coarse: false, medium: true, fine: true },
        lengthExpression: 'Height',
        direction: { x: 0, y: 1, z: 0 },
      },
    ],
    materialSlots: [],
    types: [
      { id: 'typ_01HZ00000000000000000SGE01', name: 'Single', values: {}, checksum: 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' },
      { id: 'typ_01HZ00000000000000000DBE01', name: 'Double', values: { 'par_01HZ00000000000000000WHT01': 1800 }, checksum: 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' },
      { id: 'typ_01HZ00000000000000000TAE01', name: 'Tall', values: { 'par_01HZ00000000000000000HGT01': 2400 }, checksum: 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' },
    ],
    defaults: {},
  };
}

function makeManifest(): FamilyManifest {
  return {
    formatVersion: '1.0',
    id: 'fam_01HZ00000000000000000FAM03',
    name: 'E2E_Door_3type',
    semver: '1.0.0',
    author: { id: 'usr_01HZ00000000000000000ASR01', displayName: 'PRYZM CI' },
    description: 'family-load-into-project gate fixture',
    ifcEntity: 'IfcDoor',
    category: 'Door',
    tags: ['ci', 'fixture'],
    minPRYZMVersion: '2.0.0',
    schemaHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    createdAt: NOW,
    lastModifiedAt: NOW,
  };
}

let familyBytes: Uint8Array;

beforeAll(async () => {
  defaultFamilyCache.clear();
  const packed = await packFamily({ manifest: makeManifest(), document: makeThreeTypeDoorDocument() });
  if (!packed.ok) throw new Error(`packFamily failed: ${packed.message}`);
  familyBytes = packed.bytes;
});

describe('family-load-into-project', () => {
  it('loads the family and pre-flight succeeds for the first type', async () => {
    const out = await loadFamilyFromBytes(familyBytes);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.family.preflight.ok).toBe(true);
    expect(out.family.document.types).toHaveLength(3);
  });

  it('bakes one instance per type and the descriptors are non-empty', async () => {
    const load = await loadFamilyFromBytes(familyBytes);
    expect(load.ok).toBe(true);
    if (!load.ok) return;
    for (const t of load.family.document.types) {
      const bake = await bakeFamilyInstance({
        family: {
          manifest: load.family.manifest,
          document: load.family.document,
          schemaHash: load.family.schemaHash,
        },
        typeId: t.id,
      });
      expect(bake.ok).toBe(true);
      expect(bake.baked).toHaveLength(1);
      expect(bake.baked[0]!.descriptor.position.length).toBeGreaterThan(0);
    }
  });

  it('bakes 50 placements through the bake-worker job and writes 50 chunks', async () => {
    const storage = new InMemoryStorageDriver();
    const N = 50;
    const startMs = Date.now();
    const seen = new Set<string>();
    for (let i = 0; i < N; i++) {
      const typeIdx = i % 3;
      const typeId = ['typ_01HZ00000000000000000SGE01', 'typ_01HZ00000000000000000DBE01', 'typ_01HZ00000000000000000TAE01'][typeIdx]!;
      // Vary one parameter per placement so chunk hashes differ across instances.
      const heightOverride = 2000 + i * 5;
      const result = await processFamilyInstanceJob(
        {
          projectId: 'prj_E2E',
          levelId: 'lvl_E2E',
          instanceId: `inst_${String(i).padStart(4, '0')}`,
          familyBytes,
          typeId,
          instanceOverrides: { 'par_01HZ00000000000000000HGT01': heightOverride },
        },
        { storage },
      );
      expect(result.chunks).toHaveLength(1);
      seen.add(result.chunks[0]!.chunkHash);
    }
    const elapsedMs = Date.now() - startMs;
    // 50 placements × (extrude + content-hash + put) — the in-memory
    // driver makes this trivial; ceiling is set high to absorb CI noise.
    // The 200-instance perf bench is DEFERRED to S57 (see plan §19.5).
    expect(elapsedMs).toBeLessThan(15_000);
    // Each height override is unique → expect ~50 distinct hashes.
    expect(seen.size).toBeGreaterThanOrEqual(N - 1);
  });

  it('cache hit rate climbs with repeated placements', async () => {
    defaultFamilyCache.clear();
    const storage = new InMemoryStorageDriver();
    let cacheHits = 0;
    for (let i = 0; i < 10; i++) {
      const r = await processFamilyInstanceJob(
        {
          projectId: 'p', levelId: 'l', instanceId: `i_${i}`,
          familyBytes, typeId: 'typ_01HZ00000000000000000SGE01',
        },
        { storage },
      );
      if (r.cacheHit) cacheHits++;
    }
    // First call is a miss; the rest must hit the loader cache.
    expect(cacheHits).toBe(9);
  });
});
