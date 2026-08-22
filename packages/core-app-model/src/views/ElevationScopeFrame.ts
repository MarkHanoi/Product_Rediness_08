/**
 * §ELEV-SCOPE-IS-THE-SCOPE (L-6000..L-6009) — THE ORIENTED SPATIAL SCOPE OF A DEPTH-PROJECTED
 * VIEW, RESOLVED IN ONE PLACE SO THE EXPORTER AND THE PROJECTOR CANNOT DISAGREE.
 *
 * Founder, 2026-08-22, verbatim:
 *   *"i am selecting a window within the elevation — the elevation scope is defined on the
 *    right hand side split view — i am selecting a window that should be on the scope of the
 *    crop box but is not, is way further away — absolutely incorrect"*
 *   *"also the performance of opening the elevation view is really slow"*
 *
 * ═══ WHY THIS FILE EXISTS AT ALL ═══
 *
 * The oriented scope box was computed by `EdgeProjectorService.resolveSectionVolumeBox`, which
 * lives in `apps/editor` (L7). `NativeElementMeshExporter` lives in `packages/core-app-model`
 * (L2) and CANNOT import it — a layer violation, and the reason the exporter had no elevation
 * scope to apply. It therefore fell back to the only box it could see, the axis-aligned
 * `spatial.cropRegion`, read ONLY when `resolveViewScope(viewType).planFamily`, i.e. never for
 * an elevation. The founder's console said so on every pass:
 *
 *   [NativeElementMeshExporter] No levelId — exporting all 385 elements across 7 levels
 *                               (viewType=elevation)
 *   [EdgeProjectorService] project() … cullAABB(plan-family only)=[…]
 *
 * ⭐ ONE DEFECT, TWO SYMPTOMS. Every element in the model was proxied and edge-projected on
 * every pass (slow), and the resulting drawing carried linework — hit-testable linework — for
 * elements far outside the user's crop (a window picked in the elevation resolves to one
 * metres away).
 *
 * ⚠ CORRECTION TO §FIX-ELEVATION-CROP-CLIP (L-123), WHOSE DIAGNOSIS WAS RIGHT AND WHOSE
 * REMEDY WAS TOO BROAD. It observed that an axis-aligned XZ box "mixes the drawing-horizontal
 * axis with the view DEPTH axis; a flat XZ box CULL then drops any element that straddles the
 * crop's depth slab" — TRUE, and it is why re-enabling that box would be the wrong fix. But
 * the remedy it took was *cull nothing*, which threw away the LATERAL and VERTICAL bounds
 * along with the depth one. An elevation's crop bounds three axes. The founder is pointing at
 * the LATERAL one — a window off to the side at the same depth.
 *
 * ⛔ AND NO FOURTH AUTHORITY IS MINTED. §CROP-IS-THE-CLIP (L-4500..L-4504) established that the
 * depth window of an elevation already lives in three fields with one resolver
 * (`resolveElevationClipRange`). This module does not re-derive it: the caller passes the
 * RESOLVED near/far in, exactly as `resolveSectionVolumeBox` already required. What moves here
 * is the FRAME — origin, right/forward basis, lateral half-width, vertical band — extracted
 * from the projector's explicit-`sectionVolume` branch so that both the L2 exporter and the L7
 * projector read the SAME box. `resolveSectionVolumeBox` now delegates to it.
 *
 * ═══ WHAT THIS DELIBERATELY DOES *NOT* RESOLVE ═══
 *
 * The projector's ANNOTATION-LINKED fallback branch (no `spatial.sectionVolume`; the frame is
 * derived from the linked elevation-/section-mark's `modelPoints` + `facingDirection`) reads
 * `annotationStore`, which is an L7 store. It stays in `EdgeProjectorService`. This function
 * returns `null` for that case, and the exporter's honest response to `null` is to cull
 * NOTHING — today's behaviour, unchanged, and logged as `scope=ABSENT` rather than silently
 * pretending the view is unbounded. **ABSENT ≠ UNREACHABLE** (C01 §6 rule 6): the scope is
 * reachable for every view carrying an explicit section volume, which is every elevation whose
 * scope handles have been dragged and every one minted by `CreateElevationMarkCommand`.
 *
 * Maps C09 §4.6.7 (view scope), C24 (spatial crop — NOT the C24.1 paper crop), C04 (projection
 * cost).
 *
 * P8: pure, deterministic, allocation-light geometry resolver on the projection hot path —
 * same "pure classifier, no span" precedent as `ViewScope.resolveViewScope` and
 * `DrawingZone.drawingZoneFromLayerName`. The projector's `project()` span wraps every call.
 */

import * as THREE from '@pryzm/renderer-three/three';
import type { ViewDefinition } from './ViewDefinitionTypes';

/**
 * The oriented spatial scope of one depth-projected view.
 *
 * ⚠ STRUCTURALLY IDENTICAL TO `EdgeProjectorService.SectionVolumeBox`, and that is not an
 * accident to be tidied away: the projector's box IS one of these, returned unchanged by
 * `resolveSectionVolumeBox`'s explicit branch. Keeping one shape is what lets the exporter's
 * cull and the projector's mesh-drop gate be provably the same test rather than two tests that
 * agree today.
 *
 * Coordinates: `right`/`forward` are unit vectors in the horizontal (XZ) plane; `minRight`..
 * `maxRight` and `minDepth`..`maxDepth` are measured from `origin` along them; `minY`..`maxY`
 * are WORLD Y (a vertical elevation band is a world-space quantity, not a frame-local one).
 */
export interface ElevationScopeFrame {
    origin: THREE.Vector3;
    /** Alias of `forward`, retained because `SectionVolumeBox` exposes both. */
    direction: THREE.Vector3;
    right: THREE.Vector3;
    forward: THREE.Vector3;
    width: number;
    height: number;
    near: number;
    far: number;
    minRight: number;
    maxRight: number;
    minDepth: number;
    maxDepth: number;
    minY: number;
    maxY: number;
}

/** One storey band, structurally — so this module needs no `BimManager` import (L2 purity). */
export interface ScopeLevelBand {
    elevation?: number;
    height?: number;
}

/**
 * Fallback storey height when a level declares none. Mirrors `EdgeProjectorService`'s
 * `DEFAULT_FAR_OFFSET`; the projector keeps its own constant for its PLAN view-range use,
 * which is a different quantity that happens to share a value.
 */
export const DEFAULT_LEVEL_HEIGHT_M = 3.0;

/** Tolerance for "has the user dragged the vertical handle off its creation value?" (metres). */
const VERTICAL_OVERRIDE_TOL_M = 0.02;

/**
 * §FIX-ELEVATION-VERTICAL-CROP (L-302) — the SPATIAL vertical extent of an elevation, from the
 * LEVEL STACK: the union of every level band, `[min elevation, max (elevation + height)]`.
 *
 * This is the C24 SPATIAL crop (a 3-D section-volume extent), NOT the C24.1 PAPER crop. A
 * building elevation spans the FULL building height by default — Revit, ArchiCAD and
 * Vectorworks all do this, and a single-storey default is simply wrong for a documentation
 * elevation. Resolved live on every call (§02 §1.2 — never cached) so the bound tracks a
 * changed `level.elevation`/`level.height` and a moved elevation origin (L-305) with no baked
 * storey-height literal (L-127).
 *
 * Returns `null` when there is no level stack to derive from, in which case the caller keeps
 * the legacy per-volume band.
 */
export function levelStackVerticalBounds(
    levels: readonly ScopeLevelBand[] | undefined,
): { min: number; max: number } | null {
    if (!levels || levels.length === 0) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const lvl of levels) {
        const elev = Number(lvl?.elevation);
        if (!Number.isFinite(elev)) continue;
        const rawH = Number(lvl?.height);
        const h = Number.isFinite(rawH) && rawH > 0 ? rawH : DEFAULT_LEVEL_HEIGHT_M;
        min = Math.min(min, elev);
        max = Math.max(max, elev + h);
    }
    return Number.isFinite(min) && Number.isFinite(max) && max > min ? { min, max } : null;
}

/**
 * Resolve the oriented scope frame of an elevation/section that carries an explicit
 * `spatial.sectionVolume`.
 *
 * @param viewDef             The view. Only `spatial.sectionVolume` and `crop.region[1]` are read.
 * @param projectionDirection Fallback forward when the stored volume's direction is degenerate.
 * @param farClipDepth        The RESOLVED far plane (§CROP-IS-THE-CLIP — from
 *                            `resolveElevationClipRange`, NOT re-read from the stored volume).
 * @param levels              The level stack, for the default vertical extent (L-302).
 * @param nearClipDepth       The RESOLVED near plane.
 * @returns The frame, or `null` when the view is not depth-projected or carries no explicit
 *          section volume (see the module header — that case is the projector's).
 */
export function resolveElevationScopeFrame(
    viewDef: ViewDefinition,
    projectionDirection: THREE.Vector3,
    farClipDepth: number,
    levels: readonly ScopeLevelBand[] | undefined,
    nearClipDepth = 0,
): ElevationScopeFrame | null {
    if (viewDef.viewType !== 'section' && viewDef.viewType !== 'elevation') return null;
    const explicit = viewDef.spatial?.sectionVolume;
    if (!explicit) return null;

    const origin = new THREE.Vector3(explicit.origin[0], explicit.origin[1], explicit.origin[2]);
    const forward = new THREE.Vector3(explicit.direction[0], 0, explicit.direction[2]);
    if (forward.lengthSq() <= 1e-8) forward.copy(projectionDirection).setY(0);
    if (forward.lengthSq() <= 1e-8) forward.set(0, 0, -1);
    forward.normalize();
    const right = new THREE.Vector3(-forward.z, 0, forward.x).normalize();
    const width = Math.max(0.01, Number(explicit.width) || 0.01);
    const legacyHeight = Math.max(0.01, Number(explicit.height) || 0.01);

    // §CROP-IS-THE-CLIP (L-4500) — the ORIENTED depth box is the SAME window as the
    // projector's clip planes, so it takes the RESOLVED range rather than re-reading
    // `explicit.near`/`explicit.far`. Reading the stored volume here meant a panel depth edit
    // (which writes `crop.farClip.offset` only) moved the clip planes but NOT the box that
    // culls and clips meshes — the drawing then contained geometry from one depth window drawn
    // against a rectangle from another.
    const near = Math.max(0, nearClipDepth);
    const far = Math.max(near, farClipDepth);

    // §FIX-ELEVATION-VERTICAL-CROP (L-302) — VERTICAL EXTENT (C24 SPATIAL, 3-D).
    //
    // The vertical bounds are NOT `origin.y .. origin.y + sectionVolume.height`. That stored
    // `height` was frozen to ONE STOREY at creation (CreateElevationMarkCommand /
    // DefaultViewsManager), so a two-storey house's elevation clipped level 2 away at the
    // mesh-drop gate — level 2 was never projected.
    //
    // Instead: the DEFAULT extent is the full building height from the level stack, and the
    // EDITABLE override is `crop.region[1]` — the exact field the elevation-view top/bottom
    // edge drag already writes (PlanViewCanvas.cropFromHandleDrag, "crop.region[1] === world
    // Y"). Distinguishing an explicit user crop from the untouched creation artefact: the
    // frozen creation value equals the one-storey band `[origin.y, origin.y + legacyHeight]`.
    // When `crop.region[1]` DEVIATES from that band the user has dragged → honour it;
    // otherwise it is superseded by the full-height default. This closes the clip AND the
    // lying handle (L-267) in one path, reading the same override the handle writes.
    const oneStoreyBottom = origin.y;
    const oneStoreyTop = origin.y + legacyHeight;
    const stack = levelStackVerticalBounds(levels);
    const defaultMinY = stack ? stack.min : oneStoreyBottom;
    const defaultMaxY = stack ? stack.max : oneStoreyTop;
    const cropMinV = viewDef.crop?.region?.min?.[1];
    const cropMaxV = viewDef.crop?.region?.max?.[1];
    const userSetBottom =
        Number.isFinite(cropMinV) && Math.abs((cropMinV as number) - oneStoreyBottom) > VERTICAL_OVERRIDE_TOL_M;
    const userSetTop =
        Number.isFinite(cropMaxV) && Math.abs((cropMaxV as number) - oneStoreyTop) > VERTICAL_OVERRIDE_TOL_M;
    let minY = userSetBottom ? (cropMinV as number) : defaultMinY;
    let maxY = userSetTop ? (cropMaxV as number) : defaultMaxY;
    if (minY > maxY) [minY, maxY] = [maxY, minY];

    return {
        origin,
        direction: forward.clone(),
        right,
        forward,
        width,
        height: Math.max(0.01, maxY - minY),
        near,
        far,
        minRight: -width / 2,
        maxRight: width / 2,
        minDepth: near,
        maxDepth: far,
        minY,
        maxY,
    };
}

/** Frame-local coordinates of one world point. */
function _frameCoords(
    x: number, y: number, z: number, frame: ElevationScopeFrame,
): { right: number; depth: number; y: number } {
    const rx = x - frame.origin.x;
    const ry = y - frame.origin.y;
    const rz = z - frame.origin.z;
    return {
        right: rx * frame.right.x + ry * frame.right.y + rz * frame.right.z,
        depth: rx * frame.forward.x + ry * frame.forward.y + rz * frame.forward.z,
        y,
    };
}

/**
 * Does a world-space AABB INTERSECT the oriented scope frame?
 *
 * ⭐ INTERSECTION, NEVER CONTAINMENT — and this is the whole of §FIX-ELEVATION-CROP-CLIP
 * (L-123)'s real concern, honoured rather than reintroduced. A wall whose near face is inside
 * the crop and whose far face is well past it MUST survive: the projector's
 * `clipSegmentToSectionBox` then clips its linework at the boundary. A containment test would
 * delete it, which is exactly the *"elevation shows only a PORTION of each element"* symptom
 * L-123 was reacting to. Cull is coarse and conservative; CLIP is the precise operation, and
 * it happens downstream.
 *
 * The AABB's eight corners are projected into the frame's basis and the resulting interval
 * overlap is tested per axis. That is a conservative (never-false-negative) SAT-lite: it can
 * answer "intersects" for a box that only intersects the frame's oriented hull, never the
 * reverse — so nothing that should be drawn is ever dropped.
 */
export function scopeFrameIntersectsWorldAABB(
    frame: ElevationScopeFrame,
    aabb: THREE.Box3,
    epsilon = 1e-5,
): boolean {
    if (aabb.isEmpty()) return false;
    let minRight = Infinity, maxRight = -Infinity;
    let minDepth = Infinity, maxDepth = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (const x of [aabb.min.x, aabb.max.x]) {
        for (const y of [aabb.min.y, aabb.max.y]) {
            for (const z of [aabb.min.z, aabb.max.z]) {
                const c = _frameCoords(x, y, z, frame);
                if (c.right < minRight) minRight = c.right;
                if (c.right > maxRight) maxRight = c.right;
                if (c.depth < minDepth) minDepth = c.depth;
                if (c.depth > maxDepth) maxDepth = c.depth;
                if (c.y < minY) minY = c.y;
                if (c.y > maxY) maxY = c.y;
            }
        }
    }
    return maxRight >= frame.minRight - epsilon &&
        minRight <= frame.maxRight + epsilon &&
        maxDepth >= frame.minDepth - epsilon &&
        minDepth <= frame.maxDepth + epsilon &&
        maxY >= frame.minY - epsilon &&
        minY <= frame.maxY + epsilon;
}
