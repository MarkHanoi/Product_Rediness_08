/**
 * Public type surface for `@pryzm/plugin-ifc-import`.
 *
 * Phase 3-B Sprint S57 — IFC Tier 2 Import (Transform-Only Proxy)
 * (`docs/00_NEW_ARCHITECTURE/phases/PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md` §3.1).
 */

// A.R.3 (Revit round-trip) — bind to the canonical L0 shape via the plugin-sdk
// (L6) facade so ifc-import, ifc-export, and the L3 IfcMetaStore (@pryzm/stores)
// share ONE definition. Imported WITH the historical IFC* aliases so this file
// can use them, and re-exported for downstream modules.
import type { IfcElementMeta as IFCElementMeta, IfcElementTier as IFCElementTier, Pset, PsetValue } from '@pryzm/plugin-sdk';
export type { IFCElementMeta, IFCElementTier, Pset, PsetValue };

/**
 * Tier 2 transform-only proxy DTO emitted by `convertTier2Element`.
 *
 * Tier 2 elements are imported as immutable proxies — only the 4×4 placement
 * matrix is editable through the move/rotate gizmo. The geometry is baked
 * once and addressed by SHA-256 hash; subsequent edits never mutate the
 * geometry chunk, only the transform.
 *
 * Per spec §3.1 lines 736-746.
 */
export interface IFCProxyDTO {
  /** PRYZM proxy element id, of the form `proxy-<globalId>`. */
  id: string;
  /** IFC `GloballyUniqueId` (22-char base64). The join key for round-trip. */
  globalId: string;
  /** IFC entity type — `IFCFURNISHINGELEMENT`, `IFCFLOWTERMINAL`, etc. */
  ifcTypeName: string;
  name?: string | undefined;
  /** 4×4 column-major matrix (THREE.Matrix4.elements compatible). 16 floats. */
  transform: Float32Array;
  /** SHA-256 of the baked geometry chunk. Identifies the chunk in the bake-worker cache. */
  geometryHash: string;
  /** All `IfcPropertySet`s that referenced this element. */
  psets: Record<string, Pset>;
  /** Always 2 — Tier 1 elements are imported as native PRYZM DTOs by S55. */
  tier: 2;
}

// `IFCElementTier` (1|2|3) is now the canonical `IfcElementTier` from
// @pryzm/schemas/ifc — imported + re-exported at the top of this file.
// Tier classification per [ADR 0023-second-tier-elements-triage]:
//   Tier 1 = native conversion (wall, slab, door, window, column, beam).
//   Tier 2 = transform-only proxy (furniture, structural proxy, MEP equipment).
//   Tier 3 = library-mount only (no edit, no proxy).

/**
 * IFC entity types that are imported as Tier 2 transform-only proxies.
 * Anything not in this set + not Tier 1 is currently dropped (Tier 3).
 */
export const TIER_2_IFC_TYPES = new Set<string>([
  'IFCFURNISHINGELEMENT',
  'IFCFURNITURE',
  'IFCSYSTEMFURNITUREELEMENT',
  'IFCFLOWTERMINAL',
  'IFCFLOWFITTING',
  'IFCFLOWSEGMENT',
  'IFCFLOWCONTROLLER',
  'IFCFLOWMOVINGDEVICE',
  'IFCFLOWSTORAGEDEVICE',
  'IFCFLOWTREATMENTDEVICE',
  'IFCDISTRIBUTIONELEMENT',
  'IFCDISTRIBUTIONCONTROLELEMENT',
  'IFCDISTRIBUTIONFLOWELEMENT',
  'IFCMEMBER',
  'IFCPLATE',
  'IFCRAILING',
  'IFCSTAIR',
  'IFCRAMP',
  'IFCROOF',
  'IFCBUILDINGELEMENTPROXY',
]);

/**
 * Same shape as `@pryzm/plugin-ifc-export#IFCElementMeta` (re-exported here
 * to keep the import side independent).  Round-trip works because the two
 * shapes are identity-compatible.
 */
// `IFCElementMeta` is now the canonical `IfcElementMeta` from @pryzm/schemas/ifc
// — imported + re-exported at the top of this file (the shape is identical:
// pryzmElementId · globalId · typeName · name? · description? · objectType? ·
// psets · quantities? · tier). One source of truth across import/export/store.

/**
 * Population result of `populateMetaStoreFromBytes()`. The exporter side
 * consumes `metaByGlobalId` to look up Pset state on subsequent re-exports.
 */
export interface ImportResult {
  proxies: IFCProxyDTO[];
  metas: IFCElementMeta[];
  /** Map keyed by GlobalId — convenient for re-bind on round-trip. */
  metaByGlobalId: Map<string, IFCElementMeta>;
  /** Counts useful for OTel attribution and exit-criteria assertions. */
  counts: {
    tier1: number;
    tier2: number;
    psets: number;
  };
}

/**
 * Move command for Tier 2 proxies (per spec §3.1 lines 799-817).
 * Translation is applied to columns 12/13/14 of the column-major matrix
 * — i.e. the placement origin in world meters.
 */
export interface MoveIFCProxyCommand {
  kind: 'ifcProxy.move';
  /** PRYZM proxy element id. */
  id: string;
  /** Delta in world meters: `[dx, dy, dz]`. */
  translate: [number, number, number];
}

/**
 * Pure result of applying a `MoveIFCProxyCommand` to a proxy.  Returns a
 * fresh `Float32Array(16)` — does not mutate the input.
 */
export interface MoveResult {
  /** New 4×4 column-major matrix. */
  transform: Float32Array;
}
