/**
 * @file fixtureVocabulary.ts
 * §FIX-LIGHTING-VOCABULARY (L-1331, 2026-08-19)
 *
 * THE ONE ACCEPTED FIXTURE VOCABULARY — what `elements/Lighting.ts` will parse.
 *
 * ── The defect this closes (C96 §9.1 / EI-3) ───────────────────────────────
 *
 * `LightingKind` was a five-value `z.enum` HAND-TRANSCRIBED from a construction
 * taxonomy, while the plan tool, the `lighting.created` bridge and the legacy
 * store all treat that slot as the NAMED fixture family. The overlap was two
 * values, so `Lighting.parse` threw for ten of the twelve families the picker
 * offered — and after §FEAT-LOD200-LUMINAIRES added twenty more, **thirty of
 * thirty-two**. 3-D placement and project reopen worked for all of them; only
 * this enum refused. A transcription gap, not a missing capability.
 *
 * ⚠ AND A DEFAULT IS NOT A SAFETY NET HERE. `z.enum(...).default('downlight')`
 * fires on `undefined` and **never** on an out-of-enum literal, so the fallback
 * that looks like it would absorb an unknown family does nothing at all. That is
 * why the failure was a throw rather than a silent downgrade, and why widening
 * the accepted SET is the only fix that works.
 *
 * ── Why it is DERIVED, and why that is the point ───────────────────────────
 *
 * C84 EI-3 is directional: **UI offers ⇒ pipeline accepts.** The compliant
 * resolution of an offer/accept mismatch is to make the pipeline accept, unless
 * the capability genuinely does not exist. Narrowing the picker instead would
 * hide thirty WORKING fixtures to satisfy a stale enum — the silent-narrowing
 * failure EI-2 forbids, making the picker lie in the other direction.
 *
 * So the set is COMPOSED, never re-typed:
 *
 *   LEGACY_CONSTRUCTION_FORMS  the 5 original values, kept for records already
 *                              on disk that serialised a construction form
 *   NAMED_FIXTURE_IDS          the 12 hand-authored families
 *   LOD200_FIXTURE_IDS         the 20 LOD-200 families, DERIVED from the matrix
 *
 * A thirty-third luminaire is one row in `LOD200_FIXTURE_ROWS` and is accepted
 * here by construction. ⭐ There is no second list to remember, which is the
 * whole reason the matrix was moved down to this layer.
 *
 * ⚠ `NAMED_FIXTURE_IDS` is the one hand-written member, because those twelve
 * families have no matrix behind them. It is therefore PINNED by an executed
 * test (`core-app-model/src/lighting/Lod200FixtureCatalogue.test.ts`) asserting
 * that this vocabulary covers EVERY key of `LIGHTING_FIXTURE_PHOTOMETRY` — i.e.
 * everything the tool can actually place. A family added upstairs and forgotten
 * here fails that test rather than throwing at a user's click.
 */

import { LOD200_FIXTURE_IDS, type Lod200FixtureId } from './Lod200FixtureCatalogue.js';

/**
 * The original five-value CONSTRUCTION taxonomy. Retained for values already
 * serialised, and because `constructionFormFor()` (one layer up) still returns
 * four of them as a coarse classification. NOT the fixture vocabulary.
 */
export const LEGACY_CONSTRUCTION_FORMS = [
    'downlight',
    'pendant',
    'strip',
    'wall-sconce',
    'emergency',
] as const;

/**
 * The twelve hand-authored fixture families (`LightingFixtureType`, declared in
 * the three `LightingTypes.ts` copies — C96 §9.2).
 *
 * ⛔ Hand-written ONLY because these twelve have no matrix. Pinned by test; see
 * the file header. Do not add a LOD-200 family here — add a matrix row.
 */
export const NAMED_FIXTURE_IDS = [
    'downlight',
    'pendant',
    'linear_led',
    'pendant_pebble',
    'pendant_ceramic_bell',
    'pendant_conical',
    'pendant_cluster',
    'floor_wood_post',
    'floor_arc_brass',
    'floor_tripod_black',
    'table_terracotta',
    'mirror_light',
] as const;

/**
 * Everything `Lighting.kind` accepts, de-duplicated and frozen.
 *
 * `downlight` and `pendant` appear in two of the three sources — the two-value
 * overlap that made the original mistake look reasonable — so the set is
 * de-duplicated rather than concatenated.
 */
export type AcceptedLightingKind =
    | (typeof LEGACY_CONSTRUCTION_FORMS)[number]
    | (typeof NAMED_FIXTURE_IDS)[number]
    | Lod200FixtureId;

/**
 * ⚠ The TYPE is composed from the three sources above, and the runtime array is
 * asserted to it — NOT declared `readonly string[]`.
 *
 * Spreading a `Set` erases literal types, so the obvious spelling would have made
 * `Lighting['kind']` infer as plain `string`. That is a REAL regression wearing
 * the costume of a widening: every consumer of `kind` would silently lose its
 * exhaustiveness checking, and "widen the parse to accept anything" is exactly
 * what C96 §9.1 forbids. The union is kept closed; only its membership grew.
 */
export const ACCEPTED_LIGHTING_KINDS: readonly AcceptedLightingKind[] = Object.freeze([
    ...new Set<AcceptedLightingKind>([
        ...LEGACY_CONSTRUCTION_FORMS,
        ...NAMED_FIXTURE_IDS,
        ...LOD200_FIXTURE_IDS,
    ]),
]);

/** Is this a fixture family / construction form the pipeline will accept? */
export function isAcceptedLightingKind(v: string): v is AcceptedLightingKind {
    return (ACCEPTED_LIGHTING_KINDS as readonly string[]).includes(v);
}
