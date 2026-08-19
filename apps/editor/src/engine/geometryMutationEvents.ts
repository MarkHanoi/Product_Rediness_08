/**
 * @file apps/editor/src/engine/geometryMutationEvents.ts
 *
 * §GEOM-CASTER-EVENT-CHOKEPOINT (L-1188) — the SINGLE declared answer to
 * *"which BIM events change the set of meshes in the scene, and therefore the
 * shadow CASTER SET?"*
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 * `initScene.ts` carried this answer TWICE, as two hand-written string literals
 * (`_pascalGeomEvents` and `_rpcGeomEvents`), and they had already diverged:
 * `bim-lighting-*` was added to one and not the other (§FIX-LIGHT-TIER-UNWIRED),
 * and **eleven element families were in NEITHER**. The consequence is not
 * cosmetic — `_pascalGeomEvents` is what ARMS the
 * §FIX-SHADOW-WALLCOMMIT-DESTROY freeze (`_debouncedGeomAdded` →
 * `setShadowReallocFrozen(true)`), so a family absent from that literal mutates
 * the caster set with the live WebGPU shadow map UNFROZEN — the exact window
 * ADR-0111 / L-25 / L-39 / L-64 / L-908 each closed for one route at a time.
 *
 * **HANDRAIL was the founder's P0 (L-1188): `bim-handrail-added` /
 * `bim-handrail-updated` appear in neither literal.** `PascalSceneLighting
 * ._enableShadowsOnScene()` promotes EVERY non-denylisted Mesh to
 * `castShadow = true`, and a handrail's rail/post/baluster meshes carry
 * `userData.role = 'geometry'` — so handrail meshes ARE casters. A handrail
 * TYPE CHANGE detaches and re-mints all of them, and C95 §15.5 measures what
 * that costs on a real run: `dispatchHandrailRun` commits **one `HandrailData`
 * record per SEGMENT**, so a 31-segment circular run retype tears down and
 * re-creates **279 meshes and 93 distinct materials in one tick** —
 * `StairCurvedRailingBudget.spec.ts` records the neighbouring family losing the
 * WebGPU device at ~100 unique materials. That is the largest un-ordered GPU
 * churn in the product, and it is the one that runs with no freeze at all.
 *
 * ── THE ENUMERATION WAS THE BUG (C84 EI-4a) ─────────────────────────────────
 * Four separate `§FIX-…-DESTROY` tags exist because the guard is REMEMBERED per
 * route rather than ENFORCED over the family set. A fifth hand-added string
 * would repeat that. So this list is the single source AND it is gated:
 * `apps/editor/__tests__/geometryCasterEvents.test.ts` reads
 * `packages/event-bus/src/catalog.ts` and fails if any `bim-*-added|updated`
 * event is in neither {@link GEOMETRY_CASTER_MUTATION_EVENTS} nor
 * {@link NON_CASTER_BIM_EVENTS}. A new element family therefore cannot be born
 * outside the freeze without a human classifying it, in writing, in one place.
 *
 * ⚠ SCOPE. This governs the SHADOW-SAFETY list only. The tier/PBR list
 * (`_rpcGeomEvents`) is deliberately NOT unified with it: each of its events
 * costs two FULL-SCENE traverses (`collectNewPbrMeshes` + the mesh count) on a
 * `setTimeout(0)` per event, so widening it to the per-segment handrail family
 * would trade a device-loss crash for the L-1151/L-1155 O(n²) defect class.
 * That gap is logged separately (L-1188 §Residue) rather than silently fixed.
 */

/**
 * Every BIM event that adds, rebuilds or re-materialises SCENE GEOMETRY, and so
 * changes the shadow caster set. Listeners on these arm the wall-commit shadow
 * freeze and re-run the shadow-flag pass.
 *
 * ⛔ Do not add a string here without also removing it from
 * {@link NON_CASTER_BIM_EVENTS}; the gate asserts the two are disjoint.
 */
export const GEOMETRY_CASTER_MUTATION_EVENTS = [
    // ── Structure ───────────────────────────────────────────────────────────
    'bim-wall-added', 'bim-wall-updated',
    'bim-slab-added', 'bim-slab-updated',
    'bim-ceiling-added', 'bim-ceiling-updated',
    'bim-floor-added', 'bim-floor-updated',
    'bim-column-added', 'bim-column-updated',
    'bim-beam-added', 'bim-beam-updated',
    'bim-roof-added', 'bim-roof-updated',
    'bim-curtainwall-added', 'bim-curtainwall-updated',
    // ── Circulation ─────────────────────────────────────────────────────────
    'bim-stair-added', 'bim-stair-updated',
    'bim-stair-geometry-updated',
    'bim-stair-landing-added', 'bim-stair-landing-updated',
    // §GEOM-CASTER-EVENT-CHOKEPOINT — a stair railing is a DIFFERENT element from
    // its stair (semantic 'stair-railing', store `stairRailingStore`, builder
    // `StairRailingBuilder`) and emits its OWN event, so `bim-stair-*` never
    // covered it. Same per-baluster mesh/material churn as handrail.
    'bim-stair-railing-added', 'bim-stair-railing-updated',
    'bim-lift-added', 'bim-lift-updated',
    // ── Railings (the founder's P0 — L-1188) ────────────────────────────────
    'bim-handrail-added', 'bim-handrail-updated',
    // `bim-railing-updated` is the transform-drag alias emitted by
    // registerTransformDragHandler; it moves the same meshes.
    'bim-railing-updated',
    // ── Hosted openings — these rebuild their HOST wall's mesh set ──────────
    'bim-door-added', 'bim-door-updated',
    'bim-window-added', 'bim-window-updated',
    'bim-opening-added', 'bim-opening-updated',
    // ── Fit-out ─────────────────────────────────────────────────────────────
    'bim-furniture-added', 'bim-furniture-updated',
    'bim-plumbing-added', 'bim-plumbing-updated',
    'bim-lighting-added', 'bim-lighting-updated',
] as const;

/**
 * Events in the catalogue that match the `bim-*-added|updated` shape but do NOT
 * mutate scene geometry. Each carries its reason — the gate accepts a member
 * here only because a human wrote why.
 */
export const NON_CASTER_BIM_EVENTS: ReadonlyArray<readonly [event: string, reason: string]> = [
    ['bim-clipboard-updated',
        'clipboard contents — no scene object is created, moved or destroyed.'],
    ['bim-level-added',
        'a level DATUM. Creating one adds no mesh; the elements it later hosts emit their own events.'],
    ['bim-level-updated',
        'a level datum edit re-emits the per-element events for anything it moves (levelChangeVerbs); ' +
        'listening here as well would double the freeze window for no additional coverage.'],
    ['bim-room-added',
        'a ROOM is a detected analytical region (room-detection), not a mesh in the shadow pass.'],
    ['bim-room-updated',
        'as bim-room-added — analytical, and it fires per detection pass (L-1154/L-1155 measured ' +
        'hundreds per batch), so arming a GPU freeze from it would be a perf defect.'],
    ['bim-room-bounding-line-added',
        'a 2-D plan-space boundary line; it has no 3-D representation in the shadow pass.'],
    ['bim-room-bounding-line-updated',
        'as bim-room-bounding-line-added.'],
    ['bim-lift-type-added',
        'a CATALOGUE registry entry (a type definition), not an instance — no geometry until placed.'],
    ['bim-stair-type-added',
        'a CATALOGUE registry entry (a type definition), not an instance — no geometry until placed.'],
];
