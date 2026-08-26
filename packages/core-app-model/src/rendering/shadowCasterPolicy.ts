/**
 * @file packages/core-app-model/src/rendering/shadowCasterPolicy.ts
 *
 * §MESH110-SHADOW-POLICY (L-11565) — the per-family SHADOW-CASTING POLICY.
 *
 * THE MEASUREMENT THAT FORCED THIS FILE TO EXIST (§PERF105, L-11565): at the
 * founder's scale **907 of 978 meshes were shadow casters**, every one of them
 * re-submitted on every shadow-map refresh, and the only family with any caster
 * policy at all was furniture (`furnitureShadowBudget.ts`). Everything else was
 * promoted to caster by `PascalSceneLighting._enableShadowsOnScene`'s blanket
 * sweep — which also **silently UNDID every deliberate builder decision**: the
 * furniture budget's `castShadow = false`, `CeilingPanelBuilder`'s, the lighting
 * builder's cables-don't-cast — all re-promoted within one ~100 ms debounce of
 * the next geometry event. A policy that does not own that sweep is not a policy.
 *
 * ADR-0120 rule 1 names this design as the stated successor of the radius
 * denylist: *"an explicit allowlist keyed on BIM element identity"* — a mesh
 * casts because of WHAT IT IS, not because its name fails a substring test.
 *
 * THE THREE VERDICTS — and why there are three, not two:
 *
 *   · `'cast'`    — structural BIM geometry (walls, slabs, roofs, columns,
 *                   doors, stairs …). The sweep PROMOTES it, exactly as before.
 *   · `'no-cast'` — geometry whose shadow is invisible or wrong by construction
 *                   (flat floor decor, invisible pick proxies, builder-declared
 *                   never-casters). The sweep DEMOTES it — clears a `castShadow`
 *                   some earlier pass set, it does not merely skip (the L-205
 *                   lesson: skipping leaves the previous pass's promotion live).
 *   · `'builder'` — families whose OWN BUILDER makes a deliberate per-mesh
 *                   choice (furniture via `furnitureShadowBudget` + its engines;
 *                   lighting via per-part flags — bodies cast, cables/lenses
 *                   never). The sweep LEAVES `castShadow` exactly as built.
 *                   Collapsing this into `'cast'` is precisely the trampling
 *                   this file exists to stop; collapsing it into `'no-cast'`
 *                   would erase the builders' real casters. It must be a third
 *                   state.
 *
 * ⛔ This file must stay PURE (no THREE, no DOM, no store reads) so a headless
 * test can drive every verdict, and so the sweep — the single writer — is the
 * only place that touches mesh flags.
 *
 * ⚠ The sun/key light is NOT this file's subject: §PERF-HEAVY-SHADOW-OFF
 * (`setShadowsSuppressed`) stays the coarse all-or-nothing lever, and fixture
 * point lights already never cast (§NIGHT-ALL-LIGHTS-ON). This policy governs
 * which MESHES are submitted to the one shadow pass that exists.
 */

/**
 * Sub-texel floor: with the default 1024² shadow map over the ±50 m ortho
 * frustum (`DEFAULT_CONFIG.shadowMapSize` / `shadowCameraSize`), one shadow
 * texel covers ~10 cm of world. A caster whose world bounding radius is below
 * this floor cannot mark even one texel — submitting it buys nothing but a
 * draw. Door hinge plates, handle roses, trim beads and cable runs live here.
 * Applied ONLY on the promote path and ONLY when the radius was actually
 * measured — a degenerate geometry whose bounds could not be computed is never
 * demoted on a number nobody measured.
 */
export const MIN_CASTER_RADIUS_M = 0.05;

/** The verdict the scene sweep executes for one mesh. */
export type ShadowCasterVerdict = 'cast' | 'no-cast' | 'builder';

/**
 * The little of a mesh's userData the policy needs — plain data, so the policy
 * is testable without THREE and the sweep stays the only flag writer.
 */
export interface ShadowPolicySubject {
    /** `userData.elementType` — the per-family key the census itself uses. */
    readonly elementType?: string;
    /** `userData.role` — e.g. `'hit-proxy'`, `'lighting.lens'`, `'geometry'`. */
    readonly role?: string;
    /** `userData.furnitureType` — stamped on furniture child meshes. */
    readonly furnitureType?: string;
    /**
     * `userData.shadowPolicy` — a builder's EXPLICIT declaration. `'never'`
     * marks a deliberate non-caster (ceiling/floor finish panels). This exists
     * because THREE's default `castShadow === false` is indistinguishable from
     * a builder's deliberate `false` — without the marker, the sweep cannot
     * tell restraint from absence and has historically promoted both.
     */
    readonly shadowPolicy?: string;
}

/**
 * Flat floor/wall decor whose cast shadow is degenerate by construction: a rug
 * lies ON the surface that would receive its shadow, wall art hangs flush on
 * the wall behind it. These never cast, at any quality tier.
 *
 * ⚠ DELIBERATE OVERLAP with `furnitureShadowBudget.ts`'s DECORATIVE set, with
 * DIFFERENT semantics: the budget turns ALL decorative furniture off only at
 * the low tier; this set is the strictly-flat subset that never casts at any
 * tier. The two cannot share a constant today without an import edge from
 * core-app-model into geometry-furniture (wrong direction); unifying the
 * vocabulary in a shared L0 module is named as follow-up in the lane report
 * (same shape as L-11409).
 */
const FLAT_DECOR_FURNITURE_EXACT: ReadonlySet<string> = new Set([
    'rug',
    'wall_art',
    'wall_mirror',
    'wall_tapestry',
    'curtain_rod',
    'curtain_panel',
]);

/** Furniture-family elementType stamps (child meshes + instanced aggregates). */
const FURNITURE_ELEMENT_TYPES: ReadonlySet<string> = new Set([
    'furniture',
    'furniturepart',
    'kitchencabinetpart',
]);

/**
 * Resolve the shadow-casting verdict for one mesh.
 *
 * Order is load-bearing:
 *   1. builder-declared `'never'` — the strongest statement available.
 *   2. hit-proxies — invisible `colorWrite:false` raycast helpers; they are
 *      `visible:true`, so before this rule the shadow pass genuinely rendered
 *      their depth (a wall-sized box, duplicating the wall's own shadow).
 *   3. flat decor — never casts, at any tier (before the furniture arm, which
 *      would otherwise defer these to the tier-gated budget).
 *   4. furniture / lighting — the builder owns the per-mesh choice.
 *   5. everything else — structural BIM geometry: cast.
 */
export function shadowCasterVerdict(s: ShadowPolicySubject): ShadowCasterVerdict {
    if (s.shadowPolicy === 'never') return 'no-cast';

    // The literal every builder stamps (WallFragmentBuilder / WindowBuilder /
    // ColumnFragmentBuilder / BeamFragmentBuilder) and apps/editor's
    // ghostParticipation.HIT_PROXY_ROLE re-declares. core-app-model cannot
    // import the L7 constant (layer direction), so the literal is stated here
    // with this pointer.
    if (s.role === 'hit-proxy') return 'no-cast';

    const furnitureType = s.furnitureType;
    if (furnitureType !== undefined) {
        if (
            FLAT_DECOR_FURNITURE_EXACT.has(furnitureType) ||
            furnitureType.endsWith('_carpet') ||
            furnitureType.includes('carpet')
        ) {
            return 'no-cast';
        }
        return 'builder';
    }

    const elementType = s.elementType?.toLowerCase();
    if (elementType !== undefined && FURNITURE_ELEMENT_TYPES.has(elementType)) {
        return 'builder';
    }
    if (elementType === 'lighting') return 'builder';

    return 'cast';
}
