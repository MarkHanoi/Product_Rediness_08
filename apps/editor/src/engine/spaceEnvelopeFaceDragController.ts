/**
 * spaceEnvelopeFaceDragController — §FEAT-SPACE-ENVELOPE (L-12900) · C114 §10 ·
 * ADR-0380 D4 · C16 §8.6 · C83 §1.2 · P6.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ THE FOUNDER'S §2.4, AT THE POINTER: grab ONE face, it moves along ITS OWN
 *    perpendicular, the connected faces adapt, and a move that would destroy the
 *    solid REFUSES with both numbers instead of clamping.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ─── WHY THIS IS NOT `TransformControls` ────────────────────────────────────────
 * The gizmo in `initTransformControllers.ts` translates an OBJECT along a WORLD axis
 * and is exactly right for a door, a column or a whole envelope. It cannot express
 * this gesture for two structural reasons, neither of them cosmetic:
 *
 *   1. Its subject is an `Object3D`, so its finest granularity is "the envelope".
 *      This gesture's subject is ONE FACE of `n + 2`, which is why
 *      `SpaceEnvelopeMeshBuilder` draws the prism as per-face meshes carrying
 *      `userData.spaceEnvelopeFace` — the solver's own `SpaceEnvelopeFaceRef`.
 *   2. Its axes are X / Y / Z. A side face's axis is the OUTWARD NORMAL OF ITS RING
 *      EDGE, which for a non-orthogonal storey outline is neither. Dragging such a
 *      wall along world-X would SKEW the footprint rather than offset that wall —
 *      and the result would still look plausible, which is the class of defect that
 *      survives review.
 *
 * ─── ONE PLANNER, TWO USES, AND THAT IS THE POINT ───────────────────────────────
 * The live preview and the commit both call `planSpaceEnvelopeFaceMove`. So a drag
 * the commit would refuse is refused DURING the drag, with the same sentence and the
 * same two numbers — the preview can never promise something the commit then declines
 * (C114 §12a, and the reason `@pryzm/geometry-space-envelope` owns the planner while
 * owning no drawing at all).
 *
 * ⛔ THE PREVIEW IS NOT A COMMIT AND MUST NEVER BECOME ONE (P6). While the pointer is
 * down, this REDRAWS through the mesh builder and writes NOTHING to any store. Exactly
 * ONE `spaceEnvelope.moveFace` is dispatched, on release, so one gesture costs one
 * Ctrl+Z — the ring entry is bought by the single `produceCommand` inside that handler,
 * and a per-frame dispatch would spend the user's undo history on the smoothness of
 * their mouse.
 *
 * ⚠ AND A DRAG THAT ENDED WHERE IT STARTED DISPATCHES NOTHING. A no-op still mints a
 * ring entry and spends the next Ctrl+Z on an edit that never happened (C113 §6.4, the
 * rule `SetSpaceEnvelopeParameterHandler.canExecute` already adopted).
 *
 * ⛔ TYPE A IS NOT DRAGGABLE HERE, BY CONSTRUCTION AND NOT BY POLICY. Only `level` and
 * `room` envelopes exist to grab: `role: 'maximumBuildable'` is refused at the create
 * verb (ADR-0380 D2), so no record with that role can be in the store to be drawn, let
 * alone dragged. The guard below is therefore defence in depth against a future
 * promotion, and it names its reason rather than silently ignoring the pointer.
 */

import * as THREE from '@pryzm/renderer-three/three';
import {
    closestPointOnFaceAxis,
    planSpaceEnvelopeFaceMoveInContext,
    prismOfSpaceEnvelopeRecord,
    readSpaceEnvelopeFaceDrag,
    spaceEnvelopeFaceAxis,
    type SpaceEnvelopeContextEntry,
    type SpaceEnvelopeFaceRef,
} from '@pryzm/geometry-space-envelope';
import type { SpaceEnvelopeMeshBuilder, SpaceEnvelopeRenderInput } from './SpaceEnvelopeMeshBuilder';

/** The record shape the controller needs. Read from the ONE store, never cached. */
export interface DraggableSpaceEnvelope extends SpaceEnvelopeRenderInput {
    readonly footprint: ReadonlyArray<{ readonly x: number; readonly z: number }>;
    readonly baseOffset: number;
    readonly height: number;
    /** §RESI-STAGE-G — the membership the CONTEXTUAL planner judges containment against. */
    readonly withinId?: string | null;
    readonly name?: string;
}

/**
 * §RESI-STAGE-G — one record as the contextual planner sees it. The SAME shape the
 * handler builds (`containmentGate.contextEntryOf`), spelled here because the engine may
 * not import the plugin's internals; both are structural over the L0 record.
 */
export function contextEntryOfDraggable(r: DraggableSpaceEnvelope): SpaceEnvelopeContextEntry {
    return {
        prism: prismOfSpaceEnvelopeRecord(r),
        role: r.role ?? 'room',
        levelId: r.levelId ?? '',
        withinId: r.withinId ?? null,
        ...(r.name !== undefined ? { name: r.name } : {}),
    };
}

export interface SpaceEnvelopeFaceDragDeps {
    /** The canvas the pointer events arrive on. */
    readonly domElement: HTMLElement;
    /** The live camera. Read per event — a cached camera goes stale on a view switch. */
    readonly camera: () => THREE.Camera;
    /** The builder that drew the prisms; also the source of the pickable groups. */
    readonly builder: SpaceEnvelopeMeshBuilder;
    /**
     * The AUTHORITATIVE record for an id. ⛔ Resolved LAZILY on every gesture rather
     * than captured once: a reference threaded in at install time goes stale the
     * moment the runtime is recomposed (project switch, backend swap, device-loss
     * recovery) — the §L-545-SITE-CAPTURE lesson the serializer states in full.
     */
    readonly getRecord: (id: string) => DraggableSpaceEnvelope | undefined;
    /** Dispatch through the bus. THE ONLY mutation path (P6). */
    readonly dispatch: (payload: {
        spaceEnvelopeId: string;
        face: SpaceEnvelopeFaceRef;
        deltaM: number;
    }) => void;
    /** Report a refusal to the user in the surface's own idiom. Optional. */
    readonly onRefusal?: (message: string) => void;
    /** Live readout while dragging — "+1.35 m". Optional. */
    readonly onPreview?: (deltaM: number, faceLabel: string) => void;
    /**
     * §RESI-STAGE-G — EVERY envelope in the store, read lazily per pointer move, so the
     * preview is judged by the SAME contextual planner the commit uses: a room face that
     * would leave its level is refused DURING the drag with both numbers, and the
     * neighbour that shares the face is previewed moving with it (STR §11 / §12).
     * Omit and the preview judges the subject alone — which is exactly the state where
     * the preview can promise a move the commit then refuses, so `initTools` never omits it.
     */
    readonly getWorld?: () => readonly DraggableSpaceEnvelope[];
    /**
     * ⭐ §RESI-STAGE-G (2026-09-06) — DOUBLE-CLICK OPENS THE FOOTPRINT EDITOR (C114 §11
     * item 7). Installed HERE rather than in a second controller because this file already
     * owns the only raycast that can answer *"which envelope is under the pointer?"*, and a
     * rival picker would be a second answer to that question (C84 EI-9) that could resolve a
     * different envelope than the one the drag is about to move.
     *
     * ⛔ IT IS NOT A COMMAND AND IT WRITES NOTHING. The handler is the L7 tool's
     * `enterProfileEditMode`; the mutation is the `spaceEnvelope.setFootprint` that tool
     * dispatches on Apply (P6). Omit it and the double-click does nothing at all — there is
     * no fallback gesture, and the ContextualEditBar button stays the other way in.
     */
    readonly onProfileEdit?: (spaceEnvelopeId: string) => void;
}

/** Below this a drag is a click, not an edit. Not a dimension — a gesture threshold. */
const MIN_COMMITTED_DELTA_M = 1e-3;

interface ActiveDrag {
    readonly id: string;
    readonly face: SpaceEnvelopeFaceRef;
    readonly axis: { x: number; y: number; z: number };
    readonly grabWorld: { x: number; y: number; z: number };
    readonly startRecord: DraggableSpaceEnvelope;
    lastDeltaM: number;
    /** Neighbours the preview has REDRAWN — restored from the store on release / click. */
    previewedNeighbourIds: Set<string>;
}

/**
 * Install the face-drag interaction. Returns a disposer — call it on teardown, or the
 * listeners outlive the scene and the next runtime gets two of them.
 */
export function installSpaceEnvelopeFaceDrag(deps: SpaceEnvelopeFaceDragDeps): () => void {
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let active: ActiveDrag | null = null;

    // ⚠ Widened from `PointerEvent` to the two fields it reads, because a `dblclick` is a
    // MouseEvent. The narrower type would have forced either a cast or a second copy of this
    // arithmetic — and a second screen→ray map is a second answer to one question.
    const rayFor = (ev: { clientX: number; clientY: number }): { origin: THREE.Vector3; direction: THREE.Vector3 } => {
        const rect = deps.domElement.getBoundingClientRect();
        ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(ndc, deps.camera());
        return { origin: raycaster.ray.origin, direction: raycaster.ray.direction };
    };

    /**
     * ⭐ THE ONE PICK. Both the drag and the double-click ask "which envelope face is under
     * the pointer?" — asking twice, two ways, is how a double-click comes to open an editor
     * on a different envelope than the one the drag would have moved (C84 EI-9).
     */
    const pickFace = (ev: { clientX: number; clientY: number }): { id: string; face: SpaceEnvelopeFaceRef; point: THREE.Vector3 } | null => {
        const groups = deps.builder.drawnIds()
            .map((id) => deps.builder.groupOf(id))
            .filter((g): g is THREE.Group => g !== undefined);
        if (groups.length === 0) return null;
        rayFor(ev);
        const hits = raycaster.intersectObjects(groups, true);
        const hit = hits.find((h) => h.object.userData?.['spaceEnvelopeFace'] !== undefined);
        if (!hit) return null;
        const id = String(hit.object.userData?.['parentId'] ?? hit.object.userData?.['id'] ?? '');
        const face = hit.object.userData?.['spaceEnvelopeFace'] as SpaceEnvelopeFaceRef | undefined;
        if (!id || !face) return null;
        return { id, face, point: hit.point };
    };

    const onPointerDown = (ev: PointerEvent): void => {
        if (ev.button !== 0) return;
        const picked = pickFace(ev);
        if (!picked) return;
        const { id, face } = picked;

        const record = deps.getRecord(id);
        if (!record) {
            // ⛔ LOUD, NEVER SILENT. A drawn face with no record behind it means the
            // scene and the store have diverged — the exact state a redraw-on-diff
            // subscriber exists to prevent — and a silent return would leave the user
            // pulling at a solid that does not respond, with nothing anywhere saying why.
            console.warn(
                `[spaceEnvelopeFaceDrag] a face of '${id}' was grabbed but the store holds no such `
                + 'envelope — the scene and the ONE authority have diverged; refusing to drag.',
            );
            return;
        }
        if (record.role !== undefined && record.role !== 'level' && record.role !== 'room') {
            deps.onRefusal?.(
                'The maximum buildable volume is SOLVED from the zoning rules, not drawn — '
                + 'it is a study, and PRYZM will not let you drag one. Draw a LEVEL envelope instead.',
            );
            return;
        }

        const prism = prismOfSpaceEnvelopeRecord(record);
        const axis = spaceEnvelopeFaceAxis(prism, face);
        if (axis === null) {
            deps.onRefusal?.('That face has no direction to move along — its ring edge is degenerate.');
            return;
        }

        active = {
            id,
            face,
            axis,
            grabWorld: { x: picked.point.x, y: picked.point.y, z: picked.point.z },
            startRecord: record,
            lastDeltaM: 0,
            previewedNeighbourIds: new Set<string>(),
        };
        // ⚠ Capture the pointer so a drag that leaves the canvas still ends HERE. Without
        // it, releasing over a panel leaves `active` set and the next click continues a
        // drag the user believes they finished.
        deps.domElement.setPointerCapture?.(ev.pointerId);
        ev.stopPropagation();
    };

    const onPointerMove = (ev: PointerEvent): void => {
        if (!active) return;
        const ray = rayFor(ev);
        const onAxis = closestPointOnFaceAxis(
            { x: ray.origin.x, y: ray.origin.y, z: ray.origin.z },
            { x: ray.direction.x, y: ray.direction.y, z: ray.direction.z },
            active.grabWorld,
            active.axis,
        );
        // ⛔ `null` is the camera looking straight down the drag axis: the gesture
        // carries no information, so the face HOLDS rather than jumping to a number the
        // user could not have intended.
        if (onAxis === null) return;

        const prism = prismOfSpaceEnvelopeRecord(active.startRecord);
        const reading = readSpaceEnvelopeFaceDrag(prism, active.face, active.grabWorld, onAxis);
        if (reading === null) return;

        // ⭐ THE SAME PLANNER THE COMMIT USES — the CONTEXTUAL one (§RESI-STAGE-G). A
        // drag that would leave the level, or strand a room, is refused NOW with both
        // numbers, and leaves the last valid preview on screen.
        const world = (deps.getWorld?.() ?? [active.startRecord]).map(contextEntryOfDraggable);
        const subject = contextEntryOfDraggable(active.startRecord);
        const planned = planSpaceEnvelopeFaceMoveInContext({
            subject: { ...subject, prism },
            face: active.face,
            deltaM: reading.deltaM,
            world: world.some((w) => w.prism.id === subject.prism.id) ? world : [...world, subject],
        });
        if ('refusal' in planned) {
            deps.onRefusal?.(planned.refusal.message);
            return;
        }
        const { plan } = planned;
        active.lastDeltaM = reading.deltaM;
        deps.onPreview?.(reading.deltaM, reading.faceLabel);
        // PREVIEW ONLY — the store is untouched until release (P6).
        deps.builder.updateSpaceEnvelope({
            ...active.startRecord,
            footprint: plan.entry.footprint.map((p) => ({ x: p.x, z: p.z })),
            baseOffset: plan.entry.baseOffset,
            height: plan.entry.height,
        });
        // ⭐ THE NEIGHBOUR FOLLOWS IN THE PREVIEW TOO — what the commit will write, drawn
        // before it is written. A neighbour that adapted on an earlier frame and not on
        // this one is put back from the store, so the preview never leaves a phantom.
        const adaptedNow = new Set<string>();
        for (const e of plan.adapted) {
            const rec = deps.getRecord(e.envelopeId);
            if (!rec) continue;
            adaptedNow.add(e.envelopeId);
            active.previewedNeighbourIds.add(e.envelopeId);
            deps.builder.updateSpaceEnvelope({
                ...rec,
                footprint: e.footprint.map((p) => ({ x: p.x, z: p.z })),
                baseOffset: e.baseOffset,
                height: e.height,
            });
        }
        for (const id of active.previewedNeighbourIds) {
            if (adaptedNow.has(id)) continue;
            const rec = deps.getRecord(id);
            if (rec) deps.builder.updateSpaceEnvelope(rec);
            active.previewedNeighbourIds.delete(id);
        }
    };

    const finish = (ev: PointerEvent): void => {
        if (!active) return;
        const drag = active;
        active = null;
        deps.domElement.releasePointerCapture?.(ev.pointerId);

        if (Math.abs(drag.lastDeltaM) < MIN_COMMITTED_DELTA_M) {
            // A click, not an edit. Redraw from the AUTHORITATIVE record so the preview
            // cannot leave a phantom behind, and dispatch nothing (C113 §6.4).
            const live = deps.getRecord(drag.id);
            if (live) deps.builder.updateSpaceEnvelope(live);
            for (const id of drag.previewedNeighbourIds) {
                const n = deps.getRecord(id);
                if (n) deps.builder.updateSpaceEnvelope(n);
            }
            return;
        }
        // ⭐ EXACTLY ONE DISPATCH FOR THE WHOLE GESTURE. The redraw that follows is the
        // store's own `subscribeDirty` notification, not this closure — so the committed
        // solid on screen is the one the store holds, never the one the preview computed.
        deps.dispatch({ spaceEnvelopeId: drag.id, face: drag.face, deltaM: drag.lastDeltaM });
    };

    /**
     * §RESI-STAGE-G — double-click a face, edit the FOOTPRINT (C114 §11 item 7).
     *
     * ⚠ It resolves through `pickFace`, the same raycast the drag uses, and hands the id to
     * the tool WITHOUT judging it: whether this envelope can be edited is
     * `SpaceEnvelopeProfileEditTool.profileEditAvailability`'s answer, and asking here too
     * would be a second verdict that could disagree with the button's (C84 EI-9.2).
     *
     * ⛔ A double-click on empty space, or on anything that is not an envelope face, is left
     * ALONE — `stopPropagation` is called only on a hit, so the existing double-click paths
     * (slab profile edit, SelectionManager) are untouched by this listener's presence.
     */
    const onDoubleClick = (ev: MouseEvent): void => {
        if (!deps.onProfileEdit) return;
        const picked = pickFace(ev);
        if (!picked) return;
        ev.stopPropagation();
        ev.preventDefault();
        deps.onProfileEdit(picked.id);
    };

    deps.domElement.addEventListener('pointerdown', onPointerDown);
    deps.domElement.addEventListener('pointermove', onPointerMove);
    deps.domElement.addEventListener('pointerup', finish);
    deps.domElement.addEventListener('pointercancel', finish);
    deps.domElement.addEventListener('dblclick', onDoubleClick);

    return () => {
        deps.domElement.removeEventListener('pointerdown', onPointerDown);
        deps.domElement.removeEventListener('pointermove', onPointerMove);
        deps.domElement.removeEventListener('pointerup', finish);
        deps.domElement.removeEventListener('pointercancel', finish);
        deps.domElement.removeEventListener('dblclick', onDoubleClick);
        active = null;
    };
}
