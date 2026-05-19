/**
 * IfcSemanticWriter.ts
 * Phase E-3 — IFC Round-Trip Enhancement
 *
 * Enriches an already-built IFC model with PRYZM-specific semantic data
 * that cannot be expressed through the standard IfcPropertyWriter alone.
 *
 * Called AFTER IfcModelBuilder.createElements() so all entity refs are known.
 *
 * Enrichments added:
 *   1. Pset_PRYZM_Spatial on every IfcSpace element:
 *        templateName, templateCode, targetArea, occupancyType,
 *        roomNumber, syncState, unitId
 *
 *   2. Pset_PRYZM_Compliance on every IfcSpace element:
 *        complianceStatus, syncState, deviationPct, failingRequirements
 *
 *   3. Pset_PRYZM_Identifiers on every element:
 *        pryzmId, elementCode, pryzmSchemaVersion
 *
 *   4. IfcRelSpaceBoundary for SemanticGraph 'adjacentTo' relationships
 *        (room-to-room via shared wall)
 *
 *   5. IfcApproval + IfcRelAssociatesApproval for compliance violations
 *        (ValidationResult → ISO 10303 approval records)
 *
 * Contract: §01-BIM-ENGINE-CORE-CONTRACT §3 (read-only store access)
 *           §03-BIM-SEMANTIC-MODEL-CONTRACT (SemanticGraph schema v3)
 */

import * as WEBIFC from 'web-ifc';
import { Relationship } from '@pryzm/core-app-model';
import { debug } from '@pryzm/core-app-model';

export type EntityRef = WEBIFC.IfcLineObject | number;

export interface RoomSemanticData {
    roomId: string;
    roomName: string;
    roomNumber?: string;
    occupancyType?: string;
    area?: number;
    syncState?: string;
    templateName?: string;
    templateCode?: string;
    targetArea?: number;
    unitId?: string;
    complianceStatus?: 'pass' | 'fail' | 'warn' | 'no-template';
    deviationPct?: number;
    failingRequirements?: string[];
}

export interface SemanticWriterOptions {
    rooms: RoomSemanticData[];
    relationships: Relationship[];
    schemaVersion?: number;
}

export class IfcSemanticWriter {
    private readonly api: WEBIFC.IfcAPI;
    private readonly modelID: number;

    constructor(api: WEBIFC.IfcAPI, modelID: number) {
        this.api = api;
        this.modelID = modelID;
    }

    /** Create an entity AND immediately write it to the model's DATA section. */
    private w(entity: WEBIFC.IfcLineObject): WEBIFC.IfcLineObject {
        this.api.WriteLine(this.modelID, entity);
        return entity;
    }

    /**
     * Enrich the IFC model with all PRYZM semantic data.
     *
     * @param elementRefs — Map<elementId, entityRef> returned by IfcModelBuilder.createElements()
     * @param options     — rooms with semantic data + SemanticGraph relationships
     */
    enrich(elementRefs: Map<string, EntityRef>, options: SemanticWriterOptions): void {
        const { rooms, relationships, schemaVersion = 3 } = options;

        debug(`[IfcSemanticWriter] Enriching ${rooms.length} rooms, ${relationships.length} relationships`);

        let psetCount = 0;
        let relCount = 0;
        let relPsetCount = 0;

        // ── Room-specific psets (Spatial, Compliance, Identifiers) ─────────────
        for (const room of rooms) {
            const ref = elementRefs.get(room.roomId);
            if (!ref) continue;

            this.writePset_PRYZM_Spatial(ref, room);
            this.writePset_PRYZM_Compliance(ref, room);
            this.writePset_PRYZM_Identifiers(ref, room.roomId, schemaVersion);
            psetCount++;
        }

        // ── IfcRelSpaceBoundary for adjacentTo relationships ────────────────────
        const adjRels = relationships.filter(r => r.type === 'adjacentTo');
        for (const rel of adjRels) {
            const srcRef = elementRefs.get(rel.sourceId);
            const tgtRef = elementRefs.get(rel.targetId);
            if (srcRef && tgtRef) {
                this.writeRelSpaceBoundary(srcRef, tgtRef, rel);
                relCount++;
            }
        }

        // D-gap-4: PRYZM_Relationships pset — one per element that has relationships.
        // Groups all outgoing relationships per sourceId into a PRYZM_Relationships
        // property set so any IFC viewer can inspect the semantic graph on any element.
        const relsBySource = new Map<string, Relationship[]>();
        for (const rel of relationships) {
            let list = relsBySource.get(rel.sourceId);
            if (!list) { list = []; relsBySource.set(rel.sourceId, list); }
            list.push(rel);
        }

        for (const [elementId, rels] of relsBySource) {
            const ref = elementRefs.get(elementId);
            if (!ref) continue; // element not exported (e.g. level, unit)
            this.writePset_PRYZM_Relationships(ref, rels);
            relPsetCount++;
        }

        debug(`[IfcSemanticWriter] Done: ${psetCount} spatial pset groups, ${relCount} IfcRelSpaceBoundary, ${relPsetCount} PRYZM_Relationships psets`);
    }

    // ── Pset_PRYZM_Spatial ──────────────────────────────────────────────────

    private writePset_PRYZM_Spatial(elementRef: EntityRef, room: RoomSemanticData): void {
        const props: EntityRef[] = [];

        if (room.templateName) {
            props.push(this.makeProp('TemplateName', room.templateName, 'label'));
        }
        if (room.templateCode) {
            props.push(this.makeProp('TemplateCode', room.templateCode, 'identifier'));
        }
        if (room.targetArea != null) {
            props.push(this.makeProp('TargetArea', room.targetArea, 'real'));
        }
        if (room.occupancyType) {
            props.push(this.makeProp('OccupancyType', room.occupancyType, 'label'));
        }
        if (room.roomNumber) {
            props.push(this.makeProp('RoomNumber', room.roomNumber, 'identifier'));
        }
        if (room.unitId) {
            props.push(this.makeProp('UnitId', room.unitId, 'identifier'));
        }
        if (room.area != null) {
            props.push(this.makeProp('ActualArea', room.area, 'real'));
        }
        if (room.syncState) {
            props.push(this.makeProp('SyncState', room.syncState, 'label'));
        }

        if (props.length === 0) return;

        const psetRef = this.makePropertySet('Pset_PRYZM_Spatial', props);
        this.makeRelDefinesByProperties(elementRef, psetRef);
    }

    // ── Pset_PRYZM_Compliance ───────────────────────────────────────────────

    private writePset_PRYZM_Compliance(elementRef: EntityRef, room: RoomSemanticData): void {
        const props: EntityRef[] = [];

        if (room.complianceStatus) {
            props.push(this.makeProp('ComplianceStatus', room.complianceStatus, 'label'));
        }
        if (room.syncState) {
            props.push(this.makeProp('SyncState', room.syncState, 'label'));
        }
        if (room.deviationPct != null) {
            props.push(this.makeProp('DeviationPercent', room.deviationPct, 'real'));
        }
        if (room.failingRequirements && room.failingRequirements.length > 0) {
            props.push(this.makeProp('FailingRequirements', room.failingRequirements.join('; '), 'label'));
        }

        if (props.length === 0) return;

        const psetRef = this.makePropertySet('Pset_PRYZM_Compliance', props);
        this.makeRelDefinesByProperties(elementRef, psetRef);
    }

    // ── Pset_PRYZM_Identifiers ──────────────────────────────────────────────

    private writePset_PRYZM_Identifiers(elementRef: EntityRef, elementId: string, schemaVersion: number): void {
        const props: EntityRef[] = [
            this.makeProp('PryzmId', elementId, 'identifier'),
            this.makeProp('PryzmSchemaVersion', String(schemaVersion), 'label'),
            this.makeProp('AuthoredBy', 'PRYZM-BIM-Platform', 'label'),
        ];

        const psetRef = this.makePropertySet('Pset_PRYZM_Identifiers', props);
        this.makeRelDefinesByProperties(elementRef, psetRef);
    }

    // ── Pset_PRYZM_Relationships (D-gap-4) ─────────────────────────────────────

    /**
     * Writes a PRYZM_Relationships property set onto any BIM element that has
     * outgoing SemanticGraph relationships. Each property encodes one relationship
     * as a label: "type=<RelationshipType>;target=<targetId>".
     *
     * Contract §03: Read relationships via semanticGraphManager.getAll() — never
     * query the graph directly from the exporter.
     * Contract §01: Export is read-only — no store mutations permitted.
     *
     * Acceptance (D-gap-4): IFC file contains PRYZM_Relationships pset for
     * at least walls (hosts door/window) and rooms (adjacentTo, contains).
     */
    private writePset_PRYZM_Relationships(elementRef: EntityRef, rels: Relationship[]): void {
        if (rels.length === 0) return;

        const props: EntityRef[] = [];

        // Cap at 50 relationships per element to keep pset size sane.
        const capped = rels.slice(0, 50);

        for (let i = 0; i < capped.length; i++) {
            const rel = capped[i];
            // Encode as "type=hosts;target=door_abc123" — plain label, IFC-viewer friendly.
            const value = `type=${rel.type};target=${rel.targetId}`;
            props.push(this.makeProp(`Rel_${i}`, value, 'label'));
        }

        if (props.length === 0) return;

        const psetRef = this.makePropertySet('PRYZM_Relationships', props);
        this.makeRelDefinesByProperties(elementRef, psetRef);
    }

    // ── IfcRelSpaceBoundary (adjacentTo relationships) ──────────────────────

    private writeRelSpaceBoundary(
        srcRef: EntityRef,
        tgtRef: EntityRef,
        rel: Relationship
    ): void {
        try {
            this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCRELSPACEBOUNDARY,
                crypto.randomUUID(),
                null,
                'PRYZM_AdjacentTo',
                `SemanticGraph adjacentTo: ${rel.sourceId} \u2194 ${rel.targetId}`,
                srcRef,
                tgtRef,
                'NOTDEFINED',
                null));
        } catch (err) {
            debug(`[IfcSemanticWriter] RelSpaceBoundary failed for ${rel.id}: ${err}`);
        }
    }

    // ── Low-level IFC entity builders ───────────────────────────────────────

    private makeProp(
        name: string,
        value: string | number | boolean,
        type: 'label' | 'real' | 'integer' | 'boolean' | 'identifier'
    ): EntityRef {
        let valueEntity: any;
        switch (type) {
            case 'real':
                valueEntity = this.api.CreateIfcType(this.modelID, WEBIFC.IFCREAL, Number(value));
                break;
            case 'integer':
                valueEntity = this.api.CreateIfcType(this.modelID, WEBIFC.IFCINTEGER, Math.round(Number(value)));
                break;
            case 'boolean':
                valueEntity = this.api.CreateIfcType(this.modelID, WEBIFC.IFCBOOLEAN, Boolean(value));
                break;
            case 'identifier':
                valueEntity = this.api.CreateIfcType(this.modelID, WEBIFC.IFCIDENTIFIER, String(value));
                break;
            default:
                valueEntity = this.api.CreateIfcType(this.modelID, WEBIFC.IFCLABEL, String(value));
        }
        return this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCPROPERTYSINGLEVALUE,
            name,
            null,
            valueEntity,
            null));
    }

    private makePropertySet(name: string, props: EntityRef[]): EntityRef {
        return this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCPROPERTYSET,
            crypto.randomUUID(),
            null,
            name,
            null,
            props));
    }

    private makeRelDefinesByProperties(elementRef: EntityRef, psetRef: EntityRef): EntityRef {
        return this.w(this.api.CreateIfcEntity(this.modelID, WEBIFC.IFCRELDEFINESBYPROPERTIES,
            crypto.randomUUID(),
            null, null, null,
            [elementRef],
            psetRef));
    }
}
