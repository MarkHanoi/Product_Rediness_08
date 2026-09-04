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
    planSpaceEnvelopeFaceMove,
    prismOfSpaceEnvelopeRecord,
    readSpaceEnvelopeFaceDrag,
    spaceEnvelopeFaceAxis,
    type SpaceEnvelopeFaceRef,
} from '@pryzm/geometry-space-envelope';
import type { SpaceEnvelopeMeshBuilder, SpaceEnvelopeRenderInput } from './SpaceEnvelopeMeshBuilder';

/** The record shape the controller needs. Read from the ONE store, never cached. */
export interface DraggableSpaceEnvelope extends SpaceEnvelopeRenderInput {
    readonly footprint: ReadonlyArray<{ readonly x: number; readonly z: number }>;
    readonly baseOffset: number;
    readonly height: number;
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
}

/**
 * Install the face-drag interaction. Returns a disposer — call it on teardown, or the
 * listeners outlive the scene and the next runtime gets two of them.
 */
export function installSpaceEnvelopeFaceDrag(deps: SpaceEnvelopeFaceDragDeps): () => void {
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let active: ActiveDrag | null = null;

    const rayFor = (ev: PointerEvent): { origin: THREE.Vector3; direction: THREE.Vector3 } => {
        const rect = deps.domElement.getBoundingClientRect();
        ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(ndc, deps.camera());
        return { origin: raycaster.ray.origin, direction: raycaster.ray.direction };
    };

    const onPointerDown = (ev: PointerEvent): void => {
        if (ev.button !== 0) return;
        const groups = deps.builder.drawnIds()
            .map((id) => deps.builder.groupOf(id))
            .filter((g): g is THREE.Group => g !== undefined);
        if (groups.length === 0) return;
        rayFor(ev);
        const hits = raycaster.intersectObjects(groups, true);
        const hit = hits.find((h) => h.object.userData?.['spaceEnvelopeFace'] !== undefined);
        if (!hit) return;

        const id = String(hit.object.userData?.['parentId'] ?? hit.object.userData?.['id'] ?? '');
        const face = hit.object.userData?.['spaceEnvelopeFace'] as SpaceEnvelopeFaceRef | undefined;
        if (!id || !face) return;

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
            grabWorld: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
            startRecord: record,
            lastDeltaM: 0,
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

        // ⭐ THE SAME PLANNER THE COMMIT USES. A refused drag shows the refusal NOW,
        // with both numbers, and leaves the last valid preview on screen.
        const plan = planSpaceEnvelopeFaceMove({ prism, face: active.face, deltaM: reading.deltaM });
        if ('refusal' in plan) {
            deps.onRefusal?.(plan.refusal.message);
            return;
        }
        active.lastDeltaM = reading.deltaM;
        deps.onPreview?.(reading.deltaM, reading.faceLabel);
        // PREVIEW ONLY — the store is untouched until release (P6).
        deps.builder.updateSpaceEnvelope({
            ...active.startRecord,
            footprint: plan.entry.footprint.map((p) => ({ x: p.x, z: p.z })),
            baseOffset: plan.entry.baseOffset,
            height: plan.entry.height,
        });
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
            return;
        }
        // ⭐ EXACTLY ONE DISPATCH FOR THE WHOLE GESTURE. The redraw that follows is the
        // store's own `subscribeDirty` notification, not this closure — so the committed
        // solid on screen is the one the store holds, never the one the preview computed.
        deps.dispatch({ spaceEnvelopeId: drag.id, face: drag.face, deltaM: drag.lastDeltaM });
    };

    deps.domElement.addEventListener('pointerdown', onPointerDown);
    deps.domElement.addEventListener('pointermove', onPointerMove);
    deps.domElement.addEventListener('pointerup', finish);
    deps.domElement.addEventListener('pointercancel', finish);

    return () => {
        deps.domElement.removeEventListener('pointerdown', onPointerDown);
        deps.domElement.removeEventListener('pointermove', onPointerMove);
        deps.domElement.removeEventListener('pointerup', finish);
        deps.domElement.removeEventListener('pointercancel', finish);
        active = null;
    };
}
