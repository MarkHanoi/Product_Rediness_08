// §HABITABILITY-MINIMA-ARE-JURISDICTIONAL (L-4400..L-4460, lane JURIS11, 2026-08-22).
//
// THE DEFECT THIS MODULE EXISTS TO CLOSE
// ══════════════════════════════════════════════════════════════════════════════════
// `programRules.ROOM_RULES` has ONE COLUMN. Every numeric minimum in it was sourced
// from UK instruments — Building Regulations Approved Documents, HQI, BS 8300, the
// Nationally Described Space Standard — and then printed to the user as the word
// "minimum" over a room in Barcelona (L-4210, founder ruling 2026-08-22).
//
// A MINIMUM HABITABLE AREA IS A LEGAL STATEMENT. When PRYZM prints
// *"Bedroom 2 is 7.1 m² — below the 7.5 m² minimum this room type requires"* it is
// telling an architect what the law of their country requires of someone's home.
// Getting that wrong in the PERMISSIVE direction is worse than refusing to answer,
// and getting it wrong in the RESTRICTIVE direction is what produced zero layouts on
// the founder's real 81 m² Barcelona plate.
//
// Proof that the number is jurisdictional and not merely "conservative": this repo
// holds Málaga's own PGOU text, and Málaga requires a 12 m² principal bedroom
// (Art. 12.2.35) — the EXACT value the founder ruled OUT for Catalonia. Both are
// right. One column cannot express that.
//
// WHAT THIS MODULE IS
// ══════════════════════════════════════════════════════════════════════════════════
// The jurisdiction-keyed authority: `(jurisdiction, roomType) -> a minimum WITH the
// instrument that imposes it`. Four rules govern every value that may ever live here:
//
//   1. PROVENANCE TRAVELS WITH THE NUMBER. There is no `number` in this module that
//      is not attached to a {@link RoomMinimumProvenance}. A value with no cited
//      instrument is `confidence: 'pryzm-default'` and MUST say so wherever it is
//      shown, including in the layout engine's refusal sentence.
//   2. UNKNOWN IS A VALUE, NOT A GAP TO FILL. `null` means *"no instrument in this
//      repo states a minimum for this room type in this jurisdiction"*. It is NEVER
//      a licence to interpolate from a neighbouring country.
//   3. THERE IS EXACTLY ONE FALLBACK AND IT IS NAMED — `PRYZM_BASELINE` in
//      `standards.ts`. It is never silently substituted: every resolution reports
//      which tier answered, so a caller can always tell a regulation from a default.
//   4. NEVER INVENT A NUMBER FOR A COUNTRY YOU CANNOT CITE. A fabricated habitability
//      minimum is a fabricated legal claim about someone's home.
//
// PURITY: this module is PURE DATA + pure predicates. It imports the `RoomType`
// vocabulary and NOTHING ELSE — the same discipline `programRules.ts` declares. In
// particular it does NOT import `@pryzm/site-parcel-data`: geography is resolved by
// the ONE existing resolver (`resolveRegisteredJurisdictionAt`) at the composition
// surface and injected here as a plain string key. See `resolve.ts` and ADR-0352 for
// why that direction, and `apps/editor/__tests__/habitabilityJurisdictionIds.test.ts`
// for the gate that stops the two string vocabularies drifting apart.
//
// Governed by SPEC-HABITABILITY-MINIMA.md + ADR-0352 + C83 §11.

import type { RoomType } from '../../types.js';

/**
 * How much this repo actually knows about a stated minimum. ORDERED, strongest first.
 *
 * ⚠ The gap between the first two is the whole point. `'primary-in-repo'` means the
 * number was read out of the instrument's own text, and that text is on disk at a
 * path this record cites — it can be re-read and falsified. `'instrument-cited'`
 * means the instrument is NAMED but its text is NOT here; the number came from
 * secondary knowledge and is a CANDIDATE, not a determination. The two must never be
 * flattened into "we have Spain".
 */
export type HabitabilityConfidence =
    /** The instrument's own text is in this repo at `sourcePath`; the value was read from it. */
    | 'primary-in-repo'
    /** The instrument is named (title + article + date) but its text is NOT in this repo.
     *  RE-VERIFY against the primary source before publishing this as a compliance verdict. */
    | 'instrument-cited'
    /** No instrument at all. PRYZM's own engineering baseline. NEVER a legal claim. */
    | 'pryzm-default';

/**
 * Does the instrument BIND, or does it only apply when something else adopts it?
 *
 * ⚠ This is not decoration. The UK Nationally Described Space Standard is NOT
 * building regulation — it is an optional technical standard that binds only where a
 * local planning authority has adopted it in its Local Plan and applies it as a
 * planning condition. Printing its 11.5 m² as "the minimum required" in a borough
 * that has not adopted it is the same class of error as printing it in Barcelona.
 */
export type HabitabilityBindingness =
    /** Binding building/habitability regulation within the stated extent. */
    | 'mandatory'
    /** Binds only where separately adopted (e.g. a Local Plan policy / planning condition). */
    | 'conditional'
    /** Advisory guidance; carries no legal force on its own. */
    | 'guidance';

/**
 * The extent an instrument speaks for. MIRRORS `JurisdictionExtentResolution` in
 * `@pryzm/site-parcel-data/rulepacks/registry.ts` — deliberately RE-DECLARED rather
 * than imported, because importing it would drag the whole zoning registry (40+ rule
 * packs, OpenTelemetry) into the layout engine and break this module's stated purity.
 * The two are pinned equal by `habitabilityJurisdictionIds.test.ts`, which CAN see
 * both. A mirrored vocabulary with a gate is honest; a mirrored vocabulary without
 * one is the drift this repo keeps paying for (C60 §2).
 */
export type HabitabilityExtent =
    | 'district'
    | 'municipal'
    | 'metropolitan'
    | 'regional'
    | 'national';

/** Finest → coarsest. The SINGLE source of the ladder ordering; ranks derive from it. */
export const HABITABILITY_EXTENTS: readonly HabitabilityExtent[] = [
    'district',
    'municipal',
    'metropolitan',
    'regional',
    'national',
];

/**
 * The instrument behind one number. Every stated minimum carries one; there is no
 * path in this module that produces a bare `number`.
 */
export interface RoomMinimumProvenance {
    /** The instrument in ITS OWN language, as it would be cited in a planning submission. */
    readonly instrument: string;
    /** Article / annex / clause. `null` only when the instrument has no internal division. */
    readonly article: string | null;
    /** The instrument's own date or edition (e.g. '2018-02', '2012-10-30', '2015-10-01'). */
    readonly instrumentDate: string;
    /** Repo-relative path to the primary text, when this repo holds it. `null` otherwise —
     *  and `null` here is exactly what forces `confidence` below `'primary-in-repo'`. */
    readonly sourcePath: string | null;
    /** Where to go to VERIFY, or to close an UNKNOWN. Always populated, even when the
     *  value is known — a verified number still needs a re-check path when the
     *  instrument is amended. */
    readonly sourceToChase: string;
    readonly confidence: HabitabilityConfidence;
    readonly bindingness: HabitabilityBindingness;
}

/**
 * One room type's minima under one instrument.
 *
 * ⛔ `null` MEANS UNKNOWN AND MUST BE RENDERED AS UNKNOWN. It does not mean "zero",
 * "unconstrained", or "use the other one". Málaga's Art. 12.2.35 states a bedroom
 * AREA and states no bedroom WIDTH; that is `minAreaM2: 8, minShortSideM: null`, and
 * anything else would be an invented width in a Spanish ordinance.
 */
export interface RoomMinimum {
    /** Net/useful floor area floor in m². `null` = the instrument states none. */
    readonly minAreaM2: number | null;
    /** Shortest clear plan dimension in m. `null` = the instrument states none. */
    readonly minShortSideM: number | null;
    /** The instrument clause behind THESE numbers (an instrument can cite different
     *  articles for different rooms, so provenance is per-room, not per-standard). */
    readonly provenance: RoomMinimumProvenance;
    /** The instrument's own wording for the room, so a reader can check the mapping
     *  onto PRYZM's `RoomType` vocabulary rather than trusting it. */
    readonly instrumentRoomTerm: string;
    /** How the instrument's term was mapped onto PRYZM's RoomType, when that mapping
     *  is a judgement rather than a translation. `null` when it is a plain translation. */
    readonly mappingNote: string | null;
}

/**
 * A habitability instrument, as a table of per-room-type minima.
 *
 * A standard is SPARSE ON PURPOSE: a room type absent from `rooms` means this
 * instrument states nothing about it, which is a different fact from stating no
 * minimum. Both resolve to the named fallback, and BOTH say so.
 */
export interface HabitabilityStandard {
    /** Stable id, `<jurisdiction-key>-<instrument-slug>`. Appears in user-facing provenance. */
    readonly standardId: string;
    /** Human name of the covered area, in the ordinance's own terms. */
    readonly displayName: string;
    /** ISO 3166-1 alpha-2, lowercase. The sovereign state whose law this encodes. */
    readonly countryCode: string;
    readonly extent: HabitabilityExtent;
    /**
     * The jurisdiction keys this standard answers for.
     *
     * ⭐ Where a registered zoning jurisdiction exists, the key MUST be that
     * registration's `jurisdictionId` LITERAL (e.g. `'es-29067-malaga'`) — the same
     * string `resolveRegisteredJurisdictionAt()` returns. That is the reuse ADR-0352
     * mandates; a second country resolver is the defect this repo keeps paying for.
     * Regional/national tiers use the ISO key (`'es-ct'`, `'es'`, `'gb'`).
     */
    readonly jurisdictionKeys: readonly string[];
    /** Per-room minima. SPARSE — an absent RoomType means the instrument is silent. */
    readonly rooms: Readonly<Partial<Record<RoomType, RoomMinimum>>>;
    /** What this instrument does NOT cover, stated so a reader cannot mistake silence
     *  for permission. Free text, one line per unaddressed axis. */
    readonly notCovered: readonly string[];
}

/**
 * What the caller knows about WHERE the layout is. Produced at the composition
 * surface from the ONE existing resolver; consumed here as plain strings.
 *
 * ABSENT (i.e. the whole binding is `undefined`) means *"PRYZM does not know where
 * this apartment is"* — which resolves to the named fallback and says so. It does
 * NOT mean "anywhere" and it does NOT mean "the UK".
 */
export interface HabitabilityBinding {
    /** The registered zoning `jurisdictionId` for the point, when one resolved.
     *  `null` when `resolveRegisteredJurisdictionAt` returned `'none'` or `'ambiguous'`. */
    readonly jurisdictionId: string | null;
    /** ISO 3166-1 alpha-2, lowercase, when known. `null` when the point is uncovered. */
    readonly countryCode: string | null;
    /** Sub-national key (e.g. `'es-ct'`), when the caller can name one. `null` otherwise. */
    readonly regionKey: string | null;
    /** Why the jurisdiction is null, when it is — carried so a refusal can say which of
     *  "never asked", "off the map", and "two registrations tie" happened.
     *  Mirrors `JurisdictionClaimResolution['kind']` plus `'not-asked'`. */
    readonly resolution: 'resolved' | 'none' | 'ambiguous' | 'not-asked';
}

/** Which rung of the ladder actually answered. Never inferred — always reported. */
export type HabitabilityMatchTier =
    /** A standard keyed on the exact registered jurisdiction id. */
    | 'jurisdiction'
    /** A standard keyed on the region (e.g. `'es-ct'`). */
    | 'region'
    /** A standard keyed on the country (e.g. `'gb'`). */
    | 'country'
    /** The ONE named fallback. A PRYZM default, never a regulation. */
    | 'pryzm-baseline';

/**
 * The answer. Note there is no arm on which `provenance` is absent, and no arm on
 * which a caller can obtain the number without also obtaining what backs it.
 */
export interface ResolvedRoomMinimum {
    readonly roomType: RoomType;
    /** The area floor the engine should apply. NEVER null — see `areaIsRegulated`. */
    readonly minAreaM2: number;
    /** The short-side floor the engine should apply. NEVER null — see `shortSideIsRegulated`. */
    readonly minShortSideM: number;
    /** TRUE when `minAreaM2` came from a cited instrument for THIS jurisdiction.
     *  FALSE when it came from the named PRYZM baseline — including when an
     *  instrument matched but is silent on this room type. */
    readonly areaIsRegulated: boolean;
    /** As `areaIsRegulated`, for the short side. The two are INDEPENDENT: Málaga
     *  regulates bedroom AREA and is silent on bedroom WIDTH. */
    readonly shortSideIsRegulated: boolean;
    /** Which rung answered. `'pryzm-baseline'` when neither figure is regulated. */
    readonly matchTier: HabitabilityMatchTier;
    /** The standard that answered — the fallback standard when nothing regulated matched. */
    readonly standardId: string;
    readonly displayName: string;
    /** Provenance for the AREA figure (the one the refusal sentence prints). */
    readonly provenance: RoomMinimumProvenance;
    /** Provenance for the SHORT-SIDE figure; equals `provenance` when both came from
     *  the same clause, and differs when one is regulated and the other is not. */
    readonly shortSideProvenance: RoomMinimumProvenance;
}

// ── The per-country coverage audit, as DATA rather than as a document ────────────
//
// ⭐ WHY THIS IS CODE AND NOT ONLY A MARKDOWN TABLE. `docs/04-reference/jurisdictions/`
// is full of matrices that were true when written. A coverage claim that lives only
// in prose cannot be asserted against the shipped standards, so it rots the first
// time someone seeds a country and forgets the table. This one is quantified over by
// `habitabilityStandards.test.ts`: a row claiming `'structured'` with no standard
// behind it FAILS CI, and a seeded standard with no row FAILS CI.

/** What form the habitability data for a country takes IN THIS REPO, today. */
export type HabitabilityCoverageForm =
    /** A machine-readable standard is shipped in `standards.ts` for ≥1 room type. */
    | 'structured'
    /** The repo holds the instrument's PROSE (a corpus file) but nothing is extracted. */
    | 'prose-corpus'
    /** Nothing at all in this repo. The named source below has not been fetched. */
    | 'absent';

/** One country's row in the audit — one per `docs/04-reference/jurisdictions/<cc>/`. */
export interface HabitabilityCoverageRow {
    /** ISO 3166-1 alpha-2, lowercase — the `jurisdictions/<cc>/` folder name. */
    readonly countryCode: string;
    readonly countryName: string;
    readonly form: HabitabilityCoverageForm;
    /** Standard ids shipped for this country. EMPTY unless `form === 'structured'`. */
    readonly standardIds: readonly string[];
    /**
     * The instrument to fetch to close this row, named even when nothing is held.
     * ⛔ NAMING A SOURCE IS NOT HAVING IT. A row may name an instrument and still be
     * `'absent'`; that is the honest state and it must never be upgraded by confidence.
     */
    readonly namedSourceToChase: string;
    /** ABSENT vs UNREACHABLE have opposite fixes. This says which, and why. */
    readonly gapKind: 'not-fetched' | 'fetched-not-extracted' | 'partially-extracted';
    /** Any repo path that bears on this row (a corpus file, a study). `null` when none. */
    readonly evidencePath: string | null;
    readonly note: string;
}
