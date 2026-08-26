/**
 * instancedEdgeOverlay — §INSPECT-EDGES-RIDE-EVERY-INSTANCE (L-12140), 2026-08-26,
 * lane INSPECT133.
 *
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Inspect / view layer — pure geometry derivation. No DOM, no
 *                    store, no registry, no semantic-graph access, no `.visible`
 *                    writes. The CALLER (`DiagnosticMaterialManager`) owns every
 *                    scene mutation; this module only RETURNS a `BufferGeometry`.
 * Architectural Classification: A (view-only).
 * Impact Assessment: Semantic No · Constraint No · Graph No · Topology No ·
 *                    Store-Registry No · Undo No.
 * Contract:          C04 (rendering/scheduling) · C84 §9 (element integrity — a
 *                    family is not exempt from a view treatment because of the
 *                    DRAW STRATEGY its builder happened to choose) ·
 *                    P2 (THREE only via `@pryzm/renderer-three/three`) ·
 *                    P7 (view presentation; writes no element state).
 *
 * ── ⛔ THE DEFECT THIS CLOSES, measured 2026-08-26 ──────────────────────────
 *
 * Founder, Inspect mode, X-Ray lens, "Stacked" level view: *"it feels like the
 * mullions on the curtain panel are not rendering properly"* — screenshots show
 * long thin OPAQUE CYAN vertical sticks standing through the ghosted model and
 * **hanging far below the floor plates they belong to**, in one shot dangling
 * past several storeys.
 *
 * ⭐ THE MULLIONS THEMSELVES WERE NEVER WRONG. They are correct in Author, in
 * plan, and in Inspect. What the founder photographed is the Inspect ghost
 * lens's own **cyan edge overlay** (`GHOST_EDGE_COLOR = 0x00e5ff`), landing
 * where no mullion is. Nothing in the curtain-wall builder is involved.
 *
 * THE MECHANISM, exactly:
 *
 *   1. `CurtainWallBuilder.ts:1264` builds the vertical mullion rack as ONE
 *      `THREE.InstancedMesh` over a CENTRED `BoxGeometry(mullionSize, cw.height,
 *      mullionSize)`. A centred box spans local y ∈ [−height/2, +height/2].
 *   2. `CurtainWallBuilder.ts:1283` places every instance at
 *      `position.set(x, cw.height / 2, 0)` — lifting the centred box so each real
 *      mullion spans [0, height] in group space. Correct, and it is why Author
 *      mode looks right.
 *   3. `DiagnosticMaterialManager._applyGhostToNonRoomMesh()` classifies the rack
 *      `'structural'` (its `userData.elementType` is `'CurtainWallPart'`, and
 *      `STRUCTURAL_TYPE_FRAGMENTS` matches the substring `'wall'`), so it built
 *      `new THREE.EdgesGeometry(obj.geometry)` and added it as a CHILD of the
 *      rack at identity.
 *
 * ⛔ **A non-instanced child of an `InstancedMesh` is drawn ONCE, at the parent's
 * own transform. `instanceMatrix` applies to the `InstancedMesh`'s draw call and
 * to NOTHING ELSE — never to its children.** So the outline was rendered at the
 * rack's identity transform, i.e. at the UN-lifted centred base box: one cyan
 * stick per curtain wall, `mullionSize × mullionSize` in section, `cw.height`
 * tall, spanning **[worldY − height/2, worldY + height/2]** — exactly half a wall
 * height BELOW the storey's floor plate. That is the stalactite, to the metre.
 *
 * ⚠ THE BLIND SPOT IS NOT "the lens skips instanced meshes". It does not:
 * `THREE.InstancedMesh extends THREE.Mesh`, so every `obj instanceof THREE.Mesh`
 * guard in that file admits it, and the rack DOES receive its ghost material
 * correctly. Only the derived EDGE OVERLAY is instance-blind. A fix aimed at the
 * traversal guards would have changed nothing.
 *
 * ⭐ IT IS A CLASS DEFECT, NOT A CURTAIN-WALL ONE. Every family that draws
 * through an `InstancedMesh` and classifies `'structural'` carries it:
 *   · `CurtainWallBuilder.ts:1265,1296` (and the worker path at :2054,:2085) —
 *     mullion racks, `elementType: 'CurtainWallPart'` → matches `'wall'`;
 *   · `InstanceGroup.ts:84` (`packages/core-app-model`) — the generic instanced
 *     path `WallFragmentBuilder.ts:1303` estimates 70–85% of WALLS take;
 *   · `InstancedMeshCoalescer.ts:405,498` — the post-batch merged racks, which
 *     `_stampAttribution` (:129) deliberately re-stamps with the source
 *     `elementType`, so the merged mesh inherits the classification AND sits at
 *     the SCENE ROOT, displacing its outline further still.
 * Patching the curtain-wall call site alone would have left walls — the largest
 * population in any real model — still wrong. The fix is therefore at the
 * overlay BUILDER, keyed on the object class, not on any element family.
 *
 * ── THE FIX ────────────────────────────────────────────────────────────────
 *
 * `buildEdgeOverlayGeometry()` BAKES the base edge positions through every live
 * instance matrix into ONE `BufferGeometry`. The overlay stays a CHILD of its
 * source mesh at identity, so §GHOST-EDGES-RIDE-THEIR-MESH (L-3510) is preserved
 * byte-for-byte: instance matrices are expressed in the source mesh's LOCAL
 * space, so `parentWorldMatrix × instanceMatrix × localVertex` is exactly the
 * world position of that instance's edge. The overlay still inherits the explode
 * lift, every ancestor transform and `.visible` from THREE with nothing to
 * maintain.
 *
 * ⚠ THE PLAIN-`Mesh` PATH IS UNCHANGED BY CONSTRUCTION. `liveInstanceMatrices()`
 * returns `null` for a non-instanced mesh and the function then returns the very
 * same `new THREE.EdgesGeometry(mesh.geometry)` the call sites used to build
 * inline. There is no new branch in the plain case to get wrong.
 *
 * ⚠ COST IS NOT NEW COST. The un-instanced ghost pass already builds one
 * `EdgesGeometry` per structural mesh in the scene; baking N instances produces
 * the SAME total edge count those elements would have had if their builder had
 * not instanced them — but in ONE buffer and ONE draw call per rack instead of N
 * objects. Instancing is a draw-call optimisation, and the outline now costs what
 * the drawing costs. No cap is imposed, deliberately: a silent cap would restore
 * the "some mullions have no outline" defect in a new disguise.
 */

import * as THREE from '@pryzm/renderer-three/three';

/**
 * |determinant| at or below which an instance matrix is treated as a PARKED slot
 * that renders nothing.
 *
 * ⭐ THIS IS REQUIRED FOR CORRECTNESS, NOT DEFENSIVE PADDING.
 * `InstanceGroup.removeInstance()` (`InstanceGroup.ts:167`) soft-deletes by
 * writing a ZERO-SCALE matrix into the slot and returning it to a free list —
 * while `InstanceGroup.ts:146` keeps `mesh.count` as a **monotonic high-water
 * mark**. A removed instance therefore still sits INSIDE `count`. Baking a
 * zero-scale matrix collapses that instance's whole edge loop onto a single
 * point, which would draw a cyan speck at the parked origin: a soft-deleted
 * element made visible by the X-ray. `InstanceGroup`'s constructor (:91) parks
 * every unallocated slot the same way.
 *
 * A zero-scale instance renders nothing, so its outline must render nothing.
 */
export const DEGENERATE_INSTANCE_DET_EPSILON = 1e-12;

/**
 * The live, renderable instance matrices of `mesh`, or `null` when `mesh` is not
 * instanced at all.
 *
 * ⚠ `null` and `[]` mean DIFFERENT things and the caller depends on the
 * difference: `null` is "this is an ordinary mesh, treat it the old way"; `[]` is
 * "this IS an instanced mesh and it currently draws nothing", which must produce
 * NO overlay rather than an un-transformed one. Collapsing the two is precisely
 * how the defect above rendered a base box that belonged to no instance.
 *
 * ⚠ Bounded by `min(count, instanceMatrix.count)`. `count` is the live draw count
 * THREE itself honours; `instanceMatrix.count` is the allocated capacity, which
 * for an `InstanceGroup` is `INSTANCE_GROUP_MAX = 512` regardless of how many
 * slots are used. Reading the capacity would bake up to 512 parked boxes per
 * group.
 */
export function liveInstanceMatrices(mesh: THREE.Mesh): THREE.Matrix4[] | null {
    if (!(mesh instanceof THREE.InstancedMesh)) return null;

    const capacity = mesh.instanceMatrix?.count ?? 0;
    const live     = Math.min(mesh.count ?? 0, capacity);

    const out: THREE.Matrix4[] = [];
    const scratch = new THREE.Matrix4();
    for (let i = 0; i < live; i++) {
        mesh.getMatrixAt(i, scratch);
        if (Math.abs(scratch.determinant()) <= DEGENERATE_INSTANCE_DET_EPSILON) continue;
        out.push(scratch.clone());
    }
    return out;
}

/**
 * Replicate `base`'s positions once per matrix, each transformed by that matrix,
 * into a single new non-indexed `BufferGeometry`.
 *
 * `base` is always an `EdgesGeometry` here, which THREE emits NON-INDEXED with a
 * `position` attribute and nothing else — so a straight positional copy is the
 * whole of it. `base` is left untouched; the caller owns its disposal.
 */
export function bakeEdgesAcrossInstances(
    base:     THREE.BufferGeometry,
    matrices: readonly THREE.Matrix4[],
): THREE.BufferGeometry {
    const src = base.getAttribute('position');
    const vertsPerInstance = src ? src.count : 0;

    const out = new Float32Array(vertsPerInstance * matrices.length * 3);
    const v   = new THREE.Vector3();

    let w = 0;
    for (const m of matrices) {
        for (let i = 0; i < vertsPerInstance; i++) {
            v.fromBufferAttribute(src as THREE.BufferAttribute, i).applyMatrix4(m);
            out[w++] = v.x;
            out[w++] = v.y;
            out[w++] = v.z;
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(out, 3));
    return geo;
}

/**
 * Build the edge-overlay geometry for one ghost/focus subject, in the source
 * mesh's LOCAL space so the overlay can be added as a child at identity.
 *
 * · plain `Mesh`      → `EdgesGeometry(mesh.geometry)`, exactly as before.
 * · `InstancedMesh`   → those edges baked through every live instance matrix.
 * · instanced, 0 live → `null`; the caller adds no overlay.
 *
 * The returned geometry is always freshly allocated and owned by the caller,
 * which is what lets `_clearOverlays()` → `_flushDeferredDisposals()` dispose it
 * unconditionally. ⛔ It must never be a cache-owned geometry: the curtain-wall
 * mullion base boxes come from `CurtainWallBuilder.mullionGeometryCache` and are
 * stamped `sharedGeometry: true` precisely because disposing them is a
 * use-after-free for every other wall on the same key.
 */
export function buildEdgeOverlayGeometry(mesh: THREE.Mesh): THREE.BufferGeometry | null {
    const matrices = liveInstanceMatrices(mesh);
    const base     = new THREE.EdgesGeometry(mesh.geometry);

    if (matrices === null) return base;          // ordinary mesh — unchanged path
    if (matrices.length === 0) {                 // instanced but drawing nothing
        base.dispose();
        return null;
    }

    const baked = bakeEdgesAcrossInstances(base, matrices);
    base.dispose();                              // intermediate, never parented
    return baked;
}
