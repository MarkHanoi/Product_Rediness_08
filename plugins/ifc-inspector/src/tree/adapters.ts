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
}

/**
 * PRYZM's own elements, PROJECTED into IFC classes.
 *
 * ⭐ THE VALUABLE HALF. Nothing is invented: the class comes from the C25 §2
 * authority, and a family with no ratified class arrives as `unmapped` and is
 * NAMED in the tree rather than proxied.
 */
export function adaptNativeElements(
  elements: readonly NativeElementLike[],
  projectName = 'PRYZM model',
): IfcTreeSource {
  const adapted: IfcTreeElement[] = elements.map((e) => {
    const spatial: SpatialRung[] = [{ level: 'project', id: 'project', name: projectName }];
    if (e.levelId) {
      spatial.push({ level: 'storey', id: e.levelId, name: e.levelName || e.levelId });
    }
    return {
      id: e.id,
      name: e.name || `${e.type} ${e.id}`,
      origin: 'native',
      ifcClass: resolveIfcClass(e.type),
      spatial,
      storey: e.levelName ? authored(e.levelName) : e.levelId ? authored(e.levelId) : NOT_AUTHORED,
      // A blank here is genuinely NOT-AUTHORED: we read the field, it is empty.
      material: e.material ? authored(e.material) : NOT_AUTHORED,
      system: NOT_AUTHORED,
      globalId: e.ifcData?.guid ? authored(e.ifcData.guid) : NOT_AUTHORED,
      psets: e.psets ?? {},
    };
  });

  return {
    origin: 'native',
    label: projectName,
    capability: NATIVE_CAPABILITY,
    elements: adapted,
  };
}
