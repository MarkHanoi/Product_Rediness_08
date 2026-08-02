// §AMB-CORPUS-GATE (L-678) — THE AUTHORISATION ROUTE FOR THE 36 AMB MUNICIPALITIES.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT WAS MISSING, AND IT WAS NOT DATA
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `ambRefosMunicipalities.ts` (2026-08-02) unbound the Barcelona hardcodes: the AMB Refós service
// publishes qualification + volumetric polygons for **36 municipalities** keyed on `CODI_INE`, and
// PRYZM can now READ all 36. A cold, seeded, 3 000-parcel-per-municipality probe then MEASURED
// every one of them (`tools/cold-start-probe/out/task5-amb-all-municipalities.json`, seed 20260802,
// known-answer control PASS): **36 municipalities `proven`, exactly ONE `published`.**
//
// The thirty-five that do not publish are not blocked on measurement, and they are not blocked on
// a fetch. They are blocked on **AUTHORISATION**. Thirty-one of them presented NO jurisdiction id
// to `envelopePublicationAuthorisation()` at all, so the fail-closed default answered
// `unknown-jurisdiction` — *"nobody has assessed this place"* — about municipalities that had just
// been measured parcel by parcel.
//
// ⛔ THAT CONFLATION IS THE §CONTEXT-DATA-HONESTY COLLAPSE (L-422/457/467/469) AT THE GATE SEAM.
// `gate-shut` and `unknown-jurisdiction` are DIFFERENT PRODUCT STATES and they carry different
// obligations:
//   • `gate-shut`            — assessed; a human signature is what is outstanding.
//   • `unknown-jurisdiction` — unassessed; MEASUREMENT is what is outstanding.
// Reporting the first as the second understates what PRYZM knows, and it hides the fact that the
// only remaining step is a signature. This module makes the 36 reachable THROUGH the gate. It does
// **not** open the gate, and nothing in it may be edited to open one.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// §GATE-SHAPE — THE GATE KEYS ON THE **ORDINANCE CORPUS**, WITH AN ENUMERATED MEMBERSHIP.
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The choice was between a gate per MUNICIPALITY (36 constants, 36 signatures) and a gate per
// ORDINANCE CORPUS (one constant per body of text a human actually reads). **The corpus is the
// unit, and the precedent already exists in this package**: `BCN_REFOS_OV_CERTIFIED` / SIG-3
// certifies a DATASET VINTAGE over the whole AMB Refós service — a corpus — not a city. Under that
// precedent, extending a corpus gate to another municipality is a SCOPING CHANGE, not a new legal
// instrument, and demanding 27 separate signatures for one 1976 document would be ceremony rather
// than diligence.
//
// ⚠⚠ BUT THE MEMBERSHIP IS ENUMERATED, PER MUNICIPALITY, AND THAT IS NOT A REDUNDANCY. Signing a
// corpus answers *"is this transcription faithful?"*. It does NOT answer *"does this corpus govern,
// unmodified, on THAT municipality's land?"* — which is a per-municipality legal fact, and one this
// repo has already measured itself to be UNABLE to establish (§THE-CEILING below: the deviation
// list is non-official, non-exhaustive and stale by sixteen years). So:
//
//   • the VALUE of every member's gate is read from ONE corpus constant — opening the corpus is a
//     one-line, human-signed act, exactly as intended;
//   • the MEMBERSHIP is a literal list of 36 rows, each carrying its own measured evidence, so a
//     **37th municipality nobody assessed is absent from this file, presents no id, and refuses
//     `unknown-jurisdiction`.** Fail-closed survives the scoping change. That is the property a
//     blanket `'Catalunya' → true` would have destroyed, and it is why no such entry exists.
//
// ⚠ TWO CORPORA, BECAUSE THE PROBE MEASURED TWO — this is not a taxonomy invented here:
//   • **27 municipalities carry `PGM='S'`**, uniform within every one of them, **0 mixed**. Their
//     qualification polygons cite the metropolitan `num_pgm` normative roots. Corpus =
//     `'pgm-metropolitan'`.
//     ⭐ 27 is also the size of the pre-2011 *Entitat Municipal Metropolitana* that PGM Art. 1.1
//     scopes the plan to (`AMB_PGM_SCOPE_CAVEATS`, third caveat). Two independent readings — a
//     live attribute census and a 1974 decree quoted in the 2010 compendium — landing on the same
//     27 is the strongest corroboration available that AMB membership ≠ PGM governance.
//   • **9 carry `PGM='N'`** and route through `QUAL_MUNI` instead (24.92–77.57 % of sampled parcels
//     in 8 of the 9; Badia del Vallès is 0.00 % with 95.45 % missing data). PRYZM holds NO corpus
//     for these — their governing instrument is each municipality's own POUM/NNSS. Corpus =
//     `'no-held-corpus'`.
//
// ⚠ FIVE OF THE 36 ARE DELIBERATELY **NOT** ROUTED THROUGH EITHER NEW GATE, and each exclusion is a
// measured decision rather than an oversight (`AMB_ENVELOPE_GATE_ROUTING` states it per row):
//   • **Barcelona (08019)** — `ungated-by-record`. It publishes today. Adding it to a gate map
//     would REGRESS the only published city, because `envelopePublicationAuthorisation()` consults
//     the gate table BEFORE the ungated allowlist. Barcelona must stay byte-identical.
//   • **Badalona (08015), Cornellà (08073), L'Hospitalet (08101), Sant Boi (08200)** — each already
//     owns a municipal gate (`*_ENVELOPE_VERIFIED`). Re-keying them here would create a second
//     statement of one signature, which is the drift this package keeps closing. Badalona in
//     particular is the case that PROVES the corpus is not uniform: it rewrote Arts. 238, 242, 320,
//     323, 327, 328, 330, 342, 343 and 363 for its own territory (`esBadalona.ts`), so a
//     metropolitan-corpus signature must never reach its land.
//   ⇒ 36 − 1 − 4 = **31 new gate entries**, of which **22 are `'pgm-metropolitan'`** and **9 are
//     `'no-held-corpus'`**. Those five counts (36 · 27 · 26 · 25 · 22) answer five different
//     questions and are NOT interchangeable — 26 = 27 − Barcelona, 25 = 27 − {Barcelona, Badalona}.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// §THE-CEILING — WHAT A SIGNATURE ON `AMB_PGM_NNUU_ENVELOPE_VERIFIED` WOULD **NOT** BUY
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Under ADR-0293 an envelope published here is an **OPEN TOP WITH A STATED REASON**, never a closed
// box. Four ceilings are measured and stand regardless of any signature; they are carried as data
// in `AMB_CORPUS_CEILINGS` so a refusal card can quote them rather than paraphrase them.
//
//   1. **DELEGATION.** Where a *pla derivat / pla parcial* governs and PRYZM does not hold it, the
//      correct output is a CITED REFUSAL, not an envelope. Measured `refuse_delegated`: Barcelona
//      **59.53 %**, Molins de Rei 57.60 %, El Papiol 49.89 %, Cerdanyola 46.77 %, Santa Coloma de
//      Gramenet 32.23 %, Sant Climent de Llobregat **8.29 %**. It is per-municipality and it spans
//      an order of magnitude — a corpus signature does not touch it.
//   2. **THE DEVIATION LIST IS NOT A CLEAN BILL.** The AMB compendium's footnotes name only
//      **Badalona and Barcelona — 2 of 27** — as rewriting Arts. 320/327/328, and the compendium
//      states of itself that it is *non-official*, *non-exhaustive* («NO HI FIGUREN TOTES LES
//      MODIFICACIONS») and consolidated only to **31-12-2009**. `esAmbPgmScope.ts` already names the
//      resulting verdict `'metropolitan-no-recorded-modification'`, which is NOT "verified
//      unmodified". Sixteen years of *modificacions puntuals* are simply not in evidence.
//   3. **CONSTRAINTS ARE ABSENT — INCLUDING FOR BARCELONA, WHICH IS PUBLISHED.** No heritage
//      (BCIN/BCIL), no airport servitude (El Prat's *servituds aeronàutiques* reach across
//      Viladecans, Gavà, Sant Boi and Castelldefels), no flood (ACA), no environmental overlay is
//      held for ANY of the 36. Every envelope PRYZM produces in the AMB is an UPPER BOUND WITH A
//      MISSING CEILING. This is the one ceiling that is not specific to the unpublished 35.
//   4. **WHETHER BARCELONA-SCOPED MPGM ARTICLES GOVERN IN THE OTHER 26 WAS NOT ANSWERED.** The
//      probe established only that Barcelona's REGISTERED CLAUS RESOLVE on their land. The ladder
//      (`envelope_PGM_PACK`) carries 42–65 % of the envelope in Castelldefels (64.70 %), Pallejà
//      (51.25 %) and Sant Just Desvern (51.25 %), and that share rests on an unanswered LEGAL
//      question, not on a measurement gap. ⚠ The route mix INVERTS across the 27: OV > ladder in
//      **17**, ladder > OV in **10** — so neither route can be called "the" AMB path.
//
// ⚠ A FIFTH, SMALLER LIMIT, kept separate because its two halves have different owners. `PLANTES`
// (the OV storey count) is **100 % populated, 80.33 % parseable** over 22 525 polygons. The 19.67 %
// remainder is **0.68 % PARSER-GAP** (`B+3+G`, `B+6+2A`, `PX+4+G` — Engineering, recoverable) and
// **18.99 % NON-STOREY TOKEN** (`ED`, `Cat`, `Alç` — Legal/External: the publisher's legend does not
// say what they mean). **Refusing the non-storey 18.99 % is CORRECT**, not a coverage loss; one
// hypothesis for `ED` was tested and REFUTED, so its meaning remains unestablished.
//
// PURITY: L2-pure (C58 §1.1/§1.9) — frozen data + total pure lookups. No I/O, no clock, no RNG.
// It carries NO dimension, NO height, NO setback, and it authorises nothing.
//
// Strategic context — ADR-0283 (evidence-bounded publication), ADR-0293 (open top with a stated
// reason), C58 §1.4/§1.5/§1.13, C60 §2, C63, L-449, L-665, L-677, `esAmbPgmScope.ts`,
// `providers/ambRefosMunicipalities.ts`, `tools/cold-start-probe/out/`.

import { trace } from '@opentelemetry/api';
import type { EnvelopeRefusal } from '@pryzm/schemas';
import { ineCodeLiteral, type IneCode } from '../providers/esMunicipalCode.js';

const tracer = trace.getTracer('pryzm.zoning.es.amb');

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE TWO CORPUS GATES. ⛔ BOTH SHUT. FLIPPING EITHER IS A LEGAL ACT, NOT A CODE CHANGE (L-449).
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ⛔⛔ THE METROPOLITAN PGM-1976 CORPUS GATE — **SHUT, AND UNSIGNED**.
 *
 * Governs the **22** AMB municipalities measured `PGM='S'` that do not already own a municipal gate
 * (`AMB_PGM_CORPUS_JURISDICTIONS`). Flipping it to `true` is the ONE line that opens all 22 — which
 * is the design: a human reads ONE document (the PGM NNUU, via the MMAMB compendium) and signs ONCE,
 * exactly as SIG-3 certified ONE dataset vintage across the whole Refós service.
 *
 * ⚠⚠ WHAT A SIGNATURE HERE WOULD HAVE TO ASSERT, and what it CANNOT assert, is §THE-CEILING in the
 * header. In particular it would NOT establish that the corpus stands unmodified in any of the 22:
 * the only evidence available for that is a compendium that declares itself non-official,
 * non-exhaustive and stale to 31-12-2009. It also would NOT supply the missing heritage / airport /
 * flood / environmental constraints, so every resulting envelope stays an OPEN TOP under ADR-0293.
 *
 * ⛔ DO NOT FLIP THIS TO MAKE A DEMO, A TEST OR A COVERAGE NUMBER WORK. No signature is recorded in
 * `l449CertificationGates.ts` for it (`signature: null`), so opening it without one turns
 * `§NO-UNSIGNED-OPEN-GATE` RED — deliberately, and that red is the feature.
 *
 * (Typed `boolean`, not the literal `false`, so an `if (…)` compute branch is not narrowed away as
 * dead code while the gate is closed.)
 */
export const AMB_PGM_NNUU_ENVELOPE_VERIFIED: boolean = false;

/**
 * ⛔ THE "NO CORPUS HELD" GATE — **SHUT, AND NOT SIGNABLE TODAY**.
 *
 * Governs the **9** AMB municipalities measured `PGM='N'`. It is the THIRD KIND OF GATE this
 * package already recognises (see València in `envelopeAuthorisation.ts`): not awaiting a signature
 * on a transcription PRYZM holds, but registered so the classifier CANNOT FAIL OPEN on land whose
 * governing instrument PRYZM does not possess at all.
 *
 * These nine are governed by their own municipal POUM/NNSS. The AMB Refós publishes their
 * qualification polygons — `QUAL_MUNI` carries 24.92–77.57 % of sampled parcels in 8 of the 9 — but
 * a qualification polygon is a MAP, not an ordinance. There is no text to sign.
 *
 * ⛔ FLIPPING THIS AUTHORISES NOTHING AND WOULD ONLY REMOVE THE INTERLOCK that stops a later author
 * packing a guessed parameter and shipping it (the L-616 mechanism-A hazard, and the same reason
 * `VALENCIA_ENVELOPE_VERIFIED` exists while `zones` is empty). The way to open these nine is to
 * ACQUIRE NINE PLANS, then register nine municipal gates — not to touch this constant.
 */
export const AMB_NO_HELD_CORPUS_ENVELOPE_VERIFIED: boolean = false;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE ROUTING TABLE
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Which body of text an AMB municipality's envelope would be interpreted FROM. */
export type AmbCorpusKey =
    /** The metropolitan PGM-1976 Normes Urbanístiques. Measured `PGM='S'`, uniform, 0 mixed. */
    | 'pgm-metropolitan'
    /** Measured `PGM='N'` — routes through `QUAL_MUNI`; PRYZM holds no governing text. */
    | 'no-held-corpus';

/**
 * HOW this municipality reaches `envelopePublicationAuthorisation()`. Stated per row so the five
 * non-corpus routings are declarations rather than omissions — an omission is invisible, and this
 * file's whole job is to make "assessed but shut" distinguishable from "never looked at".
 */
export type AmbGateRoute =
    /** Gated by `AMB_PGM_NNUU_ENVELOPE_VERIFIED` (22 municipalities). SHUT. */
    | 'amb-pgm-corpus'
    /** Gated by `AMB_NO_HELD_CORPUS_ENVELOPE_VERIFIED` (9 municipalities). SHUT. */
    | 'no-held-corpus'
    /** Already owns a `*_ENVELOPE_VERIFIED` municipal gate — NOT re-keyed here (4). SHUT. */
    | 'own-municipal-gate'
    /** Barcelona: `UNGATED_AUTHORISED_JURISDICTIONS`. The ONE that publishes. Untouched (1). */
    | 'ungated-by-record';

/**
 * What the 2026-08-02 cold-start probe measured for one municipality, carried so a refusal can
 * QUOTE the evidence instead of gesturing at it.
 *
 * ⚠ Percentages are of the SAMPLED parcel population (3 000 per municipality, uniform without
 * replacement over the full Catastro INSPIRE CP population, seed 20260802), not of land area. A
 * municipality with no computed coverage carries a `0` only where the probe measured a zero — this
 * table never substitutes a zero for a missing measurement (`a zero would read as "measured, and it
 * is nothing"`, the probe's own rule).
 */
export interface AmbMeasuredCoverage {
    /** Share of sampled parcels for which the pipeline produced ANY envelope. */
    readonly envelopePct: number;
    /** …via the OV (volumetric-ordering) route — a footprint READ from the Refós. */
    readonly ovPct: number;
    /** …via the PGM rule-pack ladder — Barcelona's registered claus resolving on this land. */
    readonly packPct: number;
    /** …via `QUAL_MUNI` — 0.00 in all 27 `PGM='S'` municipalities, by measurement. */
    readonly qualMuniPct: number;
    /** Share REFUSED because a *pla derivat/parcial* governs and PRYZM does not hold it. */
    readonly delegatedPct: number;
}

/** One AMB municipality's authorisation routing, with the evidence behind it. */
export interface AmbCorpusMember {
    readonly ineCode: IneCode;
    /** `NOMMUNI` exactly as the AMB service spells it — the same string as `AMB_REFOS_MUNICIPALITIES`. */
    readonly nameInSource: string;
    /**
     * The `<cc>-<INE>-<slug>` id this municipality presents to the gate.
     *
     * ⚠ IT IS AN AUTHORISATION IDENTITY, NOT A ROUTING REGISTRATION. `registry.ts` `REGISTRATIONS`
     * still holds only six Catalan entries, and `AmbMunicipality.jurisdictionId` (which means "a
     * `REGISTRATIONS` row exists") is deliberately left `null` for the 31 — widening that field
     * would weaken the guard that keeps unregistered municipalities out of the PACK path.
     * `ambCorpusIdCarriesItsIne` pins the id to its INE so the two cannot drift.
     */
    readonly jurisdictionId: string;
    readonly corpus: AmbCorpusKey;
    readonly route: AmbGateRoute;
    readonly measured: AmbMeasuredCoverage;
    /**
     * Why this row is routed the way it is — REQUIRED, and required to be non-trivial. A routing
     * decision with no stated reason is exactly the silent absorption `UNGATED_AUTHORISED_JURISDICTIONS`
     * was given reason strings to prevent.
     */
    readonly routeReason: string;
}

function member(
    ine: string,
    nameInSource: string,
    jurisdictionId: string,
    corpus: AmbCorpusKey,
    route: AmbGateRoute,
    measured: AmbMeasuredCoverage,
    routeReason: string,
): AmbCorpusMember {
    return Object.freeze({
        ineCode: ineCodeLiteral(ine),
        nameInSource,
        jurisdictionId,
        corpus,
        route,
        measured: Object.freeze(measured),
        routeReason,
    });
}

/** Shorthand for the five measured percentages, in the probe's own field order. */
function m(
    envelopePct: number,
    ovPct: number,
    packPct: number,
    qualMuniPct: number,
    delegatedPct: number,
): AmbMeasuredCoverage {
    return { envelopePct, ovPct, packPct, qualMuniPct, delegatedPct };
}

const PGM_CORPUS_REASON =
    'Measured PGM=\'S\' (uniform, 0 mixed) on 2026-08-02: this municipality\'s qualification ' +
    'polygons cite the metropolitan `num_pgm` normative roots, so its envelope would be ' +
    'interpreted from the PGM-1976 Normes Urbanístiques — ONE corpus, ONE signature. The gate is ' +
    'SHUT until a human signs that corpus, and §THE-CEILING caps what such a signature could buy.';

const NO_CORPUS_REASON =
    'Measured PGM=\'N\' on 2026-08-02: the metropolitan plan does not govern here (PGM Art. 1.1 ' +
    'scopes it to the pre-2011 27-municipality Entitat Municipal Metropolitana). Parcels route ' +
    'through `QUAL_MUNI`, which is a MAP, not an ordinance — PRYZM holds no governing text for ' +
    'this municipality, so there is nothing to sign and the gate cannot be opened by signing.';

const OWN_GATE_REASON =
    'Already owns a municipal `*_ENVELOPE_VERIFIED` gate, registered in ENVELOPE_PUBLICATION_GATES ' +
    'in its own right. NOT re-keyed onto a corpus gate: two statements of one signature can drift, ' +
    'and this municipality is measured PGM=\'S\' but is separately known to have rewritten the ' +
    'metropolitan text for its own territory.';

/**
 * §AMB-CORPUS-ROUTING — **ALL 36** AMB Refós municipalities and how each reaches the gate.
 *
 * ⚠ ALL 36 ARE PRESENT ON PURPOSE, INCLUDING THE FIVE THIS FILE DOES NOT GATE. A table holding only
 * the 31 it acts on would make the other five invisible, and "not in the table" would once again be
 * indistinguishable from "not considered" — the very collapse this module exists to end.
 * `ambCorpusRoutingIsTotal` asserts this list is exactly `AMB_REFOS_MUNICIPALITIES` by INE.
 *
 * ⛔ ADDING A ROW IS AN ASSESSMENT CLAIM. A municipality absent from here presents no id, and
 * `envelopePublicationAuthorisation()` answers `unknown-jurisdiction`. That is the correct answer
 * for a 37th municipality nobody has measured, and it must stay reachable.
 *
 * Ordered by `CODI_INE`, matching `AMB_REFOS_MUNICIPALITIES`.
 * Measurements: `tools/cold-start-probe/out/task5-amb-all-municipalities.json` (seed 20260802).
 */
export const AMB_ENVELOPE_GATE_ROUTING: readonly AmbCorpusMember[] = Object.freeze([
    member('08015', 'Badalona', 'es-08015-badalona', 'pgm-metropolitan', 'own-municipal-gate',
        m(69.47, 55.43, 14.03, 0, 16.23),
        OWN_GATE_REASON + ' Badalona is the PROOF that the metropolitan corpus is not uniform: the ' +
        'compendium\'s own footnotes name it on Arts. 238, 242, 320, 323, 327, 328, 330, 342, 343 ' +
        'and 363, and it holds its own alçada reguladora tables for both 13a and 13b. A ' +
        'metropolitan-corpus signature must never reach this land (`esBadalona.ts`).'),
    member('08019', 'Barcelona', 'es-08019-barcelona', 'pgm-metropolitan', 'ungated-by-record',
        m(34.03, 6.7, 27.33, 0, 59.53),
        'The reference city and the ONLY one that publishes. It is authorised by record in ' +
        'UNGATED_AUTHORISED_JURISDICTIONS; its route-level gates are enforced at their own dispatch ' +
        'sites (BCN_REFOS_OV_CERTIFIED / SIG-3). ⛔ It is NOT added to any gate map here: ' +
        'envelopePublicationAuthorisation() consults the gate table BEFORE the ungated allowlist, so ' +
        'a gate entry would REGRESS the one published city. Its 59.53 % delegation is the single ' +
        'largest measured ceiling anywhere in the AMB, and it applies to a PUBLISHED city.'),
    member('08020', 'Begues', 'es-08020-begues', 'no-held-corpus', 'no-held-corpus',
        m(61.4, 8.83, 0, 52.57, 16.39), NO_CORPUS_REASON),
    member('08054', 'Castellbisbal', 'es-08054-castellbisbal', 'no-held-corpus', 'no-held-corpus',
        m(45.48, 6.5, 0, 38.98, 7.06), NO_CORPUS_REASON),
    member('08056', 'Castelldefels', 'es-08056-castelldefels', 'pgm-metropolitan', 'amb-pgm-corpus',
        m(73.7, 9, 64.7, 0, 14.8),
        PGM_CORPUS_REASON + ' ⚠ 64.70 % of its envelope comes from the PGM rule-pack LADDER — the ' +
        'highest ladder share of the 27 — and that share rests on the UNANSWERED legal question of ' +
        'whether Barcelona-scoped MPGM articles govern here.'),
    member('08068', 'Cervelló', 'es-08068-cervello', 'no-held-corpus', 'no-held-corpus',
        m(65.52, 4.44, 0, 61.08, 10.06), NO_CORPUS_REASON),
    member('08072', 'Corbera de Llobregat', 'es-08072-corbera-de-llobregat', 'no-held-corpus', 'no-held-corpus',
        m(81.67, 4.1, 0, 77.57, 0.5),
        NO_CORPUS_REASON + ' Its 77.57 % QUAL_MUNI share is the highest of the nine — a large ' +
        'measured coverage that PRYZM still may not publish, because coverage is not authority.'),
    member('08073', 'Cornellà de Llobregat', 'es-08073-cornella-de-llobregat', 'pgm-metropolitan', 'own-municipal-gate',
        m(64.37, 56.43, 7.94, 0, 14.06), OWN_GATE_REASON),
    member('08077', 'Esplugues de Llobregat', 'es-08077-esplugues-de-llobregat', 'pgm-metropolitan', 'amb-pgm-corpus',
        m(61.28, 39.87, 21.41, 0, 25.18), PGM_CORPUS_REASON),
    member('08089', 'Gavà', 'es-08089-gava', 'pgm-metropolitan', 'amb-pgm-corpus',
        m(42.8, 31.53, 11.27, 0, 33.5),
        PGM_CORPUS_REASON + ' ⚠ Under El Prat\'s aeronautical servitudes, which PRYZM does not ' +
        'hold — ceiling 3, and it binds height directly.'),
    member('08101', "L'Hospitalet de Llobregat", 'es-08101-hospitalet', 'pgm-metropolitan', 'own-municipal-gate',
        m(73.13, 59.73, 13.4, 0, 10.4), OWN_GATE_REASON),
    member('08123', 'Molins de Rei', 'es-08123-molins-de-rei', 'pgm-metropolitan', 'amb-pgm-corpus',
        m(32.19, 26.85, 5.34, 0, 57.6),
        PGM_CORPUS_REASON + ' ⚠ 57.60 % delegated — second only to Barcelona. Most of this ' +
        'municipality is governed by planning PRYZM does not hold, and a corpus signature does not ' +
        'change that; the correct output there stays a CITED REFUSAL.'),
    member('08125', 'Montcada i Reixac', 'es-08125-montcada-i-reixac', 'pgm-metropolitan', 'amb-pgm-corpus',
        m(31.71, 23.47, 8.24, 0, 27.96), PGM_CORPUS_REASON),
    member('08126', 'Montgat', 'es-08126-montgat', 'pgm-metropolitan', 'amb-pgm-corpus',
        m(35.67, 27.9, 7.77, 0, 29.5), PGM_CORPUS_REASON),
    member('08157', 'Pallejà', 'es-08157-palleja', 'pgm-metropolitan', 'amb-pgm-corpus',
        m(65.31, 14.07, 51.25, 0, 10.98),
        PGM_CORPUS_REASON + ' ⚠ 51.25 % ladder share — see Castelldefels; the same unanswered legal ' +
        'question carries most of this municipality\'s envelope.'),
    member('08158', 'El Papiol', 'es-08158-el-papiol', 'pgm-metropolitan', 'amb-pgm-corpus',
        m(25.54, 8.66, 16.88, 0, 49.89),
        PGM_CORPUS_REASON + ' ⚠ 49.89 % delegated against a 25.54 % envelope — the least ' +
        'answerable of the 22 on today\'s holdings.'),
    member('08169', 'El Prat de Llobregat', 'es-08169-el-prat-de-llobregat', 'pgm-metropolitan', 'amb-pgm-corpus',
        m(58.39, 43.89, 14.5, 0, 27.27),
        PGM_CORPUS_REASON + ' ⚠ Hosts the airport whose servitudes PRYZM does not hold — ceiling 3 ' +
        'is at its most binding here.'),
    member('08180', 'Ripollet', 'es-08180-ripollet', 'pgm-metropolitan', 'amb-pgm-corpus',
        m(54.62, 38.43, 16.19, 0, 33.33), PGM_CORPUS_REASON),
    member('08194', 'Sant Adrià de Besòs', 'es-08194-sant-adria-de-besos', 'pgm-metropolitan', 'amb-pgm-corpus',
        m(46.87, 43.94, 2.93, 0, 19.85), PGM_CORPUS_REASON),
    // ⚠ 08196 — a MEASURED INE/DGC COLLISION. INE 08196 = Sant Andreu de la Barca (this row).
    // DGC 08196 = Sant Andreu de Llavaneres, ~40 km away and NOT in the AMB. The id below carries
    // the INE value, and `ambCorpusIdCarriesItsIne` pins it. See `ES_MUNICIPAL_CODE_COLLISIONS`.
    member('08196', 'Sant Andreu de la Barca', 'es-08196-sant-andreu-de-la-barca', 'no-held-corpus', 'no-held-corpus',
        m(54.05, 18.45, 0, 35.6, 20.87), NO_CORPUS_REASON),
    member('08200', 'Sant Boi de Llobregat', 'es-08200-sant-boi', 'pgm-metropolitan', 'own-municipal-gate',
        m(46.63, 33.33, 13.3, 0, 38.8), OWN_GATE_REASON),
    member('08204', 'Sant Climent de Llobregat', 'es-08204-sant-climent-de-llobregat', 'pgm-metropolitan', 'amb-pgm-corpus',
        m(43.88, 38.01, 5.87, 0, 8.29),
        PGM_CORPUS_REASON + ' ⚠ 8.29 % delegated — the LOWEST of the AMB, against Barcelona\'s ' +
        '59.53 %. Delegation is per-municipality and spans an order of magnitude, which is why a ' +
        'corpus signature can never be read as a coverage promise.'),
    member('08205', 'Sant Cugat del Vallès', 'es-08205-sant-cugat-del-valles', 'pgm-metropolitan', 'amb-pgm-corpus',
        m(49.7, 7.63, 42.07, 0, 35.97),
        PGM_CORPUS_REASON + ' ⚠ 42.07 % ladder share, and Sant Cugat is one of the two ' +
        'municipalities recorded as having REWRITTEN the clau-18 volumetric article ' +
        '(`ambVolumetria18PackFor` serves no pack outside Barcelona for exactly this reason).'),
    member('08211', 'Sant Feliu de Llobregat', 'es-08211-sant-feliu-de-llobregat', 'pgm-metropolitan', 'amb-pgm-corpus',
        m(49.13, 35.02, 14.11, 0, 34), PGM_CORPUS_REASON),
    member('08217', 'Sant Joan Despí', 'es-08217-sant-joan-despi', 'pgm-metropolitan', 'amb-pgm-corpus',
        m(34.1, 24.51, 9.6, 0, 31.29), PGM_CORPUS_REASON),
    member('08221', 'Sant Just Desvern', 'es-08221-sant-just-desvern', 'pgm-metropolitan', 'amb-pgm-corpus',
        m(62.69, 11.44, 51.25, 0, 23.52),
        PGM_CORPUS_REASON + ' ⚠ 51.25 % ladder share — see Castelldefels and Pallejà.'),
    member('08244', 'Santa Coloma de Cervelló', 'es-08244-santa-coloma-de-cervello', 'pgm-metropolitan', 'amb-pgm-corpus',
        m(33.3, 3.22, 30.08, 0, 39.02), PGM_CORPUS_REASON),
    member('08245', 'Santa Coloma de Gramenet', 'es-08245-santa-coloma-de-gramenet', 'pgm-metropolitan', 'amb-pgm-corpus',
        m(59.03, 55.93, 3.1, 0, 32.23), PGM_CORPUS_REASON),
    member('08252', 'Barberà del Vallès', 'es-08252-barbera-del-valles', 'no-held-corpus', 'no-held-corpus',
        m(68.55, 22.76, 0, 45.79, 0.94), NO_CORPUS_REASON),
    member('08263', 'Sant Vicenç dels Horts', 'es-08263-sant-vicenc-dels-horts', 'pgm-metropolitan', 'amb-pgm-corpus',
        m(42.33, 11.1, 31.23, 0, 38.43), PGM_CORPUS_REASON),
    member('08266', 'Cerdanyola del Vallès', 'es-08266-cerdanyola-del-valles', 'pgm-metropolitan', 'amb-pgm-corpus',
        m(38.23, 11.4, 26.83, 0, 46.77),
        PGM_CORPUS_REASON + ' ⚠ 46.77 % delegated, and Cerdanyola is the second municipality ' +
        'recorded as having rewritten the clau-18 volumetric article.'),
    member('08282', 'Tiana', 'es-08282-tiana', 'pgm-metropolitan', 'amb-pgm-corpus',
        m(36.56, 8.92, 27.64, 0, 26.53), PGM_CORPUS_REASON),
    member('08289', 'Torrelles de Llobregat', 'es-08289-torrelles-de-llobregat', 'no-held-corpus', 'no-held-corpus',
        m(67.98, 7.17, 0, 60.81, 1.24), NO_CORPUS_REASON),
    member('08301', 'Viladecans', 'es-08301-viladecans', 'pgm-metropolitan', 'amb-pgm-corpus',
        m(56.73, 31.73, 25, 0, 25.13),
        PGM_CORPUS_REASON + ' ⚠ Under El Prat\'s aeronautical servitudes — ceiling 3.'),
    member('08904', 'Badia del Vallès', 'es-08904-badia-del-valles', 'no-held-corpus', 'no-held-corpus',
        m(0.41, 0.41, 0, 0, 3.72),
        NO_CORPUS_REASON + ' ⚠ THE OUTLIER, AND ITS ZERO IS MEASURED, NOT ASSUMED: 0.00 % ' +
        'QUAL_MUNI and 95.45 % of sampled parcels refused for MISSING DATA. Badia is a 1970s ' +
        'planned town whose fabric this pipeline barely reaches; it is `proven` in the sense that ' +
        'the measurement RAN, not in the sense that it found coverage.'),
    member('08905', 'La Palma de Cervelló', 'es-08905-la-palma-de-cervello', 'no-held-corpus', 'no-held-corpus',
        m(47.15, 22.22, 0, 24.92, 0), NO_CORPUS_REASON),
]);

/**
 * §THE-CEILING as data — the four limits that stand REGARDLESS of any signature, plus the fifth
 * (PLANTES) whose two halves have different owners.
 *
 * ⚠ Carried as strings so refusal copy QUOTES them. A paraphrase drifts; ADR-0293 requires the
 * reason for the open top to be STATED, and a stated reason has to be the same words every time.
 */
export const AMB_CORPUS_CEILINGS: readonly string[] = Object.freeze([
    'DELEGATION — where a *pla derivat / pla parcial* governs and PRYZM does not hold it, the ' +
        'correct output is a CITED REFUSAL, never an envelope. Measured (2026-08-02, 3 000 parcels ' +
        'per municipality): Barcelona 59.53 %, Molins de Rei 57.60 %, El Papiol 49.89 %, ' +
        'Cerdanyola 46.77 %, Santa Coloma de Gramenet 32.23 %, Sant Climent de Llobregat 8.29 %. ' +
        'It is per-municipality and spans an order of magnitude; a corpus signature does not move it.',
    'THE DEVIATION LIST IS NOT A CLEAN BILL — the AMB compendium footnotes name only Badalona and ' +
        'Barcelona (2 of 27) as rewriting Arts. 320/327/328, and the compendium states of itself ' +
        'that it is non-official, NOT exhaustive («NO HI FIGUREN TOTES LES MODIFICACIONS») and ' +
        'consolidated only to 31-12-2009. `metropolitan-no-recorded-modification` is therefore ' +
        'evidence of metropolitan force, NOT proof of it, and sixteen years of later modificacions ' +
        'puntuals are simply not in evidence.',
    'CONSTRAINTS ARE ABSENT — INCLUDING FOR BARCELONA, WHICH IS PUBLISHED. No heritage ' +
        '(BCIN/BCIL), no aeronautical servitude (El Prat\'s reach across Viladecans, Gavà, Sant ' +
        'Boi and Castelldefels), no flood (ACA) and no environmental overlay is held for ANY of the ' +
        '36. Every AMB envelope PRYZM produces is an UPPER BOUND WITH A MISSING CEILING — under ' +
        'ADR-0293 an OPEN TOP WITH A STATED REASON, never a closed box.',
    'WHETHER BARCELONA-SCOPED MPGM ARTICLES GOVERN IN THE OTHER 26 WAS NOT ANSWERED. The ' +
        'measurement established only that Barcelona\'s REGISTERED CLAUS RESOLVE on their land — a ' +
        'data fact, not a legal one. The PGM rule-pack ladder carries 42–65 % of the envelope in ' +
        'Castelldefels (64.70 %), Pallejà (51.25 %), Sant Just Desvern (51.25 %) and Sant Cugat ' +
        '(42.07 %), and that share rests on the unanswered question. ⚠ The route mix INVERTS across ' +
        'the 27 — OV > ladder in 17, ladder > OV in 10 — so neither route is "the" AMB path.',
    'PLANTES — 100 % populated, 80.33 % parseable over 22 525 OV polygons. The 19.67 % remainder ' +
        'is 0.68 % PARSER-GAP (`B+3+G`, `B+6+2A`, `PX+4+G` — Engineering, recoverable) and 18.99 % ' +
        'NON-STOREY TOKEN (`ED`, `Cat`, `Alç` — Legal/External: the publisher\'s legend does not say ' +
        'what they mean). ⛔ REFUSING THE 18.99 % IS CORRECT BEHAVIOUR, not a coverage loss. One ' +
        'hypothesis for `ED` was tested and REFUTED; its meaning remains unestablished.',
]);

/** The instrument every claim routed through the metropolitan corpus gate must cite. */
export const AMB_PGM_CORPUS_INSTRUMENT_REF =
    'PGM-1976 (Pla General Metropolità, aprovat definitivament 14-07-1976, BOP Barcelona ' +
    '19-07-1976), Normes Urbanístiques — the METROPOLITAN instrument, consulted via the MMAMB ' +
    '*Normativa Urbanística Metropolitana* compendium (December 2010, consolidated 31-12-2009), ' +
    'which is expressly non-official and expressly non-exhaustive. Zoning (clau) and volumetric ' +
    'ordering read from the AMB *Refós de Planejament* (`qualificacio_refos_3857`), the dataset ' +
    'vintage certified as SIG-3.';

// ── Derived index + the two id lists `envelopeAuthorisation.ts` consumes. ────────────────────────

const BY_INE: ReadonlyMap<string, AmbCorpusMember> = new Map(
    AMB_ENVELOPE_GATE_ROUTING.map((r) => [r.ineCode as string, r]),
);

function idsForRoute(route: AmbGateRoute): readonly string[] {
    return Object.freeze(
        AMB_ENVELOPE_GATE_ROUTING.filter((r) => r.route === route).map((r) => r.jurisdictionId),
    );
}

/**
 * The **22** jurisdiction ids gated by `AMB_PGM_NNUU_ENVELOPE_VERIFIED`.
 *
 * ⚠ DERIVED FROM `AMB_ENVELOPE_GATE_ROUTING`, never hand-listed — a second list is a second
 * statement that can drift from the rows carrying the evidence.
 */
export const AMB_PGM_CORPUS_JURISDICTIONS: readonly string[] = idsForRoute('amb-pgm-corpus');

/** The **9** jurisdiction ids gated by `AMB_NO_HELD_CORPUS_ENVELOPE_VERIFIED`. Derived, as above. */
export const AMB_NO_CORPUS_JURISDICTIONS: readonly string[] = idsForRoute('no-held-corpus');

/**
 * The AMB corpus-routing row for this INE code, or `null` when the AMB Refós covers no such
 * municipality.
 *
 * ⚠ `null` is a REACHABILITY answer about the SERVICE, never a fact about the land — the same
 * distinction `ambMunicipalityByIne` keeps, and the reason `unknown-municipality` and `no-feature`
 * are separate refusals in `bcnRefosOVProvider.ts`.
 *
 * PURE, total, never throws. P8 — emits `pryzm.zoning.es.amb.corpusMemberForIne`.
 */
export function ambCorpusMemberForIne(ine: IneCode): AmbCorpusMember | null {
    const span = tracer.startSpan('pryzm.zoning.es.amb.corpusMemberForIne');
    try {
        const hit = BY_INE.get(ine as string) ?? null;
        span.setAttribute('ineCode', ine as string);
        span.setAttribute('inAmbScope', hit !== null);
        if (hit) span.setAttribute('route', hit.route);
        return hit;
    } finally {
        span.end();
    }
}

/**
 * The jurisdiction id an AMB municipality presents to `envelopePublicationAuthorisation()`, or
 * `null` when the AMB publishes nothing for that INE code.
 *
 * ⚠⚠ **A NON-NULL ANSWER IS AN ASSESSMENT IDENTITY, NOT PERMISSION.** It says PRYZM has measured
 * this municipality and knows which corpus would govern. Whether an envelope may be PUBLISHED is
 * `isEnvelopePublicationAuthorised(id)`, which fails closed and which answers `false` for 35 of the
 * 36. Reading this as authorisation is the L-665 defect restated one layer out.
 *
 * PURE, total, never throws. P8 — emits `pryzm.zoning.es.amb.authorisationIdForIne`.
 */
export function ambAuthorisationIdForIne(ine: IneCode): string | null {
    const span = tracer.startSpan('pryzm.zoning.es.amb.authorisationIdForIne');
    try {
        const hit = BY_INE.get(ine as string) ?? null;
        span.setAttribute('ineCode', ine as string);
        span.setAttribute('assessed', hit !== null);
        return hit?.jurisdictionId ?? null;
    } finally {
        span.end();
    }
}

/**
 * THE CITED REFUSAL an AMB municipality gets while its corpus gate is shut.
 *
 * ⚠ `legallyGrounded: false` and `ordinanceRef: null` — this is a statement about PRYZM'S OWN
 * VERIFICATION STATUS, never about the land. The plan DOES grant an envelope on most of this
 * territory; PRYZM has simply not been authorised to publish its transcription. Rendering it as a
 * legal statement is the collapse this package keeps hitting (L-553).
 *
 * PURE, total, never throws. P8 — emits `pryzm.zoning.es.amb.corpusGateRefusal`.
 */
export function ambCorpusGateRefusal(
    ine: IneCode,
    zoneCode?: string | null,
    zoneLabel?: string | null,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal {
    const span = tracer.startSpan('pryzm.zoning.es.amb.corpusGateRefusal');
    try {
        const row = BY_INE.get(ine as string) ?? null;
        span.setAttribute('ineCode', ine as string);
        span.setAttribute('assessed', row !== null);
        const where = row ? row.nameInSource : 'this municipality';
        const zone =
            zoneLabel && zoneLabel.trim()
                ? `${zoneLabel.trim()}${zoneCode ? ` (clau ${zoneCode})` : ''}`
                : zoneCode && zoneCode.trim()
                  ? `clau ${zoneCode}`
                  : `this ${where} parcel`;
        if (!row) {
            // ⛔ NOT "gate shut" — the AMB does not publish here at all, and saying otherwise would
            // report a coverage hole as a signature question.
            span.setAttribute('reason', 'outside-amb');
            return {
                code: 'no-rule-pack',
                headline:
                    `${zone} — the AMB Refós publishes no planning for INE ${ine}, so PRYZM has not ` +
                    'assessed this municipality and will not produce a figure.',
                detail:
                    'This INE code is outside the 36 municipalities the AMB *Refós de Planejament* ' +
                    'covers. That is a statement about the SERVICE, not about the land: the ' +
                    'municipality has its own general plan, which PRYZM does not hold.',
                ordinanceRef: null,
                legallyGrounded: false,
                knownFacts: [...knownFacts],
            };
        }
        const noCorpus = row.corpus === 'no-held-corpus';
        span.setAttribute('reason', noCorpus ? 'no-held-corpus' : 'pgm-corpus-unsigned');
        return {
            code: 'no-rule-pack',
            headline: noCorpus
                ? `${zone} — the metropolitan plan does not govern in ${where}, and PRYZM does not ` +
                  'hold the municipal plan that does, so it will not publish a figure.'
                : `${zone} — PRYZM has measured ${where} and knows which ordinance governs it, but ` +
                  'no human has signed that transcription, so it will not publish a figure.',
            detail:
                (noCorpus
                    ? `${where} is measured PGM='N': its parcels route through the AMB's ` +
                      '`QUAL_MUNI` qualification layer, and PGM Art. 1.1 scopes the metropolitan ' +
                      'plan to the pre-2011 27-municipality Entitat Municipal Metropolitana. A ' +
                      'qualification polygon is a MAP, not an ordinance — there is no text here for ' +
                      'a human to sign, so acquiring the municipal plan is the step, not a signature.'
                    : `${where} is measured PGM='S': its qualification polygons cite the ` +
                      'metropolitan PGM-1976 normative roots, so its envelope would be interpreted ' +
                      `from ${AMB_PGM_CORPUS_INSTRUMENT_REF} PRYZM holds that corpus and routes ` +
                      'this municipality to it, but transcribing an ordinance is a LEGAL act and a ' +
                      'pack cannot sign its own transcription (L-449). The gate is SHUT pending a ' +
                      'human signature.') +
                ` Measured here on 2026-08-02 over 3 000 sampled parcels: ${row.measured.envelopePct} % ` +
                `would receive an envelope, ${row.measured.delegatedPct} % are delegated to planning ` +
                'PRYZM does not hold and would receive a cited refusal either way. ' +
                '⚠ And a signature would not close the box: ' +
                AMB_CORPUS_CEILINGS[2]!,
            ordinanceRef: null,
            legallyGrounded: false,
            knownFacts: [...knownFacts],
        };
    } finally {
        span.end();
    }
}
