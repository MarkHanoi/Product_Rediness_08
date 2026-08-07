/**
 * §FIX-DIM-ASSOCIATIVE-REFERENCES (L-287) — THE RECORD SPLIT, MADE STRUCTURAL.
 *
 * An annotation holds TWO different kinds of fact, and they must never be edited by the
 * same gesture:
 *
 *   (1) WHAT IT MEASURES / NAMES — `references` (and, for a dimension, the `modelPoints`
 *       that are merely a CACHE of them). This is a fact about the MODEL. Only a model
 *       edit may change it, and `AnnotationDependencyGraph` re-derives it.
 *   (2) HOW IT IS SHOWN — the perpendicular standoff of the dim line (`geometry2D.offset`),
 *       where the text sits (`screenOverride`), where a tag's bubble sits. This is a fact
 *       about the DRAWING. Only the user may change it, by dragging.
 *
 * The drag path used to call `UpdateAnnotationCommand` with BOTH `geometry2D` and
 * `references` — it translated every model point by the drag delta and stamped the dragged
 * position into `references[i].cachedPosition`. That is editing (1) with a gesture that
 * means (2): dragging a dimension "to move it out of the way" silently changed WHAT IT
 * MEASURED. For an associative dim the dependency graph then snaps it back on the next
 * flush (the drag appears to be ignored); for a baked one it is permanent (the drawing now
 * lies). Both are bugs, and both come from one missing boundary.
 *
 * This command IS that boundary. It accepts ONLY presentation fields. There is no
 * parameter through which a drag can reach `references` — not "guarded by a comment", but
 * absent from the type. A future author cannot make this mistake without first changing
 * this file, which is exactly the point.
 *
 * Contract: §01 §2 / P6 (mutation only through a command), ADR-0002 (declares
 * affectedStores), C03 (an annotation is an element; this is a lawful element edit).
 */

import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext,
} from '../legacy-command-protocol';
import { AnnotationElement, AnnotationGeometry2D } from '../subsystem/AnnotationTypes';

function resolveAnnotationStore(ctx: CommandContext | undefined): any | null {
    const fromCtx = ctx?.stores?.annotationStore ?? (ctx as any)?.annotationStore;
    if (fromCtx) return fromCtx;
    return typeof window !== 'undefined' ? window.annotationStore ?? null : null;
}

/**
 * The ONLY things a drag may change. Note what is NOT here: `references`, and the
 * measured `modelPoints` of a dimension.
 */
export interface AnnotationPresentationPatch {
    /**
     * The signed perpendicular standoff of the dimension line, in world metres — the
     * founder's "forward and backward". The measured points do not move; the LINE does.
     */
    readonly offset?: number;
    /** Screen-space override for the label/text position. */
    readonly screenOverride?: { readonly x: number; readonly y: number };
    /**
     * Where a TAG's symbol sits (the bubble / diamond at the end of the leader). A tag's
     * leader ANCHOR — `modelPoints[0]`, the point on the element — is NOT presentation and
     * cannot be moved here; only the far end of the leader can.
     */
    readonly symbolPoint?: { readonly x: number; readonly y: number; readonly z: number };
}

/** Annotation types whose geometry is a MEASUREMENT: their model points are a cache. */
const MEASURED_TYPES: ReadonlySet<string> = new Set([
    'linear-dim', 'linear-dimension', 'angular-dim', 'radius-dim', 'diameter-dim', 'slope-dim',
]);

export class UpdateAnnotationPresentationCommand implements Command {
    readonly affectedStores = ['annotation'] as const;
    id = crypto.randomUUID();
    type = CommandType.UPDATE_ANNOTATION;
    timestamp = Date.now();
    targetIds: string[];

    /** The pre-edit geometry — the exact thing undo restores. References are never touched. */
    private _prev: AnnotationGeometry2D | null = null;

    constructor(
        private _annotationId: string,
        private _patch: AnnotationPresentationPatch,
    ) {
        this.targetIds = [_annotationId];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const store = resolveAnnotationStore(ctx);
        if (!store) return { ok: false, reason: 'AnnotationStore not initialised' };
        const ann: AnnotationElement | undefined = store.getById?.(this._annotationId);
        if (!ann) return { ok: false, reason: `Annotation ${this._annotationId} not found` };
        if (this._patch.offset === undefined
            && this._patch.screenOverride === undefined
            && this._patch.symbolPoint === undefined) {
            return { ok: false, reason: 'Presentation patch is empty' };
        }
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const store = resolveAnnotationStore(ctx);
        const ann: AnnotationElement | undefined = store?.getById?.(this._annotationId);
        if (!store || !ann) {
            return { success: false, affectedElementIds: [], error: 'Annotation not found' };
        }
        this._prev = JSON.parse(JSON.stringify(ann.geometry2D));
        store.update({ id: this._annotationId, geometry2D: this._apply(ann) });
        return { success: true, affectedElementIds: [this._annotationId] };
    }

    undo(ctx: CommandContext): CommandResult {
        const store = resolveAnnotationStore(ctx);
        if (!store || !this._prev) {
            return { success: false, affectedElementIds: [], error: 'Cannot undo: snapshot missing' };
        }
        store.update({ id: this._annotationId, geometry2D: this._prev });
        return { success: true, affectedElementIds: [this._annotationId] };
    }

    /**
     * Build the next geometry from the patch. The measured points are copied through
     * UNCHANGED for a dimension; for a tag, only the SYMBOL end of the leader moves.
     */
    private _apply(ann: AnnotationElement): AnnotationGeometry2D {
        const g = ann.geometry2D;
        const next: AnnotationGeometry2D = {
            ...g,
            modelPoints: (g.modelPoints ?? []).map((p) => ({ ...p })),
        };
        if (this._patch.offset !== undefined) next.offset = this._patch.offset;
        if (this._patch.screenOverride !== undefined) {
            next.screenOverride = { ...this._patch.screenOverride };
        }
        if (this._patch.symbolPoint !== undefined && !MEASURED_TYPES.has(ann.type)) {
            // A leader'd tag: points[0] is the ANCHOR (on the element — not presentation),
            // points[1] is the symbol. A single-point annotation (room tag, text note, north
            // arrow) has no anchor of its own: its one point IS where it is drawn.
            const pts = next.modelPoints;
            const idx = pts.length >= 2 ? pts.length - 1 : 0;
            pts[idx] = { ...this._patch.symbolPoint };
        }
        return next;
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            // §ANN-REMOTE-FACTORY — `UpdateAnnotationCommand` shares this CommandType and
            // the identical `{annotationId, patch}` payload shape, so the wire format alone
            // could not tell a remote peer which class to rebuild. `payloadKind` is the
            // discriminator. Additive and back-compatible: an older peer omits it and
            // CommandRegistry falls back to the general UpdateAnnotationCommand.
            payload: { payloadKind: 'presentation', annotationId: this._annotationId, patch: this._patch },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }
}
