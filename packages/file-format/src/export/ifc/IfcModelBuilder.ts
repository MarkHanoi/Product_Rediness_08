/**
 * IfcModelBuilder.ts
 *
 * Creates IFC building elements from the intermediate model.
 * Orchestrates geometry writer and property writer.
 *
 * IMPORTANT: All CreateIfcEntity calls MUST use spread arguments (one arg per IFC
 * attribute), never wrapped in a single array. List attributes (e.g. Coordinates,
 * RelatedElements) remain as arrays but are individual spread arguments.
 */

import * as WEBIFC from 'web-ifc';
import { ExportElement } from './IntermediateModel';
import { IfcGeometryWriter } from './IfcGeometryWriter';
import { IfcPropertyWriter } from './IfcPropertyWriter';
import { SpatialRefs } from './IfcSpatialStructure';
import { debug } from '@pryzm/core-app-model';

type EntityRef = WEBIFC.IfcLineObject | number;

const gi = (v: string) => v;
const lb = (v: string) => v;

const IFC_CLASS_MAP: Record<string, number> = {
    'IfcWall':                 WEBIFC.IFCWALL,
    'IfcWallStandardCase':     WEBIFC.IFCWALLSTANDARDCASE,
    'IfcSlab':                 WEBIFC.IFCSLAB,
    'IfcColumn':               WEBIFC.IFCCOLUMN,
    'IfcBeam':                 WEBIFC.IFCBEAM,
    'IfcWindow':               WEBIFC.IFCWINDOW,
    'IfcDoor':                 WEBIFC.IFCDOOR,
    'IfcCurtainWall':          WEBIFC.IFCCURTAINWALL,
    'IfcPlate':                WEBIFC.IFCPLATE,
    'IfcMember':               WEBIFC.IFCMEMBER,
    'IfcRoof':                 WEBIFC.IFCROOF,
    'IfcStair':                WEBIFC.IFCSTAIR,
    'IfcStairFlight':          WEBIFC.IFCSTAIRFLIGHT,
    'IfcRailing':              WEBIFC.IFCRAILING,
    'IfcCovering':             WEBIFC.IFCCOVERING,
    'IfcFurnishingElement':    WEBIFC.IFCFURNISHINGELEMENT,
    'IfcFlowTerminal':         WEBIFC.IFCFLOWTERMINAL,
    'IfcOpeningElement':       WEBIFC.IFCOPENINGELEMENT,
    'IfcSpace':                WEBIFC.IFCSPACE,
    'IfcBuildingElementProxy': WEBIFC.IFCBUILDINGELEMENTPROXY,
};

const WALL_IFC_CLASSES = new Set(['IfcWall', 'IfcWallStandardCase']);

export class IfcModelBuilder {
    private api: WEBIFC.IfcAPI;
    private modelID: number;
    private geometryWriter: IfcGeometryWriter;
    private propertyWriter: IfcPropertyWriter;
    private spatialRefs: SpatialRefs;

    private w(entity: WEBIFC.IfcLineObject): WEBIFC.IfcLineObject {
        this.api.WriteLine(this.modelID, entity);
        return entity;
    }

    constructor(
        api: WEBIFC.IfcAPI,
        modelID: number,
        geometryWriter: IfcGeometryWriter,
        propertyWriter: IfcPropertyWriter,
        spatialRefs: SpatialRefs
    ) {
        this.api             = api;
        this.modelID         = modelID;
        this.geometryWriter  = geometryWriter;
        this.propertyWriter  = propertyWriter;
        this.spatialRefs     = spatialRefs;
    }

    createElements(elements: ExportElement[]): Map<string, EntityRef> {
        const elementsByStorey = this.groupByStorey(elements);
        debug(`Groups found for ${elementsByStorey.size} storeys`);

        const wallRefs   = new Map<string, EntityRef>();
        const hostedRefs = new Map<string, { ref: EntityRef; hostWallId: string; element: ExportElement; storeyElevation: number; storeyPlacementRef?: EntityRef }>();
        const allRefs    = new Map<string, EntityRef>();

        for (const [storeyId, storeyElements] of elementsByStorey) {
            const storeyRef = this.spatialRefs.storeyRefs.get(storeyId);
            if (!storeyRef) {
                debug(`Warning: No storey found for ID ${storeyId}. Skipping ${storeyElements.length} elements.`);
                continue;
            }

            const storeyElevation    = this.spatialRefs.storeyElevations.get(storeyId) ?? 0;
            const storeyPlacementRef = this.spatialRefs.storeyPlacementRefs?.get(storeyId);
            const containedRefs: EntityRef[] = [];

            for (const element of storeyElements) {
                const elementRef = this.createElement(element, storeyRef, storeyElevation, storeyPlacementRef);
                if (!elementRef) continue;

                allRefs.set(element.id, elementRef);

                if (WALL_IFC_CLASSES.has(element.ifcClass)) {
                    wallRefs.set(element.id, elementRef);
                }

                if (element.hostWallId) {
                    hostedRefs.set(element.id, { ref: elementRef, hostWallId: element.hostWallId, element, storeyElevation, storeyPlacementRef });
                } else {
                    containedRefs.push(elementRef);
                }
            }

            if (containedRefs.length > 0) {
                debug(`Linking ${containedRefs.length} elements to storey ${storeyId}`);
                this.createContainment(storeyRef, containedRefs);
            }
        }

        this.createHostRelationships(wallRefs, hostedRefs);
        return allRefs;
    }

    private createHostRelationships(
        wallRefs:   Map<string, EntityRef>,
        hostedRefs: Map<string, { ref: EntityRef; hostWallId: string; element: ExportElement; storeyElevation: number; storeyPlacementRef?: EntityRef }>
    ): void {
        if (hostedRefs.size === 0) return;
        debug(`IfcModelBuilder: wiring void/fill for ${hostedRefs.size} hosted element(s)`);

        for (const [hostedId, { ref: hostedRef, hostWallId, element, storeyElevation, storeyPlacementRef }] of hostedRefs) {
            const wallRef = wallRefs.get(hostWallId);
            if (!wallRef) {
                debug(`IfcModelBuilder: wall ref not found for host ${hostWallId} (hosted: ${hostedId}) — skipping`);
                continue;
            }

            const openingPlacement = this.geometryWriter.createLocalPlacement(
                { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, storeyPlacementRef);
            const openingShape = element.openingGeometry
                ? this.geometryWriter.createShape(element.openingGeometry, storeyElevation)
                : null;

            const openingRef = this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCOPENINGELEMENT,
                gi(crypto.randomUUID()), null, lb(`Opening-${hostedId}`),
                null, null, openingPlacement, openingShape, null));

            this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCRELVOIDSELEMENT,
                gi(crypto.randomUUID()), null, null, null, wallRef, openingRef));

            this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCRELFILLSELEMENT,
                gi(crypto.randomUUID()), null, null, null, openingRef, hostedRef));

            debug(`IfcModelBuilder: void/fill wired — wall:${hostWallId} → opening → hosted:${hostedId}`);
        }
    }

    private createElement(element: ExportElement, _storeyRef: EntityRef, storeyElevation: number = 0, storeyPlacementRef?: EntityRef): EntityRef {
        const ifcType = IFC_CLASS_MAP[element.ifcClass] || WEBIFC.IFCBUILDINGELEMENTPROXY;

        // Use the storey's IfcLocalPlacement (not the IfcBuildingStorey entity) as the parent
        // placement reference.  IFC spec §IfcLocalPlacement: PlacementRelTo must be an
        // IfcObjectPlacement — which IfcLocalPlacement is, but IfcBuildingStorey is not.
        // Passing the storey entity caused IFC viewers to ignore the hierarchy, displacing geometry.
        const placementRef = this.geometryWriter.createLocalPlacement(
            { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, storeyPlacementRef);

        const shapeRef = this.geometryWriter.createShape(element.geometry, storeyElevation, element.color);

        // IFC entity attributes are SPREAD individually — never wrapped in a single array.
        let elementRef: EntityRef;
        switch (ifcType) {
            case WEBIFC.IFCWALL:
            case WEBIFC.IFCWALLSTANDARDCASE:
                elementRef = this.w(this.api.CreateIfcEntity(this.modelID, ifcType,
                    gi(element.guid), null, lb(element.name), null, null, placementRef, shapeRef, null));
                break;

            case WEBIFC.IFCWINDOW:
                elementRef = this.w(this.api.CreateIfcEntity(this.modelID, ifcType,
                    gi(element.guid), null, lb(element.name), null, null, placementRef, shapeRef, null, null, null));
                break;

            case WEBIFC.IFCDOOR:
                elementRef = this.w(this.api.CreateIfcEntity(this.modelID, ifcType,
                    gi(element.guid), null, lb(element.name), null, null, placementRef, shapeRef, null, null, null));
                break;

            case WEBIFC.IFCSLAB:
            case WEBIFC.IFCROOF:
            case WEBIFC.IFCSTAIR:
            case WEBIFC.IFCSTAIRFLIGHT:
            case WEBIFC.IFCRAILING:
            case WEBIFC.IFCCOVERING:
                elementRef = this.w(this.api.CreateIfcEntity(this.modelID, ifcType,
                    gi(element.guid), null, lb(element.name), null, null, placementRef, shapeRef, null,
                    element.predefinedType ? { type: 3, value: element.predefinedType } : null));
                break;

            case WEBIFC.IFCCOLUMN:
                elementRef = this.w(this.api.CreateIfcEntity(this.modelID, ifcType,
                    gi(element.guid), null, lb(element.name), null, null, placementRef, shapeRef, null));
                break;

            case WEBIFC.IFCSPACE:
                elementRef = this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCSPACE,
                    gi(element.guid), null, lb(element.name), null, null, placementRef, shapeRef, null, null,
                    element.predefinedType ? { type: 3, value: element.predefinedType } : { type: 3, value: 'INTERNAL' }));
                break;

            default:
                elementRef = this.w(this.api.CreateIfcEntity(this.modelID, ifcType,
                    gi(element.guid), null, lb(element.name), null, null, placementRef, shapeRef, null));
                break;
        }

        if (element.propertySets.length > 0) {
            this.propertyWriter.createPropertySets(element.propertySets, elementRef);
        }

        return elementRef;
    }

    private createContainment(storeyRef: EntityRef, elementRefs: EntityRef[]): EntityRef {
        return this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE,
            gi(crypto.randomUUID()), null, null, null, elementRefs, storeyRef));
    }

    private groupByStorey(elements: ExportElement[]): Map<string, ExportElement[]> {
        const grouped = new Map<string, ExportElement[]>();
        for (const element of elements) {
            let storeyId = element.levelId || 'L0';
            if (!this.spatialRefs.storeyRefs.has(storeyId)) {
                const first = Array.from(this.spatialRefs.storeyRefs.keys())[0];
                if (first) storeyId = first;
            }
            if (!grouped.has(storeyId)) grouped.set(storeyId, []);
            grouped.get(storeyId)!.push(element);
        }
        return grouped;
    }
}
