/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Side System (NEW FILE) — read-only store observer
 * Phase:             Platform Phase — P4A Persistence
 * Files Modified:    ProjectSerializer.ts (new)
 * Classification:    A
 *
 * Impact Assessment:
 *   Store Reads:      Yes — reads all stores via getAll()
 *   Store Writes:     NO — pure read-only side system
 *   Event Bus:        NO — does not publish any events
 *   Builder Calls:    NO — does not call any builders
 *   Command Dispatch: NO — passive observer only
 *
 * Risk Level:   Low (read-only, no side effects)
 * Rationale:
 *   Converts live store state to a plain-JSON ProjectSnapshot that can be
 *   persisted to Supabase (or localStorage as fallback). All THREE.js class
 *   instances are stripped to plain { x, y, z } / { x, y, z, order } objects
 *   so the snapshot survives JSON.stringify/JSON.parse round-trips.
 */

import { vgGovernanceStore } from '@pryzm/core-app-model';
import { semanticIndex } from '@pryzm/core-app-model';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import { visibilityRuleEngine } from '@pryzm/core-app-model';
import { visibilityIntentStore } from '@pryzm/core-app-model/presentation';
import { viewIntentInstanceStore } from '@pryzm/core-app-model/presentation';
import { hierarchyStore } from '@pryzm/core-app-model';
import { templateStore } from '@pryzm/core-app-model';
import { templateAssignmentStore } from '@pryzm/core-app-model';
import { elementCodeStore } from '@pryzm/core-app-model';
import { roomBoundingLineStore } from '@pryzm/core-app-model/stores';
import { WallStore } from '@pryzm/geometry-wall';
import { SlabStore } from '@pryzm/geometry-slab';
import { ColumnStore } from '@pryzm/geometry-column';
import { GridStore } from '@pryzm/core-app-model';
import { StairStore } from '@pryzm/geometry-stair';
import { BeamStore } from '@pryzm/core-app-model/stores';
import { CurtainWallStore } from '@pryzm/geometry-curtain-wall';
import { RoofStore } from '@pryzm/geometry-roof';
import { PlumbingStore } from '@pryzm/geometry-plumbing';
import { FurnitureStore } from '@pryzm/geometry-furniture';
import { HandrailStore } from '@pryzm/core-app-model/stores';
import { OpeningStore } from '@pryzm/core-app-model/stores';
import { doorStore, doorSystemTypeStore } from '@pryzm/geometry-door';
import { windowStore, windowSystemTypeStore } from '@pryzm/geometry-window';
import { BimManager } from '@pryzm/core-app-model';
import { MigrationEngine } from './MigrationEngine';
import { semanticGraphManager, SemanticGraph } from '@pryzm/core-app-model';
import { temporalGraphManager } from '@pryzm/core-app-model';
import { decisionRecordStore } from '@pryzm/core-app-model';
// S70 D8 — Phase-L lifecycle / maintenance imports removed alongside the
// deletion of `src/lifecycle/` per SPEC-27 §4.3 + ADR-030 Part D + ADR-0052 §B.7.
// The `lifecycle?: { … }` field on the snapshot type below is preserved as
// a forward-compat tombstone (legacy v5 archives still parse; no fields
// are written by S70 D8+ serialisers).
import { SlabSystemTypeStore } from '@pryzm/geometry-slab';
import { WallSystemTypeStore } from '@pryzm/geometry-wall';
import { CeilingStore } from '@pryzm/core-app-model/stores';
import { CeilingSystemTypeStore } from '@pryzm/core-app-model/stores';
import { requirementStore } from '@pryzm/core-app-model';
import { assetCatalogStore } from '@pryzm/core-app-model';
import { dxfOverlayStore } from '@pryzm/file-format';
import { sheetStore } from '@pryzm/core-app-model';
import { scheduleStore } from '@pryzm/core-app-model';
import { annotationStore } from '@pryzm/plugin-annotations';
// ANNOTATION-SYSTEM-AUDIT-2026 A4 / B8 / B9 — additional annotation slices
import { constraintStore } from '@pryzm/plugin-annotations';
import { annotationVisibilityStore } from '@pryzm/plugin-annotations';
import { obcAnnotationAdapter } from '@pryzm/plugin-annotations';

export const SNAPSHOT_SCHEMA_VERSION = 5;

// ── Serialized plain-object types ───────────────────────────────────────────

export interface Vec3 { x: number; y: number; z: number; }
export interface Vec2 { x: number; y: number; }
export interface Euler { x: number; y: number; z: number; order: string; }
export type Baseline = [Vec3, Vec3];

export interface ProjectSnapshot {
    schemaVersion: number;
    timestamp: number;
    projectName: string;
    projectId?: string;
    versionLabel?: string;
    levels: any[];
    grids: any[];
    walls: any[];
    windows: any[];
    doors: any[];
    slabs: any[];
    columns: any[];
    stairs: any[];
    beams: any[];
    curtainWalls: any[];
    roofs: any[];
    furniture: any[];
    handrails: any[];
    plumbing: any[];
    openings: any[];
    elementCount: number;
    /** Room Bounding Lines — virtual partition elements (§ROOM-BOUNDING). Optional for backward compat. */
    roomBoundingLines?: any[];
    /** Phase 3 — VG Governance persistence. Optional for backward compat. */
    vgGovernance?: {
        version: 1;
        templates: any[];
        models:    any[];
        views?:    any[];
    };
    /** Phase A — Semantic tag index. Optional for backward compat with older snapshots. */
    semanticTags?: {
        version: 1;
        tags: Array<{ elementId: string; tags: string[] }>;
    };
    /** Phase B — ViewDefinition store snapshot. Optional for backward compat. */
    viewDefinitions?: {
        version: 1;
        views: any[];
    };
    /** Phase C — VisibilityRule engine snapshot. Optional for backward compat. */
    visibilityRules?: {
        version: 1;
        rules: any[];
    };
    visibilityIntents?: {
        version: 1;
        intents: any[];
    };
    viewIntentInstances?: {
        version: 1;
        instances: any[];
    };
    /** Room subsystem — serialised RoomData array. Optional for backward compat. */
    rooms?: any[];
    /** Ceiling subsystem — serialised CeilingData array. Optional for backward compat. */
    ceilings?: any[];
    /** Custom CeilingSystemType definitions. Optional for backward compat. */
    ceilingSystemTypes?: any[];
    /**
     * §M-H4 (DAILY-USE-AUDIT 2026-05-20) — Custom door/window finish types
     * (frame profile, glazing assembly, hardware spec). Built-in presets are
     * re-seeded from code each boot; only the custom types need persisting.
     * Optional for backward compat with snapshots predating this addition.
     */
    doorSystemTypes?: any[];
    windowSystemTypes?: any[];
    /** Floor finish subsystem — serialised FloorData array. Optional for backward compat. */
    floors?: any[];
    /** Custom FloorSystemType definitions. Optional for backward compat. */
    floorSystemTypes?: any[];
    /**
     * FIX-12 §07 §3: Custom SlabSystemType definitions.
     * Only CUSTOM types are persisted (built-in presets are always reconstructed
     * from code). Optional for backward compat with older snapshots.
     */
    slabSystemTypes?: any[];
    /**
     * FIX-3 (M9): Custom WallSystemType definitions.
     * Only user-created types are persisted; built-in presets are always
     * reconstructed from code. Optional for backward compat.
     */
    wallSystemTypes?: any[];

    /**
     * Data Platform — Phase 4 (schema v2).
     * Hierarchy nodes (Site / Building / Level / Unit).
     * Optional for backward compat with v1 snapshots (migration adds empty block).
     */
    hierarchy?: {
        version: 1;
        nodes: import('@pryzm/core-app-model').AnyHierarchyEntity[];
    };

    /**
     * Data Platform — Phase 4 (schema v2).
     * Template definitions and their node assignments.
     * Optional for backward compat with v1 snapshots.
     */
    templates?: {
        version: 1;
        templates: import('@pryzm/core-app-model').TemplateDefinition[];
        assignments: import('@pryzm/core-app-model').TemplateAssignment[];
    };

    /**
     * Data Platform — Phase 4 (schema v2).
     * Element code registry (e.g. DO001, WA042).
     * Optional for backward compat with v1 snapshots.
     */
    elementCodes?: {
        version: 1;
        codes: import('@pryzm/core-app-model').ElementCode[];
        counters: Record<string, number>;
    };

    /**
     * Phase D — D-1 (schema v3).
     * Semantic graph: all typed relationships between BIM elements.
     * Optional for backward compat with v1/v2 snapshots (graph starts empty on load).
     */
    semanticGraph?: SemanticGraph;

    /**
     * Phase G — G-1 (schema v4).
     * Temporal graph: append-only record of all relationship mutations and
     * element-level create/update/delete events with timestamps and session IDs.
     * Powers the DesignHistoryPanel time-travel scrubber (G-2).
     * Optional for backward compat with v1–v3 snapshots (starts empty on load).
     */
    temporalGraph?: import('@pryzm/core-app-model').SerializedTemporalGraph;

    /**
     * Phase G — G-3 (schema v4).
     * Decision records: architect rationale entries linked to non-standard decisions.
     * Populated by the IntentPrompt when the architect deviates from a template
     * requirement or overrides a ConstraintEngine violation.
     * Optional for backward compat with v1–v3 snapshots (starts empty on load).
     */
    decisionRecords?: import('@pryzm/core-app-model').SerializedDecisionRecords;

    /**
     * Phase L — L-1 + L-2 (schema v5).  TOMBSTONE — the in-engine lifecycle /
     * maintenance stores were deleted at S70 D8 alongside `src/lifecycle/`
     * per SPEC-27 §4.3 + ADR-030 Part D + ADR-0052 §B.7.  The field is kept
     * as `unknown` so v5 archives still type-check on parse; no writer
     * populates it from S70 D8+.  Re-instated by `plugins/lifecycle/`.
     */
    lifecycle?: unknown;

    /**
     * Autonomous Auditor — Phase 0 (schema v5+).
     * Space-programme brief: all RoomRequirement records from RequirementStore.
     * Optional for backward compat with all prior snapshots (starts empty on load).
     */
    requirements?: {
        version: 1;
        records: import('@pryzm/core-app-model').RoomRequirement[];
    };

    /**
     * Autonomous Auditor — Phase 3 (schema v5+).
     * Equipment archetype catalog: all AssetCatalogEntry records.
     * Optional for backward compat — catalog is re-seeded from defaults on load
     * when this field is absent.
     */
    assetCatalog?: {
        version: 1;
        entries: import('@pryzm/core-app-model').AssetCatalogEntry[];
    };
    /** §31 Phase 2 — DXF/DWG underlay overlays. Optional for backward compat. */
    dxfOverlays?: {
        version: 1;
        overlays: Array<{
            overlayId: string;
            fileName: string;
            sourceText: string;
            metersPerUnit: number;
            elevation: number;
            positionOffset: { x: number; z: number };
            opacity: number;
            locked: boolean;
            layers: Array<{ name: string; visible: boolean; color: string; linewidth: number }>;
        }>;
    };
    /**
     * Phase III — Sheet store snapshot.
     * All SheetDefinition records (viewports, sheet names, sizes).
     * Optional for backward compat with pre-Phase-III snapshots.
     */
    sheets?: {
        version: 1;
        sheets: any[];
    };
    /**
     * Phase III — Schedule store snapshot.
     * All ScheduleDefinition records.
     * Optional for backward compat with pre-Phase-III snapshots.
     */
    schedules?: {
        version: 1;
        schedules: any[];
    };
    /**
     * §ANN-A2 — Annotation store snapshot.
     * All AnnotationElement and DimensionElement records, keyed by ownerViewId.
     * Optional for backward compat with pre-annotation snapshots.
     */
    annotations?: {
        version: 1;
        annotations: any[];
        dimensions: any[];
    };
    /**
     * ANNOTATION-SYSTEM-AUDIT-2026 A4 — ConstraintRecord persistence.
     * Locked-dimension constraint records derived from annotations.
     * Optional for backward compat with pre-A4 snapshots.
     */
    annotationConstraints?: {
        version: 1;
        records: any[];
    };
    /**
     * ANNOTATION-SYSTEM-AUDIT-2026 B8 — AnnotationVisibility persistence.
     * Per-view annotation hide list. Optional for backward compat.
     */
    annotationVisibility?: any;
    /**
     * ANNOTATION-SYSTEM-AUDIT-2026 B9 — OBC adapter UUID → annotationId map
     * Persists the bidirectional Pickability bridge so post-load picks
     * resolve to the same AnnotationElement IDs.
     */
    obcAnnotationMap?: {
        version: 1;
        entries: Array<[string, string]>;
    };
    /**
     * §IFC-STORE-1 — IFC import registry.
     * Stores metadata for all imported IFC models so they can be re-fetched
     * from Supabase Storage on session restore. Binary fragment data is stored
     * separately in the `ifc-uploads` storage bucket.
     * Optional for backward compat.
     */
    ifcImports?: {
        version: 1;
        models: Array<{
            modelId: string;
            fileName: string;
            storagePath: string;
            uploadedAt: number;
            elementCount: number;
        }>;
    };
}

// ── THREE.js strippers ──────────────────────────────────────────────────────

function stripVec3(v: any): Vec3 {
    if (!v) return { x: 0, y: 0, z: 0 };
    return { x: Number(v.x ?? 0), y: Number(v.y ?? 0), z: Number(v.z ?? 0) };
}

function stripEuler(e: any): Euler {
    if (!e) return { x: 0, y: 0, z: 0, order: 'XYZ' };
    const x = e._x !== undefined ? e._x : (e.x ?? 0);
    const y = e._y !== undefined ? e._y : (e.y ?? 0);
    const z = e._z !== undefined ? e._z : (e.z ?? 0);
    const order = e._order || e.order || 'XYZ';
    return { x: Number(x), y: Number(y), z: Number(z), order: String(order) };
}

function stripVec2(v: any): Vec2 {
    if (!v) return { x: 0, y: 0 };
    return { x: Number(v.x ?? 0), y: Number(v.y ?? 0) };
}

function stripBaseline(bl: any): Baseline {
    if (!Array.isArray(bl) || bl.length < 2) return [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }];
    return [stripVec3(bl[0]), stripVec3(bl[1])];
}

/** Generic deep-strip: removes THREE.js class methods, leaves plain data. */
function deepStrip(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;

    // THREE.Vector3
    if (obj.isVector3 || (obj.x !== undefined && obj.y !== undefined && obj.z !== undefined && obj.isVector3 !== undefined)) {
        return stripVec3(obj);
    }
    // THREE.Euler
    if (obj.isEuler || (obj._x !== undefined && obj._y !== undefined && obj._order !== undefined)) {
        return stripEuler(obj);
    }
    // THREE.Vector2
    if (obj.isVector2 || (obj.x !== undefined && obj.y !== undefined && obj.z === undefined && typeof obj.cross === 'function')) {
        return stripVec2(obj);
    }

    if (Array.isArray(obj)) return obj.map(deepStrip);

    const out: any = {};
    for (const key of Object.keys(obj)) {
        out[key] = deepStrip(obj[key]);
    }
    return out;
}

// ── Wall serialization ──────────────────────────────────────────────────────

function serializeWall(wall: any): any {
    // §WALL-JOIN-SAVE-FIX: Prefer _sourceBaseLine (the user-drawn, pre-join-resolution
    // position) over baseLine (which may have been trimmed by the join resolver).
    // Using the original endpoints means the join resolver re-runs on untouched input
    // after reload and produces the same geometry, guaranteeing idempotent round-trips.
    const baseLineToSave = wall._sourceBaseLine ?? wall.baseLine;
    return {
        id: wall.id,
        type: wall.type,
        levelId: wall.levelId,
        parentId: wall.parentId,
        baseLine: stripBaseline(baseLineToSave),
        height: wall.height,
        thickness: wall.thickness,
        baseOffset: wall.baseOffset,
        materialId: wall.materialId,
        materialColor: wall.materialColor,
        openings: Array.isArray(wall.openings) ? wall.openings.map((o: any) => ({ ...o })) : [],
        childrenIds: Array.isArray(wall.childrenIds) ? [...wall.childrenIds] : [],
        layers: wall.layers ? wall.layers.map((l: any) => ({ ...l })) : undefined,
        systemTypeId: wall.systemTypeId,
        curve: wall.curve ? { ...wall.curve } : undefined,
        properties: wall.properties ? { ...wall.properties } : {},
        ifcData: wall.ifcData ? { ...wall.ifcData } : undefined,
        metadata: wall.metadata ? { ...wall.metadata } : undefined,
        loadBearing: wall.loadBearing
    };
}

// ── Slab serialization ──────────────────────────────────────────────────────

function serializeSlab(s: any): any {
    return {
        id: s.id, type: s.type, levelId: s.levelId, parentId: s.parentId,
        width: s.width, depth: s.depth, thickness: s.thickness,
        position: stripVec3(s.position),
        polygon: Array.isArray(s.polygon) ? s.polygon.map(stripVec2) : undefined,
        holes: Array.isArray(s.holes) ? s.holes.map((h: any[]) => h.map(stripVec2)) : undefined,
        baseOffset: s.baseOffset,
        materialId: s.materialId, materialColor: s.materialColor,
        layers: s.layers ? s.layers.map((l: any) => ({ ...l })) : undefined,
        systemTypeId: s.systemTypeId,
        sketch: s.sketch ? deepStrip(s.sketch) : undefined,
        properties: s.properties ? { ...s.properties } : {},
        ifcData: s.ifcData ? { ...s.ifcData } : undefined
    };
}

// ── Column serialization ─────────────────────────────────────────────────────

function serializeColumn(c: any): any {
    return {
        id: c.id, type: c.type, levelId: c.levelId, parentId: c.parentId,
        position: stripVec3(c.position),
        height: c.height, rotation: c.rotation,
        profile: c.profile, width: c.width, depth: c.depth,
        baseOffset: c.baseOffset,
        materialId: c.materialId,
        properties: c.properties ? { ...c.properties } : {},
        ifcData: c.ifcData ? { ...c.ifcData } : undefined
    };
}

// ── Stair serialization ──────────────────────────────────────────────────────

function serializeStair(s: any): any {
    return deepStrip(s);
}

// ── Beam serialization ───────────────────────────────────────────────────────

function serializeBeam(b: any): any {
    return {
        id: b.id, levelId: b.levelId, parentId: b.parentId,
        startPoint: stripVec3(b.startPoint),
        endPoint: stripVec3(b.endPoint),
        width: b.width, depth: b.depth,
        startSupportId: b.startSupportId, endSupportId: b.endSupportId,
        startSupportType: b.startSupportType, endSupportType: b.endSupportType,
        material: b.material, loadBearing: b.loadBearing,
        fireRating: b.fireRating,
        properties: b.properties ? { ...b.properties } : {},
        ifcData: b.ifcData ? { ...b.ifcData } : undefined,
        metadata: b.metadata ? { ...b.metadata } : undefined
    };
}

// ── CurtainWall serialization ────────────────────────────────────────────────

function serializeCurtainWall(c: any): any {
    return {
        id: c.id, type: c.type, levelId: c.levelId, parentId: c.parentId,
        baseLine: stripBaseline(c.baseLine),
        height: c.height, baseOffset: c.baseOffset,
        gridXSpacing: c.gridXSpacing, gridYSpacing: c.gridYSpacing,
        mullionSize: c.mullionSize, panelThickness: c.panelThickness,
        mullionColor: c.mullionColor,
        gridSystem: c.gridSystem ? deepStrip(c.gridSystem) : undefined,
        properties: c.properties ? { ...c.properties } : {},
        ifcData: c.ifcData ? { ...c.ifcData } : undefined
    };
}

// ── Roof serialization ───────────────────────────────────────────────────────

function serializeRoof(r: any): any {
    const footprint = r.footprint
        ? {
            polygon:  r.footprint.polygon,
            centroid: r.footprint.centroid,
        }
        : undefined;
    return {
        id:           r.id,
        type:         r.type,
        levelId:      r.levelId,
        parentId:     r.parentId,
        footprint,
        roofType:     r.roofType,
        slope:        r.slope,
        overhang:     r.overhang,
        thickness:    r.thickness,
        baseOffset:   r.baseOffset,
        fascia:       r.fascia,
        materialColor: r.materialColor,
        materialId:   r.materialId,
        properties:   r.properties ? { ...r.properties } : {},
        ifcData:      r.ifcData ? { ...r.ifcData } : undefined,
        metadata:     r.metadata ? { ...r.metadata } : undefined,
        width:        r.width,
        depth:        r.depth,
        mode:         r.mode,
        polygon:      Array.isArray(r.polygon) ? r.polygon : undefined,
    };
}

// ── Furniture serialization ──────────────────────────────────────────────────

function serializeFurniture(f: any): any {
    return {
        id: f.id, type: f.type, furnitureType: f.furnitureType,
        position: stripVec3(f.position),
        rotation: stripEuler(f.rotation),
        levelId: f.levelId, levelName: f.levelName,
        levelElevation: f.levelElevation, baseOffset: f.baseOffset,
        width: f.width, length: f.length, height: f.height,
        widthBranchTwo: f.widthBranchTwo, lengthBranchTwo: f.lengthBranchTwo,
        widthMain: f.widthMain, lengthSide: f.lengthSide,
        seatDepthMain: f.seatDepthMain, seatDepthSide: f.seatDepthSide,
        startPoint: f.startPoint ? stripVec3(f.startPoint) : undefined,
        cornerPoint: f.cornerPoint ? stripVec3(f.cornerPoint) : undefined,
        endPoint: f.endPoint ? stripVec3(f.endPoint) : undefined,
        lo3: f.lo3, material: f.material, color: f.color,
        hasHeadboard: f.hasHeadboard,
        mark: typeof f.mark === 'string' ? f.mark : undefined,
        hostedSpaceId: typeof f.hostedSpaceId === 'string' ? f.hostedSpaceId : undefined,
        wardrobeConfig: f.wardrobeConfig ? deepStrip(f.wardrobeConfig) : undefined,
        // Group configs for kitchen / wardrobe RUNs. Without these, a saved
        // kitchen U-shape or wardrobe L-shape reloads as a single primitive
        // and FurnitureFactory throws "requires kitchenConfig" /
        // "requires wardrobeCabinetConfig". Contract 13 §2: snapshots must
        // round-trip byte-compatibly, so every parametric input that drives
        // geometry MUST be serialised here.
        kitchenConfig:         f.kitchenConfig         ? deepStrip(f.kitchenConfig)         : undefined,
        wardrobeCabinetConfig: f.wardrobeCabinetConfig ? deepStrip(f.wardrobeCabinetConfig) : undefined,
        // Descriptor-level grouping (kitchen / bedroom / outdoor / …). Used
        // by inspector grouping, schedules and category filters; loss on
        // reload would silently regress the UI.
        furnitureCategory:     typeof f.furnitureCategory === 'string' ? f.furnitureCategory : undefined,
        aiElementConfig: f.aiElementConfig ? deepStrip(f.aiElementConfig) : undefined,
        properties: f.properties ? { ...f.properties } : {},
        // Descriptor-supplied metadata (defaultProperties from the carousel
        // registry, custom tags). `properties` already round-trips, but
        // `metadata` is the canonical channel for descriptor extras and is
        // round-tripped separately in CreateFurnitureCommand.
        metadata:              f.metadata ? deepStrip(f.metadata) : undefined,
        ifcData: f.ifcData ? { ...f.ifcData } : undefined
    };
}

// ── Handrail serialization ───────────────────────────────────────────────────

function serializeHandrail(h: any): any {
    return {
        id: h.id, type: h.type, levelId: h.levelId, parentId: h.parentId,
        baseLine: stripBaseline(h.baseLine),
        height: h.height, thickness: h.thickness,
        baseOffset: h.baseOffset,
        materialId: h.materialId, materialColor: h.materialColor,
        properties: h.properties ? { ...h.properties } : {},
        ifcData: h.ifcData ? { ...h.ifcData } : undefined
    };
}

// ── Plumbing serialization ───────────────────────────────────────────────────

function serializePlumbing(p: any): any {
    return {
        id: p.id, type: p.type, fixtureType: p.fixtureType,
        toiletVariant: p.toiletVariant,
        position: stripVec3(p.position),
        rotation: stripEuler(p.rotation),
        levelId: p.levelId, levelName: p.levelName,
        levelElevation: p.levelElevation, baseOffset: p.baseOffset,
        width: p.width, height: p.height, length: p.length,
        color: p.color,
        startPoint: p.startPoint ? stripVec3(p.startPoint) : undefined,
        endPoint: p.endPoint ? stripVec3(p.endPoint) : undefined,
        properties: p.properties ? { ...p.properties } : {}
    };
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface ProjectStores {
    wallStore: WallStore;
    slabStore: SlabStore;
    columnStore: ColumnStore;
    gridStore: GridStore;
    stairStore: StairStore;
    beamStore: BeamStore;
    curtainWallStore: CurtainWallStore;
    roofStore: RoofStore;
    plumbingStore: PlumbingStore;
    furnitureStore: FurnitureStore;
    handrailStore: HandrailStore;
    openingStore: OpeningStore;
    /** Room subsystem — optional for backward compat with bootstraps that don't yet wire it. */
    roomStore?: import('@pryzm/room-topology').RoomStore;
    /**
     * FIX-12 §07 §3: SlabSystemTypeStore — needed to persist custom slab assembly types.
     * Optional for backward compat; when absent, slabSystemTypes is omitted from snapshot.
     */
    slabSystemTypeStore?: SlabSystemTypeStore;
    /**
     * FIX-3 (M9): WallSystemTypeStore — needed to persist custom wall assembly types.
     * Optional for backward compat; when absent, wallSystemTypes is omitted from snapshot.
     */
    wallSystemTypeStore?: WallSystemTypeStore;
    /** CeilingStore — optional for backward compat. */
    ceilingStore?: CeilingStore;
    /** CeilingSystemTypeStore — needed to persist custom ceiling assembly types. */
    ceilingSystemTypeStore?: CeilingSystemTypeStore;
    /** FloorStore — optional for backward compat. */
    floorStore?: import('@pryzm/core-app-model/stores').FloorStore;
    /** FloorSystemTypeStore — needed to persist custom floor assembly types. */
    floorSystemTypeStore?: import('@pryzm/core-app-model/stores').FloorSystemTypeStore;
}

export class ProjectSerializer {
    /**
     * Serialize the current live project state to a plain-JSON snapshot.
     * This method ONLY READS from stores — it never writes to any store,
     * calls any builder, or publishes any event.
     */
    static serialize(
        stores: ProjectStores,
        _bimManager: BimManager,
        opts: { projectName?: string; projectId?: string; versionLabel?: string } = {}
    ): ProjectSnapshot {
        const {
            wallStore, slabStore, columnStore, gridStore, stairStore,
            beamStore, curtainWallStore, roofStore, plumbingStore,
            furnitureStore, handrailStore, openingStore, roomStore,
            slabSystemTypeStore, wallSystemTypeStore, ceilingStore, ceilingSystemTypeStore,
            floorStore, floorSystemTypeStore,
        } = stores;

        const levels = wallStore.getLevels().map(l => ({ ...l }));
        const grids = gridStore.getAll().map(g => ({ ...g }));
        const walls = wallStore.getAll().map(serializeWall);
        // B7a: Serialize from the first-class DoorStore/WindowStore (Phase B).
        // These are plain objects — no THREE.js class stripping required.
        const windows = windowStore.getAll().map(w => ({ ...w }));
        const doors = doorStore.getAll().map(d => ({ ...d }));
        const slabs = slabStore.getAll().map(serializeSlab);
        const columns = columnStore.getAll().map(serializeColumn);
        const stairs = stairStore.getAll().map(serializeStair);
        const beams = beamStore.getAll().map(serializeBeam);
        const curtainWalls = curtainWallStore.getAll().map(serializeCurtainWall);
        const roofs = roofStore.getAll().map(serializeRoof);
        const furniture = furnitureStore.getAll().map(serializeFurniture);
        const handrails = handrailStore.getAll().map(serializeHandrail);
        const plumbing = plumbingStore.getAll().map(serializePlumbing);
        const openings = openingStore.getAll().map(o => deepStrip(o));

        // Room subsystem — deepStrip removes any residual THREE.js references
        const rooms = roomStore ? roomStore.getAll().map(r => deepStrip(r)) : [];

        // Room Bounding Line subsystem — plain DTOs, no THREE.js references
        const roomBoundingLines = roomBoundingLineStore.getAll().map(l => ({ ...l }));

        // Ceiling subsystem — deepStrip removes any residual THREE.js references
        const ceilings = ceilingStore ? ceilingStore.getAll().map(c => deepStrip(c)) : [];
        const ceilingSystemTypes = ceilingSystemTypeStore
            ? ceilingSystemTypeStore.getAll()
                .filter(t => !ceilingSystemTypeStore.isBuiltIn(t.id))
                .map(t => structuredClone(t))
            : [];

        // Floor finish subsystem — deepStrip removes any residual THREE.js references
        const floors = floorStore ? floorStore.getAll().map(f => deepStrip(f)) : [];
        const floorSystemTypes = floorSystemTypeStore
            ? floorSystemTypeStore.getAll()
                .filter(t => !floorSystemTypeStore.isBuiltIn(t.id))
                .map(t => structuredClone(t))
            : [];

        // FIX-12 §07 §3: Persist only CUSTOM slab system types (built-ins are always
        // reconstructed from code). structuredClone ensures no frozen-object issues.
        const slabSystemTypes = slabSystemTypeStore
            ? slabSystemTypeStore.getAll()
                .filter(t => !slabSystemTypeStore.isBuiltIn(t.id))
                .map(t => structuredClone(t))
            : [];

        // FIX-3 (M9): Persist only CUSTOM wall system types (built-ins are always
        // reconstructed from code). structuredClone ensures no frozen-object issues.
        const wallSystemTypes = wallSystemTypeStore
            ? wallSystemTypeStore.getAll()
                .filter(t => !wallSystemTypeStore.isBuiltIn(t.id))
                .map(t => structuredClone(t))
            : [];

        // §M-H4 (DAILY-USE-AUDIT 2026-05-20) — Persist only CUSTOM door/window
        // finish types. The store's `isBuiltIn` field (vs the per-method
        // `isBuiltIn(id)` API on wall/slab/ceiling/floor) is a small surface
        // divergence we accept here rather than refactor 4 stores. Built-in
        // presets are re-seeded from code each boot, so omitting them keeps
        // snapshot size minimal. Structured-clone strips any frozen flag.
        const doorSystemTypes = doorSystemTypeStore.getAll()
            .filter(t => !t.isBuiltIn)
            .map(t => structuredClone(t));
        const windowSystemTypes = windowSystemTypeStore.getAll()
            .filter(t => !t.isBuiltIn)
            .map(t => structuredClone(t));

        const elementCount =
            walls.length + slabs.length + ceilings.length + floors.length + columns.length + stairs.length +
            beams.length + curtainWalls.length + roofs.length + furniture.length +
            handrails.length + plumbing.length + rooms.length;

        const snapshot: ProjectSnapshot = {
            schemaVersion: SNAPSHOT_SCHEMA_VERSION,
            timestamp: Date.now(),
            projectName: opts.projectName ?? 'Untitled Project',
            projectId: opts.projectId,
            versionLabel: opts.versionLabel,
            levels, grids, walls, windows, doors, slabs, columns,
            stairs, beams, curtainWalls, roofs, furniture, handrails,
            plumbing, openings, elementCount, rooms,
            roomBoundingLines: roomBoundingLines.length > 0 ? roomBoundingLines : undefined,
            ceilings: ceilings.length > 0 ? ceilings : undefined,
            ceilingSystemTypes: ceilingSystemTypes.length > 0 ? ceilingSystemTypes : undefined,
            floors: floors.length > 0 ? floors : undefined,
            floorSystemTypes: floorSystemTypes.length > 0 ? floorSystemTypes : undefined,
            slabSystemTypes: slabSystemTypes.length > 0 ? slabSystemTypes : undefined,
            wallSystemTypes: wallSystemTypes.length > 0 ? wallSystemTypes : undefined,
            // §M-H4 — custom door / window finish types
            doorSystemTypes:   doorSystemTypes.length   > 0 ? doorSystemTypes   : undefined,
            windowSystemTypes: windowSystemTypes.length > 0 ? windowSystemTypes : undefined,
            vgGovernance:    vgGovernanceStore.serialize()     as ProjectSnapshot['vgGovernance'],
            semanticTags:    semanticIndex.serialize()         as ProjectSnapshot['semanticTags'],
            viewDefinitions: viewDefinitionStore.serialize()   as ProjectSnapshot['viewDefinitions'],
            visibilityRules: visibilityRuleEngine.serialize()  as ProjectSnapshot['visibilityRules'],
            visibilityIntents: visibilityIntentStore.serialize() as ProjectSnapshot['visibilityIntents'],
            viewIntentInstances: viewIntentInstanceStore.serialize() as ProjectSnapshot['viewIntentInstances'],

            // Data Platform — Phase 4 (schema v2)
            // All three blocks are always written, even when empty, so MigrationEngine
            // never needs to backfill them on the next round-trip.
            hierarchy: {
                version: 1,
                nodes: hierarchyStore.serialize(),
            },
            templates: {
                version: 1,
                templates: templateStore.serialize(),
                assignments: templateAssignmentStore.serialize(),
            },
            elementCodes: ((): ProjectSnapshot['elementCodes'] => {
                const { codes, counters } = elementCodeStore.serialize();
                return { version: 1, codes, counters };
            })(),

            // Phase D — D-1 (schema v3): Semantic graph relationships
            semanticGraph: semanticGraphManager.serialize(),

            // Phase G — G-1 (schema v4): Temporal graph (append-only mutation log)
            temporalGraph: temporalGraphManager.serialize(),

            // Phase G — G-3 (schema v4): Decision records (architect rationale)
            decisionRecords: decisionRecordStore.serialize(),

            // Phase L — L-1/L-2 (schema v5): TOMBSTONE.  The lifecycle /
            // maintenance stores were deleted at S70 D8 (SPEC-27 §4.3 +
            // ADR-030 Part D + ADR-0052 §B.7).  No bytes written here;
            // `lifecycle?` is re-introduced by the future `plugins/lifecycle/`
            // port.

            // Autonomous Auditor — Phase 0: Space-programme requirements brief
            requirements: ((): ProjectSnapshot['requirements'] => {
                const records = requirementStore.getAll().map(r => structuredClone(r as any));
                return { version: 1, records };
            })(),

            // Autonomous Auditor — Phase 3: Asset catalog
            assetCatalog: ((): ProjectSnapshot['assetCatalog'] => {
                const entries = assetCatalogStore.getAll().map(e => structuredClone(e as any));
                return { version: 1, entries };
            })(),

            // §31 Phase 2 — DXF/DWG underlays
            dxfOverlays: dxfOverlayStore.size() > 0
                ? dxfOverlayStore.serialize() as ProjectSnapshot['dxfOverlays']
                : undefined,

            // Phase III — Sheets (SheetDefinition records, viewports)
            sheets: sheetStore.serialize() as ProjectSnapshot['sheets'],

            // Phase III — Schedules (ScheduleDefinition records)
            schedules: scheduleStore.serialize() as ProjectSnapshot['schedules'],

            // §ANN-A2 — Annotations + Dimensions (all AnnotationElement and DimensionElement)
            annotations: (() => {
                const snap = annotationStore.serialize();
                return (snap.annotations.length > 0 || snap.dimensions.length > 0)
                    ? snap as ProjectSnapshot['annotations']
                    : undefined;
            })(),

            // ANNOTATION-SYSTEM-AUDIT-2026 A4 — ConstraintRecord persistence.
            annotationConstraints: (() => {
                const snap = constraintStore.serialize();
                return snap.records.length > 0
                    ? snap as ProjectSnapshot['annotationConstraints']
                    : undefined;
            })(),

            // ANNOTATION-SYSTEM-AUDIT-2026 B8 — Per-view annotation hide list.
            annotationVisibility: (() => {
                const json = annotationVisibilityStore.toJSON();
                return Object.keys(json).length > 0 ? json : undefined;
            })(),

            // ANNOTATION-SYSTEM-AUDIT-2026 B9 — OBC uuid → annotationId bridge map.
            obcAnnotationMap: (() => {
                const snap = obcAnnotationAdapter.serialize();
                return snap.entries.length > 0
                    ? snap as ProjectSnapshot['obcAnnotationMap']
                    : undefined;
            })(),
        };

        console.log(
            `[ProjectSerializer] Snapshot created: ${elementCount} elements, ` +
            `${levels.length} levels, ${walls.length} walls, ` +
            `${slabs.length} slabs, ${furniture.length} furniture`
        );

        return snapshot;
    }

    /** Stringify a snapshot — safe to call after serialize(). */
    static stringify(snapshot: ProjectSnapshot): string {
        return JSON.stringify(snapshot, null, 2);
    }

    /**
     * Parse a stored JSON string back to a ProjectSnapshot.
     *
     * Phase 3: integrates MigrationEngine so that snapshots at any prior
     * schemaVersion are automatically upgraded to SNAPSHOT_SCHEMA_VERSION
     * before being returned. The old warn-only path is replaced.
     */
    static parse(json: string): ProjectSnapshot {
        const raw = JSON.parse(json);

        if (MigrationEngine.needsMigration(raw)) {
            const fromV = MigrationEngine.getStoredVersion(raw);
            console.log(
                `[ProjectSerializer] Migrating snapshot: ` +
                `v${fromV} → v${SNAPSHOT_SCHEMA_VERSION}`
            );
        }

        return MigrationEngine.migrate(raw);
    }
}
