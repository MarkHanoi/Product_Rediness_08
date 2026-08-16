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
    baseOffset?: number;
    boundingWallIds?: readonly string[];
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
export function roofRecordFromCreatedEvent(ev: RoofCreatedEventLike): MirroredRoofRecord | null {
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
        // §FT6 / BUG-6 (TASK-06): use the caller-supplied baseOffset. The
        // hardcoded 2.7 placeholder ignored the command's own value, putting
        // every roof at the wrong elevation regardless of wall height.
        baseOffset: ev.baseOffset ?? 2.7,
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
