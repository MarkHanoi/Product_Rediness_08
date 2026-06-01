/**
 * IfcSpace exporter — IFC-α-2 (2026-06-01).
 *
 * Each PRYZM Room → IfcSpace under the appropriate IfcBuildingStorey, with
 * Pset_SpaceCommon attached. The space is a spatial-element, not a building
 * product — per IFC4X3, IfcSpace inherits from IfcSpatialStructureElement.
 *
 * Per [C25-IFC-EXPORT-PRODUCTION §1.3](../../../docs/00_Contracts/C25-IFC-EXPORT-PRODUCTION.md)
 * + master plan IFC-α-2 §7.2.
 *
 * Architectural notes:
 *
 *   • IfcSpace is wired into the spatial hierarchy via IfcRelAggregates (NOT
 *     IfcRelContainedInSpatialStructure — that relation links building
 *     PRODUCTS, not spatial elements).
 *   • PredefinedType is one of the IFC4X3 IfcSpaceTypeEnum values:
 *     SPACE | PARKING | GFA | INTERNAL | EXTERNAL | USERDEFINED | NOTDEFINED.
 *     We collapse PRYZM's room-type taxonomy onto INTERNAL / EXTERNAL and put
 *     the granular kitchen/bedroom/etc. label into Pset_SpaceCommon.OccupancyType
 *     so downstream tools (schedules, COBie) can read it.
 *   • Geometry is a single IfcExtrudedAreaSolid from the room perimeter
 *     extruded upward by heightM — same SweptSolid pattern used by walls/slabs.
 *
 * Wrapped in a `pryzm.ifc.export-space` span (sprint exit criterion).
 */

import * as WebIFC from 'web-ifc';
import type { IfcAPI } from 'web-ifc';

import {
    identifier,
    label,
    real,
    text,
    writeEntity,
    type EntityRef,
    type ValueRef,
} from '../api/webifc-helpers.js';
import { mintGlobalId, type GuidProvider } from '../guid-provider.js';
import { withSpan } from '../otel.js';
import type { OwnerHistoryRefs } from '../owner-history.js';
import type { HierarchyRefs } from '../hierarchy.js';
import { resolveStorey } from '../hierarchy.js';

// ---------------------------------------------------------------------------
// Public input shape
// ---------------------------------------------------------------------------

/**
 * A PRYZM Room flattened into the minimal shape needed to emit an IfcSpace.
 *
 * The full `@pryzm/schemas` Room schema (`packages/schemas/src/elements/Room.ts`)
 * carries more fields (`materialColor`, `boundingWallIds`, …) but only these
 * are relevant to IFC export — the caller projects whichever Room
 * representation it has into this interface.
 */
export interface RoomToExport {
    /** PRYZM element id (`room_<ulid>`) — the join key into IFCMetaStore. */
    readonly id: string;
    /** Display name (→ IfcSpace.Name + LongName). */
    readonly name: string;
    /**
     * Room type tag: `'living' | 'kitchen' | 'bedroom' | 'bathroom' |
     * 'corridor' | 'hall' | 'wc' | 'ensuite' | 'utility' | 'storage' |
     * 'balcony' | 'terrace' | …`. Free-form; stored verbatim on
     * IfcSpace.ObjectType + Pset_SpaceCommon.OccupancyType.
     */
    readonly type: string;
    /** Net floor area in m² (→ Pset_SpaceCommon.NetFloorArea). */
    readonly netAreaM2: number;
    /**
     * Gross floor area in m² (→ Pset_SpaceCommon.GrossFloorArea). When the
     * source does not track gross + net separately, callers pass the same
     * value (or omit and let the exporter default to `netAreaM2`).
     */
    readonly grossAreaM2?: number;
    /** Floor-to-ceiling height in m (→ Pset_SpaceCommon.FinishCeilingHeight). */
    readonly heightM: number;
    /**
     * Closed polygon of the room boundary in world coordinates (XZ plane,
     * Y = ground). The first and last points need NOT match — the exporter
     * closes the ring automatically. Must have ≥ 3 points.
     */
    readonly perimeter: ReadonlyArray<{ x: number; z: number }>;
    /** Whether the room has at least one external wall. */
    readonly isExternal: boolean;
    /** PRYZM level id (→ which IfcBuildingStorey the space sits under). */
    readonly levelId?: string | null;
}

export interface SpaceExportArgs {
    api: IfcAPI;
    modelId: number;
    hierarchy: HierarchyRefs;
    ownerRefs: OwnerHistoryRefs;
    room: RoomToExport;
    guid: GuidProvider;
}

export interface ExportedSpace {
    /** The IfcSpace entity itself. */
    entity: EntityRef;
    /** The IfcBuildingStorey the space was aggregated under. */
    storey: EntityRef;
    /** PRYZM room id. */
    pryzmId: string;
    /** Pset_SpaceCommon IfcPropertySet entity (for assertions). */
    pset: EntityRef;
}

// ---------------------------------------------------------------------------
// Type mapping
// ---------------------------------------------------------------------------

/**
 * Map a PRYZM room type to an IFC4X3 IfcSpaceTypeEnum predefined type.
 *
 *   • balcony / terrace / external rooms → `EXTERNAL`
 *   • everything else → `INTERNAL`
 *
 * The detailed room type (kitchen, bedroom, …) is preserved on
 * `Pset_SpaceCommon.OccupancyType` instead.
 */
export function spaceTypeFor(roomType: string, isExternal: boolean): string {
    if (isExternal) return 'EXTERNAL';
    const lower = roomType.toLowerCase();
    if (lower === 'balcony' || lower === 'terrace') return 'EXTERNAL';
    return 'INTERNAL';
}

// ---------------------------------------------------------------------------
// Geometry helper: arbitrary closed profile → swept-solid representation
// ---------------------------------------------------------------------------

/**
 * Build an `IfcExtrudedAreaSolid` from a room perimeter polygon, wrapped in
 * an `IfcShapeRepresentation` ("SweptSolid") and an
 * `IfcProductDefinitionShape`. Mirrors the helper in `geometry.ts`
 * (`buildBoxRepresentation`) but uses an `IfcArbitraryClosedProfileDef`
 * instead of a rectangle profile so non-orthogonal rooms work.
 */
function buildSpaceShape(
    api: IfcAPI,
    modelId: number,
    representationContext: EntityRef,
    perimeter: ReadonlyArray<{ x: number; z: number }>,
    heightM: number,
): EntityRef {
    // Step 1 — polyline of 2D Cartesian points. IFC requires the polyline to
    // CLOSE, so we duplicate the first point at the end if the caller did not.
    const points: EntityRef[] = [];
    for (const p of perimeter) {
        points.push(
            writeEntity(api, modelId, WebIFC.IFCCARTESIANPOINT, [
                real(api, modelId, p.x),
                real(api, modelId, p.z),
            ]),
        );
    }
    const first = perimeter[0];
    const last = perimeter[perimeter.length - 1];
    if (first && last && (first.x !== last.x || first.z !== last.z)) {
        points.push(
            writeEntity(api, modelId, WebIFC.IFCCARTESIANPOINT, [
                real(api, modelId, first.x),
                real(api, modelId, first.z),
            ]),
        );
    }
    const polyline = writeEntity(api, modelId, WebIFC.IFCPOLYLINE, points);

    // Step 2 — arbitrary closed profile from the polyline.
    // IFCARBITRARYCLOSEDPROFILEDEF(ProfileType, ProfileName, OuterCurve)
    const profile = writeEntity(
        api,
        modelId,
        WebIFC.IFCARBITRARYCLOSEDPROFILEDEF,
        'AREA',
        null,
        polyline,
    );

    // Step 3 — extrude the profile up the +Z axis by `heightM`.
    const extrudeOrigin = writeEntity(api, modelId, WebIFC.IFCCARTESIANPOINT, [
        real(api, modelId, 0),
        real(api, modelId, 0),
        real(api, modelId, 0),
    ]);
    const extrudeZ = writeEntity(api, modelId, WebIFC.IFCDIRECTION, [
        real(api, modelId, 0),
        real(api, modelId, 0),
        real(api, modelId, 1),
    ]);
    const extrudeX = writeEntity(api, modelId, WebIFC.IFCDIRECTION, [
        real(api, modelId, 1),
        real(api, modelId, 0),
        real(api, modelId, 0),
    ]);
    const extrudePlacement = writeEntity(
        api,
        modelId,
        WebIFC.IFCAXIS2PLACEMENT3D,
        extrudeOrigin,
        extrudeZ,
        extrudeX,
    );
    const extrudeDirection = writeEntity(api, modelId, WebIFC.IFCDIRECTION, [
        real(api, modelId, 0),
        real(api, modelId, 0),
        real(api, modelId, 1),
    ]);
    const solid = writeEntity(
        api,
        modelId,
        WebIFC.IFCEXTRUDEDAREASOLID,
        profile,
        extrudePlacement,
        extrudeDirection,
        real(api, modelId, Math.max(heightM, 1e-3)),
    );

    const shapeRep = writeEntity(
        api,
        modelId,
        WebIFC.IFCSHAPEREPRESENTATION,
        representationContext,
        label(api, modelId, 'Body'),
        label(api, modelId, 'SweptSolid'),
        [solid],
    );

    return writeEntity(
        api,
        modelId,
        WebIFC.IFCPRODUCTDEFINITIONSHAPE,
        null,
        null,
        [shapeRep],
    );
}

// ---------------------------------------------------------------------------
// Pset_SpaceCommon writer
// ---------------------------------------------------------------------------

/**
 * Compute the gross volume (m³) — `GrossFloorArea × heightM` is the standard
 * Pset_SpaceCommon convention.
 */
function grossVolumeFor(room: RoomToExport): number {
    const gross = room.grossAreaM2 ?? room.netAreaM2;
    return gross * room.heightM;
}

/**
 * Emit `Pset_SpaceCommon` with Reference, NetFloorArea, GrossFloorArea,
 * GrossVolume, FinishCeilingHeight, OccupancyType, IsExternal — then attach
 * it to the IfcSpace via IfcRelDefinesByProperties.
 *
 * Returns the IfcPropertySet entity ref (NOT the relation ref) so callers
 * can use it in tests.
 */
function writeSpaceCommonPset(
    api: IfcAPI,
    modelId: number,
    ownerRefs: OwnerHistoryRefs,
    guid: GuidProvider,
    space: EntityRef,
    room: RoomToExport,
): EntityRef {
    const writeProp = (name: string, value: ValueRef): EntityRef =>
        writeEntity(
            api,
            modelId,
            WebIFC.IFCPROPERTYSINGLEVALUE,
            identifier(api, modelId, name),
            null,
            value,
            null,
        );

    const grossArea = room.grossAreaM2 ?? room.netAreaM2;
    const properties: EntityRef[] = [
        writeProp('Reference', label(api, modelId, room.type)),
        writeProp('NetFloorArea', real(api, modelId, room.netAreaM2)),
        writeProp('GrossFloorArea', real(api, modelId, grossArea)),
        writeProp('GrossVolume', real(api, modelId, grossVolumeFor(room))),
        writeProp('FinishCeilingHeight', real(api, modelId, room.heightM)),
        writeProp('OccupancyType', text(api, modelId, room.type)),
        writeProp('IsExternal', api.CreateIfcType(modelId, WebIFC.IFCBOOLEAN, room.isExternal)),
    ];

    const pset = writeEntity(
        api,
        modelId,
        WebIFC.IFCPROPERTYSET,
        mintGlobalId(api, modelId, guid),
        ownerRefs.ownerHistory,
        label(api, modelId, 'Pset_SpaceCommon'),
        null,
        properties,
    );

    writeEntity(
        api,
        modelId,
        WebIFC.IFCRELDEFINESBYPROPERTIES,
        mintGlobalId(api, modelId, guid),
        ownerRefs.ownerHistory,
        null,
        null,
        [space],
        pset,
    );

    return pset;
}

// ---------------------------------------------------------------------------
// Storey-aggregation writer
// ---------------------------------------------------------------------------

/**
 * Wire one or more IfcSpaces under their parent IfcBuildingStorey via
 * IfcRelAggregates. IfcSpace is a spatial-structure element, not a
 * "product", so it must use IfcRelAggregates (NOT
 * IfcRelContainedInSpatialStructure, which is reserved for IfcElements).
 *
 * Exported so `IFC4X3Exporter.ts` can batch all spaces per storey into one
 * relation (cheaper, cleaner topology).
 */
export function writeStoreyAggregatesSpaces(
    api: IfcAPI,
    modelId: number,
    ownerRefs: OwnerHistoryRefs,
    guid: GuidProvider,
    storey: EntityRef,
    spaces: ReadonlyArray<EntityRef>,
): EntityRef | null {
    if (spaces.length === 0) return null;
    return writeEntity(
        api,
        modelId,
        WebIFC.IFCRELAGGREGATES,
        mintGlobalId(api, modelId, guid),
        ownerRefs.ownerHistory,
        null,
        null,
        storey,
        spaces.slice(),
    );
}

// ---------------------------------------------------------------------------
// Main entry — emit one IfcSpace per Room
// ---------------------------------------------------------------------------

/**
 * Emit one `IfcSpace` for a PRYZM Room, with `Pset_SpaceCommon` attached.
 * Returns the entity ref + storey ref so the caller can batch-aggregate
 * multiple spaces under a single `IfcRelAggregates` per storey.
 *
 * Throws if the room's `netAreaM2` is non-finite or negative, or if
 * `perimeter` has fewer than 3 points.
 */
export function exportRoomToSpace(args: SpaceExportArgs): ExportedSpace {
    const { api, modelId, hierarchy, ownerRefs, room, guid } = args;

    if (!Number.isFinite(room.netAreaM2) || room.netAreaM2 < 0) {
        throw new Error(
            `[ifc-export/space] room ${room.id}: netAreaM2 must be a finite, non-negative number (got ${room.netAreaM2})`,
        );
    }
    if (room.perimeter.length < 3) {
        throw new Error(
            `[ifc-export/space] room ${room.id}: perimeter must have at least 3 points (got ${room.perimeter.length})`,
        );
    }
    if (!Number.isFinite(room.heightM) || room.heightM <= 0) {
        throw new Error(
            `[ifc-export/space] room ${room.id}: heightM must be a finite, positive number (got ${room.heightM})`,
        );
    }

    return withSpan(
        'pryzm.ifc.export-space',
        () => {
            const storey = resolveStorey(hierarchy, room.levelId ?? null);
            const globalId = mintGlobalId(api, modelId, guid);

            // 1. ObjectPlacement — LocalPlacement relative to the storey.
            //    For v1 the placement is the identity at the storey origin;
            //    the perimeter polygon supplies the world-XZ position.
            const originPt = writeEntity(api, modelId, WebIFC.IFCCARTESIANPOINT, [
                real(api, modelId, 0),
                real(api, modelId, 0),
                real(api, modelId, 0),
            ]);
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
            const axis = writeEntity(
                api,
                modelId,
                WebIFC.IFCAXIS2PLACEMENT3D,
                originPt,
                zDir,
                xDir,
            );
            const placement = writeEntity(
                api,
                modelId,
                WebIFC.IFCLOCALPLACEMENT,
                hierarchy.defaultPlacement,
                axis,
            );

            // 2. ProductDefinitionShape — perimeter extruded by heightM.
            const shape = buildSpaceShape(
                api,
                modelId,
                hierarchy.representationContext,
                room.perimeter,
                room.heightM,
            );

            // 3. IFCSPACE(GlobalId, OwnerHistory, Name, Description, ObjectType,
            //            ObjectPlacement, Representation, LongName, CompositionType,
            //            PredefinedType, ElevationWithFlooring)
            const entity = writeEntity(
                api,
                modelId,
                WebIFC.IFCSPACE,
                globalId,
                ownerRefs.ownerHistory,
                label(api, modelId, room.name),
                null,
                label(api, modelId, room.type),
                placement,
                shape,
                label(api, modelId, room.name),
                'ELEMENT',
                spaceTypeFor(room.type, room.isExternal),
                null,
            );

            // 4. Pset_SpaceCommon → attach via IfcRelDefinesByProperties.
            const pset = writeSpaceCommonPset(
                api,
                modelId,
                ownerRefs,
                guid,
                entity,
                room,
            );

            return { entity, storey, pryzmId: room.id, pset };
        },
        {
            'pryzm.ifc.element_id': room.id,
            'pryzm.ifc.element_type': 'space',
        },
    );
}
