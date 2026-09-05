/**
 * attachSpaceEnvelopeRender — the store's dirty channel becomes the 3-D prism, and the
 * prism becomes draggable by the face.
 *
 * §FEAT-SPACE-ENVELOPE (L-12900) · C114 §10 / §14a · ADR-0380 · C84 EI-9 · C03 §4.6.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ ONE ROAD, NOT THREE: `Store.subscribeDirty()`.
 * ═══════════════════════════════════════════════════════════════════════════════
 * `water` needed three separate things to become visible — a typed `RuntimeEvents`
 * member, a bus subscriber in `initTools`, and a `registerWaterRenderSink` for the undo
 * path — because `performUndoRedo` applies inverse patches straight to the stores and
 * emits NO bus events (measured: zero `events.emit` in that file). Miss the sink and the
 * water reverts in the model and stays on screen.
 *
 * ⛔ THIS FAMILY OWES NONE OF THAT, and the reason is a property of `Store`, not a
 * shortcut. `applyPatch()` notifies `subscribeDirty` on EXECUTE, UNDO and REDO alike —
 * it is the same method the bus calls on execute and the same method
 * `composedStoreUndoAdapter('spaceEnvelope', …)` calls on Ctrl+Z. So one subscription
 * serves all three directions, and there is no second render channel to disagree with
 * the first (C84 EI-9). It is `bathroomPodMemberMirror`'s shape, applied to drawing
 * instead of to member projection.
 *
 * ⚠ AND IT IS WHY `performUndoRedo.ts`'s `spaceEnvelope` row can stay the GENERIC
 * adapter. That row already carries the warning: *"if the prism comes to be drawn off
 * `spaceEnvelope.*` bus EVENTS, an undo is not a command and `CommandEventBridge` never
 * sees it — the seam would then need the bespoke shape."* Drawing off the STORE instead
 * of off events is precisely what keeps that row honest, and this file is why. ⛔ Do not
 * "improve" this into a bus-event subscriber without changing that row in the same
 * commit.
 *
 * ⚠ WHAT THIS FILE DOES NOT ESTABLISH. That the prism appears in PLAN or in SECTION.
 * There is no plan-symbol producer for this family; registering the id with the view
 * dependency tracker and `BimManager` (below) makes the element and its storey KNOWN to
 * that pipeline — it is not what draws it. Stated here rather than discovered from a
 * screenshot, and the identical caveat `initTools` records for `water`.
 */

import * as THREE from '@pryzm/renderer-three/three';
import type { SpaceEnvelopeFaceRef } from '@pryzm/geometry-space-envelope';
import { SpaceEnvelopeMeshBuilder } from './SpaceEnvelopeMeshBuilder';
import {
    installSpaceEnvelopeFaceDrag,
    type DraggableSpaceEnvelope,
} from './spaceEnvelopeFaceDragController';

/** The store shape `subscribeDirty` lives on. Structural, so no import edge is owed. */
export interface DirtySpaceEnvelopeStore {
    getState(): ReadonlyMap<string, unknown>;
    subscribeDirty(
        listener: (
            diff: {
                readonly added: ReadonlySet<string>;
                readonly updated: ReadonlySet<string>;
                readonly removed: ReadonlySet<string>;
            },
            state: ReadonlyMap<string, unknown>,
        ) => void,
    ): () => void;
}

export interface SpaceEnvelopeRenderDeps {
    readonly store: DirtySpaceEnvelopeStore;
    /** The scene root the prisms are added to. */
    readonly scene: THREE.Object3D;
    /** The canvas, for the face-drag pointer listeners. Omit to draw without dragging. */
    readonly domElement?: HTMLElement;
    /** The LIVE camera, read per event — a cached one goes stale on a view switch. */
    readonly camera?: () => THREE.Camera;
    /** Dispatch `spaceEnvelope.moveFace` through the bus. THE only mutation path (P6). */
    readonly dispatchFaceMove?: (payload: {
        spaceEnvelopeId: string;
        face: SpaceEnvelopeFaceRef;
        deltaM: number;
    }) => void;
    readonly onRefusal?: (message: string) => void;
    /** Make the element and its storey known to the plan pipeline. Best effort. */
    readonly registerElement?: (id: string, levelId: string) => void;
}

/**
 * Wire the family's 3-D leg. Returns a disposer that removes the subscription, the
 * pointer listeners and every drawn group — call it on project teardown, or the next
 * runtime gets two subscribers and every envelope is drawn twice.
 */
export function attachSpaceEnvelopeRender(deps: SpaceEnvelopeRenderDeps): () => void {
    const builder = new SpaceEnvelopeMeshBuilder(deps.scene);

    /** Draw one record, reporting a refusal to draw BY NAME rather than skipping it. */
    const draw = (id: string, state: ReadonlyMap<string, unknown>): void => {
        const record = state.get(id) as DraggableSpaceEnvelope | undefined;
        if (!record) return;
        const outcome = builder.updateSpaceEnvelope(record);
        if (outcome.drew === 'nothing') {
            // The builder's own sentence, verbatim. An envelope that is in the store and
            // not on screen now says WHY, at the layer that knows.
            console.warn(`[spaceEnvelope] '${id}' drew NOTHING — ${outcome.reason}`);
            return;
        }
        // ⚠ Canonical level resolution, the §DIAG-WALL-LEVEL rule: `'' ?? 'L0'` is `''`,
        // so an EMPTY levelId must be refused rather than defaulted, or the envelope
        // bleeds onto the ground plan.
        const levelId = (record.levelId ?? '').trim();
        if (levelId.length === 0) {
            console.warn(
                `[spaceEnvelope] ⚠ '${id}' has NO levelId — skipping spatial registration to avoid `
                + 'bleeding it onto the ground plan.',
            );
            return;
        }
        try { deps.registerElement?.(id, levelId); }
        catch (err) { console.warn('[spaceEnvelope] registerElement failed (non-fatal):', err); }
    };

    // ── The initial draw. ⭐ NOT OPTIONAL, AND NOT A CONVENIENCE. A subscriber alone
    // draws only what changes AFTER it is installed, so every envelope restored by
    // `restoreCompoundFamilies` — which runs on project open, before this — would be in
    // the model and invisible. That is the same half-wired shape as a save with no
    // restore, one layer out.
    for (const id of deps.store.getState().keys()) draw(id, deps.store.getState());

    const unsubscribe = deps.store.subscribeDirty((diff, state) => {
        // ⚠ REMOVALS FIRST. By the time this listener runs `Store` has already reconciled
        // its Map, so a removed id is unreadable from `state` — reaping it is the only
        // thing that can be done with it, and doing it first keeps the scene from
        // briefly holding a group whose record is gone.
        for (const id of diff.removed) builder.removeSpaceEnvelope(id);
        for (const id of diff.added) draw(id, state);
        for (const id of diff.updated) draw(id, state);
    });

    let disposeDrag: (() => void) | null = null;
    if (deps.domElement && deps.dispatchFaceMove && deps.camera) {
        disposeDrag = installSpaceEnvelopeFaceDrag({
            domElement: deps.domElement,
            camera: deps.camera,
            builder,
            // ⛔ LAZY, EVERY TIME. The drag reads the AUTHORITATIVE record at the moment
            // of the gesture; a snapshot captured at install time would let a drag start
            // from a footprint the store no longer holds and commit a delta measured
            // against it.
            getRecord: (id: string) => deps.store.getState().get(id) as DraggableSpaceEnvelope | undefined,
            // §RESI-STAGE-G — the WHOLE store, per pointer move, so the preview is judged
            // by the contextual planner (containment + the neighbour that shares the face)
            // exactly as the commit will be. Lazy for the same reason `getRecord` is.
            getWorld: () => [...deps.store.getState().values()] as DraggableSpaceEnvelope[],
            dispatch: deps.dispatchFaceMove,
            ...(deps.onRefusal ? { onRefusal: deps.onRefusal } : {}),
        });
    }

    return () => {
        try { unsubscribe(); } catch { /* non-fatal */ }
        try { disposeDrag?.(); } catch { /* non-fatal */ }
        for (const id of builder.drawnIds()) builder.removeSpaceEnvelope(id);
    };
}
