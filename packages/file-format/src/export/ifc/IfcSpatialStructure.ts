import * as WEBIFC from 'web-ifc';
import { IntermediateModel, ExportLevel } from './IntermediateModel';

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
}

const lb = (v: string) => v;
const id = (v: string) => v;
const tx = (v: string) => v;
const gi = (v: string) => v;

export class IfcSpatialStructure {
    private api: WEBIFC.IfcAPI;
    private modelID: number;

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

        const projectRef  = this.createProject(model.project.guid, model.project.name, contextRef);
        const siteRef     = this.createSite(model.site.guid, model.site.name, placementRef);
        const buildingRef = this.createBuilding(model.building.guid, model.building.name, placementRef);

        const storeyRefs          = new Map<string, EntityRef>();
        const storeyPlacementRefs = new Map<string, EntityRef>();
        const storeyElevations    = new Map<string, number>();

        for (const level of model.levels) {
            const { entity, placementRef: storeyPl } = this.createStorey(level, placementRef);
            storeyRefs.set(level.id, entity);
            storeyPlacementRefs.set(level.id, storeyPl);
            storeyElevations.set(level.id, level.elevation ?? 0);
        }

        this.createAggregation(projectRef,  [siteRef]);
        this.createAggregation(siteRef,     [buildingRef]);
        this.createAggregation(buildingRef, Array.from(storeyRefs.values()));

        return { projectRef, siteRef, buildingRef, storeyRefs, storeyPlacementRefs, storeyElevations, contextRef, placementRef };
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

    private createProject(guid: string, name: string, contextRef: EntityRef): EntityRef {
        const lengthUnit     = this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCSIUNIT,
            null, { type: 3, value: 'LENGTHUNIT' }, null, { type: 3, value: 'METRE' }));
        const areaUnit       = this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCSIUNIT,
            null, { type: 3, value: 'AREAUNIT' }, null, { type: 3, value: 'SQUARE_METRE' }));
        const volumeUnit     = this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCSIUNIT,
            null, { type: 3, value: 'VOLUMEUNIT' }, null, { type: 3, value: 'CUBIC_METRE' }));
        const planeAngleUnit = this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCSIUNIT,
            null, { type: 3, value: 'PLANEANGLEUNIT' }, null, { type: 3, value: 'RADIAN' }));

        const person = this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCPERSON,
            null, lb('Replit Agent'), null, null, null, null, null, null));

        const organization = this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCORGANIZATION,
            null, lb('PRYZM'), null, null, null));

        const personAndOrg = this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCPERSONANDORGANIZATION,
            person, organization, null));

        const application = this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCAPPLICATION,
            organization, lb('1.0'), lb('PRYZM BIM Platform'), id('PRYZM')));

        const ownerHistory = this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCOWNERHISTORY,
            personAndOrg, application, null, { type: 3, value: 'ADDED' },
            null, personAndOrg, application,
            Math.floor(Date.now() / 1000)));

        const unitAssignment = this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCUNITASSIGNMENT,
            [lengthUnit, areaUnit, volumeUnit, planeAngleUnit]));

        return this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCPROJECT,
            gi(guid), ownerHistory, lb(name), tx('Exported from PRYZM'),
            null, null, null, [contextRef], unitAssignment));
    }

    private createSite(guid: string, name: string, placementRef: EntityRef): EntityRef {
        return this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCSITE,
            gi(guid), null, lb(name), null, null,
            placementRef, null, null, { type: 3, value: 'ELEMENT' },
            null, null, null, null, null));
    }

    private createBuilding(guid: string, name: string, placementRef: EntityRef): EntityRef {
        return this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCBUILDING,
            gi(guid), null, lb(name), null, null,
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
            gi(level.guid), null, lb(level.name), null, null,
            storeyPl, null, null, { type: 3, value: 'ELEMENT' },
            level.elevation));

        return { entity, placementRef: storeyPl };
    }

    private createAggregation(relatingRef: EntityRef, relatedRefs: EntityRef[]): EntityRef | null {
        if (relatedRefs.length === 0) return null;
        return this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCRELAGGREGATES,
            gi(crypto.randomUUID()), null, null, null, relatingRef, relatedRefs));
    }
}
