/**
 * spaceEnvelopeDragSurfaceThree — THE FIRST ADAPTER: the face-drag gesture on THREE/WebGPU.
 * §ENVELOPE-DRAG-PORTS (L-13045) · C114 §10 · P2 · C84 EI-9.
 *
 * ⭐ THIS FILE IS THE SIX LINES. `spaceEnvelopeFaceDragController.ts` was 474 lines and
 * touched THREE on six of them: the camera dep type, a `Raycaster` + a `Vector2`, the
 * screen→ray arithmetic, and the group typing inside the pick. Everything else was already
 * surface-independent and now lives, once, in `spaceEnvelopeDragSurface.ts`. What is left
 * here is exactly the renderer-specific part — which is the measure of whether the
 * extraction was real.
 *
 * ⛔ NO GESTURE LOGIC BELOW THIS LINE. No refusal, no planner call, no delta threshold, no
 * dispatch, no neighbour bookkeeping. If a rule ever needs to differ per surface, it is a
 * fact about the SURFACE and belongs in the port's contract — not in a copy of the gesture.
 * Three copies of one gesture is the C84 EI-9 hazard this extraction exists to prevent.
 *
 * ⚠ THE PICK AND THE RAY SHARE ONE `Raycaster`, deliberately. `pickFace` sets it from the
 * event and then intersects; `rayInSceneFrame` sets it and reads the ray back. They are
 * never in flight at the same time (both run synchronously inside one event handler), and
 * sharing is what guarantees the hover, the drag and the double-click cannot resolve
 * through two differently-configured rays.
 */

import * as THREE from '@pryzm/renderer-three/three';
import type { SpaceEnvelopeFaceRef } from '@pryzm/geometry-space-envelope';
import type { SpaceEnvelopeMeshBuilder } from './SpaceEnvelopeMeshBuilder';
import type { SpaceEnvelopeFaceGizmoBuilder } from './SpaceEnvelopeFaceGizmoBuilder';
import type {
    DragPointerLike,
    DraggableSpaceEnvelope,
    FacePick,
    SceneRay,
    SpaceEnvelopeDragSurface,
} from './spaceEnvelopeDragSurface';

/** What the THREE adapter needs in order to answer the four ports. */
export interface ThreeSpaceEnvelopeDragSurfaceDeps {
    /** The canvas the pointer events arrive on — its rect is the screen→NDC denominator. */
    readonly domElement: HTMLElement;
    /** The live camera. Read per event — a cached camera goes stale on a view switch. */
    readonly camera: () => THREE.Camera;
    /** The builder that drew the prisms; also the source of the pickable groups. */
    readonly builder: SpaceEnvelopeMeshBuilder;
    /**
     * The AUTHORITATIVE record for an id — the adapter needs it for `previewRestore`,
     * because on THIS surface "drop the preview" means "redraw from the store". On a
     * surface whose renderer already reads the store, restore is instead *removing* an
     * overlay and needs no lookup at all. That asymmetry is the reason `previewRestore` is
     * a port rather than something the core does for every surface.
     */
    readonly getRecord: (id: string) => DraggableSpaceEnvelope | undefined;
    /**
     * ⭐ §25.6 GESTURE 1 — THE LITTLE ARROW. Its meshes carry the SAME
     * `userData.spaceEnvelopeFace` the faces do, so the pick below resolves an arrow and a
     * face to one `{ id, face }` — there is no second pick path, and an arrow can never
     * start a drag on a different face than the one it is drawn on (C84 EI-9).
     */
    readonly gizmo?: SpaceEnvelopeFaceGizmoBuilder;
    /**
     * ⛔ TURN THE ORBIT OFF WHILE A FACE IS BEING DRAGGED. Without this the camera orbits
     * and the face slides at the same time, and the gesture is unusable.
     *
     * ⚠ `ev.stopPropagation()` DOES NOT SOLVE THIS and believing it does is the trap:
     * `camera-controls` binds ITS pointer listener to the SAME `domElement`, and
     * propagation stopping does not stop other listeners on the SAME element. Every other
     * direct-manipulation drag in this app disables the controls instead —
     * `registerTransformDragHandler`, `StairPath3DToolHandler`, `ColumnTool`,
     * `CurtainWallTool`, `HandrailTool`, `LiftTool`.
     *
     * ⚠ The unit specs CANNOT see the ABSENCE of this: they drive a fake canvas with no
     * camera attached, so an omission here is invisible to a green suite.
     */
    readonly setCameraControlsEnabled?: (enabled: boolean) => void;
}

/**
 * Build the THREE/WebGPU adapter. Hand the result to
 * `installSpaceEnvelopeFaceDragOnSurface` — or, on the production path, let
 * `installSpaceEnvelopeFaceDrag` do both.
 */
export function createThreeSpaceEnvelopeDragSurface(
    deps: ThreeSpaceEnvelopeDragSurfaceDeps,
): SpaceEnvelopeDragSurface {
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    /** Point the shared raycaster at the event. The one screen→ray map on this surface. */
    const aim = (ev: DragPointerLike): void => {
        const rect = deps.domElement.getBoundingClientRect();
        ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(ndc, deps.camera());
    };

    const surface: SpaceEnvelopeDragSurface = {
        rayInSceneFrame(ev: DragPointerLike): SceneRay | null {
            aim(ev);
            // ⚠ COPIED OUT, not handed over. `raycaster.ray` is reused by the next call, so
            // returning it live would give the core a vector that changes underneath it.
            const { origin, direction } = raycaster.ray;
            return {
                origin: { x: origin.x, y: origin.y, z: origin.z },
                direction: { x: direction.x, y: direction.y, z: direction.z },
            };
        },

        /**
         * ⭐ THE ONE PICK. Both the drag and the double-click ask "which envelope face is
         * under the pointer?" — asking twice, two ways, is how a double-click comes to open
         * an editor on a different envelope than the one the drag would have moved.
         */
        pickFace(ev: DragPointerLike): FacePick | null {
            const groups: THREE.Object3D[] = deps.builder.drawnIds()
                .map((id) => deps.builder.groupOf(id))
                .filter((g): g is THREE.Group => g !== undefined);
            // ⭐ §25.6 — THE ARROWS ARE IN THE SAME PICK SET AS THE FACES, and that is the
            // whole integration. An arrow stands OFF its face along the outward normal, so
            // it is nearer the camera from outside and wins the hit the user aimed at; from
            // inside the volume the face itself still answers. Either way the `userData` is
            // the same face ref, so the two cannot resolve to different faces.
            const gizmoRoot = deps.gizmo?.root();
            if (gizmoRoot) groups.push(gizmoRoot);
            if (groups.length === 0) return null;
            aim(ev);
            const hits = raycaster.intersectObjects(groups, true);
            const hit = hits.find((h) => h.object.userData?.['spaceEnvelopeFace'] !== undefined);
            if (!hit) return null;
            const id = String(hit.object.userData?.['parentId'] ?? hit.object.userData?.['id'] ?? '');
            const face = hit.object.userData?.['spaceEnvelopeFace'] as SpaceEnvelopeFaceRef | undefined;
            if (!id || !face) return null;
            return {
                id,
                face,
                point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
            };
        },

        previewDraw(record: DraggableSpaceEnvelope): void {
            deps.builder.updateSpaceEnvelope(record);
        },

        previewRestore(id: string): void {
            // On THIS surface the renderer holds whatever was last drawn into it, so
            // dropping a preview means redrawing the authoritative record over it. A record
            // that has since gone is left alone — the store's own diff subscriber removes
            // the group, and racing it here would fight the one authority.
            const live = deps.getRecord(id);
            if (live) deps.builder.updateSpaceEnvelope(live);
        },

        setCameraEnabled(enabled: boolean): void {
            deps.setCameraControlsEnabled?.(enabled);
        },

        ...(deps.gizmo
            ? {
                handles: {
                    targetId: () => deps.gizmo!.targetId(),
                    setTarget: (record: DraggableSpaceEnvelope | null) => deps.gizmo!.setTarget(record),
                    setActiveFace: (face: SpaceEnvelopeFaceRef | null) => deps.gizmo!.setActiveFace(face),
                },
            }
            : {}),
    };

    return surface;
}
