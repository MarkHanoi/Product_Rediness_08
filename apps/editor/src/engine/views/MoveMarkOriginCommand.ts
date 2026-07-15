/**
 * §FIX-ELEVATION-MARK-MOVE-ORIGIN (L-305) — MOVE THE WHOLE MARK BY ITS ORIGIN GLYPH.
 *
 * An elevation (or section) mark is TWO things that share one anchor:
 *   (a) an ANNOTATION with a circle glyph + facingDirection drawn in the plan
 *       (its position lives in `annotation.geometry2D.modelPoints` +
 *       `annotation.parameters.position`), AND
 *   (b) a LINKED VIEW whose spatial context carries a `sectionVolume.origin`, a
 *       `cropRegion`, and a `sectionPlane`.
 *
 * Grabbing the origin circle and dragging it must move BOTH, because they are the
 * same point encoded twice. If only the volume moves, the glyph stays behind; if
 * only the glyph moves, the view does not follow. This command is the ONE
 * mutation that touches both stores, so the whole gesture is ONE undo entry
 * (C16 — one gesture = one undo). It mirrors the dual-store shape of
 * CreateElevationMarkCommand (which also owns `['view', 'annotation']`).
 *
 * PURE TRANSLATION invariant: `direction`, `near`/`far` (depth), `width` and
 * `height` are NEVER touched here — only the origin point (and everything that is
 * a pure function of the origin: the derived `cropRegion`, the `sectionPlane`
 * constant, the crop's absolute world-H window, and the annotation's model
 * points) moves. A caller that also rotated or rescaled would be passing values
 * this command has no business computing; it applies exactly what it is handed.
 *
 * Undo/redo: CommandManager's `undo()` calls THIS command's `undo()` (it does not
 * auto-restore `view`/`annotation` — those are not snapshot stores), so the
 * pre-drag state is captured at `execute()` time and restored on `undo()`. `redo`
 * re-runs `execute()`, which re-captures the (now-restored) pre-drag state before
 * re-applying the move — so redo is exact.
 *
 * P6: dispatched through the command path (`commandManager.execute`), never a raw
 * store write. Live-preview writes during the drag are view-state only (L-222) and
 * are restored to the pre-drag snapshot before this command commits.
 */

import {
    viewDefinitionStore,
    type ViewDefinition,
    type ViewSectionVolume,
    type ViewCropSettings,
} from '@pryzm/core-app-model';
import { annotationStore } from '@pryzm/plugin-annotations';
import type { AnnotationElement } from '@pryzm/plugin-annotations';

interface Vec3Like { x: number; y: number; z: number }

/** The final (post-move) state this command applies. All values are absolute. */
export interface MoveMarkOriginTarget {
    annotationId: string;
    viewId: string;
    /** New model points for the annotation (glyph anchor + direction endpoint), translated. */
    nextModelPoints: Vec3Like[];
    /** New `parameters.position` for the annotation, translated (kept in sync with modelPoints[0]). */
    nextPosition?: Vec3Like;
    /** The moved section volume (origin changed; direction/width/height/near/far invariant). */
    nextSectionVolume: ViewSectionVolume;
    /** The re-derived world-XZ crop pre-filter box. */
    nextCropRegion: NonNullable<ViewDefinition['spatial']['cropRegion']>;
    /** The re-derived section plane (normal invariant; constant tracks the moved origin). */
    nextSectionPlane: { normal: [number, number, number]; constant: number };
    /** The translated crop (absolute world-H window shifted; vertical/farClip invariant). Null clears. */
    nextCrop: ViewCropSettings | null;
}

interface PrevState {
    annGeometry2D: AnnotationElement['geometry2D'];
    annParameters: AnnotationElement['parameters'];
    spatial: ViewDefinition['spatial'];
    crop: ViewCropSettings | undefined;
}

/**
 * Minimal legacy-Command shape consumed by `window.commandManager.execute()`
 * (see CommandManagerImpl.execute → canExecute / execute / undo / affectedStores).
 * Declared structurally so this file adds no cross-package runtime edge.
 */
export class MoveMarkOriginCommand {
    readonly affectedStores = ['view', 'annotation'] as const;
    readonly type = 'mark.moveOrigin';
    readonly id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `mmo-${Date.now()}`;
    readonly timestamp = Date.now();
    readonly targetIds: string[];
    readonly nonUndoable = false;

    private _prev: PrevState | null = null;

    constructor(private readonly target: MoveMarkOriginTarget) {
        this.targetIds = [target.viewId, target.annotationId];
    }

    canExecute(): { ok: boolean; reason?: string } {
        if (!this.target.annotationId) return { ok: false, reason: 'annotationId required' };
        if (!this.target.viewId) return { ok: false, reason: 'viewId required' };
        if (!annotationStore.getById(this.target.annotationId)) return { ok: false, reason: 'annotation not found' };
        if (!viewDefinitionStore.get(this.target.viewId)) return { ok: false, reason: 'linked view not found' };
        return { ok: true };
    }

    execute(): { success: boolean; affectedElementIds: string[]; error?: string } {
        const ann = annotationStore.getById(this.target.annotationId);
        const view = viewDefinitionStore.get(this.target.viewId);
        if (!ann || !view) {
            return { success: false, affectedElementIds: [], error: 'annotation or linked view missing' };
        }

        // Capture pre-move state for an exact undo (and for a correct redo, which
        // re-runs execute() after undo has restored this same state).
        this._prev = {
            annGeometry2D: structuredClone(ann.geometry2D),
            annParameters: structuredClone(ann.parameters),
            spatial: structuredClone(view.spatial),
            crop: view.crop ? structuredClone(view.crop) : undefined,
        };

        this._applyAnnotation(this.target.nextModelPoints, this.target.nextPosition);
        // Merge-forward the moved spatial fields; the rest of the spatial context
        // (levelId, viewRange, projectionDirection …) is preserved by update()'s merge.
        viewDefinitionStore.update(this.target.viewId, {
            spatial: {
                sectionVolume: this.target.nextSectionVolume,
                cropRegion: this.target.nextCropRegion,
                sectionPlane: this.target.nextSectionPlane,
            },
        });
        viewDefinitionStore.setCrop(this.target.viewId, this.target.nextCrop);

        return { success: true, affectedElementIds: [this.target.viewId, this.target.annotationId] };
    }

    undo(): { success: boolean; affectedElementIds: string[]; error?: string } {
        if (!this._prev) return { success: false, affectedElementIds: [], error: 'no pre-move snapshot' };
        const ann = annotationStore.getById(this.target.annotationId);
        if (ann) {
            annotationStore.update({
                id: this.target.annotationId,
                geometry2D: this._prev.annGeometry2D,
                parameters: this._prev.annParameters,
            });
        }
        // setSpatial REPLACES (not merges) so a key the forward patch ADDED cannot
        // survive the undo (§VIEW-UNDO-SPATIAL-MERGE-RESIDUE).
        viewDefinitionStore.setSpatial(this.target.viewId, this._prev.spatial);
        viewDefinitionStore.setCrop(this.target.viewId, this._prev.crop ?? null);
        return { success: true, affectedElementIds: [this.target.viewId, this.target.annotationId] };
    }

    serialize(): unknown {
        return { type: this.type, payload: { target: this.target }, targetIds: this.targetIds, timestamp: this.timestamp, version: 1 };
    }

    private _applyAnnotation(modelPoints: Vec3Like[], position?: Vec3Like): void {
        const ann = annotationStore.getById(this.target.annotationId);
        if (!ann) return;
        annotationStore.update({
            id: this.target.annotationId,
            geometry2D: { ...ann.geometry2D, modelPoints: modelPoints.map(p => ({ ...p })) },
            parameters: position
                ? { ...ann.parameters, position: { ...position } }
                : ann.parameters,
        });
    }
}
