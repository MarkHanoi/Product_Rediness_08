/**
 * PV-04 / C75 §5 — the provenance export mapping.
 *
 * Two claims, and the second is the one that matters (C74 §3.4):
 *
 *   1. POSITIVE — an element carrying a C75 provenance record round-trips its
 *      origin class through the IFC file as a `PRYZM_ValueProvenance` pset.
 *   2. NEGATIVE — an element with NO known origin does NOT acquire an invented
 *      one. The exported pset says `OriginKnown = false` with a reason, and no
 *      `Origin` property exists at all. An exporter that stamps everything
 *      "authored" is worse than one that exports nothing (C75 §1.1, §2.1).
 */

import { describe, expect, it } from 'vitest';
import * as WebIFC from 'web-ifc';

import { Wall } from '@pryzm/plugin-sdk';

import { exportProjectToIFC, InMemoryIFCMetaStore, PROVENANCE_PSET_NAME } from '../src/index.js';
import { buildProvenancePset } from '../src/provenance.js';
import { FIXTURE_LEVEL } from './fixtures.js';

const ULID = '00000000000000000000000WAA';

function makeWall(provenance?: unknown) {
  return Wall.parse({
    id: `wall_${ULID}`,
    levelId: FIXTURE_LEVEL.id,
    baseLine: [
      { x: 0, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
    ],
    height: 3.0,
    thickness: 0.2,
    ...(provenance === undefined ? {} : { provenance }),
  });
}

/** Parse the exported bytes and return every PRYZM_ValueProvenance pset. */
async function extractProvenancePsets(
  bytes: Uint8Array,
): Promise<Array<Record<string, string | number | boolean | null>>> {
  const api = new WebIFC.IfcAPI();
  await api.Init();
  const modelId = api.OpenModel(bytes);
  const out: Array<Record<string, string | number | boolean | null>> = [];
  try {
    const psetIds = api.GetLineIDsWithType(modelId, WebIFC.IFCPROPERTYSET);
    for (let i = 0; i < psetIds.size(); i += 1) {
      const pset = api.GetLine(modelId, psetIds.get(i)) as Record<string, unknown>;
      const name = pset.Name ? String((pset.Name as { value: string }).value) : '';
      if (name !== PROVENANCE_PSET_NAME) continue;
      const propRefs = (pset.HasProperties as Array<{ value: number }> | undefined) ?? [];
      const properties: Record<string, string | number | boolean | null> = {};
      for (const ref of propRefs) {
        const prop = api.GetLine(modelId, ref.value) as Record<string, unknown>;
        const propName = prop.Name ? String((prop.Name as { value: string }).value) : '';
        const nominal = prop.NominalValue as { value: unknown } | null | undefined;
        properties[propName] = nominal ? (nominal.value as string | number | boolean) : null;
      }
      out.push(properties);
    }
  } finally {
    api.CloseModel(modelId);
  }
  return out;
}

describe('PV-04 — provenance crosses the IFC export boundary', () => {
  it('POSITIVE: an inferred wall round-trips its origin class and detail', async () => {
    const wall = makeWall({ origin: 'inferred', detail: 'ai-generation: test-model' });
    const { bytes } = await exportProjectToIFC(
      { levels: [FIXTURE_LEVEL], walls: [wall] },
      new InMemoryIFCMetaStore(),
      { name: 'PV-04 positive' },
    );
    const psets = await extractProvenancePsets(bytes);
    expect(psets).toHaveLength(1);
    expect(psets[0].OriginKnown).toBe(true);
    expect(psets[0].Origin).toBe('inferred');
    expect(psets[0].Detail).toBe('ai-generation: test-model');
    expect(psets[0]).not.toHaveProperty('UnknownReason');
  });

  it('POSITIVE: a regenerated wall carries what it replaced (C75 §2.7)', async () => {
    const wall = makeWall({
      origin: 'regenerated',
      detail: 'layout-regeneration',
      replaced: { origin: 'authored', detail: 'user-drawn' },
    });
    const { bytes } = await exportProjectToIFC(
      { levels: [FIXTURE_LEVEL], walls: [wall] },
      new InMemoryIFCMetaStore(),
      { name: 'PV-04 regenerated' },
    );
    const psets = await extractProvenancePsets(bytes);
    expect(psets).toHaveLength(1);
    expect(psets[0].Origin).toBe('regenerated');
    expect(psets[0].ReplacedOriginKnown).toBe(true);
    expect(psets[0].ReplacedOrigin).toBe('authored');
    expect(psets[0].ReplacedDetail).toBe('user-drawn');
  });

  it('NEGATIVE (C74 §3.4): a wall with no provenance does NOT acquire an invented origin', async () => {
    // No provenance supplied — the L0 default is UNKNOWN with reason
    // 'predates-provenance', never a member of the five.
    const wall = makeWall();
    const { bytes } = await exportProjectToIFC(
      { levels: [FIXTURE_LEVEL], walls: [wall] },
      new InMemoryIFCMetaStore(),
      { name: 'PV-04 negative' },
    );
    const psets = await extractProvenancePsets(bytes);
    expect(psets).toHaveLength(1);
    expect(psets[0].OriginKnown).toBe(false);
    expect(psets[0].UnknownReason).toBe('predates-provenance');
    // The one that matters: NO Origin property exists. An absent origin must
    // never be read as — or exported as — any of the five (C75 §1.4, §2.1).
    expect(psets[0]).not.toHaveProperty('Origin');
  });

  it('NEGATIVE: buildProvenancePset never mints an origin for an absent record', () => {
    const pset = buildProvenancePset(undefined);
    expect(pset.OriginKnown).toBe(false);
    expect(pset.UnknownReason).toBe('predates-provenance');
    expect(pset).not.toHaveProperty('Origin');
    // And an unknown-with-reason record transcribes, not upgrades.
    const explicit = buildProvenancePset({ origin: null, unknownReason: 'lost-in-transform' });
    expect(explicit.OriginKnown).toBe(false);
    expect(explicit.UnknownReason).toBe('lost-in-transform');
    expect(explicit).not.toHaveProperty('Origin');
  });
});
