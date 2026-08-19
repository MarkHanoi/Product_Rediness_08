/**
 * materialResolution — THE ONE implementation of C100 §2.1's resolution ladder.
 *
 * C100 §2.1, verbatim and normative:
 *
 *   > An element REFERENCES a material by `materialId` (ADR-0217). A resolved
 *   > colour is a CACHE, never an authority. A stored hex is legal in exactly ONE
 *   > role — an explicit, user-authored OVERRIDE — and it MUST be distinguishable
 *   > from a colour that was resolved from the master.
 *
 *   > 1. an explicit user override hex stored on the element/layer → use it;
 *   > 2. else `materialId` resolved against T2 then T1 → use that record's colour;
 *   > 3. else a NAMED UNRESOLVED state — never a silent default colour.
 *
 * ⛔ WHY THIS FILE EXISTS RATHER THAN A PER-FAMILY COPY. Before it, step 2 had no
 * implementation anywhere: `userMaterialStore.get()` reads **T2 only** and
 * `materialHexById()` reads **T1 only** (through the THREE projection), so every
 * consumer that wanted both had to chain them itself. C100 §1.1 records that four
 * of the six rival material vocabularies in this repo exist because the master was
 * unreachable and people copied it. A second private chain is how the fifth gets
 * written. **One ladder, one file, every family calls it.**
 *
 * ⚠ STEP 3 IS THE PART MOST LIKELY TO BE SKIPPED, AND IT IS THE POINT. Returning a
 * fallback hex on a miss makes "this material was deleted" and "this element has no
 * material" and "the id was mistyped" all render as the same grey — §CONTEXT-DATA-HONESTY
 * inside the material system, and exactly the beige-default defect C100 §1.2 traces.
 * The result is therefore a DISCRIMINATED UNION: callers must handle `unresolved`,
 * and the compiler makes them.
 *
 * ⚠ T1 IS READ FROM L0 (`@pryzm/schemas/materials`), NOT from the THREE projection
 * in `materialLibrary.ts`. The projection builds `THREE.Color` instances at module
 * load, which is precisely what made the master unreachable to THREE-free consumers
 * (C100 §1.1 / ADR-0333). This module stays THREE-free so a geometry package or a
 * headless test can use it.
 *
 * ⚠ NO BARREL IMPORTS AT MODULE LOAD (§SCC): `UserMaterialStore` is imported by
 * PATH, not through `./stores`, so this file cannot participate in a circular
 * barrel that resolves to `undefined` at startup.
 *
 * CONTRACTS: C100 §1.1 (two tiers, one shape), §2.1 (the ladder), §5 (no silent
 * fallback) · C84 EI-8 (one vocabulary) · C65 §2.2 (T2 shadows T1).
 */

import { materialHex } from '@pryzm/schemas/materials';
import { userMaterialStore } from './stores/UserMaterialStore';

/** Where a resolved colour came from. `origin` is what makes an override visible. */
export type MaterialColourResolution =
    | {
          readonly state: 'override';
          readonly hex: string;
          /** The id the override is shadowing, when the element also carries one. */
          readonly shadowedMaterialId?: string;
      }
    | { readonly state: 'resolved'; readonly hex: string; readonly materialId: string; readonly tier: 'user' | 'builtin' }
    | {
          readonly state: 'unresolved';
          /** The id that could not be found, when there was one at all. */
          readonly materialId?: string;
          /** Human-readable, for a panel or a console line. Never a colour. */
          readonly reason: string;
      };

/**
 * Resolve an element's material colour by C100 §2.1's ladder.
 *
 * @param materialId  the material this element REFERENCES, if any.
 * @param overrideHex an explicit, user-authored colour override, if any.
 *
 * ⛔ Callers MUST NOT collapse `unresolved` to a default hex silently. Either show
 * the named state, or pick a fallback AND say in the same breath that it is one.
 */
export function resolveMaterialColour(
    materialId?: string,
    overrideHex?: string,
): MaterialColourResolution {
    // 1 — an explicit override always wins, and stays labelled as an override so
    //     the UI can show it as one (C100 §6.1: "an invisible override is
    //     indistinguishable from a stale copy").
    if (overrideHex) {
        return materialId
            ? { state: 'override', hex: overrideHex, shadowedMaterialId: materialId }
            : { state: 'override', hex: overrideHex };
    }

    if (!materialId) {
        return {
            state: 'unresolved',
            reason: 'no materialId and no colour override — this element names no material',
        };
    }

    // 2 — T2 (project, user-editable) BEFORE T1, per C65 §2.2's project-local
    //     override rule: a user material may deliberately shadow a built-in id.
    try {
        const user = userMaterialStore.get(materialId);
        if (user?.color) {
            return { state: 'resolved', hex: user.color, materialId, tier: 'user' };
        }
    } catch {
        // Store unavailable (headless / early boot). Fall through to T1 rather than
        // failing the whole resolution — a missing STORE is not a missing MATERIAL.
    }

    const builtin = materialHex(materialId);
    if (builtin) {
        return { state: 'resolved', hex: builtin, materialId, tier: 'builtin' };
    }

    // 3 — NAMED, never a silent colour.
    return {
        state: 'unresolved',
        materialId,
        reason:
            `materialId '${materialId}' is in neither the project materials (T2) nor ` +
            'MATERIAL_CATALOG (T1). It may have been deleted, or the id may be stale.',
    };
}
