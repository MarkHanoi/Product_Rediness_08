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
    /** §FIX-ROOF-CEB-MATERIAL (B2-ROOF-01) — the user's chosen finish. Same two
     *  spellings on both sides: L0 `Roof.ts:77-78`, legacy `RoofTypes.ts:107-108`. */
    materialId?: string;
    materialColor?: string;
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

/**
 * §FIX-ROOF-UPDATE-MIRROR — L0 `Roof.shape` → legacy `RoofData.roofType`.
 *
 * ⭐ EXPORTED SO THE UPDATE MIRROR CANNOT MINT A SECOND COPY. This translation
 * already existed inline in `roofRecordFromCreatedEvent` below, where L-699 paid
 * for it: `mono` and `shed` are THE SAME ROOF spelled differently by the two
 * vocabularies, so a `mono` roof fell through `RoofGeometryBuilder.generate`'s
 * switch to `default:` and rendered FLAT. `roof.setShape` needs the identical
 * rule, and a hand-copied `mono → shed` in a second file is how that defect comes
 * back on the update path only.
 *
 * The two vocabularies, measured:
 *   L0 `RoofShape` (Roof.ts:7)      flat gable hip mono mansard              — 5
 *   legacy `RoofType` (RoofTypes.ts:3) flat shed gable hip dutch gambrel
 *                                      mansard barrel by_region              — 9
 * Every L0 member has an exact legacy twin (`mono` ↦ `shed`), so this is TOTAL
 * and lossless in the direction it runs. It is NOT invertible — four legacy
 * members have no L0 spelling — which is why there is no reverse function here.
 */
export function legacyRoofTypeFromShape(shape: unknown): string {
    return shape === 'mono' ? 'shed' : (typeof shape === 'string' && shape.length > 0 ? shape : 'flat');
}

/**
 * §FIX-ROOF-UPDATE-MIRROR — L0 `Roof.pitch` (RADIANS) → legacy `RoofData.slope`
 * (RISE/RUN). `slope = tan(pitch)`.
 *
 * ⚠ THIS IS THE FUNCTION THE STANDING "roof.setPitch CANNOT BE MIRRORED" NOTE
 * SAID DID NOT EXIST. That note (CommandEventBridge.ts, elementUpdatedMirror.ts,
 * and `mirror-debt.json`, all three) rested on one command:
 *
 *     grep -n "pitch" packages/geometry-roof/src/RoofTypes.ts   →  0 hits
 *
 * The grep is correct and the conclusion drawn from it is not. It searched for a
 * NAME; the legacy record carries the CONCEPT under a different name and in
 * different units — `RoofData.slope` (RoofTypes.ts:96) — and the conversion was
 * already written, already shipped, and already load-bearing eight lines below in
 * this very file, where L-699 added it for the CREATE path. Reading it back off
 * the consumer is unambiguous: `roofFaces.ts:521` computes
 * `cosTheta = 1 / sqrt(1 + slope*slope)`, which is the cosine of the angle whose
 * TANGENT is `slope`. A name-blind grep is exactly the search that proves an
 * absence that is not there.
 *
 * `pitch === 0` (a flat roof) yields `undefined`, not `0`, matching the create
 * path verbatim: `RoofDataSchema.ts:149` deletes a non-positive `slope`, and
 * `RoofGeometryBuilder.ts:1127` branches on `data.slope && data.slope > 0`, so
 * "flat" is spelled by the field's ABSENCE in this model, not by a zero.
 */
export function legacyRoofSlopeFromPitch(pitch: unknown): number | undefined {
    return typeof pitch === 'number' && pitch > 0 ? Math.tan(pitch) : undefined;
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
    /** §FIX-ROOF-CEB-MATERIAL (B2-ROOF-01) — `RoofData.materialId` /
     *  `.materialColor` (RoofTypes.ts:107-108). Optional on BOTH sides, so an
     *  unstated finish stays unstated and `RoofStore`/`RoofFragmentBuilder` keep
     *  their own defaults — the absence is preserved, never overwritten with one. */
    materialId?: string;
    materialColor?: string;
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
        roofType: legacyRoofTypeFromShape(ev.shape),
        // §FIX-ROOF-PLAN-SHAPE-HARDCODED (L-699) — pitch (RADIANS, L0 schema) →
        // slope (rise/run, geometry package). Previously not forwarded AT ALL, so
        // every plan-created roof was slope-less.
        slope: legacyRoofSlopeFromPitch(ev.pitch),
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
        // §FIX-ROOF-CEB-MATERIAL (B2-ROOF-01 · C100 §2.1) — THE FOURTH FIELD THIS
        // ONE MAPPING HAD TO LEARN, after `roofType`/`slope` (L-699) and
        // `boundingWallIds` (L-924). The pattern is identical every time: a value
        // the user chose is computed upstream, dispatched correctly, and then
        // dropped by a hop that relays a NAMED SUBSET of what it was handed. Here
        // the consequence is a roof that renders — so `renders_3d` reads YES and
        // the seven-fact chain is satisfied — wearing the DEFAULT finish instead of
        // the one the user picked. Nothing in that chain asks the fidelity question.
        //
        // Spread-conditional for the same reason as `boundingWallIds` above:
        // `materialId` and `materialColor` are `.optional()` on both records, and
        // writing an explicit `undefined` into a record `RoofStore.add()` clones
        // would assert "the user chose no material", which is a different fact from
        // "no material was stated". C100 §2.1: `materialId` is the master id,
        // `materialColor` the resolved hex cache, on both sides — so this is a
        // straight copy with no translation, unlike `shape`→`roofType`.
        ...(ev.materialId !== undefined ? { materialId: ev.materialId } : {}),
        ...(ev.materialColor !== undefined ? { materialColor: ev.materialColor } : {}),
    };
}
