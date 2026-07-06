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
const ELEV_MARK_RADIUS_M = 6;
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
// The mark lives on the plan (`ownerViewId` = the Ground Floor plan), is oriented
// to PROJECT NORTH (its `facingDirection` = the elevation's L-110
// `projectionDirection`, world axes = project north per ADR-0115), and LINKS to
// its elevation via `parameters.linkedViewId` (Revit behaviour — the plan marker
// navigates to the elevation view; navigation is handled by the existing
// plan-view annotation interaction).
//
// Contract compliance: C24.1 (auto-documentation — system-seeded doc annotations),
// C03 (the annotation record is the same schema-pure `elevation-mark` shape the
// annotation store validates), §01 §2 (system-init, createdBy 'system' — no undo
// pollution, mirroring the sibling default VIEWS). core-app-model MUST NOT import
// the L7 `plugins/annotations` types (layer rule), so the record is built as a
// plain, store-shaped literal.

/** The shared DOC annotation store, when available (set by initTools at boot). */
function _annotationStore(): {
    has(id: string): boolean;
    add(el: unknown): void;
    remove(id: string): void;
} | null {
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

/**
 * Guarantee the elevation-mark annotation for one default elevation on the plan.
 * Idempotent (skips if the mark already exists) and tolerant of the annotation
 * store not being ready yet (it is topped-up on the next ensureDefaultViews run).
 */
function _ensureElevationMark(elevViewId: string, markId: string, dir: { x: number; y: number; z: number }): void {
    const store = _annotationStore();
    if (!store) return;
    if (store.has(markId)) return;

    const { position, facingDirection } = _elevationMarkPlacement(dir);
    const dirEndpoint = {
        x: position.x + facingDirection.x * ELEV_MARK_ARROW_LEN_M,
        y: position.y,
        z: position.z + facingDirection.z * ELEV_MARK_ARROW_LEN_M,
    };
    const now = Date.now();
    // Store-shaped `elevation-mark` AnnotationElement literal (same shape
    // makeAnnotationElement produces — see plugins/annotations AnnotationTypes).
    const mark = {
        id: markId,
        type: 'elevation-mark' as const,
        ownerViewId: DEFAULT_PLAN_VIEW_ID,          // the mark lives on the Ground Floor plan
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

/** Remove a default elevation's mark (used when its elevation view is deleted). */
function _removeElevationMark(markId: string): void {
    const store = _annotationStore();
    try {
        if (store && store.has(markId)) store.remove(markId);
    } catch {
        /* non-fatal */
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
        // §FEAT-ELEVATION-MARKERS (L-116) — guarantee the plan elevation-mark too.
        // Ensured every pass (idempotent) so a mark missing because the annotation
        // store was not ready on first boot is topped-up on the next run.
        _ensureElevationMark(elev.id, elev.markId, elev.dir);
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
            // §FEAT-ELEVATION-MARKERS (L-116) — a default elevation's plan mark is
            // deleted WITH its elevation, then re-guaranteed alongside it below.
            if (viewId !== undefined && DEFAULT_ELEVATION_IDS.has(viewId)) {
                const elev = DEFAULT_ELEVATION_VIEWS.find(v => v.id === viewId);
                if (elev) _removeElevationMark(elev.markId);
            }
            console.warn(`[DefaultViewsManager] Default view "${viewId}" was deleted — restoring.`);
            setTimeout(() => ensureDefaultViews(), 0);
        }
    });

    console.log('[DefaultViewsManager] Initialized — default views are guaranteed on every project.');
}
