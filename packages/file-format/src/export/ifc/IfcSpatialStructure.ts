import * as WEBIFC from 'web-ifc';
import { IntermediateModel, ExportLevel } from './IntermediateModel';
import {
    ifcGlobalId,
    projectKey,
    siteKey,
    buildingKey,
    storeyKey,
    relAggregatesKey,
    UNASSIGNED_LEVEL_ID,
    UNASSIGNED_LEVEL_NAME,
} from './ifcIdentity';

type EntityRef = WEBIFC.IfcLineObject | number;

export interface SpatialRefs {
    projectRef: EntityRef;
    siteRef: EntityRef;
    buildingRef: EntityRef;
    storeyRefs: Map<string, EntityRef>;
    /** IfcLocalPlacement for each storey — use as PlacementRelTo for element placements. */
    storeyPlacementRefs: Map<string, EntityRef>;
    storeyElevations: Map<string, number>;
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
        const buildingRef = this.createBuilding(model.building, placementRef);

        const storeyRefs          = new Map<string, EntityRef>();
        const storeyPlacementRefs = new Map<string, EntityRef>();
        const storeyElevations    = new Map<string, number>();

        for (const level of model.levels) {
            const { entity, placementRef: storeyPl } = this.createStorey(level, placementRef);
            storeyRefs.set(level.id, entity);
            storeyPlacementRefs.set(level.id, storeyPl);
            storeyElevations.set(level.id, level.elevation ?? 0);
        }

        this.createAggregation(projectKey(model.project.id), projectRef, [siteRef]);
        this.createAggregation(siteKey(model.site.id),       siteRef,    [buildingRef]);

        // The building -> storey aggregation is emitted LAST, by
        // finaliseBuildingAggregation(), so that a lazily-created UNASSIGNED
        // storey is included in it. Emitting it here would orphan that storey.
        const self = this;
        let unassigned: { storeyRef: EntityRef; placementRef: EntityRef } | null = null;

        return {
            projectRef, siteRef, buildingRef,
            storeyRefs, storeyPlacementRefs, storeyElevations,
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
                const { entity, placementRef: pl } = self.createStorey(level, placementRef);
                storeyRefs.set(UNASSIGNED_LEVEL_ID, entity);
                storeyPlacementRefs.set(UNASSIGNED_LEVEL_ID, pl);
                storeyElevations.set(UNASSIGNED_LEVEL_ID, 0);
                unassigned = { storeyRef: entity, placementRef: pl };
                return unassigned;
            },
        };
    }

    /**
     * Emit `IfcRelAggregates(building -> storeys)`.
     *
     * MUST be called after every element is written, because
     * {@link SpatialRefs.ensureUnassignedStorey} can add a storey mid-export and
     * a storey outside this aggregation is orphaned in the spatial tree.
     */
    finaliseBuildingAggregation(refs: SpatialRefs, buildingId: string): void {
        this.createAggregation(
            buildingKey(buildingId),
            refs.buildingRef,
            Array.from(refs.storeyRefs.values()),
        );
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

    private createStorey(level: ExportLevel, basePlacementRef: EntityRef): { entity: EntityRef; placementRef: EntityRef } {
        const origin   = this.pt3(0, 0, level.elevation);
        const dirZ     = this.dir3(0, 0, 1);
        const dirX     = this.dir3(1, 0, 0);
        const axis     = this.axis3(origin, dirZ, dirX);
        const storeyPl = this.localPlacement(axis, basePlacementRef);

        const entity = this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCBUILDINGSTOREY,
            ifcGlobalId(level.guid, storeyKey(level.id)),
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
