// loadFamily — cache hit/miss + load-then-resolve smoke (plan §19.5 D1).

import { describe, it, expect, beforeEach } from 'vitest';
import {
  packFamily,
  type FamilyDocument,
  type FamilyManifest,
} from '@pryzm/file-format';
import { loadFamilyFromBytes, createFamilyCache, defaultFamilyCache } from '../src/index.js';

const NOW = '2026-04-28T12:00:00.000Z';

function makeDoor(): { manifest: FamilyManifest; document: FamilyDocument } {
  const document: FamilyDocument = {
    formatVersion: '1.0',
    referencePlanes: [],
    parameters: [
      { id: 'par_01HZ00000000000000000HGT01', name: 'Height', kind: 'type', dataType: 'length', defaultValue: 2100, expression: null, ifcMapping: null, exposed: true },
    ],
    profiles: [],
    solids: [],
    materialSlots: [],
    types: [
      {
        id: 'typ_01HZ00000000000000000DEF01',
        name: 'Default',
        values: {},
        checksum: 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
      },
    ],
    defaults: {},
  };
  const manifest: FamilyManifest = {
    formatVersion: '1.0',
    id: 'fam_01HZ00000000000000000FAM01',
    name: 'TestDoor',
    semver: '1.0.0',
    author: { id: 'usr_01HZ00000000000000000ASR01', displayName: 'Test' },
    description: 'load test door',
    ifcEntity: 'IfcDoor',
    category: 'Door',
    tags: [],
    minPRYZMVersion: '2.0.0',
    schemaHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    createdAt: NOW,
    lastModifiedAt: NOW,
  };
  return { manifest, document };
}

beforeEach(() => {
  defaultFamilyCache.clear();
});

describe('loadFamilyFromBytes', () => {
  it('loads a packed family and surfaces resolved parameter pre-flight', async () => {
    const { manifest, document } = makeDoor();
    const packed = await packFamily({ manifest, document });
    expect(packed.ok).toBe(true);
    if (!packed.ok) return;

    const result = await loadFamilyFromBytes(packed.bytes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cacheHit).toBe(false);
    expect(result.family.preflight.ok).toBe(true);
    expect(result.family.manifest.id).toBe(manifest.id);
  });

  it('caches by (familyId, schemaHash) — second call is a hit', async () => {
    const cache = createFamilyCache();
    const { manifest, document } = makeDoor();
    const packed = await packFamily({ manifest, document });
    if (!packed.ok) throw new Error('packFamily failed');

    const a = await loadFamilyFromBytes(packed.bytes, { cache });
    const b = await loadFamilyFromBytes(packed.bytes, { cache });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.cacheHit).toBe(false);
    expect(b.cacheHit).toBe(true);
    expect(cache.stats().hits).toBe(1);
    expect(cache.stats().misses).toBe(1);
    expect(cache.size()).toBe(1);
  });

  it('LRU eviction respects maxEntries', async () => {
    const cache = createFamilyCache({ maxEntries: 1 });
    const a = makeDoor();
    const b = makeDoor();
    // Mutate id so b is a different cache key.
    const bManifest = { ...b.manifest, id: 'fam_01HZ00000000000000000FAM02' };
    const packA = await packFamily({ manifest: a.manifest, document: a.document });
    const packB = await packFamily({ manifest: bManifest, document: b.document });
    if (!packA.ok || !packB.ok) throw new Error('pack failed');

    await loadFamilyFromBytes(packA.bytes, { cache });
    await loadFamilyFromBytes(packB.bytes, { cache });
    expect(cache.size()).toBe(1);
    // A was evicted; loading it again is a miss.
    const reload = await loadFamilyFromBytes(packA.bytes, { cache });
    expect(reload.ok).toBe(true);
    if (!reload.ok) return;
    expect(reload.cacheHit).toBe(false);
  });

  it('returns unpack-failed for non-zip bytes', async () => {
    const result = await loadFamilyFromBytes(new Uint8Array([0xff, 0xff, 0xff]));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unpack-failed');
    }
  });
});
