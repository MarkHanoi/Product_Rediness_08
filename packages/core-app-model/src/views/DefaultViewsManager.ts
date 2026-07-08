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

import { viewDefinitionStore } from './ViewDefinitionStore';
import { VIEW_PROJECTION_DIRECTIONS } from './ViewDefinitionTypes';
import { SYSTEM_INTENT_IDS } from '../presentation/SystemIntents';
import { viewIntentInstanceStore } from '../presentation/ViewIntentInstanceStore';

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
export const DEFAULT_ELEVATION_VIEWS = [
    { id: 'vd-sys-elev-north', markId: 'an-sys-elev-north', name: 'North Elevation', dir: VIEW_PROJECTION_DIRECTIONS.elevationBack  },
    { id: 'vd-sys-elev-east',  markId: 'an-sys-elev-east',  name: 'East Elevation',  dir: VIEW_PROJECTION_DIRECTIONS.elevationRight },
    { id: 'vd-sys-elev-south', markId: 'an-sys-elev-south', name: 'South Elevation', dir: VIEW_PROJECTION_DIRECTIONS.elevationFront },
    { id: 'vd-sys-elev-west',  markId: 'an-sys-elev-west',  name: 'West Elevation',  dir: VIEW_PROJECTION_DIRECTIONS.elevationLeft  },
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
                detailLevel: 'medium',
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
                detailLevel: 'medium',
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
                    detailLevel: 'medium',
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
}

let _resetDebounce: ReturnType<typeof setTimeout> | null = null;

/**
 * Call once from EngineBootstrap after viewDefinitionStore is initialized.
 * Registers all event listeners and ensures defaults exist on first call.
 */
export function initDefaultViewsManager(): void {
    // Boot-time guarantee: create defaults immediately (handles brand-new
    // projects and projects that were already loaded before this call).
    ensureDefaultViews();

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
