/**
 * WallSideFinishResolver — §FEAT-WALL-SIDE-FINISH
 *
 * "I want the possibility to change the wall layer finish material on EACH SIDE
 * of the wall … plus this should be doable via AI chat."
 *
 * ═══ THE MODEL DECISION: BESIDE THE STACK, WITH THE STACK AS FALLBACK ═══
 *
 * The founder was explicitly open — *"either within the layers or outside"*. The
 * two candidates were:
 *
 *   (a) IN-STACK — the finish IS the outermost layer on each side; changing a
 *       finish rewrites `layers[0]` (exterior) or `layers[n-1]` (interior).
 *   (b) BESIDE-STACK — a distinct per-side assignment, `WallData.sideFinishes`.
 *
 * **(b) is chosen.** Three measured reasons, in order of weight:
 *
 * 1. **(a) CANNOT REPRESENT THE ASK ON THE WALL THE FOUNDER ACTUALLY DRAWS.**
 *    `wt-monolithic` ("Monolithic (Default)", `WallSystemTypeStore.ts`) has ONE
 *    layer. `layers[0]` and `layers[n-1]` are THE SAME OBJECT. Under (a),
 *    "set the interior finish" and "set the exterior finish" write one field —
 *    so painting one face silently paints the other, and a round-trip test
 *    still passes because the value did persist. That is the entire point of
 *    the feature, lost on the default wall type. `RoomFinishResolver.ts`
 *    records the same fact from the other end: *"Walls in the generated
 *    building are plain (single-volume, not layered)"*.
 *
 * 2. **A FINISH IS NOT A CONSTRUCTION LAYER.** `wall.thickness` MUST equal the
 *    layer sum (§03-WALL-THICKNESS-CONTRACT §1, enforced by every existing
 *    caller including `AddWallLayerBatchCommand`). Under (a), the only way to
 *    give a monolithic wall two different faces is to SEED two finish layers —
 *    which changes the wall's thickness, and therefore its footprint, join
 *    trims and openings, as a side effect of choosing a colour. Re-painting a
 *    wall must not move it.
 *
 * 3. **IT COMPOSES INSTEAD OF FORKING.** Where a real `finish-interior` /
 *    `finish-exterior` layer EXISTS (the seven layered built-in types), it stays
 *    the source of truth until someone overrides it. There are not two rival
 *    truths — there is one ladder with a strict precedence, which is what keeps
 *    this from becoming the second-source-of-truth shape.
 *
 * **WHAT HAPPENS TO A SINGLE-LAYER WALL:** it gains two independent finish
 * slots and nothing else. Its layer stack, thickness, footprint and joins are
 * untouched. Rung 2 finds no finish layer, so before any authoring both sides
 * resolve to `'none'` and render exactly as they do today (rung 3, the body
 * colour) — zero regression on every wall in every existing project.
 *
 * `AddWallLayerBatchCommand` remains the right tool for the *other* ask —
 * "add a 10mm plaster layer to the inner side" — which is a real construction
 * change and SHOULD move the thickness. The two are orthogonal, and this module
 * deliberately does not duplicate it.
 *
 * ═══ THE SIDE VOCABULARY IS SEMANTIC, NEVER GEOMETRIC ═══
 *
 * `'interior'` / `'exterior'` here are the AUTHORED axis that `WallLayerFunction`
 * already declares (`'finish-interior'` / `'finish-exterior'`) and that the
 * shipped `AddWallLayerBatchInput.side` already uses. They are NOT the geometric
 * faces: `WallData.frontSide` / `backSide` are those, and they are dead —
 * measured 2026-08-18, zero writers and zero readers repo-wide, hence
 * `undefined` at runtime rather than even `'unknown'`.
 *
 * ⛔ Nothing in this module infers a side from winding order, vertex normals or
 * camera direction. A render-time heuristic is acceptable for cutaway shading
 * and catastrophic for a PERSISTED material assignment — it would paint the
 * wrong face and the user would find out from a render.
 *
 * Where a request genuinely needs the geometric mapping, this module REFUSES and
 * names what is missing — see `authoriseRoomScopedSideFinish` below.
 *
 * Contract compliance: C03 (state shape) · C16 (command authoring, via the
 * commands that consume this) · C68 (the attribute vocabulary is declared here,
 * once, and imported everywhere else).
 *
 * @module WallSideFinishResolver
 */

import type { WallFinishSide, WallSideFinish, WallLayer } from './WallTypes';

/** The rung of the ladder an answer came from — carried, never inferred. */
export type WallSideFinishSource =
    /** rung 1 — `wall.sideFinishes[side]`, authored explicitly for this face. */
    | 'override'
    /** rung 2 — the `finish-<side>` layer's own material, from the wall type. */
    | 'layer'
    /** rung 3 — no finish on this side; the wall body colour renders. */
    | 'none';

export interface ResolvedWallSideFinish {
    readonly side: WallFinishSide;
    readonly source: WallSideFinishSource;
    /** `null` exactly when `source === 'none'`. */
    readonly materialId: string | null;
    /** `null` when neither rung supplied one; callers fall back to body colour. */
    readonly materialColor: string | null;
    readonly materialName: string | null;
}

/** The wall subset this module reads — deliberately structural, not `WallData`,
 *  so plugin DTO shapes and store records both satisfy it without a cast. */
export interface SideFinishBearingWall {
    readonly layers?: ReadonlyArray<Pick<WallLayer, 'function' | 'materialId' | 'materialColor' | 'name'>>;
    readonly sideFinishes?: {
        readonly interior?: WallSideFinish;
        readonly exterior?: WallSideFinish;
    };
}

/**
 * THE LADDER. The finish that should render on `side` of `wall`.
 *
 * Total — every wall resolves, and `'none'` is a real determined answer meaning
 * "examined, nothing authored", NOT "could not look". (C71 §4.4 · C78 §1.4:
 * absence and emptiness may not be the same value. The distinction this module
 * must NOT lose lives in `authoriseRoomScopedSideFinish`, which is where the
 * genuinely-unanswerable question is asked.)
 */
export function resolveWallSideFinish(
    wall: SideFinishBearingWall,
    side: WallFinishSide,
): ResolvedWallSideFinish {
    // ── Rung 1: the authored per-side override. ──────────────────────────────
    const override = wall.sideFinishes?.[side];
    if (override?.materialId) {
        return {
            side,
            source: 'override',
            materialId: override.materialId,
            materialColor: override.materialColor ?? null,
            materialName: override.materialName ?? null,
        };
    }

    // ── Rung 2: the construction stack's own finish layer for this side. ─────
    // `finish-interior` / `finish-exterior` is the LAYER function — an authored
    // declaration by whoever wrote the wall type, not a guess. Note this is a
    // LAYER function and says nothing about the WALL's envelope function:
    // `wt-interior-partition` carries a `finish-exterior` layer and is an
    // INTERIOR wall (see `WallFunction.ts`, L-285). That distinction does not
    // affect us — we are asked which material dresses this FACE, and the layer
    // answers exactly that.
    const wanted = `finish-${side}`;
    const layer = wall.layers?.find((l) => l.function === wanted);
    if (layer && (layer.materialId || layer.materialColor)) {
        return {
            side,
            source: 'layer',
            materialId: layer.materialId ?? null,
            materialColor: layer.materialColor ?? null,
            materialName: layer.name ?? null,
        };
    }

    // ── Rung 3: nothing authored on this side. ───────────────────────────────
    return { side, source: 'none', materialId: null, materialColor: null, materialName: null };
}

/** Both sides at once, for the property panel and for schedules. */
export function resolveBothWallSideFinishes(
    wall: SideFinishBearingWall,
): { interior: ResolvedWallSideFinish; exterior: ResolvedWallSideFinish } {
    return {
        interior: resolveWallSideFinish(wall, 'interior'),
        exterior: resolveWallSideFinish(wall, 'exterior'),
    };
}

/**
 * The next `sideFinishes` for `wall` with `side` set to `finish`, leaving the
 * OTHER side byte-identical.
 *
 * The independence is the feature, so it is expressed here once rather than at
 * each of the (currently three) call sites: a spread that accidentally shared a
 * reference would produce exactly the shared-value defect model (b) was chosen
 * to avoid, and would still pass a naive round-trip assertion.
 */
export function withWallSideFinish(
    wall: SideFinishBearingWall,
    side: WallFinishSide,
    finish: WallSideFinish,
): { interior?: WallSideFinish; exterior?: WallSideFinish } {
    const prev = wall.sideFinishes;
    const next: { interior?: WallSideFinish; exterior?: WallSideFinish } = {};
    // Copy the untouched side by VALUE, never by reference into a shared object.
    const other: WallFinishSide = side === 'interior' ? 'exterior' : 'interior';
    if (prev?.[other]) next[other] = { ...prev[other]! };
    next[side] = { ...finish };
    return next;
}

// ─── RENDER ──────────────────────────────────────────────────────────────────

/**
 * The override colour the layer mesh at `layerIdx` should paint, or `null` to
 * leave today's behaviour (`layer.materialColor ?? wall.materialColor ?? body`)
 * completely untouched.
 *
 * WHICH LAYER IS WHICH SIDE. Layer arrays are authored EXTERIOR-FIRST
 * (`WallTypeEditorModal` labels the editor "Layers (exterior face first)";
 * `WallLayerFootprint2D` says "authored stack, exterior→interior"), and
 * `WallFragmentBuilder` lays them out from `cursor = -totalThickness/2` along
 * `outward = (-dir.z, 0, dir.x)`. So `layers[0]` is the exterior-most band and
 * `layers[n-1]` the interior-most. That ordering is an AUTHORED fact, not a
 * geometric inference — it is the same one `AddWallLayerBatchCommand` already
 * ships against (`side:'interior'` appends, `'exterior'` unshifts).
 *
 * ⚠ THE SINGLE-LAYER CASE IS A DISCLOSED LIMIT, NOT A SILENT GUESS.
 * `WallFragmentBuilder.ts:1254` takes the layered arm at `layers.length > 0`, so
 * a `wt-monolithic` wall renders as exactly ONE mesh whose two faces share one
 * material — this renderer has no per-face material index (no `addGroup` exists
 * anywhere in geometry-wall, and the committer arm paints `THREE.DoubleSide`).
 * Two independent finishes therefore CANNOT both show on such a wall.
 *
 * Both values are still STORED independently and both are shown in the property
 * panel and schedules; what is limited is only what the viewport can display.
 * The exterior override wins the single mesh, deterministically, and
 * `describeSingleLayerRenderLimit()` gives the UI the sentence to say so. The
 * discipline being kept is that the user is TOLD, rather than shown a wall that
 * quietly disagrees with its own data.
 */
export function resolveLayerRenderFinishColor(
    wall: SideFinishBearingWall,
    layerIdx: number,
    layerCount: number,
): string | null {
    if (layerCount <= 0) return null;
    const sf = wall.sideFinishes;
    if (!sf) return null;

    // Exterior-first: index 0 is the exterior face, index n-1 the interior face.
    // On a single-layer wall BOTH tests hit the same mesh; exterior is checked
    // first, so it wins — see the limit note above.
    if (layerIdx === 0 && sf.exterior?.materialColor) return sf.exterior.materialColor;
    if (layerIdx === layerCount - 1 && sf.interior?.materialColor) return sf.interior.materialColor;
    return null;
}

/** `true` when this wall cannot render its two side finishes distinctly. */
export function hasSingleLayerRenderLimit(
    wall: SideFinishBearingWall & { readonly layers?: ReadonlyArray<unknown> },
): boolean {
    const n = wall.layers?.length ?? 0;
    return n <= 1 && Boolean(wall.sideFinishes?.interior && wall.sideFinishes?.exterior);
}

/** The disclosure sentence for {@link hasSingleLayerRenderLimit}. */
export function describeSingleLayerRenderLimit(): string {
    return (
        'Both finishes are saved, but this wall has a single layer — its two faces are one ' +
        'surface in the 3D view, so only the exterior finish is painted there. Add a layer ' +
        '(Wall Type → Layers) to show them separately.'
    );
}

// ─── THE HONEST REFUSAL ──────────────────────────────────────────────────────

/**
 * The typed reason a side-finish request could not be honoured.
 *
 * `SIDE_CLASSIFICATION_UNKNOWN` names the missing datum precisely:
 * `WallData.frontSide`/`backSide` — which of a wall's two GEOMETRIC faces points
 * into a given room. §NO-EMPTY-MEANS-UNKNOWN: absent is not 'exterior', and it
 * is not 'interior' either.
 */
export type WallSideFinishRefusalReason = 'SIDE_CLASSIFICATION_UNKNOWN';

export type SideFinishAuthorability =
    | { readonly ok: true }
    | {
          readonly ok: false;
          readonly reason: WallSideFinishRefusalReason;
          /** Rendered verbatim into the chat / batch report. */
          readonly text: string;
      };

/**
 * MAY a ROOM-SCOPED request set the `'interior'` finish of this wall?
 *
 * ═══ WHY THIS QUESTION EXISTS AND WHERE IT BITES ═══
 *
 * Two of the three request shapes need NO geometric classification at all:
 *
 *   • *"make all inner finishes on the ground floor X"* — `'interior'` is the
 *     semantic side. Every wall has exactly one interior finish slot. Total.
 *   • The per-wall property panel — the user picks "Interior" or "Exterior" from
 *     two NAMED rows. They are choosing the semantic side themselves; there is
 *     nothing for us to infer, so there is nothing to refuse.
 *
 * The third does:
 *
 *   • *"change all walls in room X to finish Y"* — this means *the face that
 *     looks INTO room X*. For a wall bounding ONE room (or none), that face is
 *     unambiguous: its interior face. But for a PARTITION between room X and
 *     room Y, **both** faces are interior, and which one faces X is a purely
 *     geometric fact — precisely what `frontSide`/`backSide` were declared to
 *     record and never do. Guessing would repaint the neighbouring room.
 *
 * So the discriminator is the LIVE signal, not the dead one: `boundingRoomCount`
 * from `classifyFacades` (`@pryzm/spatial-index/FacadeOrientationMath`, which
 * already computes `isExterior = count <= 1` and is already consumed by
 * `ZeroTokenChatBridge`). This function is pure and takes the count as an
 * argument so it stays in geometry-wall and testable without a room store.
 *
 * @param boundingRoomCount how many rooms list this wall in `boundingWallIds`;
 *        pass `null` when the bounding-wall relationship itself was UNDETERMINED
 *        (`boundingWallDetermination`), which is also a refusal — a partition
 *        we could not recognise is not a partition we may guess about.
 */
export function authoriseRoomScopedSideFinish(
    wallId: string,
    boundingRoomCount: number | null,
): SideFinishAuthorability {
    if (boundingRoomCount === null) {
        return {
            ok: false,
            reason: 'SIDE_CLASSIFICATION_UNKNOWN',
            text:
                `wall ${wallId}: which rooms this wall bounds was not recorded, so I cannot tell ` +
                `which of its two faces looks into the room you named. Set that face from the ` +
                `wall's property panel (Interior / Exterior finish), where you choose it explicitly.`,
        };
    }
    if (boundingRoomCount >= 2) {
        return {
            ok: false,
            reason: 'SIDE_CLASSIFICATION_UNKNOWN',
            text:
                `wall ${wallId}: this wall separates ${boundingRoomCount} rooms, so BOTH of its faces ` +
                `are interior ones. Which face looks into the room you named is recorded in ` +
                `frontSide/backSide, and nothing in this build ever sets them — so I will not guess ` +
                `and risk re-finishing the room next door. Set that face from the wall's property ` +
                `panel (Interior / Exterior finish), where you choose it explicitly.`,
        };
    }
    return { ok: true };
}
