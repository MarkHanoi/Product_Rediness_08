/**
 * Tier 2 transform-only proxy converter.
 *
 * Phase 3-B Sprint S57 (PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md §3.1).
 *
 * Reads a single Tier 2 IFC entity (furniture, MEP equipment, structural
 * proxy) from an open `web-ifc` model and produces an `IFCProxyDTO`.
 * Geometry is baked once and addressed by SHA-256 hash; subsequent edits
 * never re-bake.
 */

// Use a portable JS sha256 (works in both Node and browser/Worker bundles).
// `node:crypto` would force vite to externalize a Node built-in into the
// browser bundle and explode at rollup time.
import { sha256 } from 'js-sha256';
import type { IFCProxyDTO, Pset } from '../types.js';

/** Subset of the web-ifc `IfcAPI` surface this converter actually touches. */
export interface IfcApiLike {
  GetLine(modelId: number, expressId: number, flatten?: boolean): {
    GlobalId?: { value?: string };
    Name?: { value?: string };
    ObjectPlacement?: { value?: number } | number | null;
  };
  GetTypeOfLine?: (modelId: number, expressId: number) => string | number;
  GetNameFromTypeCode?: (typeCode: number) => string;
}

/** Identity placement — used when the IFC entity has no `ObjectPlacement`. */
export const IDENTITY_PLACEMENT: number[] = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

/**
 * Resolve the IFC type name for an entity. web-ifc 0.0.77 exposes
 * `GetTypeOfLine` returning a numeric type code; we convert to the canonical
 * upper-case entity name via `GetNameFromTypeCode` when available, falling
 * back to the line's literal `type` field.
 */
export function resolveIfcTypeName(api: IfcApiLike, modelId: number, expressId: number): string {
  if (typeof api.GetTypeOfLine === 'function') {
    const typeCode = api.GetTypeOfLine(modelId, expressId);
    if (typeof typeCode === 'string') return typeCode.toUpperCase();
    if (typeof typeCode === 'number' && typeof api.GetNameFromTypeCode === 'function') {
      return String(api.GetNameFromTypeCode(typeCode)).toUpperCase();
    }
  }
  return 'IFCBUILDINGELEMENTPROXY';
}

/**
 * Resolve the local-placement chain to a 4×4 column-major matrix.
 *
 * The full IFC4 placement spec recurses through `IfcLocalPlacement →
 * PlacementRelTo` parents and composes their `IfcAxis2Placement3D`. This
 * converter handles the common single-link case; multi-level recursion is
 * deferred to S58 alongside opening cut-outs.
 */
export function resolveLocalPlacementMatrix(
  api: IfcApiLike,
  modelId: number,
  placementRef: { value?: number } | number | null | undefined,
  resolveAxis2: (id: number) => number[] = () => IDENTITY_PLACEMENT,
): number[] {
  const placementId = typeof placementRef === 'number'
    ? placementRef
    : placementRef?.value;
  if (placementId == null || placementId <= 0) {
    return IDENTITY_PLACEMENT.slice();
  }
  try {
    const placement = api.GetLine(modelId, placementId, true) as {
      RelativePlacement?: { value?: number } | number | null;
    };
    const axisId = typeof placement.RelativePlacement === 'number'
      ? placement.RelativePlacement
      : placement.RelativePlacement?.value;
    if (axisId == null) return IDENTITY_PLACEMENT.slice();
    return resolveAxis2(axisId).slice();
  } catch {
    return IDENTITY_PLACEMENT.slice();
  }
}

/**
 * Hash the geometry of a single express-id. Production callers pass the
 * raw vertex/index buffers from web-ifc's `GetGeometry` API; tests pass a
 * stub that returns deterministic bytes. The result is a stable cache key
 * for the bake-worker geometry chunk.
 */
export function computeGeometryHash(
  bytesProvider: () => Uint8Array | null | undefined,
): string {
  const bytes = bytesProvider();
  if (!bytes || bytes.byteLength === 0) {
    return 'sha256-empty';
  }
  return `sha256-${sha256(bytes)}`;
}

/**
 * Walk all `IfcRelDefinesByProperties` rels in the model and collect every
 * property set that references the given element express-id. Returns a
 * `Record<psetName, Pset>`. Test injects via `relIterator` to avoid pulling
 * a real model; production callers pass an iterator backed by
 * `api.GetLineIDsWithType(modelId, IFCRELDEFINESBYPROPERTIES)`.
 */
export interface PsetSource {
  /** Returns every `[psetName, properties]` tuple bound to this element. */
  forElement(elementGlobalId: string): Array<[string, Pset]>;
}

export function extractAllPsets(elementGlobalId: string, source: PsetSource): Record<string, Pset> {
  const out: Record<string, Pset> = {};
  for (const [name, props] of source.forElement(elementGlobalId)) {
    out[name] = { ...props };
  }
  return out;
}

/**
 * Convert a single Tier 2 IFC entity to an `IFCProxyDTO`.
 *
 * Per spec §3.1 lines 748-773. Pure given its dependencies — `psetSource`,
 * `geometryBytesProvider`, and `axis2Resolver` are injected so this function
 * is testable without spinning up a real `web-ifc` model.
 */
export function convertTier2Element(
  api: IfcApiLike,
  modelId: number,
  expressId: number,
  psetSource: PsetSource,
  geometryBytesProvider: (expressId: number) => Uint8Array | null | undefined,
  axis2Resolver?: (id: number) => number[],
): IFCProxyDTO {
  const line = api.GetLine(modelId, expressId, true);
  const globalId = line.GlobalId?.value ?? '';
  if (!globalId) {
    throw new Error(`convertTier2Element: missing GlobalId for express id ${expressId}`);
  }
  const placement = resolveLocalPlacementMatrix(api, modelId, line.ObjectPlacement, axis2Resolver);
  const geometryHash = computeGeometryHash(() => geometryBytesProvider(expressId));
  const psets = extractAllPsets(globalId, psetSource);
  const ifcTypeName = resolveIfcTypeName(api, modelId, expressId);

  return {
    id: `proxy-${globalId}`,
    globalId,
    ifcTypeName,
    name: line.Name?.value,
    transform: new Float32Array(placement),
    geometryHash,
    psets,
    tier: 2,
  };
}
