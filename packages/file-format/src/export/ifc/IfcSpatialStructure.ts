/**
 * IfcSpatialStructure.ts - IfcProject -> IfcSite -> IfcBuilding* -> IfcBuildingStorey*.
 *
 * ADR-0385 (founder ask, 2026-09-09): "each building should be considered as a
 * different building entity for the IFC schema". This file used to call
 * createBuilding() exactly ONCE, unconditionally, from a SINGULAR `model.building`
 * hard-coded to {id:'building-1', name:'Default Building'} - so a master plan of
 * three blocks exported as ONE building owning nine storeys. It now writes one
 * IfcBuilding per IntermediateModel.buildings entry, each aggregating its OWN
 * storeys.
 *
 * -- THE TWO RELATIONSHIP ENTITIES, CITED NOT INVENTED ------------------------
 *
 * Spatial-to-spatial decomposition is IfcRelAggregates; element-to-spatial
 * containment is IfcRelContainedInSpatialStructure. Both exist unchanged in the
 * two schemas Pipeline A can emit (IfcExporter.ExportOptions.schema is
 * 'IFC2X3' | 'IFC4', default 'IFC4'; the Revit route at
 * apps/editor/src/engine/initUI.ts:2003 passes 'IFC2X3'):
 *
 *   - IFC4 (ISO 16739-1:2018) 5.1.3.3 IfcRelAggregates - the general concept of
 *     elements being composed or decomposed; IfcSpatialStructureElement inherits
 *     IsDecomposedBy / Decomposes from IfcObjectDefinition. IFC4 5.1.2.5
 *     IfcBuilding: a building is decomposed into building storeys using
 *     IfcRelAggregates, and IfcSite aggregates IfcBuilding.
 *   - IFC2x3 (ISO/PAS 16739:2005) IfcRelAggregates under
 *     IfcKernel.IfcRelDecomposes - same semantics, same RelatingObject /
 *     RelatedObjects attributes; the IFC2x3 IfcBuilding spatial-structure note
 *     states the same site->building->storey decomposition.
 *   - IfcRelContainedInSpatialStructure (IFC4 5.1.3.5 / IFC2x3
 *     IfcProductExtension) relates PRODUCTS to a spatial element and is unchanged
 *     here - elements still attach to their storey, and the storey now attaches
 *     to the right building.
 *
 * NOTHING about the RELATIONSHIP entities changes. The defect was CARDINALITY:
 * one IfcBuilding where the model has several. IFC4X3 is out of scope - Pipeline
 * A cannot express it (L-8560).
 *
 * -- THE STOREY KEY IS THE DANGEROUS PART -------------------------------------
 *
 * storeyKey() seeds ifcGlobalId(). Storeys are now identified by a SLOT
 * (ifcIdentity.storeySlot) which degenerates to the bare levelId for the default
 * building, so every project authored before ADR-0385 keeps byte-identical storey
 * GlobalIds. See that function's own header - it is the L-8501 pin.
 */

import * as WEBIFC from 'web-ifc';
import { IntermediateModel, ExportLevel, ExportBuilding } from './IntermediateModel';
import {
    ifcGlobalId,
    projectKey,
    siteKey,
    buildingKey,
    storeyKey,
    storeySlot,
    relAggregatesKey,
    DEFAULT_BUILDING_ID,
    UNASSIGNED_LEVEL_ID,
    UNASSIGNED_LEVEL_NAME,
} from './ifcIdentity';
import { DEFAULT_BUILDING_NAME } from '@pryzm/core-app-model';

type EntityRef = WEBIFC.IfcLineObject | number;

export interface SpatialRefs {
    projectRef: EntityRef;
    siteRef: EntityRef;
    /**
     * ADR-0385 - one IfcBuilding per model building, keyed by ExportBuilding.id.
     * NEVER EMPTY: create() synthesises the default rather than write a file with
     * no building in it.
     */
    buildingRefs: Map<string, EntityRef>;
    /**
     * Keyed by STOREY SLOT (ifcIdentity.storeySlot(buildingId, levelId)), NOT by
     * bare levelId. Block A "Level 1" and Block B "Level 1" are one PRYZM levelId
     * and two storeys; a Map<levelId, ...> cannot express that. For the default
     * building the slot IS the levelId, which is what keeps every existing
     * project's keys unchanged.
     */
    storeyRefs: Map<string, EntityRef>;
    /** IfcLocalPlacement for each storey. Keyed by SLOT. */
    storeyPlacementRefs: Map<string, EntityRef>;
    /** Keyed by SLOT. */
    storeyElevations: Map<string, number>;
    /** SLOT -> the building that owns it. Drives finaliseBuildingAggregation(). */
    storeyBuildingIds: Map<string, string>;
    contextRef: EntityRef;
    placementRef: EntityRef;
    /**
     * L-8503 — `IfcOwnerHistory`, shared by EVERY owned entity in the file.
     *
     * It used to exist only on `IfcProject`; every other entity passed `null`.
     * `OwnerHistory` is optional in IFC4, but omitting it everywhere loses the
     * authoring application, the author and the creation date for the whole
     * model — precisely the provenance a downstream consultant needs.
     */
    ownerHistoryRef: EntityRef;
    /**
     * L-8510 — lazily-created storey for elements whose `levelId` does not
     * resolve. See {@link UNASSIGNED_LEVEL_ID}.
     */
    ensureUnassignedStorey(): { storeyRef: EntityRef; placementRef: EntityRef };
}

const lb = (v: string) => v;
const id = (v: string) => v;
const tx = (v: string) => v;

export class IfcSpatialStructure {
    private api: WEBIFC.IfcAPI;
    private modelID: number;
    /** Populated by create(); every owned entity carries it. */
    private ownerHistoryRef: EntityRef | null = null;

    constructor(api: WEBIFC.IfcAPI, modelID: number) {
        this.api = api;
        this.modelID = modelID;
    }

    private w(entity: WEBIFC.IfcLineObject): WEBIFC.IfcLineObject {
        this.api.WriteLine(this.modelID, entity);
        return entity;
    }

    create(model: IntermediateModel): SpatialRefs {
        const contextRef   = this.createGeometricContext();
        const placementRef = this.createWorldPlacement();

        // L-8503: build OwnerHistory FIRST so project, site, building, storeys
        // and every downstream element can all reference the same instance.
        this.ownerHistoryRef = this.createOwnerHistory();
        const ownerHistoryRef = this.ownerHistoryRef;

        const projectRef  = this.createProject(model.project, contextRef);
        const siteRef     = this.createSite(model.site, placementRef);

        // -- ADR-0385: N buildings, in model order ---------------------------
        // An empty `buildings` array is a caller bug, but an exporter that throws
        // loses the user's model. Synthesise the default instead - it is the same
        // entity the pre-ADR-0385 pipeline always wrote.
        const declared: ExportBuilding[] = model.buildings?.length
            ? model.buildings
            : [{ id: DEFAULT_BUILDING_ID, name: DEFAULT_BUILDING_NAME }];

        const buildingRefs = new Map<string, EntityRef>();
        const buildingOrder: string[] = [];
        for (const building of declared) {
            if (buildingRefs.has(building.id)) continue; // the id is the map key; never write two
            buildingRefs.set(building.id, this.createBuilding(building, placementRef));
            buildingOrder.push(building.id);
        }
        /** The building a storey falls to when its level names none that exists. */
        const fallbackBuildingId = buildingRefs.has(DEFAULT_BUILDING_ID)
            ? DEFAULT_BUILDING_ID
            : (buildingOrder[0] as string);

        const storeyRefs          = new Map<string, EntityRef>();
        const storeyPlacementRefs = new Map<string, EntityRef>();
        const storeyElevations    = new Map<string, number>();
        const storeyBuildingIds   = new Map<string, string>();

        for (const level of model.levels) {
            // A level naming a building that was not declared would otherwise be
            // written into a building that does not exist. Fall back explicitly.
            const buildingId = level.buildingId && buildingRefs.has(level.buildingId)
                ? level.buildingId
                : fallbackBuildingId;
            const slot = storeySlot(buildingId, level.id);
            const { entity, placementRef: storeyPl } = this.createStorey(level, placementRef, slot);
            storeyRefs.set(slot, entity);
            storeyPlacementRefs.set(slot, storeyPl);
            storeyElevations.set(slot, level.elevation ?? 0);
            storeyBuildingIds.set(slot, buildingId);
        }

        this.createAggregation(projectKey(model.project.id), projectRef, [siteRef]);
        // IFC4 5.1.2.5 / IFC2x3: the site aggregates ITS BUILDINGS - ONE relationship
        // holding N related objects, not N relationships. Its GlobalId is seeded from
        // the SITE, so it is unchanged for a one-building model.
        this.createAggregation(
            siteKey(model.site.id),
            siteRef,
            buildingOrder.map((id) => buildingRefs.get(id) as EntityRef),
        );

        // The building -> storey aggregations are emitted LAST, by
        // finaliseBuildingAggregation(), so that a lazily-created UNASSIGNED
        // storey is included in one. Emitting them here would orphan that storey.
        const self = this;
        let unassigned: { storeyRef: EntityRef; placementRef: EntityRef } | null = null;

        return {
            projectRef, siteRef, buildingRefs,
            storeyRefs, storeyPlacementRefs, storeyElevations, storeyBuildingIds,
            contextRef, placementRef,
            ownerHistoryRef,
            ensureUnassignedStorey() {
                if (unassigned) return unassigned;
                const level: ExportLevel = {
                    id: UNASSIGNED_LEVEL_ID,
                    name: UNASSIGNED_LEVEL_NAME,
                    elevation: 0,
                    height: 0,
                };
                // The unplaced storey hangs off the fallback building. For the
                // ungrouped case that is the default building and the slot is the
                // bare UNASSIGNED id - byte-identical to pre-ADR-0385.
                const slot = storeySlot(fallbackBuildingId, UNASSIGNED_LEVEL_ID);
                const { entity, placementRef: pl } = self.createStorey(level, placementRef, slot);
                storeyRefs.set(slot, entity);
                storeyPlacementRefs.set(slot, pl);
                storeyElevations.set(slot, 0);
                storeyBuildingIds.set(slot, fallbackBuildingId);
                unassigned = { storeyRef: entity, placementRef: pl };
                return unassigned;
            },
        };
    }

    /**
     * Emit `IfcRelAggregates(building -> ITS OWN storeys)`, once per building.
     *
     * MUST be called after every element is written, because
     * {@link SpatialRefs.ensureUnassignedStorey} can add a storey mid-export and
     * a storey outside these aggregations is orphaned in the spatial tree.
     *
     * ADR-0385: each IfcBuilding aggregates only the storeys that resolved into
     * it. Three blocks of three storeys is three aggregations of three, never one
     * of nine. The `buildingId` parameter this used to take is GONE -
     * {@link SpatialRefs.storeyBuildingIds} carries the mapping, so a caller
     * cannot pass an id that disagrees with what create() actually wrote.
     */
    finaliseBuildingAggregation(refs: SpatialRefs): void {
        const byBuilding = new Map<string, EntityRef[]>();
        for (const [slot, storeyRef] of refs.storeyRefs) {
            const buildingId = refs.storeyBuildingIds.get(slot);
            if (!buildingId) continue; // unreachable: every slot is registered with its building
            const bucket = byBuilding.get(buildingId);
            if (bucket) bucket.push(storeyRef);
            else byBuilding.set(buildingId, [storeyRef]);
        }
        for (const [buildingId, buildingRef] of refs.buildingRefs) {
            // createAggregation() returns null for an empty list, so a building
            // with no storeys emits no relationship rather than an empty one.
            this.createAggregation(
                buildingKey(buildingId),
                buildingRef,
                byBuilding.get(buildingId) ?? [],
            );
        }
    }

    private pt3(x: number, y: number, z: number): EntityRef {
        return this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCCARTESIANPOINT,
            [x, y, z]));
    }

    private dir3(x: number, y: number, z: number): EntityRef {
        return this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCDIRECTION,
            [x, y, z]));
    }

    private axis3(origin: EntityRef, axisZ: EntityRef, axisX: EntityRef): EntityRef {
        return this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCAXIS2PLACEMENT3D,
            origin, axisZ, axisX));
    }

    private localPlacement(axis: EntityRef, parent: EntityRef | null = null): EntityRef {
        return this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCLOCALPLACEMENT,
            parent, axis));
    }

    private createGeometricContext(): EntityRef {
        const origin = this.pt3(0, 0, 0);
        const dirZ   = this.dir3(0, 0, 1);
        const dirX   = this.dir3(1, 0, 0);
        const axis   = this.axis3(origin, dirZ, dirX);

        return this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCGEOMETRICREPRESENTATIONCONTEXT,
            lb('Model'),
            lb('Model'),
            3,
            1.0e-5,
            axis,
            null));
    }

    private createWorldPlacement(): EntityRef {
        const origin = this.pt3(0, 0, 0);
        const dirZ   = this.dir3(0, 0, 1);
        const dirX   = this.dir3(1, 0, 0);
        const axis   = this.axis3(origin, dirZ, dirX);
        return this.localPlacement(axis, null);
    }

    private createOwnerHistory(): EntityRef {
        const person = this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCPERSON,
            null, lb('PRYZM User'), null, null, null, null, null, null));

        const organization = this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCORGANIZATION,
            null, lb('PRYZM'), null, null, null));

        const personAndOrg = this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCPERSONANDORGANIZATION,
            person, organization, null));

        const application = this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCAPPLICATION,
            organization, lb('1.0'), lb('PRYZM BIM Platform'), id('PRYZM')));

        const now = Math.floor(Date.now() / 1000);
        return this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCOWNERHISTORY,
            personAndOrg, application, null, { type: 3, value: 'ADDED' },
            now, personAndOrg, application, now));
    }

    private createProject(
        project: { id: string; guid?: string; name: string },
        contextRef: EntityRef,
    ): EntityRef {
        const lengthUnit     = this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCSIUNIT,
            null, { type: 3, value: 'LENGTHUNIT' }, null, { type: 3, value: 'METRE' }));
        const areaUnit       = this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCSIUNIT,
            null, { type: 3, value: 'AREAUNIT' }, null, { type: 3, value: 'SQUARE_METRE' }));
        const volumeUnit     = this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCSIUNIT,
            null, { type: 3, value: 'VOLUMEUNIT' }, null, { type: 3, value: 'CUBIC_METRE' }));
        const planeAngleUnit = this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCSIUNIT,
            null, { type: 3, value: 'PLANEANGLEUNIT' }, null, { type: 3, value: 'RADIAN' }));

        const unitAssignment = this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCUNITASSIGNMENT,
            [lengthUnit, areaUnit, volumeUnit, planeAngleUnit]));

        return this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCPROJECT,
            ifcGlobalId(project.guid, projectKey(project.id)),
            this.ownerHistoryRef, lb(project.name), tx('Exported from PRYZM'),
            null, null, null, [contextRef], unitAssignment));
    }

    private createSite(
        site: { id: string; guid?: string; name: string },
        placementRef: EntityRef,
    ): EntityRef {
        return this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCSITE,
            ifcGlobalId(site.guid, siteKey(site.id)),
            this.ownerHistoryRef, lb(site.name), null, null,
            placementRef, null, null, { type: 3, value: 'ELEMENT' },
            null, null, null, null, null));
    }

    private createBuilding(
        building: { id: string; guid?: string; name: string },
        placementRef: EntityRef,
    ): EntityRef {
        return this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCBUILDING,
            ifcGlobalId(building.guid, buildingKey(building.id)),
            this.ownerHistoryRef, lb(building.name), null, null,
            placementRef, null, null, { type: 3, value: 'ELEMENT' },
            null, null, null));
    }

    /**
     * @param storeySlotId the composite identity from `ifcIdentity.storeySlot`.
     *        NOT `level.id`: two buildings can carry the same PRYZM levelId and
     *        must produce two distinct IfcBuildingStorey GlobalIds.
     */
    private createStorey(
        level: ExportLevel,
        basePlacementRef: EntityRef,
        storeySlotId: string,
    ): { entity: EntityRef; placementRef: EntityRef } {
        const origin   = this.pt3(0, 0, level.elevation);
        const dirZ     = this.dir3(0, 0, 1);
        const dirX     = this.dir3(1, 0, 0);
        const axis     = this.axis3(origin, dirZ, dirX);
        const storeyPl = this.localPlacement(axis, basePlacementRef);

        const entity = this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCBUILDINGSTOREY,
            ifcGlobalId(level.guid, storeyKey(storeySlotId)),
            this.ownerHistoryRef, lb(level.name), null, null,
            storeyPl, null, null, { type: 3, value: 'ELEMENT' },
            level.elevation));

        return { entity, placementRef: storeyPl };
    }

    private createAggregation(
        relatingKey: string,
        relatingRef: EntityRef,
        relatedRefs: EntityRef[],
    ): EntityRef | null {
        if (relatedRefs.length === 0) return null;
        return this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCRELAGGREGATES,
            ifcGlobalId(null, relAggregatesKey(relatingKey)),
            this.ownerHistoryRef, null, null, relatingRef, relatedRefs));
    }
}
