// §MATERIAL-DECLARED-SURFACES (L-9702) — C100 §10.7 S25, open since 2026-08-21.
//
// ═════════════════════════════════════════════════════════════════════════════
// ⭐ TWO FACTS, AND THEY MUST NOT BECOME ONE VALUE
// ═════════════════════════════════════════════════════════════════════════════
//
// The Material Schedule already answers a question about materials and element
// families: `materialUsageRegistry.buildMaterialUsageIndex()` derives, per family,
// which materials are ACTUALLY REFERENCED by the type catalogue (lane MAT50,
// C100 §10.13). That is a MEASUREMENT of what the project uses.
//
// This file answers a DIFFERENT question: which surfaces is this material
// SUITABLE FOR? That is a property of the PRODUCT. A roof shingle is suitable for
// a roof whether or not any roof in any project currently references it, and a
// polished marble is not suitable for a roof however many people try.
//
// ⛔ THE TWO MUST NOT BE COLLAPSED INTO ONE COLUMN. "suitable for a roof" and
// "used on a roof" are the §CONTEXT-DATA-HONESTY pair one more time: a material
// that is suitable and unused reads identically to one that is unsuitable, and
// the schedule loses the ability to say "you have a roofing catalogue and nothing
// on your roofs". C100 §10.13.b named this shape ("a dash that means two things
// is the same defect as a missing gate") after MAT50 had to undo it.
//
// ═════════════════════════════════════════════════════════════════════════════
// ⚠ ABSENT MEANS **NOT DECLARED**. IT DOES NOT MEAN "UNIVERSAL".
// ═════════════════════════════════════════════════════════════════════════════
//
// The reference product spells this facet `surfaces?: MaterialSurface[]` with the
// docstring "Absent = universal (e.g. flat colors)". ⛔ WE DELIBERATELY DO NOT
// ADOPT THAT SEMANTIC, and the divergence is the most load-bearing decision in
// this file. Under "absent = universal":
//
//   · a material nobody has classified yet, and
//   · a material genuinely suitable everywhere
//
// are THE SAME VALUE — so the day someone adds a filter, every unclassified row
// silently claims suitability for every slot, and a picker confidently offers
// polished marble for a roof. That is C100 §5's "a failure and a beige material
// are the same value", relocated into an applicability facet.
//
// So: `undefined` is NOT DECLARED and a consumer MUST render it as its own third
// state, exactly as MAT50's `∅` does for "family cannot yet name a material"
// (C100 §10.13.c: ABSENT vs UNREACHABLE vs UNSEEDED). `isDeclaredForSurface()`
// returns `null` rather than a boolean for precisely this reason.
//
// ⚠ STILL PURE (P5 / C03 §1.2): string literals and total functions.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The surface slots a finish can be specified against.
 *
 * ⭐ SIX VALUES, AND THE VOCABULARY IS THE ONE THIS REPO ALREADY DECLARED — see
 * `tools/texture-pipeline/sources/materials.json`, whose entries have carried
 * `"surfaces": ["floor"]` since 2026-08-21 for exactly this facet. The pipeline
 * has been authoring this field into the provenance manifest for two days with
 * nowhere at L0 to put it; this is that missing home, not a new vocabulary
 * (C100 §1.1's "MUST NOT mint a second enumeration").
 *
 * ⛔ THIS IS NOT THE ELEMENT-FAMILY AXIS. `wall`/`roof`/`floor` here name the kind
 * of SURFACE a specifier writes a finish against, which is coarser than the
 * element families (`wall`, `slab`, `roof`, `ceiling`, `stair`, `handrail`,
 * `curtainwall`, …). A finish suitable for `wall` is suitable for a chimney and a
 * dormer cheek too; enumerating every family here would make the facet a rival of
 * the schedule's derived element axis, which §10.13.d owns.
 */
export const MATERIAL_SURFACES = [
    'floor',
    'wall',
    'ceiling',
    'roof',
    'furniture',
    'outdoor',
] as const;

/** One surface slot. */
export type MaterialSurface = (typeof MATERIAL_SURFACES)[number];

/** True iff `s` is one of the six declared surfaces. Total; never throws. */
export function isMaterialSurface(s: string): s is MaterialSurface {
    return (MATERIAL_SURFACES as readonly string[]).includes(s);
}

/**
 * Is this material declared suitable for `surface`?
 *
 * ⭐ RETURNS `null`, NOT `false`, WHEN NOTHING IS DECLARED — and that is the whole
 * design. A boolean here would force every caller to pick a meaning for
 * "undeclared", and the two available meanings ("show it, it might fit" and "hide
 * it, we don't know") are both wrong to assert on the material's behalf. `null`
 * makes the caller SEE the third state, which is what stops a filter quietly
 * inventing a claim the catalogue never made.
 *
 * @returns `true` declared suitable · `false` declared and this surface is not in
 *          the list · `null` nothing declared — the caller must render its own
 *          third state (C100 §10.13.c).
 */
export function isDeclaredForSurface(
    record: { readonly surfaces?: readonly MaterialSurface[] },
    surface: MaterialSurface,
): boolean | null {
    const declared = record.surfaces;
    if (!declared || declared.length === 0) return null;
    return declared.includes(surface);
}

/**
 * The §MATERIAL-DECLARED-SURFACES well-formedness rule, as a pure predicate so the
 * gate, the tests and any future validator ask it ONE way (C84 EI-8).
 *
 * Returns `null` when well-formed, or a human-readable reason. ⚠ A reason rather
 * than a boolean, for the same stated reason `materialMapsDefect()` gives: a
 * silent `false` gives "fine" and "broken" the same value.
 */
export function materialSurfacesDefect(record: {
    readonly id: string;
    readonly surfaces?: readonly MaterialSurface[];
}): string | null {
    const declared = record.surfaces;
    if (declared === undefined) return null;
    if (!Array.isArray(declared)) {
        return `material '${record.id}'.surfaces is not an array`;
    }
    // ⛔ An EMPTY array is not "declared for nothing" — it is indistinguishable
    // from `undefined` to every consumer, which re-creates the exact collapse this
    // file exists to prevent. A material suitable for no surface should not be in
    // the catalogue at all; say so rather than accept a value that reads as absent.
    if (declared.length === 0) {
        return `material '${record.id}'.surfaces is an empty array — that is indistinguishable from NOT DECLARED. Omit the field, or name at least one surface`;
    }
    for (const s of declared) {
        if (!isMaterialSurface(s)) {
            return `material '${record.id}'.surfaces names '${String(s)}', which is not one of: ${MATERIAL_SURFACES.join(', ')}`;
        }
    }
    const seen = new Set(declared);
    if (seen.size !== declared.length) {
        return `material '${record.id}'.surfaces repeats a surface — [${declared.join(', ')}]`;
    }
    return null;
}
