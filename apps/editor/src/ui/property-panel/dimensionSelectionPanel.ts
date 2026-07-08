/**
 * dimensionSelectionPanel
 * -----------------------
 * §FIX-DIM-SELECT-PROPERTIES-PANEL (L-173)
 *
 * A dimension is a first-class SELECTABLE element: selecting one surfaces its
 * Properties Panel exactly like a wall. This module is the single, testable
 * seam that turns a `pryzm-element-selected` event into an open dimension
 * Properties Panel — mirroring how a wall selection reaches
 * `inspector.showElement` (see engineLauncher `updateInspector`).
 *
 * ARCHITECTURE (do not misread "like a wall"): a UI-drawn linear dimension is an
 * AnnotationElement in the documentation layer (ADR-0119 subsystem
 * annotationStore, Revit parity) — NOT model geometry. "Like a wall" means the
 * SAME Properties Panel surface + selectability, not promotion to a geometry
 * element. All mutations remain P6 commands inside the panel (annotation.update /
 * annotation.setColor / annotation.setTextHeight / annotation.delete).
 *
 * Pure UI wiring: no store writes, no THREE/DOM at module load (type-only
 * import of AnnotationElement). Consistent with the other property-panel modules
 * which are pure view builders.
 */

import type { AnnotationElement } from '@pryzm/plugin-annotations';

/** The `pryzm-element-selected` event payload fields this resolver consumes. */
export interface DimensionSelectionDetail {
    readonly elementId?: string;
    readonly annotationId?: string;
    readonly source?: string;
}

/** Narrow panel surface — just the dimension-open entry point (PropertyPanelAdapter). */
export interface DimensionPanelLike {
    showLinearDimension(ann: AnnotationElement, selectedWallId?: string): void;
}

/** Injected dependencies — keeps this resolver pure + unit-testable. */
export interface DimensionSelectionDeps {
    /** Resolve an id against the runtime annotation subsystem store. */
    getAnnotationById(id: string): AnnotationElement | undefined;
    /** The currently-selected BIM element id (drives the "Move Wall" affordance). */
    getSelectedElementId(): string | null | undefined;
    /** The shared Properties Panel (the SAME surface a wall uses). */
    panel: DimensionPanelLike;
}

/**
 * Resolve a `pryzm-element-selected` event to a linear-dim AnnotationElement and
 * open its Properties Panel. Returns `true` iff a dimension panel was opened.
 *
 * Skips silently (returns `false`) when the id is absent, resolves to no
 * annotation (e.g. a wall/other BIM id), or is a non-dimension annotation — so
 * normal BIM element selection is never disturbed.
 *
 * @param detail  The selection event payload (annotationId preferred, elementId
 *                fallback — a plan-view dimension pick carries both).
 * @param deps    Injected store/selection/panel surfaces.
 */
export function openDimensionPropertiesOnSelect(
    detail: DimensionSelectionDetail | null | undefined,
    deps: DimensionSelectionDeps,
): boolean {
    const id = detail?.annotationId ?? detail?.elementId;
    if (!id) return false;

    const ann = deps.getAnnotationById(id);
    if (!ann || ann.type !== 'linear-dim') return false;

    // Pass the currently-selected BIM element id so the panel can offer the
    // "Move Wall" drive-dimension affordance. showLinearDimension only surfaces
    // it when the dimension actually references that wall, so an unrelated /
    // non-wall selection is harmless.
    const selectedWallId = deps.getSelectedElementId() ?? undefined;
    deps.panel.showLinearDimension(ann, selectedWallId ?? undefined);
    return true;
}

/** Injected dependencies for {@link deleteSelectedDimension} — keeps it pure + testable. */
export interface DimensionDeleteDeps {
    /**
     * True when a 3D/BIM scene object (`selectionManager.selectedObject`) is the
     * active selection — that delete takes precedence, so we never hijack a real
     * element deletion.
     */
    hasBimSelection(): boolean;
    /** The currently-selected plan-view annotation id (`window.__pryzmSelectedAnnotationId`). */
    getSelectedAnnotationId(): string | null | undefined;
    /** Resolve an id against the runtime annotation subsystem store. */
    getAnnotationById(id: string): AnnotationElement | undefined;
    /** Dispatch the `annotation.delete` command (P6 — DeleteAnnotationHandler). */
    deleteAnnotation(annotationId: string): void;
}

/**
 * Delete the selected plan-view dimension/annotation — the final leg of the L-173
 * "first-class selectable element" contract (selectable → movable → DELETABLE).
 *
 * A UI-drawn dimension is an ADR-0119 subsystem AnnotationElement (Canvas2D-
 * rendered), NOT a scene `Object3D`. The keyboard Delete/Backspace handler
 * (`deleteSelected` in initUI) inspects only `selectionManager.selectedObject`,
 * so it can never reach a selected dimension → dims were undeletable via the
 * keyboard (founder L-173: "cannot be deleted"). This pure resolver is the single
 * testable seam that routes a selected-annotation delete through the
 * `annotation.delete` command (P6 — never a direct store write), mirroring the
 * Properties Panel "Delete Dimension" button.
 *
 * Returns `true` iff it deleted an annotation. Skips (returns `false`) when a 3D
 * BIM object is selected (that delete takes precedence), when nothing is selected,
 * or when the id is stale (resolves to no live annotation) — so normal BIM element
 * deletion is never disturbed.
 */
export function deleteSelectedDimension(deps: DimensionDeleteDeps): boolean {
    // A live 3D/BIM selection owns the delete gesture (element.delete path).
    if (deps.hasBimSelection()) return false;
    const id = deps.getSelectedAnnotationId();
    if (!id) return false;
    // Only act on a still-live annotation — a stale id (e.g. left over after an
    // empty-space deselect that already removed the record) resolves to nothing
    // and is a safe no-op.
    const ann = deps.getAnnotationById(id);
    if (!ann) return false;
    deps.deleteAnnotation(id);
    return true;
}
