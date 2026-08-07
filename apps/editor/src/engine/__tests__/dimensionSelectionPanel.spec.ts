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

import { describe, expect, it, vi, beforeEach, afterEach, type Mock } from 'vitest';
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
    function makePanel(): DimensionPanelLike & { showLinearDimension: Mock<(ann: AnnotationElement, selectedWallId?: string) => void> } {
        return { showLinearDimension: vi.fn<(ann: AnnotationElement, selectedWallId?: string) => void>() };
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

    // ── §FIX-DIMPANEL-EDIT-REACHES-THE-ELEMENT (L-703) ────────────────────────────
    //
    // THIS TEST USED TO ASSERT `executeCommand('annotation.update', …)` AND PASS — while the
    // founder's Text-size edit did nothing at all. It is the exact shape the repo has now
    // been bitten by repeatedly: it mocked the bus and asserted the DISPATCH, so it could
    // never observe that `annotation.update` HAS NO HANDLER (absent from
    // `ANNOTATION_HANDLER_TYPES`; no class declares that `type`), nor that the two sibling
    // verbs it also fired write `AnnotationsState` — a store this dimension is not in.
    // Three refusals, and a green test.
    //
    // A dispatch assertion is only worth what the receiver is worth. The assertions below
    // are about the COMMAND that mutates the record the panel read.

    it('APPLY drives ONE UpdateAnnotationCommand through the CommandManager that owns the record', () => {
        const dim = makeLinearDim();
        const execute = vi.fn(() => ({ success: true, affectedElementIds: [dim.id] }));
        showLinearDimension(host, { execute }, dim);

        const applyBtn = Array.from(hostEl.querySelectorAll('button'))
            .find((b) => b.textContent?.includes('APPLY')) as HTMLButtonElement | undefined;
        expect(applyBtn, 'APPLY button rendered').toBeTruthy();

        applyBtn!.click();

        // ONE command — C03 §4.5-4.8: one user action is one undo entry. It used to be three.
        expect(execute, 'exactly one command for one APPLY').toHaveBeenCalledTimes(1);
        const cmd = (execute.mock.calls[0] as unknown as unknown[])[0] as {
            type: string;
            targetIds: string[];
            affectedStores: readonly string[];
            _patch: { style?: { textSizeMm?: number } };
        };
        expect(cmd.type).toBe('UPDATE_ANNOTATION');
        expect(cmd.targetIds).toEqual([dim.id]);
        expect(cmd.affectedStores).toEqual(['annotation']);

        // And the founder's actual edit — Text size — is IN the patch.
        expect(cmd._patch.style?.textSizeMm, 'the text size edit is carried').toBeTypeOf('number');

        // The handlerless bus verbs must not be fired any more.
        const busTypes = executeCommand.mock.calls.map((c) => c[0]);
        expect(busTypes).not.toContain('annotation.update');
        expect(busTypes).not.toContain('annotation.setTextHeight');
        expect(busTypes).not.toContain('annotation.setColor');
    });

    it('a REFUSED apply is shown in the panel and does NOT report success', () => {
        const dim = makeLinearDim();
        const execute = vi.fn(() => ({ success: false, affectedElementIds: [], error: 'Annotation not found' }));
        showLinearDimension(host, { execute }, dim);

        const applyBtn = Array.from(hostEl.querySelectorAll('button'))
            .find((b) => b.textContent?.includes('APPLY')) as HTMLButtonElement;
        applyBtn.click();

        expect(hostEl.textContent, 'the reason is on screen').toContain('Annotation not found');
        expect(applyBtn.textContent, 'no green tick over a refusal').not.toContain('APPLIED');
    });

    it('Delete Dimension deletes through the command that owns the subsystem store', () => {
        const dim = makeLinearDim();
        const execute = vi.fn(() => ({ success: true, affectedElementIds: [dim.id] }));
        showLinearDimension(host, { execute }, dim);

        const delBtn = Array.from(hostEl.querySelectorAll('button'))
            .find((b) => b.textContent?.includes('Delete Dimension')) as HTMLButtonElement;
        expect(delBtn, 'Delete button rendered').toBeTruthy();
        delBtn.click();

        const cmd = (execute.mock.calls[0] as unknown as unknown[])[0] as { type: string; targetIds: string[] };
        expect(cmd.type).toBe('DELETE_ANNOTATION');
        expect(cmd.targetIds).toEqual([dim.id]);
        expect(host.hide, 'panel closes only after a successful delete').toHaveBeenCalled();
        // The old code dispatched the bus verb, which refused, and hid the panel anyway.
        expect(executeCommand.mock.calls.map((c) => c[0])).not.toContain('annotation.delete');
    });

    it('a REFUSED delete leaves the panel OPEN — a refusal must not look like a success', () => {
        const dim = makeLinearDim();
        const execute = vi.fn(() => ({ success: false, affectedElementIds: [], error: 'Annotation not found' }));
        showLinearDimension(host, { execute }, dim);

        const delBtn = Array.from(hostEl.querySelectorAll('button'))
            .find((b) => b.textContent?.includes('Delete Dimension')) as HTMLButtonElement;
        delBtn.click();

        expect(host.hide, 'the panel must NOT close on a refused delete').not.toHaveBeenCalled();
    });
});

// ── 3. Selection → DELETE (L-173 completion) ────────────────────────────────────

describe('deleteSelectedDimension (L-173 keyboard-delete seam, P6)', () => {
    function makeDeps(over: {
        bim?: boolean;
        selectedId?: string | null;
        store?: Map<string, AnnotationElement>;
        del?: Mock<(annotationId: string) => void>;
    } = {}) {
        const store = over.store ?? new Map<string, AnnotationElement>();
        const del = over.del ?? vi.fn<(annotationId: string) => void>();
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
