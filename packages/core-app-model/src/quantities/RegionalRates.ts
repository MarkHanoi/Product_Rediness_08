/**
 * RegionalRates — 5D. The MECHANISM for a region-keyed cost estimate, and the
 * zero numbers it ships.
 *
 * Layer:    L2 — packages/core-app-model
 * Contract: C66 §1.1 (a price that has not been sourced is a CLAIM),
 *           C100 §5 by analogy (a miss is a miss, never a substitute),
 *           C03 (pure read model; no I/O, no clock in any exported function).
 * ADR:      ADR-0350 §5D, AMENDED by ADR-0353 §2 (this module).
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
 * ⛔ WHAT THIS FILE SHIPS: ZERO RATES. AND THAT IS THE FINDING, NOT A SHORTFALL
 * ═════════════════════════════════════════════════════════════════════════════
 * `REGIONAL_RATE_BOOKS` is EMPTY. Every construction price database this product
 * would want is LICENSED, and PRYZM redistributes none of them — the same reason
 * `CarbonModel` ships twenty cited factors and ~309 honest blanks rather than a
 * complete-looking table.
 *
 * The lawful answer was established by reading, not assumed:
 *
 *   • **BEDEC (ITeC)** — Institut de Tecnologia de la Construcció de Catalunya.
 *     Consultable; its bank is ITeC's own product. Redistribution inside a
 *     commercial SaaS is a LICENCE QUESTION THIS REPO HAS NOT ANSWERED.
 *   • **SPON'S Price Books** (Aecom / Taylor & Francis) and **RSMeans**
 *     (Gordian) — straightforwardly commercial publications. **NO.**
 *   • **Public-administration price bases** (e.g. a Banco de Precios published by
 *     a regional government) are the ONLY candidates that could plausibly carry
 *     reuse terms permitting redistribution — and *"plausibly"* is not a
 *     determination. Nobody in this lane opened a licence text.
 *
 * ⛔ THEREFORE NO NUMBER IS SEEDED, AND `SHIPPED_REGIONAL_RATE_COUNT` IS 0.
 * A €/m² invented here would be quoted in a tender. See
 * {@link RATE_SOURCE_CANDIDATES}: each candidate is named with its licence
 * status **NOT_ESTABLISHED** and with WHO must establish it — the same shape
 * `MaterialCarbonFacts.verification` uses, for the same reason. *Cited* is not
 * *checked*, and *"probably open"* is not *cleared*.
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
 * A price base PRYZM could one day carry, and the state of the ONLY question
 * that decides whether it may: **has anyone read the licence?**
 *
 * ⛔ This is a LEDGER OF UNANSWERED QUESTIONS, not a roadmap of "coming soon".
 * Every row is `NOT_ESTABLISHED` because no licence text was opened in the lane
 * that wrote this file, and saying otherwise would be the same class of claim as
 * an invented rate — a legal claim about somebody else's property.
 */
export interface RateSourceCandidate {
  readonly database: string;
  readonly publisher: string;
  readonly geography: string;
  readonly licence: RateLicenceStatus;
  /** WHO must establish it, and against WHAT. Never "TBD". */
  readonly whatMustBeEstablished: string;
}

export const RATE_SOURCE_CANDIDATES: readonly RateSourceCandidate[] = Object.freeze([
  {
    database: 'BEDEC',
    publisher: 'ITeC — Institut de Tecnologia de la Construcció de Catalunya',
    geography: 'Catalonia and, in its state-wide banks, Spain',
    licence: 'NOT_ESTABLISHED',
    whatMustBeEstablished:
      "ITeC's own terms of use for the BEDEC bank: whether a commercial SaaS may embed and "
      + 'redistribute rate rows, and under what attribution. Requires a licence text or a written '
      + 'answer from ITeC — a founder/legal decision, not an engineering one.',
  },
  {
    database: 'Bancos de precios de la construcción publicados por administraciones públicas',
    publisher: 'Regional governments (e.g. an autonomous community public-works department)',
    geography: 'Per autonomous community, Spain',
    licence: 'NOT_ESTABLISHED',
    whatMustBeEstablished:
      'Whether the specific bank is published under a public-sector reuse licence that permits '
      + 'commercial redistribution, and whether that licence names attribution or share-alike '
      + 'conditions. ⚠ THE MOST LIKELY CANDIDATE TO CLEAR — and "most likely" is not cleared. '
      + 'Read the licence page of the specific bank before any row is added.',
  },
  {
    database: "SPON'S Architects' and Builders' Price Book",
    publisher: 'Aecom / Taylor & Francis',
    geography: 'United Kingdom',
    licence: 'LICENSED_NOT_REDISTRIBUTABLE',
    whatMustBeEstablished:
      'Nothing — this is a commercial publication sold per copy. The user imports their own; '
      + 'PRYZM will not carry it.',
  },
  {
    database: 'RSMeans',
    publisher: 'Gordian',
    geography: 'United States and Canada',
    licence: 'LICENSED_NOT_REDISTRIBUTABLE',
    whatMustBeEstablished:
      'Nothing — a commercial subscription product. The user imports their own.',
  },
]);

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

function booksForKey(key: string, all: readonly RegionalRateBook[]): RegionalRateBook[] {
  return all.filter((b) => b.jurisdictionKeys.some((k) => k.toLowerCase() === key));
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
    return none(
      'PRYZM ships NO regional rates. Every construction price base it could carry is licensed '
      + '(BEDEC/ITeC, SPON’S, RSMeans) or has a licence nobody has read, so none is redistributed. '
      + 'The mechanism to hold one is built and a rate book can be imported; what is missing is a '
      + 'legal clearance, not a feature. Until then every price on this surface is one you typed '
      + 'or imported.',
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
  const rungs: Array<[RateMatchTier, string | null]> = [
    ['jurisdiction', norm(binding.jurisdictionId)],
    ['region', norm(binding.regionKey)],
    ['country', norm(binding.countryCode)],
  ];
  for (const [tier, key] of rungs) {
    if (!key) continue;
    const books = booksForKey(key, all);
    if (books.length === 0) continue;
    return {
      tier,
      books,
      statement:
        `Estimates below come from ${books.map((b) => `${b.displayName} (${b.bookId})`).join(', ')}, `
        + `matched at the ${tier} level for "${key}". They are ESTIMATES: they are NOT in the priced `
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
