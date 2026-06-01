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

/**
 * Postal-address subset used to populate `IfcSite.SiteAddress`. Field names
 * track `IfcPostalAddress` (`IFC4`/`IFC4X3`) so the mapping is unambiguous.
 *
 * The fields are optional individually — the exporter emits an
 * `IfcPostalAddress` only when at least one field is present.
 */
export interface SiteAddressInput {
  /** `IfcPostalAddress.AddressLines` — street lines, e.g. ["10 Downing St"]. */
  addressLines?: ReadonlyArray<string>;
  /** `IfcPostalAddress.Town`. */
  town?: string;
  /** `IfcPostalAddress.Region` (state / province). */
  region?: string;
  /** `IfcPostalAddress.PostalCode`. */
  postalCode?: string;
  /** `IfcPostalAddress.Country`. */
  country?: string;
}

/**
 * Geospatial site description — populates `IfcSite` per
 * [C25 §1.4](../../../docs/02-decisions/contracts/C25-IFC-EXPORT-PRODUCTION.md) and
 * cross-links to the LTP-ENU contract in
 * [C12 §3](../../../docs/02-decisions/contracts/C12-GEOSPATIAL.md).
 *
 * When this is provided to `buildHierarchy`, the exporter sets:
 *   - `RefLatitude`  ← `decimalToDegMinSecArray(latitudeDeg)`
 *   - `RefLongitude` ← `decimalToDegMinSecArray(longitudeDeg)`
 *   - `RefElevation` ← `elevationM`
 *   - `LandTitleNumber` ← `landTitleNumber` (if present)
 *   - `SiteAddress` ← `IfcPostalAddress(...address)` (if any address field present)
 *
 * When absent, the exporter leaves all five attributes as `null`
 * (project-origin defaults). This is the PRYZM 2 baseline behaviour.
 */
export interface SiteModel {
  /** Decimal degrees, [-90, 90]. */
  latitudeDeg: number;
  /** Decimal degrees, [-180, 180]. */
  longitudeDeg: number;
  /** Elevation above sea level, in metres. */
  elevationM: number;
  /** Optional land title / cadastral reference (`IfcSite.LandTitleNumber`). */
  landTitleNumber?: string;
  /** Optional postal address (`IfcSite.SiteAddress`). */
  address?: SiteAddressInput;
}

/**
 * Convert a decimal-degree value to the IFC4X3
 * `IfcCompoundPlaneAngleMeasure` array form:
 * `[degrees, minutes, seconds, millionths-of-second]`.
 *
 * Each element is an integer (the IFC schema mandates integer components).
 * Sign handling: negative values (south / west) carry the sign on the
 * `degrees` component only; `minutes` / `seconds` / `millionths` are always
 * non-negative.
 *
 * Examples:
 *   `decimalToDegMinSecArray(0)        → [0, 0, 0, 0]`
 *   `decimalToDegMinSecArray(51.5074)  → [51, 30, 26, 640000]`
 *   `decimalToDegMinSecArray(-33.8688) → [-33, 52, 7, 680000]`
 */
export function decimalToDegMinSecArray(
  decimal: number,
): [number, number, number, number] {
  const sign = decimal < 0 ? -1 : 1;
  const abs = Math.abs(decimal);
  let deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  let min = Math.floor(minFloat);
  const secFloat = (minFloat - min) * 60;
  let sec = Math.floor(secFloat);
  let millionths = Math.round((secFloat - sec) * 1_000_000);

  // Carry-on rounding: Math.round on millionths can roll 999999.5 → 1_000_000.
  if (millionths === 1_000_000) {
    millionths = 0;
    sec += 1;
  }
  if (sec === 60) {
    sec = 0;
    min += 1;
  }
  if (min === 60) {
    min = 0;
    deg += 1;
  }

  return [sign * deg, min, sec, millionths];
}

function compoundPlaneAngle(
  api: IfcAPI,
  modelId: number,
  decimal: number,
): ReturnType<IfcAPI['CreateIfcType']> {
  return api.CreateIfcType(
    modelId,
    WebIFC.IFCCOMPOUNDPLANEANGLEMEASURE,
    decimalToDegMinSecArray(decimal),
  );
}

function buildSiteAddress(
  api: IfcAPI,
  modelId: number,
  address: SiteAddressInput,
): EntityRef | null {
  const lines = address.addressLines?.filter((s) => s.length > 0) ?? [];
  const hasAnyField =
    lines.length > 0 ||
    !!address.town ||
    !!address.region ||
    !!address.postalCode ||
    !!address.country;
  if (!hasAnyField) return null;

  // IFCPOSTALADDRESS(Purpose, Description, UserDefinedPurpose,
  //                  InternalLocation, AddressLines, PostalBox,
  //                  Town, Region, PostalCode, Country)
  return writeEntity(
    api,
    modelId,
    WebIFC.IFCPOSTALADDRESS,
    null, // Purpose
    null, // Description
    null, // UserDefinedPurpose
    null, // InternalLocation
    lines.length > 0 ? lines.map((s) => label(api, modelId, s)) : null,
    null, // PostalBox
    address.town ? label(api, modelId, address.town) : null,
    address.region ? label(api, modelId, address.region) : null,
    address.postalCode ? label(api, modelId, address.postalCode) : null,
    address.country ? label(api, modelId, address.country) : null,
  );
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
  /**
   * Optional geospatial site description. When present, populates
   * `IfcSite.RefLatitude/RefLongitude/RefElevation/LandTitleNumber/SiteAddress`
   * per [C25 §1.4](../../../docs/02-decisions/contracts/C25-IFC-EXPORT-PRODUCTION.md).
   * When absent, the IfcSite uses project-origin defaults (all attrs null)
   * and a debug log is emitted.
   */
  siteModel?: SiteModel,
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
  //
  // Geospatial attributes (RefLatitude/RefLongitude/RefElevation/LandTitleNumber/
  // SiteAddress) come from `siteModel` per C25 §1.4; absent → project-origin
  // defaults (all null) — IFC-α-1 master plan.
  let refLatitude: ReturnType<IfcAPI['CreateIfcType']> | null = null;
  let refLongitude: ReturnType<IfcAPI['CreateIfcType']> | null = null;
  let refElevation: ReturnType<IfcAPI['CreateIfcType']> | null = null;
  let landTitleNumber: ReturnType<typeof label> | null = null;
  let siteAddress: EntityRef | null = null;

  if (siteModel) {
    refLatitude = compoundPlaneAngle(api, modelId, siteModel.latitudeDeg);
    refLongitude = compoundPlaneAngle(api, modelId, siteModel.longitudeDeg);
    refElevation = real(api, modelId, siteModel.elevationM);
    if (siteModel.landTitleNumber) {
      landTitleNumber = label(api, modelId, siteModel.landTitleNumber);
    }
    if (siteModel.address) {
      siteAddress = buildSiteAddress(api, modelId, siteModel.address);
    }
  } else {
    // Use console.debug rather than throwing — exports without a SiteModel
    // are valid (project-origin defaults).
    // eslint-disable-next-line no-console
    console.debug(
      '[ifc-export/hierarchy] no SiteModel — IfcSite using project-origin defaults; lat/lon/elevation undefined',
    );
  }

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
    refLatitude,
    refLongitude,
    refElevation,
    landTitleNumber,
    siteAddress,
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
