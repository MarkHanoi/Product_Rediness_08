/**
 * `adapters.ts` — the two halves, normalised.
 *
 * §IFC-TREE-ADAPTERS (L-8314..L-8316) · C01 §6 rule 6.
 *
 * These are the ONLY places that know what a store looks like. They take plain
 * data (duck-typed, never an imported store singleton) so the tree module keeps
 * zero workspace dependencies and stays testable without a runtime.
 *
 * ⚠ The shapes below are COPIED FROM DISK, not invented:
 *   `IfcElementRecord`  packages/file-format/src/import/ifc/IfcModelStore.ts:1-10
 *   `IfcModelData`      packages/file-format/src/import/ifc/IfcModelStore.ts:12-17
 * `__tests__/tree-source-shape.test.ts` re-reads that file and fails if a field
 * is added or removed, so this cannot quietly drift into describing a store
 * that no longer exists.
 */

import { resolveIfcClass } from './ifc-class-authority.js';
import {
  IMPORTED_CAPABILITY,
  NATIVE_CAPABILITY,
  NOT_AUTHORED,
  NOT_EXTRACTED,
  authored,
  derived,
  unresolved,
  perPart,
  type Facet,
  type IfcTreeElement,
  type IfcTreeSource,
  type PsetScalar,
  type SpatialRung,
} from './tree-source.js';

/** Structural mirror of `IfcElementRecord`. */
export interface ImportedRecordLike {
  readonly id: string;
  readonly expressID: number;
  readonly name: string;
  readonly ifcTypeName: string;
  readonly rawIfcType: string;
  readonly storeyName: string;
  readonly storeyExpressID: number;
  readonly psets: Readonly<Record<string, Readonly<Record<string, PsetScalar>>>>;
}

/** Structural mirror of `IfcModelData`. */
export interface ImportedModelLike {
  readonly modelId: string;
  readonly modelName: string;
  readonly elements: readonly ImportedRecordLike[];
  readonly storeyOrder: readonly string[];
}

/**
 * Normalise raw IFC type text ('IFCWALLSTANDARDCASE') to class case
 * ('IfcWallStandardCase') WITHOUT a lookup table.
 *
 * ⭐ Deliberately NOT a fourth hand-maintained map. `FragmentReader.ts:250`
 * already keeps one and it covers ~16 of IFC's ~800 classes, so anything
 * outside it degrades. Since the imported file states its own class, the honest
 * move is to CARRY IT THROUGH rather than filter it against a list of the
 * classes PRYZM happens to know.
 */
export function normaliseRawIfcType(raw: string, fallbackName: string): string {
  const t = (raw || '').trim();
  if (!t) return fallbackName || 'IfcBuildingElementProxy';
  if (/^Ifc[A-Z]/.test(t)) return t;
  const up = t.toUpperCase();
  if (!up.startsWith('IFC')) return t;
  return 'Ifc' + up.slice(3).charAt(0) + up.slice(4).toLowerCase();
}

/**
 * Imported IFC -> tree elements.
 *
 * ⚠ Every `NOT_EXTRACTED` below is a MEASUREMENT of `IfcElementRecord`'s field
 * set, not an assumption about the file. The file very likely HAS materials,
 * systems and GlobalIds; PRYZM does not read them. Saying "none" would be a
 * claim about someone else's data that we never looked at.
 */
export function adaptImportedModel(model: ImportedModelLike): IfcTreeSource {
  const elements: IfcTreeElement[] = model.elements.map((r) => {
    const cls = normaliseRawIfcType(r.rawIfcType, r.ifcTypeName);
    const spatial: SpatialRung[] = [
      { level: 'building', id: model.modelId, name: model.modelName },
      { level: 'storey', id: `${model.modelId}:${r.storeyExpressID}`, name: r.storeyName || 'Unassigned' },
    ];
    return {
      id: r.id,
      name: r.name,
      origin: 'imported',
      // The file's own class is authoritative for imported content. It is NOT
      // routed through the PRYZM authority — that maps PRYZM types, not IFC.
      ifcClass: { status: 'mapped', ifcClass: cls, authority: 'C25§2' },
      spatial,
      storey: r.storeyName ? authored(r.storeyName) : NOT_AUTHORED,
      material: NOT_EXTRACTED(
        'IfcElementRecord has no material field; IfcRelAssociatesMaterial is not parsed.',
      ),
      system: NOT_EXTRACTED(
        'IfcElementRecord has no system field; IfcSystem membership is not parsed.',
      ),
      globalId: NOT_EXTRACTED(
        `IfcElementRecord carries expressID (${r.expressID}), not the IFC GlobalId string.`,
      ),
      psets: r.psets ?? {},
    };
  });

  return {
    origin: 'imported',
    label: model.modelName || 'Imported IFC',
    capability: IMPORTED_CAPABILITY,
    elements,
  };
}

/** What the native adapter needs about one PRYZM element. Duck-typed. */
export interface NativeElementLike {
  readonly id: string;
  readonly type: string;
  readonly name?: string;
  readonly levelId?: string;
  readonly levelName?: string;
  /** Only a few families author this — see NATIVE_CAPABILITY. */
  readonly material?: string | null;
  readonly ifcData?: { readonly guid?: string } | null;
  readonly psets?: Readonly<Record<string, Readonly<Record<string, PsetScalar>>>>;
  /**
   * §IFC-TREE-HOSTED-STOREY (L-8900) — the HOST reference for a C15 hosted
   * opening. A door/window has this and NO `levelId`
   * (`schemas/src/elements/Door.ts:48`, `Window.ts:48`); its storey belongs to
   * the wall it rides.
   */
  readonly wallId?: string | null;
  /**
   * §IFC-TREE-PER-PART-MATERIAL (L-8903) — doors/windows carry a material PER
   * SURFACE, never one plain `materialId`. C100 §9.1 rules that CORRECT.
   * Do NOT collapse these into `material`.
   */
  readonly frameMaterial?: string | null;
  readonly leafMaterial?: string | null;
}

/**
 * How a host reference resolves. THREE outcomes, because "no host" and "host
 * without a level" are different defects with different owners, and neither is
 * the same as a successful derivation.
 */
export type HostLevelResolution =
  | { readonly kind: 'resolved'; readonly levelId: string; readonly levelName: string }
  | { readonly kind: 'no-host' }
  | { readonly kind: 'host-has-no-level'; readonly hostId: string };

/**
 * Injected host index. Duck-typed so this module still imports no store.
 * The editor wiring backs it with `wallStore.getById()`
 * (`packages/geometry-wall/src/WallStore.ts:1146`).
 */
export interface HostIndex {
  resolveWallLevel(wallId: string | null | undefined): HostLevelResolution;
}

/** A host index that resolves nothing — the honest default when no wall store is reachable. */
export const NO_HOST_INDEX: HostIndex = Object.freeze({
  resolveWallLevel: (): HostLevelResolution => ({ kind: 'no-host' }),
});

/**
 * ADR-0385 — which `IfcBuilding` a storey belongs to.
 *
 * ⚠ A STRUCTURAL MIRROR of `BuildingResolution` in
 * `packages/core-app-model/src/hierarchy/BuildingResolver.ts`, deliberately
 * duck-typed for the same reason `ImportedRecordLike` above is: this module
 * imports no workspace store and stays testable without a runtime. The editor
 * wiring (`apps/editor/src/ui/ifc-tree/IfcTreeAttachment.ts`) backs it with the
 * REAL resolver — the same function `packages/file-format`'s IFC exporter calls,
 * which is what makes the tree and the exported file give one answer (C84 EI-9).
 *
 * ⛔ There is no rule here to get wrong. This interface carries a decision made
 * elsewhere; it never decides.
 */
export type BuildingResolutionLike =
  | { readonly kind: 'carried' | 'derived'; readonly buildingId: string; readonly name: string }
  | { readonly kind: 'unknown'; readonly why: string };

export interface BuildingIndex {
  resolveLevelBuilding(levelId: string | null | undefined): BuildingResolutionLike;
}

/**
 * A building index that resolves nothing.
 *
 * ⛔ It returns `unknown`, NOT a default building. "No hierarchy store is
 * reachable" and "this project records no buildings" are different facts, and the
 * second one is not this index's to assert (§CONTEXT-DATA-HONESTY, L-581/L-616).
 * Either way no rung is emitted — see {@link adaptNativeElements}.
 */
export const NO_BUILDING_INDEX: BuildingIndex = Object.freeze({
  resolveLevelBuilding: (): BuildingResolutionLike => ({
    kind: 'unknown',
    why: 'no building index was supplied to the adapter',
  }),
});

/**
 * PRYZM's own elements, PROJECTED into IFC classes.
 *
 * ⭐ THE VALUABLE HALF. Nothing is invented: the class comes from the C25 §2
 * authority, and a family with no ratified class arrives as `unmapped` and is
 * NAMED in the tree rather than proxied.
 */
/**
 * Families whose storey is owned by a HOST, not by themselves.
 *
 * MEASURED, not assumed: `packages/schemas/src/elements/Door.ts:48` and
 * `Window.ts:48` declare `wallId: idRef('wall')` and NO `levelId`.
 */
export const HOST_DERIVED_STOREY_TYPES: ReadonlySet<string> = new Set(['door', 'window']);

/**
 * PRYZM's own elements, PROJECTED into IFC classes.
 *
 * THE VALUABLE HALF. Nothing is invented: the class comes from the C25 §2
 * authority, and a family with no ratified class arrives as `unmapped` and is
 * NAMED in the tree rather than proxied.
 *
 * §IFC-TREE-HOSTED-STOREY (L-8900). A hosted opening's storey is resolved
 * THROUGH ITS HOST WALL and marked `derived`, never `authored` — so the tree
 * shows the door on Level 1 while still recording that the door does not itself
 * carry a level. Failure to resolve produces `unresolved` NAMING WHICH failure,
 * never a silent fall back to "not assigned".
 */
export function adaptNativeElements(
  elements: readonly NativeElementLike[],
  projectName = 'PRYZM model',
  hosts: HostIndex = NO_HOST_INDEX,
  buildings: BuildingIndex = NO_BUILDING_INDEX,
): IfcTreeSource {
  /** Levels whose building the substrate RECORDS — see the rung note below. */
  let carriedBuildings = 0;
  let unknownBuildings = 0;

  const adapted: IfcTreeElement[] = elements.map((e) => {
    const spatial: SpatialRung[] = [{ level: 'project', id: 'project', name: projectName }];

    // ---- storey -----------------------------------------------------------
    let storey: Facet;
    let storeyRung: SpatialRung | null = null;

    if (e.levelId) {
      // Directly carried. The ordinary case.
      const name = e.levelName || e.levelId;
      storey = authored(name);
      storeyRung = { level: 'storey', id: e.levelId, name };
    } else if (HOST_DERIVED_STOREY_TYPES.has(e.type)) {
      // Hosted: ask the wall. This is the fix for the "not assigned" bucket.
      const r = hosts.resolveWallLevel(e.wallId);
      if (r.kind === 'resolved') {
        storey = derived(r.levelName, `host wall ${e.wallId}`);
        storeyRung = { level: 'storey', id: r.levelId, name: r.levelName };
      } else if (r.kind === 'host-has-no-level') {
        storey = unresolved(
          `host wall ${r.hostId} carries no levelId — the wall is the defect, not this ${e.type}`,
        );
      } else {
        storey = unresolved(
          e.wallId
            ? `host wall ${e.wallId} is not in the wall store`
            : `this ${e.type} carries no wallId, so its host is unknown`,
        );
      }
    } else {
      // Genuinely could carry one and does not.
      storey = NOT_AUTHORED;
    }

    // ---- building ---------------------------------------------------------
    // ADR-0385. The rung is inserted BETWEEN project and storey (RUNG_ORDER in
    // groupings.ts is project/site/building/storey/space), so it must be pushed
    // before the storey rung.
    //
    // ⛔ EMITTED ONLY FOR `carried` — i.e. only when the hierarchy store actually
    // RECORDS which building this storey belongs to. A `derived` resolution is the
    // single default-building fallback, and drawing "Default Building" for every
    // ungrouped project would be exactly the padding `groupBySpatial`'s own header
    // forbids: *"Inventing a 'Building' rung to make the tree look like Revit's
    // would be fabricating spatial structure that is not in the file"* (C01 §6
    // rule 6). The IFC FILE still writes one IfcBuilding for that case because the
    // schema requires one; the TREE declines to name a building PRYZM never named.
    // Both are reading the same resolution — they differ in what they are allowed
    // to draw, not in what they believe.
    if (storeyRung) {
      const b = buildings.resolveLevelBuilding(storeyRung.id);
      if (b.kind === 'carried') {
        carriedBuildings += 1;
        spatial.push({ level: 'building', id: b.buildingId, name: b.name });
      } else if (b.kind === 'unknown') {
        unknownBuildings += 1;
      }
    }

    if (storeyRung) spatial.push(storeyRung);

    // ---- material ---------------------------------------------------------
    // C100 §9.1 — a door's frame and leaf finishes are TWO deliberate values.
    // Never flattened, never reported as "not authored".
    const parts: { part: string; value: string }[] = [];
    if (e.frameMaterial) parts.push({ part: 'frame', value: e.frameMaterial });
    if (e.leafMaterial) parts.push({ part: 'leaf', value: e.leafMaterial });
    const material: Facet = e.material
      ? authored(e.material)
      : parts.length > 0
        ? perPart(parts)
        : NOT_AUTHORED;

    return {
      id: e.id,
      name: e.name || `${e.type} ${e.id}`,
      origin: 'native',
      ifcClass: resolveIfcClass(e.type),
      spatial,
      storey,
      material,
      system: NOT_AUTHORED,
      globalId: e.ifcData?.guid ? authored(e.ifcData.guid) : NOT_AUTHORED,
      psets: e.psets ?? {},
    };
  });

  // ⛔ THE DEPTH CLAIM IS LIFTED ONLY WHEN A BUILDING WAS ACTUALLY RESOLVED.
  // `deepestSpatialRung` is what `groupBySpatial` prints as its honest limit note,
  // so declaring 'building' on a source that emitted no building rung would make
  // the note itself a false statement — a padded rung by another route.
  const capability = carriedBuildings > 0
    ? {
        ...NATIVE_CAPABILITY,
        deepestSpatialRung: 'building' as const,
        limitNote:
          NATIVE_CAPABILITY.limitNote +
          ' Buildings come from the project hierarchy (ADR-0385), the same authority the ' +
          'IFC export uses; storeys the hierarchy does not place are shown without a ' +
          'building rung rather than under an invented one.',
      }
    : unknownBuildings > 0
      ? {
          ...NATIVE_CAPABILITY,
          limitNote:
            NATIVE_CAPABILITY.limitNote +
            ` The building of ${unknownBuildings} element(s) could not be resolved, so no ` +
            'Building rung is shown for them. That is a failure to read the project ' +
            'hierarchy, NOT a project with no buildings.',
        }
      : NATIVE_CAPABILITY;

  return {
    origin: 'native',
    label: projectName,
    capability,
    elements: adapted,
  };
}
