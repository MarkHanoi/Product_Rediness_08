/**
 * SnapshotStreaming — Phase 8 foundation
 * (PROJECT-LOAD-PERFORMANCE-13-PHASE-IMPLEMENTATION-PLAN.md §9)
 *
 * Pure-data plane that splits a single ProjectSnapshot into:
 *   • a SnapshotHeader   — project meta + level/grid skeleton + non-element subsystems
 *   • a Map<levelId, LevelChunk> — one chunk per level, holding only that level's elements
 *   • an _orphan LevelChunk     — elements with no resolvable levelId (legacy fallback)
 *
 * And the inverse merger that reconstructs the snapshot.
 *
 * SCOPE — Phase 8 conservative (FOUNDATION ONLY):
 *   ✅ Pure functions, no I/O, no consumers in production code (tree-shaken).
 *   ✅ Type-safe SnapshotHeader / LevelChunk shapes.
 *   ✅ Within-chunk PlanOrdering preserved by category order:
 *      walls → slabs → stairs → beams → furniture → columns → curtainWalls
 *      → roofs → handrails → plumbing → windows → doors → openings → spatial.
 *      Hosted openings already travel inside wall.openings (see ProjectSerializer
 *      L402 — `openings: Array.isArray(wall.openings) ? ...`), so chunking by
 *      wall.levelId structurally guarantees opening→host-wall ordering.
 *   ✅ Round-trip determinism: split→merge yields a snapshot with the same
 *      schemaVersion / element counts / per-element identity as input.
 *
 *   ❌ DEFERRED to Phase 8-extension (needs Contract 13 + 20 amendment first):
 *      • Server endpoint split (`/latest-version/header` + `/level/:levelId`).
 *      • New `project_versions_levels` Postgres/Supabase table + dual-write.
 *      • `ProjectLoader.loadHeader()` / `loadLevel(levelId)` async streaming.
 *      • `PlatformShell.loadStreamingFromServer(projectId)`.
 *      • New event `pryzm-project-level-loaded(levelId)` (Contract 20 §4.1).
 *      • Camera-fit-on-first-tier-only enforcement (Contract 20 §6 INVARIANT,
 *        §18.2 critique #1) — must live in the streaming load path, not here.
 *      • Cancellation predicate propagation through every chunk handler
 *        (§18.2 critique #2) — likewise belongs in the streaming load path.
 *
 * RATIONALE: same conservative pattern as Phase 5/6/7 — land an auditable,
 * type-safe data plane that exercises zero runtime code paths until a follow-up
 * commit (Phase 8-extension after Contract 13 + 20 amendments) wires the
 * server endpoints, loader streaming, and PlatformShell streaming entry point.
 */

import type { ProjectSnapshot } from './ProjectSerializer';
import { SNAPSHOT_SCHEMA_VERSION } from './ProjectSerializer';

// ─── Header shape ──────────────────────────────────────────────────────────
//
// Carries everything that is NOT a per-level element array. The active client
// fits the camera to header.levels (just elevations + a default footprint) and
// shows the empty level boxes immediately, before any chunk arrives.

export interface SnapshotHeader {
    schemaVersion: number;
    timestamp: number;
    projectName: string;
    projectId?: string;
    versionLabel?: string;
    elementCount: number;

    /** Level + grid skeleton — what the camera fits to on first paint. */
    levels: any[];
    grids: any[];

    /** Non-element subsystem state (governance, view system, hierarchy, …). */
    vgGovernance?: ProjectSnapshot['vgGovernance'];
    semanticTags?: ProjectSnapshot['semanticTags'];
    viewDefinitions?: ProjectSnapshot['viewDefinitions'];
    visibilityRules?: ProjectSnapshot['visibilityRules'];
    visibilityIntents?: ProjectSnapshot['visibilityIntents'];
    viewIntentInstances?: ProjectSnapshot['viewIntentInstances'];

    /** Custom system-type registries (built-ins are always reseeded from code). */
    ceilingSystemTypes?: ProjectSnapshot['ceilingSystemTypes'];
    floorSystemTypes?: ProjectSnapshot['floorSystemTypes'];
    slabSystemTypes?: ProjectSnapshot['slabSystemTypes'];
    wallSystemTypes?: ProjectSnapshot['wallSystemTypes'];

    /** Data-platform v2+. */
    hierarchy?: ProjectSnapshot['hierarchy'];
    templates?: ProjectSnapshot['templates'];
    elementCodes?: ProjectSnapshot['elementCodes'];
    semanticGraph?: ProjectSnapshot['semanticGraph'];
    temporalGraph?: ProjectSnapshot['temporalGraph'];
    decisionRecords?: ProjectSnapshot['decisionRecords'];
    lifecycle?: ProjectSnapshot['lifecycle'];
    requirements?: ProjectSnapshot['requirements'];
    assetCatalog?: ProjectSnapshot['assetCatalog'];

    /** §31 Phase 2 — DXF/DWG underlay overlays. */
    dxfOverlays?: ProjectSnapshot['dxfOverlays'];

    /** Phase III — Sheet + schedule subsystems. */
    sheets?: ProjectSnapshot['sheets'];
    schedules?: ProjectSnapshot['schedules'];

    /** §ANN-A2 + A4 + B8 + B9 — annotation subsystem state. */
    annotations?: ProjectSnapshot['annotations'];
    annotationConstraints?: ProjectSnapshot['annotationConstraints'];
    annotationVisibility?: ProjectSnapshot['annotationVisibility'];
    obcAnnotationMap?: ProjectSnapshot['obcAnnotationMap'];

    /** §IFC-STORE-1 — IFC import registry. */
    ifcImports?: ProjectSnapshot['ifcImports'];
}

// ─── Level chunk shape ─────────────────────────────────────────────────────
//
// One per level. Element arrays appear in PlanOrdering category order so the
// loader can append them sequentially without breaking host-dependency rules.
// Hosted openings already travel inside wall.openings — they are NOT replicated
// at chunk top level.

export interface LevelChunk {
    levelId: string;

    // PlanOrdering 20 — structural shells first.
    walls: any[];
    // PlanOrdering 21 — slabs need walls present (host-bearing checks, slab edges).
    slabs: any[];
    // PlanOrdering 22+ — vertical circulation + secondary structure.
    stairs: any[];
    beams: any[];
    columns: any[];
    // PlanOrdering 23 — interior content.
    furniture: any[];
    // PlanOrdering 24-ish — façade + roof shells.
    curtainWalls: any[];
    roofs: any[];
    // PlanOrdering 25+ — code-required guarding + MEP.
    handrails: any[];
    plumbing: any[];

    // Top-level peripheral indexes for hosted elements. The authoritative copy
    // of each opening lives inside wall.openings; these arrays may also be
    // populated by some snapshots as a flat index. Loaded AFTER walls.
    windows: any[];
    doors: any[];
    openings: any[];

    // Spatial / virtual partition elements (level-scoped).
    rooms?: any[];
    ceilings?: any[];
    floors?: any[];
    roomBoundingLines?: any[];
}

// ─── Split result ──────────────────────────────────────────────────────────

export interface SnapshotSplitResult {
    header: SnapshotHeader;
    /** Keyed by levelId; iteration order matches header.levels order. */
    levelChunks: Map<string, LevelChunk>;
    /**
     * Elements that arrived without a resolvable levelId. Preserved verbatim
     * so the inverse merger is lossless. Should be empty for well-formed
     * snapshots; non-empty only for legacy / partially-migrated data.
     */
    orphan: LevelChunk;
}

// ─── Internal helpers ──────────────────────────────────────────────────────

function emptyChunk(levelId: string): LevelChunk {
    return {
        levelId,
        walls: [], slabs: [], stairs: [], beams: [], columns: [],
        furniture: [], curtainWalls: [], roofs: [], handrails: [], plumbing: [],
        windows: [], doors: [], openings: [],
    };
}

/**
 * Picks the right chunk for a single element. Returns the orphan chunk if the
 * element has no levelId or its levelId is not present in `levelChunks`.
 */
function bucketFor(
    element: any,
    levelChunks: Map<string, LevelChunk>,
    orphan: LevelChunk,
): LevelChunk {
    const levelId = element?.levelId;
    if (typeof levelId !== 'string' || levelId.length === 0) return orphan;
    const chunk = levelChunks.get(levelId);
    return chunk ?? orphan;
}

// ─── Public API: split ─────────────────────────────────────────────────────

/**
 * Pure: takes a serialized ProjectSnapshot, returns the per-level split.
 * Does NOT mutate `snap`. Element references are shared (not deep-cloned) —
 * callers that need isolation must clone before/after.
 */
export function splitSnapshotByLevel(snap: ProjectSnapshot): SnapshotSplitResult {
    if (!snap || typeof snap !== 'object') {
        throw new Error('[SnapshotStreaming] splitSnapshotByLevel: snapshot is not an object');
    }

    const header: SnapshotHeader = {
        schemaVersion: snap.schemaVersion,
        timestamp: snap.timestamp,
        projectName: snap.projectName,
        projectId: snap.projectId,
        versionLabel: snap.versionLabel,
        elementCount: snap.elementCount,
        levels: Array.isArray(snap.levels) ? snap.levels : [],
        grids: Array.isArray(snap.grids) ? snap.grids : [],
        vgGovernance: snap.vgGovernance,
        semanticTags: snap.semanticTags,
        viewDefinitions: snap.viewDefinitions,
        visibilityRules: snap.visibilityRules,
        visibilityIntents: snap.visibilityIntents,
        viewIntentInstances: snap.viewIntentInstances,
        ceilingSystemTypes: snap.ceilingSystemTypes,
        floorSystemTypes: snap.floorSystemTypes,
        slabSystemTypes: snap.slabSystemTypes,
        wallSystemTypes: snap.wallSystemTypes,
        hierarchy: snap.hierarchy,
        templates: snap.templates,
        elementCodes: snap.elementCodes,
        semanticGraph: snap.semanticGraph,
        temporalGraph: snap.temporalGraph,
        decisionRecords: snap.decisionRecords,
        lifecycle: snap.lifecycle,
        requirements: snap.requirements,
        assetCatalog: snap.assetCatalog,
        dxfOverlays: snap.dxfOverlays,
        sheets: snap.sheets,
        schedules: snap.schedules,
        annotations: snap.annotations,
        annotationConstraints: snap.annotationConstraints,
        annotationVisibility: snap.annotationVisibility,
        obcAnnotationMap: snap.obcAnnotationMap,
        ifcImports: snap.ifcImports,
    };

    // Pre-create one chunk per declared level, in declared order.
    const levelChunks = new Map<string, LevelChunk>();
    for (const lvl of header.levels) {
        const id = lvl?.id;
        if (typeof id === 'string' && id.length > 0 && !levelChunks.has(id)) {
            levelChunks.set(id, emptyChunk(id));
        }
    }
    const orphan = emptyChunk('__orphan__');

    // Bucket every element by its levelId.
    const route = (arr: any[] | undefined, key: keyof LevelChunk): void => {
        if (!Array.isArray(arr)) return;
        for (const el of arr) {
            const chunk = bucketFor(el, levelChunks, orphan);
            (chunk[key] as any[]).push(el);
        }
    };

    route(snap.walls,        'walls');
    route(snap.slabs,        'slabs');
    route(snap.stairs,       'stairs');
    route(snap.beams,        'beams');
    route(snap.columns,      'columns');
    route(snap.furniture,    'furniture');
    route(snap.curtainWalls, 'curtainWalls');
    route(snap.roofs,        'roofs');
    route(snap.handrails,    'handrails');
    route(snap.plumbing,     'plumbing');
    route(snap.windows,      'windows');
    route(snap.doors,        'doors');
    route(snap.openings,     'openings');

    // Optional spatial subsystems — same bucketing rule.
    const routeOptional = (arr: any[] | undefined, key: 'rooms' | 'ceilings' | 'floors' | 'roomBoundingLines'): void => {
        if (!Array.isArray(arr)) return;
        for (const el of arr) {
            const chunk = bucketFor(el, levelChunks, orphan);
            const target = (chunk[key] ??= []);
            target.push(el);
        }
    };
    routeOptional(snap.rooms,             'rooms');
    routeOptional(snap.ceilings,          'ceilings');
    routeOptional(snap.floors,            'floors');
    routeOptional(snap.roomBoundingLines, 'roomBoundingLines');

    return { header, levelChunks, orphan };
}

// ─── Public API: merge ─────────────────────────────────────────────────────

/**
 * Pure inverse: takes a header + level chunks, returns a single ProjectSnapshot
 * suitable for handing to the legacy `ProjectLoader.load()` path. Iteration
 * order of `chunks` determines the order of elements in the output arrays;
 * pass header.levels order for deterministic round-trips.
 *
 * The orphan chunk (if any) is appended LAST so legacy unleveled elements
 * survive a split→merge round trip without identity loss.
 */
export function mergeSnapshotFromHeaderAndLevels(
    header: SnapshotHeader,
    chunks: Iterable<LevelChunk>,
    orphan?: LevelChunk,
): ProjectSnapshot {
    if (!header || typeof header !== 'object') {
        throw new Error('[SnapshotStreaming] mergeSnapshotFromHeaderAndLevels: header is not an object');
    }

    // Sanity-check schema version. We refuse to merge across schema versions —
    // upgrades must run a migration BEFORE the merge step.
    if (header.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
        // Not fatal — legacy snapshots may carry an older version that the
        // ProjectLoader migration path will upgrade. We just warn loudly so
        // any cross-version drift is visible in the console.
        // eslint-disable-next-line no-console
        console.warn(
            `[SnapshotStreaming] merge: header.schemaVersion=${header.schemaVersion} ` +
            `but current SNAPSHOT_SCHEMA_VERSION=${SNAPSHOT_SCHEMA_VERSION}. ` +
            `Caller must run snapshot migration before/after this step.`,
        );
    }

    const out: ProjectSnapshot = {
        schemaVersion: header.schemaVersion,
        timestamp: header.timestamp,
        projectName: header.projectName,
        projectId: header.projectId,
        versionLabel: header.versionLabel,
        levels: Array.isArray(header.levels) ? [...header.levels] : [],
        grids: Array.isArray(header.grids) ? [...header.grids] : [],
        walls: [],
        windows: [],
        doors: [],
        slabs: [],
        columns: [],
        stairs: [],
        beams: [],
        curtainWalls: [],
        roofs: [],
        furniture: [],
        handrails: [],
        plumbing: [],
        openings: [],
        elementCount: header.elementCount,
        roomBoundingLines: undefined,
        vgGovernance: header.vgGovernance,
        semanticTags: header.semanticTags,
        viewDefinitions: header.viewDefinitions,
        visibilityRules: header.visibilityRules,
        visibilityIntents: header.visibilityIntents,
        viewIntentInstances: header.viewIntentInstances,
        rooms: undefined,
        ceilings: undefined,
        ceilingSystemTypes: header.ceilingSystemTypes,
        floors: undefined,
        floorSystemTypes: header.floorSystemTypes,
        slabSystemTypes: header.slabSystemTypes,
        wallSystemTypes: header.wallSystemTypes,
        hierarchy: header.hierarchy,
        templates: header.templates,
        elementCodes: header.elementCodes,
        semanticGraph: header.semanticGraph,
        temporalGraph: header.temporalGraph,
        decisionRecords: header.decisionRecords,
        lifecycle: header.lifecycle,
        requirements: header.requirements,
        assetCatalog: header.assetCatalog,
        dxfOverlays: header.dxfOverlays,
        sheets: header.sheets,
        schedules: header.schedules,
        annotations: header.annotations,
        annotationConstraints: header.annotationConstraints,
        annotationVisibility: header.annotationVisibility,
        obcAnnotationMap: header.obcAnnotationMap,
        ifcImports: header.ifcImports,
    };

    const sink = (chunk: LevelChunk): void => {
        if (chunk.walls.length)        out.walls.push(...chunk.walls);
        if (chunk.slabs.length)        out.slabs.push(...chunk.slabs);
        if (chunk.stairs.length)       out.stairs.push(...chunk.stairs);
        if (chunk.beams.length)        out.beams.push(...chunk.beams);
        if (chunk.columns.length)      out.columns.push(...chunk.columns);
        if (chunk.furniture.length)    out.furniture.push(...chunk.furniture);
        if (chunk.curtainWalls.length) out.curtainWalls.push(...chunk.curtainWalls);
        if (chunk.roofs.length)        out.roofs.push(...chunk.roofs);
        if (chunk.handrails.length)    out.handrails.push(...chunk.handrails);
        if (chunk.plumbing.length)     out.plumbing.push(...chunk.plumbing);
        if (chunk.windows.length)      out.windows.push(...chunk.windows);
        if (chunk.doors.length)        out.doors.push(...chunk.doors);
        if (chunk.openings.length)     out.openings.push(...chunk.openings);
        if (chunk.rooms?.length)             { (out.rooms ??= []).push(...chunk.rooms); }
        if (chunk.ceilings?.length)          { (out.ceilings ??= []).push(...chunk.ceilings); }
        if (chunk.floors?.length)            { (out.floors ??= []).push(...chunk.floors); }
        if (chunk.roomBoundingLines?.length) { (out.roomBoundingLines ??= []).push(...chunk.roomBoundingLines); }
    };

    for (const chunk of chunks) sink(chunk);
    if (orphan) sink(orphan);

    return out;
}
