/**
 * ghostParticipation — §INSPECT-OPENINGS-PARTICIPATE (L-2030), 2026-08-21.
 *
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Builder / inspect layer — PURE decision derivation. No THREE,
 *                    no DOM, no store, no registry, no semantic-graph access. The
 *                    CALLER (`DiagnosticMaterialManager`) owns every scene write.
 * Architectural Classification: A (view-only).
 * Impact Assessment: Semantic No · Constraint No · Graph No · Topology No ·
 *                    Store-Registry No · Undo No.
 * Contract:          C15 (hosted elements: doors/windows in walls) ·
 *                    C84 §9 (element integrity — a family is not exempt from a
 *                    view treatment merely because it is hosted) ·
 *                    P7 (this is VIEW presentation; it writes no element state
 *                    and flips no `.visible`).
 *
 * ── ⛔ THE DEFECT THIS CLOSES, measured 2026-08-21 ──────────────────────────
 *
 * Founder, production `071a7b2c`, WebGL: *"in Inspect mode, some windows render
 * in black — clearly not part of the colour mapping."*
 *
 * `DiagnosticMaterialManager._applyGhostToNonRoomMesh()` carried this, verbatim:
 *
 *     let ancestor = obj.parent;
 *     while (ancestor) {
 *       const aType = (ancestor.userData?.elementType ?? '').toLowerCase();
 *       if (aType === 'door' || aType === 'window') return false;   // ⛔
 *       ancestor = ancestor.parent;
 *     }
 *
 * `return false` means NO GHOST MATERIAL IS APPLIED. So doors and windows were
 * the ONLY element families in the model that kept their AUTHORED, fully opaque
 * materials while every other surface was replaced by a 4–10% translucent ghost.
 * An opening is therefore the only opaque, depth-writing thing left in the frame
 * — it reads as a solid silhouette punched through the X-ray, which is exactly
 * the founder's *"clearly not part of the colour mapping"*.
 *
 * ⚠ THE SKIP WAS A FIX FOR A REAL DEFECT, AND THAT DEFECT MUST NOT COME BACK.
 * `DiagnosticMaterialManager`'s own header records it as "Fix 2 — Ghost profile
 * walls from door/window sub-meshes": a `fine`-LOD window is TWELVE overlapping
 * sub-boxes (frame, mullion, transom, sash, bead, per-cell panes, sill) and a
 * door is similar, so ghosting each of them at the flat non-structural 0.04
 * accumulates to 1 − 0.96¹² ≈ 38% white — a bright blob where a wall (1–2
 * meshes at 0.10) accumulates ≈ 19%. Blanking the whole family was the wrong
 * lever: it traded a too-bright ghost for no ghost at all.
 *
 * ⭐ THE RULE THIS ENCODES INSTEAD: **ghost weight is per ELEMENT, not per MESH.**
 * An opening's sub-meshes ghost at `GHOST_OPENING_OPACITY`, chosen so a
 * twelve-part window accumulates to roughly the same alpha as a one-to-two-part
 * wall at `GHOST_STRUCTURAL_OPACITY` (1 − 0.985¹² ≈ 0.17 vs ≈ 0.19). The window
 * is present in the X-ray, at a wall's visual weight, and cannot show one pixel
 * of its authored colour.
 *
 * ⚠ A SECOND, SEPARATE DEFECT IS CLOSED HERE — the HIT-PROXY.
 * `WindowBuilder._convertGroupToInstances` leaves one invisible selection proxy
 * per window (`userData.role = 'hit-proxy'`, `MeshBasicMaterial{ colorWrite:
 * false }`); the wall/column instanced paths do the same. `applyGhostWithFocus`
 * → `_applyClearWorldGhost` replaced that material with a VISIBLE MeshPhong,
 * turning an invisible raycast helper into a window-sized box in the viewport.
 * A mesh whose whole contract is "never drawn" is never a ghost subject.
 */

/** What the ghost pass should do with one mesh. */
export type GhostRole =
    /** System geometry with a ShaderMaterial (OBC SimpleGrid). Never touched. */
    | 'skip-shader'
    /** Invisible selection proxy (`colorWrite:false`). Never touched. */
    | 'skip-hit-proxy'
    /** Room volume / room floor overlay — the caller owns these. */
    | 'room'
    /** Slab / column / wall — frosted ghost + cyan edge overlay (§1.1). */
    | 'structural'
    /** Door / window sub-mesh — ghosted at per-element weight, no edge overlay. */
    | 'opening'
    /** Everything else — flat white ghost. */
    | 'non-structural';

/**
 * The element families treated as hosted OPENINGS. Matched against
 * `userData.elementType` on the mesh OR any ancestor, because
 * `DoorBuilder` / `WindowBuilder` stamp the type on the parent `THREE.Group`
 * and leave the sub-meshes untagged (C15 — a hosted element is a group).
 */
export const OPENING_ELEMENT_TYPES: readonly string[] = ['door', 'window'] as const;

/** Substrings that classify a mesh as structural for §1.1's frosted ghost. */
export const STRUCTURAL_TYPE_FRAGMENTS: readonly string[] = ['slab', 'column', 'wall'] as const;

/** §1.1 — structural frosted ghost opacity (the reference weight). */
export const GHOST_STRUCTURAL_OPACITY = 0.10;

/** §1.1 — flat non-structural ghost opacity. */
export const GHOST_NON_STRUCTURAL_OPACITY = 0.04;

/**
 * Per-sub-mesh ghost opacity for a hosted opening.
 *
 * Chosen so that the ACCUMULATED alpha of a `fine`-LOD window (12 stacked
 * sub-boxes, all `depthWrite:false`) lands at a wall's visual weight rather
 * than at three times it:
 *   1 − (1 − 0.015)¹² ≈ 0.166   vs   a 2-mesh wall at 0.10 → 1 − 0.9² = 0.19.
 * See the header: ghost weight is a property of the ELEMENT, not of the mesh
 * count the builder happened to use.
 */
export const GHOST_OPENING_OPACITY = 0.015;

/** The `userData.role` value builders stamp on invisible selection proxies. */
export const HIT_PROXY_ROLE = 'hit-proxy';

/**
 * The facts about one mesh that decide its ghost role. Deliberately plain data
 * so this module needs no THREE import and a headless test can drive it.
 */
export interface GhostSubject {
    /** `userData.type ?? userData.elementType` on the mesh itself, lowercased. */
    readonly selfType: string | null;
    /** `userData.elementType ?? userData.type` for each ancestor, nearest first, lowercased. */
    readonly ancestorTypes: readonly (string | null)[];
    /** `userData.role` on the mesh itself. */
    readonly role: string | null;
    /** True when `userData.isRoomVolume` or `userData.isRoomOverlay` is set. */
    readonly isRoom: boolean;
    /** True when the mesh's (first) material is a THREE.ShaderMaterial. */
    readonly isShaderMaterial: boolean;
}

/**
 * Resolve the ghost role for one mesh.
 *
 * Order is load-bearing:
 *   1. ShaderMaterial — the OBC `SimpleGrid` `uZoom` crash guard. Replacing that
 *      material makes `grid.material.uniforms` undefined and every camera move
 *      throws. Must out-rank everything.
 *   2. hit-proxy — a mesh that is invisible BY CONTRACT is never a ghost subject.
 *   3. room — the caller (`_applyGhost`) owns room volumes and overlays.
 *   4. opening — hosted door/window, on the mesh or ANY ancestor.
 *   5. structural / non-structural — the pre-existing §1.1 split.
 */
export function resolveGhostRole(subject: GhostSubject): GhostRole {
    if (subject.isShaderMaterial) return 'skip-shader';
    if (subject.role === HIT_PROXY_ROLE) return 'skip-hit-proxy';
    if (subject.isRoom) return 'room';

    if (isOpeningType(subject.selfType)) return 'opening';
    for (const t of subject.ancestorTypes) {
        if (isOpeningType(t)) return 'opening';
    }

    const self = subject.selfType ?? '';
    if (STRUCTURAL_TYPE_FRAGMENTS.some(f => self.includes(f))) return 'structural';

    return 'non-structural';
}

/** The ghost opacity for a role, or `null` when the role is not ghosted here. */
export function ghostOpacityForRole(role: GhostRole): number | null {
    switch (role) {
        case 'structural':     return GHOST_STRUCTURAL_OPACITY;
        case 'opening':        return GHOST_OPENING_OPACITY;
        case 'non-structural': return GHOST_NON_STRUCTURAL_OPACITY;
        default:               return null;
    }
}

/** True when the role means "this mesh received a ghost material". */
export function roleIsGhosted(role: GhostRole): boolean {
    return ghostOpacityForRole(role) !== null;
}

function isOpeningType(t: string | null | undefined): boolean {
    if (!t) return false;
    return OPENING_ELEMENT_TYPES.includes(t);
}
