import * as THREE from '@pryzm/renderer-three/three';
import { CoreElement } from '@pryzm/core-app-model';
import { Point3D } from '@pryzm/core-app-model';
import { VisualStyle } from '@pryzm/core-app-model/material-library';
import { WallStore } from './WallStore';

export enum WallToolState {
    IDLE = 'IDLE',
    DRAWING = 'DRAWING',
    PLACING_WINDOW = 'PLACING_WINDOW'
}

export enum WallDrawingMode {
    SINGLE = 'SINGLE',
    POLYLINE = 'POLYLINE',
    POLYLINE_ARC = 'POLYLINE_ARC',
    POLYLINE_MIXED = 'POLYLINE_MIXED',
    POLYLINE_MIXED_2 = 'POLYLINE_MIXED_2',
    LINE_ORTHO = 'LINE_ORTHO',
    POLYLINE_ORTHO = 'POLYLINE_ORTHO',
    // Contract §03-1.2: True curved walls (quadratic Bézier arcs with single wall descriptor)
    CURVED_WALL = 'CURVED_WALL'
}

export interface Level {
    id: string;
    name: string;
    elevation: number;
    height: number;
    childrenIds: string[];
}

export interface Opening {
    id: string;
    type: 'window' | 'door';
    doorType?: 'single' | 'double';
    windowType?: 'single' | 'double';
    offset: number;
    width: number;
    height: number;
    sillHeight: number; // REQUIRED - geometry generation depends on it
    elementId: string; // REQUIRED — spatial registration depends on this being present
}

export interface WindowData extends CoreElement {
    type: 'window';
    windowType?: 'single' | 'double';
    wallId: string;
    openingId: string;
    width: number;
    height: number;
    sillHeight: number;
    offset: number;
    frameThickness: number;
    frameWidth: number;
    frameColor?: string;
    /** IFC / BIM fire-resistance rating (e.g. "30min", "60min"). */
    fireRating?: string;
    anchor?: {
        t: number;        // 0–1 along wall baseline
        offset: number;   // lateral offset
        sillHeight: number;
    };
}

export interface DoorData extends CoreElement {
    type: 'door';
    doorType?: 'single' | 'double';
    wallId: string;
    openingId: string;
    width: number;
    height: number;
    sillHeight: number;
    offset: number;
    frameThickness: number;
    frameWidth: number;
    frameColor?: string;
    leafColor?: string;
    /** IFC / BIM fire-resistance rating (e.g. "30min", "60min", "FD30"). */
    fireRating?: string;
    /** Accessibility classification (e.g. "standard", "accessible", "powered"). */
    accessibilityType?: string;
    anchor?: {
        t: number;        // 0–1 along wall baseline
        offset: number;   // lateral offset
        sillHeight: number;
    };
}

export interface FragmentEntityMapping {
    fragmentId: string;
    elementId: string;
    type: 'wall' | 'window' | 'door';
    entityType?: string;
    entityId?: string;
}

// Explicit baseline type for contract clarity
// Phase B DTO migration: Point3D replaces THREE.Vector3 in store layer.
// Builders reconstruct THREE.Vector3 from Point3D at render time only.
export type WallBaseline = [Point3D, Point3D];

// ─── Contract §03-1.3: Wall layer types ──────────────────────────────────────
// Defined here (WallTypes) so WallData.layers, WallSystemTypeStore, and
// CreateWallCommand all import from a single source of truth.

export type WallLayerFunction =
    | 'finish-exterior'
    | 'substrate'
    | 'insulation'
    | 'air-barrier'
    | 'structure'
    | 'finish-interior';

export interface WallLayer {
    name: string;
    function: WallLayerFunction;
    /** Thickness in metres. Must be > 0. */
    thickness: number;
    materialId?: string;
    /** Fallback hex colour for preview. Defaults to #cccccc. */
    materialColor?: string;
}
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Contract §03-1.2 curved-wall placement descriptor.
 *
 * When present on WallData, the wall is a quadratic-Bezier arc between
 * baseLine[0] and baseLine[1] via `control` (all in world-XZ plane).
 * `segments` controls tessellation resolution for geometry and arc-length
 * queries.  Absence of this field means the wall is straight.
 *
 * Serialisation: control is stored as { x, y, z } plain object so that
 * structuredClone / JSON round-trips work without Vector3 prototype.
 * Builders reconstruct THREE.Vector3 from it at build time.
 */
export interface WallCurve {
    /** Quadratic Bezier control point (world space, XZ plane). */
    control: { x: number; y: number; z: number };
    /**
     * Number of linear segments used to tessellate the arc.
     * Minimum 4, recommended 16–32 for smooth curves.
     */
    segments: number;
}

// ─── Contract §STEP6: Interior/Exterior side detection ───────────────────────
// Pascal Pattern Area 5 (PascalWins.md §Area5).
// frontSide/backSide indicate which face of the wall is interior and which is
// exterior. Computed by the Topology Layer (Phase 2) via enclosed-space analysis.
// Defaults to 'unknown' for all existing and new walls — fully backward compatible.
// Cutaway rendering uses this at render time; 'unknown' falls back to camera-to-face
// direction as a temporary heuristic until topology analysis is available.
export type WallSideClassification = 'interior' | 'exterior' | 'unknown';
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Contract §03-1.1 system metadata block.
 * Stamped by WallStore.add(); never supplied by callers.
 * Incremented by WallStore.update() on every semantic change.
 */
export interface WallMetadata {
    createdAt: number;
    modifiedAt: number;
    createdBy: string;
    version: number;
    tags?: string[];
    description?: string;
}

export interface WallData extends CoreElement {
    type: 'wall';
    /**
     * The wall's start/end endpoints in world-XZ coordinates.
     *
     * §WALL-AUDIT-2026-M7 — Canonical convention for `baseLine[*].y`:
     * `y` is stored as `level.elevation` (i.e. the absolute world Y of the
     * wall's start/end), NOT relative-to-level (`0`). This deviates from the
     * §02 "store relative" convention and is intentional: every read site
     * (WallTool, WallFragmentBuilder, ProjectSerializer, WallJoinResolver,
     * SlabWallConnectivityService) currently treats `baseLine[*].y` as a
     * world-space value.
     *
     * Implication: if a level's elevation changes after a wall is saved, the
     * stored `baseLine[*].y` will be stale relative to the new elevation.
     * The WallFragmentBuilder always re-projects worldY from
     * `level.elevation + slabBaseOffset + baseOffset` at render time, so
     * geometry remains correct; only the persisted DTO value is misleading.
     *
     * Migration to relative `y === 0` is non-trivial (it touches the entire
     * read-site set listed above) and is intentionally deferred — see
     * audit P3 §M7. Update *all* read sites in lockstep if you change this
     * convention.
     */
    baseLine: WallBaseline; // Using explicit WallBaseline type

    /**
     * Contract §03-1.2: optional curve descriptor.
     * If present the wall is curved; if absent the wall is straight.
     * WallStore.add() preserves it as-is; WallStore.update() clones it.
     * Builders derive all geometry from this field — never from scene state.
     */
    curve?: WallCurve;

    height: number;
    thickness: number;
    baseOffset: number;

    levelId: string;
    parentId?: string;
    childrenIds: string[];

    openings: Opening[];

    materialId?: string;
    materialColor?: string;

    /**
     * Contract §03-1.1: mandatory metadata block — stamped by WallStore.add(), optional on construction.
     * Callers (CreateWallCommand, WallTool, etc.) must NOT supply this field.
     */
    metadata?: WallMetadata;

    // IFC metadata for BIM interoperability
    ifcData?: {
        guid: string;
        ifcClass: string;
    };

    // ─── Contract §03-1.3: Layered wall fields ───────────────────────────────
    // Both are optional — their absence means a plain single-layer wall, which
    // WallFragmentBuilder handles via its existing straight/curved code paths.
    // systemTypeId: the WallSystemType that was selected at creation time.
    //   Stored for display in the inspector; NOT used for geometry (layers is).
    // layers: frozen snapshot stamped by CreateWallCommand at execution time.
    //   The builder reads this; the store does not validate it.
    systemTypeId?: string;
    layers?: WallLayer[];
    // ─────────────────────────────────────────────────────────────────────────

    // ─── Contract §STEP6: Interior/Exterior side classification ──────────────
    // Pascal Pattern Area 5 (PascalWins.md §Area5).
    // Stamped by the Topology Layer (Phase 2) after enclosed-space analysis.
    // Default: 'unknown' — cutaway mode falls back to camera-to-face heuristic.
    // WallStore.add() preserves these fields as-is (callers may omit them).
    // WallStore.update() allows topology patches to stamp the side classification.
    frontSide?: WallSideClassification;
    backSide?:  WallSideClassification;
    // ─────────────────────────────────────────────────────────────────────────

    // ─── §VIEW-DIRTY-CHECK: Incremental render version ───────────────────────
    // Stamped by WallStore.updateWall(), addOpening(), and changeLevel() on every
    // genuine geometry-changing mutation.  WallFragmentBuilder.updateWall() compares
    // this against its _lastBuiltVersion map; if equal the rebuild is skipped.
    // Undefined on walls created before this field was introduced — the builder
    // treats undefined as "always rebuild" (safe conservative default).
    // Commands must NOT set this field directly; WallStore owns it.
    _renderVersion?: number;
    // ─────────────────────────────────────────────────────────────────────────

    // ─── §WALL-JOIN-SAVE-FIX: Pre-join (user-drawn) baseline ─────────────────
    // Written by EngineBootstrap._flushWallRebuild() immediately before it calls
    // store.update({ baseLine: trimmedBL }) for each wall in a join adjustment.
    // Captures the wall's baseLine as it existed BEFORE the join resolver trimmed
    // it, i.e. the last user-drawn (or drag-released) position.
    //
    // ProjectSerializer reads this field and serialises it as `baseLine` so that
    // reload gives the join resolver the original endpoints — not the already-trimmed
    // ones — guaranteeing idempotent re-resolution regardless of join type.
    //
    // EngineBootstrap owns this field; no Command should set it directly.
    _sourceBaseLine?: WallBaseline;
    // ─────────────────────────────────────────────────────────────────────────
}

export interface ISnapManager {
    snap(point: THREE.Vector3): THREE.Vector3;
    visualizeSnapPoint?(point: THREE.Vector3): void;
    clearSnapVisualization?(): void;
}

export interface ILevelProvider {
    getActiveLevel(): Level;
    getLevelById(id: string): Level | undefined;
    getActiveLevelId(): string;
}

export interface WallToolCallbacks {
    wallStore?: WallStore;
    applyHighlight: (obj: THREE.Object3D) => void;
    updateInspector: (obj: THREE.Object3D) => void;
    zoomToAll: () => Promise<void>;
    getHdriTexture: () => Promise<THREE.Texture | null>;
    getCurrentVisualStyle: () => VisualStyle;
    onWallCreated?: (wall: WallData) => void;
    onCancel?: () => void;
    /**
     * §1.1 FIX: Inject BimManager so WallTool and WallFragmentBuilder do not fall
     * back to window.bimManager. Optional during migration — window fallback
     * remains active until all callers supply this field.
     */
    bimManager?: any;
    /**
     * §1.1 FIX: Inject CommandManager so WallTool does not fall back to
     * commandManager inside createWall() and createWallsFromSlab().
     * Optional during migration — window fallback remains active until all callers
     * supply this field.
     */
    commandManager?: any;

    // ── §WALL-AUDIT-2026-W4: dependencies previously read from window globals ──
    /**
     * §WALL-AUDIT-2026-W4 — Curtain wall store passed to SnapManager so wall
     * snapping respects curtain wall geometry. Optional: when absent, curtain
     * wall snap candidates are simply omitted (snap to walls/grids still works).
     */
    curtainWallStore?: any;
    /**
     * §WALL-AUDIT-2026-W4 — Grid store passed to SnapManager so walls can snap
     * to BIM structural grids (orthogonal AND linear). Optional: when absent,
     * grid snap candidates are simply omitted.
     */
    gridStore?: any;
    /**
     * §WALL-AUDIT-2026-W4 — FastPathProjectorService used to project the live
     * wall preview onto the active 2D plan view (so users see the preview in
     * the right place when drawing in plan mode). Optional: when absent the
     * preview still renders in 3D world-space, just not projected onto the
     * 2D plan render target.
     */
    fastPathProjectorService?: any;
    /**
     * §WALL-AUDIT-2026-W4 — SelectionManager used by createFromSelectedSlab()
     * to read the currently selected slab. Optional: when absent, the caller
     * must pass `targetSlab` explicitly.
     */
    selectionManager?: any;
    /**
     * §WALL-AUDIT-2026-W4 — SlabTool used by createFromSelectedSlab() as a
     * fallback to read `slabTool.currentSlab` when the selection manager has
     * no slab selected. Optional.
     */
    slabTool?: any;

    // ── §WALL-AUDIT-2026-M2: view-projection stores injected via callbacks ──
    /**
     * §WALL-AUDIT-2026-M2 — ViewDefinitionStore consumed by WallFragmentBuilder
     * for the active 2D plan / RCP / section view definition lookup. Optional:
     * when absent the builder falls back to its no-op intent-resolution path
     * (3D-only rendering still works correctly). Replaces the
     * `window.viewDefinitionStore` read inside WallTool's constructor. // TODO(TASK-08)
     */
    viewDefinitionStore?: any;
    /**
     * §WALL-AUDIT-2026-M2 — ViewIntentInstanceStore consumed by WallFragmentBuilder
     * for per-view intent overrides (e.g. demolished-walls dashed line style).
     * Optional: when absent, intent resolution returns undefined and the builder
     * uses default geometry. Replaces the `window.viewIntentInstanceStore` // TODO(TASK-08)
     * read inside WallTool's constructor.
     */
    viewIntentInstanceStore?: any;
    /**
     * §WALL-AUDIT-2026-M2 — VisibilityIntentStore consumed by WallFragmentBuilder
     * for per-view element visibility (hide / dim / dashed). Optional: when absent
     * all walls render at full opacity. Replaces the
     * `window.visibilityIntentStore` read inside WallTool's constructor. // TODO(TASK-08)
     */
    visibilityIntentStore?: any;
    /**
     * E.5.x (E-bus.1) — Composed PryzmRuntime forwarded from initTools so
     * WallTool can dispatch wall.create / wall.createFromSlab through
     * runtime.bus.executeCommand() instead of the legacy commandManager.execute()
     * path.  Optional: when absent (or when the relevant handler is not yet
     * registered in the bus), WallTool falls back to commandManager.execute().
     */
    runtime?: import('@pryzm/runtime-composer').PryzmRuntime | null;
}