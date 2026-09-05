/**
 * §G9-PERSIST — Annotation persistence helper (V1 launch readiness, audit §3.6 / G9)
 *
 * ROOT CAUSE (audit G9): Every annotation tool fired the bus telemetry verb
 * `annotation.create` with a lossy `{ id, viewId, kind }` payload,
 * but only `LinearDimensionAnnotationTool` ALSO dispatched the legacy
 * `CreateAnnotationCommand` through `commandManager`. The bus handler
 * (`CreateAnnotationHandler`) wrote an ANCHOR-KEYED Zustand `AnnotationsState`
 * store that carried only { id, viewId, kind } — NOT the subsystem
 * `annotationStore` that `AnnotationRenderLayer` reads and `ProjectSerializer`
 * persists. As a result every non-linear annotation (angular/slope/radius/
 * diameter dims, text notes, all tags, spot elevations, keynotes, revision
 * clouds, grid bubbles) was computed, logged, then silently dropped — it never
 * rendered and never survived save/load.
 *
 * ⭐ §P6-BUS-IS-THE-PATH (2026-09-04) — THIS HELPER NOW DISPATCHES THE BUS VERB.
 *
 * The paragraph above is the reason it did NOT, and that reason is GONE:
 * §ANN-ONE-STORE gave `annotation.create` a RICH-PAYLOAD PASSTHROUGH
 * (`isFullElementPayload` → `sinkCreate`), so a full subsystem `AnnotationElement`
 * handed to the bus verb is stored VERBATIM in the canonical `annotationStore` —
 * the same store `CreateAnnotationCommand` wrote, with geometry2D / references /
 * parameters / style intact. The lossy flat-schema flattening that made the bus
 * verb unusable for tools no longer happens for this shape. `GridPlanToolHandler`
 * and `TextNoteTool` already dispatch exactly this way.
 *
 * ⚠ THE RETURN VALUE MEANS "DISPATCHED", NOT "LANDED", and it always did — the
 * legacy path returned true whenever `execute()` did not throw. `executeCommand`
 * is async, so a REFUSAL now arrives as a rejected promise and is logged here
 * rather than thrown at the caller. All thirteen production callers discard the
 * boolean; it exists so a tool can tell "the command system is not up yet" from
 * "the write was attempted".
 *
 * Contract compliance:
 *   C03 §P6 — the typed bus verb is the mutation path; no store write here.
 *   C16     — `<family>.<verb>` dispatch with a data payload.
 *   C14 §3  — removes one of the last legacy-manager reads on the tool path.
 */

import type { AnnotationElement } from '../subsystem/AnnotationTypes';

/**
 * Persist a freshly-built AnnotationElement to the subsystem annotation store
 * through the authoritative CreateAnnotationCommand path.
 *
 * Safe to call even when the command manager is not yet available (early boot):
 * it no-ops with a warning rather than throwing, so tool interaction never
 * breaks.
 *
 * @returns true when the command was dispatched, false otherwise.
 */
export function persistAnnotation(element: AnnotationElement): boolean {
    const bus = typeof window !== 'undefined' ? window.runtime?.bus : undefined;
    if (!bus || typeof bus.executeCommand !== 'function') {
        console.warn(
            '[persistAnnotation] §G9-PERSIST: runtime command bus unavailable — ' +
            `annotation ${element.id} (${element.type}) not persisted`,
        );
        return false;
    }
    try {
        // The canonical store write happens on THIS stack (the handler runs before
        // `executeCommand` first awaits); the promise carries the event record, the
        // undo entry and any refusal. A refusal is logged, never swallowed.
        void Promise.resolve(bus.executeCommand('annotation.create', element)).catch(
            (err: unknown) => console.error(
                '[persistAnnotation] §G9-PERSIST: annotation.create refused for ' +
                `${element.id} (${element.type}):`, err,
            ),
        );
        return true;
    } catch (err) {
        console.error('[persistAnnotation] §G9-PERSIST: annotation.create dispatch failed:', err);
        return false;
    }
}
