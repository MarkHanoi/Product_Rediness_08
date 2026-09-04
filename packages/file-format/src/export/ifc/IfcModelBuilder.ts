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
import {
    ifcGlobalId,
    elementKey,
    openingKey,
    relVoidsKey,
    relFillsKey,
    relContainedKey,
    relAggregatesKey,
    UNASSIGNED_LEVEL_ID,
    ExportDiagnostics,
} from './ifcIdentity';
import { debug } from '@pryzm/core-app-model';

type EntityRef = WEBIFC.IfcLineObject | number;

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
    // L-8520 — `packages/core-app-model/src/CoreElement.ts:77` maps two element
    // kinds to IFC classes that were absent from this table, so `grid` and
    // `level` fell through to IfcBuildingElementProxy without a word. IfcGrid is
    // a real product and belongs here. IfcBuildingStorey is deliberately NOT
    // added: a storey is spatial structure, written by IfcSpatialStructure, and
    // must never arrive as an element — it is diagnosed instead.
    'IfcGrid':                 WEBIFC.IFCGRID,
    // L-8550 — C25 §2/§2.1 (lane IFCTREE47) rules that PRYZM `furniture` is
    // `IfcFurniture` and `plumbing` is `IfcSanitaryTerminal`, and that the code
    // saying otherwise is wrong. Per CLAUDE.md's conflict-resolution order the
    // contract wins, so the readers now emit these. The two supertypes above
    // stay mapped so an IMPORTED element that genuinely carries one still
    // round-trips as itself rather than being rewritten.
    'IfcFurniture':            WEBIFC.IFCFURNITURE,
    'IfcSanitaryTerminal':     WEBIFC.IFCSANITARYTERMINAL,
    // §W4B-LIFT-EXPORTS — `LiftStore.add` has stamped
    // `ifcData.ifcClass = 'IfcTransportElement'` since the store was written
    // (LiftStore.ts:52-56), but the class was absent from this map, so any lift
    // reaching the writer would have been degraded to IfcBuildingElementProxy
    // with an UNKNOWN_IFC_CLASS diagnostic — the exact L-8520 shape.
    'IfcTransportElement':     WEBIFC.IFCTRANSPORTELEMENT,
};

const WALL_IFC_CLASSES = new Set(['IfcWall', 'IfcWallStandardCase']);

/**
 * `IfcSpace` is a *spatial structure element*, not a building element.
 *
 * L-8504: Pipeline A related spaces to their storey with
 * `IfcRelContainedInSpatialStructure`, which IFC4 reserves for products
 * contained *in* a spatial element. Spatial elements nest via
 * `IfcRelAggregates` — which is what Pipeline B does, and documents at
 * `plugins/ifc-export/src/exporters/space.ts:325-327`. The two pipelines
 * disagreed with each other and Pipeline A was the one that was wrong.
 */
const SPATIAL_IFC_CLASSES = new Set(['IfcSpace']);

export class IfcModelBuilder {
    private api: WEBIFC.IfcAPI;
    private modelID: number;
    private geometryWriter: IfcGeometryWriter;
    private propertyWriter: IfcPropertyWriter;
    private spatialRefs: SpatialRefs;
    private diagnostics: ExportDiagnostics;

    private w(entity: WEBIFC.IfcLineObject): WEBIFC.IfcLineObject {
        this.api.WriteLine(this.modelID, entity);
        return entity;
    }

    constructor(
        api: WEBIFC.IfcAPI,
        modelID: number,
        geometryWriter: IfcGeometryWriter,
        propertyWriter: IfcPropertyWriter,
        spatialRefs: SpatialRefs,
        diagnostics: ExportDiagnostics,
    ) {
        this.api             = api;
        this.modelID         = modelID;
        this.geometryWriter  = geometryWriter;
        this.propertyWriter  = propertyWriter;
        this.spatialRefs     = spatialRefs;
        this.diagnostics     = diagnostics;
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
                // Unreachable: groupByStorey() guarantees every key resolves,
                // creating the UNASSIGNED storey if needed. Kept as a loud guard
                // rather than a silent `continue` — dropping N elements without
                // a diagnostic is exactly the class of defect L-8510 fixed.
                this.diagnostics.add({
                    severity: 'error',
                    code: 'UNRESOLVED_LEVEL',
                    message: `No storey entity for id "${storeyId}" — ${storeyElements.length} element(s) NOT exported.`,
                });
                continue;
            }

            const storeyElevation    = this.spatialRefs.storeyElevations.get(storeyId) ?? 0;
            const storeyPlacementRef = this.spatialRefs.storeyPlacementRefs?.get(storeyId);
            /** Products: related to the storey with IfcRelContainedInSpatialStructure. */
            const containedRefs: EntityRef[] = [];
            /** Spatial elements (IfcSpace): nested with IfcRelAggregates (L-8504). */
            const aggregatedRefs: EntityRef[] = [];

            for (const element of storeyElements) {
                const elementRef = this.createElement(element, storeyRef, storeyElevation, storeyPlacementRef);
                if (!elementRef) continue;

                allRefs.set(element.id, elementRef);

                if (WALL_IFC_CLASSES.has(element.ifcClass)) {
                    wallRefs.set(element.id, elementRef);
                }

                if (element.hostWallId) {
                    hostedRefs.set(element.id, { ref: elementRef, hostWallId: element.hostWallId, element, storeyElevation, storeyPlacementRef });
                } else if (SPATIAL_IFC_CLASSES.has(element.ifcClass)) {
                    aggregatedRefs.push(elementRef);
                } else {
                    containedRefs.push(elementRef);
                }
            }

            if (containedRefs.length > 0) {
                debug(`Linking ${containedRefs.length} elements to storey ${storeyId}`);
                this.createContainment(storeyId, storeyRef, containedRefs);
            }
            if (aggregatedRefs.length > 0) {
                debug(`Aggregating ${aggregatedRefs.length} spatial element(s) under storey ${storeyId}`);
                this.createSpatialAggregation(storeyId, storeyRef, aggregatedRefs);
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
                // L-8511: this used to be a bare `debug()` + `continue`. The door
                // was still written, still visible, and simply did not cut its
                // wall — a file that looks correct and is not.
                this.diagnostics.add({
                    severity: 'error',
                    code: 'MISSING_HOST_WALL',
                    message:
                        `Host wall "${hostWallId}" was not exported, so no IfcOpeningElement / ` +
                        `IfcRelVoidsElement / IfcRelFillsElement was written. The hosted element is ` +
                        `present in the file but does NOT cut its host.`,
                    elementId: hostedId,
                });
                continue;
            }

            const openingPlacement = this.geometryWriter.createLocalPlacement(
                { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, storeyPlacementRef);

            if (!element.openingGeometry) {
                // L-8512: an IfcOpeningElement with a null Representation cuts
                // nothing. Writing one produced a void that every viewer ignores
                // while the relationship graph claimed the wall was voided.
                this.diagnostics.add({
                    severity: 'error',
                    code: 'OPENING_WITHOUT_GEOMETRY',
                    message:
                        `No opening geometry could be derived, so the IfcOpeningElement would have had ` +
                        `a null Representation and cut nothing. The void/fill relationships were NOT ` +
                        `written rather than written as a lie.`,
                    elementId: hostedId,
                });
                continue;
            }

            const openingShape = this.geometryWriter.createShape(element.openingGeometry, storeyElevation);

            const openingRef = this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCOPENINGELEMENT,
                ifcGlobalId(null, openingKey(hostWallId, hostedId)),
                this.spatialRefs.ownerHistoryRef, lb(`Opening-${hostedId}`),
                null, null, openingPlacement, openingShape, null));

            this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCRELVOIDSELEMENT,
                ifcGlobalId(null, relVoidsKey(hostWallId, hostedId)),
                this.spatialRefs.ownerHistoryRef, null, null, wallRef, openingRef));

            this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCRELFILLSELEMENT,
                ifcGlobalId(null, relFillsKey(hostWallId, hostedId)),
                this.spatialRefs.ownerHistoryRef, null, null, openingRef, hostedRef));

            debug(`IfcModelBuilder: void/fill wired — wall:${hostWallId} → opening → hosted:${hostedId}`);
        }
    }

    private createElement(element: ExportElement, _storeyRef: EntityRef, storeyElevation: number = 0, storeyPlacementRef?: EntityRef): EntityRef {
        const mapped = IFC_CLASS_MAP[element.ifcClass];
        if (mapped === undefined) {
            // L-8520: silently degrading an unmapped class to a proxy loses the
            // semantics the whole file exists to carry.
            this.diagnostics.add({
                severity: 'warning',
                code: 'UNKNOWN_IFC_CLASS',
                message:
                    `ifcClass "${element.ifcClass}" is not in IFC_CLASS_MAP — exported as ` +
                    `IfcBuildingElementProxy, losing its semantic type.`,
                elementId: element.id,
            });
        }
        const ifcType = mapped ?? WEBIFC.IFCBUILDINGELEMENTPROXY;

        // L-8501: the ONE place an element GlobalId is produced. A persisted
        // ifcData.guid (imported IFC) is preserved; otherwise it is DERIVED from
        // the PRYZM element id, so it is identical on every export of an
        // unchanged model. It was previously `crypto.randomUUID()` written raw.
        const guid = ifcGlobalId(element.guid, elementKey(element.id));
        const owner = this.spatialRefs.ownerHistoryRef;

        // Use the storey's IfcLocalPlacement (not the IfcBuildingStorey entity) as the parent
        // placement reference.  IFC spec §IfcLocalPlacement: PlacementRelTo must be an
        // IfcObjectPlacement — which IfcLocalPlacement is, but IfcBuildingStorey is not.
        // Passing the storey entity caused IFC viewers to ignore the hierarchy, displacing geometry.
        const placementRef = this.geometryWriter.createLocalPlacement(
            { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, storeyPlacementRef);

        if (!element.geometry?.vertices?.length) {
            this.diagnostics.add({
                severity: 'warning',
                code: 'EMPTY_GEOMETRY',
                message: `Element has no vertices — it will appear in the spatial tree but render as nothing.`,
                elementId: element.id,
            });
        }

        const shapeRef = this.geometryWriter.createShape(element.geometry, storeyElevation, element.color);

        // L-8505: predefinedType was carried on ExportElement and then dropped
        // for Wall, Window, Door and Column, because those switch arms simply
        // did not pass the attribute. `enumOrNull` restores it for all of them.
        const pdt = this.enumOrNull(element.predefinedType);

        // IFC entity attributes are SPREAD individually — never wrapped in a single array.
        let elementRef: EntityRef;
        switch (ifcType) {
            case WEBIFC.IFCWALL:
            case WEBIFC.IFCWALLSTANDARDCASE:
                // IFCWALL(GlobalId, OwnerHistory, Name, Description, ObjectType,
                //         ObjectPlacement, Representation, Tag, PredefinedType)
                elementRef = this.w(this.api.CreateIfcEntity(this.modelID, ifcType,
                    guid, owner, lb(element.name), null, null, placementRef, shapeRef, null, pdt));
                break;

            case WEBIFC.IFCWINDOW:
                // IFCWINDOW(GlobalId, OwnerHistory, Name, Description, ObjectType,
                //           ObjectPlacement, Representation, Tag, OverallHeight,
                //           OverallWidth, PredefinedType, PartitioningType,
                //           UserDefinedPartitioningType)
                elementRef = this.w(this.api.CreateIfcEntity(this.modelID, ifcType,
                    guid, owner, lb(element.name), null, null, placementRef, shapeRef, null,
                    null, null, pdt, null, null));
                break;

            case WEBIFC.IFCDOOR:
                // IFCDOOR(GlobalId, OwnerHistory, Name, Description, ObjectType,
                //         ObjectPlacement, Representation, Tag, OverallHeight,
                //         OverallWidth, PredefinedType, OperationType,
                //         UserDefinedOperationType)
                elementRef = this.w(this.api.CreateIfcEntity(this.modelID, ifcType,
                    guid, owner, lb(element.name), null, null, placementRef, shapeRef, null,
                    null, null, pdt, null, null));
                break;

            case WEBIFC.IFCSLAB:
            case WEBIFC.IFCROOF:
            case WEBIFC.IFCSTAIR:
            case WEBIFC.IFCSTAIRFLIGHT:
            case WEBIFC.IFCRAILING:
            case WEBIFC.IFCCOVERING:
            case WEBIFC.IFCTRANSPORTELEMENT:
                // IFCTRANSPORTELEMENT(GlobalId, OwnerHistory, Name, Description, ObjectType,
                //   ObjectPlacement, Representation, Tag, PredefinedType) — the same
                //   9-attribute shape as the entities above it.
                elementRef = this.w(this.api.CreateIfcEntity(this.modelID, ifcType,
                    guid, owner, lb(element.name), null, null, placementRef, shapeRef, null, pdt));
                break;

            case WEBIFC.IFCCOLUMN:
                // IFCCOLUMN(GlobalId, OwnerHistory, Name, Description, ObjectType,
                //           ObjectPlacement, Representation, Tag, PredefinedType)
                elementRef = this.w(this.api.CreateIfcEntity(this.modelID, ifcType,
                    guid, owner, lb(element.name), null, null, placementRef, shapeRef, null, pdt));
                break;

            case WEBIFC.IFCSPACE:
                elementRef = this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCSPACE,
                    guid, owner, lb(element.name), null, null, placementRef, shapeRef, null, null,
                    pdt ?? { type: 3, value: 'INTERNAL' }));
                break;

            default:
                elementRef = this.w(this.api.CreateIfcEntity(this.modelID, ifcType,
                    guid, owner, lb(element.name), null, null, placementRef, shapeRef, null));
                break;
        }

        if (element.propertySets.length > 0) {
            this.propertyWriter.createPropertySets(element.propertySets, elementRef, elementKey(element.id));
        }

        return elementRef;
    }

    /** web-ifc enum wrapper, or null when the model carries no predefined type. */
    private enumOrNull(value: string | undefined): { type: number; value: string } | null {
        return value ? { type: 3, value } : null;
    }

    private createContainment(storeyId: string, storeyRef: EntityRef, elementRefs: EntityRef[]): EntityRef {
        return this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE,
            ifcGlobalId(null, relContainedKey(storeyId)),
            this.spatialRefs.ownerHistoryRef, null, null, elementRefs, storeyRef));
    }

    /** L-8504 — spatial elements (IfcSpace) nest under their storey via IfcRelAggregates. */
    private createSpatialAggregation(storeyId: string, storeyRef: EntityRef, elementRefs: EntityRef[]): EntityRef {
        return this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCRELAGGREGATES,
            ifcGlobalId(null, relAggregatesKey(`storey-spaces:${storeyId}`)),
            this.spatialRefs.ownerHistoryRef, null, null, storeyRef, elementRefs));
    }

    private groupByStorey(elements: ExportElement[]): Map<string, ExportElement[]> {
        const grouped = new Map<string, ExportElement[]>();
        for (const element of elements) {
            let storeyId = element.levelId || 'L0';
            if (!this.spatialRefs.storeyRefs.has(storeyId)) {
                // ⛔ L-8510 — THE WORST DEFECT IN THE AUDIT.
                //
                // This used to read:
                //     const first = Array.from(this.spatialRefs.storeyRefs.keys())[0];
                //     if (first) storeyId = first;
                //
                // i.e. any element whose levelId did not resolve was silently
                // reassigned to whichever storey happened to be first in the map.
                // The exported file opened cleanly, every element was present,
                // and a third-floor wall sat on the ground floor. Nothing warned.
                //
                // Now: an explicitly-named UNASSIGNED storey, plus a loud
                // diagnostic. The element is still exported — no data is lost —
                // but it is unmistakably not placed.
                this.diagnostics.add({
                    severity: 'error',
                    code: 'UNRESOLVED_LEVEL',
                    message:
                        `levelId "${element.levelId ?? '(none)'}" does not match any exported storey. ` +
                        `Placed in the explicit "${UNASSIGNED_LEVEL_ID}" storey instead of being silently ` +
                        `moved to the first storey in the model.`,
                    elementId: element.id,
                });
                this.spatialRefs.ensureUnassignedStorey();
                storeyId = UNASSIGNED_LEVEL_ID;
            }
            if (!grouped.has(storeyId)) grouped.set(storeyId, []);
            grouped.get(storeyId)!.push(element);
        }
        return grouped;
    }
}
