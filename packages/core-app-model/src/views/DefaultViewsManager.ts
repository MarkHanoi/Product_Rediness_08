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
import { SYSTEM_INTENT_IDS } from '../presentation/SystemIntents';
import { viewIntentInstanceStore } from '../presentation/ViewIntentInstanceStore';

export const DEFAULT_3D_VIEW_ID   = 'vd-sys-3d-1';
export const DEFAULT_PLAN_VIEW_ID = 'vd-sys-plan-l0';

const GROUND_LEVEL_ID = 'L0';

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
        if (viewId === DEFAULT_3D_VIEW_ID || viewId === DEFAULT_PLAN_VIEW_ID) {
            console.warn(`[DefaultViewsManager] Default view "${viewId}" was deleted — restoring.`);
            setTimeout(() => ensureDefaultViews(), 0);
        }
    });

    console.log('[DefaultViewsManager] Initialized — default views are guaranteed on every project.');
}
