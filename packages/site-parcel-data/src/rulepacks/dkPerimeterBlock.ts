// §L-619 — DENMARK PERIMETER-BLOCK (karré) COURTYARD as a block-derived depth band.
//
// THE DEFECT (founder, 2026-07-26)
// --------------------------------
// A Copenhagen envelope filled the FULL parcel footprint (1,116 m²), but the real *karré* leaves a
// central COURTYARD — confirmed against the 3D globe. Root: DK Plandata publishes no structured
// setbacks/coverage (the byggelinjer live in a separate dataset + the lokalplan PDF), so the engine
// inset by 0 → the whole parcel. L-616 capped the HEIGHT (FAR) but not the FOOTPRINT.
//
// ⚠ THE KEY FINDING: Copenhagen's karré courtyard is the SAME GEOMETRY as Barcelona's *profunditat
// edificable* (PGM Art. 242.2) — a buildable DEPTH BAND around the block perimeter, interior left
// open. **The machinery already exists** (`ZoningRulesEngine`'s `block-derived-alignment` branch +
// `solveBlockDerivedDepth`, which makes BCN 13a/13b REALISTIC). Denmark reuses it UNCHANGED; the only
// new input is this rule's PARAMETERS. No new solver, no new geometry primitive.
//
// ⚠⚠ THIS IS A STUDY DEFAULT, HUMAN-GATED — NOT A CERTIFIED ORDINANCE NUMBER.
// -----------------------------------------------------------------------------
// The EXACT band depth is a legal fact stated per-plan in the lokalplan / BR18 friareal (opholdsareal)
// provisions — a PDF, human-gated, the same sourcing cost class as Barcelona's per-zone numbers. Until
// a human reads that plan, these are CONSERVATIVE study parameters chosen to UNDER-state the building
// (a smaller band + a larger courtyard is the safe direction, C58 §1.4): a shallow perimeter band that
// is far more honest than filling the whole parcel. A consumer MUST present the result as a STUDY
// (drop confidence to `estimated-ruleset`, carry the caveat), never as a surveyed footprint.
//
// WHY THESE NUMBERS (all conservative, all replaceable by a lokalplan read)
// ------------------------------------------------------------------------
//   • `interiorFreeRatio: 0.40` — keep ≥40% of the block as courtyard. The engine takes the LARGEST
//     band depth still leaving this share free, so a higher ratio ⇒ a shallower band ⇒ a smaller,
//     safer building. 0.40 mirrors the densest honest European courtyard share we hold (BCN nucli
//     antic subzona I); Danish karré courtyards are typically larger, so this is a floor, not a claim.
//   • `minDepth_m: 8` / `maxDepth_m: 12` — a typical Danish karré building depth is ~10–12 m. The cap
//     keeps the band shallow (conservative); the floor stops the ratio driving the band to nothing on
//     a small block. Both are STUDY bounds — replace with the plan's stated depth when sourced.
//   • `alignTo: 'street'`, `alignmentOffset_m: 0` — the façade sits on the street line (karré form).
//   • `sideTreatment: 'party-wall'` — perimeter-block buildings share side walls along the frontage.
//
// ⚠ WIRING (L5, reported for integration — NOT done here):
//   1. Resolve a DK BLOCK RING + per-edge frontage classification for the parcel (a Danish analogue
//      of `CatastroBlockProvider`/`dissolveParcelsToBlockRing`; GeoDanmark/OSM parcels + roads). This
//      producer does NOT exist yet — it is the one missing piece.
//   2. Classify at least one PARCEL edge as `front` (the engine refuses without it — by design).
//   3. Pass `geometricRule: DK_PERIMETER_BLOCK_COURTYARD_RULE`, `blockRing`, `blockEdgeClassifications`
//      into `computeBuildableEnvelope` alongside the structured DK record (rulePack stays null).
//   4. Drop the dispatched envelope's confidence to `estimated-ruleset` and add a "study courtyard —
//      verify band depth against the lokalplan/friareal" caveat.
// ⚠ WHERE THE BLOCK RING CANNOT BE RESOLVED, the engine already refuses `block-derived-alignment`
// (hard-fail, no full-parcel fall-through). The dispatcher should then fall back to the structured
// DK envelope, which now carries `footprintIsUpperBound = true` (the engine flags a full-parcel ring
// built from unknown setbacks) so the renderer HATCHES it instead of drawing a confident solid.
//
// PURE — a data constant. Strategic context: C58 §1.2/§1.4/§1.11, ADR-0271, L-616, L-619,
// docs/04-reference/jurisdictions/dk/ENVELOPE-RULES.md §2.

import type { GeometricRule } from '@pryzm/schemas';

/**
 * The conservative Danish perimeter-block courtyard rule — a STUDY default (see the module header).
 *
 * Reuses the `block-derived-alignment` kind that ships Barcelona's Art. 242.2 *profunditat edificable*
 * verbatim; only the parameters differ, and every one of them is human-gated to the lokalplan/friareal.
 */
export const DK_PERIMETER_BLOCK_COURTYARD_RULE: GeometricRule = {
    kind: 'block-derived-alignment',
    // Karré: the façade sits on the street line, obligatorily along the frontage.
    alignTo: 'street',
    alignmentOffset_m: 0,
    // Perimeter-block buildings share side (party) walls along the street frontage.
    sideTreatment: 'party-wall',
    // ≥40% of the block kept as interior courtyard — a conservative floor, replace with the plan's.
    interiorFreeRatio: 0.4,
    // STUDY band-depth bounds (m). Typical Danish karré building depth ~10–12 m; conservative cap.
    minDepth_m: 8,
    maxDepth_m: 12,
};

/**
 * The one-line honesty caveat a consumer MUST carry when it draws the study courtyard, so the
 * constructed band is never read as a surveyed footprint (§CONTEXT-DATA-HONESTY, L-619).
 */
export const DK_PERIMETER_BLOCK_STUDY_CAVEAT =
    'Study courtyard: the buildable depth band is a CONSERVATIVE estimate (perimeter-block / karré ' +
    'morphology). The exact band depth is stated in the lokalplan / BR18 friareal (opholdsareal) — a ' +
    'plan document PRYZM has not read for this parcel. Treat the footprint as an upper-bound study, ' +
    'not a surveyed buildable area (L-619).';
