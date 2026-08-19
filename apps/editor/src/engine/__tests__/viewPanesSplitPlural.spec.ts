/**
 * §FIX-SPLIT-VIEW-IS-PLURAL (L-1107) — the split layout has TWO candidate views.
 *
 * These tests exercise the REAL `viewPanes` resolver against the REAL
 * `viewDefinitionStore`. Nothing under test is stubbed: the view records are
 * created through the store's own `create()`, and the grid selection is read back
 * through the SAME `getSelectedGridId()` accessor that `PlanViewCanvas` implements
 * and that `PlanViewInteraction` writes to. The only doubles are the two window
 * MANAGERS (`planViewManager` / `splitViewManager`), which are the environment the
 * resolver reads — not the thing it computes.
 *
 * The founder's two symptoms are asserted directly:
 *   • Grid button grey while the RIGHT pane is the plan view  → `activePlanPane`.
 *   • Delete on a grid selected in the RIGHT pane doing nothing → `selectedGridInAnyPane`.
 *
 * And the regression risk named in the brief is asserted explicitly: a SINGLE-pane
 * layout must answer exactly as it did before this module existed.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import {
    listViewPanes,
    activePlanPane,
    activeSectionPane,
    selectedGridInAnyPane,
    clearGridSelectionInAllPanes,
    __setFocusedPaneRoleForTest,
} from '@app/engine/views/viewPanes';

/**
 * A minimal stand-in for PlanViewCanvas's SELECTION slice, implemented with the
 * same trivial field semantics as the real class (`_selectedGridId`, set/get).
 * This is the pane's canvas — the environment — not the resolver under test.
 */
class FakePlanCanvas {
    private _gridId: string | null = null;
    setSelectedGridId(id: string | null): void { this._gridId = id; }
    getSelectedGridId(): string | null { return this._gridId; }
}

const PRIMARY_PLAN = 'vd-primary-plan';
const PRIMARY_3D = 'vd-primary-3d';
const SECONDARY_PLAN = 'vd-secondary-plan';
const PRIMARY_SECTION = 'vd-primary-section';

let primaryCanvas: FakePlanCanvas;
let secondaryCanvas: FakePlanCanvas;

/** Mount a primary pane showing `viewId`. */
function mountPrimary(viewId: string | null): void {
    (window as unknown as Record<string, unknown>).viewController = { currentViewDefinitionId: viewId };
    (window as unknown as Record<string, unknown>).planViewManager = {
        isActive: true,
        planViewCanvas: primaryCanvas,
    };
}

/** Mount (or unmount) the split pane. `null` = single-pane layout. */
function mountSecondary(viewId: string | null, mode: 'plan' | '3d' | 'schedule' | 'sheet' = 'plan'): void {
    if (viewId === null && mode === 'plan') {
        (window as unknown as Record<string, unknown>).splitViewManager = { isActive: false };
        return;
    }
    (window as unknown as Record<string, unknown>).splitViewManager = {
        isActive: true,
        activeViewId: viewId ?? undefined,
        paneMode: mode,
        getPlanCanvas: () => secondaryCanvas,
    };
}

beforeEach(() => {
    primaryCanvas = new FakePlanCanvas();
    secondaryCanvas = new FakePlanCanvas();
    __setFocusedPaneRoleForTest('primary');
    // Real store records — created through the store's own API.
    for (const [id, viewType] of [
        [PRIMARY_PLAN, 'plan'],
        [PRIMARY_3D, '3d'],
        [SECONDARY_PLAN, 'plan'],
        [PRIMARY_SECTION, 'section'],
    ] as const) {
        if (!viewDefinitionStore.has(id)) {
            viewDefinitionStore.create({ id, name: id, viewType });
        }
    }
    mountSecondary(null);
});

afterEach(() => {
    delete (window as unknown as Record<string, unknown>).viewController;
    delete (window as unknown as Record<string, unknown>).planViewManager;
    delete (window as unknown as Record<string, unknown>).splitViewManager;
});

describe('viewPanes — single-pane layout is unchanged (the regression risk)', () => {
    it('reports exactly one pane when the split view is closed', () => {
        mountPrimary(PRIMARY_PLAN);
        const panes = listViewPanes();
        expect(panes).toHaveLength(1);
        expect(panes[0]!.role).toBe('primary');
        expect(panes[0]!.viewType).toBe('plan');
    });

    it('enables Grid for a lone plan view, exactly as the old primary-only gate did', () => {
        mountPrimary(PRIMARY_PLAN);
        expect(activePlanPane()?.role).toBe('primary');
        expect(activeSectionPane()).toBeNull();
    });

    it('disables Grid for a lone 3D view, exactly as the old primary-only gate did', () => {
        mountPrimary(PRIMARY_3D);
        expect(activePlanPane()).toBeNull();
    });

    it('enables Level for a lone section view', () => {
        mountPrimary(PRIMARY_SECTION);
        expect(activeSectionPane()?.role).toBe('primary');
        expect(activePlanPane()).toBeNull();
    });
});

describe('DEFECT 1 — Grids & Levels must see the RIGHT pane', () => {
    it('finds the plan view when ONLY the split pane is a plan (the founder symptom)', () => {
        mountPrimary(PRIMARY_3D);        // left = 3D → old gate said "no plan view"
        mountSecondary(SECONDARY_PLAN);  // right = plan → but there plainly is one
        const pane = activePlanPane();
        expect(pane).not.toBeNull();
        expect(pane!.role).toBe('secondary');
        expect(pane!.viewType).toBe('plan');
    });

    it('gives the SAME answer whether the plan is left or right', () => {
        mountPrimary(PRIMARY_PLAN);
        mountSecondary(null);
        const leftAnswer = activePlanPane() !== null;

        mountPrimary(PRIMARY_3D);
        mountSecondary(SECONDARY_PLAN);
        const rightAnswer = activePlanPane() !== null;

        expect(leftAnswer).toBe(true);
        expect(rightAnswer).toBe(true);
        expect(rightAnswer).toBe(leftAnswer);
    });

    it('does NOT count a split pane in 3D / schedule / sheet mode as a plan view', () => {
        mountPrimary(PRIMARY_3D);
        for (const mode of ['3d', 'schedule', 'sheet'] as const) {
            mountSecondary(SECONDARY_PLAN, mode);
            expect(activePlanPane()).toBeNull();
        }
    });
});

describe('DEFECT 3 — a grid selected in EITHER pane must be findable', () => {
    it('finds a grid selected in the split (right) pane', () => {
        mountPrimary(PRIMARY_3D);
        mountSecondary(SECONDARY_PLAN);
        secondaryCanvas.setSelectedGridId('grid_RIGHT');

        const hit = selectedGridInAnyPane();
        expect(hit).not.toBeNull();
        expect(hit!.gridId).toBe('grid_RIGHT');
        expect(hit!.pane.role).toBe('secondary');
    });

    it('finds a grid selected in the primary pane in a single-pane layout', () => {
        mountPrimary(PRIMARY_PLAN);
        primaryCanvas.setSelectedGridId('grid_LEFT');
        expect(selectedGridInAnyPane()?.gridId).toBe('grid_LEFT');
    });

    it('returns null when no pane holds a grid selection', () => {
        mountPrimary(PRIMARY_PLAN);
        mountSecondary(SECONDARY_PLAN);
        expect(selectedGridInAnyPane()).toBeNull();
    });

    it('prefers the FOCUSED pane when both panes hold a selection', () => {
        mountPrimary(PRIMARY_PLAN);
        mountSecondary(SECONDARY_PLAN);
        primaryCanvas.setSelectedGridId('grid_LEFT');
        secondaryCanvas.setSelectedGridId('grid_RIGHT');

        __setFocusedPaneRoleForTest('secondary');
        expect(selectedGridInAnyPane()?.gridId).toBe('grid_RIGHT');

        __setFocusedPaneRoleForTest('primary');
        expect(selectedGridInAnyPane()?.gridId).toBe('grid_LEFT');
    });

    it('clears the selection in EVERY pane, so no deleted grid stays highlighted', () => {
        mountPrimary(PRIMARY_PLAN);
        mountSecondary(SECONDARY_PLAN);
        primaryCanvas.setSelectedGridId('grid_LEFT');
        secondaryCanvas.setSelectedGridId('grid_RIGHT');

        clearGridSelectionInAllPanes();

        expect(primaryCanvas.getSelectedGridId()).toBeNull();
        expect(secondaryCanvas.getSelectedGridId()).toBeNull();
        expect(selectedGridInAnyPane()).toBeNull();
    });

    it('falls back to the open pane when the focus record points at a closed pane', () => {
        __setFocusedPaneRoleForTest('secondary'); // stale: split view is closed
        mountPrimary(PRIMARY_PLAN);
        mountSecondary(null);
        primaryCanvas.setSelectedGridId('grid_LEFT');
        expect(selectedGridInAnyPane()?.gridId).toBe('grid_LEFT');
    });
});
