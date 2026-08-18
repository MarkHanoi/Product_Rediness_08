/**
 * §P3.2-RF — the record the `roof.created` bus→legacy-store mirror writes.
 *
 * ─── WHY THIS IS A FUNCTION AND NOT A CLOSURE INSIDE initTools.ts ────────────
 * It was a closure, and that made the PLAN creation path unmeasurable. `initTools`
 * is a ~2600-line function that needs a THREE world, a components registry, a
 * command manager and twenty stores before its first line runs, so nothing could
 * execute this mapping in a test. §ROOF-FOLLOWS-WALL's plan arm was therefore
 * reduced to TRANSCRIBING the mapping into the test and asserting against the
 * copy — which proves the transcription, not the product, and is the
 * §committed-is-not-reachable defect wearing a green tick.
 *
 * Extracted verbatim so `RoofFollowsWallReachesStore.test.ts` runs THE SAME CODE
 * the editor runs. The behaviour is unchanged; only its reachability is.
 *
 * The mirror exists because `RoofFragmentBuilder` still reads the legacy
 * `@pryzm/geometry-roof` `RoofStore`, while the plan surface dispatches through
 * the L0 bus (whose `roof.create` verb the roof PLUGIN handler wins, writing to
 * a detached DTO store no renderer reads). When the builder is migrated to read
 * the Immer store directly, this and its caller can both go.
 */

/** The `roof.created` fields this mapping consumes. Structurally a subset of
 *  `RuntimeEvents['roof.created']`, declared locally so this module stays free of
 *  a runtime-composer import (and of the pdfjs-bearing barrel behind it). */
export interface RoofCreatedEventLike {
    id?: string;
    levelId?: string;
    boundary?: ReadonlyArray<{ x: number; y: number; z: number }>;
    shape?: string;
    pitch?: number;
    overhang?: number;
    thickness?: number;
    boundingWallIds?: readonly string[];
}

/**
 * §FIX-ROOF-BRIDGE-SEATING — the floor `CreateRoofCommand.ts:144` applies to its
 * own `autoBaseOffset` computation (`Math.max(...heights, 2.7)`), restated here
 * as a name so the two paths cannot drift by a literal edited in one of them.
 */
export const ROOF_AUTO_SEATING_FLOOR_M = 2.7;

/**
 * §FIX-ROOF-BRIDGE-SEATING (C84 EI-2b · C79 §7.4 · C11 §3) — where a mirrored
 * roof sits above its level datum.
 *
 * ⚠ THIS FUNCTION EXISTS BECAUSE THE FIELD IT REPLACES WAS A DEAD READ.
 * The mapping below used to seat every roof at `ev.baseOffset ?? 2.7`, with a
 * comment stating it was *"using the caller-supplied baseOffset"* instead of a
 * *"hardcoded 2.7 placeholder [that] ignored the command's own value, putting
 * every roof at the wrong elevation regardless of wall height."* `ev.baseOffset`
 * is ALWAYS `undefined` — `packages/schemas/src/elements/Roof.ts` declares no
 * such field (Zod `strip` deletes it in transit while `parse()` succeeds), and
 * `CommandEventBridge`'s `roof.create` case, the ONE emitter of `roof.created`
 * in the tree, does not list it in its named-subset emit. So the `??`'s left arm
 * was unreachable, the literal was a CONSTANT, and the fix had been applied at a
 * hop that never receives the field: exactly EI-2 mechanism (b), invisible to
 * both `tsc` and review.
 *
 * The consequence was per-path divergence. `RoofFragmentBuilder.ts:291` seats
 * the mesh at `level.elevation + baseOffset` and NOTHING reads `autoBaseOffset`
 * at render time, so a roof drawn in PLAN over 3.5 m walls floated 0.8 m clear
 * of the walls it caps, while the SAME roof drawn in 3-D — through
 * `CreateRoofCommand`, which resolves `autoBaseOffset` from the tallest wall on
 * the level — landed on them. C79 §7.4 rates that as worse than uniform absence.
 *
 * The rule is `CreateRoofCommand.ts:140-150`'s, applied verbatim, including its
 * "no walls → keep the existing value" arm, so this is strictly narrowing: with
 * nothing to measure the seating is unchanged from what the literal produced.
 *
 * @param wallHeightsOnLevel heights of every wall on the level the roof was
 *        drawn on. `undefined` (no store reachable) and `[]` (a level with no
 *        walls) deliberately behave the same: neither is a measurement.
 */
export function resolveMirroredRoofBaseOffset(
    wallHeightsOnLevel: readonly number[] | undefined,
): number {
    const finite = (wallHeightsOnLevel ?? []).filter((h) => Number.isFinite(h));
    if (finite.length === 0) return ROOF_AUTO_SEATING_FLOOR_M;
    return Math.max(...finite, ROOF_AUTO_SEATING_FLOOR_M);
}

export interface MirroredRoofRecord {
    id: string;
    type: 'roof';
    levelId: string;
    footprint: { polygon: [number, number][]; centroid: [number, number] };
    roofType: string;
    slope?: number;
    overhang: number;
    baseOffset: number;
    thickness: number;
    autoBaseOffset: boolean;
    boundingWallIds?: string[];
}

/**
 * Build the legacy `RoofData` a `roof.created` event describes, or `null` when
 * the event carries no usable boundary (the caller's guard clause).
 */
export function roofRecordFromCreatedEvent(
    ev: RoofCreatedEventLike,
    wallHeightsOnLevel?: readonly number[],
): MirroredRoofRecord | null {
    if (!ev.id || !ev.boundary || ev.boundary.length < 3) return null;

    // RoofFragmentBuilder expects:
    //   root.position = [cx, 0, cz]  (world centroid)
    //   mesh vertices = centroid-relative [lx, lz] offsets
    // Recompute from world-space Vec3[] boundary.
    const n = ev.boundary.length;
    const cx = ev.boundary.reduce((s, v) => s + v.x, 0) / n;
    const cz = ev.boundary.reduce((s, v) => s + v.z, 0) / n;
    const localPolygon: [number, number][] = ev.boundary.map(
        (v) => [v.x - cx, v.z - cz] as [number, number],
    );

    return {
        id:       ev.id,
        type:     'roof',
        levelId:  ev.levelId ?? '',
        footprint: { polygon: localPolygon, centroid: [cx, cz] },
        // §FIX-ROOF-PLAN-SHAPE-HARDCODED (L-699) — translate the L0 schema's
        // `shape` into the geometry package's `roofType`. ⚠ `mono` and `shed` are
        // the SAME roof and were spelled differently in the two vocabularies, so
        // `mono` fell through `RoofGeometryBuilder.generate`'s switch to
        // `default:` and silently rendered FLAT. One line, one whole roof form.
        roofType: ev.shape === 'mono' ? 'shed' : (ev.shape ?? 'flat'),
        // §FIX-ROOF-PLAN-SHAPE-HARDCODED (L-699) — pitch (RADIANS, L0 schema) →
        // slope (rise/run, geometry package). Previously not forwarded AT ALL, so
        // every plan-created roof was slope-less.
        slope: typeof ev.pitch === 'number' && ev.pitch > 0 ? Math.tan(ev.pitch) : undefined,
        overhang: ev.overhang ?? 0.3,
        // §FIX-ROOF-BRIDGE-SEATING — was `ev.baseOffset ?? 2.7`, whose left arm
        // no emitter can ever populate (see `resolveMirroredRoofBaseOffset`).
        // The seating is now MEASURED from the level's walls by the same rule
        // `CreateRoofCommand` uses, which is what `autoBaseOffset: true` below
        // has always claimed and never delivered on this path.
        baseOffset: resolveMirroredRoofBaseOffset(wallHeightsOnLevel),
        thickness:  ev.thickness ?? 0.2,
        autoBaseOffset: true,
        // §ROOF-FOLLOWS-WALL (L-924) — the LAST of three hops that had to learn
        // this field (plan tool → CommandEventBridge → here). Each re-emits a
        // NAMED SUBSET of what it is handed, so the attribution was dropped even
        // though the plan tracer had already computed and logged it. Without it a
        // region roof drawn in PLAN stores no dependency and can never follow its
        // walls, while one drawn in 3D does — the per-path divergence C79 §7.4
        // rates as worse than uniform absence.
        //
        // Spread-conditional, NOT `?? []`: an absent value must stay absent
        // ("never region-traced"), because `[]` asserts "traced, and bounded by
        // no wall" — a different fact, and the one `RoofData.boundingWallIds` is
        // `.optional()` to keep separable.
        ...(ev.boundingWallIds ? { boundingWallIds: [...ev.boundingWallIds] } : {}),
    };
}
