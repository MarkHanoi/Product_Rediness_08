// RebakeFamilyInstanceJob — happy path + cache-hit + rebake.
//
// Spec source: `phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md` §19.5 D3.

import { describe, it, expect, beforeEach } from 'vitest';
import { packFamily, type FamilyDocument, type FamilyManifest } from '@pryzm/file-format';
import { defaultFamilyCache, createFamilyCache } from '@pryzm/family-loader';
import { InMemoryStorageDriver } from '@pryzm/storage-driver';
import { processFamilyInstanceJob } from '../src/jobs/RebakeFamilyInstanceJob.js';

const NOW = '2026-04-28T12:00:00.000Z';

function makeDoorBytes(): Promise<Uint8Array> {
  const document: FamilyDocument = {
    formatVersion: '1.0',
    referencePlanes: [
      { id: 'plane_01HZ00000000000000000PNE01', name: 'Host', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, isHost: true },
    ],
    parameters: [
      { id: 'par_01HZ00000000000000000HGT01', name: 'Height', kind: 'type', dataType: 'length', defaultValue: 2100, expression: null, ifcMapping: null, exposed: true },
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
      { id: 'typ_01HZ00000000000000000DEF01', name: 'Default', values: {}, checksum: 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' },
    ],
    defaults: {},
  };
  const manifest: FamilyManifest = {
    formatVersion: '1.0', id: 'fam_01HZ00000000000000000FAM01', name: 'TestDoor', semver: '1.0.0',
    author: { id: 'usr_01HZ00000000000000000ASR01', displayName: 'Test' },
    description: '', ifcEntity: 'IfcDoor', category: 'Door', tags: [],
    minPRYZMVersion: '2.0.0',
    schemaHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    createdAt: NOW, lastModifiedAt: NOW,
  };
  return packFamily({ manifest, document }).then((r) => {
    if (!r.ok) throw new Error('packFamily failed');
    return r.bytes;
  });
}

beforeEach(() => {
  defaultFamilyCache.clear();
});

describe('processFamilyInstanceJob', () => {
  it('happy path: bakes a placement and returns content-addressed chunks', async () => {
    const familyBytes = await makeDoorBytes();
    const storage = new InMemoryStorageDriver();
    const result = await processFamilyInstanceJob(
      {
        projectId: 'prj_01HZPROJECT00000000000000',
        levelId: 'lvl_01HZLEVEL000000000000000',
        instanceId: 'inst_01HZINST00000000000000000',
        familyBytes,
        typeId: 'typ_01HZ00000000000000000DEF01',
      },
      { storage },
    );
    expect(result.chunks).toHaveLength(1);
    const chunk = result.chunks[0]!;
    expect(chunk.chunkHash).toMatch(/^[0-9a-f]{64}$/);
    expect(chunk.byteLength).toBeGreaterThan(0);
    expect(chunk.signedUrl.length).toBeGreaterThan(0);
    expect(await storage.has(chunk.chunkHash)).toBe(true);
    expect(result.cacheHit).toBe(false);
  });

  it('cache hit: re-running the same placement reuses the loaded family', async () => {
    const familyBytes = await makeDoorBytes();
    const storage = new InMemoryStorageDriver();
    const cache = createFamilyCache();
    await processFamilyInstanceJob(
      {
        projectId: 'p', levelId: 'l', instanceId: 'i1',
        familyBytes, typeId: 'typ_01HZ00000000000000000DEF01',
      },
      { storage, familyCache: cache },
    );
    const second = await processFamilyInstanceJob(
      {
        projectId: 'p', levelId: 'l', instanceId: 'i2',
        familyBytes, typeId: 'typ_01HZ00000000000000000DEF01',
      },
      { storage, familyCache: cache },
    );
    expect(second.cacheHit).toBe(true);
    expect(cache.stats().hits).toBe(1);
  });

  it('rebake: instance overrides yield a different content hash', async () => {
    const familyBytes = await makeDoorBytes();
    const storage = new InMemoryStorageDriver();
    const a = await processFamilyInstanceJob(
      {
        projectId: 'p', levelId: 'l', instanceId: 'iA',
        familyBytes, typeId: 'typ_01HZ00000000000000000DEF01',
      },
      { storage },
    );
    const b = await processFamilyInstanceJob(
      {
        projectId: 'p', levelId: 'l', instanceId: 'iB',
        familyBytes, typeId: 'typ_01HZ00000000000000000DEF01',
        instanceOverrides: { 'par_01HZ00000000000000000HGT01': 3000 },
      },
      { storage },
    );
    expect(a.chunks[0]!.chunkHash).not.toBe(b.chunks[0]!.chunkHash);
  });
});
