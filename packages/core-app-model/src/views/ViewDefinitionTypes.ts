/**
 * ViewDefinitionTypes — Phase B (base) + Phase VI (extended)
 *
 * Phase B fields are marked [B] — unchanged.
 * Phase VI additions are marked [VI] — all new fields are optional.
 *
 * Contract compliance:
 *   §01 §3.3  — ViewDefinitionStore implements an ElementStore-like interface
 *   §02        — All levelId references link to BimManager spatial authority
 *   §03 §1.1  — ViewDefinition is a first-class schema with stable fields;
 *                all fields are serialisable primitives or nested plain objects
 *   §04        — Serialisable; accessible via AIReadModel gateway
 *   §05        — Pure data types; no DOM, no Three.js, no rendering imports
 *   §07        — No server routes; client-side only
 *
 * Migration notes (Phase B → Phase VI):
 *   All new fields are optional. Phase B views deserialise without any new
 *   fields — the engine falls back to undefined, which means "use defaults".
 *   No existing field name or type has been changed.
 */

// §FEAT-DOOR-PLAN-SYMBOL-DETAIL-LEVEL (L-241) P1 — the Detail Level enum is owned
// by L0 `@pryzm/schemas` (P5: schemas are the single source of type truth). Type-
// only import: erased at build, so it adds no runtime edge from core-app-model.
import type { DetailLevel } from '@pryzm/schemas/view/detail-level';
// §FEAT-VIEW-OCCLUSION-DISPOSITION (L-279) — the ONE definition of what happens to an
// occluded line. Imported, never re-declared: a second copy of this union is exactly how
// `mullionThickness` became a second source of truth for the door mullion this morning.
import type { OcclusionDisposition, BeyondLineStyle } from '../drawing/DrawingZone';

/** Re-exported so consumers of the view types get the enum from one place. */
export type { DetailLevel };

// ── Phase C stub — lightweight rule reference stored on ViewDefinition ────────
// Full VisibilityRule objects live in VisibilityRuleEngine. ViewDefinition.rules
// holds only this reference so the store can list which rules are associated
// with a view without duplicating data.
export interface VisibilityRuleStub {                   // [B] unchanged
    id:      string;
    label?:  string;
    enabled: boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
// VIEW TYPE                                                              [VI]
// Extended union — all Phase B values remain valid.
// ═════════════════════════════════════════════════════════════════════════════

export type ViewType =
    // ── Phase B ──────────────────────────────────────────────────────────────
    | 'plan'              // Floor Plan — orthographic top-down
    | '3d'               // 3D view — perspective or orthographic orbit
    | 'section'          // Building section — orthographic cut through
    | 'elevation'        // Elevation — orthographic exterior/interior face
    | 'analysis'         // Analysis view — colour-coded by parameter value
    // ── Phase VI ─────────────────────────────────────────────────────────────
    | 'ceiling-plan'     // Reflected Ceiling Plan — looking upward
    | 'structural-plan'  // Structural framing plan (beams/columns from above)
    | 'detail'           // Callout / detail — enlarged region of a parent view
    | 'drafting'         // 2D annotation-only view (no model elements)
    | 'legend'           // Symbol legend view
    | 'render'           // High-fidelity render output view
    | 'walkthrough'      // Animated camera path (future)
    ;

/** All valid ViewType values — used for validation in commands. */
export const ALL_VIEW_TYPES: readonly ViewType[] = [
    'plan', '3d', 'section', 'elevation', 'analysis',
    'ceiling-plan', 'structural-plan', 'detail', 'drafting', 'legend', 'render', 'walkthrough',
] as const;

/** ViewType values that support ViewRangeSettings (plan-family views). */
export const PLAN_VIEW_TYPES: readonly ViewType[] = [
    'plan', 'ceiling-plan', 'structural-plan',
] as const;

// ═════════════════════════════════════════════════════════════════════════════
// SPATIAL CONTEXT                                                        [B]
// ═════════════════════════════════════════════════════════════════════════════

export interface ViewSpatialContext {                   // [B] unchanged
    /** Reference to a BimManager level — §02 spatial authority. */
    levelId?: string;
    /** Section cut plane — for section and elevation views. */
    sectionPlane?: {
        normal:   [number, number, number];
        constant: number;
    };
    /**
     * Loose 3D AABB hint — used for 3D/analysis views.
     * Superseded by ViewCropSettings.region for plan views.
     */
    boundingBox?: {
        min: [number, number, number];
        max: [number, number, number];
    };

    // ── 2D documentation pipeline fields (DOC-1.2) ───────────────────────────

    /**
     * Unit vector describing the projection direction for EdgeProjectorService.
     * Default (0,-1,0) = plan view (looking downward).
     * Use VIEW_PROJECTION_DIRECTIONS presets for standard orientations.
     * §02 §5: resolved at projection time, never stored as a THREE.Vector3.
     */
    projectionDirection?: { x: number; y: number; z: number };

    /**
     * Simplified vertical range for EdgeProjectorService.
     *
     * DOC-1.5d — DEFINITIVE REFERENCE FRAME CONTRACT:
     *   Both nearOffset and farOffset are measured IN METRES FROM THE LEVEL FLOOR ELEVATION.
     *   Level floor elevation = BimManager.getLevelById(levelId).elevation  (§02 §1.2).
     *
     *   nearOffset = distance above floor where the cut plane sits.
     *                Default: 1.2 m (standard AEC 1200 mm cut through doors/windows).
     *   farOffset  = distance above floor of the TOP of the view range.
     *                Default: 3.0 m (captures a full standard storey).
     *
     *   EdgeProjector clip planes (world-Y, Y-up right-handed):
     *     nearPlane = floorElevation + nearOffset   (cut plane — upper clipping boundary)
     *     farPlane  = floorElevation + farOffset    (top of view range — upper extent)
     *
     *   Elements with any geometry between [floorElevation, floorElevation + farOffset]
     *   are visible in projection. The cut plane at (floorElevation + nearOffset) is
     *   where walls, doors, and windows are "cut through" in plan view.
     *
     *   Elements above farOffset (e.g. beams at 3.5 m in a 4.0 m storey) are excluded
     *   from a standard plan. Use VIEW_RANGE_PRESETS.structural (farOffset: 4.0) to
     *   show ceiling beams.
     *
     *   For RCP views: projectionDirection is (0,+1,0); nearOffset/farOffset apply
     *   downward from the ceiling datum.
     *
     * Distinct from ViewRangeSettings (the interactive plan-view range — top/cut/bottom/depth
     * level-bound pairs). This field is the flat scalar window fed to the OBC EdgeProjector.
     */
    viewRange?: {
        nearOffset: number;
        farOffset:  number;
    };

    /**
     * World-space XZ crop window passed to EdgeProjectorService.
     * Enables detail-view projections that cover only a sub-region of the level.
     * Distinct from ViewCropSettings (interactive clipping) — this is the
     * geometry pre-filter applied before the OBC EdgeProjector runs.
     */
    cropRegion?: {
        minX: number;
        minZ: number;
        maxX: number;
        maxZ: number;
    };

    sectionVolume?: ViewSectionVolume;
}

/**
 * Geometry-only lens consumed by projection/visibility classification.
 * Presentation properties such as line weight, colour, fill, and overrides stay
 * outside this type and are resolved through the Visibility Intent pipeline.
 */
export type ViewGeometryLens = Pick<
    ViewSpatialContext,
    'levelId' | 'sectionPlane' | 'boundingBox' | 'projectionDirection' | 'viewRange' | 'cropRegion' | 'sectionVolume'
>;

export interface ViewSectionVolume {
    origin: [number, number, number];
    direction: [number, number, number];
    width: number;
    height: number;
    near: number;
    far: number;
}

// ── Preset projection direction vectors (DOC-1.2) ────────────────────────────
// Consumed by EdgeProjectorService; plain objects — no THREE.js imports.
// All vectors are unit-length and right-handed (PRYZM world: Y = up).
//
// ═══ §ELEV-SCOPE-FRAME (L-1854) — THE CARDINAL FRAME, STATED ONCE ═══
//
// Two of the six doc-comments below USED TO BE WRONG, and the wrong pair is what
// seeded a swapped East/West into `DEFAULT_ELEVATION_VIEWS` (founder, 2026-08-21:
// *"i am opening east elevation and it is showing me the wrong side"*). Read this
// derivation before editing either the vectors or their comments.
//
// THE FRAME — derived, not asserted. `PlanViewService.getViewConfig('top')` sets
// the plan camera to `dirVec = (0,-1,0)`, `upVec = (0,0,-1)`. For a three.js
// camera, screen-up is `up` and screen-right is `cross(up, -forward)`:
//     screen-up    = (0,0,-1) = -Z     → and screen-up in a plan IS NORTH
//     screen-right = cross((0,0,-1),(0,1,0)) = (1,0,0) = +X → EAST
// Therefore, for the whole editor:      -Z = NORTH   +X = EAST
//
// THE NAMING RULE — an elevation is named for the FAÇADE IT SHOWS, which is the
// façade NEAREST the viewer. The camera sits at `centre - direction * distance`
// (see `_elevationMarkPlacement`, which places the mark at `-dir * radius`), so:
//     viewer side = -direction        named façade = the -direction face
// e.g. direction (0,0,-1) ⇒ viewer at +Z ⇒ shows the +Z face ⇒ +Z is SOUTH ⇒
// "South elevation". That is `elevationFront`, and it is the row the founder
// confirms works.
//
// APPLYING THE SAME RULE TO X (this is the part that was inverted):
//     direction (-1,0,0) ⇒ viewer at +X ⇒ shows the +X face ⇒ EAST elevation
//     direction (+1,0,0) ⇒ viewer at -X ⇒ shows the -X face ⇒ WEST elevation
//
// CORROBORATED by two independent producers that were already correct and that
// `DEFAULT_ELEVATION_VIEWS` silently contradicted:
//   · `apps/editor/src/engine/initUI.ts` (generateElevations) — 'East Elevation'
//     is created with direction (-1,0,0) and the camera at `+distance` on X.
//   · `packages/ai-host/src/workflows/houseLayout/buildingElevations.ts` —
//     `{ direction: 'E', anchor: { x: maxX + offset }, facing: { x: -1, z: 0 } }`.
//
// ⚠ The NAMES `elevationLeft` / `elevationRight` describe the AXIS SIGN (-X / +X)
// and are correct as such. Do NOT "fix" this by flipping the vectors — other
// callers resolve a *preset* by name. The cardinal mapping belongs to the caller
// that names a compass direction, and there is exactly one: DEFAULT_ELEVATION_VIEWS.

export const VIEW_PROJECTION_DIRECTIONS = {
    /** Standard floor plan — looking downward along -Y. */
    plan:           { x:  0, y: -1, z:  0 },
    /** Reflected ceiling plan — looking upward along +Y. */
    ceilingPlan:    { x:  0, y:  1, z:  0 },
    /** Front elevation — looking along -Z; viewer at +Z, shows the +Z (SOUTH) face. */
    elevationFront: { x:  0, y:  0, z: -1 },
    /** Back elevation — looking along +Z; viewer at -Z, shows the -Z (NORTH) face. */
    elevationBack:  { x:  0, y:  0, z:  1 },
    /**
     * Left elevation — looking along -X; viewer at +X, shows the +X (EAST) face.
     * ⚠ Previously documented as "west face". That comment was the defect: it is
     * what mapped `East Elevation → elevationRight` in DEFAULT_ELEVATION_VIEWS.
     */
    elevationLeft:  { x: -1, y:  0, z:  0 },
    /**
     * Right elevation — looking along +X; viewer at -X, shows the -X (WEST) face.
     * ⚠ Previously documented as "east face". See `elevationLeft`.
     */
    elevationRight: { x:  1, y:  0, z:  0 },
} as const;

// ── §ELEV-SCOPE-DEPTH (L-1855) — ONE far-clip expression, TWO NAMED fallbacks ──
//
// THE DEFECT (founder, 2026-08-21: *"the sides are off - and the 'crop' is not
// present"*). The far clip of an elevation was resolved by TWO hand-copied
// expressions with DIFFERENT magic fallbacks:
//   · `EdgeProjectorService.resolveClipRange()` — `?? viewRange.farOffset ?? 200`
//   · the plan scope handle (`PlanViewInteraction._resolveSectionVolumeForDrag`,
//     `PlanViewAnnotationRenderer._scopeWorld`) — `?? 8`
// So an untouched elevation PROJECTED at 200 m (correct: the whole building) but
// DREW its depth handle at 8 m. The default elevation marks are seeded 24 m from
// the origin (`ELEV_MARK_RADIUS_M`), so 8 m does not reach the model at all — and
// the instant the user touched that handle the drag COMMITTED 8 m into
// `crop.farClip.offset`, collapsing the projector's far from 200 → 8 and slicing
// the building down to a slab. That is the founder's "Depth 8.00 m" → "Depth
// 0.47 m" sequence: the handle was never on the building to begin with.
//
// The two fallbacks are genuinely different QUESTIONS and are allowed to differ —
// but only deliberately, and only by name:
//   · UNCLIPPED  — "no far clip is stored, so clip nothing." A depth, not a UI.
//   · SCOPE HANDLE — "no far clip is stored, so where do we DRAW the grab handle?"
//     It must land past the building or the user cannot reach it.
// `resolveElevationFarDepth()` below is the single expression; the caller names
// which fallback it means. Never inline `?? 8` or `?? 200` again.

/**
 * Far-clip depth (metres) used when a section/elevation view stores none —
 * the "unclipped" stand-in for the PROJECTOR. Large enough to contain any
 * building we document.
 */
export const UNCLIPPED_ELEVATION_FAR_DEPTH_M = 200;

/**
 * Far-clip depth (metres) at which the PLAN SCOPE HANDLE is drawn for a view that
 * stores no far clip.
 *
 * ⚠ STAND-IN, stated as such. The honest value is "the distance from the mark's
 * depth plane to the far side of the model bounding box", which neither the L3
 * renderer nor the plan interaction can read today. 40 m is chosen so that the
 * handle clears a typical footprint measured from the 24 m default mark radius
 * (`ELEV_MARK_RADIUS_M`) — i.e. it OVERSHOOTS. Overshoot is the safe direction:
 * too far shows the whole building, too near silently slices it (that was the
 * defect). Exit condition: derive from model bounds and delete this constant.
 */
export const DEFAULT_ELEVATION_SCOPE_DEPTH_M = 40;

/**
 * The ONE far-clip resolution for a section/elevation view.
 *
 * `fallback` names which question is being asked — see the block comment above.
 * Both the projector and every scope-symbol producer MUST come through here so
 * they cannot drift apart again (C06 §13.3 — one producer per surface).
 */
export function resolveElevationFarDepth(
    viewDef: ElevationClipSource,
    fallback: number,
): number {
    return resolveElevationClipRange(viewDef, fallback).far;
}

// ── §CROP-IS-THE-CLIP (L-4500) — the crop rectangle IS the clip range ─────────
//
// THE DEFECT (founder, 2026-08-21): *"the elevation line ... really defines
// accurately the place of cut ... however the extension of it is not aligned with
// the further line of the square crop in plan view. The user should be able to
// absolutely and super accurately define the crop view, and this would/should
// define precisely what the elevation shows."*
//
// ONE elevation had THREE stores for its depth window and no expression that read
// all three, so "what the plan draws" and "what the projector clips" were computed
// from DIFFERENT fields:
//
//   · `crop.farClip.offset`      — written by the depth-handle drag AND by the
//                                   ViewPropertiesPanel "View Depth (m)" input.
//                                   READ by the projector (`resolveClipRange`).
//   · `spatial.sectionVolume.far`— written by the depth-handle drag and by
//                                   `CreateElevationMarkCommand`. READ by the plan
//                                   scope rectangle (`PlanViewAnnotationRenderer.
//                                   _scopeWorld`) and by the oriented section box.
//   · `spatial.viewRange.farOffset` — written by `roomInteriorElevations`.
//
// The drag happens to write the first two together, which is why dragging LOOKS
// right. **Typing a number into the panel writes only the FIRST**, so the panel
// moved the projector's far while the plan rectangle stayed put — a lying
// rectangle, the same defect shape as L-267 and L-1856, one field further along.
//
// THE INVARIANT, stated so it can be tested (see `elevationCropIsTheClip.test.ts`):
//
//     far  plane of an elevation/section == far  edge of its crop rectangle
//     near plane of an elevation/section == near edge of its crop rectangle
//
// This function is the ONE expression both sides call, so the invariant holds by
// CONSTRUCTION rather than by two producers agreeing. C06 §13.3 (one producer per
// surface); C24 (spatial crop) — the paper crop (C24.1) is a different window and
// is NOT resolved here.
//
// PRECEDENCE, and why the two ends differ:
//   far  — `crop.farClip.offset` first: it is the DEDICATED far-clip field, it is
//          the one the panel writes, and `sectionVolume.far` is the drag's mirror
//          of it. If the mirror won, a typed depth would be inert.
//   near — `sectionVolume.near` first: there is NO dedicated near-clip field, the
//          section volume's near IS the drawn near edge, and `viewRange.nearOffset`
//          means "cut height above the FLOOR" (a PLAN concept, DOC-1.5d) which has
//          no meaning in depth space. It is kept as a fallback only because
//          `roomInteriorElevations` writes it on views that carry no sectionVolume.

/** The fields any elevation/section clip resolution may read. Structural, so both
 *  L3 (`PlanViewAnnotationRenderer`) and L5 (`EdgeProjectorService`) can pass a
 *  `ViewDefinition` without importing each other. */
export interface ElevationClipSource {
    crop?: { farClip?: { offset?: number } };
    spatial?: {
        viewRange?: { nearOffset?: number; farOffset?: number };
        sectionVolume?: { near?: number; far?: number };
    };
}

/** A depth window along the projection direction, in metres from the view origin. */
export interface ElevationClipRange {
    /** Depth of the near plane. 0 = the cut plane itself. Never negative. */
    near: number;
    /** Depth of the far plane. Never less than `near`. */
    far: number;
}

/**
 * Minimum depth of an elevation/section clip window, in metres.
 *
 * ⚠ This is a DEGENERACY GUARD, not an offset — it must never be reachable from a
 * stored value, or it becomes exactly the kind of silent 100 mm term this whole
 * block exists to abolish. Measured 2026-08-22, every writer already clamps above
 * it: `PlanViewInteraction._applyScopeDragFromPointer` clamps the depth drag to
 * `near + 0.25`; `CreateElevationMarkCommand` clamps to `Math.max(0.5, …)` and
 * seeds 15 m on the fallback branch; `ViewPropertiesPanel`'s depth input clamps to
 * 0.25. It fires only for a hand-edited or corrupt document, where the alternative
 * is an elevation that shows nothing and a grab handle sitting on its own origin.
 *
 * It lives HERE, in the shared resolver, rather than in the plan renderer — which
 * is where it used to live, as `Math.max(near + 0.1, volume.far)`. A floor applied
 * on ONE side of the invariant is a disagreement generator; applied in the one
 * expression both sides call, it cannot separate them.
 */
export const MIN_ELEVATION_CLIP_DEPTH_M = 0.1;

/**
 * Outward margin, in metres, on the axis-aligned `spatial.cropRegion` box.
 *
 * ⚠ §CROP-IS-THE-CLIP (L-4500) — **`spatial.cropRegion` is NOT a clip range and is
 * NOT what an elevation is clipped to.** It is a cheap axis-aligned XZ AABB used
 * to CULL elements before the expensive edge pass, and
 * `NativeElementMeshExporter.exportForView` reads it **only** when
 * `resolveViewScope(viewType).planFamily` — for elevation/section it passes
 * `undefined` (see the §FIX-ELEVATION-CROP-CLIP note there: an XZ box mixes the
 * drawing-horizontal axis with the view DEPTH axis and would cull straddlers).
 *
 * The margin exists because culling on an exact boundary drops an element whose
 * own AABB merely touches it. Outward is the safe direction: too generous keeps a
 * few extra elements that later stages clip anyway; too tight deletes real
 * geometry from the drawing.
 *
 * ⭐ It is NAMED because it is the term that made an elevation's logged
 * `cropRegion` depth read ~0.10 m (= 2 × this) DEEPER than the logged `far`, in
 * every sample, which reads exactly like a clip-range defect and is not one.
 * If you are chasing a ~100 mm discrepancy between those two log fields, this
 * constant is the whole answer — see ISSUE-LOG L-4500.
 */
export const CROP_REGION_CULL_MARGIN_M = 0.05;

const _finiteOrUndefined = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/**
 * §CROP-IS-THE-CLIP (L-4500) — THE one near/far resolution for a section or
 * elevation view. Every producer of a depth window — the projector's clip planes,
 * the oriented section box, the plan scope rectangle, the drag seed — MUST come
 * through here. See the block comment above for precedence and the invariant.
 *
 * `fallbackFar` names the QUESTION being asked when nothing is stored:
 * `UNCLIPPED_ELEVATION_FAR_DEPTH_M` for "clip nothing",
 * `DEFAULT_ELEVATION_SCOPE_DEPTH_M` for "where do we draw the grab handle".
 */
export function resolveElevationClipRange(
    viewDef: ElevationClipSource,
    fallbackFar: number,
): ElevationClipRange {
    const near = Math.max(
        0,
        _finiteOrUndefined(viewDef.spatial?.sectionVolume?.near)
            ?? _finiteOrUndefined(viewDef.spatial?.viewRange?.nearOffset)
            ?? 0,
    );
    const storedFar =
        _finiteOrUndefined(viewDef.crop?.farClip?.offset)
        ?? _finiteOrUndefined(viewDef.spatial?.sectionVolume?.far)
        ?? _finiteOrUndefined(viewDef.spatial?.viewRange?.farOffset);
    const far = Math.max(near + MIN_ELEVATION_CLIP_DEPTH_M, storedFar ?? fallbackFar);
    return { near, far };
}

// ═════════════════════════════════════════════════════════════════════════════
// TEMPORAL CONTEXT                                                  [B + VI]
// ═════════════════════════════════════════════════════════════════════════════

export interface ViewTemporalContext {
    /** [B] Phase filter as literal string (Phase B). */
    phaseFilter?: 'Existing' | 'Demolition' | 'New Construction' | 'Future';
    /**
     * [VI] Reference to a named PhaseFilter entity (PhaseFilterStore, Phase VII).
     * Preferred over the literal phaseFilter string once Phase VII ships.
     * Both coexist during migration — engine reads phaseFilterId first.
     */
    phaseFilterId?: string;
    /**
     * [VI] The "current phase" of this view — the phase at which the project
     * is evaluated. Elements newer than this phase are shown according to
     * the active phase filter.
     */
    phase?: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE VI — OUTPUT SETTINGS
// Controls HOW the view is drawn — not WHAT is visible (that is rules[]).
// ═════════════════════════════════════════════════════════════════════════════

/** Visual rendering style for a view. Maps to PresentationEngine modes. */
export type ViewVisualStyle =
    | 'wireframe'        // Edges only, no surfaces
    | 'hiddenLine'       // Edges with hidden lines removed
    | 'shaded'           // Flat shaded surfaces
    | 'shadedWithEdges'  // Shaded + edge overlay (default for plan/section)
    | 'realistic'        // PBR materials with lighting
    ;

export interface ViewOutputSettings {
    /**
     * §FEAT-VIEW-OCCLUSION-DISPOSITION (L-279) — CLOSES C09 §4.6.7's FIRST OPEN CELL.
     *
     * What happens to a line that is genuinely OCCLUDED — a solid lies in front of it?
     *   'remove'  the span is deleted. The drawing shows only what you could see.
     *   'demote'  the span survives, reclassified to the HIDDEN zone — and HIDDEN is the
     *             ONE zone that dashes (C09 §4.6.4). You get a dashed ghost of what is
     *             behind the solid.
     *
     * WHY THIS FIELD HAD TO EXIST, AND WHY IT WAS AN HONEST GAP RATHER THAN A BUG:
     * C09 §4.6.5(b) says a VIEW must be able to choose. The engine ALREADY honoured
     * whatever it was handed, and `ViewScope` already carried a sensible default PER VIEW
     * TYPE (elevation 'demote' — a recessed wing behind the front plane should read as a
     * dashed ghost, L-190; plan/section 'remove'). But there was no field on the view
     * ITSELF, so the plumbing stopped one inch short of the user: the contract mandated a
     * choice nobody could make. The agent that landed L-277 recorded that in §4.6.7 as an
     * OPEN CELL rather than quietly pretending the feature existed. This closes it.
     *
     * PRECEDENCE (and it is the same shape as every other resolver in this codebase —
     * instance beats type beats documented default, C11 §3):
     *     this field  →  ViewScope's per-view-TYPE default  →  the engine's behaviour
     *
     * `undefined` means "inherit the view type's default", which is the correct and safe
     * reading: a view that has never expressed an opinion must behave exactly as it does
     * today. Setting it is an explicit act of INTENT (P7) — never a literal in a builder.
     *
     * The canonical use the founder asked for: a plan where you want to SEE the pipe
     * behind the wall, dashed, instead of losing it. That is 'demote' on that one view —
     * not a global toggle, and not a hack in the projector.
     */
    occlusionDisposition?: OcclusionDisposition;

    /**
     * §FEAT-BEYOND-DASH-IN-ELEVATION (L-290) / C09 §4.6.4d — how THIS view draws the `beyond`
     * zone (geometry past the cut plane that is deliberately shown).
     *
     * `undefined` ⇒ inherit the view TYPE's default from `ViewScope` (elevation and section
     * 'dashed', plan 'solid'). Setting it is an explicit act of INTENT (P7) — the founder's own
     * *"unless explicitly overridden"* clause, and the reason the dash is DATA here rather than
     * an `if (isElevation)` in a renderer. Resolved ONLY through `resolveBeyondLineStyle()`.
     */
    beyondLineStyle?: BeyondLineStyle;

    /**
     * Drawing scale as a ratio denominator (e.g. 100 = 1:100, 50 = 1:50).
     * Governs annotation symbol sizes, line weights, and dimension text height.
     */
    scale?: number;

    /**
     * Custom scale denominator — used when a non-standard ratio is needed.
     * Takes precedence over `scale` when present.
     */
    customScale?: number;

    /**
     * How model geometry is displayed relative to the reference plane:
     * - 'normal'   — standard display (default)
     * - 'halftone' — all model elements rendered at reduced opacity
     * - 'hidden'   — model elements suppressed (annotation/drafting only)
     */
    displayModel?: 'normal' | 'halftone' | 'hidden';

    /**
     * Level of detail for element geometry + plan-symbol representation.
     * coarse = LOD 100 (simplified); medium = LOD 200 (standard); fine = LOD 300 (full).
     *
     * §FEAT-DOOR-PLAN-SYMBOL-DETAIL-LEVEL (L-241) P1 — this enum used to be FORKED:
     * lower-case here, Title-Case in `@pryzm/schemas`. It now has ONE owner
     * (`@pryzm/schemas/view/detail-level`, P5 / C03 §1) and this field imports it.
     *
     * CONSUMER: `resolveEffectiveDetailLevel()` (core-app-model/drawing) — read by
     * every plan-symbol builder. Precedence: per-element C09 graphic override →
     * per-elementType / per-category C09 override → THIS field → DEFAULT_DETAIL_LEVEL.
     */
    detailLevel?: DetailLevel;

    /**
     * §FEAT-AUTO-TAG-BATCH-EXECUTOR (L-265) — which MARK this view's tags display.
     *
     * 'type'     — the element's SYSTEM TYPE name ("WallA", "Timber Casement"). The
     *              convention on the founder's reference drawing, and the default.
     * 'instance' — the element's own mark (WA-00-001, from MarkGenerator §03-1.7).
     *
     * A representation property ("HOW the view is drawn"), so it lives here beside
     * `scale` and `detailLevel` rather than in a parallel tag-settings store. Both
     * marks are always CARRIED in the tag's parameters — this only selects the one
     * that is DRAWN, so the C28 schedule join holds either way.
     */
    tagMarkSource?: 'type' | 'instance';

    /**
     * Visibility of Part elements (for construction documentation workflows):
     * - 'showOriginal' — show original elements, hide parts
     * - 'showParts'    — show divided parts, hide originals
     * - 'showBoth'     — show both simultaneously
     */
    partsVisibility?: 'showOriginal' | 'showParts' | 'showBoth';

    /** Visual rendering style for this view. */
    visualStyle?: ViewVisualStyle;

    /** Whether cast shadows are rendered. */
    shadows?: boolean;

    /** Whether ambient occlusion is enabled. */
    ambientOcclusion?: boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE VI — VIEW RANGE (Plan Views only)
// The vertical slice through the building model that controls element
// visibility in plan views.
// All levelId references resolve via BimManager (§02 contract).
// All offset values are in world units (metres).
// ═════════════════════════════════════════════════════════════════════════════

export interface ViewRangeBound {
    /** Reference to a BimManager level ID — §02 spatial authority. */
    levelId: string;
    /** Vertical offset from the level elevation in world units (metres). */
    offset:  number;
}

export interface ViewRangeSettings {
    /**
     * The upper boundary of elements drawn in cut profile.
     * Elements intersecting the cut plane up to this level are shown cut.
     */
    top:    ViewRangeBound;

    /**
     * The horizontal cut plane — elements intersecting this plane
     * are drawn with their cut profiles (section hatching, poche walls).
     * §02 rule: computed as BimManager.getLevelById(cut.levelId).elevation + cut.offset
     */
    cut:    ViewRangeBound;

    /**
     * The lower boundary of elements drawn in projection below the cut plane.
     * Elements between this level and the cut plane are drawn as projected (dashed or thin).
     */
    bottom: ViewRangeBound;

    /**
     * View depth — elements below bottom but above this depth are drawn
     * in projection with the "beyond" line style.
     */
    depth:  ViewRangeBound;
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE VI — CROP SETTINGS
// Controls whether the view's visible extent is clipped to a rectangular
// region. Replaces the loose spatial.boundingBox for plan views.
// ═════════════════════════════════════════════════════════════════════════════

export interface ViewCropSettings {
    /** Whether the crop region is active and clips view rendering. */
    enabled: boolean;

    /**
     * 2D crop region. Undefined when enabled = false or the view uses full extent.
     *
     * ⚠ §ELEV-SCOPE-FRAME (L-1856) — **`region[0]` CARRIES TWO INCOMPATIBLE
     * MEANINGS** and this is a KNOWN, UNRESOLVED hazard. Do not add a third.
     *
     *   · plan views                         — `[worldX, worldZ]`.
     *   · section/elevation WITH `spatial.sectionVolume`
     *                                        — `[ABSOLUTE world-H, world-Y]`,
     *     where H is world X when |dir.z| ≥ |dir.x|, else world Z.
     *     Written by `PlanViewInteraction._applyScopeDragFromPointer` and by
     *     `CreateElevationMarkCommand`; read by
     *     `PlanViewCanvas._resolveCropCanvasBounds` (sectionVolume branch).
     *   · section/elevation WITHOUT `sectionVolume`
     *                                        — `[SIGNED PERPENDICULAR OFFSET from
     *     the linked mark's anchor, world-Y]`. Read by
     *     `PlanViewCanvas._elevationCropFrame` and by
     *     `PlanViewAnnotationRenderer._computeElevationScope`.
     *
     * The discriminator is *the presence of an unrelated field*, which is why the
     * two readers disagreed in production: `_renderElevationCutLine` called
     * `_computeElevationScope` (OFFSET meaning) unconditionally, while the drag
     * that had just written the value used the ABSOLUTE meaning — so the orange
     * dashed cut line was displaced by the anchor's own H coordinate and sat
     * "static, pointing to the wrong place" (founder, 2026-08-21) beside a crop
     * rectangle that was correct. Fixed at the READER (one producer:
     * `_scopeWorld`); the dual encoding itself is NOT yet unified — see
     * ADR-0339 §5 for the migration that would collapse it to one.
     */
    region?: {
        min: [number, number];
        max: [number, number];
    };

    /**
     * Whether annotation elements (dimensions, tags, grid bubbles) are also
     * clipped to the crop region boundary.
     */
    annotationCrop?: boolean;

    /**
     * Far clip for section and elevation views — depth from the cut plane
     * in world units. Undefined means unclipped (show full depth).
     */
    farClip?: {
        /** Optional level reference for the far boundary — §02 spatial authority. */
        levelId?: string;
        /** Offset from the cut plane in world units (metres). */
        offset:   number;
    };
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE VI — UNDERLAY SETTINGS (Plan Views only)
// Shows another level's elements as a ghosted reference in a plan view.
// ═════════════════════════════════════════════════════════════════════════════

export interface ViewUnderlaySettings {
    /** BimManager level ID at the base of the underlay range. */
    baseLevelId?: string;
    /** BimManager level ID at the top of the underlay range. */
    topLevelId?:  string;
    /**
     * Viewing direction of the underlay:
     * - 'lookingDown' — plan view, looking at the level below from above
     * - 'lookingUp'   — reflected ceiling plan, looking at the level above from below
     */
    orientation: 'lookingDown' | 'lookingUp';
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE VI — ANNOTATION VISIBILITY (per-annotation-category overrides)
// ═════════════════════════════════════════════════════════════════════════════

export interface AnnotationVisibilitySettings {
    dimensions?:        boolean;
    grids?:             boolean;
    levels?:            boolean;
    sectionHeads?:      boolean;
    elevationTags?:     boolean;
    spotElevations?:    boolean;
    spotCoordinates?:   boolean;
    roomTags?:          boolean;
    /**
     * §FEAT-AUTO-TAG-BATCH-EXECUTOR (L-265) — the per-view TAG INTENT (P7 / C09).
     *
     * These sit beside `roomTags` because they are the same kind of thing: an
     * annotation CATEGORY this view does or does not carry. `autoTagActiveView`
     * reads them to decide WHICH categories it tags — the decision belongs to the
     * view (and, via `ViewTemplate.annotationOverrides`, to its template), never to
     * a hardcoded step inside the batch button.
     *
     * undefined ⇒ the default set for the view's projection (see `resolveAutoTagIntent`).
     */
    doorTags?:          boolean;
    windowTags?:        boolean;
    wallTags?:          boolean;
    spaceTags?:         boolean;
    genericAnnotation?: boolean;
    detailItems?:       boolean;
    insulation?:        boolean;
    references?:        boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE VI — SEMANTIC CONTEXT (LLM / World Model)
// Human and machine-readable context for AI authoring and World Model queries.
// ═════════════════════════════════════════════════════════════════════════════

export interface ViewSemanticContext {
    /**
     * Primary audience for this view.
     * Guides LLMs on detail level, annotation density, and styling choices.
     */
    audience?: 'client' | 'contractor' | 'engineer' | 'coordination' | 'internal';

    /**
     * Design phase purpose of this view.
     * Used by the World Model to group views by project workflow stage.
     */
    purpose?:
        | 'design'
        | 'documentation'
        | 'coordination'
        | 'analysis'
        | 'presentation'
        | 'review'
        | 'construction'
        ;

    /**
     * Arbitrary semantic tags on the view itself (not on elements).
     * Example: ['fire-safety', 'regulatory-submission', 'level-01']
     */
    tags?: string[];

    /**
     * Human-readable filter descriptions — what subset of the model this view shows.
     * AI-authored. Used in Project Browser tooltips and LLM context.
     * Example: ["Level 1 only", "Structural elements", "New construction phase"]
     */
    filters?: string[];
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE VI — TEMPLATE LOCK
// Tracks which view properties a view manages independently from its
// View Template (Phase VII). All fields default to false = template controls.
// ═════════════════════════════════════════════════════════════════════════════

export interface ViewTemplateLock {
    scale?:               boolean;
    detailLevel?:         boolean;
    visualStyle?:         boolean;
    discipline?:          boolean;
    phaseFilter?:         boolean;
    vgTemplate?:          boolean;
    viewRange?:           boolean;
    crop?:                boolean;
    annotationOverrides?: boolean;
    rules?:               boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
// §DAY9 — PER-VIEW GRAPHICS ENGINE OVERRIDES                      [Contract 23]
//
// These types are stored on ViewDefinition and injected into GraphicsRulesEngine
// as priority-9000 (category) and priority-10000 (element) rules whenever a
// view is rendered.  They are fully serialisable (plain objects / primitives).
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Minimal pen-style override record — mirrors `Partial<PenStyle>` from
 * PenWeightTable without importing that file (keeps types pure / no engine deps).
 */
export interface OverridePenStyle {
    /** Line weight in mm (e.g. 0.18, 0.25, 0.50, 0.70). */
    widthMm?:   number;
    /** CSS colour string (e.g. '#ff0000'). */
    color?:     string;
    /** SVG/Canvas dash array in px, or null for solid. */
    dashArray?: number[] | null;
    /** 0–1 opacity factor. */
    opacity?:   number;
}

/**
 * A single per-category style override for a specific view.
 * Injected at priority 9000 (VIEW tier) into GraphicsRulesEngine.
 *
 * zone     — drawing zone: 'CUT' | 'PROJECTION' | 'BEYOND'
 * category — element category: 'wall' | 'column' | 'beam' | 'door' | …
 */
export interface ViewCategoryOverride {
    zone:     string;
    category: string;
    style:    OverridePenStyle;
}

/**
 * A single per-element style override for a specific view.
 * Injected at priority 10000 (ELEMENT tier) into GraphicsRulesEngine.
 */
export interface ViewElementOverride {
    /** UUID of the element this override applies to. */
    elementId: string;
    zone:      string;
    category:  string;
    style:     OverridePenStyle;
}

// ═════════════════════════════════════════════════════════════════════════════
// VIEW DEFINITION — COMPLETE SCHEMA                               [B + VI]
// ═════════════════════════════════════════════════════════════════════════════

export interface ViewDefinition {

    // ── 1. Identity ─────────────────────────────────────────────── [B] ──────
    /** Stable, immutable ID — never re-generated. */
    id:           string;
    /** Display name — editable. */
    name:         string;
    /** View type — extended in Phase VI; all Phase B values remain valid. */
    viewType:     ViewType;

    // ── 2. Dependency hierarchy ──────────────────────────────────── [VI] ────
    /** For callout/detail views: the host view's id. */
    parentViewId?:  string;
    /** Views that are callouts or dependents of this view. */
    dependentIds?:  string[];
    /** Name shown in the title block when this view is placed on a sheet. */
    titleOnSheet?:  string;

    // ── 3. Template & Inheritance ────────────────────────────────── [VI] ────
    /**
     * @deprecated Contract 25b — VG templates are superseded by Visibility
     * Intents. The field is retained for backward compatibility on read
     * (legacy projects) and is converted to a `ViewIntentInstance.intentId`
     * by `runVGToIntentMigration()` on project load. New code MUST NOT write
     * to this field — use `AssignViewIntentCommand` instead.
     *
     * VG Template ID — overrides the model-level VG template for this view.
     * Part of the (legacy) 4-tier VG cascade (Tier 3).
     */
    vgTemplateId?:    string;
    /**
     * View Template ID — a named preset controlling a defined set of view
     * properties (scale, detail level, discipline, phase filter, VG template).
     * Phase VII entity; stored as a reference ID here.
     */
    viewTemplateId?:  string;
    /**
     * Which view properties this view controls independently from its template.
     * Undefined = all properties controlled by the template.
     */
    templateLock?:    ViewTemplateLock;

    /**
     * templateOverrides — per-property deviation tracking. [Phase 12]
     * Key = ViewTemplateProperties field name (e.g. 'scale', 'detailLevel').
     * Value = reason for the deviation (user-entered justification string).
     * Differs from template AND key present → 'derived' (orange badge).
     * Differs from template AND key absent  → 'conflict' (red badge).
     */
    templateOverrides?: Record<string, string>;

    /**
     * viewSyncState — computed by SyncStateEngine. Never written directly. [Phase 12]
     * Reflects whether this view's properties conform to its assigned ViewTemplate.
     */
    viewSyncState?: import('../hierarchy/HierarchyTypes').SyncState;

    // ── 4. Context (Spatial + Temporal) ─────────────────────────── [B] ──────
    /** Spatial anchoring — level, section plane, bounding box. */
    spatial:      ViewGeometryLens;
    /** Temporal/phase context — phase filter. */
    temporal:     ViewTemporalContext;

    // ── 5. Discipline / Scope ────────────────────────────────────── [B] ──────
    /** Architectural, structural, MEP, or all-discipline view. */
    discipline?:     'architecture' | 'structure' | 'mep' | 'all';
    /** Finer-grained sub-discipline (e.g. 'fire-safety', 'hvac'). */
    subDiscipline?:  string;
    /** Scope box ID — limits horizontal extents to a named region. */
    scopeBoxId?:     string;
    /** Design Option this view is scoped to (Phase VII entity). */
    designOptionId?: string;

    // ── 6. Visibility / Graphics ─────────────────────────────────── [B] ──────
    /**
     * Serialisable visibility rules evaluated against SemanticIndex.
     * Phase B: VisibilityRuleStub[] (lightweight reference).
     * Phase C: full VisibilityRule[] (replaced additively, same field name).
     */
    rules:               VisibilityRuleStub[];
    /** Annotation category visibility overrides. */
    annotationOverrides?: AnnotationVisibilitySettings;

    /**
     * §DAY9 — Per-view category pen overrides.
     * Each entry is injected into GraphicsRulesEngine at priority 9000 (VIEW tier)
     * when this view is active.  Only properties in `style` are applied — other
     * properties fall through to lower-priority rules.
     * @deprecated Contract 25 visibility intents supersede ViewDefinition-hosted
     * style overrides; kept only for legacy VG bridge compatibility.
     */
    categoryOverrides?: ViewCategoryOverride[];

    /**
     * §DAY9 — Per-view element pen overrides.
     * Each entry is injected into GraphicsRulesEngine at priority 10000 (ELEMENT tier)
     * when this view is active.  Element-level overrides win over category overrides.
     * @deprecated Contract 25 OverrideLayer supersedes ViewDefinition-hosted
     * style overrides; kept only for legacy VG bridge compatibility.
     */
    elementOverrides?: ViewElementOverride[];

    // ── 7. View Range (Plan Views) ───────────────────────────────── [VI] ────
    /**
     * Vertical slice through the building that defines what is visible in
     * plan views. Applies to: 'plan', 'ceiling-plan', 'structural-plan'.
     * Undefined for section, elevation, 3d, and analysis views.
     */
    viewRange?: ViewRangeSettings;

    // ── 8. Crop Region ───────────────────────────────────────────── [VI] ────
    /** Crop region settings — whether and how the view is clipped. */
    crop?: ViewCropSettings;

    // ── 9. Underlay (Plan Views) ─────────────────────────────────── [VI] ────
    /**
     * Underlay — shows another level's elements as a ghosted reference.
     * Applies to: 'plan', 'ceiling-plan'.
     */
    underlay?: ViewUnderlaySettings;

    // ── 10. Output / Representation ──────────────────────────────── [VI] ────
    /**
     * Output and representation settings — scale, detail level, visual style.
     * Controls HOW the view is drawn; not WHAT is visible (that is rules[]).
     */
    output?: ViewOutputSettings;

    // ── 11. Camera / Projection ───────────────────────────────────── [VII] ──
    /**
     * Camera state captured when the view was last saved.
     * Activating a view that has projection data restores the exact camera
     * position, target, projection type, and clipping planes.
     * Undefined = no saved camera; engine uses its default framing.
     */
    projection?: ViewProjectionSettings;

    // ── 12. Lighting (3D Views) ───────────────────────────────────── [VII] ──
    /**
     * Sun, background, and rendering quality for 3D views.
     * Only meaningful for viewType === '3d' or viewType === 'render'.
     * Undefined = inherits scene-level lighting settings.
     */
    lighting?: ViewLightingSettings;

    // ── 13. Section Box (3D Views) ────────────────────────────────── [VII] ──
    /**
     * Explicit 3D section box (AABB) for sectional clipping.
     * Only meaningful for viewType === '3d'. When enabled, the Three.js scene
     * is clipped to this box when the view is activated.
     */
    sectionBox?: ViewSectionBox;

    // ── 13a. Set Out (live documentation) ────────────── [L-286 / P7 / C09] ──
    /**
     * §FEAT-SET-OUT-LIVE-DOCUMENTATION (L-286) — SET OUT IS A VIEW INTENT, NOT A MODE FLAG.
     *
     * A Set-Out view keeps its annotation set TRUE: when the model changes, the view's tags
     * (and, as they land, its dimensions) are RE-DERIVED against what the view SHOWS. It is
     * a property of the VIEW — carried by a view template like any other intent (P7/C09) —
     * because "this drawing is a live set-out drawing" is a documentation decision, not a
     * global editor mode. Plan AND elevation from day one.
     *
     * Undefined ⇒ not live (opt-in). See ADR-0121 for the undo rule: a reconcile caused by a
     * MODEL edit is a re-derivation (suppressed from undo); a reconcile the USER asks for
     * (the Auto-tag button) is one batch = one undo.
     */
    setOut?: {
        /** Re-derive this view's annotation set whenever the model changes. */
        live: boolean;
    };

    // ── 14. AI / LLM ─────────────────────────────────────────────── [B+VI] ──
    /** AI-authored human-readable description of this view's purpose. [B] */
    intent?: string;
    /** Machine-readable semantic context for LLM authoring and World Model queries. [VI] */
    semantics?: ViewSemanticContext;

    // ── 14a. View Purpose (P9) ───────────────────────────────────── [P9] ────
    /**
     * View purpose — high-level delivery workflow classification.
     * Governs which PurposeModifiers are activated from the assigned VisibilityIntent.
     *
     * Built-in values: 'construction-docs' | 'design-review' | 'coordination' | 'presentation'
     *
     * Distinct from semantics.purpose which holds AI/LLM semantic context tags
     * ('design' | 'documentation' | 'coordination' | 'analysis' | 'presentation' | 'review').
     */
    purpose?: 'construction-docs' | 'design-review' | 'coordination' | 'presentation' | string;

    // ── 15. Dependencies ─────────────────────────────────────────── [B] ──────
    /** Element IDs with explicit per-element view overrides (Phase VI store). */
    dependencies: {
        elements:   string[];
        templates?: string[];
    };

    // ── 16. Metadata ─────────────────────────────────────────────── [B] ──────
    /** §03 §1.1 compliant metadata block. */
    metadata: {
        createdAt:    number;
        modifiedAt:   number;
        createdBy:    string;
        version:      number;
        tags?:        string[];
        description?: string;
    };

    // ── 17. Sheet Placement Back-Reference ───────────────────────── [S5] ────
    /**
     * Back-reference populated when this view is placed on a sheet.
     * Read-only from ViewDefinition perspective — authoritative data lives in
     * SheetStore. Used by ProjectBrowserPanel to render the "📋 On Sheet"
     * badge without querying SheetStore each render cycle.
     *
     * Only one placement per non-legend/schedule view is allowed (§S5).
     * Undefined = view is not yet placed on any sheet.
     */
    sheetPlacement?: {
        /** ID of the sheet this view is placed on. */
        sheetId:    string;
        /** ID of the SheetViewport record within the sheet. */
        viewportId: string;
    };
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE VII — CAMERA / PROJECTION SETTINGS
// Stores the full camera state so that activating a view restores the
// exact camera position, target, and projection type.
// ═════════════════════════════════════════════════════════════════════════════

export interface ViewProjectionSettings {
    /**
     * Camera projection type.
     * - 'orthographic' — parallel projection (plan, section, elevation views)
     * - 'perspective'  — perspective projection (3D orbit views)
     */
    type?: 'orthographic' | 'perspective';

    /** Camera state captured at save time. All values in world units. */
    camera?: {
        /** Camera position in world space [x, y, z]. */
        position: [number, number, number];
        /** Orbit target / look-at point [x, y, z]. */
        target:   [number, number, number];
        /** Camera up vector [x, y, z] — normalised. */
        up:       [number, number, number];
        /**
         * Perspective field of view in degrees.
         * Undefined for orthographic cameras.
         */
        fov?:     number;
        /**
         * Orthographic zoom factor.
         * Undefined for perspective cameras.
         */
        zoom?:    number;
    };

    /** Near / far clip plane distances in world units. */
    clip?: {
        near?: number;
        far?:  number;
    };

    /**
     * When true, the camera cannot be rotated by the user while this view
     * is active (plan and section views lock rotation).
     */
    locked?: boolean;

    /**
     * Locked orientation as a unit normal vector [x, y, z].
     * Used by orthographic plan/section views to constrain the camera direction.
     */
    lockedOrientation?: [number, number, number];
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE VII — LIGHTING SETTINGS (3D Views only)
// Controls sun position, background type, and render quality per 3D view.
// ═════════════════════════════════════════════════════════════════════════════

export interface ViewLightingSettings {
    /** Whether the sun path arc is rendered in the viewport. */
    sunPath?: boolean;

    /** Sun position and intensity for this view. */
    sun?: {
        /** Azimuth in degrees (0 = North, 90 = East, 180 = South, 270 = West). */
        azimuth:    number;
        /** Altitude in degrees above the horizon (0–90). */
        altitude:   number;
        /** Intensity multiplier (0.0 = off, 1.0 = full). */
        intensity?: number;
    };

    /** Background type for the 3D view. */
    background?:
        | { type: 'sky' }
        | { type: 'gradient'; topColor: string; bottomColor: string }
        | { type: 'solid'; color: string }
        | { type: 'image'; url: string }
        ;

    /** Camera exposure override in EV stops (0 = default/neutral). */
    exposure?: number;

    /** Render quality preset for high-fidelity output modes. */
    renderQuality?: 'draft' | 'medium' | 'high' | 'best';
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE VII — SECTION BOX (3D Views only)
// Axis-aligned bounding box used to clip the 3D scene for sectional inspection.
// ═════════════════════════════════════════════════════════════════════════════

export interface ViewSectionBox {
    /** Whether the section box clipping is active. */
    enabled: boolean;
    /** Minimum corner of the AABB in world space [x, y, z]. */
    min?: [number, number, number];
    /** Maximum corner of the AABB in world space [x, y, z]. */
    max?: [number, number, number];
}

// ── Serialisation snapshot ─────────────────────────────────────────── [B] ──

export interface ViewDefinitionStoreSnapshot {            // [B] unchanged
    version: 1;
    views:   ViewDefinition[];
}
