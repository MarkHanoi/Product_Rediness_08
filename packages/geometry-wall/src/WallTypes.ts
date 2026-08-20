import * as THREE from '@pryzm/renderer-three/three';
import { CoreElement } from '@pryzm/core-app-model';
import { Point3D } from '@pryzm/core-app-model';
import { VisualStyle } from '@pryzm/core-app-model/material-library';
import { WallStore } from './WallStore';
import type { WallProfile } from './WallProfile';
import type { OpeningProfileKind } from './OpeningProfile';

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
    CURVED_WALL = 'CURVED_WALL',
    // ⭐ §FEAT-WALL-SHAPE-MODES / L-1325 — CLOSED-LOOP RUNS. Two clicks produce N walls
    // forming a rectangular, circular or elliptical ROOM.
    //
    // ⚠ THESE ARE PLAN SHAPES, NOT FACE SHAPES, AND THE DISTINCTION IS LOAD-BEARING.
    // "Circular wall" means three different things in this repo: an ARC IN PLAN
    // (`wall.curve`, which exists), a wall whose FACE is a circle (`wallProfile`, which
    // also exists and is authorable), and a closed RUN of walls — these. See
    // `_wallLoopMode` in `WallPlanToolHandler` and C85 §WS-1 for the full argument.
    //
    // ⛔ These members were NOT minted when the plan surface shipped, deliberately: a
    // tool-mode the pipeline has no arm for is C84 EI-3 live. They land WITH the arm.
    RECTANGULAR_LOOP = 'RECTANGULAR_LOOP',
    CIRCULAR_LOOP = 'CIRCULAR_LOOP',
    ELLIPTICAL_LOOP = 'ELLIPTICAL_LOOP'
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

    /**
     * §OPENING-PROFILE (L-1200) — the void's SHAPE. Absent ⇒ `'rectangular'`, which is what every
     * opening authored before this field was is, so nothing needs migrating.
     *
     * ⭐ **THIS IS A SECOND, ORTHOGONAL AXIS — NOT a third member of `doorType`/`windowType`.**
     * Those two carry the LEAF COUNT (`'single' | 'double'`); this carries the VOID SHAPE. C86 §9
     * WO-Voc-4 forbids flattening them, because doing so makes `double × round-arch` — an ordinary
     * door — unexpressible, and would need one shape value written into BOTH leaf-count fields.
     *
     * It lives on the OPENING, i.e. on the HOST's record, because the void is cut by the wall
     * (C15 §3.1) — which is also what lets a door and a window share one profile vocabulary
     * instead of minting two.
     *
     * ⚠ **THE BOUNDING BOX STAYS `width × height` FOR EVERY PROFILE, AND THERE IS NO `radius`
     * FIELD** (C86 §10.1 PR-8). A `circular` opening has `width === height` and its `width` IS the
     * diameter. That is not a stylistic choice: `WallOccupancyStore`'s span, the
     * §WINDOW-CORNER-OVERFLOW cap, `clampToWall`, the plan-symbol extent and the `WxH` size grammar
     * all already ask *"how wide is this hole?"* through `width`, and a second dimension vocabulary
     * would make every one of them learn a new way to ask one question.
     *
     * ⛔ Typed as the string union rather than `string` so an unrepresentable value cannot be
     * assigned; `resolveOpeningProfile()` is the tolerant reader for the LOAD path, where a value
     * from a newer build must degrade to a rectangle rather than brick the project.
     *
     * See `OpeningProfile.ts` for the single outline producer and the refusals.
     */
    openingProfile?: OpeningProfileKind;
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

// ─── §FEAT-WALL-SIDE-FINISH (founder ask: per-side finish material) ──────────
//
// THE SIDE THIS NAMES IS THE **SEMANTIC** SIDE, NOT A GEOMETRIC FACE.
//
// `WallData.frontSide` / `backSide` (below, §STEP6) name the two GEOMETRIC faces
// of the baseline and answer "which face points into the enclosed space". They
// are, measured 2026-08-18, written by NOTHING and read by NOTHING — three
// declaration sites (WallTypes, WallDataSchema, schemas/elements/Wall) and no
// producer, so at runtime they are `undefined`, not even the `'unknown'` the
// comment promises. A per-side finish MUST NOT be keyed on them.
//
// This vocabulary is keyed on the same axis the LAYER STACK already declares and
// the shipped `AddWallLayerBatchCommand` already uses: `'interior'` / `'exterior'`
// as an AUTHORED fact (`WallLayerFunction` is literally `'finish-interior'` /
// `'finish-exterior'`, and layer arrays are authored EXTERIOR-FIRST). Nothing
// here is inferred from winding order, camera direction or normals — a render-time
// heuristic is fine for cutaway shading and catastrophic for authored data.
export type WallFinishSide = 'interior' | 'exterior';

/** The two sides, in authored stack order (exterior-first), for iteration. */
export const WALL_FINISH_SIDES: readonly WallFinishSide[] = ['exterior', 'interior'];

/**
 * An authored finish assignment for ONE side of a wall.
 *
 * `materialId` references the `@pryzm/core-app-model` material library. Lane Y
 * owns that library's shape; this record stores the id only and resolves through
 * the library's read accessors, so a library re-org cannot orphan authored data.
 */
export interface WallSideFinish {
    /** Material library id, e.g. `'gypsum-skim'`. */
    materialId: string;
    /** Resolved '#rrggbb' snapshot so the render fast path needs no library read. */
    materialColor?: string;
    /** Display name snapshot, for schedules and the property panel. */
    materialName?: string;
}

/**
 * Per-side finish assignments, BESIDE the layer stack (see
 * `WallSideFinishResolver` for the precedence ladder and the reasoning).
 *
 * The two sides are SEPARATE OPTIONAL FIELDS on purpose: a single-layer
 * (`wt-monolithic`) wall — the type the founder draws with by default — has one
 * layer that is simultaneously the outermost layer on BOTH sides. Storing the
 * finish IN that layer would make interior and exterior the same value, i.e.
 * painting one face would silently paint the other. That is the exact failure a
 * naive "it round-trips" test passes.
 */
export interface WallSideFinishes {
    interior?: WallSideFinish;
    exterior?: WallSideFinish;
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

/**
 * §WALL-JOIN-INTENT (L-251) — what the author DID at each endpoint of a wall.
 *
 * See the `joinIntent` field on {@link WallData} for the full rationale. In short: a
 * mitred corner and a T-junction are the same geometry, so the resolver cannot tell them
 * apart. The authoring tool can. This is that signal, carried per endpoint.
 */
export type WallEndJoinIntent =
    /** Snapped onto an EXISTING committed junction — that junction is frozen, this wall adapts. */
    | 'butt'
    /** Continues a run — a collinear partner here is a genuine through-wall (square caps). */
    | 'through';

export interface WallJoinIntent {
    /** Intent at `baseLine[0]`. */
    start?: WallEndJoinIntent;
    /** Intent at `baseLine[1]`. */
    end?: WallEndJoinIntent;
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

    /**
     * §WALL-RAKE — the wall's lean, in DEGREES, measured from the FLOOR PLANE.
     *
     * **90 = vertical, and that is the default.** Absent ⇒ vertical: every wall
     * authored before this field existed loads as 90° and re-serialises without
     * the field, so old snapshots round-trip byte-for-byte.
     *
     * SIGN CONVENTION — stated here and in `WallRake.ts`, and NEVER re-derived
     * anywhere else. The angle is measured on the wall's LEFT side, where LEFT is
     * `leftPerp(direction) = (-d.z, d.x)` in plan-XZ (the same "left" that
     * `WallFootprint2D` and `JunctionResolverV2` already use). Below 90° the wall's
     * TOP leans toward its LEFT; above 90° it leans toward its RIGHT. The wall
     * pivots about its BASE centreline — `baseLine` never moves.
     *
     *     topOffset = height · cot(rakeAngleDeg) · leftPerp(direction)
     *
     * For a PLAIN wall `thickness` is the HORIZONTAL (plan) thickness, so its plan
     * footprint is unchanged at every angle and the junction solver, room detection
     * and opening-offset maths are untouched. The TRUE perpendicular thickness is
     * `thickness · sin(rakeAngleDeg)` — see `WallRake.perpendicularThickness`.
     *
     * ⚠ **THE PARAGRAPH ABOVE USED TO SAY THIS OF EVERY WALL, AND IT IS FALSE FOR A
     * LAYERED ONE** (corrected 2026-08-19, RK1). For a layered wall `thickness` is
     * `Σ layer.thickness` and **every term of that sum is a PERPENDICULAR thickness**,
     * so the stack occupies `thickness / sin θ` IN PLAN and the footprint DOES widen
     * with the rake. That is not an inconsistency to be tidied away — it is the only
     * reading under which an authored 12.5 mm board is 12.5 mm of board. The single
     * conversion is `WallRake.rakedPlanThickness`, and the single place the wall-level
     * decision is made is `WallPipelineV2.effectivePlanThickness`, which is why
     * `LevelWallSpec.layered` exists at all. Never re-derive either.
     *
     * REFUSED COMBINATIONS (C65 §3.9 — no affordance without an implementation).
     * ⚠ **THIS LIST WAS THREE ITEMS AND IS NOW ONE** (corrected 2026-08-19, RK1). It
     * read *"CURVED, LAYERED, or HOSTS OPENINGS"*. Two of those three shipped:
     * §FEAT-RAKE-LAYERED (a layered raked wall) and §RAKE-HOSTED-OPENING (a raked wall
     * hosting a door or window), both founder-confirmed, and **C85 §12 R-9 now forbids
     * re-refusing either**. A stale list here is not harmless — it is an invitation to
     * "restore" a refusal that a contract explicitly binds shut.
     *
     * What `WallRake.rakeAuthorability` actually refuses today is (a) an angle outside
     * `[RAKE_MIN_DEG, RAKE_MAX_DEG]`, (b) a CURVED wall, and (c) a wall with MORE THAN
     * ONE layer that ALSO hosts an opening. **Read the function, not this comment** —
     * it is the single gate, consulted by `WallDataSchema` (create), `WallStore.update`
     * and `WallStore.addOpening`.
     *
     * INSTANCE state, not TYPE state: a lean is a per-placement decision. Putting
     * it on the WallSystemType would make every wall of that type lean together
     * (C65 §3.6), which is never what an author means by one raked feature wall.
     */
    rakeAngleDeg?: number;

    /**
     * §WALL-PROFILE — the wall's authored ELEVATION OUTLINE, in the wall's own plane.
     * A closed ring of `{u, v}` vertices where `u` runs along the baseline from
     * `baseLine[0]` and `v` is height above the wall's base plane, both in metres and
     * both measured in the UN-SHEARED frame (so a profile and a rake compose).
     *
     * ABSENT ⇒ the implicit rectangle `[0, L] × [0, height]`, which is what every wall
     * ever authored is. That is the round-trip guarantee: an old snapshot loads as the
     * rectangle and re-serialises without the key (C47 §1.2 — additive optional field).
     *
     * A profile may only CUT the rectangle down; `height` remains the wall's bounding
     * height, so every consumer that already reads `height` stays correct.
     *
     * REFUSED COMBINATIONS (C65 §3.9 — no affordance without an implementation): a
     * profile is rejected at every write boundary on a CURVED wall, a LAYERED wall, or
     * a wall that HOSTS OPENINGS. See `WallProfile.profileAuthorability` for the
     * reasons — and note the curved refusal is UNBUILT, not ill-posed, which is a
     * different claim from rake's.
     *
     * INSTANCE state, not TYPE state: an outline is a per-placement decision, exactly
     * as a rake is (C65 §3.6).
     */
    wallProfile?: WallProfile;

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

    // ─── §WALL-JOIN-INTENT (L-251) — the authoring gesture, recorded ──────────
    //
    // WHY THIS FIELD EXISTS: A MITRED CORNER AND A T-JUNCTION ARE THE SAME GEOMETRY.
    //
    // Two collinear walls meeting a third at a node has two valid readings:
    //
    //   (1) a THROUGH-WALL plus a STEM   — the collinear pair is ONE straight wall,
    //       drawn in two segments, and the third wall tees into it. The through-pair
    //       must take SQUARE CAPS (§PASS-THROUGH-FLUSH). This is a T-junction.
    //
    //   (2) a MITRED CORNER plus a BUTTING NEWCOMER — two walls already meet in a
    //       committed mitred L, and a third arrives later, collinear with one arm.
    //       The corner must be FROZEN and the newcomer butts onto it (ADR-0055
    //       baseline immutability; the founder's L-122/L-251 invariant).
    //
    // These are indistinguishable from geometry alone — identical topology, identical
    // creation order, identical types. They differ ONLY in what the author MEANT.
    // L-122 tried to separate them by `systemTypeId` (different type ⇒ newcomer), and
    // that fails the moment the user draws everything with the DEFAULT wall type —
    // which is exactly what the founder does, and exactly why his mitre kept dying.
    //
    // No cleverer heuristic can fix that, because the information is not in the
    // geometry. It is in the GESTURE — and the tool knows the gesture: the snapping
    // layer knows whether this endpoint was snapped ONTO an existing junction (a
    // corner someone already committed) or drawn as a straight continuation of a run.
    // So we capture it at creation and pass it down, instead of asking the resolver
    // to guess. That is the whole fix.
    //
    //   'butt'    — this endpoint was snapped onto an EXISTING committed junction.
    //               Whatever is already there is frozen; THIS wall adapts to it.
    //   'through' — this endpoint continues a run (the author is extending a wall).
    //               A collinear partner here is a genuine pass-through: square caps.
    //   undefined — unknown/legacy. Behaviour is EXACTLY as before this field existed,
    //               so every pre-existing wall and every existing test is unaffected.
    //
    // Set at creation from the snap result; never inferred from geometry afterwards.
    joinIntent?: WallJoinIntent;
    // ─────────────────────────────────────────────────────────────────────────

    // ─── Contract §STEP6: Interior/Exterior side classification ──────────────
    // Pascal Pattern Area 5 (PascalWins.md §Area5).
    // Stamped by the Topology Layer (Phase 2) after enclosed-space analysis.
    // Default: 'unknown' — cutaway mode falls back to camera-to-face heuristic.
    // WallStore.add() preserves these fields as-is (callers may omit them).
    // WallStore.update() allows topology patches to stamp the side classification.
    frontSide?: WallSideClassification;
    backSide?:  WallSideClassification;
    // ⚠ MEASURED 2026-08-18 (§FEAT-WALL-SIDE-FINISH): the two fields directly
    // above have ZERO write sites and ZERO read sites in the entire repo. The
    // "Topology Layer (Phase 2)" named as their producer exists
    // (`packages/room-topology/src/TopologyLayer.ts`, wired at
    // `apps/editor/src/engine/initScene.ts:441`) but computes bounding-box
    // ADJACENCY only and is documented read-only, so it structurally cannot
    // stamp them. The count of walls carrying a resolved side classification is
    // therefore 0 — not "few", 0, and 0 by construction. `sideFinishes` below
    // is keyed on the SEMANTIC side instead, and never on these.
    // ─────────────────────────────────────────────────────────────────────────

    // ─── §FEAT-WALL-SIDE-FINISH: per-side finish material ────────────────────
    // Authored, persisted, and INDEPENDENT per side. Rung 1 of the ladder in
    // `WallSideFinishResolver.resolveWallSideFinish` — it overrides the finish
    // layer's own material when both are present, so the layer stack stays the
    // CONSTRUCTION truth and this stays the APPEARANCE truth (repainting a face
    // must not move it by 12mm, which an in-stack model would do: wall.thickness
    // must equal the layer sum, §03-WALL-THICKNESS-CONTRACT §1).
    sideFinishes?: WallSideFinishes;
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