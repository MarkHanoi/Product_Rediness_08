/**
 * RegionalRates — 5D. The MECHANISM for a region-keyed cost estimate, and the
 * zero numbers it ships.
 *
 * Layer:    L2 — packages/core-app-model
 * Contract: C66 §1.1 (a price that has not been sourced is a CLAIM),
 *           C100 §5 by analogy (a miss is a miss, never a substitute),
 *           C03 (pure read model; no I/O, no clock in any exported function).
 * ADR:      ADR-0350 §5D, AMENDED by ADR-0365 §2 (this module).
 *
 * ⚠ CITATION CORRECTED 2026-08-23 (lane RATE53, L-9104). This line read
 * "AMENDED by ADR-0353 §2". **ADR-0353 is "A reflected ceiling plan is
 * PLAN-HANDED"** (lane VIEWDOC20, 2026-08-22) and says nothing about cost.
 * Measured: `grep -ciE "regional rate|price base|5D|cost estimate"
 * docs/02-decisions/adrs/ADR-0353-a-reflected-ceiling-plan-is-plan-handed.md`
 * → **0**. Lane MEDI14's estimate-arm amendment never got an ADR number at all;
 * ADR-0365 is that missing amendment. This is the SECOND time a 2026-08-22 lane
 * mis-cited 0353 — `quantities/index.ts` records the first (L-6301, the sequence
 * lane, corrected to ADR-0355). Three lanes minted work on one day and two of
 * them reached for the same free number.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ THE FOUNDER REVERSED A STATED PROHIBITION, AND THIS IS THE ARCHITECTED FORM
 * ═════════════════════════════════════════════════════════════════════════════
 * The 5D panel said, in words, on its own face:
 *
 *   > "PRYZM ships no rates. Every price here is one you typed or imported —
 *   >  from BEDEC (ITeC), a Base de Precios, SPON'S, RSMeans or your own
 *   >  quotations. There is no default and there is no estimate."
 *
 * Founder, 2026-08-22: *"in COST (5D) there is already available data of element
 * cost per m/m² depending on the region — since every single project is
 * geolocated via the parcel — we could provide an estimate for each, clearly
 * defining it as estimate and allowing the user to place the precise number, but
 * providing the user an average of the cost."*
 *
 * That is a RULING, and it is a reasonable one: a quantity surveyor's first
 * question about a BOQ is "what does this come to, roughly?", and refusing to
 * answer it is a capability gap, not integrity. **But the reversal is of the
 * REFUSAL TO OFFER AN ESTIMATE — it is NOT a licence to invent a number.**
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⛔ WHAT THIS FILE SHIPS: ZERO PER-LINE RATES — STILL, AND NOW FOR A READ REASON
 * ═════════════════════════════════════════════════════════════════════════════
 * ⚠ REWRITTEN 2026-08-23 (lane RATE53, L-9101). This block used to end *"Nobody
 * in this lane opened a licence text"*. **Licence texts have now been opened**,
 * and the verdicts are in {@link RATE_SOURCE_CANDIDATES} with the sentence that
 * decided each. The outcome for THIS table is unchanged — `REGIONAL_RATE_BOOKS`
 * is still EMPTY — but it is now empty for a reason that was checked rather than
 * for a question nobody asked. Those are different states and the file must not
 * blur them.
 *
 *   • **BEDEC (ITeC)** — **READ: LICENSED_NOT_REDISTRIBUTABLE.** ITeC's own
 *     documentation: *"La llicència d'accés al banc funciona mitjançant períodes
 *     de subscripció que es poden contractar per mesos o anys"*, and *"La
 *     quantitat d'usuaris que poden fer servir simultàniament el Banc BEDEC depèn
 *     de la quantitat de llicències contractades."* A time-boxed, per-seat ACCESS
 *     licence conveys no redistribution right — the absence of a grant is the
 *     answer, and no further correspondence is needed to reach it.
 *   • **SPON'S** (Aecom / Taylor & Francis) and **RSMeans** (Gordian) —
 *     commercial publications sold per copy. **NO**, and nothing to establish.
 *   • **Official-bulletin reference modules** — ⭐ **READ: CLEARED.** This whole
 *     CLASS was missing from the ledger, and it is the one that shipped. See
 *     `RegionalBuildingCost.ts`. It does NOT populate this table, because what it
 *     publishes is a building-level €/m², not a per-trade unit rate.
 *
 * ⛔ THEREFORE NO PER-LINE NUMBER IS SEEDED, AND `SHIPPED_REGIONAL_RATE_COUNT`
 * IS 0. ⛔ AND THE OBVIOUS BRIDGE IS FORBIDDEN: a building-level €/m² could be
 * split across these 42 lines by assumed trade percentages, and every resulting
 * row would be a number this repo invented wearing somebody else's citation.
 * A €/m² invented here would be quoted in a tender.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ AN ESTIMATE IS A DIFFERENT KIND OF THING FROM A RATE, AND THE TYPES SAY SO
 * ═════════════════════════════════════════════════════════════════════════════
 * A `RateEntry` (`CostModel.ts`) is a number the USER stands behind. A
 * {@link RegionalRate} is a number a PUBLISHED SOURCE stands behind, resolved by
 * geography. They are separate types, they live in separate books, they are
 * applied by separate arms of `applyRates`, and **the estimated total is never
 * added into the priced total**. A user who types a rate always wins: an
 * estimate on a line the user has priced is not applied at all.
 *
 * ⛔ MUST NOT: merge the two totals; default `RateEntry.source` from a regional
 * provenance; or let `estimatedTotal` be rendered without
 * {@link CostSummary.coverageStatement}, which states its status in words.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHERE THE GEOGRAPHY COMES FROM (and why it is not resolved here)
 * ═════════════════════════════════════════════════════════════════════════════
 * PRYZM has exactly ONE geography resolver:
 * `resolveRegisteredJurisdictionAt(lat, lon)` in `@pryzm/site-parcel-data`, with
 * its finest-claim-wins rule and its explicit `'ambiguous'` arm that REFUSES
 * rather than picking. This module MINTS NO SECOND ONE and does not import that
 * package — it consumes a plain-string {@link CostJurisdictionBinding} built at
 * the composition surface, exactly as `rules/habitability/` does (ADR-0352 §4).
 * A second country resolver is the defect this repo keeps paying for.
 */

import type { QuantityUnit, TakeoffLine } from './TakeoffTypes.js';

// ── Provenance ────────────────────────────────────────────────────────────────

/**
 * How much this repo actually knows about a published rate. ORDERED, strongest
 * first — and the gap between the first two is the whole point, exactly as it is
 * for `HabitabilityConfidence`.
 */
export type RateConfidence =
  /** The price base's own text/data is in this repo at `sourcePath`; the value was read from it. */
  | 'primary-in-repo'
  /** The database and its edition are NAMED but its data is NOT here. A CANDIDATE, not a determination. */
  | 'database-cited'
  /** No source at all. NEVER permitted in a shipped book — present so the union can express the refusal. */
  | 'pryzm-default';

/**
 * ⛔ THE FIELD THAT DECIDES WHETHER A ROW MAY EXIST IN THIS REPO AT ALL.
 *
 * `NOT_ESTABLISHED` is the honest state for every candidate today. It is NOT a
 * synonym for "probably fine": it means nobody has read the licence.
 */
export type RateLicenceStatus =
  /** A licence text was READ and permits redistribution inside this product. Cite it in `licenceNote`. */
  | 'CLEARED_FOR_REDISTRIBUTION'
  /** A licence text was READ and FORBIDS redistribution. The user must hold their own copy. */
  | 'LICENSED_NOT_REDISTRIBUTABLE'
  /** Nobody has read the licence. ⛔ No rate may ship under this status. */
  | 'NOT_ESTABLISHED';

/**
 * The source behind ONE published rate. There is no `number` in this module that
 * is not attached to one — the type system doing work a review rule would
 * otherwise have to do every week (the ADR-0351 §6.2 pattern).
 */
export interface RatePriceProvenance {
  /** The price base in ITS OWN name, as it would be cited in a tender. */
  readonly database: string;
  readonly publisher: string;
  /** The edition/version the figure was taken from. */
  readonly edition: string;
  /**
   * ⭐ THE PRICE DATE, ISO `YYYY-MM-DD`. A construction rate without a date is
   * not a weak rate, it is not a rate: materials moved more than 30 % in
   * 2021–2023 and a figure with no date cannot be indexed to today.
   */
  readonly priceDate: string;
  /** The database's own item code, so the user can look the row up and check it. */
  readonly itemCode: string | null;
  /** Repo-relative path to the primary data, when this repo holds it. `null` otherwise. */
  readonly sourcePath: string | null;
  /** Where to go to VERIFY, or to close an UNKNOWN. Always populated. */
  readonly sourceToChase: string;
  readonly confidence: RateConfidence;
  readonly licence: RateLicenceStatus;
  /** What the licence actually says, in one line. `null` when it has not been read. */
  readonly licenceNote: string | null;
}

// ── A rate, and a book of them ────────────────────────────────────────────────

export interface RegionalRate {
  /**
   * Matched against `TakeoffLine.code` by PREFIX, so one published row can cover
   * a family (`'WALL.'`) or one exact line (`'WALL.blockwork-200.200'`). The
   * LONGEST matching prefix wins — a specific row must be able to beat a family
   * row, and the alternative (first-match) makes the answer depend on array
   * order, which is not a fact about the building.
   */
  readonly lineCodePrefix: string;
  /** The unit the published price is quoted in. Checked against the line's unit; never converted. */
  readonly unit: QuantityUnit;
  /** Price per ONE of `unit`, in the book's currency. Finite, ≥ 0. */
  readonly rate: number;
  readonly description: string;
  readonly provenance: RatePriceProvenance;
}

export interface RegionalRateBook {
  /** Stable id, `<jurisdiction-key>-<database-slug>-<edition>`. Shown to the user. */
  readonly bookId: string;
  readonly displayName: string;
  /** ISO 3166-1 alpha-2, lowercase. */
  readonly countryCode: string;
  readonly extent: 'municipal' | 'regional' | 'national';
  /**
   * ⭐ Where a registered zoning jurisdiction exists, the key MUST be that
   * registration's `jurisdictionId` LITERAL — the same string
   * `resolveRegisteredJurisdictionAt()` returns (ADR-0352's rule, reused).
   * Regional/national tiers use the ISO key (`'es-ct'`, `'es'`, `'gb'`).
   */
  readonly jurisdictionKeys: readonly string[];
  /** ISO-4217. A book states its own currency; it is never assumed to be the user's. */
  readonly currency: string;
  readonly rates: readonly RegionalRate[];
  /**
   * What this book does NOT cover, stated so a reader cannot mistake silence for
   * "included". Preliminaries, overheads, profit, VAT and regional plant costs
   * belong here whenever the source excludes them.
   */
  readonly notCovered: readonly string[];
}

// ── What ships: nothing, and the ledger of why ────────────────────────────────

/**
 * A price source PRYZM could carry, and the state of the ONLY question that
 * decides whether it may: **has anyone read the licence?**
 *
 * ⚠ REWRITTEN 2026-08-23 (lane RATE53, L-9101). Every row used to be
 * `NOT_ESTABLISHED`. Rows are now carried with the verdict AND
 * {@link licenceNote} — **the sentence in the licence that decided it**. A row
 * that still reads `NOT_ESTABLISHED` means the text has genuinely not been
 * opened, and that is now the exception rather than the whole table.
 *
 * ⭐ AND THE LEDGER GAINED A CLASS IT WAS MISSING, WHICH IS THE FINDING. The old
 * list named four UNIT-PRICE BOOKS and concluded that regional cost data is
 * licensed. It is not: **official bulletins publish regional building-cost
 * modules and carry no copyright at all.** The list was refusing the wrong
 * product — §BULK-VS-QUERY-ENDPOINT-FALSE-REFUSALS, where 9 of 14 "blockers"
 * were refusals about a product nobody needed. Ask of every row: *is the thing I
 * am refusing actually the thing I need?*
 */
export interface RateSourceCandidate {
  readonly database: string;
  readonly publisher: string;
  readonly geography: string;
  readonly licence: RateLicenceStatus;
  /** WHO must establish it, and against WHAT. Never "TBD". */
  readonly whatMustBeEstablished: string;
  /**
   * ⭐ THE SENTENCE THAT DECIDED THE VERDICT, quoted, in its own language.
   * `null` ONLY where `licence` is `NOT_ESTABLISHED` — a verdict without the
   * sentence behind it is the "cited is not checked" failure this whole module
   * exists to prevent.
   */
  readonly licenceNote: string | null;
  /**
   * What KIND of number this source publishes. ⭐ A source can be perfectly
   * cleared and still not populate `REGIONAL_RATE_BOOKS`, because a
   * building-level €/m² is not a per-trade unit rate and the two must never be
   * stored in one table. Barcelona's ordinance is exactly that case.
   */
  readonly granularity: 'per-line-unit-rate' | 'building-level-rate' | 'index-only';
}

export const RATE_SOURCE_CANDIDATES: readonly RateSourceCandidate[] = Object.freeze([
  {
    database: 'Ordenança fiscal ICIO, Annex — mòduls de cost de construcció',
    publisher: 'Ajuntament de Barcelona (published in the Butlletí Oficial de la Província de Barcelona)',
    geography: 'Barcelona municipality',
    licence: 'CLEARED_FOR_REDISTRIBUTION',
    granularity: 'building-level-rate',
    licenceNote:
      'Ley de Propiedad Intelectual (RDLeg 1/1996) Art. 13: "No son objeto de propiedad intelectual las '
      + 'disposiciones legales o reglamentarias y sus correspondientes proyectos, las resoluciones de los '
      + 'órganos jurisdiccionales y los actos, acuerdos, deliberaciones y dictámenes de los organismos '
      + 'públicos..." — a municipal fiscal ordinance is a disposición reglamentaria, so it carries no '
      + 'copyright to license. Independently, datos.gob.es catalogues the BOPB dataset under CC BY 4.0.',
    whatMustBeEstablished:
      'Nothing — READ AND CLEARED, and SHIPPED: see RegionalBuildingCost.ts. ⚠ Re-read the annex each '
      + 'January; the ordinance is re-approved annually and the basic module moves. ⛔ It publishes a '
      + 'BUILDING-LEVEL €/m², so it does NOT and MUST NOT populate REGIONAL_RATE_BOOKS.',
  },
  {
    database: 'BEDEC',
    publisher: 'ITeC — Institut de Tecnologia de la Construcció de Catalunya',
    geography: 'Catalonia and, in its state-wide banks, Spain',
    licence: 'LICENSED_NOT_REDISTRIBUTABLE',
    granularity: 'per-line-unit-rate',
    licenceNote:
      'ITeC: "La llicència d\'accés al banc funciona mitjançant períodes de subscripció que es poden '
      + 'contractar per mesos o anys", and "La quantitat d\'usuaris que poden fer servir simultàniament el '
      + 'Banc BEDEC depèn de la quantitat de llicències contractades." A time-boxed, per-seat ACCESS '
      + 'licence grants no redistribution right; ITeC further describes the bancs d\'entitats oficials as '
      + 'being of exclusive distribution through BEDEC.',
    whatMustBeEstablished:
      'Nothing further for a REFUSAL — an access subscription that never grants redistribution is a '
      + 'settled no. Only a written redistribution agreement from ITeC could change it, and that is a '
      + 'founder/commercial decision, not an engineering one. ⭐ This is the source that WOULD have given '
      + 'per-trade Catalan unit rates; its absence is why every take-off line still reads NO RATE.',
  },
  {
    database: 'Bases de precios de la construcción publicadas por administraciones autonómicas (BCCA Andalucía, Comunidad de Madrid, Galicia, …)',
    publisher: 'Autonomous-community public-works departments',
    geography: 'Per autonomous community, Spain — ⛔ NONE of them Catalonia',
    licence: 'NOT_ESTABLISHED',
    granularity: 'per-line-unit-rate',
    licenceNote: null,
    whatMustBeEstablished:
      'Whether the specific bank is published under a reuse licence permitting commercial '
      + 'redistribution. ⚠ DELIBERATELY NOT PURSUED BY LANE RATE53, and the reason matters: these are '
      + 'freely downloadable and several would probably clear, but they are ANDALUSIAN, MADRILENIAN and '
      + 'GALICIAN prices. Shipping them would only help a Barcelona project by substituting another '
      + 'region\'s market — which resolveRegionalRates() refuses by design, because a rate from the wrong '
      + 'market is a wrong number, not an approximate one. Pursue these when a project in THOSE regions '
      + 'needs them, keyed to THOSE jurisdictions.',
  },
  {
    database: "SPON'S Architects' and Builders' Price Book",
    publisher: 'Aecom / Taylor & Francis',
    geography: 'United Kingdom',
    licence: 'LICENSED_NOT_REDISTRIBUTABLE',
    granularity: 'per-line-unit-rate',
    licenceNote: 'A commercial publication sold per copy; no redistribution right accompanies a purchased copy.',
    whatMustBeEstablished:
      'Nothing — this is a commercial publication sold per copy. The user imports their own; '
      + 'PRYZM will not carry it.',
  },
  {
    database: 'RSMeans',
    publisher: 'Gordian',
    geography: 'United States and Canada',
    licence: 'LICENSED_NOT_REDISTRIBUTABLE',
    granularity: 'per-line-unit-rate',
    licenceNote: 'A commercial subscription product; a subscription grants access, never redistribution.',
    whatMustBeEstablished:
      'Nothing — a commercial subscription product. The user imports their own.',
  },
]);

/**
 * ⛔ A verdict with no sentence behind it is the "cited is not checked" failure.
 * Returns the databases that state a READ verdict — cleared or refused — without
 * quoting what they read. `NOT_ESTABLISHED` rows are exempt: their whole meaning
 * is that nothing has been read.
 */
export function candidatesWithAVerdictButNoLicenceSentence(
  candidates: readonly RateSourceCandidate[] = RATE_SOURCE_CANDIDATES,
): readonly string[] {
  return candidates
    .filter((c) => c.licence !== 'NOT_ESTABLISHED' && !c.licenceNote?.trim())
    .map((c) => c.database);
}

/**
 * ⛔ EVERY SHIPPED BOOK. **EMPTY, DELIBERATELY.** See the file header: no
 * candidate has a read licence, so no rate may ship. The MECHANISM is complete
 * and exercised by tests with injected books; what is missing is a legal
 * clearance, and that is a founder decision rather than a coding task.
 */
export const REGIONAL_RATE_BOOKS: readonly RegionalRateBook[] = Object.freeze([]);

/** Cite THIS, never a number written in prose. */
export const SHIPPED_REGIONAL_RATE_COUNT: number =
  REGIONAL_RATE_BOOKS.reduce((n, b) => n + b.rates.length, 0);

/**
 * ⛔ THE GATE THAT MAKES THE HEADER TRUE RATHER THAN ASPIRATIONAL. Returns every
 * shipped rate whose licence has not been cleared. A non-empty result means this
 * repo is redistributing something nobody established it may.
 */
export function ratesShippedWithoutClearedLicence(
  books: readonly RegionalRateBook[] = REGIONAL_RATE_BOOKS,
): readonly string[] {
  const bad: string[] = [];
  for (const b of books) {
    for (const r of b.rates) {
      if (r.provenance.licence !== 'CLEARED_FOR_REDISTRIBUTION') {
        bad.push(`${b.bookId}/${r.lineCodePrefix}`);
      }
    }
  }
  return bad;
}

// ── The binding, and the ladder ───────────────────────────────────────────────

/**
 * What the caller knows about WHERE the project is. Built at the composition
 * surface from the ONE existing resolver; consumed here as plain strings.
 * Structurally identical to `HabitabilityBinding` on purpose — one shape for
 * "where is this?" across the product, not two.
 */
export interface CostJurisdictionBinding {
  readonly jurisdictionId: string | null;
  readonly countryCode: string | null;
  readonly regionKey: string | null;
  /** Carried so a refusal can say WHICH of the three ways geography failed. */
  readonly resolution: 'resolved' | 'none' | 'ambiguous' | 'not-asked';
}

export type RateMatchTier = 'jurisdiction' | 'region' | 'country' | 'none';

export interface ResolvedRateBooks {
  readonly tier: RateMatchTier;
  readonly books: readonly RegionalRateBook[];
  /**
   * The sentence that MUST accompany any estimate this resolution produces.
   * Generated here rather than in the UI, so a second surface cannot render an
   * estimate without saying where it came from — or that it came from nowhere.
   */
  readonly statement: string;
}

const norm = (s: string | null | undefined): string | null => {
  if (typeof s !== 'string') return null;
  const t = s.trim().toLowerCase();
  return t.length > 0 ? t : null;
};

/**
 * The narrow, book-specific form of one ladder rung.
 *
 * ⚠ SUPERSEDED IN THIS MODULE 2026-08-23 (lane RATE53) by the generic
 * {@link walkJurisdictionLadder}, which `resolveRegionalRates()` now calls so
 * that the per-line and building-level paths cannot drift apart. It is KEPT and
 * EXPORTED rather than removed: it is the single-rung primitive, it is exact,
 * and a caller that wants "which books claim THIS key" without walking a ladder
 * should have it rather than re-writing the `.toLowerCase()` comparison a third
 * time. (Exported also because `noUnusedLocals` is on, and the founder's
 * standing rule is that nothing is deleted.)
 */
export function booksForKey(key: string, all: readonly RegionalRateBook[]): RegionalRateBook[] {
  return all.filter((b) => b.jurisdictionKeys.some((k) => k.toLowerCase() === key));
}

/** Anything keyed to a set of registered jurisdiction ids. */
export interface JurisdictionKeyed {
  readonly jurisdictionKeys: readonly string[];
}

/**
 * ⭐ THE ONE LADDER, finest first: jurisdiction → region → country. Extracted
 * 2026-08-23 (lane RATE53) when `RegionalBuildingCost.ts` needed the identical
 * walk over a DIFFERENT payload.
 *
 * It is generic rather than duplicated for exactly the reason
 * `resolveCostJurisdictionAt` refuses to mint a second geography resolver: two
 * implementations of "which rung claims this parcel?" is how two answers to
 * "where is this?" start disagreeing (C68 §5.d). `resolveRegionalRates()` below
 * and `resolveBuildingCostModels()` next door now walk the same code.
 *
 * ⛔ NO INTERPOLATION AND NO FALLTHROUGH TO A NEIGHBOUR. A rung with no match is
 * SKIPPED, not approximated, and exhausting all three returns `null` — which the
 * callers turn into a refusal with a stated reason.
 *
 * Returns the tier that matched, the normalised key it matched on (so the
 * caller's sentence can name it), and every entry claiming that key.
 */
export function walkJurisdictionLadder<T extends JurisdictionKeyed>(
  binding: CostJurisdictionBinding,
  all: readonly T[],
): { tier: RateMatchTier; key: string; matches: readonly T[] } | null {
  const rungs: Array<[RateMatchTier, string | null]> = [
    ['jurisdiction', norm(binding.jurisdictionId)],
    ['region', norm(binding.regionKey)],
    ['country', norm(binding.countryCode)],
  ];
  for (const [tier, key] of rungs) {
    if (!key) continue;
    const matches = all.filter((m) => m.jurisdictionKeys.some((k) => k.toLowerCase() === key));
    if (matches.length === 0) continue;
    return { tier, key, matches };
  }
  return null;
}

/**
 * The ladder, finest first: jurisdiction → region → country → NONE.
 *
 * ⛔ THERE IS NO INTERPOLATION ON THIS PATH. A country nothing covers does NOT
 * get a neighbour's rates, an average, or "a similar market". It gets `'none'`
 * and a sentence saying so — which is the same rule the habitability ladder
 * runs, for a stronger reason: a wrong minimum is discovered at planning, and a
 * wrong rate is discovered at tender by the person who lost money on it.
 */
export function resolveRegionalRates(
  binding: CostJurisdictionBinding | null | undefined,
  all: readonly RegionalRateBook[] = REGIONAL_RATE_BOOKS,
): ResolvedRateBooks {
  const none = (why: string): ResolvedRateBooks => ({ tier: 'none', books: [], statement: why });

  if (all.length === 0) {
    /* ⚠ REWRITTEN 2026-08-23 (lane RATE53, L-9101). This sentence used to say
       "PRYZM ships NO regional rates ... or has a licence nobody has read". The
       licences HAVE now been read, and the per-line half is still empty — for a
       named reason rather than an open question. The building-level half is NOT
       empty, and this sentence must not imply it is. */
    return none(
      'PRYZM ships no PER-LINE regional rates — no rate per m² of plaster, per metre of handrail. '
      + 'The licences were read: BEDEC (ITeC) is a per-seat access subscription that grants no '
      + 'redistribution, and SPON’S and RSMeans are commercial publications. No per-trade price base '
      + 'covering Catalonia has a licence permitting redistribution, so every line below is priced only '
      + 'by a rate you type or import. ⭐ A BUILDING-LEVEL estimate is a different thing and is shown '
      + 'separately above where one is published for your jurisdiction.',
    );
  }
  if (!binding || binding.resolution === 'not-asked') {
    return none('No parcel location has been set, so no region can be resolved and no estimate is offered.');
  }
  if (binding.resolution === 'ambiguous') {
    return none(
      'Two jurisdiction registrations claim this parcel and PRYZM will not pick between them. '
      + 'No estimate is offered — a rate under the wrong regional market is worse than none.',
    );
  }
  /* ⭐ ONE LADDER, shared with resolveBuildingCostModels(). See
     walkJurisdictionLadder(). `booksForKey` is retained above because it is the
     narrow, non-generic form this module's own tests exercise. */
  const hit = walkJurisdictionLadder(binding, all);
  if (hit) {
    const books = hit.matches;
    return {
      tier: hit.tier,
      books,
      statement:
        `Estimates below come from ${books.map((b) => `${b.displayName} (${b.bookId})`).join(', ')}, `
        + `matched at the ${hit.tier} level for "${hit.key}". They are ESTIMATES: they are NOT in the priced `
        + 'total, they are replaced the moment you type a rate on that line, and each carries its own '
        + 'database, edition and price date.',
    };
  }
  return none(
    `No rate book covers this location (${binding.jurisdictionId ?? binding.countryCode ?? 'unknown'}). `
    + 'PRYZM does NOT substitute a neighbouring region’s prices — a rate from the wrong market is '
    + 'a wrong number, not an approximate one.',
  );
}

/**
 * The published rate that applies to one take-off line, by LONGEST matching
 * prefix. `null` when nothing covers it — which is a real answer and is counted.
 *
 * ⛔ A UNIT MISMATCH IS A REFUSAL, NOT A CONVERSION, exactly as it is for a
 * user-typed rate: a €/m² figure against an `ud` quantity is a different number,
 * not an approximate one.
 */
export function regionalRateForLine(
  line: TakeoffLine,
  resolved: ResolvedRateBooks,
): { rate: RegionalRate; book: RegionalRateBook } | null {
  let best: { rate: RegionalRate; book: RegionalRateBook } | null = null;
  for (const book of resolved.books) {
    for (const r of book.rates) {
      if (!line.code.startsWith(r.lineCodePrefix)) continue;
      if (r.unit !== line.unit) continue;
      if (!Number.isFinite(r.rate) || r.rate < 0) continue;
      if (best === null || r.lineCodePrefix.length > best.rate.lineCodePrefix.length) {
        best = { rate: r, book };
      }
    }
  }
  return best;
}
