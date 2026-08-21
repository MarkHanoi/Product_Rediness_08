/**
 * DefaultViewsManager — guarantees that two system-level default views
 * always exist in every project, regardless of how the project was created
 * or loaded.
 *
 * Default views:
 *   • vd-sys-3d-1      — "{3D}"          — 3D perspective view
 *   • vd-sys-plan-l0   — "Ground Floor"  — Floor plan tied to level L0
 *
 * Robustness guarantees:
 *   1. Created on initial app boot.
 *   2. Recreated after every project load (vd:store-loaded).
 *   3. Recreated after project clear if no snapshot follows (vd:store-reset +
 *      300 ms debounce — cancelled when vd:store-loaded fires first).
 *   4. Recreated immediately if the user manually deletes either view
 *      (vd:view-deleted guard).
 *
 * Contract compliance:
 *   §05 — Pure client-side module; no DOM, no Three.js imports.
 *   §01 §2 — Writes directly to viewDefinitionStore (system init, not user
 *             action) so default views do NOT pollute the undo history.
 */

import { DEFAULT_DETAIL_LEVEL } from '@pryzm/schemas/view';
import { viewDefinitionStore } from './ViewDefinitionStore';
import { VIEW_PROJECTION_DIRECTIONS } from './ViewDefinitionTypes';
import type { ViewDefinition } from './ViewDefinitionTypes';
import { SYSTEM_INTENT_IDS } from '../presentation/SystemIntents';
import { viewIntentInstanceStore } from '../presentation/ViewIntentInstanceStore';
import { withViewSpan } from './otel';

export const DEFAULT_3D_VIEW_ID   = 'vd-sys-3d-1';
export const DEFAULT_PLAN_VIEW_ID = 'vd-sys-plan-l0';

// §FEAT-DEFAULT-ELEVATIONS (L-110) — the four system default building elevations.
// Guaranteed on every project startup alongside the plan + {3D} defaults, exactly
// like Revit's default N/E/S/W elevations. Oriented to PROJECT NORTH: the plan /
// authoring frame IS project north (ADR-0115), so the world-axis projection
// presets ARE the project-north cardinal directions; the globe applies θ
// separately. Each carries `spatial.projectionDirection` — the shape
// EdgeProjectorService reads (identical to the shipped documentation-set N/S/E/W
// elevations in generateDocumentationSet.ts), so each projects REAL geometry.
// ⚠ §ELEV-SCOPE-FRAME (L-1854) — **EAST AND WEST WERE SWAPPED HERE.** Founder,
// 2026-08-21: *"East and west however dont work as expected: i am opening east
// elevation and it is showing me the wrong side?"* — and North/South were fine,
// which is the shape of the defect: the Z rows applied one naming rule and the X
// rows applied the opposite one.
//
// East was `elevationRight` (+X) and West was `elevationLeft` (-X). Under the
// frame derived in `VIEW_PROJECTION_DIRECTIONS` (-Z = north, +X = east; an
// elevation is named for the façade nearest the viewer, and the viewer sits at
// `-direction`), direction +X puts the viewer at -X and shows the WEST face. So
// the row labelled "East Elevation" was projecting the west façade, exactly as
// reported. The two comments on `elevationLeft` / `elevationRight` said "west
// face" / "east face" and were themselves inverted — that is where this came from.
//
// Two independent producers already had it right and this table contradicted both:
// `initUI.ts` generateElevations ('East Elevation' → (-1,0,0), camera at +X) and
// ai-host `buildingElevations.ts` (`direction: 'E'` → `facing: {x:-1,z:0}`,
// anchor at `maxX + offset`). Three producers, one subject — this one was alone.
export const DEFAULT_ELEVATION_VIEWS = [
    { id: 'vd-sys-elev-north', markId: 'an-sys-elev-north', name: 'North Elevation', dir: VIEW_PROJECTION_DIRECTIONS.elevationBack  },
    { id: 'vd-sys-elev-east',  markId: 'an-sys-elev-east',  name: 'East Elevation',  dir: VIEW_PROJECTION_DIRECTIONS.elevationLeft  },
    { id: 'vd-sys-elev-south', markId: 'an-sys-elev-south', name: 'South Elevation', dir: VIEW_PROJECTION_DIRECTIONS.elevationFront },
    { id: 'vd-sys-elev-west',  markId: 'an-sys-elev-west',  name: 'West Elevation',  dir: VIEW_PROJECTION_DIRECTIONS.elevationRight },
] as const;

const DEFAULT_ELEVATION_IDS = new Set<string>(DEFAULT_ELEVATION_VIEWS.map(v => v.id));

const GROUND_LEVEL_ID = 'L0';

// §FEAT-ELEVATION-MARKERS (L-116) — how far (metres) each default elevation MARK
// sits from the project origin on the Ground Floor plan, and the arrow length.
// §FIX-ELEV-MARK-RADIUS-DOUBLE (L-151) — doubled 6 → 12 m: at 6 m the marks sat
// too close to the origin (inside larger footprints). A future bounds-relative
// placement (marks clamped OUTSIDE the building footprint) is queued as a refinement.
// §FIX-ELEV-MARK-RADIUS-DOUBLE-2 (L-201) — founder: doubled again 12 → 24 m so the
// elevation marks sit further apart / clearly OUTSIDE larger footprints (the marks
// on a big plan were still landing on/near the shell at 12 m).
const ELEV_MARK_RADIUS_M = 24;
const ELEV_MARK_ARROW_LEN_M = 1;

function _ensureVgBridge(viewId: string, viewName: string): void {
    try {
        const vgStore = window.vgGovernanceStore; // TODO(TASK-08)
        if (vgStore && typeof vgStore.ensureView === 'function') {
            vgStore.ensureView(viewId, viewName, 'model-default');
        }
    } catch {
        // vgGovernanceStore may not be ready yet on very first boot — harmless.
    }
}

function _ensureDefaultIntent(viewId: string): void {
    const existing = viewIntentInstanceStore.get(viewId);
    if (!existing) {
        viewIntentInstanceStore.assign(viewId, SYSTEM_INTENT_IDS.architecturalDocumentation);
    }
}

// ── §FEAT-ELEVATION-MARKERS (L-116) — elevation-mark annotations on the plan ────
//
// Each default elevation (L-110) also gets a first-class **elevation-mark**
// ANNOTATION on the Ground Floor plan — like any BIM/Revit elevation tag — so the
// elevations are discoverable and navigable from the plan. This REUSES the
// existing DOC-2.7 `elevation-mark` annotation kind + the shared `annotationStore`
// (the same records the ElevationMarkTool / CreateElevationMarkCommand produce);
// it does NOT invent a parallel marker type. Because the default elevation VIEWS
// are already system-seeded here (L-110), we create ONLY the annotation half —
// `CreateElevationMarkCommand` creates BOTH view+mark atomically and would reject
// on the pre-existing view id, so we cannot reuse it wholesale for the defaults.
//
// §FIX-ELEV-MARKS-ALL-FLOOR-PLANS (L-158) — like Revit, the four N/E/S/W elevation
// tags appear on EVERY level's floor plan, not only the Ground Floor. Each plan
// view OWNS its own set of marks (`ownerViewId` = that plan view — the renderer
// filters annotations by ownerViewId, so a mark is only visible on its owning
// view). Each mark is oriented to PROJECT NORTH (its `facingDirection` = the
// elevation's L-110 `projectionDirection`, world axes = project north per
// ADR-0115), and LINKS to its elevation via `parameters.linkedViewId` (Revit
// behaviour — the plan marker navigates to the elevation view; navigation is
// handled by the existing plan-view annotation interaction).
//
// Contract compliance: C24.1 (auto-documentation — system-seeded doc annotations),
// C03 (the annotation record is the same schema-pure `elevation-mark` shape the
// annotation store validates), §01 §2 (system-init, createdBy 'system' — no undo
// pollution, mirroring the sibling default VIEWS). core-app-model MUST NOT import
// the L7 `plugins/annotations` types (layer rule), so the record is built as a
// plain, store-shaped literal.

/** Minimal structural view of the shared DOC annotation store used by this module. */
interface AnnStoreLike {
    has(id: string): boolean;
    add(el: unknown): void;
    remove(id: string): void;
    // Optional read surfaces — used for the scan-based idempotency of the
    // per-plan-view elevation marks (§FIX-ELEV-MARKS-ALL-FLOOR-PLANS L-158). The
    // production store exposes all three; the L-116 test fake exposes getByType/getAll.
    getByView?(viewId: string): Array<Record<string, unknown>>;
    getByType?(type: string): Array<Record<string, unknown>>;
    getAll?(): Array<Record<string, unknown>>;
}

/** The shared DOC annotation store, when available (set by initTools at boot). */
function _annotationStore(): AnnStoreLike | null {
    try {
        const s = typeof window !== 'undefined' ? window.annotationStore : null; // TODO(TASK-08)
        return s && typeof s.has === 'function' && typeof s.add === 'function' ? s : null;
    } catch {
        return null;
    }
}

/** Plan placement + orientation for one default elevation mark (project north). */
function _elevationMarkPlacement(dir: { x: number; y: number; z: number }): {
    position: { x: number; y: number; z: number };
    facingDirection: { x: number; y: number; z: number };
} {
    // The mark sits on the side the elevation looks FROM and its arrow points along
    // the view direction (into the model) — a diamond of 4 inward-pointing tags
    // around the origin on the ground floor (y = 0).
    const facingDirection = { x: dir.x, y: 0, z: dir.z };
    const position = { x: -dir.x * ELEV_MARK_RADIUS_M, y: 0, z: -dir.z * ELEV_MARK_RADIUS_M };
    return { position, facingDirection };
}

// §FIX-ELEV-MARKS-ALL-FLOOR-PLANS (L-158) — a valid `annotation_<ULID>` id for the
// per-plan-view marks. The Ground Floor plan keeps its stable L-116 fixed ids
// (`an-sys-elev-*`) for backwards-compat + navigation; every OTHER plan view mints
// a fresh id. core-app-model does not depend on @pryzm/schemas, so the ULID is
// generated inline (Crockford base32, 26 chars) — the same `annotation_<ULID>` id
// shape `createId('annotation')` produces, without adding a cross-layer dependency.
const _ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function _ulid(): string {
    let ts = Date.now();
    const time: string[] = [];
    for (let i = 0; i < 10; i++) {
        time.unshift(_ULID_ALPHABET[ts % 32]);
        ts = Math.floor(ts / 32);
    }
    let rand = '';
    for (let i = 0; i < 16; i++) rand += _ULID_ALPHABET[(Math.random() * 32) | 0];
    return time.join('') + rand;
}
function _annotationId(): string {
    return `annotation_${_ulid()}`;
}

/** Every elevation-mark annotation currently in the store (across all views). */
function _allElevationMarks(store: AnnStoreLike): Array<Record<string, unknown>> {
    try {
        if (typeof store.getByType === 'function') return store.getByType('elevation-mark');
        if (typeof store.getAll === 'function') {
            return store.getAll().filter(m => (m as { type?: string }).type === 'elevation-mark');
        }
    } catch {
        /* non-fatal */
    }
    return [];
}

/** True iff `planViewId` already owns an elevation-mark linking to `elevViewId`. */
function _planViewHasElevationMark(store: AnnStoreLike, planViewId: string, elevViewId: string): boolean {
    return _allElevationMarks(store).some(m =>
        m.ownerViewId === planViewId &&
        (m.parameters as { linkedViewId?: string } | undefined)?.linkedViewId === elevViewId,
    );
}

/**
 * Build + add ONE `elevation-mark` annotation owned by `planViewId`, linking to
 * `elevViewId`. Store-shaped literal (same shape makeAnnotationElement produces —
 * see plugins/annotations AnnotationTypes); core-app-model MUST NOT up-import the
 * L7 annotation types (layer rule), so the record is a plain literal.
 */
function _addElevationMark(
    store: AnnStoreLike,
    markId: string,
    planViewId: string,
    elevViewId: string,
    dir: { x: number; y: number; z: number },
): void {
    const { position, facingDirection } = _elevationMarkPlacement(dir);
    const dirEndpoint = {
        x: position.x + facingDirection.x * ELEV_MARK_ARROW_LEN_M,
        y: position.y,
        z: position.z + facingDirection.z * ELEV_MARK_ARROW_LEN_M,
    };
    const now = Date.now();
    const mark = {
        id: markId,
        type: 'elevation-mark' as const,
        ownerViewId: planViewId,                     // the mark lives on THIS plan view
        references: [] as unknown[],
        geometry2D: { modelPoints: [position, dirEndpoint], offset: 0 },
        style: {},
        parameters: { linkedViewId: elevViewId, position, facingDirection }, // link → navigate to the elevation
        isDriving: false,
        createdBy: 'system',
        createdAt: now,
        updatedAt: now,
    };
    try {
        store.add(mark);
    } catch (e) {
        console.warn(`[DefaultViewsManager] elevation mark ${markId} add failed (non-fatal):`, e);
    }
}

/**
 * §FIX-ELEV-MARKS-ALL-FLOOR-PLANS (L-158) — guarantee the four default elevation
 * marks on ONE plan view. Idempotent + tolerant of the annotation store not being
 * ready yet (topped-up on the next ensureDefaultViews run):
 *   • Ground Floor plan → stable L-116 fixed ids (`store.has(markId)` guard).
 *   • Every other plan view → fresh `annotation_<ULID>` id, idempotency by scan
 *     (owner + linkedViewId) so a reload never duplicates marks.
 */
function _ensureElevationMarksForPlanView(planViewId: string): void {
    const store = _annotationStore();
    if (!store) return;
    const isGround = planViewId === DEFAULT_PLAN_VIEW_ID;
    for (const elev of DEFAULT_ELEVATION_VIEWS) {
        if (isGround) {
            if (store.has(elev.markId)) continue;
            _addElevationMark(store, elev.markId, planViewId, elev.id, elev.dir);
        } else {
            if (_planViewHasElevationMark(store, planViewId, elev.id)) continue;
            _addElevationMark(store, _annotationId(), planViewId, elev.id, elev.dir);
        }
    }
}

/**
 * §ELEV-SCOPE-FRAME (L-1854) — MIGRATION: re-point default elevations that were
 * seeded with the swapped East/West direction.
 *
 * ⭐ WITHOUT THIS THE FIX IS UNREACHABLE. `ensureDefaultViews()` creates each
 * default elevation only `if (!viewDefinitionStore.has(elev.id))`, and
 * `_ensureElevationMarksForPlanView()` skips any mark that already exists. Every
 * project created before this change — INCLUDING the founder's live one, whose
 * console names `vd-sys-elev-south` — already holds `vd-sys-elev-east` with
 * `projectionDirection = (+1,0,0)` and a mark at `x = -24`. Correcting the seed
 * table alone would fix only projects that do not exist yet.
 * ([committed-is-not-reachable] — prove the fix at the layer the user sees.)
 *
 * SAFETY — this repairs ONLY what the system itself authored, and refuses to
 * overwrite user intent:
 *   · the VIEW's `projectionDirection` is system-owned for `vd-sys-elev-*`, so it
 *     is corrected unconditionally when it disagrees with the table.
 *   · the MARK's `facingDirection` is likewise corrected.
 *   · the mark's ANCHOR is re-seeded **only if it is still sitting at the position
 *     the old (wrong) direction would have produced** — `-oldDir * radius`. The
 *     old direction IS the mark's stored `facingDirection`, so no legacy table has
 *     to be hard-coded here. If the founder has MOVED that mark (L-305), the
 *     anchor is left exactly where he put it and only the facing is corrected.
 */
function _repairDefaultElevationOrientation(): void {
    const EPS = 0.01;
    const store = _annotationStore();

    for (const elev of DEFAULT_ELEVATION_VIEWS) {
        const want = elev.dir;

        // ── 1. The VIEW's projection direction ──────────────────────────────
        const view = viewDefinitionStore.get(elev.id);
        if (view) {
            const have = view.spatial?.projectionDirection;
            if (have && (Math.abs((have.x ?? 0) - want.x) > EPS || Math.abs((have.z ?? 0) - want.z) > EPS)) {
                viewDefinitionStore.update(elev.id, {
                    spatial: { ...view.spatial, projectionDirection: { x: want.x, y: want.y, z: want.z } },
                });
                console.log(
                    `[DefaultViewsManager] §ELEV-SCOPE-FRAME repaired ${elev.name} direction ` +
                    `(${have.x},${have.z}) → (${want.x},${want.z})`,
                );
            }
        }

        // ── 2. Every plan view's MARK for this elevation ────────────────────
        if (!store) continue;
        for (const mark of _allElevationMarks(store)) {
            const params = mark.parameters as {
                linkedViewId?: string;
                facingDirection?: { x?: number; y?: number; z?: number };
                position?: { x: number; y: number; z: number };
            } | undefined;
            if (params?.linkedViewId !== elev.id) continue;
            const had = params.facingDirection;
            if (!had) continue;
            const oldX = had.x ?? 0;
            const oldZ = had.z ?? 0;
            if (Math.abs(oldX - want.x) <= EPS && Math.abs(oldZ - want.z) <= EPS) continue; // already correct

            const anchor = (mark.geometry2D as { modelPoints?: Array<{ x: number; y: number; z: number }> } | undefined)
                ?.modelPoints?.[0];
            // Was the anchor still at the position the OLD direction seeded?
            const seededByOld = anchor
                && Math.abs(anchor.x - (-oldX * ELEV_MARK_RADIUS_M)) <= EPS
                && Math.abs(anchor.z - (-oldZ * ELEV_MARK_RADIUS_M)) <= EPS;

            const ownerViewId = mark.ownerViewId as string | undefined;
            const markId = mark.id as string | undefined;
            if (!ownerViewId || !markId) continue;

            try {
                store.remove(markId);
            } catch { /* non-fatal — re-add below regardless */ }

            if (seededByOld) {
                // Untouched system mark — re-seed position AND facing from the table.
                _addElevationMark(store, markId, ownerViewId, elev.id, want);
                console.log(`[DefaultViewsManager] §ELEV-SCOPE-FRAME re-seeded mark ${markId} for ${elev.name}`);
            } else {
                // The user moved this mark. Keep their anchor; correct only the facing.
                const keep = anchor ?? { x: 0, y: 0, z: 0 };
                const now = Date.now();
                const dirEndpoint = {
                    x: keep.x + want.x * ELEV_MARK_ARROW_LEN_M,
                    y: keep.y,
                    z: keep.z + want.z * ELEV_MARK_ARROW_LEN_M,
                };
                try {
                    store.add({
                        ...mark,
                        geometry2D: { modelPoints: [keep, dirEndpoint], offset: 0 },
                        parameters: {
                            ...params,
                            facingDirection: { x: want.x, y: want.y, z: want.z },
                            position: keep,
                        },
                        updatedAt: now,
                    });
                } catch (e) {
                    console.warn(`[DefaultViewsManager] §ELEV-SCOPE-FRAME mark ${markId} repair failed (non-fatal):`, e);
                }
                console.log(
                    `[DefaultViewsManager] §ELEV-SCOPE-FRAME corrected facing on USER-MOVED mark ${markId} ` +
                    `for ${elev.name}; anchor left at (${keep.x}, ${keep.z})`,
                );
            }
        }
    }
}

/**
 * Remove EVERY plan view's mark for a given elevation (used when the elevation
 * view is deleted — the tag disappears from every floor plan, then is
 * re-guaranteed alongside the elevation on the next startup).
 */
function _removeElevationMarksForElevation(elevViewId: string): void {
    const store = _annotationStore();
    if (!store) return;
    for (const m of _allElevationMarks(store)) {
        const linked = (m.parameters as { linkedViewId?: string } | undefined)?.linkedViewId;
        if (linked === elevViewId && typeof m.id === 'string') {
            try { store.remove(m.id); } catch { /* non-fatal */ }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// §FEAT-LEVEL-RELATIVE-PLAN-VIEWS (L-720) — ONE PLAN VIEW PER LEVEL
// ═══════════════════════════════════════════════════════════════════════════
//
// THE DEFECT (founder, 2026-08-06): "when a user is creating elements on the
// FIRST floor the references are accordingly related to THAT floor level."
// Walls authored on Level 1 were registered on Level 1 correctly, but every
// REFERENCE the user drew against stayed on the ground floor:
//     [NativeElementMeshExporter] Plan view — exporting 30 elements from
//         levels overlapping Y=[-1.20, 0.00]        ← the GROUND band
//     [EdgeProjectorService] resolveClipRange() levelId=L0 elevation=0.000
//     [RoomTagAutoPopulator] viewId=vd-sys-plan-l0 level=L0
// while Level 1 sits at 3 m.
//
// ROOT CAUSE — and it is NOT in any of those subsystems. Every one of them is
// already fully parametric on `viewDef.spatial.levelId`:
//   • NativeElementMeshExporter.exportForView()  reads viewDef.spatial.levelId
//   • EdgeProjectorService.resolveClipRange()    reads viewDef.spatial.levelId
//   • RoomTagAutoPopulator.populate()            reads viewDef.spatial.levelId
//   • LevelClipPlaneCache                        already registers EVERY level
// The level context exists and is correct; it simply never reaches the view
// layer, because there is only ONE plan ViewDefinition in the project and its
// `spatial.levelId` is hard-wired to the ground level. Creating a level
// (AddLevelCommand) never created its plan view, so switching level moved the
// camera and the authoring target but left `vd-sys-plan-l0` as the only plan
// view — and every reference is keyed to it.
//
// THE FIX (architecture (a) — one plan view per level, Revit's model):
//   • Every level gets a first-class plan ViewDefinition, minted here (the one
//     place that already owns "views that must exist"), idempotently, on boot,
//     on project load, and on `bim-level-added`.
//   • The GROUND level keeps `vd-sys-plan-l0` byte-for-byte — same id, same
//     name, same output block, no underlay. L0 is a strict no-op regression.
//   • Levels ABOVE ground get `vd-sys-plan-<levelId>` and a deliberate
//     Revit-style UNDERLAY of the level immediately below (§UNDERLAY below).
//
// MIGRATION (C13 §serialized view definitions): a project saved before this
// change deserializes with ONLY `vd-sys-plan-l0`. `vd:store-loaded` already
// re-runs ensureDefaultViews(); the per-level pass then TOPS UP the missing
// upper plan views from the loaded level set. Nothing is rewritten on disk
// until the next save. A plan view that already exists for a level — including
// the IFC-import path's `CreatePlanViewCommand`, which uses the LEVEL id as the
// VIEW id — is adopted by `findPlanViewForLevel()`'s scan and never duplicated.
//
// PERFORMANCE (C04 §3.3): N levels ⇒ N plan views, but NOT N reprojections per
// edit. ViewDependencyTracker's §FIX-LAZY-INACTIVE-VIEW-PROJECTION gate already
// partitions the dirty set by `setActiveViewPredicate` — only the view actually
// mounted in the main viewport or the split pane reprojects; the other N−1 are
// recorded in `_deferredDirtyViewIds` (an O(1) Set add) and reproject exactly
// once, on activation. Per-edit projection cost is therefore O(1) in N, exactly
// as it already is for the four always-present default elevations.

/** Structural view of the level records this module needs from BimManager. */
interface LevelLike {
    id:        string;
    name?:     string;
    elevation: number;
    height?:   number;
}

/** All project levels, lowest first. Empty when BimManager is not ready yet. */
function _levels(): LevelLike[] {
    try {
        const bm = (typeof window !== 'undefined' ? window.bimManager : null) as
            { getLevels?: () => LevelLike[] } | null | undefined;
        const levels = bm?.getLevels?.();
        if (!Array.isArray(levels)) return [];
        return [...levels]
            .filter(l => l && typeof l.id === 'string' && Number.isFinite(l.elevation))
            .sort((a, b) => a.elevation - b.elevation);
    } catch {
        return [];
    }
}

/**
 * The canonical system plan-view id for a level.
 *
 * The GROUND level keeps the historical `vd-sys-plan-l0` so every project ever
 * saved — and every id baked into SplitViewManager / SvpPlanToolOverlay /
 * annotation `ownerViewId` records — keeps resolving unchanged.
 */
export function planViewIdForLevel(levelId: string): string {
    return levelId === GROUND_LEVEL_ID ? DEFAULT_PLAN_VIEW_ID : `vd-sys-plan-${levelId}`;
}

/**
 * The plan view that OWNS `levelId`, or null.
 *
 * Resolution order matters for migration: the canonical id first, then a scan of
 * every plan view for a matching `spatial.levelId`. The scan is what adopts plan
 * views this module did not mint — the IFC path (`CreatePlanViewCommand`, whose
 * view id IS the level id) and any user-created per-level plan from the Views
 * rail — so an existing project never grows a duplicate plan for the same level.
 */
export function findPlanViewForLevel(levelId: string): ViewDefinition | null {
    const canonical = viewDefinitionStore.get(planViewIdForLevel(levelId));
    if (canonical && canonical.viewType === 'plan') return canonical;
    return viewDefinitionStore.getByType('plan').find(v => v.spatial?.levelId === levelId) ?? null;
}

/**
 * §UNDERLAY — the level whose geometry an upper plan shows as a halftoned
 * reference, i.e. the storey immediately BELOW `level`. Null for the lowest
 * storey (the ground plan has no underlay, exactly as today).
 *
 * This is DELIBERATE, not accidental. Before this change the user authoring on
 * Level 1 saw the ground floor because the view was STUCK there — the ground
 * floor was the only thing that existed, it was fully opaque, selectable, and
 * it defined the clip band. Now Level 1 is the view's own subject and the floor
 * below appears only as `viewDef.underlay` — routed through the existing DOC-4.7
 * pipeline (`ViewController._activateFloorPlanView` → `VGSceneApplicator
 * .setUnderlayLevelId` → `UnderlayRenderService`), which renders it ghosted and
 * NON-SELECTABLE. Revit's behaviour, and the user can clear it per view.
 */
function _underlayBaseLevelId(levels: LevelLike[], index: number): string | null {
    return index > 0 ? levels[index - 1].id : null;
}

/**
 * §REPAIR-ORPHAN-GROUND-PLAN — re-seat `vd-sys-plan-l0` when the project has no
 * level with id `L0`.
 *
 * `ensureDefaultViews()` hard-codes `spatial.levelId: 'L0'`. In a project whose
 * levels were all minted with generated ids (`level-<ts>-<rand>` — every
 * generator and every `AddLevelCommand` after the first), that reference points
 * at NOTHING: `resolveClipRange()` falls through to FALLBACK_CUT_ELEVATION and
 * the "Ground Floor" plan is a dangling view that would additionally shadow the
 * real ground plan in every `getByType('plan')[0]` fallback.
 *
 * Only fires when the reference is ALREADY broken, so the correct L0 case is
 * untouched. Logged, never silent: a repair that cannot be seen is a repair that
 * cannot be trusted.
 */
function _repairOrphanGroundPlan(levels: LevelLike[]): void {
    if (levels.length === 0) return;
    const ground = viewDefinitionStore.get(DEFAULT_PLAN_VIEW_ID);
    if (!ground) return;
    const seatedLevelId = ground.spatial?.levelId;
    if (seatedLevelId && levels.some(l => l.id === seatedLevelId)) return; // seat is valid

    const lowest = levels[0];
    // Do not steal a level that already owns its own plan view.
    const owner = findPlanViewForLevel(lowest.id);
    if (owner && owner.id !== DEFAULT_PLAN_VIEW_ID) return;

    viewDefinitionStore.setSpatial(DEFAULT_PLAN_VIEW_ID, { ...ground.spatial, levelId: lowest.id });
    console.warn(
        `[DefaultViewsManager] §REPAIR-ORPHAN-GROUND-PLAN — "${DEFAULT_PLAN_VIEW_ID}" referenced ` +
        `level "${seatedLevelId ?? 'none'}" which does not exist; re-seated onto the lowest level ` +
        `"${lowest.id}" (${lowest.name ?? 'unnamed'} @ ${lowest.elevation.toFixed(3)} m).`,
    );
}

/**
 * §FEAT-LEVEL-RELATIVE-PLAN-VIEWS — guarantee ONE plan view per project level.
 *
 * Idempotent and cheap: a project already in steady state does zero store writes.
 * Safe to call before BimManager exists (no levels ⇒ no-op) — the boot path calls
 * it again from `vd:store-loaded` and from every `bim-level-added`.
 *
 * @returns the ids of the plan views created by THIS call (empty when settled).
 */
export function ensurePlanViewsForLevels(): string[] {
    return withViewSpan('view.ensurePlanViewsForLevels', {}, () => {
        const levels = _levels();
        if (levels.length === 0) return [];

        _repairOrphanGroundPlan(levels);

        const created: string[] = [];
        for (let i = 0; i < levels.length; i++) {
            const level = levels[i];
            if (findPlanViewForLevel(level.id)) continue;

            const id = planViewIdForLevel(level.id);
            const name = level.name ?? `Level ${i}`;
            const underlayBase = _underlayBaseLevelId(levels, i);

            const view = viewDefinitionStore.create({
                id,
                name,
                viewType:   'plan',
                discipline: 'all',
                spatial:    { levelId: level.id },
                intent:     `Floor plan for "${name}" — system default (one plan view per level).`,
                createdBy:  'system',
                // Byte-identical to the ground-plan output block below, so an upper
                // plan draws exactly like the ground plan the user already knows.
                output: {
                    scale:       100,
                    detailLevel: DEFAULT_DETAIL_LEVEL,
                    visualStyle: 'shadedWithEdges',
                    shadows:     false,
                },
                // §UNDERLAY — the storey below, ghosted + non-selectable (DOC-4.7).
                ...(underlayBase ? { underlay: { baseLevelId: underlayBase, orientation: 'lookingDown' as const } } : {}),
            });
            if (!view) continue;

            _ensureVgBridge(id, name);
            _ensureDefaultIntent(id);
            _ensureElevationMarksForPlanView(id);
            created.push(id);
            console.log(
                `[DefaultViewsManager] §FEAT-LEVEL-RELATIVE-PLAN-VIEWS — created plan view "${name}" ` +
                `(id=${id}) for level ${level.id} @ ${level.elevation.toFixed(3)} m` +
                (underlayBase ? ` with underlay of "${underlayBase}"` : ' (no underlay — lowest storey)'),
            );
        }
        return created;
    });
}

/**
 * Drop the system plan view a removed level owned, so undoing `AddLevelCommand`
 * (or deleting a storey) does not leave a plan view pointing at nothing.
 *
 * The ground default is NEVER removed — `ensureDefaultViews()`'s deletion guard
 * would immediately recreate it, and it is the id every legacy project carries.
 * A plan view the USER created for that level is left alone: deleting a level
 * must not silently delete authored views.
 */
export function removePlanViewForLevel(levelId: string): boolean {
    const id = planViewIdForLevel(levelId);
    if (id === DEFAULT_PLAN_VIEW_ID) return false;
    if (!viewDefinitionStore.has(id)) return false;
    viewDefinitionStore.delete(id);
    console.log(`[DefaultViewsManager] §FEAT-LEVEL-RELATIVE-PLAN-VIEWS — removed plan view ${id} with level ${levelId}`);
    return true;
}

function ensureDefaultViews(): void {
    // ── 1. Default 3D view ────────────────────────────────────────────────────
    if (!viewDefinitionStore.has(DEFAULT_3D_VIEW_ID)) {
        viewDefinitionStore.create({
            id:         DEFAULT_3D_VIEW_ID,
            name:       '{3D}',
            viewType:   '3d',
            discipline: 'all',
            intent:     'Default 3D perspective view — system default.',
            createdBy:  'system',
            output: {
                visualStyle: 'realistic',
                detailLevel: DEFAULT_DETAIL_LEVEL,   // §FEAT-DOOR-PLAN-SYMBOL-LOD300-DEFAULT (L-252) — one source of truth, no re-fork
                shadows:     true,
            },
        });
        _ensureVgBridge(DEFAULT_3D_VIEW_ID, '{3D}');
        _ensureDefaultIntent(DEFAULT_3D_VIEW_ID);
        console.log('[DefaultViewsManager] Created default 3D view (id=vd-sys-3d-1)');
    } else {
        _ensureDefaultIntent(DEFAULT_3D_VIEW_ID);
    }

    // ── 2. Default Ground Floor plan view ─────────────────────────────────────
    if (!viewDefinitionStore.has(DEFAULT_PLAN_VIEW_ID)) {
        viewDefinitionStore.create({
            id:         DEFAULT_PLAN_VIEW_ID,
            name:       'Ground Floor',
            viewType:   'plan',
            discipline: 'all',
            spatial:    { levelId: GROUND_LEVEL_ID },
            intent:     'Default ground floor plan — system default.',
            createdBy:  'system',
            output: {
                scale:       100,
                detailLevel: DEFAULT_DETAIL_LEVEL,   // §FEAT-DOOR-PLAN-SYMBOL-LOD300-DEFAULT (L-252) — one source of truth, no re-fork
                visualStyle: 'shadedWithEdges',
                shadows:     false,
            },
        });
        _ensureVgBridge(DEFAULT_PLAN_VIEW_ID, 'Ground Floor');
        _ensureDefaultIntent(DEFAULT_PLAN_VIEW_ID);
        console.log('[DefaultViewsManager] Created default Ground Floor plan view (id=vd-sys-plan-l0)');
    } else {
        _ensureDefaultIntent(DEFAULT_PLAN_VIEW_ID);
    }

    // ── 3. Four default building elevations (N/E/S/W) — §FEAT-DEFAULT-ELEVATIONS ─
    // Mirror the plan/3D branches exactly: system-created (createdBy:'system' ⇒
    // no undo pollution, §01 §2), orthographic, with `spatial.projectionDirection`
    // so EdgeProjectorService projects real geometry. Project-north oriented.
    for (const elev of DEFAULT_ELEVATION_VIEWS) {
        if (!viewDefinitionStore.has(elev.id)) {
            viewDefinitionStore.create({
                id:         elev.id,
                name:       elev.name,
                viewType:   'elevation',
                discipline: 'all',
                spatial:    { projectionDirection: { x: elev.dir.x, y: elev.dir.y, z: elev.dir.z } },
                intent:     `Default ${elev.name.toLowerCase()} — system default (project north).`,
                createdBy:  'system',
                output: {
                    detailLevel: DEFAULT_DETAIL_LEVEL,   // §FEAT-DOOR-PLAN-SYMBOL-LOD300-DEFAULT (L-252) — one source of truth, no re-fork
                    visualStyle: 'shadedWithEdges',
                    shadows:     false,
                },
            });
            _ensureVgBridge(elev.id, elev.name);
            _ensureDefaultIntent(elev.id);
            console.log(`[DefaultViewsManager] Created default ${elev.name} (id=${elev.id})`);
        } else {
            _ensureDefaultIntent(elev.id);
        }
    }

    // ── 3b. ONE PLAN VIEW PER LEVEL — §FEAT-LEVEL-RELATIVE-PLAN-VIEWS (L-720) ──
    // Runs AFTER the ground default exists (so `findPlanViewForLevel('L0')`
    // adopts it rather than minting a rival) and BEFORE the elevation-mark pass
    // (so a plan view created here is included in that pass on the same tick).
    // On a project loaded from disk this is the MIGRATION: the upper-level plan
    // views absent from the snapshot are topped up from the loaded level set.
    ensurePlanViewsForLevels();

    // ── 4. Elevation marks on EVERY plan view — §FIX-ELEV-MARKS-ALL-FLOOR-PLANS (L-158)
    // §FEAT-ELEVATION-MARKERS (L-116) originally seeded the N/E/S/W marks on the
    // Ground Floor plan only. Like Revit, every level's floor plan carries them, so
    // we ensure a mark set on each existing plan view (each owned by that view).
    // Ensured every pass (idempotent) so a mark missing because the annotation store
    // was not ready on first boot is topped-up on the next run. Per-level plan views
    // created LATER (via `view.createDefinition`) are handled by the `vd:view-created`
    // listener in initDefaultViewsManager().
    for (const planView of viewDefinitionStore.getByType('plan')) {
        _ensureElevationMarksForPlanView(planView.id);
    }

    // ── 5. §ELEV-SCOPE-FRAME (L-1854) — repair swapped East/West on projects that
    // were seeded before the fix. MUST run AFTER step 4 so freshly topped-up marks
    // are covered by the same pass. Idempotent: on a correct project every
    // comparison matches the table and nothing is written.
    _repairDefaultElevationOrientation();
}

let _resetDebounce: ReturnType<typeof setTimeout> | null = null;

/**
 * Call once from EngineBootstrap after viewDefinitionStore is initialized.
 * Registers all event listeners and ensures defaults exist on first call.
 *
 * §STARTUP-NO-DOUBLE-DEFAULT-VIEWS (founder 2026-08-10, 3× startup) — `bootEnsure`:
 *   • 'immediate' (default) — create the defaults synchronously at init, exactly as
 *     before. Every existing caller and test keeps this behaviour.
 *   • 'deferred' — the editor's boot path. `bootstrap()` only ever runs while a project
 *     OPEN is in flight (it needs a live canvas + project context), and that open
 *     resets/loads `viewDefinitionStore` moments later — so the immediate boot-time
 *     ensure created all 6 system views into a store that was about to be wiped, and
 *     the production log showed every "Created default …" line TWICE per startup.
 *     Deferred mode arms the SAME 300 ms fallback the `vd:store-reset` path already
 *     uses: if the project open resets/loads the store first (the normal case), that
 *     pass is the ONLY creation; if nothing arrives in 300 ms, the fallback creates
 *     the defaults anyway — the guarantee is kept, just no longer paid twice.
 */
export function initDefaultViewsManager(opts?: { bootEnsure?: 'immediate' | 'deferred' }): void {
    if (opts?.bootEnsure === 'deferred') {
        // §STARTUP-NO-DOUBLE-DEFAULT-VIEWS — one deferred pass; superseded by
        // vd:store-loaded (which clears this debounce below) or re-armed by vd:store-reset.
        if (_resetDebounce !== null) clearTimeout(_resetDebounce);
        _resetDebounce = setTimeout(() => {
            _resetDebounce = null;
            ensureDefaultViews();
        }, 300);
    } else {
        // Boot-time guarantee: create defaults immediately (handles brand-new
        // projects and projects that were already loaded before this call).
        ensureDefaultViews();
    }

    // After every project snapshot deserialize: top-up any missing defaults.
    // This covers projects saved before this feature was added.
    window.addEventListener('vd:store-loaded', () => {
        if (_resetDebounce !== null) {
            clearTimeout(_resetDebounce);
            _resetDebounce = null;
        }
        ensureDefaultViews();
    });

    window.addEventListener('vi:instance-store-loaded', () => {
        ensureDefaultViews();
    });

    window.addEventListener('vi:instance-store-reset', () => {
        ensureDefaultViews();
    });

    // §FIX-ELEV-MARKS-ALL-FLOOR-PLANS (L-158) — when a NEW plan view is created
    // later (e.g. per-level floor plans via `view.createDefinition` →
    // CreateViewDefinitionCommand → viewDefinitionStore.create), give it the same
    // N/E/S/W elevation marks every other floor plan carries (Revit behaviour).
    // Idempotent, so a redundant top-up from ensureDefaultViews is harmless.
    window.addEventListener('vd:view-created', (e: Event) => {
        const detail = (e as CustomEvent).detail as { viewId?: string; viewType?: string } | undefined;
        if (detail?.viewType === 'plan' && typeof detail.viewId === 'string') {
            _ensureElevationMarksForPlanView(detail.viewId);
        }
    });

    // §FEAT-LEVEL-RELATIVE-PLAN-VIEWS (L-720) — the level lifecycle IS the plan-view
    // lifecycle. `AddLevelCommand` emits 'bim-level-added' (DOMEventBus → window
    // CustomEvent) and `bim-level-removed` on undo; every other level producer
    // (generators, IFC import, project load) is covered by the ensureDefaultViews()
    // top-up above. Both handlers are idempotent, so an overlap is a no-op.
    window.addEventListener('bim-level-added', () => {
        ensurePlanViewsForLevels();
    });
    window.addEventListener('bim-level-removed', (e: Event) => {
        const levelId = (e as CustomEvent).detail?.id as string | undefined;
        if (typeof levelId === 'string') removePlanViewForLevel(levelId);
    });

    // After a project clear: wait up to 300 ms for vd:store-loaded to fire.
    // If the project has no saved viewDefinitions, store-loaded never fires, so
    // the timer is the fallback that guarantees defaults in that case.
    window.addEventListener('vd:store-reset', () => {
        if (_resetDebounce !== null) clearTimeout(_resetDebounce);
        _resetDebounce = setTimeout(() => {
            _resetDebounce = null;
            ensureDefaultViews();
        }, 300);
    });

    // Deletion guard: if either default view is deleted (e.g. via
    // DeleteViewDefinitionCommand), recreate it on the next tick.
    window.addEventListener('vd:view-deleted', (e: Event) => {
        const viewId = (e as CustomEvent).detail?.viewId as string | undefined;
        if (
            viewId === DEFAULT_3D_VIEW_ID ||
            viewId === DEFAULT_PLAN_VIEW_ID ||
            (viewId !== undefined && DEFAULT_ELEVATION_IDS.has(viewId)) // §FEAT-DEFAULT-ELEVATIONS (L-110)
        ) {
            // §FEAT-ELEVATION-MARKERS (L-116) / §FIX-ELEV-MARKS-ALL-FLOOR-PLANS (L-158)
            // — a default elevation's marks (now on EVERY floor plan) are deleted
            // WITH its elevation, then re-guaranteed alongside it below.
            if (viewId !== undefined && DEFAULT_ELEVATION_IDS.has(viewId)) {
                _removeElevationMarksForElevation(viewId);
            }
            console.warn(`[DefaultViewsManager] Default view "${viewId}" was deleted — restoring.`);
            setTimeout(() => ensureDefaultViews(), 0);
        }
    });

    console.log('[DefaultViewsManager] Initialized — default views are guaranteed on every project.');
}
