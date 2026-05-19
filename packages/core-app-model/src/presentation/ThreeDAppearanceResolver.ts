/**
 * ThreeDAppearanceResolver — Wave 8 / Stage S5
 *
 * Bridges the Visibility-Intent system's `ThreeDimensionalAppearance` schema
 * to live `THREE.Material` instances on the 3D scene.
 *
 * Two responsibilities:
 *   1. **Resolve** — given a (viewId, elementType, state), look up the bound
 *      intent via `ViewIntentInstanceStore` + `VisibilityIntentStore` and
 *      delegate to `resolveSurface3D()`. Returns `null` when the view has no
 *      bound intent (callers should preserve their existing material).
 *   2. **Apply** — mutate a `THREE.Material` to reflect a
 *      `ThreeDimensionalAppearance`. Only fields present on the descriptor
 *      are written; absent fields leave the material untouched, so callers
 *      can compose this with other appliers (VG transparency, halftone, …).
 *
 * Material-model swap policy: this resolver does **not** swap material classes
 * (e.g. Lambert ↔ Standard ↔ Basic). Doing so requires reconstructing the
 * mesh-level material slot and is owned by the builder layer (e.g.
 * `MaterialService`, `WallFragmentBuilder`). When `surface3D.material`
 * disagrees with the live material class, this resolver only applies the
 * fields that are valid on the live class — colour / opacity / metalness /
 * roughness when they exist as own properties — and leaves the model in
 * place. This keeps the applier strictly behaviour-preserving when no
 * `surface3D` block is set on the intent.
 */

import * as THREE from '@pryzm/renderer-three/three';
import {
    ThreeDimensionalAppearance,
    ElementState,
} from './VisibilityIntentTypes';
import { resolveSurface3DExplicit } from './IntentRuleResolver';
import { resolveBoundIntentWithInheritance } from '@pryzm/core-app-model';
import { viewDefinitionStore } from '../views/ViewDefinitionStore';

export class ThreeDAppearanceResolver {
    /**
     * Resolve the 3D surface descriptor for an element type in a specific
     * view, using the view's bound intent + the standard projection state.
     * Returns `null` when no intent is bound — callers should leave the
     * material untouched in that case.
     *
     * Wave 9 / Stage S6 — uses `resolveBoundIntentWithInheritance` so detail /
     * dependent views inherit their parent view's bound intent when they have
     * no own binding. The walk is cycle-safe (Set<viewId> guard inside
     * `resolveWithInheritance`).
     */
    public resolveForView(
        viewId: string,
        elementType: string,
        state: ElementState = 'projection',
    ): ThreeDimensionalAppearance | null {
        const resolved = resolveBoundIntentWithInheritance(viewId);
        if (!resolved) return null;
        const view = viewDefinitionStore.get(viewId);
        const viewPurpose = (view as any)?.viewPurpose;
        return resolveSurface3DExplicit(
            resolved.instance, resolved.intent, elementType, state, {}, viewPurpose,
        );
    }

    /**
     * Mutate a live THREE.Material to reflect a `ThreeDimensionalAppearance`.
     * Skips any field the descriptor leaves undefined and any field the live
     * material class cannot represent. Returns `true` when at least one field
     * was written (so callers can decide whether to flag `needsUpdate`).
     */
    public applyToMaterial(material: THREE.Material, surface3D: ThreeDimensionalAppearance): boolean {
        let dirty = false;
        const m = material as any;

        if (surface3D.colour !== undefined && m.color && typeof m.color.set === 'function') {
            m.color.set(surface3D.colour);
            dirty = true;
        }
        if (surface3D.opacity !== undefined && typeof material.opacity === 'number') {
            const opacity = Math.max(0, Math.min(1, surface3D.opacity));
            material.opacity = opacity;
            material.transparent = opacity < 1;
            material.depthWrite = !material.transparent;
            dirty = true;
        }
        // PBR fields only mutate when the live material exposes them
        // (MeshStandardMaterial / MeshPhysicalMaterial). On Lambert / Basic
        // they're absent, so we silently skip — see header note.
        if (surface3D.metalness !== undefined && typeof m.metalness === 'number') {
            m.metalness = Math.max(0, Math.min(1, surface3D.metalness));
            dirty = true;
        }
        if (surface3D.roughness !== undefined && typeof m.roughness === 'number') {
            m.roughness = Math.max(0, Math.min(1, surface3D.roughness));
            dirty = true;
        }

        if (dirty) material.needsUpdate = true;
        return dirty;
    }

    /**
     * Convenience: resolve and apply in one call. Returns `true` if a patch
     * was found and at least one field was written.
     */
    public applyForView(
        viewId: string,
        elementType: string,
        material: THREE.Material,
        state: ElementState = 'projection',
    ): boolean {
        const descriptor = this.resolveForView(viewId, elementType, state);
        if (!descriptor) return false;
        return this.applyToMaterial(material, descriptor);
    }
}

/** Singleton instance — match the lifecycle of the other VG/Intent appliers. */
export const threeDAppearanceResolver = new ThreeDAppearanceResolver();
