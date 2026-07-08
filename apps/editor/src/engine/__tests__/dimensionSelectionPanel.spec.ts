// §FIX-DIM-SELECT-PROPERTIES-PANEL (L-173) — selection → Properties Panel wiring.
//
// Verifies the two halves of "a dimension is selectable + shows properties like
// a wall":
//   1. openDimensionPropertiesOnSelect (the engineLauncher `pryzm-element-selected`
//      seam) resolves a linear-dim AnnotationElement by id and opens the SAME
//      Properties Panel a wall uses via inspector.showLinearDimension — and skips
//      non-dimension / non-annotation selections so normal BIM selection is safe.
//   2. The real PropertyPanelAnnotations.showLinearDimension APPLY button drives
//      an `annotation.update` command through runtime.bus (P6 — no direct store
//      write from UI).
//
// Docs: docs/04-reference/V1-LAUNCH-READINESS-AUDIT.md L-173; C03 / DOC-2.x /
//       ADR-0119. Root vitest (happy-dom) — apps/editor/src/engine/__tests__/**.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { AnnotationElement } from '@pryzm/plugin-annotations';
import {
    openDimensionPropertiesOnSelect,
    deleteSelectedDimension,
    type DimensionPanelLike,
} from '../../ui/property-panel/dimensionSelectionPanel';
import {
    showLinearDimension,
    type AnnotationPanelHost,
} from '../../ui/property-panel/PropertyPanelAnnotations';
import { UpdateAnnotationCommand } from '@pryzm/command-registry';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeLinearDim(id = 'annotation_DIM1', overrides: Partial<AnnotationElement> = {}): AnnotationElement {
    return {
        id,
        type: 'linear-dim',
        ownerViewId: 'vd-plan-l0',
        references: [
            { elementId: 'wall_A', elementType: 'wall', cachedPosition: { x: 0, y: 0, z: 0 } },
            { elementId: 'wall_B', elementType: 'wall', cachedPosition: { x: 4, y: 0, z: 0 } },
        ],
        geometry2D: {
            modelPoints: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
            offset: 0.5,
        },
        style: {},
        parameters: { unit: 'mm' },
        isDriving: false,
        ...overrides,
    } as unknown as AnnotationElement;
}

// ── 1. Selection → panel wiring ─────────────────────────────────────────────────

describe('openDimensionPropertiesOnSelect (L-173 selection wiring)', () => {
    function makePanel(): DimensionPanelLike & { showLinearDimension: ReturnType<typeof vi.fn> } {
        return { showLinearDimension: vi.fn() };
    }

    it('opens the Properties Panel for a plan-view dimension pick (annotationId)', () => {
        const dim = makeLinearDim();
        const panel = makePanel();
        const opened = openDimensionPropertiesOnSelect(
            { elementId: dim.id, annotationId: dim.id, source: 'plan-view' },
            { getAnnotationById: (id) => (id === dim.id ? dim : undefined), getSelectedElementId: () => null, panel },
        );
        expect(opened).toBe(true);
        expect(panel.showLinearDimension).toHaveBeenCalledTimes(1);
        // The EXACT resolved AnnotationElement is handed to the panel.
        expect(panel.showLinearDimension).toHaveBeenCalledWith(dim, undefined);
    });

    it('resolves via elementId when annotationId is absent', () => {
        const dim = makeLinearDim();
        const panel = makePanel();
        const opened = openDimensionPropertiesOnSelect(
            { elementId: dim.id, source: 'plan-view' },
            { getAnnotationById: (id) => (id === dim.id ? dim : undefined), getSelectedElementId: () => undefined, panel },
        );
        expect(opened).toBe(true);
        expect(panel.showLinearDimension).toHaveBeenCalledWith(dim, undefined);
    });

    it('passes a co-selected wall id so the "Move Wall" affordance can appear', () => {
        const dim = makeLinearDim();
        const panel = makePanel();
        openDimensionPropertiesOnSelect(
            { annotationId: dim.id, source: 'plan-view' },
            { getAnnotationById: () => dim, getSelectedElementId: () => 'wall_A', panel },
        );
        expect(panel.showLinearDimension).toHaveBeenCalledWith(dim, 'wall_A');
    });

    it('does NOT open for a non-annotation id (e.g. a wall selection) — BIM selection untouched', () => {
        const panel = makePanel();
        const opened = openDimensionPropertiesOnSelect(
            { elementId: 'wall_A', elementType: 'wall', source: '3d' } as never,
            { getAnnotationById: () => undefined, getSelectedElementId: () => 'wall_A', panel },
        );
        expect(opened).toBe(false);
        expect(panel.showLinearDimension).not.toHaveBeenCalled();
    });

    it('does NOT open for a non-linear-dim annotation (e.g. a text note)', () => {
        const note = makeLinearDim('annotation_NOTE', { type: 'text-note' as AnnotationElement['type'] });
        const panel = makePanel();
        const opened = openDimensionPropertiesOnSelect(
            { annotationId: note.id, source: 'plan-view' },
            { getAnnotationById: () => note, getSelectedElementId: () => null, panel },
        );
        expect(opened).toBe(false);
        expect(panel.showLinearDimension).not.toHaveBeenCalled();
    });

    it('is a no-op for an empty/absent payload', () => {
        const panel = makePanel();
        expect(openDimensionPropertiesOnSelect(null, { getAnnotationById: () => undefined, getSelectedElementId: () => null, panel })).toBe(false);
        expect(openDimensionPropertiesOnSelect({}, { getAnnotationById: () => undefined, getSelectedElementId: () => null, panel })).toBe(false);
        expect(panel.showLinearDimension).not.toHaveBeenCalled();
    });
});

// ── 2. Panel APPLY → annotation.update (P6) ─────────────────────────────────────

describe('showLinearDimension APPLY drives annotation.update (P6)', () => {
    let host: AnnotationPanelHost;
    let hostEl: HTMLDivElement;
    let executeCommand: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        hostEl = document.createElement('div');
        document.body.appendChild(hostEl);
        host = {
            element: hostEl,
            prepareForAnnotation: () => { hostEl.innerHTML = ''; },
            buildCloseBtn: () => document.createElement('button'),
            hide: vi.fn(),
            makeVisible: vi.fn(),
        };
        executeCommand = vi.fn(() => Promise.resolve());
        (window as unknown as { runtime?: { bus: { executeCommand: unknown } } }).runtime = { bus: { executeCommand } };
    });

    afterEach(() => {
        hostEl.remove();
        delete (window as unknown as { runtime?: unknown }).runtime;
    });

    it('renders the DIMENSION panel and calls makeVisible', () => {
        const dim = makeLinearDim();
        showLinearDimension(host, { execute: vi.fn() }, dim);
        expect(host.makeVisible).toHaveBeenCalledTimes(1);
        expect(hostEl.textContent).toContain('DIMENSION');
    });

    it('APPLY dispatches an annotation.update command via runtime.bus for the correct annotation', () => {
        const dim = makeLinearDim();
        // cmdMgr must be truthy for the APPLY handler to proceed.
        showLinearDimension(host, { execute: vi.fn() }, dim);

        const applyBtn = Array.from(hostEl.querySelectorAll('button'))
            .find((b) => b.textContent?.includes('APPLY')) as HTMLButtonElement | undefined;
        expect(applyBtn, 'APPLY button rendered').toBeTruthy();

        applyBtn!.click();

        const updateCall = executeCommand.mock.calls.find((c) => c[0] === 'annotation.update');
        expect(updateCall, 'annotation.update dispatched (P6)').toBeTruthy();
        expect((updateCall![1] as { annotationId: string }).annotationId).toBe(dim.id);
    });
});

// ── 3. Selection → DELETE (L-173 completion) ────────────────────────────────────

describe('deleteSelectedDimension (L-173 keyboard-delete seam, P6)', () => {
    function makeDeps(over: {
        bim?: boolean;
        selectedId?: string | null;
        store?: Map<string, AnnotationElement>;
        del?: ReturnType<typeof vi.fn>;
    } = {}) {
        const store = over.store ?? new Map<string, AnnotationElement>();
        const del = over.del ?? vi.fn();
        return {
            del,
            deps: {
                hasBimSelection: () => over.bim ?? false,
                getSelectedAnnotationId: () => (over.selectedId === undefined ? null : over.selectedId),
                getAnnotationById: (id: string) => store.get(id),
                deleteAnnotation: del,
            },
        };
    }

    it('deletes the selected plan-view dimension via annotation.delete (returns true)', () => {
        const dim = makeLinearDim();
        const store = new Map([[dim.id, dim]]);
        const { deps, del } = makeDeps({ selectedId: dim.id, store });
        expect(deleteSelectedDimension(deps)).toBe(true);
        expect(del).toHaveBeenCalledTimes(1);
        expect(del).toHaveBeenCalledWith(dim.id);
    });

    it('does NOT delete when a 3D BIM object is selected (element delete takes precedence)', () => {
        const dim = makeLinearDim();
        const store = new Map([[dim.id, dim]]);
        const { deps, del } = makeDeps({ bim: true, selectedId: dim.id, store });
        expect(deleteSelectedDimension(deps)).toBe(false);
        expect(del).not.toHaveBeenCalled();
    });

    it('is a no-op when no annotation is selected', () => {
        const { deps, del } = makeDeps({ selectedId: null });
        expect(deleteSelectedDimension(deps)).toBe(false);
        expect(del).not.toHaveBeenCalled();
    });

    it('is a no-op for a stale id that no longer resolves to a live annotation', () => {
        const { deps, del } = makeDeps({ selectedId: 'annotation_GONE', store: new Map() });
        expect(deleteSelectedDimension(deps)).toBe(false);
        expect(del).not.toHaveBeenCalled();
    });
});

// ── 4. Selection → MOVE (UpdateAnnotationCommand applies the drag, P6) ───────────

describe('dimension MOVE applies via UpdateAnnotationCommand (P6)', () => {
    /** Minimal AnnotationStore surface UpdateAnnotationCommand touches. */
    function makeFakeStore(seed: AnnotationElement) {
        const map = new Map<string, AnnotationElement>([[seed.id, seed]]);
        return {
            has: (id: string) => map.has(id),
            getById: (id: string) => map.get(id),
            update: (patch: { id: string } & Partial<AnnotationElement>) => {
                const cur = map.get(patch.id);
                if (cur) map.set(patch.id, { ...cur, ...patch } as AnnotationElement);
            },
            add: (el: AnnotationElement) => { map.set(el.id, el); },
            remove: (id: string) => { map.delete(id); },
        };
    }

    it('patches the annotation to the dragged position (move command fires + mutates)', () => {
        const dim = makeLinearDim();
        const store = makeFakeStore(dim);
        const ctx = { stores: { annotationStore: store } } as never;

        // The drag-commit builds exactly this command (PlanViewInteraction._onMouseUp).
        const movedGeometry2D = {
            ...dim.geometry2D,
            modelPoints: [{ x: 1, y: 0, z: 1 }, { x: 5, y: 0, z: 1 }],
        };
        const cmd = new UpdateAnnotationCommand(dim.id, { geometry2D: movedGeometry2D } as never);

        expect(cmd.canExecute(ctx).ok).toBe(true);
        const res = cmd.execute(ctx);
        expect(res.success).toBe(true);

        const after = store.getById(dim.id)!;
        expect(after.geometry2D.modelPoints[0]).toEqual({ x: 1, y: 0, z: 1 });
        expect(after.geometry2D.modelPoints[1]).toEqual({ x: 5, y: 0, z: 1 });
    });
});
