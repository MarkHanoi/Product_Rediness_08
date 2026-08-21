/**
 * WallPaintSignature — §WALL-FINISH-RENDERS (L-1670).
 *
 * ═══ WHY THIS EXISTS: THE FOUNDER'S EDIT WAS SWALLOWED BY A GATE, NOT A BUILDER ═══
 *
 * Founder, on prod: *"Make all interior finish wall white paint"* → chat replied
 * *"Set the interior finish Paint · Matte White on 59 of 59 walls."* — and NOTHING
 * in the 3-D scene changed. The write was real (`WallData.sideFinishes`, L-995),
 * the builder honours it (`resolveWholeBodyFinishColor` /
 * `resolveLayerRenderFinishColor`, L-960) — but the rebuild NEVER RAN, because the
 * flush pipeline's invalidation gates hash only GEOMETRY:
 *
 *   1. `WallRebuildCoordinator._levelWallSig` — the §FIX-WALLFLUSH-NOPROGRESS-GUARD
 *      (L-97) signature. A `sideFinishes`-only edit left it byte-identical, so the
 *      ENTIRE flush returned at the top: no classify, no resolveLevel, no buildWall.
 *      This is the gate that ate the founder's 59 walls.
 *   2. `WallRebuildCoordinator._buildKey` — the §PERF-WALL-MOVE-INCREMENTAL-REBUILD
 *      (L-234) per-wall memo on the whole-level path. Documented as "content key
 *      over EVERY input `builder.buildWall` consumes" — but buildWall consumes the
 *      wall's PAINT (finishes, colours) since L-960, and the key folded none of it.
 *      Had gate 1 passed, this one would have skipped all 59 walls as "clean".
 *
 * That is the recorded L-813 shape — invalidation gates in series, where fixing a
 * downstream one is invisible until the upstream one also learns the new field —
 * so BOTH gates fold this ONE signature in the same commit, and any future gate
 * must fold it too rather than re-listing paint fields by hand (C84 EI-8: one
 * producer per question; the question here is "did this wall's paint change?").
 *
 * ═══ WHAT IS FOLDED — every WALL-RECORD input of the builder's paint path ═══
 *
 * The builder's colour expressions (both arms, measured at L-960):
 *
 *   instanced / whole-body:  resolveWholeBodyFinishColor(wall) ?? intentColour
 *                            ?? layers[0].materialColor ?? wall.materialColor ?? default
 *   layered band:            resolveLayerRenderFinishColor(wall, i, n)
 *                            ?? layer.materialColor ?? wall.materialColor ?? default
 *   plain fragment:          createWallMaterial(wall) — wall.materialId + materialColor
 *
 * So the signature folds: `wall.materialId`, `wall.materialColor`, each layer's
 * `materialId` + `materialColor`, and both `sideFinishes` slots (id + colour).
 * `materialName` is display-only and deliberately NOT folded (renaming a material
 * must not rebuild a level). The view-intent colour (`_resolveIntent3DColour`) is
 * VIEW state, not wall state — view switches force their own rebuilds and a store
 * signature could not see it anyway; folding half a truth would only imply the
 * other half was covered.
 *
 * Determinism: '_' marks an absent value (never collapses with an empty string),
 * layers fold in authored order (exterior-first — the order IS the meaning, see
 * `resolveLayerRenderFinishColor`), and the output is a plain ASCII segment safe
 * to embed in the existing '|'-joined keys.
 *
 * @module WallPaintSignature
 */

import type { WallSideFinish, WallLayer } from './WallTypes';

/** The wall subset this composer reads — structural, so store records, DTO
 *  shapes and test literals all satisfy it without a cast (same doctrine as
 *  `SideFinishBearingWall` in `WallSideFinishResolver`). */
export interface PaintBearingWall {
    readonly materialId?: string | null;
    readonly materialColor?: string | null;
    readonly layers?: ReadonlyArray<Pick<WallLayer, 'materialId' | 'materialColor'>>;
    readonly sideFinishes?: {
        readonly interior?: WallSideFinish;
        readonly exterior?: WallSideFinish;
    };
}

const s = (v: string | null | undefined): string => (v == null || v === '' ? '_' : v);

const finish = (f: WallSideFinish | undefined): string =>
    f ? `${s(f.materialId)}/${s(f.materialColor)}` : '_';

/**
 * The paint signature of `wall` — byte-stable iff none of the wall-record inputs
 * of the builder's paint path changed.
 *
 * Consumed by `WallRebuildCoordinator._levelWallSig` (the no-progress flush gate)
 * and `WallRebuildCoordinator._buildKey` (the per-wall rebuild memo). Fold it
 * into any future invalidation gate instead of enumerating paint fields there.
 */
export function composeWallPaintSignature(wall: PaintBearingWall): string {
    const layers = wall.layers && wall.layers.length > 0
        ? wall.layers.map(l => `${s(l.materialId)}/${s(l.materialColor)}`).join(',')
        : '_';
    const sf = wall.sideFinishes;
    return `m${s(wall.materialId)}/${s(wall.materialColor)}|ly${layers}|fi${finish(sf?.interior)}|fe${finish(sf?.exterior)}`;
}
