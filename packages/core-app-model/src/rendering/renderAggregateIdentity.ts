/**
 * @file packages/core-app-model/src/rendering/renderAggregateIdentity.ts
 *
 * §TOPO-AGGREGATE-IS-NOT-AN-ELEMENT (L-10530) — THE ONE PLACE that answers
 * *"is this scene object a BIM element, or a GPU render batch wearing an id?"*
 *
 * ─── WHY THIS MODULE EXISTS ──────────────────────────────────────────────────
 *
 * `InstancedElementRenderer._createGroup` stamps a SYNTHETIC hosting handle on
 * every shared `InstancedMesh`:
 *
 *     group.mesh.userData.id = `instanced-group-${key}`;   // :480
 *     group.mesh.userData.isInstancedGroup = true;         // :470
 *
 * That id is **load-bearing and MUST NOT be removed**: `GpuPickStrategy`'s
 * `_buildElementRegistry` keys by `userData.id`, and without it the group falls
 * out of the registry, is never drawn into the GPU id buffer, and every
 * instanced wall / column / beam becomes UNCLICKABLE. The `key` is a
 * geometry+material+level CACHE KEY — `wall_L0_36_24_0.500_0.500_0.500_<uuid>` —
 * not an element identity. No store row can ever bear that name.
 *
 * So a render batch is, by construction, mistakable for an element by anything
 * that traverses the scene reading `userData.id`. It HAS been mistaken, twice,
 * independently, in production:
 *
 *   1. `ProjectIsolationAudit` (§C13-INSTANCED-GROUP-ARM, L-8103) — the audit's
 *      element-id arm acted on the synthetic id, and since no snapshot can ever
 *      contain `instanced-group-…`, EVERY aggregate was reported as a foreign
 *      element on EVERY load, in every project, forever.
 *   2. `TopologyLayer` + `TopologySpatialIndex` (this lane) — both harvests read
 *      `child.userData?.id` off `scene.children` filtering only `isPreview` /
 *      `isHelper`, so a batch acquired a union AABB spanning the whole storey,
 *      became a NODE in the adjacency graph, and answered
 *      `getAdjacentElements('wall_A')` with itself.
 *
 * Two consumers independently making the same mistake is a SEAM defect, not two
 * bugs. Meanwhile the *rejection* test had been re-rolled by hand at least three
 * more times as a bare `id.startsWith('instanced-group-')` string literal
 * (`SelectionManager` ×2, `ContextualEditBar` ×1). Five copies of one question is
 * five chances for one of them to drift.
 *
 * ─── THE RULE ────────────────────────────────────────────────────────────────
 *
 * ⛔ Do NOT re-roll `id.startsWith('instanced-group-')` at a call site. Import
 * from here. `tools/ga-gate/check-render-aggregate-seam.ts` counts the copies and
 * is shrink-only.
 *
 * ⭐ Consumers must **opt IN** to render aggregates, never accidentally inherit
 * them. `MarqueeSelectionTool` and the pick paths opt in deliberately (they
 * resolve the batch to its per-instance element ids, which is the correct
 * handling); `ProjectIsolationAudit` opts in to read the batch's `levelId` for
 * attribution. Everything else — topology, the building graph, command arming —
 * must reject.
 *
 * ─── WHY BOTH A FLAG ARM AND A STRING ARM ────────────────────────────────────
 *
 * `isInstancedGroup` is the AUTHORITATIVE marker and is what
 * {@link isRenderAggregateObject} prefers. The `instanced-group-` prefix is kept
 * as an independent second axis for exactly one reason: a future producer that
 * mints a synthetic id and FORGETS the flag is the next recurrence of this
 * defect, and an id-only check is the only thing that can still catch it. The
 * two arms disagreeing is itself a finding — see
 * `TopologyLayer._ensureFresh`'s tripwire, which reports it by name.
 *
 * This module is deliberately dependency-free (no THREE, no DOM) so every layer
 * from L1 up can import it without dragging the renderer barrel in at module
 * load (§SCC-NODE-LOAD).
 */

/**
 * The prefix `InstancedElementRenderer._createGroup` (:480) puts on its synthetic
 * `userData.id`. THE ONLY declaration of this literal outside the minter itself.
 */
export const RENDER_AGGREGATE_ID_PREFIX = 'instanced-group-';

/** The `userData` shape this module reads. Structural — no THREE dependency. */
export interface RenderAggregateMarkers {
    id?: unknown;
    isInstancedGroup?: unknown;
}

/** Anything with a `userData` bag — i.e. any `THREE.Object3D`, structurally. */
export interface SceneObjectLike {
    userData?: RenderAggregateMarkers | null;
}

/**
 * TRUE when `id` is a synthetic render-batch handle rather than a BIM element id.
 *
 * Use the negative form {@link isRealElementId} at rejection sites — it reads as
 * the question the caller is actually asking.
 */
export function isRenderAggregateId(id: unknown): boolean {
    return typeof id === 'string' && id.startsWith(RENDER_AGGREGATE_ID_PREFIX);
}

/**
 * ⭐ **THE predicate.** TRUE when `id` is a non-empty string naming a real BIM
 * element — something a store row, a command, or a topology node may be keyed by.
 *
 * FALSE for `undefined` / `null` / `''` (no id at all) and FALSE for the
 * synthetic `instanced-group-<key>` handle, which is truthy but names no store
 * row: arming a command with it produces a `WALL_NOT_FOUND` deep inside a handler
 * that the user never sees.
 */
export function isRealElementId(id: unknown): id is string {
    return typeof id === 'string' && id.length > 0 && !id.startsWith(RENDER_AGGREGATE_ID_PREFIX);
}

/**
 * TRUE when `obj` is a render-owned aggregate (an `InstancedElementRenderer`
 * group mesh) rather than a BIM element.
 *
 * Prefers the authoritative `userData.isInstancedGroup` marker and falls back to
 * the id prefix, so an aggregate is still recognised if a producer stamps the id
 * but forgets the flag.
 */
export function isRenderAggregateObject(obj: SceneObjectLike | null | undefined): boolean {
    const ud = obj?.userData;
    if (!ud) return false;
    if (ud.isInstancedGroup === true) return true;
    return isRenderAggregateId(ud.id);
}

/**
 * The element id to treat `obj` as owning, or `undefined` when it owns none.
 *
 * This is the harvest primitive: a scene traversal that wants "the real element
 * ids in this scene" calls it per child and drops the `undefined`s. It returns
 * `undefined` for render aggregates, so the caller cannot accidentally inherit
 * one — which is exactly the accident both `TopologyLayer` and
 * `TopologySpatialIndex` had.
 */
export function realElementIdOf(obj: SceneObjectLike | null | undefined): string | undefined {
    if (isRenderAggregateObject(obj)) return undefined;
    const id = obj?.userData?.id;
    return isRealElementId(id) ? id : undefined;
}
