/**
 * SpaceEnvelopeFaceGizmoBuilder — THE LITTLE ARROW, DRAWN.
 *
 * §25.6 gesture 1 (STR-RESIDENTIAL-DESIGN-ORCHESTRATOR, founder transmission
 * 2026-09-06) · C114 §10 / §11 item 6 · ADR-0380 D4 · C84 EI-9 · P6.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ THE MOVE SHIPPED WITHOUT ITS AFFORDANCE, AND AN AFFORDANCE NOBODY CAN SEE IS
 *    A FEATURE NOBODY HAS.
 * ═══════════════════════════════════════════════════════════════════════════════
 * *"the room envelope shall have for each face a little arrow (gizmo) that shall allow
 * the user to move only in two directions perpendicular to the face."*
 *
 * `installSpaceEnvelopeFaceDrag` has done the MOVE since `4ad339c1`. Its drag target was
 * the translucent face itself — correct, invisible, and undiscoverable. This file draws
 * the handle: a double-headed arrow standing off each face, along that face's own
 * outward normal, whose two heads ARE the *"two directions perpendicular to the face"*.
 *
 * ─── WHY THE PLACEMENT IS NOT COMPUTED HERE ─────────────────────────────────────
 * Every number below arrives from `spaceEnvelopeFaceHandles()` in
 * `@pryzm/geometry-space-envelope` — anchor, axis, lengths, radii — and this file does
 * exactly one piece of arithmetic of its own: the quaternion that turns a `+Y` cylinder
 * onto that axis. An L7 file that also decided WHICH WAY A FACE MOVES would be a second
 * answer to the question the drag and the planner already answer (C84 EI-9), and the two
 * would part company on the first non-orthogonal storey outline — an arrow pointing one
 * way over a wall that slides another, which still looks plausible.
 *
 * ─── WHY IT IS NOT `TransformControls`, AND NOT INSIDE `SpaceEnvelopeMeshBuilder` ──
 * The first is answered in full by `spaceEnvelopeFaceDragController`'s header: that gizmo
 * translates an OBJECT along a WORLD axis, and this gesture's subject is ONE FACE of
 * `n + 2` moving along ITS OWN normal. The second is lifecycle: the mesh builder is
 * idempotent-by-id and DISPOSES the whole group on every redraw, which happens on every
 * frame of a drag. Parenting the arrows there would either dispose them mid-gesture or
 * force a full rebuild per frame. Here they are re-PLACED per frame (position and
 * quaternion only) and rebuilt only when the face SET changes.
 *
 * ⛔ IT COMMITS NOTHING AND KNOWS NO STORE. It draws. The gesture is
 * `installSpaceEnvelopeFaceDrag`'s; the mutation is `spaceEnvelope.moveFace` through the
 * bus (P6). The arrows carry the SAME `userData.spaceEnvelopeFace` the faces do, so the
 * controller's ONE raycast resolves an arrow and a face to the same `{id, face}` pair and
 * there is no second pick path to disagree.
 */

import * as THREE from '@pryzm/renderer-three/three';
import {
    prismOfSpaceEnvelopeRecord,
    spaceEnvelopeFaceHandles,
    type SpaceEnvelopeFaceHandle,
    type SpaceEnvelopeFaceRef,
} from '@pryzm/geometry-space-envelope';
// §ENVELOPE-EDIT-GPU-LIFETIME (L-13313) — the ONE teardown order for envelope-edit producers:
// detach now, release at the frame boundary.
import { releaseSpaceEnvelopeObject } from './spaceEnvelopeGpuRelease';

/** The record shape the gizmo needs — the same narrow prism fields the drag reads. */
export interface GizmoSpaceEnvelope {
    readonly id: string;
    readonly footprint?: ReadonlyArray<{ readonly x: number; readonly z: number }>;
    readonly baseOffset?: number;
    readonly height?: number;
}

/**
 * ⭐ PRYZM PURPLE, THE ONE BRAND VALUE. `#6600FF` is `PreviewStyle.ts` / Contract §41's
 * preview colour, and `SpaceEnvelopeMeshBuilder` already draws the prism in it. An
 * authored envelope and its handle are one object to the user, so they are one colour.
 */
const GIZMO_COLOUR = 0x6600ff;
/** The hovered face's arrow, lightened so the user can see WHICH face they are about to move. */
const GIZMO_ACTIVE_COLOUR = 0xb388ff;

/** Radial segments. 10 reads as round at a 0.25–0.9 m arrow and costs nothing at ~8 per envelope. */
const RADIAL_SEGMENTS = 10;

/**
 * ⭐ ABOVE THE PRISM, THE LABEL AND THE BUILT FABRIC. `SpaceEnvelopeMeshBuilder` uses
 * `renderOrder = 1` for faces and `11` for its label sprite; a handle the user must aim at
 * has to sort above both, or the translucent solid it belongs to hides it.
 */
const GIZMO_RENDER_ORDER = 12;

/** `+Y`, the axis `CylinderGeometry` and `ConeGeometry` are built along. */
const UP = new THREE.Vector3(0, 1, 0);

/** One face's arrow: the group, plus the face it drags. */
interface HandleNode {
    readonly group: THREE.Group;
    readonly key: string;
    readonly face: SpaceEnvelopeFaceRef;
    /**
     * The node's meshes. Their geometries are the node's own and leave WITH `group`, through
     * `releaseSpaceEnvelopeObject`; the material is the builder's shared pair.
     */
    readonly meshes: readonly THREE.Mesh[];
}

export class SpaceEnvelopeFaceGizmoBuilder {
    private readonly _scene: THREE.Object3D;
    private readonly _root: THREE.Group;
    private readonly _material: THREE.MeshBasicMaterial;
    private readonly _activeMaterial: THREE.MeshBasicMaterial;
    private _nodes: HandleNode[] = [];
    private _targetId: string | null = null;
    /** The face set the current nodes were built for — a rebuild trigger, not a cache key. */
    private _builtKeys = '';
    private _activeKey: string | null = null;

    constructor(scene: THREE.Object3D) {
        this._scene = scene;
        this._root = new THREE.Group();
        this._root.name = 'spaceEnvelope-face-gizmos';
        // ⛔ NOT SELECTABLE AND NOT A BIM ELEMENT. Without this the root can be resolved
        // as an element by `SelectionManager.findSelectableRoot` and the user "selects"
        // a handle — an object with no record behind it, which is the exact scene/store
        // divergence the drag controller already refuses to act on.
        this._root.userData['selectable'] = false;
        this._root.userData['role'] = 'gizmo';
        this._scene.add(this._root);

        // ⚠ `MeshBasicMaterial`, NOT `MeshStandardMaterial`: a handle is chrome, not
        // fabric. Lit, it would go dark on the shaded side of the model and the user
        // would lose the arrow exactly where the light is poor.
        // ⚠ `depthTest: false` is what makes it a HANDLE rather than a decoration — the
        // arrow on the far side of a translucent prism is still aimable, which is the
        // same reason `TransformControls` does it for every gizmo in this app.
        this._material = new THREE.MeshBasicMaterial({
            color: GIZMO_COLOUR, depthTest: false, depthWrite: false, transparent: true, opacity: 0.95,
        });
        this._activeMaterial = new THREE.MeshBasicMaterial({
            color: GIZMO_ACTIVE_COLOUR, depthTest: false, depthWrite: false, transparent: true, opacity: 1,
        });
    }

    /** The object the controller's raycast must include. ⛔ Not the scene — just these. */
    root(): THREE.Object3D {
        return this._root;
    }

    /** Which envelope currently wears the arrows, or `null`. */
    targetId(): string | null {
        return this._targetId;
    }

    /** How many arrows are drawn. For the wire test and for the honest census. */
    handleCount(): number {
        return this._nodes.length;
    }

    /**
     * Show the arrows for exactly ONE envelope — or for none when `record` is `null`.
     *
     * ⭐ ONE ENVELOPE AT A TIME, AND THAT IS A DELIBERATE READING OF THE FOUNDER'S LINE.
     * *"for each face a little arrow"* is satisfied per envelope: point at a room and
     * every one of its faces wears one. Drawing them for every envelope at once puts
     * ~8 arrows × (one level + n rooms) on screen — on a six-room storey that is 56
     * handles over the rooms they are meant to make editable, which hides the very
     * thing being edited. The rule is stated here so a future "always on" is a change
     * to THIS sentence rather than an accident.
     *
     * IDEMPOTENT: calling it with the envelope already targeted only re-places the
     * arrows, which is what a drag needs every frame.
     */
    setTarget(record: GizmoSpaceEnvelope | null): void {
        if (record === null) {
            this.clear();
            return;
        }
        const handles = this._handlesOf(record);
        if (handles === null) {
            // ⛔ NOT SILENT, AND NOT A ZERO-LENGTH ARROW. A record that describes no
            // volume gets NO handle rather than a speck at the origin the user can grab
            // and that moves nothing ([[context-data-honesty-family]]).
            this.clear();
            return;
        }
        const keys = handles.map((h) => h.key).join('|');
        if (this._targetId !== record.id || this._builtKeys !== keys) {
            this._rebuild(record.id, handles, keys);
            return;
        }
        this._place(handles);
    }

    /**
     * Emphasise the face under the pointer, or clear it. Costs one material swap; called
     * on every hover move, so it does nothing when the answer has not changed.
     */
    setActiveFace(face: SpaceEnvelopeFaceRef | null): void {
        const key = face === null
            ? null
            : (face.kind === 'side' ? `side face #${face.edgeIndex}` : `${face.kind} face`);
        if (key === this._activeKey) return;
        this._activeKey = key;
        for (const node of this._nodes) {
            const mat = node.key === key ? this._activeMaterial : this._material;
            for (const m of node.meshes) m.material = mat;
        }
    }

    /**
     * Remove every arrow. Safe to call twice.
     *
     * §ENVELOPE-EDIT-GPU-LIFETIME (L-13313) — DETACH NOW, RELEASE AT THE FRAME BOUNDARY. This is
     * HARDENING, not the crash path. The old body `dispose()`d each arrow geometry and detached
     * its group in the SAME synchronous tick, so no frame could observe the freed buffers, and a
     * geometry dispose cannot raise the §I2 throw (three's `RenderObject.onGeometryDispose` only
     * nulls its attribute cache). The prism (`SpaceEnvelopeMeshBuilder.removeSpaceEnvelope`) was
     * the only producer that could strand a destroyed translucent object. The arrows go through
     * the same helper anyway, so the family's one teardown order is written once.
     */
    clear(): void {
        for (const node of this._nodes) {
            // The two arrow materials are shared and outlive a re-target — `dispose()` hands them in.
            releaseSpaceEnvelopeObject(node.group, { disposeMaterials: false });
        }
        this._nodes = [];
        this._targetId = null;
        this._builtKeys = '';
        this._activeKey = null;
    }

    /**
     * Full teardown — the arrows, the shared materials and the root.
     *
     * §ENVELOPE-EDIT-GPU-LIFETIME (L-13313) — hardening: the root leaves the scene NOW and the two
     * shared materials are released at the frame boundary. The old order (raw
     * `material.dispose()` first, detach last) let a §I2 `usedTimes` throw (WebGPU after a live
     * renderer swap) abort the teardown. That was harmless to the frame, because `clear()` had
     * already emptied the root, but it leaked the second material and left an empty root
     * parented to the scene.
     */
    dispose(): void {
        this.clear();
        releaseSpaceEnvelopeObject(this._root, {
            disposeMaterials: false,
            ownedMaterials: [this._material, this._activeMaterial],
        });
    }

    // ── internals ────────────────────────────────────────────────────────────

    /**
     * The placements, from the ONE solver. `null` when the record does not describe a
     * volume — the same three facts `SpaceEnvelopeMeshBuilder` refuses to draw without.
     */
    private _handlesOf(record: GizmoSpaceEnvelope): readonly SpaceEnvelopeFaceHandle[] | null {
        const ring = record.footprint ?? [];
        if (ring.length < 3) return null;
        if (typeof record.baseOffset !== 'number' || typeof record.height !== 'number') return null;
        if (!(record.height > 0)) return null;
        const prism = prismOfSpaceEnvelopeRecord({
            id: record.id, footprint: ring, baseOffset: record.baseOffset, height: record.height,
        });
        // §HORIZONTAL-FACES-ARE-PINNED (L-13272) — a cap's height belongs to its STOREY, so
        // no arrow is offered on one. The matching refusal lives in spaceEnvelopeDragSurface.
        const handles = spaceEnvelopeFaceHandles(prism, { omitCapFaces: true });
        return handles.length > 0 ? handles : null;
    }

    private _rebuild(id: string, handles: readonly SpaceEnvelopeFaceHandle[], keys: string): void {
        this.clear();
        this._targetId = id;
        this._builtKeys = keys;
        for (const h of handles) this._nodes.push(this._node(id, h));
        this._place(handles);
    }

    /**
     * ⭐ RE-PLACE, DO NOT REBUILD. A face drag redraws every frame; disposing and
     * recreating ~24 geometries per frame is a real GPU-side churn, not a theoretical
     * one — the same reason `SpaceEnvelopeMeshBuilder` disposes its label texture on
     * every redraw is why this one does not create any.
     *
     * ⚠ The arrow's LENGTH is baked into its geometry, so a face whose extent changed a
     * lot mid-drag keeps the size it started with until the face set changes. That is
     * deliberate: an arrow that grows and shrinks under the pointer is a moving target.
     */
    private _place(handles: readonly SpaceEnvelopeFaceHandle[]): void {
        const byKey = new Map(handles.map((h) => [h.key, h] as const));
        for (const node of this._nodes) {
            const h = byKey.get(node.key);
            if (!h) continue;
            node.group.position.set(h.anchor.x, h.anchor.y, h.anchor.z);
            node.group.quaternion.setFromUnitVectors(
                UP,
                new THREE.Vector3(h.axis.x, h.axis.y, h.axis.z).normalize(),
            );
            node.group.updateMatrixWorld(true);
        }
    }

    /**
     * One double-headed arrow, built along `+Y` and rotated onto the face axis by
     * `_place`. Shaft between the two heads; a cone at each end pointing OUTWARD from
     * the centre — which is what makes "two directions" legible without a label.
     */
    private _node(id: string, h: SpaceEnvelopeFaceHandle): HandleNode {
        const group = new THREE.Group();
        group.name = `spaceEnvelope-gizmo:${id}:${h.key}`;
        group.renderOrder = GIZMO_RENDER_ORDER;

        const shaftLen = Math.max(1e-4, (h.halfLengthM - h.headLengthM) * 2);
        const shaftGeom = new THREE.CylinderGeometry(h.shaftRadiusM, h.shaftRadiusM, shaftLen, RADIAL_SEGMENTS);
        const shaft = new THREE.Mesh(shaftGeom, this._material);

        const headGeomA = new THREE.ConeGeometry(h.headRadiusM, h.headLengthM, RADIAL_SEGMENTS);
        const headA = new THREE.Mesh(headGeomA, this._material);
        headA.position.y = h.halfLengthM - h.headLengthM / 2;

        const headGeomB = new THREE.ConeGeometry(h.headRadiusM, h.headLengthM, RADIAL_SEGMENTS);
        const headB = new THREE.Mesh(headGeomB, this._material);
        headB.position.y = -(h.halfLengthM - h.headLengthM / 2);
        // ⭐ THE SECOND HEAD IS THE SECOND DIRECTION. Flipped rather than a separate
        // geometry so the two are provably the same cone; a user must be able to see at
        // a glance that the face moves BOTH ways along one line.
        headB.rotation.x = Math.PI;

        const meshes = [shaft, headA, headB];
        for (const m of meshes) {
            m.renderOrder = GIZMO_RENDER_ORDER;
            m.castShadow = false;
            m.receiveShadow = false;
            // ⭐⭐ THE SAME IDENTITY THE FACE MESHES CARRY, so `pickFace`'s ONE raycast
            // resolves an arrow to the very face it is drawn on. ⛔ `role` is NOT
            // `'geometry'`: that value is in `SelectionManager.PARENT_RESOLVED_ROLES`, and
            // a handle that resolved to its parent element would make the gizmo
            // SELECTABLE — clicking the arrow would select the envelope instead of
            // dragging its face.
            m.userData['id'] = id;
            m.userData['parentId'] = id;
            m.userData['elementType'] = 'SpaceEnvelopeFaceGizmo';
            m.userData['role'] = 'gizmo';
            m.userData['selectable'] = false;
            m.userData['spaceEnvelopeFace'] = h.face;
            group.add(m);
        }

        this._root.add(group);
        return { group, key: h.key, face: h.face, meshes };
    }
}
