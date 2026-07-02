/**
 * §G9-PERSIST — Annotation persistence helper (V1 launch readiness, audit §3.6 / G9)
 *
 * ROOT CAUSE (audit G9): Every annotation tool fired the bus telemetry
 *   `window.runtime.bus.executeCommand('annotation.create', { id, viewId, kind })`
 * but only `LinearDimensionAnnotationTool` ALSO dispatched the legacy
 * `CreateAnnotationCommand` through `commandManager`. The bus handler
 * (`CreateAnnotationHandler`) writes an ANCHOR-KEYED Zustand `AnnotationsState`
 * store that carries only { id, viewId, kind } — NOT the subsystem
 * `annotationStore` that `AnnotationRenderLayer` reads and `ProjectSerializer`
 * persists. As a result every non-linear annotation (angular/slope/radius/
 * diameter dims, text notes, all tags, spot elevations, keynotes, revision
 * clouds, grid bubbles) was computed, logged, then silently dropped — it never
 * rendered and never survived save/load.
 *
 * This helper writes the FULL AnnotationElement (with modelPoints, refs and
 * parameters) to the subsystem store via the authoritative command path.
 *
 * Contract compliance:
 *   §01 §2  — CommandManager.execute() is the only write path (P6: commands are
 *             the only mutation path). This gives the annotation an undo/redo
 *             entry, exactly like the linear-dimension tool.
 *   §01 §5  — No direct store writes here; the command owns the mutation.
 *
 * The command is resolved lazily off `window.commandManager` so tools that were
 * never given a CommandManager reference in their constructor need no signature
 * change. `window.commandManager` is the same instance passed to
 * AnnotationManager / LinearDimensionAnnotationTool (initTools.ts).
 */

import { CreateAnnotationCommand } from '../commands/CreateAnnotationCommand';
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
    const cm = typeof window !== 'undefined' ? window.commandManager : undefined;
    if (!cm || typeof cm.execute !== 'function') {
        console.warn(
            '[persistAnnotation] §G9-PERSIST: window.commandManager unavailable — ' +
            `annotation ${element.id} (${element.type}) not persisted`,
        );
        return false;
    }
    try {
        cm.execute(new CreateAnnotationCommand(element));
        return true;
    } catch (err) {
        console.error('[persistAnnotation] §G9-PERSIST: CreateAnnotationCommand failed:', err);
        return false;
    }
}
