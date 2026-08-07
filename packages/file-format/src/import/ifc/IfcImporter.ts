/**
 * IfcImporter.ts
 * Phase E-3 — IFC Round-Trip: Import
 *
 * Parses an IFC4 file (Uint8Array) and reconstructs PRYZM-native data:
 *   - Rooms from IfcSpace elements
 *   - RoomData from Pset_PRYZM_Spatial / Pset_PRYZM_Compliance
 *   - Hierarchy from IfcBuildingStorey / IfcBuilding / IfcSite
 *   - Template assignments from Pset_PRYZM_Spatial.TemplateCode
 *   - Spatial relationships from IfcRelSpaceBoundary
 *   - Physical elements (walls, doors, slabs, ...) with full psets (§28)
 *
 * Usage:
 *   const importer = new IfcImporter();
 *   await importer.init();
 *   const result = await importer.importFromBytes(bytes);
 *   importer.dispose();
 *
 * Contract:
 *   §01-BIM-ENGINE-CORE-CONTRACT §3 — no store mutations from this file
 *   §03-BIM-SEMANTIC-MODEL-CONTRACT — SemanticGraph schema v3
 *   §09-DATABASE-PERSISTENCE-ARCHITECTURE — caller persists to stores
 *   §28-IFC-IMPORT-NATIVE-PARITY-CONTRACT — physical element extraction
 */

import * as WEBIFC from 'web-ifc';
import { debug } from '@pryzm/core-app-model';
import type { IfcElementRecord } from './IfcModelStore';
import { resolveLengthUnitScale, type IfcLengthUnitRecord } from './IfcUnitScale';

// ── Result Types ─────────────────────────────────────────────────────────────

export interface ImportedRoom {
    id: string;
    name: string;
    roomNumber?: string;
    occupancyType?: string;
    area?: number;
    levelId?: string;
    unitId?: string;
    syncState?: string;
    customData: Record<string, string | number | boolean>;
    pryzmTemplateCode?: string;
    pryzmTemplateName?: string;
    pryzmTargetArea?: number;
    complianceStatus?: string;
    deviationPct?: number;
}

export interface ImportedHierarchyNode {
    id: string;
    name: string;
    type: 'site' | 'building' | 'level' | 'unit';
    parentId?: string;
    elevation?: number;
}

export interface ImportedRelationship {
    type: 'adjacentTo' | 'boundedBy' | 'contains';
    sourceId: string;
    targetId: string;
    metadata?: Record<string, string>;
}

export interface IfcStoreyRecord {
    /** Stable PRYZM-side ID (`level-ifc-<expressID>`). */
    id: string;
    name: string;
    /**
     * Elevation in **METRES**.
     *
     * §FIX-IFC-STOREY-UNIT-SCALE (L-695) — `IFCBUILDINGSTOREY.Elevation` is a
     * raw STEP scalar in the project's declared length unit (millimetres for
     * every Revit export). It is multiplied by the resolved LENGTHUNIT scale
     * here so that every consumer downstream sees metres, matching the
     * geometry that web-ifc already normalises to metres in WASM.
     */
    elevation: number;
}

// ── IFC-P1.7: Projected CRS type codes (IFC4 + IFC4X3) ──────────────────────
const _IFC_PROJECTED_CRS   = 3843373140;
const _IFC_MAP_CONVERSION   = 3654150110;

/** Minimal CRS record — mirrors IfcProjectedCRSRecord from @pryzm/geospatial
 *  without creating a cross-package import. Added by IFC-P1.7. */
interface CrsRecord {
    name: string;
    description?: string;
    geodeticDatum?: string;
    mapProjection?: string;
    mapZone?: string;
    eastings?: number;
    northings?: number;
    orthogonalHeight?: number;
    xAxisAbscissa?: number;
    xAxisOrdinate?: number;
    scale?: number;
}

export interface IfcImportResult {
    modelId?: string;
    modelName?: string;
    fileName?: string;
    rooms: ImportedRoom[];
    hierarchyNodes: ImportedHierarchyNode[];
    relationships: ImportedRelationship[];
    /**
     * Ordered list of storeys extracted from the IFC file.
     * Used by IfcLevelImporter when the user enables "Add IFC levels".
     */
    storeys: IfcStoreyRecord[];
    geometry?: {
        meshCount: number;
        triangleCount: number;
        elementCount: number;
    };
    pryzmExported: boolean;
    schemaVersion: number;
    /**
     * IFC-P1.7: CRS metadata from IfcProjectedCRS + IfcMapConversion.
     * null  → file was parsed but contained no IfcProjectedCRS entity.
     * undefined → CRS extraction was not attempted (pre-P1.7 result objects).
     */
    crsRecord?: CrsRecord | null;
    /**
     * §FIX-IFC-STOREY-UNIT-SCALE (L-695) — metres per file unit as resolved
     * from IfcUnitAssignment. 1 for a metre-based file, 1e-3 for a Revit
     * millimetre export. Surfaced so a regression is visible in the import
     * report rather than only in downstream geometry.
     */
    lengthUnitScale?: number;
    stats: {
        totalSpaces: number;
        totalStoreys: number;
        totalBuildings: number;
        totalSites: number;
        totalRelationships: number;
        recoveredTemplateAssignments: number;
        totalMeshes?: number;
        totalTriangles?: number;
    };
}

// ── IFC physical type mapping (§28 §10) ──────────────────────────────────────

const IFC_PHYSICAL_TYPES: Array<[number | undefined, string, string]> = [
    [(WEBIFC as any).IFCWALL,              'Wall',         'IFCWALL'],
    [(WEBIFC as any).IFCWALLSTANDARDCASE,  'Wall',         'IFCWALLSTANDARDCASE'],
    [(WEBIFC as any).IFCSLAB,              'Slab',         'IFCSLAB'],
    [(WEBIFC as any).IFCDOOR,              'Door',         'IFCDOOR'],
    [(WEBIFC as any).IFCWINDOW,            'Window',       'IFCWINDOW'],
    [(WEBIFC as any).IFCCOLUMN,            'Column',       'IFCCOLUMN'],
    [(WEBIFC as any).IFCBEAM,              'Beam',         'IFCBEAM'],
    [(WEBIFC as any).IFCSTAIR,             'Stair',        'IFCSTAIR'],
    [(WEBIFC as any).IFCSTAIRFLIGHT,       'Stair Flight', 'IFCSTAIRFLIGHT'],
    [(WEBIFC as any).IFCROOF,              'Roof',         'IFCROOF'],
    [(WEBIFC as any).IFCFURNISHINGELEMENT, 'Furniture',    'IFCFURNISHINGELEMENT'],
    [(WEBIFC as any).IFCMEMBER,            'Member',       'IFCMEMBER'],
    [(WEBIFC as any).IFCPLATE,             'Plate',        'IFCPLATE'],
    [(WEBIFC as any).IFCRAILING,           'Railing',      'IFCRAILING'],
    [(WEBIFC as any).IFCCOVERING,          'Covering',     'IFCCOVERING'],
    [(WEBIFC as any).IFCSPACE,             'Space',        'IFCSPACE'],
];

// ── IFC Importer ─────────────────────────────────────────────────────────────

export class IfcImporter {
    private api: WEBIFC.IfcAPI;
    private initialized = false;
    private readonly wasmPath: string | null;

    /**
     * @param options.wasmPath  Directory holding the web-ifc `.wasm` binary.
     *   Defaults to the browser-served `/wasm/` (absolute). Pass `null` to skip
     *   `SetWasmPath` entirely and let web-ifc resolve the binary next to its
     *   own module — the correct behaviour under Node (tests, server-side
     *   parsing), where an absolute `/wasm/` URL does not exist.
     */
    constructor(options?: { wasmPath?: string | null }) {
        this.api = new WEBIFC.IfcAPI();
        this.wasmPath = options?.wasmPath === undefined ? '/wasm/' : options.wasmPath;
    }

    /** Expose the underlying IfcAPI so callers can share it (e.g. with IfcGeometryRenderer). */
    getApi(): WEBIFC.IfcAPI {
        return this.api;
    }

    async init(): Promise<void> {
        if (this.initialized) return;
        if (this.wasmPath !== null) this.api.SetWasmPath(this.wasmPath, true);
        await this.api.Init(undefined, true);
        this.initialized = true;
        debug('[IfcImporter] WebIFC initialized.');
    }

    dispose(): void {
        this.initialized = false;
    }

    async importFromBytes(bytes: Uint8Array): Promise<IfcImportResult> {
        if (!this.initialized) await this.init();

        const modelID = this.api.OpenModel(bytes, {
            COORDINATE_TO_ORIGIN: true,
        });

        try {
            return this.extractModel(modelID);
        } finally {
            this.api.CloseModel(modelID);
        }
    }

    /**
     * Opens the model and extracts semantic data but does NOT close the model.
     * The caller is responsible for calling api.CloseModel(modelID) when done.
     * Use this when the same IfcAPI will be reused for geometry streaming.
     */
    async importAndKeepOpen(bytes: Uint8Array): Promise<{ result: IfcImportResult; modelID: number }> {
        if (!this.initialized) await this.init();
        const modelID = this.api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: true });
        const result = this.extractModel(modelID);
        return { result, modelID };
    }

    async importFromFile(file: File): Promise<IfcImportResult> {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        return this.importFromBytes(bytes);
    }

    // ── Private extraction ────────────────────────────────────────────────────

    private extractModel(modelID: number): IfcImportResult {
        debug('[IfcImporter] Extracting model...');

        const rooms: ImportedRoom[] = [];
        const hierarchyNodes: ImportedHierarchyNode[] = [];
        const relationships: ImportedRelationship[] = [];

        // ── Hierarchy: Sites ─────────────────────────────────────────────────
        const siteLines = this.api.GetLineIDsWithType(modelID, WEBIFC.IFCSITE);
        for (const lineID of siteLines) {
            try {
                const site = this.api.GetLine(modelID, lineID, false);
                hierarchyNodes.push({
                    id: `site-ifc-${lineID}`,
                    name: this.extractLabel(site.Name) ?? `Site ${lineID}`,
                    type: 'site',
                });
            } catch (_) {}
        }

        // ── Hierarchy: Buildings ─────────────────────────────────────────────
        const buildingLines = this.api.GetLineIDsWithType(modelID, WEBIFC.IFCBUILDING);
        const parentSiteId = hierarchyNodes.find(n => n.type === 'site')?.id;
        for (const lineID of buildingLines) {
            try {
                const building = this.api.GetLine(modelID, lineID, false);
                hierarchyNodes.push({
                    id: `building-ifc-${lineID}`,
                    name: this.extractLabel(building.Name) ?? `Building ${lineID}`,
                    type: 'building',
                    parentId: parentSiteId,
                });
            } catch (_) {}
        }

        // ── Hierarchy: Storeys ───────────────────────────────────────────────
        const storeyLines = this.api.GetLineIDsWithType(modelID, WEBIFC.IFCBUILDINGSTOREY);
        const storeyIdMap = new Map<number, string>(); // lineID → PRYZM level id
        const parentBuildingId = hierarchyNodes.find(n => n.type === 'building')?.id;
        const storeyRecords: IfcStoreyRecord[] = [];

        // §FIX-IFC-STOREY-UNIT-SCALE (L-695) — metres per file unit. `GetLine`
        // returns RAW STEP scalars in file units (mm for Revit exports) while
        // `GetGeometry` is already normalised to metres by web-ifc's WASM. This
        // factor therefore applies to GetLine scalars ONLY — never to geometry.
        const lengthUnitScale = this._readLengthUnitScale(modelID);

        for (const lineID of storeyLines) {
            try {
                const storey = this.api.GetLine(modelID, lineID, false);
                const levelId = `level-ifc-${lineID}`;
                storeyIdMap.set(lineID, levelId);
                const name = this.extractLabel(storey.Name) ?? `Level ${lineID}`;
                const rawElevation = typeof storey.Elevation?.value === 'number'
                    ? storey.Elevation.value
                    : (typeof storey.Elevation === 'number' ? storey.Elevation : 0);
                const elevation = rawElevation * lengthUnitScale;
                hierarchyNodes.push({
                    id: levelId,
                    name,
                    type: 'level',
                    parentId: parentBuildingId,
                    elevation,
                });
                storeyRecords.push({ id: levelId, name, elevation });
            } catch (_) {}
        }

        // Sort ascending by elevation so levels are always bottom → top
        storeyRecords.sort((a, b) => a.elevation - b.elevation);

        // ── Containment: map IfcSpace → storey ──────────────────────────────
        const spaceToStorey = new Map<number, string>();
        const containmentLines = this.api.GetLineIDsWithType(
            modelID, WEBIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE
        );
        for (const lineID of containmentLines) {
            try {
                const rel = this.api.GetLine(modelID, lineID, false);
                const relatedIds: number[] = Array.isArray(rel.RelatedElements)
                    ? rel.RelatedElements.map((r: any) => typeof r === 'number' ? r : r?.value)
                    : [];
                const relatingId: number = typeof rel.RelatingStructure === 'number'
                    ? rel.RelatingStructure
                    : rel.RelatingStructure?.value;
                const storeyLabel = storeyIdMap.get(relatingId);
                if (storeyLabel) {
                    for (const spaceId of relatedIds) {
                        if (spaceId) spaceToStorey.set(spaceId, storeyLabel);
                    }
                }
            } catch (_) {}
        }

        // ── Property sets: map IfcSpace → pset map ───────────────────────────
        const spacePsets = new Map<number, Map<string, Record<string, string | number | boolean>>>();
        const defByPropLines = this.api.GetLineIDsWithType(
            modelID, WEBIFC.IFCRELDEFINESBYPROPERTIES
        );
        for (const lineID of defByPropLines) {
            try {
                const rel = this.api.GetLine(modelID, lineID, false);
                const relObjects: number[] = Array.isArray(rel.RelatedObjects)
                    ? rel.RelatedObjects.map((r: any) => typeof r === 'number' ? r : r?.value)
                    : [];
                const psetId: number = typeof rel.RelatingPropertyDefinition === 'number'
                    ? rel.RelatingPropertyDefinition
                    : rel.RelatingPropertyDefinition?.value;

                if (!psetId) continue;
                let pset: any;
                try {
                    pset = this.api.GetLine(modelID, psetId, false);
                } catch (_) { continue; }

                const psetName = this.extractLabel(pset.Name);
                if (!psetName) continue;

                const psetProps: Record<string, string | number | boolean> = {};
                const propRefs: number[] = Array.isArray(pset.HasProperties)
                    ? pset.HasProperties.map((r: any) => typeof r === 'number' ? r : r?.value)
                    : [];
                for (const propRef of propRefs) {
                    try {
                        const prop = this.api.GetLine(modelID, propRef, false);
                        const propName = this.extractLabel(prop.Name ?? prop.Identifier);
                        if (!propName) continue;
                        const nomVal = prop.NominalValue;
                        if (nomVal != null) {
                            psetProps[propName] = typeof nomVal === 'object'
                                ? (nomVal.value ?? String(nomVal))
                                : nomVal;
                        }
                    } catch (_) {}
                }

                for (const objId of relObjects) {
                    if (!objId) continue;
                    if (!spacePsets.has(objId)) spacePsets.set(objId, new Map());
                    spacePsets.get(objId)!.set(psetName, psetProps);
                }
            } catch (_) {}
        }

        // ── Spaces ───────────────────────────────────────────────────────────
        const spaceLines = this.api.GetLineIDsWithType(modelID, WEBIFC.IFCSPACE);
        let recoveredTemplateAssignments = 0;
        const spaceIdMap = new Map<number, string>(); // lineID → PRYZM room id

        for (const lineID of spaceLines) {
            try {
                const space = this.api.GetLine(modelID, lineID, false);
                const globalId = this.extractLabel(space.GlobalId) ?? `space-${lineID}`;
                const name = this.extractLabel(space.Name) ?? `Space ${lineID}`;

                const psets = spacePsets.get(lineID) ?? new Map<string, Record<string, string | number | boolean>>();
                const pryzmSpatial = psets.get('Pset_PRYZM_Spatial') ?? {};
                const pryzmCompliance = psets.get('Pset_PRYZM_Compliance') ?? {};
                const pryzmIds = psets.get('Pset_PRYZM_Identifiers') ?? {};

                const pryzmId = String(pryzmIds['PryzmId'] ?? globalId);
                spaceIdMap.set(lineID, pryzmId);

                const psetCustomData: Record<string, string | number | boolean> = {};
                for (const [psetName, props] of psets) {
                    if (psetName.startsWith('Pset_PRYZM_')) continue;
                    for (const [k, v] of Object.entries(props)) {
                        psetCustomData[`${psetName}.${k}`] = v;
                    }
                }

                const templateCode = pryzmSpatial['TemplateCode'] as string | undefined;
                const templateName = pryzmSpatial['TemplateName'] as string | undefined;
                if (templateCode || templateName) recoveredTemplateAssignments++;

                const room: ImportedRoom = {
                    id: pryzmId,
                    name,
                    roomNumber: pryzmSpatial['RoomNumber'] as string | undefined,
                    occupancyType: pryzmSpatial['OccupancyType'] as string | undefined,
                    area: pryzmSpatial['ActualArea'] as number | undefined,
                    levelId: spaceToStorey.get(lineID),
                    unitId: pryzmSpatial['UnitId'] as string | undefined,
                    syncState: (pryzmSpatial['SyncState'] ?? pryzmCompliance['SyncState']) as string | undefined,
                    pryzmTemplateCode: templateCode,
                    pryzmTemplateName: templateName,
                    pryzmTargetArea: pryzmSpatial['TargetArea'] as number | undefined,
                    complianceStatus: pryzmCompliance['ComplianceStatus'] as string | undefined,
                    deviationPct: pryzmCompliance['DeviationPercent'] as number | undefined,
                    customData: psetCustomData,
                };

                rooms.push(room);
            } catch (err) {
                debug(`[IfcImporter] Failed to read space ${lineID}: ${err}`);
            }
        }

        // ── Spatial Boundaries (adjacentTo ↔ rooms) ──────────────────────────
        const boundaryLines = this.api.GetLineIDsWithType(modelID, WEBIFC.IFCRELSPACEBOUNDARY);
        for (const lineID of boundaryLines) {
            try {
                const rel = this.api.GetLine(modelID, lineID, false);
                const srcId: number = typeof rel.RelatingSpace === 'number'
                    ? rel.RelatingSpace : rel.RelatingSpace?.value;
                const tgtId: number = typeof rel.RelatedBuildingElement === 'number'
                    ? rel.RelatedBuildingElement : rel.RelatedBuildingElement?.value;

                const srcPryzm = spaceIdMap.get(srcId);
                const tgtPryzm = spaceIdMap.get(tgtId);

                if (srcPryzm && tgtPryzm) {
                    const name = this.extractLabel(rel.Name);
                    const relType = name === 'PRYZM_AdjacentTo' ? 'adjacentTo' : 'boundedBy';
                    relationships.push({ type: relType, sourceId: srcPryzm, targetId: tgtPryzm });
                }
            } catch (_) {}
        }

        const isPryzmExported = rooms.some(r => r.pryzmTemplateCode != null || r.pryzmTemplateName != null);

        // IFC-P1.7: Extract IfcProjectedCRS + IfcMapConversion (contract C12 §1.4).
        // The extraction runs while the model is still open (either importFromBytes
        // closes it in finally, or importAndKeepOpen keeps it open for the renderer).
        // Returns null when no IfcProjectedCRS entity exists — most IFC files.
        const crsRecord = this._extractCRS(modelID);

        debug(`[IfcImporter] Extracted: ${rooms.length} rooms, ${hierarchyNodes.length} hierarchy nodes, ${relationships.length} relationships`);

        return {
            rooms,
            hierarchyNodes,
            relationships,
            storeys: storeyRecords,
            pryzmExported: isPryzmExported,
            schemaVersion: 3,
            crsRecord,
            lengthUnitScale,
            stats: {
                totalSpaces: spaceLines.size(),
                totalStoreys: storeyLines.size(),
                totalBuildings: buildingLines.size(),
                totalSites: siteLines.size(),
                totalRelationships: relationships.length,
                recoveredTemplateAssignments,
            },
        };
    }

    /**
     * §FIX-IFC-STOREY-UNIT-SCALE (L-695) — read the project's LENGTHUNIT and
     * return metres per file unit.
     *
     * Resolution order (IFC4 §8.15): the length unit is looked up through
     * `IfcProject.UnitsInContext` when that link is readable, and falls back to
     * a whole-model scan of `IfcUnitAssignment` and then of bare `IfcSIUnit` /
     * `IfcConversionBasedUnit` entities. Any failure degrades to 1.0 (metres),
     * which is the IFC default AND the only safe no-op.
     *
     * @returns metres per file unit — 1e-3 for a MILLI-prefixed metre.
     */
    private _readLengthUnitScale(modelID: number): number {
        const records: IfcLengthUnitRecord[] = [];

        const readUnit = (unitId: number): void => {
            if (!unitId) return;
            let line: any;
            try { line = this.api.GetLine(modelID, unitId, false); } catch { return; }
            if (!line) return;

            const unitType = this.extractEnum(line.UnitType);
            if (unitType && unitType.toUpperCase() !== 'LENGTHUNIT') return;

            // IfcSIUnit carries Name (METRE) + optional Prefix (MILLI).
            const name = this.extractEnum(line.Name);
            if (name) {
                records.push({
                    kind: 'SI',
                    unitType: unitType ?? 'LENGTHUNIT',
                    name,
                    prefix: this.extractEnum(line.Prefix) ?? undefined,
                });
                return;
            }

            // IfcConversionBasedUnit — ConversionFactor is an IfcMeasureWithUnit.
            if (line.ConversionFactor != null) {
                const mwuId = typeof line.ConversionFactor === 'number'
                    ? line.ConversionFactor
                    : line.ConversionFactor?.value;
                let conversionFactor: number | undefined;
                let conversionUnitScale = 1;
                try {
                    const mwu = this.api.GetLine(modelID, mwuId, false);
                    const vc = mwu?.ValueComponent;
                    const v = typeof vc === 'number' ? vc : vc?.value;
                    if (typeof v === 'number') conversionFactor = v;
                    // UnitComponent is normally a plain METRE IfcSIUnit; honour a prefix if present.
                    const ucId = typeof mwu?.UnitComponent === 'number'
                        ? mwu.UnitComponent
                        : mwu?.UnitComponent?.value;
                    if (ucId) {
                        const uc = this.api.GetLine(modelID, ucId, false);
                        const p = this.extractEnum(uc?.Prefix);
                        if (p) {
                            conversionUnitScale = resolveLengthUnitScale([
                                { kind: 'SI', unitType: 'LENGTHUNIT', name: 'METRE', prefix: p },
                            ]);
                        }
                    }
                } catch { /* leave undefined — resolver falls back to 1.0 */ }
                records.push({
                    kind: 'CONVERSION',
                    unitType: unitType ?? 'LENGTHUNIT',
                    conversionFactor,
                    conversionUnitScale,
                });
            }
        };

        const readAssignment = (assignmentId: number): void => {
            try {
                const ua = this.api.GetLine(modelID, assignmentId, false);
                const units: number[] = Array.isArray(ua?.Units)
                    ? ua.Units.map((u: any) => (typeof u === 'number' ? u : u?.value)).filter(Boolean)
                    : [];
                for (const u of units) readUnit(u);
            } catch { /* fall through to the broader scans */ }
        };

        // 1 — the correct link: IfcProject.UnitsInContext.
        try {
            const projectIds = this.api.GetLineIDsWithType(modelID, WEBIFC.IFCPROJECT);
            for (const pid of projectIds) {
                const proj = this.api.GetLine(modelID, pid, false);
                const uaId = typeof proj?.UnitsInContext === 'number'
                    ? proj.UnitsInContext
                    : proj?.UnitsInContext?.value;
                if (uaId) readAssignment(uaId);
            }
        } catch { /* fall through */ }

        // 2 — fallback: any IfcUnitAssignment in the file.
        if (records.length === 0) {
            try {
                for (const id of this.api.GetLineIDsWithType(modelID, (WEBIFC as any).IFCUNITASSIGNMENT)) {
                    readAssignment(id);
                }
            } catch { /* fall through */ }
        }

        // 3 — last resort: bare IfcSIUnit entities declaring LENGTHUNIT.
        if (records.length === 0) {
            try {
                for (const id of this.api.GetLineIDsWithType(modelID, (WEBIFC as any).IFCSIUNIT)) {
                    readUnit(id);
                }
            } catch { /* fall through */ }
        }

        const scale = resolveLengthUnitScale(records);
        debug(`[IfcImporter] LENGTHUNIT scale = ${scale} m per file unit (${records.length} length-unit record(s))`);
        return scale;
    }

    /**
     * Extract an IFC enumeration / label token. web-ifc returns enums as
     * `{ type: 3, value: 'MILLI' }`; a plain string is also accepted.
     */
    private extractEnum(val: any): string | undefined {
        if (val == null) return undefined;
        if (typeof val === 'string') return val;
        if (typeof val.value === 'string') return val.value;
        return undefined;
    }

    /**
     * IFC-P1.7: Read IfcProjectedCRS and optional IfcMapConversion from an
     * open WASM model.  Returns null when no CRS entity is present or when
     * the read fails.  Graceful-degradation: a missing CRS must never abort
     * the import.
     */
    private _extractCRS(modelID: number): CrsRecord | null {
        try {
            const crsIds = this.api.GetLineIDsWithType(modelID, _IFC_PROJECTED_CRS as any);
            if (crsIds.size() === 0) return null;

            const crsLine = this.api.GetLine(modelID, crsIds.get(0), false);
            if (!crsLine) return null;

            const _str = (attr: unknown): string => {
                if (typeof attr === 'string') return attr;
                if (attr && typeof attr === 'object' && 'value' in attr) {
                    const v = (attr as { value: unknown }).value;
                    return typeof v === 'string' ? v : String(v ?? '');
                }
                return '';
            };
            const _num = (attr: unknown): number | null => {
                if (typeof attr === 'number') return attr;
                if (attr && typeof attr === 'object' && 'value' in attr) {
                    const v = (attr as { value: unknown }).value;
                    if (typeof v === 'number') return v;
                    const n = Number(v);
                    return isNaN(n) ? null : n;
                }
                return null;
            };

            const record: CrsRecord = { name: _str(crsLine['Name']) };
            if (_str(crsLine['Description']))   record.description   = _str(crsLine['Description']);
            if (_str(crsLine['GeodeticDatum'])) record.geodeticDatum = _str(crsLine['GeodeticDatum']);
            if (_str(crsLine['MapProjection'])) record.mapProjection = _str(crsLine['MapProjection']);
            if (_str(crsLine['MapZone']))        record.mapZone       = _str(crsLine['MapZone']);

            // Optional: IfcMapConversion for origin offset
            try {
                const convIds = this.api.GetLineIDsWithType(modelID, _IFC_MAP_CONVERSION as any);
                if (convIds.size() > 0) {
                    const conv = this.api.GetLine(modelID, convIds.get(0), false);
                    if (conv) {
                        const e = _num(conv['Eastings']);          if (e != null)  record.eastings         = e;
                        const n = _num(conv['Northings']);         if (n != null)  record.northings        = n;
                        const h = _num(conv['OrthogonalHeight']);  if (h != null)  record.orthogonalHeight = h;
                        const xa = _num(conv['XAxisAbscissa']);   if (xa != null) record.xAxisAbscissa    = xa;
                        const xo = _num(conv['XAxisOrdinate']);   if (xo != null) record.xAxisOrdinate    = xo;
                        const sc = _num(conv['Scale']);            if (sc != null) record.scale            = sc;
                    }
                }
            } catch { /* IfcMapConversion is optional */ }

            return record;
        } catch {
            return null; // CRS read failure must not abort import
        }
    }

    /**
     * Extract all physical IFC elements from an open model, grouped with their
     * IFC type name, storey assignment, and full property sets.
     *
     * §28-IFC-IMPORT-NATIVE-PARITY-CONTRACT §3.3
     * Call BEFORE CloseModel() and BEFORE renderFromOpenModel() so the
     * element index is available during geometry streaming.
     */
    extractElements(modelID: number): IfcElementRecord[] {
        const records: IfcElementRecord[] = [];

        // ── Build storey name map ─────────────────────────────────────────────
        const storeyNames = new Map<number, string>();
        const elementToStorey = new Map<number, number>();

        try {
            const storeyLines = this.api.GetLineIDsWithType(modelID, WEBIFC.IFCBUILDINGSTOREY);
            for (const lineID of storeyLines) {
                try {
                    const storey = this.api.GetLine(modelID, lineID, false);
                    storeyNames.set(lineID, this.extractLabel(storey.Name) ?? `Level ${lineID}`);
                } catch (_) {}
            }
        } catch (_) {}

        try {
            const containmentLines = this.api.GetLineIDsWithType(modelID, WEBIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);
            for (const lineID of containmentLines) {
                try {
                    const rel = this.api.GetLine(modelID, lineID, false);
                    const relatingId: number = typeof rel.RelatingStructure === 'number'
                        ? rel.RelatingStructure
                        : rel.RelatingStructure?.value;
                    if (!storeyNames.has(relatingId)) continue;

                    const relatedIds: number[] = Array.isArray(rel.RelatedElements)
                        ? rel.RelatedElements.map((r: any) => typeof r === 'number' ? r : r?.value).filter(Boolean)
                        : [];
                    for (const elId of relatedIds) {
                        elementToStorey.set(elId, relatingId);
                    }
                } catch (_) {}
            }
        } catch (_) {}

        // ── Query each physical type ──────────────────────────────────────────
        for (const [typeConstant, typeName, rawIfcType] of IFC_PHYSICAL_TYPES) {
            if (typeConstant == null) continue;
            try {
                const lineIds = this.api.GetLineIDsWithType(modelID, typeConstant);
                for (const lineID of lineIds) {
                    try {
                        const el = this.api.GetLine(modelID, lineID, false);
                        const storeyExpressID = elementToStorey.get(lineID) ?? 0;
                        const storeyName = storeyExpressID
                            ? (storeyNames.get(storeyExpressID) ?? 'Unassigned')
                            : 'Unassigned';
                        records.push({
                            id:              `ifc-${lineID}`,
                            expressID:       lineID,
                            name:            this.extractLabel(el.Name) ?? `${typeName} ${lineID}`,
                            ifcTypeName:     typeName,
                            rawIfcType,
                            storeyName,
                            storeyExpressID,
                            psets:           {},
                        });
                    } catch (_) {}
                }
            } catch (_) {}
        }

        // ── Extract property sets for all physical elements (§28 §3.3) ────────
        // Build a set of all expressIDs we care about for fast O(1) lookup
        const elementIdSet = new Set(records.map(r => r.expressID));

        if (elementIdSet.size > 0) {
            // Map: expressID → { psetName → { propName → value } }
            const elementPsets = new Map<number, Record<string, Record<string, string | number | boolean>>>();

            try {
                const defByPropLines = this.api.GetLineIDsWithType(modelID, WEBIFC.IFCRELDEFINESBYPROPERTIES);
                for (const lineID of defByPropLines) {
                    try {
                        const rel = this.api.GetLine(modelID, lineID, false);
                        const relObjects: number[] = Array.isArray(rel.RelatedObjects)
                            ? rel.RelatedObjects.map((r: any) => typeof r === 'number' ? r : r?.value).filter(Boolean)
                            : [];

                        // Only process if any related object is a physical element we track
                        const relevantIds = relObjects.filter(id => elementIdSet.has(id));
                        if (relevantIds.length === 0) continue;

                        const psetId: number = typeof rel.RelatingPropertyDefinition === 'number'
                            ? rel.RelatingPropertyDefinition
                            : rel.RelatingPropertyDefinition?.value;
                        if (!psetId) continue;

                        let pset: any;
                        try { pset = this.api.GetLine(modelID, psetId, false); } catch (_) { continue; }

                        const psetName = this.extractLabel(pset.Name);
                        if (!psetName) continue;

                        const psetProps: Record<string, string | number | boolean> = {};
                        const propRefs: number[] = Array.isArray(pset.HasProperties)
                            ? pset.HasProperties.map((r: any) => typeof r === 'number' ? r : r?.value)
                            : [];

                        for (const propRef of propRefs) {
                            try {
                                const prop = this.api.GetLine(modelID, propRef, false);
                                const propName = this.extractLabel(prop.Name ?? prop.Identifier);
                                if (!propName) continue;
                                const nomVal = prop.NominalValue;
                                if (nomVal != null) {
                                    psetProps[propName] = typeof nomVal === 'object'
                                        ? (nomVal.value ?? String(nomVal))
                                        : nomVal;
                                }
                            } catch (_) {}
                        }

                        for (const objId of relevantIds) {
                            if (!elementPsets.has(objId)) elementPsets.set(objId, {});
                            elementPsets.get(objId)![psetName] = psetProps;
                        }
                    } catch (_) {}
                }
            } catch (_) {}

            // Attach psets to records
            for (const record of records) {
                record.psets = elementPsets.get(record.expressID) ?? {};
            }
        }

        debug(`[IfcImporter.extractElements] ${records.length} elements extracted`);
        return records;
    }

    private extractLabel(val: any): string | undefined {
        if (!val) return undefined;
        if (typeof val === 'string') return val;
        if (typeof val.value === 'string') return val.value;
        return undefined;
    }
}

// ── Convenience export ────────────────────────────────────────────────────────

export async function importFromIfcFile(file: File): Promise<IfcImportResult> {
    const importer = new IfcImporter();
    try {
        return await importer.importFromFile(file);
    } finally {
        importer.dispose();
    }
}

export async function importFromIfcBytes(bytes: Uint8Array): Promise<IfcImportResult> {
    const importer = new IfcImporter();
    try {
        return await importer.importFromBytes(bytes);
    } finally {
        importer.dispose();
    }
}
