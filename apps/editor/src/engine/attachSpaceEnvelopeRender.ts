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
 * ⚠ WHAT THIS FILE DOES NOT ESTABLISH — CORRECTED 2026-09-05 (§RESI-STAGE-G). This
 * paragraph read *"That the prism appears in PLAN or in SECTION. There is no plan-symbol
 * producer for this family"*. **The PLAN half is now false and the SECTION half is still
 * true.** `SpaceEnvelopePlanSymbolBuilder` exists, `EdgeProjectorService` injects it on
 * the plan-family view types, and this function installs its reader below — so a level
 * envelope draws as an outline and a room as an outline plus a hatch. There is still NO
 * elevation/section producer, and the plan symbol is LINEWORK: the per-room colour of the
 * 3-D view does not cross into the drawing, because the pen table is the one style
 * authority there (Contract 23 §7.1). Registering the id with the view dependency tracker
 * and `BimManager` (below) makes the element and its storey KNOWN to the pipeline; it is
 * still not what draws it.
 */

import * as THREE from '@pryzm/renderer-three/three';
import type { SpaceEnvelopeFaceRef } from '@pryzm/geometry-space-envelope';
import { SpaceEnvelopeMeshBuilder } from './SpaceEnvelopeMeshBuilder';
import {
    installSpaceEnvelopeFaceDrag,
    type DraggableSpaceEnvelope,
} from './spaceEnvelopeFaceDragController';
// §25.6 gesture 1 (2026-09-06) — the per-face arrow. Constructed HERE rather than in
// `initTools` for the same reason the plan reader is: it needs exactly the scene this
// function already holds, and a second construction site would be a second set of arrows.
import { SpaceEnvelopeFaceGizmoBuilder } from './SpaceEnvelopeFaceGizmoBuilder';
// §RESI-STAGE-G — the PLAN leg. Installed here rather than in `initTools` because the
// reader needs exactly what this function already holds (the store) and nothing else; a
// second wiring site would be a second place for the plan and the 3-D view to disagree
// about which records exist.
import {
    installSpaceEnvelopePlanSymbolBuilder,
    uninstallSpaceEnvelopePlanSymbolBuilder,
    type SpaceEnvelopePlanEntry,
} from './SpaceEnvelopePlanSymbolBuilder';

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
    /**
     * §RESI-STAGE-G (2026-09-06) — double-click a prism face to edit its FOOTPRINT
     * (C114 §11 item 7). Threaded straight to the face-drag controller, which owns the only
     * raycast that can resolve an envelope under the pointer. Omit it and the gesture is
     * absent — the ContextualEditBar's "Edit Profile" button is the other way in.
     */
    readonly onProfileEdit?: (spaceEnvelopeId: string) => void;
    /**
     * ⛔ §25.6 GESTURE 1 — TURN THE CAMERA ORBIT OFF WHILE A FACE IS DRAGGED. Omit it
     * and the camera orbits under the drag, because `camera-controls` binds the SAME
     * canvas and `stopPropagation` does not stop a same-element listener. Every other
     * direct-manipulation drag in this app disables the controls; `initTools` passes it.
     */
    readonly setCameraControlsEnabled?: (enabled: boolean) => void;
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

    // ⭐ §RESI-STAGE-G — THE PLAN READER, INSTALLED BEFORE THE FIRST DRAW. It reads the
    // SAME store the prisms are built from, per projection and lazily, so a plan drawn
    // after a face drag shows the dragged ring rather than a snapshot: the two views
    // cannot disagree about the model because there is only one model between them.
    //
    // ⚠ `baseElevation: null` IS DELIBERATE AND IS NOT A `?? 0`. This function is not
    // given a storey-elevation resolver (`initTools` owns the one `bimManager` lookup),
    // and inventing 0 here would be the §DIAG-WALL-LEVEL defect. A plan projection is
    // top-down, so the value moves no stroke; the builder says so once, out loud.
    installSpaceEnvelopePlanSymbolBuilder((levelId: string): readonly SpaceEnvelopePlanEntry[] => {
        const out: SpaceEnvelopePlanEntry[] = [];
        for (const raw of deps.store.getState().values()) {
            const r = raw as {
                id?: string; role?: string; levelId?: string;
                footprint?: readonly { x: number; z: number }[];
                baseOffset?: number;
            };
            if (!r || typeof r.id !== 'string' || r.id.length === 0) continue;
            if ((r.levelId ?? '') !== levelId) continue;
            if (!Array.isArray(r.footprint) || r.footprint.length < 3) continue;
            out.push({
                id: r.id,
                role: r.role ?? 'room',
                footprint: r.footprint,
                baseOffset: typeof r.baseOffset === 'number' && Number.isFinite(r.baseOffset) ? r.baseOffset : 0,
                baseElevation: null,
            });
        }
        return out;
    });

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
    let gizmo: SpaceEnvelopeFaceGizmoBuilder | null = null;
    if (deps.domElement && deps.dispatchFaceMove && deps.camera) {
        // ⭐ §25.6 GESTURE 1 — THE ARROWS. Created only on the interactive path: a
        // read-only draw (a thumbnail, a bake) has no pointer, so handles on it would be
        // scene weight nobody can grab.
        gizmo = new SpaceEnvelopeFaceGizmoBuilder(deps.scene);
        disposeDrag = installSpaceEnvelopeFaceDrag({
            domElement: deps.domElement,
            camera: deps.camera,
            builder,
            gizmo,
            ...(deps.setCameraControlsEnabled
                ? { setCameraControlsEnabled: deps.setCameraControlsEnabled }
                : {}),
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
            // §RESI-STAGE-G — the double-click seam. Passed through rather than installed
            // here: the controller already holds the pick, and a second listener on the same
            // canvas would race it for the same event.
            ...(deps.onProfileEdit ? { onProfileEdit: deps.onProfileEdit } : {}),
        });
    }

    return () => {
        try { unsubscribe(); } catch { /* non-fatal */ }
        // ⚠ THE DRAG DISPOSER RUNS BEFORE THE GIZMO IS DISPOSED, and the order matters:
        // it is the one that hands the camera back if a drag was live, and it clears the
        // arrows through the builder that is about to be torn down.
        try { disposeDrag?.(); } catch { /* non-fatal */ }
        try { gizmo?.dispose(); } catch { /* non-fatal */ }
        // ⛔ The plan reader closes over THIS store. Leaving it installed would let the
        // next project's plan be drawn from the previous project's envelopes — the exact
        // shape of the double-subscription this disposer already exists to prevent.
        try { uninstallSpaceEnvelopePlanSymbolBuilder(); } catch { /* non-fatal */ }
        for (const id of builder.drawnIds()) builder.removeSpaceEnvelope(id);
    };
}
