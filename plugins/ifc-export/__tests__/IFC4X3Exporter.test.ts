/**
 * IFC4X3 exporter tests — Wave A17-T7 (2026-05-03).
 *
 * Exit criteria (A17-T7): ≥ 4 tests; schema header is IFC4X3; walls are
 * emitted as IFCWALL (not IFCWALLSTANDARDCASE); GlobalIds round-trip;
 * element counts are correct.
 */

import { describe, expect, it } from 'vitest';
import * as WebIFC from 'web-ifc';

import { exportProjectToIFC4X3 } from '../src/exporters/IFC4X3Exporter.js';
import { buildTier1Fixture } from './fixtures.js';

// ---------------------------------------------------------------------------
// Helper — parse raw IFC4X3 bytes via web-ifc
// ---------------------------------------------------------------------------

async function parseIFC4X3(bytes: Uint8Array) {
  const api = new WebIFC.IfcAPI();
  await api.Init();
  const modelId = api.OpenModel(bytes);
  return { api, modelId };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IFC4X3 exporter', () => {
  // Test 1 — FILE_SCHEMA header must be IFC4X3 (not IFC4)
  it('emits FILE_SCHEMA IFC4X3 header in the STEP file', async () => {
    const { snapshot, metaStore } = buildTier1Fixture();
    const { bytes } = await exportProjectToIFC4X3(snapshot, metaStore, {
      name: 'A17-T4 IFC4X3 Project',
    });

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(500);

    const text = new TextDecoder().decode(bytes);
    expect(text.startsWith('ISO-10303-21;')).toBe(true);
    expect(text).toContain("FILE_SCHEMA(('IFC4X3'))");
    expect(text.trimEnd().endsWith('END-ISO-10303-21;')).toBe(true);
    // Confirm IFC4 header is NOT present — this would mean wrong schema was used
    expect(text).not.toContain("FILE_SCHEMA(('IFC4'))");
  });

  // Test 2 — Walls emitted as IFCWALL; IFCWALLSTANDARDCASE MUST NOT appear
  it('emits IFCWALL entities (not IFCWALLSTANDARDCASE) for walls', async () => {
    const { snapshot, metaStore } = buildTier1Fixture();
    const { bytes } = await exportProjectToIFC4X3(snapshot, metaStore, { name: 'P' });
    const { api, modelId } = await parseIFC4X3(bytes);

    try {
      const wallIds = api.GetLineIDsWithType(modelId, WebIFC.IFCWALL);
      const legacyIds = api.GetLineIDsWithType(modelId, WebIFC.IFCWALLSTANDARDCASE);

      expect(wallIds.size()).toBe(1);
      expect(legacyIds.size()).toBe(0);
    } finally {
      api.CloseModel(modelId);
    }
  });

  // Test 3 — All Tier 1 element counts are correct
  it('emits exactly one entity per Tier 1 family', async () => {
    const { snapshot, metaStore } = buildTier1Fixture();
    const { bytes, counts } = await exportProjectToIFC4X3(snapshot, metaStore, { name: 'P' });

    expect(counts.walls).toBe(1);
    expect(counts.slabs).toBe(1);
    expect(counts.doors).toBe(1);
    expect(counts.windows).toBe(1);
    expect(counts.columns).toBe(1);
    expect(counts.beams).toBe(1);
    // IFC-α-4 + IFC-α-5 + IFC-α-6 + IFC-α-7: every IfcWall additionally
    // carries Pset_WallCommon (α-4) AND Qto_WallBaseQuantities (α-5), every
    // IfcDoor additionally carries Pset_DoorCommon (α-6), and every
    // IfcWindow additionally carries Pset_WindowCommon (α-7). The baseline
    // of 6 side-car Psets (one per Tier-1 fixture element) grows by
    // 2 × `walls` count + 1 × `doors` count + 1 × `windows` count →
    // 6 + 2 + 1 + 1 = 10.
    expect(counts.psets).toBe(10);
    expect(counts.properties).toBeGreaterThanOrEqual(12);

    const { api, modelId } = await parseIFC4X3(bytes);
    try {
      expect(api.GetLineIDsWithType(modelId, WebIFC.IFCSLAB).size()).toBe(1);
      expect(api.GetLineIDsWithType(modelId, WebIFC.IFCDOOR).size()).toBe(1);
      expect(api.GetLineIDsWithType(modelId, WebIFC.IFCWINDOW).size()).toBe(1);
      expect(api.GetLineIDsWithType(modelId, WebIFC.IFCCOLUMN).size()).toBe(1);
      expect(api.GetLineIDsWithType(modelId, WebIFC.IFCBEAM).size()).toBe(1);
    } finally {
      api.CloseModel(modelId);
    }
  });

  // Test 4 — GlobalIds from the metaStore are preserved in the IFC4X3 output
  it('preserves element GlobalIds from the IFCMetaStore', async () => {
    const { snapshot, metaStore, globalIds } = buildTier1Fixture();
    const { bytes } = await exportProjectToIFC4X3(snapshot, metaStore, { name: 'P' });
    const { api, modelId } = await parseIFC4X3(bytes);

    try {
      const TYPES = [
        WebIFC.IFCWALL,
        WebIFC.IFCSLAB,
        WebIFC.IFCDOOR,
        WebIFC.IFCWINDOW,
        WebIFC.IFCCOLUMN,
        WebIFC.IFCBEAM,
      ];

      const actualIds = new Set<string>();
      for (const type of TYPES) {
        const ids = api.GetLineIDsWithType(modelId, type);
        for (let i = 0; i < ids.size(); i++) {
          const line = api.GetLine(modelId, ids.get(i)) as Record<string, unknown>;
          const gid = line.GlobalId as { value: string } | string | undefined;
          const resolved = typeof gid === 'string' ? gid : gid?.value;
          if (resolved) actualIds.add(resolved);
        }
      }

      for (const [pryzmId, expectedGlobalId] of globalIds) {
        expect(
          actualIds.has(expectedGlobalId),
          `GlobalId for ${pryzmId} should be present`,
        ).toBe(true);
      }
    } finally {
      api.CloseModel(modelId);
    }
  });

  // Test 5 — Storey containment relationships are emitted
  it('emits IfcRelContainedInSpatialStructure with all 6 elements', async () => {
    const { snapshot, metaStore } = buildTier1Fixture();
    const { bytes } = await exportProjectToIFC4X3(snapshot, metaStore, { name: 'P' });
    const { api, modelId } = await parseIFC4X3(bytes);

    try {
      const relIds = api.GetLineIDsWithType(
        modelId,
        WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE,
      );
      expect(relIds.size()).toBeGreaterThan(0);

      let total = 0;
      for (let i = 0; i < relIds.size(); i++) {
        const rel = api.GetLine(modelId, relIds.get(i)) as Record<string, unknown>;
        const related = rel.RelatedElements as Array<{ value: number }> | undefined;
        total += related?.length ?? 0;
      }
      expect(total).toBe(6);
    } finally {
      api.CloseModel(modelId);
    }
  });
});
