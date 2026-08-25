/**
 * WaterMeshBuilder — §POOL95 · ADR-0124 §4 · L-9941 · C84 EI-9
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ THE FOUNDER ASKED FOR "A BOX WITH 70% TRANSPARENCY IN BLUE LOOKING LIKE
 *    WATER WITHIN THE WALLS AND THE SLAB". THIS FILE IS THE BOX.
 * ═══════════════════════════════════════════════════════════════════════════════
 * It is the ONLY part of his sentence that should be taken literally. The *model*
 * behind it is deliberately NOT a box and not a blue slab — ADR-0124 §4 settled
 * that on three independent arguments and `packages/schemas/src/elements/Water.ts`
 * carries them. What he is owed, and what was missing, is that the water he
 * modelled could not be SEEN:
 *
 *   `CommandEventBridge`'s own `pool.create` case printed, on every pool anybody
 *   made: *"the WATER BODY — 'water' has no typed event, no subscriber and no mesh
 *   builder anywhere in the tree; the basin renders and the water in it does not
 *   (L-9941)"*.
 *
 * Three things were missing and all three land together, because any one of them
 * alone leaves that sentence true: the typed event (`runtime-composer/src/types.ts`
 * `'water.created'`), the subscriber (`initTools.ts`), and this builder.
 *
 * ── WHY THIS FAMILY GETS A DIRECT BUILDER AND NO LEGACY STORE ────────────────
 * `water` is a SINGLE-AUTHORITY family: one Zod schema, one plugin store
 * (`runtime.stores.water`), and — unlike `wall`, `slab`, `floor` and `ceiling` —
 * no legacy engine twin to mirror into and drift from. That is exactly
 * `boundaryLine`'s shape, so this follows `BoundaryLineMeshBuilder` (same
 * directory, same constructor, same idempotent-by-id group map) rather than the
 * §FT1 slab bridge, which exists to feed a legacy store this family does not have.
 * Minting a `WaterStore` to imitate the slab route would create the second
 * authority the family was designed without.
 *
 * ── WHAT THIS BUILDER MUST NOT DO ───────────────────────────────────────────
 * ⛔ IT NEVER RE-DERIVES THE WATER LEVEL. `surfaceElevation` and `bottomElevation`
 * arrive as ABSOLUTE world-Y and are used as given. The entire reason water is its
 * own family is that those two move INDEPENDENTLY — recomputing either from a
 * depth plus a freeboard here would rebuild the blue slab inside the renderer and
 * silently re-couple the surface to the floor (ADR-0124 §4.1).
 *
 * ⛔ IT CARRIES NO DIMENSIONAL LITERAL. Colour and opacity arrive already resolved
 * through `resolvePoolDimensions()`'s three-tier chain (record → systemType →
 * documented default). A `?? 0.3` here would be a fourth tier nobody can see and
 * would defeat the authored override the same lane added (L-127; ADR-0265 §4.4:
 * *a richer hardcoded glyph is the same bug at higher resolution*). The fallbacks
 * below are for MISSING STRUCTURE (no boundary, inverted elevations), never for a
 * missing dimension.
 */

import * as THREE from '@pryzm/renderer-three/three';

/** The water record as this builder needs to read it — the narrowest useful shape. */
export interface WaterRenderInput {
    readonly id: string;
    readonly levelId?: string;
    /** The owning pool — stamped as the root's `parentId` (ADR-0124 §3.1). */
    readonly poolId?: string;
    /** Water-surface plan outline, WORLD coordinates, OPEN loop. */
    readonly boundary?: ReadonlyArray<{ readonly x: number; readonly y: number; readonly z: number }>;
    /** ABSOLUTE world-Y of the top face. */
    readonly surfaceElevation?: number;
    /** ABSOLUTE world-Y of the underside (= the pool floor's top face). */
    readonly bottomElevation?: number;
    readonly color?: string;
    readonly opacity?: number;
}

/**
 * What the builder actually did. A discriminated outcome rather than `void`,
 * because "drew nothing" and "drew a body" must not be the same value to the
 * caller — the subscriber logs the reason, so an invisible pool says why
 * (§CONTEXT-DATA-HONESTY).
 */
export type WaterRenderOutcome =
    | { readonly drew: 'volume'; readonly id: string; readonly reason?: undefined }
    | { readonly drew: 'nothing'; readonly id: string; readonly reason: string };

/** The minimum vertices a water surface needs. A topology fact, not a dimension. */
const MIN_LOOP_VERTS = 3;

/**
 * Below this the body has no measurable depth and we draw NOTHING rather than a
 * zero-height prism (which renders as a z-fighting sheet). Not a water dimension —
 * a floating-point degeneracy threshold, the same role `1e-6` plays in
 * `DeletePool.sameLoop`.
 */
const MIN_DEPTH_M = 1e-4;

export class WaterMeshBuilder {
    private readonly _scene: THREE.Object3D;
    private readonly _groups = new Map<string, THREE.Group>();

    constructor(scene: THREE.Object3D) {
        this._scene = scene;
    }

    /**
     * Draw (or REDRAW) one water body. IDEMPOTENT BY ID: the previous group is
     * disposed first, so a create followed by ten updates leaves ONE group in the
     * scene and ten disposed geometries — not eleven overlapping translucent
     * prisms, which is how a `.updated` mirror becomes a memory leak whose symptom
     * is that the water gets progressively more opaque.
     */
    updateWater(water: WaterRenderInput): WaterRenderOutcome {
        this.removeWater(water.id);

        const ring = water.boundary ?? [];
        if (ring.length < MIN_LOOP_VERTS) {
            return {
                drew: 'nothing',
                id: water.id,
                reason: `water '${water.id}' has ${ring.length} boundary vertex/vertices — a surface needs at least ${MIN_LOOP_VERTS}`,
            };
        }

        const top = water.surfaceElevation;
        const bottom = water.bottomElevation;
        if (typeof top !== 'number' || typeof bottom !== 'number') {
            // UNKNOWN is not zero. Filing an unmeasured body at y=0 would float it
            // at the project datum, which looks like a bug in the pool rather than
            // a missing field in the event (§CONTEXT-DATA-HONESTY: failure and
            // emptiness are never the same value).
            return {
                drew: 'nothing',
                id: water.id,
                reason: `water '${water.id}' carries no absolute elevations (surface=${String(top)}, bottom=${String(bottom)}) — refusing to guess a water level`,
            };
        }

        const depth = top - bottom;
        if (depth <= MIN_DEPTH_M) {
            // The `Water` schema refines `surface > bottom`, so this is unreachable
            // from a parsed record — which is exactly why it is checked. It fires
            // only if a builder upstream swapped the two, and a swapped pair would
            // otherwise extrude DOWNWARD through the pool floor.
            return {
                drew: 'nothing',
                id: water.id,
                reason: `water '${water.id}' has non-positive depth (${depth.toFixed(6)} m: surface ${top} is not above bottom ${bottom}) — an empty pool is the ABSENCE of water, not water with no depth`,
            };
        }

        const group = new THREE.Group();
        group.name = `water:${water.id}`;
        // ── ROOT userData — the SELECTABLE identity. ────────────────────────────
        // `parentId` is the POOL, not the water: ADR-0124 §3.1 wants one thing to
        // select, edit and delete, and `SelectionManager.PARENT_RESOLVED_ROLES` +
        // `userData.parentId` is the mechanism the pool's WALLS and FLOOR already
        // use for it (C15 §12). The water joining that convention is what stops a
        // click on the water selecting something the architect cannot delete.
        group.userData['id'] = water.id;
        group.userData['elementId'] = water.id;
        group.userData['type'] = 'water';
        group.userData['elementType'] = 'water';
        group.userData['selectable'] = true;
        // ⭐ THE KEY `applyLevelVisibility` MATCHES ON. Without it the water ignores
        // every level filter and every explode — it would hang in the air when its
        // storey is hidden, which is the most visible possible symptom.
        group.userData['levelId'] = water.levelId ?? '';
        if (water.poolId) group.userData['parentId'] = water.poolId;

        const shape = this._shapeOf(ring);
        // ExtrudeGeometry extrudes along +Z; `rotateX(-PI/2)` maps Z→Y so the
        // extrusion becomes +Y, then the body is translated so its UNDERSIDE sits
        // on `bottomElevation` and its top face lands exactly on `surfaceElevation`.
        // Same sequence as `FloorPanelBuilder._buildSinglePanelFloor`.
        const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
        geometry.rotateX(-Math.PI / 2);
        geometry.translate(0, bottom, 0);
        geometry.computeVertexNormals();

        const mesh = new THREE.Mesh(geometry, this._material(water));
        mesh.name = 'water-body';
        // ── CHILD userData. `role: 'geometry'` is LOAD-BEARING, not decorative:
        // `SelectionManager.PARENT_RESOLVED_ROLES` is exactly
        // `['geometry','mullion','panel']`, so any other role value silently fails
        // to resolve the click to its parent and the water becomes unselectable.
        mesh.userData['id'] = water.id;
        mesh.userData['parentId'] = water.id;
        mesh.userData['elementType'] = 'WaterPart';
        mesh.userData['role'] = 'geometry';
        mesh.userData['selectable'] = false;
        // Transparent bodies must be drawn AFTER the opaque basin that surrounds
        // them, or the basin's walls sort in front of the water they contain.
        mesh.renderOrder = 1;
        mesh.castShadow = false;      // water casting a hard shadow reads as a solid
        mesh.receiveShadow = true;
        group.add(mesh);

        this._scene.add(group);
        this._groups.set(water.id, group);
        return { drew: 'volume', id: water.id };
    }

    /**
     * The translucent blue the founder asked for.
     *
     * ⭐ `transparent: true` + `depthWrite: false` IS ALSO WHAT MAKES THE 3-D SITE
     * WORK, and that is reuse rather than coincidence. §CW90 item 6 (f16aeed6)
     * moved the site exporter's `classifyFormaWhiteRole` onto the AUTHORED
     * material's transparency, whose physical sniff is exactly
     * `transmission > 0 || (transparent && !depthWrite)`. Water authored
     * transparent therefore classifies as glass-like in the site GLB through the
     * ONE classifier, with no per-view special case and no fourth spelling of
     * "translucent" — which was that lane's whole point.
     */
    private _material(water: WaterRenderInput): THREE.MeshStandardMaterial {
        return new THREE.MeshStandardMaterial({
            // ⚠ NO `?? '#…'` / `?? 0.3` FALLBACK. Both values are resolved upstream
            // by `resolvePoolDimensions()`, the ONE chokepoint; a default invented
            // here would be a fourth tier that silently outranks nothing and
            // shadows the authored override (L-127).
            ...(water.color !== undefined ? { color: new THREE.Color(water.color) } : {}),
            ...(water.opacity !== undefined ? { opacity: water.opacity } : {}),
            transparent: true,
            depthWrite: false,
            // A pool is looked INTO from above and THROUGH from the side, so both
            // faces of the body are seen; back-face culling would make the far wall
            // of the water vanish and the body read as a flat sheet.
            side: THREE.DoubleSide,
            roughness: 0.1,     // water is near-specular — a matte body reads as plastic
            metalness: 0.0,
        });
    }

    /**
     * The plan outline as a THREE.Shape in the pre-rotation plane.
     *
     * ⚠ THE `-z` IS NOT A TYPO AND IT IS NOT COSMETIC — IT IS THE AXIS ALGEBRA.
     * `rotateX(-π/2)` maps a shape-plane point `(x, s)` extruded to depth `d` onto
     * world `(x, 0..d, -s)`. Feeding plan Z in as `s` therefore lands the body at
     * world `-z`: the water comes out MIRRORED about the X axis, filling the space
     * where the pool ISN'T. Negating here cancels the rotation's negation.
     *
     * ⭐ Caught by `WaterMeshBuilder.test.ts` W-3, which asserts the bounding box in
     * WORLD coordinates rather than trusting the return value — the mirrored body
     * was otherwise a perfectly valid prism of exactly the right size, in the wrong
     * place, and every seam-level assertion passed on it. `FloorPanelBuilder
     * ._buildShapeWithHoles` writes `-pt.z` for this same reason; the two now agree.
     */
    private _shapeOf(ring: ReadonlyArray<{ readonly x: number; readonly z: number }>): THREE.Shape {
        const shape = new THREE.Shape();
        shape.moveTo(ring[0]!.x, -ring[0]!.z);
        for (let i = 1; i < ring.length; i++) shape.lineTo(ring[i]!.x, -ring[i]!.z);
        shape.closePath();   // the boundary is an OPEN loop by convention — close it here
        return shape;
    }

    /**
     * Remove one water body and dispose its geometry. Returns whether there was
     * anything to remove, so "the water is gone" and "no water was ever drawn"
     * stay different facts for the caller to log.
     */
    removeWater(waterId: string): boolean {
        const group = this._groups.get(waterId);
        if (!group) return false;
        this._groups.delete(waterId);
        this._disposeGroup(group);
        return true;
    }

    /** Is a body currently drawn for this id? Used by the tests and the subscriber's log. */
    has(waterId: string): boolean {
        return this._groups.has(waterId);
    }

    /** How many bodies are drawn. A leaked group is a rising number that nothing else reports. */
    get count(): number {
        return this._groups.size;
    }

    /**
     * §C13 — the project-switch sweep verb. NON-TERMINAL by construction: this
     * builder subscribes to nothing and holds no listener, so clearing its geometry
     * leaves it able to draw the INCOMING project's pools. (That is the L-224
     * distinction `projectScopedBuilderTeardown` exists to police — a terminal
     * `dispose()` in the sweep leaves the next project with a dead builder.)
     */
    clearProjectGeometry(): void {
        for (const group of this._groups.values()) this._disposeGroup(group);
        this._groups.clear();
    }

    /** Alias kept so the sweep can call either verb. Same non-terminal semantics. */
    dispose(): void {
        this.clearProjectGeometry();
    }

    private _disposeGroup(group: THREE.Group): void {
        group.traverse((o: THREE.Object3D) => {
            const mesh = o as unknown as {
                geometry?: { dispose?: () => void };
                material?: THREE.Material | THREE.Material[];
            };
            mesh.geometry?.dispose?.();
            // ⚠ Materials ARE disposed here, unlike `BoundaryLineMeshBuilder`, which
            // shares a cached material per hex and therefore must not. Every water
            // body owns its own instance (colour and opacity are per-record authored
            // values), so leaving them would leak one material per pool per redraw.
            const mat = mesh.material;
            if (Array.isArray(mat)) for (const m of mat) m?.dispose?.();
            else mat?.dispose?.();
        });
        group.parent?.remove(group);
    }
}
