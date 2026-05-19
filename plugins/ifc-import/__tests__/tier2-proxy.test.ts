/**
 * Tier 2 transform-only proxy converter tests (Phase 3-B Sprint S57).
 *
 * Per PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md §3.1.
 * Validates the pure converter + GlobalId preservation + geometry hashing.
 */

import { describe, expect, it } from 'vitest';
import {
  computeGeometryHash,
  convertTier2Element,
  extractAllPsets,
  IDENTITY_PLACEMENT,
  resolveLocalPlacementMatrix,
  TIER_2_IFC_TYPES,
  type IfcApiLike,
  type PsetSource,
} from '../src/index.js';

const FIXED_GUID = '0aBcD3fGhIjKlMnOpQrStU';

function makeApi(overrides: Partial<{
  ifcType: string;
  globalId: string;
  name: string;
  placementId: number | null;
}> = {}): IfcApiLike {
  return {
    GetLine: () => ({
      GlobalId: { value: overrides.globalId ?? FIXED_GUID },
      Name: overrides.name != null ? { value: overrides.name } : undefined,
      ObjectPlacement: overrides.placementId == null ? null : { value: overrides.placementId },
    }),
    GetTypeOfLine: () => overrides.ifcType ?? 'IFCFURNISHINGELEMENT',
  };
}

const EMPTY_PSETS: PsetSource = { forElement: () => [] };

describe('TIER_2_IFC_TYPES', () => {
  it('includes the canonical Tier-2 entity families per ADR-0023', () => {
    for (const k of [
      'IFCFURNISHINGELEMENT',
      'IFCFLOWTERMINAL',
      'IFCFLOWFITTING',
      'IFCBUILDINGELEMENTPROXY',
      'IFCRAILING',
    ]) {
      expect(TIER_2_IFC_TYPES.has(k)).toBe(true);
    }
  });
});

describe('computeGeometryHash', () => {
  it('returns a stable sha256 prefix for identical bytes', () => {
    const a = computeGeometryHash(() => new Uint8Array([1, 2, 3, 4]));
    const b = computeGeometryHash(() => new Uint8Array([1, 2, 3, 4]));
    expect(a).toBe(b);
    expect(a.startsWith('sha256-')).toBe(true);
  });

  it('returns different hashes for different bytes', () => {
    const a = computeGeometryHash(() => new Uint8Array([1, 2, 3, 4]));
    const b = computeGeometryHash(() => new Uint8Array([1, 2, 3, 5]));
    expect(a).not.toBe(b);
  });

  it('returns sha256-empty for null/empty bytes', () => {
    expect(computeGeometryHash(() => null)).toBe('sha256-empty');
    expect(computeGeometryHash(() => new Uint8Array(0))).toBe('sha256-empty');
  });
});

describe('resolveLocalPlacementMatrix', () => {
  it('returns identity when placement is null', () => {
    const api = makeApi();
    const m = resolveLocalPlacementMatrix(api, 1, null);
    expect([...m]).toEqual(IDENTITY_PLACEMENT);
  });

  it('uses injected axis2 resolver when placement is present', () => {
    const fixed = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      5, 6, 7, 1,
    ];
    const api: IfcApiLike = {
      ...makeApi(),
      GetLine: (_m, id) => {
        if (id === 99) return { RelativePlacement: { value: 42 } } as never;
        return makeApi().GetLine(_m, id);
      },
    };
    const m = resolveLocalPlacementMatrix(api, 1, { value: 99 }, () => fixed);
    expect([...m]).toEqual(fixed);
  });
});

describe('extractAllPsets', () => {
  it('aggregates every pset bound to the element', () => {
    const source: PsetSource = {
      forElement: (gid) => gid === FIXED_GUID
        ? [
          ['Pset_FurnitureCommon', { Reference: 'CHAIR-01', IsExternal: false }],
          ['Pset_Custom', { Vendor: 'Acme' }],
        ]
        : [],
    };
    const out = extractAllPsets(FIXED_GUID, source);
    expect(out).toEqual({
      Pset_FurnitureCommon: { Reference: 'CHAIR-01', IsExternal: false },
      Pset_Custom: { Vendor: 'Acme' },
    });
  });
});

describe('convertTier2Element', () => {
  it('builds an IFCProxyDTO with preserved GlobalId + geometry hash + psets', () => {
    const api = makeApi({ ifcType: 'IFCFURNITURE', name: 'Conference Chair' });
    const psetSource: PsetSource = {
      forElement: () => [['Pset_FurnitureCommon', { Reference: 'CHAIR-01' }]],
    };
    const proxy = convertTier2Element(
      api,
      1,
      100,
      psetSource,
      () => new Uint8Array([7, 8, 9]),
    );
    expect(proxy.id).toBe(`proxy-${FIXED_GUID}`);
    expect(proxy.globalId).toBe(FIXED_GUID);
    expect(proxy.ifcTypeName).toBe('IFCFURNITURE');
    expect(proxy.name).toBe('Conference Chair');
    expect(proxy.tier).toBe(2);
    expect(proxy.transform).toBeInstanceOf(Float32Array);
    expect(proxy.transform).toHaveLength(16);
    expect(proxy.geometryHash.startsWith('sha256-')).toBe(true);
    expect(proxy.psets.Pset_FurnitureCommon.Reference).toBe('CHAIR-01');
  });

  it('throws if GlobalId is missing', () => {
    const api: IfcApiLike = { GetLine: () => ({}) as never };
    expect(() => convertTier2Element(api, 1, 100, EMPTY_PSETS, () => null))
      .toThrow(/missing GlobalId/);
  });
});
