/**
 * Builds the IFC spatial hierarchy and global geometric context required for a
 * valid IFC4 file: `IfcProject` → `IfcSite` → `IfcBuilding` →
 * `IfcBuildingStorey`s, plus units and the model's geometric representation
 * context.
 *
 * Returns the storey refs keyed by PRYZM level id so element exporters can
 * place each element under the right storey.
 *
 * Attribute orderings below are taken directly from the live `web-ifc` 0.0.77
 * `CreateIfcEntity` field map (see __tests__ where each is round-tripped).
 */

import * as WebIFC from 'web-ifc';
import type { IfcAPI } from 'web-ifc';

import {
  label,
  real,
  writeEntity,
  type EntityRef,
} from './api/webifc-helpers.js';
import { mintGlobalId, type GuidProvider } from './guid-provider.js';
import type { LevelInfo, ProjectMeta } from './types.js';
import type { OwnerHistoryRefs } from './owner-history.js';

export interface HierarchyRefs {
  project: EntityRef;
  site: EntityRef;
  building: EntityRef;
  storeys: Map<string, EntityRef>;
  representationContext: EntityRef;
  worldOrigin: EntityRef;
  defaultPlacement: EntityRef;
}

const DEFAULT_LEVEL: LevelInfo = {
  id: 'level_default',
  name: 'Ground Floor',
  elevation: 0,
};

function buildUnits(api: IfcAPI, modelId: number): EntityRef {
  // IFCSIUNIT(UnitType, Prefix, Name) — Dimensions is auto-derived (`*`).
  const lengthUnit = writeEntity(api, modelId, WebIFC.IFCSIUNIT, 'LENGTHUNIT', null, 'METRE');
  const areaUnit = writeEntity(api, modelId, WebIFC.IFCSIUNIT, 'AREAUNIT', null, 'SQUARE_METRE');
  const volumeUnit = writeEntity(api, modelId, WebIFC.IFCSIUNIT, 'VOLUMEUNIT', null, 'CUBIC_METRE');
  const angleUnit = writeEntity(api, modelId, WebIFC.IFCSIUNIT, 'PLANEANGLEUNIT', null, 'RADIAN');
  return writeEntity(api, modelId, WebIFC.IFCUNITASSIGNMENT, [
    lengthUnit,
    areaUnit,
    volumeUnit,
    angleUnit,
  ]);
}

function buildOrigin(api: IfcAPI, modelId: number): { origin: EntityRef; placement: EntityRef } {
  const origin = writeEntity(
    api,
    modelId,
    WebIFC.IFCCARTESIANPOINT,
    [real(api, modelId, 0), real(api, modelId, 0), real(api, modelId, 0)],
  );
  const zDir = writeEntity(api, modelId, WebIFC.IFCDIRECTION, [
    real(api, modelId, 0),
    real(api, modelId, 0),
    real(api, modelId, 1),
  ]);
  const xDir = writeEntity(api, modelId, WebIFC.IFCDIRECTION, [
    real(api, modelId, 1),
    real(api, modelId, 0),
    real(api, modelId, 0),
  ]);
  const axis = writeEntity(api, modelId, WebIFC.IFCAXIS2PLACEMENT3D, origin, zDir, xDir);
  const placement = writeEntity(api, modelId, WebIFC.IFCLOCALPLACEMENT, null, axis);
  return { origin, placement };
}

function buildRepresentationContext(api: IfcAPI, modelId: number, worldOrigin: EntityRef): EntityRef {
  const zDir = writeEntity(api, modelId, WebIFC.IFCDIRECTION, [
    real(api, modelId, 0),
    real(api, modelId, 0),
    real(api, modelId, 1),
  ]);
  const xDir = writeEntity(api, modelId, WebIFC.IFCDIRECTION, [
    real(api, modelId, 1),
    real(api, modelId, 0),
    real(api, modelId, 0),
  ]);
  const ctxPlacement = writeEntity(api, modelId, WebIFC.IFCAXIS2PLACEMENT3D, worldOrigin, zDir, xDir);
  const trueNorth = writeEntity(api, modelId, WebIFC.IFCDIRECTION, [
    real(api, modelId, 0),
    real(api, modelId, 1),
  ]);
  return writeEntity(
    api,
    modelId,
    WebIFC.IFCGEOMETRICREPRESENTATIONCONTEXT,
    null, // ContextIdentifier
    label(api, modelId, 'Model'), // ContextType
    3, // CoordinateSpaceDimension
    real(api, modelId, 1e-5), // Precision
    ctxPlacement,
    trueNorth,
  );
}

export function buildHierarchy(
  api: IfcAPI,
  modelId: number,
  projectMeta: ProjectMeta,
  levels: ReadonlyArray<LevelInfo>,
  ownerRefs: OwnerHistoryRefs,
  guid: GuidProvider,
): HierarchyRefs {
  const units = buildUnits(api, modelId);
  const { origin, placement } = buildOrigin(api, modelId);
  const repContext = buildRepresentationContext(api, modelId, origin);

  // IFCPROJECT(GlobalId, OwnerHistory, Name, Description, ObjectType, LongName, Phase, RepresentationContexts, UnitsInContext)
  const project = writeEntity(
    api,
    modelId,
    WebIFC.IFCPROJECT,
    mintGlobalId(api, modelId, guid),
    ownerRefs.ownerHistory,
    label(api, modelId, projectMeta.name),
    projectMeta.description ? label(api, modelId, projectMeta.description) : null,
    null, // ObjectType
    null, // LongName
    null, // Phase
    [repContext],
    units,
  );

  // IFCSITE(GlobalId, OwnerHistory, Name, Description, ObjectType, ObjectPlacement,
  //         Representation, LongName, CompositionType, RefLatitude, RefLongitude,
  //         RefElevation, LandTitleNumber, SiteAddress)
  const site = writeEntity(
    api,
    modelId,
    WebIFC.IFCSITE,
    mintGlobalId(api, modelId, guid),
    ownerRefs.ownerHistory,
    label(api, modelId, 'Site'),
    null, null,
    placement,
    null,
    null,
    'ELEMENT',
    null, null, null, null, null,
  );

  // IFCBUILDING(GlobalId, OwnerHistory, Name, Description, ObjectType, ObjectPlacement,
  //             Representation, LongName, CompositionType, ElevationOfRefHeight,
  //             ElevationOfTerrain, BuildingAddress)
  const building = writeEntity(
    api,
    modelId,
    WebIFC.IFCBUILDING,
    mintGlobalId(api, modelId, guid),
    ownerRefs.ownerHistory,
    label(api, modelId, 'Building'),
    null, null,
    placement,
    null,
    null,
    'ELEMENT',
    null, null, null,
  );

  const storeyLevels = levels.length > 0 ? levels : [DEFAULT_LEVEL];
  const storeys = new Map<string, EntityRef>();
  for (const level of storeyLevels) {
    // IFCBUILDINGSTOREY(GlobalId, OwnerHistory, Name, Description, ObjectType,
    //                   ObjectPlacement, Representation, LongName, CompositionType, Elevation)
    const storey = writeEntity(
      api,
      modelId,
      WebIFC.IFCBUILDINGSTOREY,
      mintGlobalId(api, modelId, guid),
      ownerRefs.ownerHistory,
      label(api, modelId, level.name),
      null, null,
      placement,
      null, null,
      'ELEMENT',
      real(api, modelId, level.elevation),
    );
    storeys.set(level.id, storey);
  }

  // Aggregations: project ⊃ site ⊃ building ⊃ storeys.
  // IFCRELAGGREGATES(GlobalId, OwnerHistory, Name, Description, RelatingObject, RelatedObjects)
  writeEntity(api, modelId, WebIFC.IFCRELAGGREGATES,
    mintGlobalId(api, modelId, guid), ownerRefs.ownerHistory, null, null, project, [site],
  );
  writeEntity(api, modelId, WebIFC.IFCRELAGGREGATES,
    mintGlobalId(api, modelId, guid), ownerRefs.ownerHistory, null, null, site, [building],
  );
  writeEntity(api, modelId, WebIFC.IFCRELAGGREGATES,
    mintGlobalId(api, modelId, guid), ownerRefs.ownerHistory, null, null, building,
    Array.from(storeys.values()),
  );

  return {
    project,
    site,
    building,
    storeys,
    representationContext: repContext,
    worldOrigin: origin,
    defaultPlacement: placement,
  };
}

export function resolveStorey(
  hierarchy: HierarchyRefs,
  pryzmLevelId: string | null | undefined,
): EntityRef {
  if (pryzmLevelId && hierarchy.storeys.has(pryzmLevelId)) {
    return hierarchy.storeys.get(pryzmLevelId)!;
  }
  const first = hierarchy.storeys.values().next().value;
  if (!first) throw new Error('No building storey available');
  return first;
}
