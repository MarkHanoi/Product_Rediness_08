/**
 * Round-trip tests — Sprint S56 exit criteria (lines 716–723 of the phase doc):
 *
 *   1. Tier 1 elements (wall, slab, door, window, column, beam) export to
 *      valid IFC4 STEP bytes.
 *   2. Re-parsing the bytes via web-ifc preserves every element's
 *      `GloballyUniqueId`.
 *   3. Re-parsing the bytes preserves every element's `IfcPropertySet`s
 *      (Pset name, property names, scalar values).
 */

import { describe, expect, it } from 'vitest';
import * as WebIFC from 'web-ifc';

import { exportProjectToIFC } from '../src/index.js';
import { buildTier1Fixture } from './fixtures.js';

const TIER1_TYPES: ReadonlyArray<{ name: string; type: number }> = [
  { name: 'IFCWALLSTANDARDCASE', type: WebIFC.IFCWALLSTANDARDCASE },
  { name: 'IFCSLAB', type: WebIFC.IFCSLAB },
  { name: 'IFCDOOR', type: WebIFC.IFCDOOR },
  { name: 'IFCWINDOW', type: WebIFC.IFCWINDOW },
  { name: 'IFCCOLUMN', type: WebIFC.IFCCOLUMN },
  { name: 'IFCBEAM', type: WebIFC.IFCBEAM },
];

interface ParsedElement {
  expressID: number;
  globalId: string;
  name: string | null;
}

interface ParsedPset {
  expressID: number;
  name: string;
  properties: Record<string, string | number | boolean | null>;
}

async function parseIFC(bytes: Uint8Array): Promise<{
  api: WebIFC.IfcAPI;
  modelId: number;
  byType: Map<number, ParsedElement[]>;
  psetsByElement: Map<number, ParsedPset[]>;
}> {
  const api = new WebIFC.IfcAPI();
  await api.Init();
  const modelId = api.OpenModel(bytes);

  const byType = new Map<number, ParsedElement[]>();
  for (const { type } of TIER1_TYPES) {
    const ids = api.GetLineIDsWithType(modelId, type);
    const arr: ParsedElement[] = [];
    for (let i = 0; i < ids.size(); i += 1) {
      const expressID = ids.get(i);
      const line = api.GetLine(modelId, expressID) as Record<string, unknown>;
      const guidObj = line.GlobalId as { value: string } | string | null | undefined;
      const globalId = typeof guidObj === 'string' ? guidObj : (guidObj?.value ?? '');
      arr.push({
        expressID,
        globalId,
        name: line.Name ? String((line.Name as { value: string }).value) : null,
      });
    }
    byType.set(type, arr);
  }

  // Walk IfcRelDefinesByProperties to map element → IfcPropertySet → properties.
  const relIds = api.GetLineIDsWithType(modelId, WebIFC.IFCRELDEFINESBYPROPERTIES);
  const psetsByElement = new Map<number, ParsedPset[]>();
  for (let i = 0; i < relIds.size(); i += 1) {
    const rel = api.GetLine(modelId, relIds.get(i)) as Record<string, unknown>;
    const relatingRef = rel.RelatingPropertyDefinition as { value: number } | undefined;
    const relatedRefs = rel.RelatedObjects as Array<{ value: number }> | undefined;
    if (!relatingRef || !relatedRefs) continue;

    const pset = api.GetLine(modelId, relatingRef.value) as Record<string, unknown>;
    if (pset.type !== WebIFC.IFCPROPERTYSET) continue;
    const psetName = pset.Name ? String((pset.Name as { value: string }).value) : '';
    const propRefs = (pset.HasProperties as Array<{ value: number }> | undefined) ?? [];
    const properties: ParsedPset['properties'] = {};
    for (const propRef of propRefs) {
      const prop = api.GetLine(modelId, propRef.value) as Record<string, unknown>;
      if (prop.type !== WebIFC.IFCPROPERTYSINGLEVALUE) continue;
      const name = prop.Name ? String((prop.Name as { value: string }).value) : '';
      const nominal = prop.NominalValue as { value: unknown } | null | undefined;
      properties[name] = nominal ? (nominal.value as string | number | boolean) : null;
    }

    for (const elementRef of relatedRefs) {
      const list = psetsByElement.get(elementRef.value) ?? [];
      list.push({ expressID: relatingRef.value, name: psetName, properties });
      psetsByElement.set(elementRef.value, list);
    }
  }

  return { api, modelId, byType, psetsByElement };
}

describe('IFC Tier 1 export — round trip', () => {
  it('exports valid IFC4 STEP bytes with the right header', async () => {
    const { snapshot, metaStore } = buildTier1Fixture();
    const { bytes, counts } = await exportProjectToIFC(snapshot, metaStore, {
      name: 'S56 Round-Trip Project',
    });

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(500);
    const text = new TextDecoder().decode(bytes);
    expect(text.startsWith('ISO-10303-21;')).toBe(true);
    expect(text).toContain("FILE_SCHEMA(('IFC4'))");
    expect(text.trimEnd().endsWith('END-ISO-10303-21;')).toBe(true);

    expect(counts.walls).toBe(1);
    expect(counts.slabs).toBe(1);
    expect(counts.doors).toBe(1);
    expect(counts.windows).toBe(1);
    expect(counts.columns).toBe(1);
    expect(counts.beams).toBe(1);
    expect(counts.psets).toBe(6);
    expect(counts.properties).toBeGreaterThanOrEqual(11);
  });

  it('emits exactly one entity per Tier 1 family', async () => {
    const { snapshot, metaStore } = buildTier1Fixture();
    const { bytes } = await exportProjectToIFC(snapshot, metaStore, { name: 'P' });
    const parsed = await parseIFC(bytes);
    for (const { name, type } of TIER1_TYPES) {
      expect(parsed.byType.get(type)?.length, `${name} count`).toBe(1);
    }
    parsed.api.CloseModel(parsed.modelId);
  });

  it('preserves every element GlobalId from the IFCMetaStore', async () => {
    const { snapshot, metaStore, globalIds } = buildTier1Fixture();
    const { bytes } = await exportProjectToIFC(snapshot, metaStore, { name: 'P' });
    const parsed = await parseIFC(bytes);

    const expectedSet = new Set(globalIds.values());
    const actualSet = new Set<string>();
    for (const elements of parsed.byType.values()) {
      for (const e of elements) actualSet.add(e.globalId);
    }
    for (const expected of expectedSet) {
      expect(actualSet.has(expected), `missing GlobalId ${expected}`).toBe(true);
    }
    parsed.api.CloseModel(parsed.modelId);
  });

  it('preserves every Pset and property value', async () => {
    const { snapshot, metaStore, globalIds } = buildTier1Fixture();
    const { bytes } = await exportProjectToIFC(snapshot, metaStore, { name: 'P' });
    const parsed = await parseIFC(bytes);

    // For each fixture element, look up the IFC entity by GlobalId, then
    // assert the round-tripped Pset payload matches what we stored.
    for (const [pryzmId, expectedGlobalId] of globalIds) {
      const meta = metaStore.get(pryzmId)!;
      let foundExpressID: number | null = null;
      for (const elements of parsed.byType.values()) {
        const match = elements.find((e) => e.globalId === expectedGlobalId);
        if (match) {
          foundExpressID = match.expressID;
          break;
        }
      }
      expect(foundExpressID, `find element ${pryzmId}`).not.toBeNull();
      if (foundExpressID == null) continue;

      const psets = parsed.psetsByElement.get(foundExpressID) ?? [];
      for (const [psetName, expectedProps] of Object.entries(meta.psets)) {
        const actualPset = psets.find((p) => p.name === psetName);
        expect(actualPset, `pset ${psetName} on ${pryzmId}`).toBeDefined();
        if (!actualPset) continue;
        for (const [propName, expectedValue] of Object.entries(expectedProps)) {
          if (expectedValue === null) continue;
          const actual = actualPset.properties[propName];
          if (typeof expectedValue === 'number') {
            expect(actual).toBeCloseTo(expectedValue, 6);
          } else {
            expect(actual).toBe(expectedValue);
          }
        }
      }
    }
    parsed.api.CloseModel(parsed.modelId);
  });

  it('places elements under a building storey via IfcRelContainedInSpatialStructure', async () => {
    const { snapshot, metaStore } = buildTier1Fixture();
    const { bytes } = await exportProjectToIFC(snapshot, metaStore, { name: 'P' });
    const parsed = await parseIFC(bytes);

    const ids = parsed.api.GetLineIDsWithType(parsed.modelId, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);
    expect(ids.size()).toBeGreaterThan(0);
    let totalContained = 0;
    for (let i = 0; i < ids.size(); i += 1) {
      const rel = parsed.api.GetLine(parsed.modelId, ids.get(i)) as Record<string, unknown>;
      const related = rel.RelatedElements as Array<{ value: number }> | undefined;
      totalContained += related?.length ?? 0;
    }
    expect(totalContained).toBe(6);
    parsed.api.CloseModel(parsed.modelId);
  });

  it('mints fresh GlobalIds for elements absent from the IFCMetaStore', async () => {
    const { snapshot } = buildTier1Fixture();
    const { InMemoryIFCMetaStore } = await import('../src/index.js');
    const emptyStore = new InMemoryIFCMetaStore();
    const { bytes, counts } = await exportProjectToIFC(snapshot, emptyStore, {
      name: 'fresh-ids',
    });
    expect(counts.psets).toBe(0);
    const parsed = await parseIFC(bytes);
    for (const elements of parsed.byType.values()) {
      for (const e of elements) {
        expect(e.globalId.length).toBe(22);
      }
    }
    parsed.api.CloseModel(parsed.modelId);
  });
});
