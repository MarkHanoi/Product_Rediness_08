/**
 * furnitureMaterialColour — the colour a piece of furniture is painted, resolved
 * through C100 §2.1's ONE ladder.
 *
 * ─── ⛔ THE DEFECT THIS CLOSES (L-1460, measured 2026-08-20) ──────────────────
 *
 * The founder asked why *"all furniture … don't have materials associated"*. The
 * property inspector was telling him the truth. `FurniturePropertySection.ts:151`
 * renders a read-only row labelled **"Material"** whose value is
 * `furniture.material` — a **FOUR-VALUE** closed union, `wood | metal | fabric |
 * glass`, against a master catalogue of **205 rows**. Oak, walnut, ash, birch and
 * every other timber in the master are all, and only, `wood`.
 *
 * ⭐ **AND THE C100 CENSUS MEASURED A DIFFERENT PATH.** C100 §9.8 records slice S16
 * routing `geometry-kernel/producers/furniture.ts` through the master resolver, and
 * the gate's ARM C agrees. Both are correct and neither reaches the founder's
 * screen: production furniture is not committed through that producer. `initTools.ts`
 * §FT-FURNITURE states it outright — the PRYZM-3 `CreateFurniturePayload`
 * *"does NOT match the legacy `FurnitureData` model … and no bus→legacy bridge
 * existed"*, so the plan tool, the carousel drag-drop, the kitchen and wardrobe
 * tools, copy/paste and the whole D-FLE `furniture.batch.create` furnish run are all
 * mirrored into the legacy `FurnitureStore` and rendered by
 * `FurnitureFragmentBuilder` → `MaterialService.getMaterial(color: number)`.
 *
 * ⛔ On that path `materialId` existed at **no** layer: not on the `furniture.create`
 * payload, not on the `furniture.created` event, not on `FurnitureData`, not in the
 * builder, not in `serializeFurniture`. So furniture's material was not *lost* — it
 * had never been *reachable*. C100 §9.7 says ARM C *"proves the import, not the
 * frame"*; this is that sentence collecting.
 *
 * ─── The ladder, and why each rung is where it is ───────────────────────────────
 *
 *   1. `materialId` resolved through {@link resolveMaterialColour} (T2 user
 *      materials, then T1 master) → that material's colour. **This is the rung that
 *      did not exist**, and the only one whose behaviour is new.
 *   2. `materialId` present but naming nothing → a NAMED unresolved state, painted
 *      MAGENTA (C100 §5). Never a plausible timber: *"your material was lost"* must
 *      not look like *"this sofa is oak"*.
 *   3. else `color` — the existing hex. On this path it is written by the D-FLE
 *      furnish engine as a per-style default for every item it places (A.21.D4), and
 *      by the property inspector's Color field. Unchanged.
 *   4. else `undefined` — the caller keeps whatever default it had before.
 *
 * ⚠ **WHY `materialId` OUTRANKS `color` HERE, stated rather than assumed.** C100
 * §2.1's ladder puts an explicit user OVERRIDE above the id. On this path `color` is
 * not an override: the furnish engine stamps it onto **every** auto-placed item as a
 * style default, so honouring it first would mean a chosen material could never
 * render on auto-furnished furniture — which is precisely the defect. The id
 * therefore wins **when it is present**, and `color` remains the authority for every
 * record that names no material. That is a declared, reasoned divergence under
 * C84 EI-10, not an oversight; its retirement is the moment `color` can be told
 * apart from a generator default (C100 §2.1's "MUST be distinguishable" clause,
 * unmet on this record shape).
 *
 * ⭐ **NOTHING ALREADY ON SCREEN REPAINTS.** Every furniture record in every saved
 * project today carries no `materialId` — the field did not exist — so rung 1 and
 * rung 2 are unreachable for existing data and every item resolves at rung 3 or 4,
 * byte-identically to before. C100 §9.6.b names repainting the product as the thing
 * that would rightly get this convergence reverted.
 *
 * ⚠ NO SECOND LADDER IS WRITTEN HERE. Rung 1 delegates to `resolveMaterialColour` —
 * C100 §9.6.a's single authority — exactly as `doorFinishColour` and
 * `HandrailFragmentBuilder.resolveColour` do. C100 §1.1 traces four of the eight
 * rival material vocabularies in this repository to someone chaining
 * `userMaterialStore.get()` and `materialHex()` privately. This file must never
 * become the ninth.
 *
 * CONTRACTS: C100 §2.1 (the ladder), §2.2 (a master edit reaches placed elements),
 * §5 (no silent fallback), §9.6.a (one resolution authority), §9.6.b (converge the
 * value, not the format) · C84 EI-8 (one vocabulary), EI-10 (declared divergence)
 * · C11 §5.4 (a domain rule resolves upstream of the builder).
 */

import { resolveMaterialColour } from '@pryzm/core-app-model/material-resolution';
import type { FurnitureData } from './FurnitureTypes';

/**
 * Painted for a `materialId` that names nothing in either tier.
 *
 * Magenta, on purpose (C100 §5) — it must not be mistakable for a building
 * material. Byte-identical to the constant the door, window, furniture, stair and
 * handrail bridges use, because a failure that looks different in each family is a
 * failure nobody learns to recognise.
 */
export const UNRESOLVED_FURNITURE_MATERIAL_COLOR = '#ff00ff';

/** The subset of a furniture record this resolution reads. */
export interface FurnitureColourInput {
    readonly materialId?: string | undefined;
    readonly color?: string | undefined;
}

/**
 * The effective colour for a furniture record, or `undefined` when it names
 * neither a material nor a colour and the caller should keep its own default.
 *
 * ⛔ Never returns a silent fallback hex for an id that failed to resolve — that
 * case returns {@link UNRESOLVED_FURNITURE_MATERIAL_COLOR}, and the two are
 * different answers on purpose (C100 §5).
 */
export function resolveFurnitureColour(data: FurnitureColourInput): string | undefined {
    const id = data.materialId;
    if (id && id.length > 0) {
        const res = resolveMaterialColour(id, undefined);
        if (res.state === 'resolved') return res.hex.toLowerCase();
        // C100 §5 — a NAMED failure outranks every fallback, including `color`.
        // Falling through to `color` here would make a deleted or mistyped material
        // indistinguishable from a deliberate style choice, which is the exact
        // shape of the djb2-palette defect C100 §9.4 records for this family.
        return UNRESOLVED_FURNITURE_MATERIAL_COLOR;
    }
    return data.color;
}

/**
 * True when this record names a material that could not be resolved — so a panel
 * or a diagnostic can say WHICH id failed instead of showing magenta and nothing.
 */
export function isUnresolvedFurnitureMaterial(data: FurnitureColourInput): boolean {
    const id = data.materialId;
    if (!id || id.length === 0) return false;
    return resolveMaterialColour(id, undefined).state !== 'resolved';
}

/**
 * A record whose `color` is the resolved effective colour, for handing to the 62
 * builders that read `data.color`.
 *
 * ⚠ Returns the SAME object when nothing changes, so the frozen-record contract and
 * every identity check downstream are untouched for the existing-data case.
 */
export function withResolvedFurnitureColour(data: FurnitureData): FurnitureData {
    const colour = resolveFurnitureColour(data);
    if (colour === undefined || colour === data.color) return data;
    return { ...data, color: colour };
}
