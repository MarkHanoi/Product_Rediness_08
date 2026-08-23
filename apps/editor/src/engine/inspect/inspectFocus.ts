/**
 * inspectFocus — §INSPECT-FOCUS-IS-ELEMENT-SHAPED (L-8200), 2026-08-23.
 *
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Builder / inspect layer — PURE decision derivation. No THREE,
 *                    no DOM, no store, no registry, no semantic-graph access. The
 *                    CALLER (`DiagnosticMaterialManager`) owns every scene write.
 * Architectural Classification: A (view-only).
 * Impact Assessment: Semantic No · Constraint No · Graph No · Topology No ·
 *                    Store-Registry No · Undo No.
 * Contract:          C09 §4.3.3 (Inspect emphasis is element-shaped) ·
 *                    C09 §4.3.1 (derived geometry is not a visibility subject) ·
 *                    C84 EI-9 (one name, one meaning) ·
 *                    P7 (this is VIEW presentation; it writes no element state
 *                    and flips no `.visible`).
 *
 * ── ⛔ THE DEFECT THIS CLOSES, measured 2026-08-23 ──────────────────────────
 *
 * Founder, production, WebGL: *"INSPECT TAB: when I select the room, it highlights
 * in the 3-D view in inspect mode and works perfect. However, when I select a wall
 * it highlights for a second — or less — and stops being highlighted."*
 *
 * `DiagnosticMaterialManager` carried ONE focus parameter and it was named for a
 * room — `applyLens(lens, deltaMap, scene, selectedRoomId?: string)`. Every lens
 * that could emphasise anything decided it with this, verbatim:
 *
 *     if (ud.isRoomVolume) {
 *       const isSelected = !!(selectedRoomId && ud.roomId === selectedRoomId);
 *       …
 *     }
 *
 * ⭐ A WALL MESH HAS NO `roomId` AND IS NOT `isRoomVolume`, so that comparison is
 * UNREACHABLE FOR A WALL BY CONSTRUCTION — not "sometimes wrong", not "wrong for
 * some builders": there is no scene in which it can be true for a wall. Rooms
 * "work perfect" because the jewel is re-minted BY THE LENS on every apply;
 * walls had no emphasis path at all, so the only thing the founder saw was
 * `SelectionManager`'s purple overlay — which the very next lens re-apply then
 * repainted at the 4% non-structural ghost weight (`resolveGhostRole` returns
 * `'non-structural'` for a highlight clone: it carries `isHelper`/`sharedGeometry`
 * and NO `type`). That is the "for a second — or less", exactly: one frame.
 *
 * ⭐ THE RULE THIS ENCODES: **the lens OWNS emphasis, and emphasis is keyed on an
 * ELEMENT id, never on a room id.** The room jewel becomes one arm of an
 * element-shaped decision rather than the only decision there is. A second
 * special case for walls is how the third one becomes inevitable (C84 EI-8).
 *
 * ⚠ THE THREE SKIPS ARE NOT OPTIONAL AND EACH IS A DEFECT THIS REPO HAS PAID FOR:
 *   · `skip-shader`   — replacing the OBC `SimpleGrid` ShaderMaterial makes
 *                       `grid.material.uniforms` undefined and every camera move
 *                       throws `'uZoom'` (DiagnosticMaterialManager header, Fix 3).
 *   · `skip-hit-proxy`— `_resolveElementId` walks ANCESTORS, so a window's
 *                       invisible `colorWrite:false` selection proxy resolves to
 *                       its element's id. Painting it opaque blue turns a raycast
 *                       helper into a window-sized box (L-2031, and `applyAttribute
 *                       Heatmap` already learned this at 0.9 opacity).
 *   · `room`          — the room volume owns the jewel; the solid treatment must
 *                       not overwrite it. A room volume that also stamps
 *                       `userData.id` would otherwise take the solid blue and lose
 *                       its violet.
 */

// ⛔ `HIT_PROXY_ROLE` is IMPORTED, never re-declared. It already exists, once, in
// `ghostParticipation.ts`, and a second copy here would be the exact defect this
// module argues against one paragraph up (C84 EI-8): two names for one fact, which
// agree until the day a builder changes the marker and only one of them is edited.
import { HIT_PROXY_ROLE } from './ghostParticipation';

export { HIT_PROXY_ROLE };

/** The Inspect focus treatment one mesh should receive. */
export type FocusRole =
    /** Not focused, or not a focus subject — the lens' own base pass keeps it. */
    | 'none'
    /** A focused ROOM volume — the §1.3 violet translucent jewel + pulse. */
    | 'room-jewel'
    /** A focused non-room SOLID — the opaque Inspect-blue focus fill. */
    | 'solid-focus'
    /**
     * A focused element's invisible HIT-PROXY, offered as a LAST RESORT.
     *
     * ⭐ THE MEASUREMENT THAT FORCED THIS ROLE TO EXIST, 2026-08-23. For an element
     * rendered through `InstancedElementRenderer`, the visible geometry lives in a
     * shared `InstancedMesh` parented at the SCENE ROOT and stamped
     * `userData.id = 'instanced-group-<key>'` (`InstancedElementRenderer.ts:480,490`)
     * — so `_resolveElementId` on it returns a GROUP id and the element's own id
     * appears on NO visible mesh. The ONLY per-element geometry left inside the
     * element's group is the invisible `colorWrite:false` hit-proxy the builders add
     * for raycasting (`WallFragmentBuilder.ts:1520`, `WindowBuilder.ts:1119`,
     * `ColumnFragmentBuilder.ts:436`, `BeamFragmentBuilder.ts:529`).
     *
     * ⛔ `WallFragmentBuilder.ts:1303` estimates **70–85% of walls** take the
     * instanced path. Skipping the proxy unconditionally would therefore mean the
     * founder's wall highlights NOTHING — a fix that is committed and unreachable,
     * which is worse than the defect because it also looks fixed.
     *
     * ⚠ THIS IS NOT A REVERSAL OF L-2031, and the distinction is the whole reason
     * this is a SEPARATE role rather than a widened `'solid-focus'`. L-2031 was a
     * BLANKET sweep — `_applyClearWorldGhost` and `applyAttributeHeatmap` painted
     * every proxy in the scene, surfacing window-sized boxes for elements nobody
     * asked about. This role fires for ONE element, only because the user selected
     * it, and — per `_applyElementFocus` — only when no ordinary mesh of that
     * element was painted. The caller, not this module, owns that last condition:
     * the decision here is "this proxy belongs to a focused element", the POLICY is
     * "use it only if nothing better existed".
     *
     * ⚠ For an instanced WALL the proxy is not an approximation: the instancing gate
     * admits only simple walls (no openings, not curved, un-mitred, single layer),
     * and the proxy is `BoxGeometry(length, height, thickness)` at the wall's exact
     * pose — it IS the wall. For a window it is the opening's bounding box rather
     * than the frame silhouette, which is a legible "this one is focused" in a lens
     * where everything else is 4–10% translucent, and is stated rather than hidden.
     */
    | 'proxy-fallback';

/**
 * The facts about one mesh that decide its focus role. Deliberately plain data so
 * this module needs no THREE import and a headless test can drive it — the same
 * shape, and the same reason, as `ghostParticipation.GhostSubject`.
 */
export interface FocusSubject {
    /**
     * The element id this mesh belongs to, resolved by walking `userData.id ??
     * userData.elementId` up the ancestor chain (`DiagnosticMaterialManager.
     * _resolveElementId`). `null` when nothing in the chain claims an id — which
     * is the case for the world grid, for scene-root helper groups, and for
     * `SelectionManager`'s highlight clones.
     */
    readonly elementId: string | null;
    /** `userData.roomId` — the room a ROOM VOLUME mesh depicts, if any. */
    readonly roomId: string | null;
    /** True when `userData.isRoomVolume` is set. */
    readonly isRoomVolume: boolean;
    /** True when `userData.isRoomOverlay` is set. */
    readonly isRoomOverlay: boolean;
    /** `userData.role` on the mesh itself. */
    readonly role: string | null;
    /** True when the mesh's (first) material is a THREE.ShaderMaterial. */
    readonly isShaderMaterial: boolean;
}

/**
 * Resolve the focus role for one mesh against the focused element-id set.
 *
 * Order is load-bearing:
 *   1. empty set — nothing is focused, so nothing is emphasised. ⛔ This is the
 *      clause that keeps the founder's standing *"don't compromise graphics"*
 *      constraint TRIVIALLY true rather than argued: with nothing selected every
 *      subject resolves `'none'` and the scene is byte-for-byte the lens' base pass.
 *   2. ShaderMaterial — the `uZoom` crash guard. Must out-rank everything.
 *   3. hit-proxy — NEVER an ordinary focus subject. It is offered as
 *      `'proxy-fallback'` when it belongs to a focused element, and the CALLER
 *      decides whether to use it (see that role's doc for why the policy lives
 *      there and not here). An UNfocused proxy is always `'none'`, which is the
 *      whole of L-2031 preserved.
 *   4. room volume — the jewel arm, keyed on `roomId` (a room volume's identity in
 *      this pass is its room, which is why `roomId` and `elementId` are separate
 *      fields rather than one guessed-at id).
 *   5. room overlay — the floor overlay is hidden under a volume by every lens
 *      that has a jewel; it is never independently focused.
 *   6. everything else — solid focus when the resolved element id is in the set.
 */
export function resolveFocusRole(
    subject:    FocusSubject,
    focusedIds: ReadonlySet<string>,
): FocusRole {
    if (focusedIds.size === 0)               return 'none';
    if (subject.isShaderMaterial)            return 'none';

    if (subject.role === HIT_PROXY_ROLE) {
        return subject.elementId !== null && focusedIds.has(subject.elementId)
            ? 'proxy-fallback'
            : 'none';
    }

    if (subject.isRoomVolume) {
        return subject.roomId !== null && focusedIds.has(subject.roomId)
            ? 'room-jewel'
            : 'none';
    }
    if (subject.isRoomOverlay)               return 'none';

    return subject.elementId !== null && focusedIds.has(subject.elementId)
        ? 'solid-focus'
        : 'none';
}

/**
 * Normalise any focus source into the ONE set shape the manager stores.
 *
 * ⚠ `undefined`, `null` and an empty iterable are the SAME VALUE here and that is
 * deliberate: "no focus" has exactly one representation, so a caller cannot mint a
 * second one that a `?.` chain then treats differently. (The repo has a standing
 * note on failure-vs-empty collapsing; this is the case where collapsing them is
 * correct, because there is no failure mode — a focus set is either populated or
 * it is not.)
 */
export function toFocusSet(ids: Iterable<string> | null | undefined): ReadonlySet<string> {
    if (!ids) return EMPTY_FOCUS;
    const set = new Set<string>();
    for (const id of ids) {
        if (typeof id === 'string' && id.length > 0) set.add(id);
    }
    return set.size === 0 ? EMPTY_FOCUS : set;
}

/** The single shared "nothing is focused" value. */
export const EMPTY_FOCUS: ReadonlySet<string> = new Set<string>();
