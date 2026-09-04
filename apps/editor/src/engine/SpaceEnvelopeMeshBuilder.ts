/**
 * SpaceEnvelopeMeshBuilder — §FEAT-SPACE-ENVELOPE (L-12900) · C114 §10 · ADR-0380 ·
 * C84 EI-9 · C15 §12.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ THE PRISM, DRAWN AS `n + 2` INDIVIDUALLY PICKABLE FACES — WHICH IS THE WHOLE
 *    REASON THIS IS NOT ONE `ExtrudeGeometry` LIKE `WaterMeshBuilder`.
 * ═══════════════════════════════════════════════════════════════════════════════
 * The founder's directive §2.4 asks for *faces the user drags, each along its own
 * perpendicular, with the connected faces adapting*. A single extruded solid has
 * exactly one `userData` and one raycast hit: a click on it can say WHICH ENVELOPE
 * was hit and can never say WHICH FACE. So the face identity has to exist in the
 * scene graph, and it has to be the SAME identity the solver speaks —
 * `SpaceEnvelopeFaceRef`, whose side faces are indexed by ring-edge index.
 *
 * ⛔ AND THE INDEX IS COPIED FROM THE SOLVER, NEVER RE-DERIVED. `spaceEnvelopeFaces()`
 * enumerates the faces; this file iterates THAT list. A builder that walked the ring
 * itself would be a second indexing convention, and a face-move that is off by one
 * silently moves the wrong wall — a defect that looks like a physics bug and is an
 * arithmetic one (`SpaceEnvelopeTypes.ts` says exactly this, once).
 *
 * ── WHY THIS FAMILY GETS A DIRECT BUILDER AND NO LEGACY STORE ──────────────────
 * `spaceEnvelope` is a SINGLE-AUTHORITY family by construction: C114 §2a declined a
 * plugin DTO twin AND a `roomStore` mirror, so there is no legacy engine twin to
 * mirror into and drift from. That is `water`'s and `boundaryLine`'s shape exactly,
 * so this follows `WaterMeshBuilder` (same directory, same constructor, same
 * idempotent-by-id group map) rather than the §FT1 slab bridge, which exists to feed
 * a legacy store this family does not have. Minting a store to imitate that route
 * would create the second authority the family was designed without.
 *
 * ⚠ WHAT THIS FILE DOES NOT DO, STATED SO A GREEN SCREENSHOT IS NOT MISREAD.
 * It does not decide WHEN to draw — `initTools.ts` subscribes the store's own
 * `subscribeDirty`, which fires on execute, undo AND redo alike, so one road serves
 * all three directions and no separate undo render sink is owed (the shape
 * `bathroomPodMemberMirror` uses, and the reason `registerWaterRenderSink` exists for
 * a family that could NOT do this). And it does not commit anything: a builder that
 * also mutated would make the live drag preview and the committed edit two different
 * code paths, and the preview could then promise what the commit refuses.
 */

import * as THREE from '@pryzm/renderer-three/three';
import {
    prismOfSpaceEnvelopeRecord,
    spaceEnvelopeFaces,
    type SpaceEnvelopeFaceRef,
} from '@pryzm/geometry-space-envelope';

/** The envelope record as this builder needs to read it — the narrowest useful shape. */
export interface SpaceEnvelopeRenderInput {
    readonly id: string;
    readonly levelId?: string;
    readonly role?: string;
    /** The footprint ring on the level's XZ plane, OPEN loop, metres. */
    readonly footprint?: ReadonlyArray<{ readonly x: number; readonly z: number }>;
    /** Metres above the owning level's datum at which the prism starts. */
    readonly baseOffset?: number;
    /** Metres of vertical extent. Strictly positive in a parsed record. */
    readonly height?: number;
    readonly materialColor?: string;
}

/**
 * What the builder actually did. A discriminated outcome rather than `void`, because
 * "drew nothing" and "drew a volume" must not be the same value to the caller — the
 * subscriber logs the reason, so an invisible envelope says WHY instead of being
 * discovered from a screenshot (§CONTEXT-DATA-HONESTY).
 */
export type SpaceEnvelopeRenderOutcome =
    | { readonly drew: 'volume'; readonly id: string; readonly faces: number; readonly reason?: undefined }
    | { readonly drew: 'nothing'; readonly id: string; readonly faces?: undefined; readonly reason: string };

/** The minimum vertices a footprint needs. A topology fact, not a dimension. */
const MIN_RING_VERTS = 3;

/**
 * Below this the prism has no measurable extent and we draw NOTHING rather than a
 * zero-height sheet (which renders as z-fighting). ⛔ NOT a dimensional default —
 * a floating-point degeneracy threshold, the same role `1e-6` plays in
 * `DeletePool.sameLoop` and `1e-4` in `WaterMeshBuilder`.
 */
const MIN_HEIGHT_M = 1e-4;

/**
 * ⭐ THE ONE COLOUR LITERAL, AND IT IS THE BRAND'S. `#6600FF` is PRYZM purple —
 * `PreviewStyle.ts` and Contract §41 own the value for previews, and an authored
 * envelope is design INTENT rather than built fabric, so it reads in the same idiom.
 * ⚠ It is a FALLBACK for a record that carries no `materialColor`, never an override:
 * the authored value wins whenever there is one (the L-127 rule — a default invented
 * at the draw site silently outranks nothing and shadows the authored override).
 */
const DEFAULT_ENVELOPE_COLOR = '#6600FF';

export class SpaceEnvelopeMeshBuilder {
    private readonly _scene: THREE.Object3D;
    private readonly _groups = new Map<string, THREE.Group>();

    constructor(scene: THREE.Object3D) {
        this._scene = scene;
    }

    /**
     * Draw (or REDRAW) one envelope. IDEMPOTENT BY ID: the previous group is disposed
     * first, so a create followed by ten face drags leaves ONE group in the scene and
     * ten disposed geometry sets — not eleven overlapping translucent prisms, which is
     * how a redraw-on-every-diff subscriber becomes a memory leak whose only symptom is
     * that the envelope gets progressively more opaque.
     */
    updateSpaceEnvelope(record: SpaceEnvelopeRenderInput): SpaceEnvelopeRenderOutcome {
        this.removeSpaceEnvelope(record.id);

        const ring = record.footprint ?? [];
        if (ring.length < MIN_RING_VERTS) {
            return {
                drew: 'nothing',
                id: record.id,
                reason: `space envelope '${record.id}' has ${ring.length} footprint vertex/vertices — `
                    + `a volume needs at least ${MIN_RING_VERTS}`,
            };
        }
        const height = record.height;
        const baseOffset = record.baseOffset;
        if (typeof height !== 'number' || typeof baseOffset !== 'number') {
            // UNKNOWN is not zero. Filing an unmeasured volume at y=0 with a guessed
            // height would put a confident solid on screen for a record that does not
            // describe one ([[context-data-honesty-family]]: failure and emptiness are
            // never the same value).
            return {
                drew: 'nothing',
                id: record.id,
                reason: `space envelope '${record.id}' carries no vertical extent `
                    + `(baseOffset=${String(baseOffset)}, height=${String(height)}) — refusing to guess one`,
            };
        }
        if (height <= MIN_HEIGHT_M) {
            // The schema refines `height` positive, so this is unreachable from a parsed
            // record — which is exactly why it is checked. A zero-height envelope is a
            // footprint pretending to be a volume (C114 §12), and drawing one would put
            // the lie on screen.
            return {
                drew: 'nothing',
                id: record.id,
                reason: `space envelope '${record.id}' has non-positive height (${height.toFixed(6)} m) — `
                    + 'a footprint is not a volume',
            };
        }

        const prism = prismOfSpaceEnvelopeRecord({
            id: record.id, footprint: ring, baseOffset, height,
        });

        const group = new THREE.Group();
        group.name = `spaceEnvelope:${record.id}`;
        // ── ROOT userData — the SELECTABLE identity. ────────────────────────────
        group.userData['id'] = record.id;
        group.userData['elementId'] = record.id;
        group.userData['type'] = 'spaceEnvelope';
        group.userData['elementType'] = 'spaceEnvelope';
        group.userData['selectable'] = true;
        // ⭐ THE KEY `applyLevelVisibility` MATCHES ON. Without it the envelope ignores
        // every level filter and every explode — it would hang in the air when its
        // storey is hidden, which is the most visible possible symptom.
        group.userData['levelId'] = record.levelId ?? '';
        if (record.role) group.userData['spaceEnvelopeRole'] = record.role;

        const material = this._material(record);
        const faces = spaceEnvelopeFaces(prism);
        for (const face of faces) {
            const geometry = this._faceGeometry(prism, face);
            if (geometry === null) continue;
            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = `spaceEnvelope-face:${face.kind === 'side' ? `side-${face.edgeIndex}` : face.kind}`;
            // ── CHILD userData. `role: 'geometry'` is LOAD-BEARING, not decorative:
            // `SelectionManager.PARENT_RESOLVED_ROLES` is exactly
            // `['geometry','mullion','panel']`, so any other value silently fails to
            // resolve the click to its parent and the envelope becomes unselectable.
            mesh.userData['id'] = record.id;
            mesh.userData['parentId'] = record.id;
            mesh.userData['elementType'] = 'SpaceEnvelopeFace';
            mesh.userData['role'] = 'geometry';
            mesh.userData['selectable'] = false;
            // ⭐⭐ THE FACE IDENTITY, IN THE SOLVER'S OWN VOCABULARY. This is what a
            // raycast reads to know which face was grabbed, and it is the exact value
            // `spaceEnvelope.moveFace` takes as its `face` payload — so the pointer, the
            // planner and the command all name one thing the same way and no mapping
            // table exists to drift.
            mesh.userData['spaceEnvelopeFace'] = face;
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            // A translucent study volume must draw AFTER the opaque fabric it is drawn
            // around, or built walls sort in front of the intent that contains them.
            mesh.renderOrder = 1;
            group.add(mesh);
        }

        if (group.children.length === 0) {
            // Every face was degenerate — a ring with three collinear points, say. The
            // ring passed the count check and still bounds no area, and an empty group
            // in the scene would be indistinguishable from a drawn one.
            return {
                drew: 'nothing',
                id: record.id,
                reason: `space envelope '${record.id}' produced no drawable face — the ring bounds no area`,
            };
        }

        this._scene.add(group);
        this._groups.set(record.id, group);
        return { drew: 'volume', id: record.id, faces: group.children.length };
    }

    /** Remove one envelope's group and dispose its geometries. Safe on an absent id. */
    removeSpaceEnvelope(id: string): void {
        const group = this._groups.get(id);
        if (!group) return;
        group.traverse((obj: THREE.Object3D) => {
            const mesh = obj as THREE.Mesh;
            if ((mesh as { isMesh?: boolean }).isMesh) mesh.geometry?.dispose?.();
        });
        // ⚠ The material is SHARED across the faces of one envelope and is disposed
        // once, here, rather than once per face — disposing it inside the traverse
        // would call `dispose()` `n + 2` times on one object.
        const first = group.children[0] as THREE.Mesh | undefined;
        (first?.material as THREE.Material | undefined)?.dispose?.();
        group.removeFromParent();
        this._groups.delete(id);
    }

    /** Every envelope currently drawn. Used by the subscriber to reap removed records. */
    drawnIds(): readonly string[] {
        return [...this._groups.keys()];
    }

    /** The group for one envelope, for the drag controller's hit test. */
    groupOf(id: string): THREE.Group | undefined {
        return this._groups.get(id);
    }

    /**
     * The translucent study volume.
     *
     * ⭐ `transparent: true` + `depthWrite: false` is `WaterMeshBuilder`'s pairing, and
     * reusing it is deliberate rather than incidental: §CW90 moved the site exporter's
     * `classifyFormaWhiteRole` onto exactly that physical sniff, so an envelope
     * classifies as glass-like through the ONE classifier with no per-view special case.
     *
     * ⛔ `DoubleSide` IS REQUIRED HERE AND IS NOT A STYLE CHOICE. The user drags faces
     * from OUTSIDE and works INSIDE the volume; with back-face culling the far wall
     * vanishes when the camera enters, and — worse for this family — a face the user
     * can see would not be raycast-hittable from the inside, so the drag handle would
     * simply not respond.
     */
    private _material(record: SpaceEnvelopeRenderInput): THREE.MeshStandardMaterial {
        return new THREE.MeshStandardMaterial({
            color: new THREE.Color(record.materialColor ?? DEFAULT_ENVELOPE_COLOR),
            opacity: 0.28,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            roughness: 0.9,
            metalness: 0.0,
        });
    }

    /**
     * ONE face as its own geometry, in WORLD coordinates.
     *
     * ⚠ THE VERTEX ORDER IS THE RING'S, WHICH MEANS A SIDE FACE IS TWO TRIANGLES OVER
     * FOUR EXPLICIT CORNERS RATHER THAN AN EXTRUSION. `ExtrudeGeometry` cannot produce
     * one face of a prism, and slicing an extruded solid back into faces would
     * reintroduce the very index ambiguity this file exists to remove.
     *
     * ⛔ NO `-z` MIRROR HERE, and its ABSENCE is the thing to check when reading this
     * next to `WaterMeshBuilder._shapeOf`. That negation cancels `rotateX(-π/2)`'s
     * axis flip, which only exists because `ExtrudeGeometry` builds in a shape plane.
     * These vertices are already world-space, so negating z would mirror the envelope
     * about the X axis — a perfectly valid prism of exactly the right size, in the
     * wrong place, on which every seam-level assertion passes.
     */
    private _faceGeometry(
        prism: { readonly footprint: readonly { readonly x: number; readonly z: number }[]; readonly baseOffset: number; readonly height: number },
        face: SpaceEnvelopeFaceRef,
    ): THREE.BufferGeometry | null {
        const ring = prism.footprint;
        const n = ring.length;
        const baseY = prism.baseOffset;
        const topY = prism.baseOffset + prism.height;

        if (face.kind === 'side') {
            const a = ring[face.edgeIndex];
            const b = ring[(face.edgeIndex + 1) % n];
            if (!a || !b) return null;
            if (Math.hypot(b.x - a.x, b.z - a.z) < MIN_HEIGHT_M) return null; // a zero-length edge has no face
            const positions = new Float32Array([
                a.x, baseY, a.z, b.x, baseY, b.z, b.x, topY, b.z,
                a.x, baseY, a.z, b.x, topY, b.z, a.x, topY, a.z,
            ]);
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            g.computeVertexNormals();
            return g;
        }

        // TOP / BOTTOM — a fan from vertex 0. ⚠ Correct for a CONVEX ring only, and
        // that limit is DECLARED rather than hidden: a concave storey outline draws a
        // wrong cap while every side face stays right, which is a visible artefact
        // rather than a silent one. The honest fix is `ShapeGeometry` over a
        // `THREE.Shape`, which is the same triangulator the floor panels use; it is not
        // done here because the ring vocabulary this family authors today is a
        // rectangle, and shipping an untested triangulation path would be a second
        // answer to a question nothing yet asks.
        const y = face.kind === 'top' ? topY : baseY;
        const tris: number[] = [];
        for (let i = 1; i < n - 1; i += 1) {
            const p0 = ring[0]!;
            const p1 = ring[i]!;
            const p2 = ring[i + 1]!;
            tris.push(p0.x, y, p0.z, p1.x, y, p1.z, p2.x, y, p2.z);
        }
        if (tris.length === 0) return null;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tris), 3));
        g.computeVertexNormals();
        return g;
    }
}
