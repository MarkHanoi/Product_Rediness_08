// LANE FED (E5 partial · DECISION-SUMMARY row 2) — GERS: the Global Entity Reference System
// id Overture Maps stamps on every building. Row 2's ruling: "adopt GERS as the conflation
// key". This file is the TYPED form of that key — nothing else in the repo types it (grep
// 2026-09-01: `gers` case-insensitive over packages/apps/server/tools hits only the nullable
// `gersId: z.string()` column on the FROZEN `SiteIntelBuildingSchema`, which this module
// deliberately reuses — see conflate.ts).
//
// ⭐ MEASURED FORMAT — re-measured 2026-09-01 by THIS lane against the live bucket, because
// the inherited draft asserted the shape twice and asserted it INCONSISTENTLY (the parser
// said dashed-UUID, the suite next to it asserted 32 undashed hex chars and would not even
// have compiled a passing run; the header cited a transcript that was never written). Both
// claims are now settled by measurement, not by memory:
//
//   probe   audit/europe-site-intel/2026-08-31/impl/lane-fed-transcripts/fed-probe-overture.py
//   result  audit/europe-site-intel/2026-08-31/impl/lane-fed-transcripts/fed-probe-transcript.txt
//   source  s3://overturemaps-us-west-2/release/2026-07-22.0/theme=buildings/type=building
//           (the release PINNED by tools/context-bake/bake.mjs §BAKE-OVERTURE — access path
//           ADOPTED from there, not reinvented)
//   AOI     Tallinn / Kopli, WGS84 bbox 24.720,59.440 → 24.740,59.450
//   rows    1185 buildings · ids 1185/1185 DASHED lowercase UUID (8-4-4-4-12, length 36)
//                          · ids    0/1185 undashed 32-hex
//           e.g. `eeedff0b-85b9-45a1-879e-fd7ca4ce4214`
//
// So: the dashed shape is the measured one, at 100% of a 1185-row live sample, and the
// 32-char shape is REFUSED — deliberately and loudly. If a future release changes the shape
// again, the parse refuses by name rather than silently accepting a new format
// (§CONTEXT-DATA-HONESTY: a refusal names the value). Re-run the probe before widening it.
//
// E4 control 3: the canonical model is FROZEN — this brand lives in the FEDERATION module,
// not in @pryzm/schemas; `SiteIntelBuilding.gersId` stays the frozen `string | null` and a
// `GersId` assigns to it losslessly (a brand is a compile-time refinement, not a new field).
//
// PURE (C58 §1.9): no I/O, no RNG, deterministic.

declare const GERS_ID_BRAND: unique symbol;

/**
 * A validated GERS id. The brand makes "any string" non-assignable — the only
 * way to obtain one is {@link parseGersId}, so a `GersId` in a signature is a
 * proof the format check ran.
 */
export type GersId = string & { readonly [GERS_ID_BRAND]: true };

/** The MEASURED GERS id shape (see file header): dashed lowercase UUID, 36 chars. */
const GERS_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Parse a raw value into a {@link GersId}, or `null` when it is not one.
 *
 * `null` here means "not a valid GERS id" — the caller decides whether that is
 * a refusal or an honest absence. An ABSENT id (source served no `id` column)
 * must be passed as `null`/`undefined` by the caller and stays `null` — absence
 * and malformation both land on `null`, but `parseGersId` is only ever called
 * on PRESENT values by this module (conflate.ts), so the two are not conflated
 * in practice: absent values never reach the parser.
 */
export function parseGersId(raw: string | null | undefined): GersId | null {
    if (typeof raw !== 'string') return null;
    return GERS_ID_RE.test(raw) ? (raw as GersId) : null;
}

/** Are two ids the same GERS entity? (Trivial today; the seam where GERS versioning lands.) */
export function sameGersEntity(a: GersId, b: GersId): boolean {
    return a === b;
}

/**
 * A published GERS BRIDGE — the pre-computed conflation Overture ships per release
 * (`s3://overturemaps-us-west-2/bridgefiles/<RELEASE>`, e5-oss-delta.md §D1), mapping a
 * GERS id onto an id in a bridged national dataset. Bridged datasets as published
 * 2026-09-01 include **Instituto Geográfico Nacional (España)**; DE/NL/DK/EE cadastres are
 * NOT bridged.
 *
 * ⚠ THIS IS A SEAM, NOT A CLIENT. No bridge file is fetched anywhere in this module: the
 * bridge-files page states NO LICENCE (e5-oss-delta §D1 + §6.4 gap 1), so consuming one is
 * blocked exactly as EUBUCCO's is (control 9 — unresolved ≠ open). What the seam buys today
 * is that the match interface PREFERS a published bridge over a computed IoU wherever one
 * exists, so the day the licence resolves the conflation becomes a LOOKUP and no geometric
 * matcher has to be trusted for that country. See `FEDERATION_CONFLATION_STRATEGY`
 * (sourcePriority.ts) for which countries that is, as data.
 */
export interface GersBridge {
    /** Bridge label for transcripts, e.g. `"overture-bridgefiles/2026-08-19.0/IGN-ES"`. */
    readonly label: string;
    /**
     * The bridged national feature id for a GERS id, or `null` when the bridge
     * carries no row for it. `null` is an HONEST absence — it never means "no
     * match", only "this bridge does not say"; the caller falls through to
     * geometry.
     */
    readonly nationalFeatureIdFor: (gersId: GersId) => string | null;
}
