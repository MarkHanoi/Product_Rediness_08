// ── ILLES BALEARS (GOIB MUIB) — the LIVE-RESOLVED rule pack. ─────────────────────────────────────
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY BALEARS, AND WHY A PACK THAT HOLDS NO ZONES
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `R` (can PRYZM identify the land?) is 97.1 % by census. `P` (can PRYZM state a rule?) is **74.1 %
// of PRIVATE DEVELOPABLE land, any-drawable** — 61.4 % carrying a COMPLETE rule plus 12.7 %
// PARTIAL. ⭐ THAT IS THE BEST `P` MEASURED ANYWHERE IN SPAIN, and it is a fact about how the Govern
// de les Illes Balears publishes planning data, not about PRYZM.
//
// ⚠ THIS PACK'S `zones` IS EMPTY BY CONSTRUCTION, AND THAT IS THE DESIGN — NOT A TODO.
// The 5,273 distinct MUIB fitxes are not a table anyone should transcribe: they are already
// machine-readable, per zone, at a stable URL the zoning layer itself publishes. Enumerating them
// into a static pack would freeze a live source into a snapshot that starts drifting the day it
// lands, and would put PRYZM's transcription between the ajuntament and the user for no gain. So
// the pack is resolved LIVE PER PARCEL — the Denmark/Paris/Netherlands shape (`packsByZone` empty,
// the L5 dispatch resolving a pack from the parcel) rather than the Madrid/Córdoba shape.
//
// ⇒ `balearsResolvedPack()` below builds a ONE-ZONE `JurisdictionZoningContract` from a resolution.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ WHAT THIS FILE MUST NEVER DO
// ══════════════════════════════════════════════════════════════════════════════════════════════
// It must never turn an ABSENT parameter into a number. Every mapping below is
// `PRESENT + VALID → value`, and everything else → `null`, because `null` is the only honest
// transcription of "the fitxa does not say" and L-616 is the record of what happens otherwise (a
// massing that ignored a FAR ceiling ~5× and drew an unknown setback as ZERO).
//
// In particular:
//   • an ABSENT *Reculada* NEVER becomes `0`. It becomes `null`, and the engine's §L-619 guard then
//     marks the resulting whole-parcel ring `footprintIsUpperBound` — a STUDY BOUND, not a solved
//     footprint. That flag is the difference between "we do not know the setbacks" and "there are
//     none", and it is the whole reason this file does not fabricate a triple;
//   • an occupation of exactly 100 % is SUSPECT (a null substitute in this dataset, and a flat
//     contradiction wherever a setback is also published) and is DROPPED, never coerced to 1.0;
//   • a 0 m setback is `ZERO_AMBIGUOUS` and enters no numerator.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// §REGISTRATION-APPLIED (L-680) — THE FOUR-FILE ATOMIC COMMIT, LANDED. THE GATE LANDED **SHUT**.
// ══════════════════════════════════════════════════════════════════════════════════════════════
// This block previously read "§REGISTRATION-DIFF — DELIBERATELY NOT APPLIED" and named the three
// tables a registration must touch. It has now been applied, in ONE commit, exactly as that note
// required — and the reason it could be applied WITHOUT a legal act is the reason it is safe:
//
//   • `rulepacks/registry.ts`         — the jurisdiction is REGISTERED (extent + refusals). That
//                                       lights the C60 coverage globe and, more importantly, closes
//                                       the §L-663 hole: before this, a click in Mallorca matched NO
//                                       `contains` predicate, so the dispatcher's estimated-fallback
//                                       chokepoint read "genuinely uncovered land" and PUBLISHED the
//                                       generic 3,0/1,5/3,0 m · FAR 2,00 · 50 % triple on Balears
//                                       land PRYZM has read no article about. Registration is what
//                                       makes that structurally impossible. `packsByZone` is EMPTY —
//                                       the pack is resolved LIVE (the Denmark/Paris/NL shape).
//   • `rulepacks/envelopeAuthorisation.ts` — the gate is DECLARED, so Balears now answers
//                                       `gate-shut` ("a human has not signed") instead of
//                                       `unknown-jurisdiction` ("nobody has ever looked here"). Both
//                                       refuse; only one of them is TRUE. That is the whole delta.
//   • `l449CertificationGates.ts`     — the gate is registered with `signature: null`.
//
// ⛔ NOTHING HERE WAS SIGNED, AND THE CONSTANT BELOW IS `false`. AUTHORISATION IS A LEGAL ACT AND IS
// NOT AN IMPLEMENTER'S TO PERFORM (L-449). Building the route is not granting permission to use it.
//
// ⛔ AND THE SECOND DOOR WAS ALSO LEFT SHUT. `openTopIndicative.ts` offers a THIRD publication state
// — draw, but claim no buildable right — and `BALEARS_OPEN_TOP_INDICATIVE` is built and tested there.
// It is NOT listed in `OPEN_TOP_INDICATIVE_JURISDICTIONS`, for a reason that is not merely procedural:
// `rendererCanExpressOpenTop` is `false`, measured, because `classifyEnvelopeCompleteness` has no
// input for the posture — so an indicative Balears solid would render in the SAME confident violet as
// a determination. Listing it today would ship a solid that LOOKS complete, which is exactly what
// ADR-0293 forbids. Both doors are one line each, both are founder lines, and neither is taken here.
//
// ⇒ WHAT A USER GETS TODAY, from a click on a Mallorca parcel: the live MUIB zone identity, the
// governing plan, the land class, the fitxa's own parameters and the article the fitxa cites, all
// carried on a CITED REFUSAL that names the outstanding signature. No number reaches the massing,
// the generator bounds or `site.updateZoning`. A cited refusal is an answer; the estimated triple
// this registration displaces was not.
//
// PURITY: L2-pure (C58 §1.9) — no I/O, no clock, no RNG. Every function here is a total map from
// an already-fetched resolution to data.
//
// Strategic context — ADR-0270 (the geometric-rule model), ADR-0283 (evidence-bounded publication),
// ADR-0293 (open top with a stated reason), C58 §1.2/§1.4/§1.6/§1.7a, L-449, L-616, L-619, L-665, L-677.

import { trace } from '@opentelemetry/api';
import type {
    EnvelopeRefusal,
    GeometricRule,
    JurisdictionZoningContract,
    ZoningRule,
} from '@pryzm/schemas';
import type {
    BalearsMuibRecord,
    BalearsMuibRefusalReason,
} from '../providers/resolveBalearsMuib.js';
import { BALEARS_MISSING_CONSTRAINTS } from '../providers/resolveBalearsMuib.js';
import type { BalearsParameter, BalearsParameters } from '../providers/balearsMuibFitxa.js';

const tracer = trace.getTracer('pryzm.zoning.balears');

/** The jurisdiction id Balears records and (future) registrations use. One constant, not a literal. */
export const BALEARS_JURISDICTION_ID = 'es-ib-balears';

/** The governing data source, named as the publisher names it. */
export const BALEARS_SOURCE_NAME =
    'GOIB MUIB — Mapa Urbanístic de les Illes Balears (ideib.caib.es, capa QUALIFICACIONS)';

/**
 * ⛔ THE L-449 PUBLICATION GATE FOR THE ILLES BALEARS. **`false` — NOBODY HAS SIGNED.**
 *
 * WHAT FLIPPING IT WOULD AUTHORISE: publishing the MUIB *fitxa*'s own parameters — *nombre de
 * plantes*, *alçada*, *ocupació*, *edificabilitat*, *reculades* — as a NUMERIC DETERMINATION about
 * a user's land, cited to the fitxa and (where the fitxa prints one) to its article.
 *
 * WHAT A SIGNATORY IS BEING ASKED TO ACCEPT, stated plainly so the request is reviewable:
 *
 *  1. THAT THE FITXA CELL IS THE DETERMINATION. Only **2.0 %** of fitxes are both COMPLETE and cite
 *     the governing article ON the parameter. On the other 98 % the relationship between the table
 *     cell and the ordinance article is ASSERTED, not established (`articleGovernance:
 *     'NOT_ESTABLISHED'` in `openTopIndicative.ts`).
 *  2. THAT THE CITED INSTRUMENT IS STILL THE GOVERNING ONE. `supersession: 'NOT_VERIFIED'`. MUIB's
 *     `DINIVIGEN`/`DFIVIGEN` interval is applied, and 23.77 % of buildable land is refused on the
 *     publisher's own "not current" sentence — but neither of those is a supersession check.
 *  3. THAT AN OPEN TOP MAY BE DRAWN AS THOUGH CLOSED. ⛔ It may not, and this is the independent
 *     blocker: six constraint families (`BALEARS_MISSING_CONSTRAINTS`) are unmodelled and every one
 *     of them can only REDUCE the solid, so a Balears envelope is an upper bound with respect to all
 *     six. Signing THIS constant alone would publish that upper bound as a determination.
 *
 * ⚠ (3) IS WHY A SIGNATURE HERE IS PROBABLY THE WRONG INSTRUMENT AND `openTopIndicative.ts` IS THE
 * RIGHT ONE. That module can only ever NARROW this gate, never widen it, and it claims exactly what
 * the evidence supports: draws, states its reasons, claims no buildable right. It is blocked on a
 * RENDERER capability (`rendererCanExpressOpenTop === false`), which is engineering work, not a
 * legal act. ⇒ The productive next move is the renderer input, not this constant.
 *
 * ⛔ DO NOT FLIP THIS TO SHIP A DEMO. `l449CertificationGates.ts` records `signature: null` beside
 * it, `§NO-UNSIGNED-OPEN-GATE` turns RED on a `true` with no signature, and `MADRID_NZ1_CERTIFIED`
 * is the recorded precedent for what a machine's self-attribution costs (it shipped `true` for a
 * week). Flipping it is a legal act performed at THIS declaration, by a person, with the signature
 * recorded in a `sources/VERIFICATION.md` the L-449 test opens and reads.
 */
export const BALEARS_ENVELOPE_VERIFIED = false;

// ──────────────────────────────────────────────────────────────────────────────────────────────
// PARAMETERS → THE NUMBERS
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** A parameter's number, but ONLY when it is PRESENT and VALID. Anything else is `null`. */
function validNumber(p: BalearsParameter | undefined): number | null {
    if (!p || p.status !== 'PRESENT' || p.verdict !== 'VALID') return null;
    return typeof p.value === 'number' && Number.isFinite(p.value) ? p.value : null;
}

/** As above, but additionally requiring the unit cell to have been recognised as `kind`. */
function validNumberOfKind(p: BalearsParameter | undefined, kind: string): number | null {
    if (!p || p.kind !== kind) return null;
    return validNumber(p);
}

/**
 * *Ocupació màxima* as the engine's `maxCoverage` (a 0–1 ratio).
 *
 * ⭐ ONLY THE PERCENTAGE FORM CONVERTS. Occupation is published BOTH as a percentage AND as an
 * ABSOLUTE m² footprint, and the two are different quantities: `O: 200 m2` is a floor area, not
 * 200 % coverage and not 2.0. Reading the number without its unit cell silently mixes them, so the
 * absolute form maps to `null` here and is carried as a fact rather than as a ratio.
 *
 * ⛔ `O = 100 %` NEVER ARRIVES — the classifier already marked it SUSPECT.
 */
export function balearsMaxCoverage(P: BalearsParameters): number | null {
    const pct = validNumberOfKind(P['O'], 'PERCENT');
    return pct === null ? null : pct / 100;
}

/**
 * *Coeficient d'edificabilitat neta* as `plotRatioFAR`.
 *
 * ⚠ ONLY THE RATIO FORM. `E` is also published as an ABSOLUTE m² ceiling by some municipalities, and
 * a 300 m² ceiling read as a FAR of 300 would be catastrophic in exactly the silent way L-616 was.
 */
export function balearsPlotRatioFAR(P: BalearsParameters): number | null {
    return validNumberOfKind(P['E'], 'RATIO');
}

/**
 * The height, in the two forms the fitxa publishes them.
 *
 * ⚠ METRES AND STOREYS ARE BOTH REAL AND ARE NOT INTERCHANGEABLE. `HR` (*altura reguladora*) and
 * `HT` (*altura total*) are metric; `NP` (*nombre de plantes*) is a storey count. PRYZM does NOT
 * multiply a storey count by an assumed floor-to-floor to manufacture a metric height — the engine
 * has its own sanctioned, SURFACED assumption for that (§L-616), and duplicating it here would put a
 * second, silent one inside a citation.
 *
 * ⛔ `HR`/`HT`, NEVER `AR`/`AT`. **`AT` is *Allotjament turístic*, a USE CLASS.** A guessed
 * dictionary reported metric height as 0/80 ABSENT when it is 49/80.
 */
export function balearsMaxHeightM(P: BalearsParameters): number | null {
    return validNumberOfKind(P['HR'], 'METRES') ?? validNumberOfKind(P['HT'], 'METRES');
}

/** *Nombre de plantes* as `maxFloors`. */
export function balearsMaxFloors(P: BalearsParameters): number | null {
    return validNumberOfKind(P['NP'], 'STOREYS');
}

/**
 * The *Reculades* mapped onto the engine's front/side/rear triple.
 *
 * ⛔ `RA`/`RF`/`RM`, NEVER `RL`. **`RL` is *Religiós*, a USE CLASS.** And the family is ***Reculada***,
 * not *Retranqueig* — searching for the Castilian term finds nothing and reports a real setback absent.
 *
 *   `RA` *Reculada a alineació oficial*  → FRONT (distance to the official street alignment)
 *   `RM` *Reculada a mitgera*            → SIDE  (distance to the party-wall boundary)
 *   `RF` *Reculada a interior d'illa*    → REAR  (distance to the block interior)
 *
 * ⚠ EACH IS INDEPENDENTLY NULLABLE, AND A `null` IS LOAD-BEARING. A zone that publishes only `RA`
 * gets `{front: n, side: null, rear: null}`, and the engine treats the two nulls as UNKNOWN — it does
 * not erode by them and does not pretend they are zero.
 */
export function balearsSetbacks(P: BalearsParameters): {
    readonly front_m: number | null;
    readonly side_m: number | null;
    readonly rear_m: number | null;
} {
    return {
        front_m: validNumberOfKind(P['RA'], 'METRES'),
        side_m: validNumberOfKind(P['RM'], 'METRES'),
        rear_m: validNumberOfKind(P['RF'], 'METRES'),
    };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// PARAMETERS → THE GEOMETRIC RULE (ADR-0270)
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Build the zone's `GeometricRule`, or `null`.
 *
 * ⭐ MOST BALEARS ZONES ARE PLAIN `kind: 'setback'`, AND THAT IS THE POINT — PRYZM ALREADY HAS THAT
 * ENGINE (§L-591, the Barcelona `20a/*` family). ⛔ NO NEW GEOMETRY ENGINE IS WRITTEN HERE, and none
 * should be: the fitxa's *Reculada* triple is exactly the erode-from-every-edge operation
 * `SetbackRuleSchema` already describes.
 *
 * TWO OUTCOMES, AND THE SECOND IS NOT A DEGRADED FIRST:
 *
 *  • **≥1 VALID *Reculada* ⇒ `kind: 'setback'`.** Unpublished members of the triple become `0` INSIDE
 *    THE RULE ONLY — and that is sound precisely because `SetbackRuleSchema` requires all three, so a
 *    zone that states one distance and is silent on the others is stating "erode by this here". The
 *    UNKNOWN-vs-ZERO distinction is preserved where it actually matters, on `ZoningRule.setbacks`,
 *    which keeps the `null`s (see `balearsSetbacks`) and drives the engine's own §L-619 guard.
 *
 *  • **NO VALID *Reculada* ⇒ `null`**, i.e. the legacy per-edge inset over an all-null triple. The
 *    inset erodes nothing, the footprint is the whole parcel, and the ENGINE marks it
 *    `footprintIsUpperBound` with a caveat. That is the honest answer for a zone whose ordinance
 *    shapes the footprint by OCCUPATION rather than by distance — which is most of the *nucli antic*
 *    and *entre mitgeres* fabric, including the Manacor `RE-NA` control.
 *    ⛔ It must NOT be "fixed" by inventing a triple of zeroes: that would suppress the upper-bound
 *    flag and turn a study bound into a confident envelope, which is the L-619 Copenhagen defect.
 *
 * ⚠ ⭐ **NO BALEARS ZONE PRODUCES A BLOCK-RING KIND, AND THAT IS A FINDING, NOT AN OMISSION.**
 * `requiresBlockRing()` is TRUE only for `block-derived-alignment` and `tiered-occupation` — both of
 * which exist because a Barcelona ARTICLE states an ALGORITHM over the *illa* (PGM Arts. 242.2 /
 * 350.2.b). The MUIB fitxa states no such construction anywhere in its normalised dictionary: it
 * publishes scalars. So every rule this function can return routes through the parcel-only path,
 * `requiresBlockRing()` is false for all of them, and no Balears parcel needs a *manzana* ring.
 * ⇒ If a future Balears zone genuinely needs a block, that is a NEW FINDING to report — it is not a
 *   licence to reach for Barcelona's clamps, which is the L-526 mis-citation verbatim.
 *
 * P8 — emits `pryzm.zoning.balears.geometricRule`.
 */
export function balearsGeometricRule(P: BalearsParameters): GeometricRule | null {
    const span = tracer.startSpan('pryzm.zoning.balears.geometricRule');
    try {
        const { front_m, side_m, rear_m } = balearsSetbacks(P);
        if (front_m === null && side_m === null && rear_m === null) {
            span.setAttribute('kind', 'none');
            return null;
        }
        span.setAttribute('kind', 'setback');
        return { kind: 'setback', front_m: front_m ?? 0, side_m: side_m ?? 0, rear_m: rear_m ?? 0 };
    } finally {
        span.end();
    }
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE RESOLVED PACK
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The confidence tier a Balears pack may declare.
 *
 * ⚠ `estimated-ruleset`, DELIBERATELY — NOT `structured`, even though every number is machine-read
 * from a published table and PRYZM transcribes no PDF.
 *
 * The reason is `articleAbsent`. `structured` is the tier for "the authority published the governing
 * determination itself as data" (Denmark's Plandata). MUIB publishes a *fitxa*, and only **2.0 %** of
 * fitxes are both COMPLETE and cite the governing article on the parameter. On the other 98 % PRYZM
 * would be asserting that a table cell IS the determination — a claim about the relationship between
 * the fitxa and the ordinance that nobody has established. `estimated-ruleset` states less, and
 * stating less is the whole of C58 §1.4.
 *
 * ⚠ AND THE ENGINE ENFORCES IT AS A CEILING, NOT A LABEL (§PACK-CONFIDENCE-CEILING): a pack cannot
 * PROMOTE a solve, only demote it.
 */
export const BALEARS_PACK_CONFIDENCE = 'estimated-ruleset' as const;

/**
 * Build the one-zone `JurisdictionZoningContract` for a resolved Balears parcel.
 *
 * ⚠ THE `ordinanceRef` IS BUILT FROM WHAT THE FITXA ACTUALLY SAYS, AND SAYS SO WHEN IT SAYS NOTHING.
 * With an article: *"… Article 66 (fitxa MUIB …)"*. Without one, the citation names the fitxa and the
 * governing plan and NOTHING ELSE — it never implies an article that was not printed. A citation
 * nobody can dereference is how Madrid's gate came to cite the commit that opened it (L-677).
 *
 * P8 — emits `pryzm.zoning.balears.resolvedPack`.
 */
export function balearsResolvedPack(record: BalearsMuibRecord): JurisdictionZoningContract {
    const span = tracer.startSpan('pryzm.zoning.balears.resolvedPack');
    try {
        const P = record.parameters;
        const zoneCode = record.feature.CODIMUIB ?? record.feature.CODIAJ ?? 'UNKNOWN';
        const label = record.feature.NOM ?? record.feature.CODIAJ ?? zoneCode;
        const setbacks = balearsSetbacks(P);
        const geometricRule = balearsGeometricRule(P);

        const plan = record.feature.CODIPLA ?? 'pla no identificat';
        const articles = record.articleRefs.length > 0 ? record.articleRefs.join(' · ') : null;
        const ordinanceRef =
            (articles
                ? `${articles} — `
                : 'NO ARTICLE CITED ON THE PARAMETERS (the fitxa prints none) — ') +
            `fitxa MUIB ${record.fitxaUrl} · pla ${plan} · ` +
            `${record.feature.MUNICIPI ?? 'municipi'} (${BALEARS_SOURCE_NAME})`;

        // ⚠ PER-FIELD PROVENANCE (C58 §1.6). `ordinance-pdf` is the closest honest tier for a value
        // read from the publisher's own normative fitxa: it is the ordinance's published table, not a
        // structured API field, and not PRYZM's estimate. A field the fitxa did not print gets no
        // entry at all, which the engine already reads as `estimated` — and it will be `null` anyway.
        const fieldProvenance: Record<string, 'ordinance-pdf'> = {};
        const mark = (key: string, v: number | null): void => {
            if (v !== null) fieldProvenance[key] = 'ordinance-pdf';
        };
        const maxHeight_m = balearsMaxHeightM(P);
        const maxFloors = balearsMaxFloors(P);
        const plotRatioFAR = balearsPlotRatioFAR(P);
        const maxCoverage = balearsMaxCoverage(P);
        mark('maxHeight', maxHeight_m);
        mark('maxFloors', maxFloors);
        mark('maxFAR', plotRatioFAR);
        mark('maxCoverage', maxCoverage);
        mark('setback.front', setbacks.front_m);
        mark('setback.side', setbacks.side_m);
        mark('setback.rear', setbacks.rear_m);

        const zone: ZoningRule = {
            code: zoneCode,
            label,
            permittedUse: [],
            maxHeight_m,
            maxFloors,
            plotRatioFAR,
            maxCoverage,
            setbacks,
            fieldProvenance,
            ordinanceRef,
            geometricRule,
        };

        return {
            jurisdictionId: BALEARS_JURISDICTION_ID,
            displayName: `Illes Balears — ${record.feature.MUNICIPI ?? 'municipi'} ${zoneCode}`,
            source: 'manual',
            crs: 'EPSG:4326',
            // The MUIB record's own validity start, when it published one — the freshness that
            // matters is the PLAN's, not the day PRYZM happened to read it.
            lastReviewed: record.feature.DINIVIGEN ?? '2026-08-02',
            defaultConfidence: BALEARS_PACK_CONFIDENCE,
            zones: [zone],
        };
    } finally {
        span.end();
    }
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// REFUSALS
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The roadmap line, stated once. Same role as `MURCIA_ROADMAP_LINE`: a refusal card must say what
 * would change the answer, or a user cannot tell a coverage gap from a crash.
 */
export const BALEARS_ROADMAP_LINE =
    'Balears coverage today: the PARCEL half is complete and live — the national Catastro path ' +
    'resolves the referencia catastral, the official boundary and the official area, keyless. The ' +
    'ZONING half is live too, and it is unusually good: the Govern de les Illes Balears publishes ' +
    'MUIB, which gives the zone code, the municipal designation, the governing plan, the land class ' +
    'and the record\'s validity interval AT THE POINT — and, uniquely among the Spanish sources ' +
    'measured so far, a link to a STRUCTURED normative fitxa carrying the numeric parameters ' +
    'themselves (storeys, height, occupation, buildability, setbacks). Across the islands that ' +
    'supports a drawable rule on about three quarters of privately developable land. What is ' +
    'missing is not data: it is (a) a human signature on the reading — L-449 reserves that to a ' +
    'person — and (b) the constraint layers nobody has modelled: heritage, flood, airport, coastal, ' +
    'environmental, and the island territorial plans. Because of (b) a Balears envelope is an OPEN ' +
    'TOP: every one of those can only reduce it.';

/** The refusal copy for each provider reason. Keyed so the card can never fall through to prose. */
const REFUSAL_COPY: Readonly<Record<BalearsMuibRefusalReason, { headline: string; detail: string }>> = {
    'out-of-balears': {
        headline: 'This point is outside the Illes Balears.',
        detail: 'The MUIB service covers the four islands only; nothing was queried.',
    },
    'endpoint-unreachable': {
        headline: 'The Balears planning service did not answer — this is a temporary failure, not an answer about your land.',
        detail:
            'MUIB (ideib.caib.es) did not respond. ⚠ THIS IS NOT "there are no planning rules here". ' +
            'Nothing has been established about this parcel one way or the other, and retrying may succeed.',
    },
    'no-zoning-here': {
        headline: 'MUIB publishes no zoning polygon covering this point.',
        detail:
            'The service answered, completely, and no qualificació covers this location — open water, ' +
            'or land outside the mapped plan. A real negative, not a failure.',
    },
    'only-superseded-records': {
        headline: 'Every planning record covering this point is outside its validity interval.',
        detail:
            'MUIB publishes a validity interval per record, and every record here has been superseded. ' +
            'Quoting one would publish a repealed rule under a current-sounding citation, so PRYZM quotes none.',
    },
    'ambiguous-zone': {
        headline: 'Two different planning zones cover this point — PRYZM will not guess which governs.',
        detail:
            'This is a zone boundary. Picking whichever the service happened to list first would be a ' +
            'coin flip on a compliance number. Move the point clearly inside one zone.',
    },
    'plan-not-current': {
        headline: 'The municipality itself states that MUIB does NOT show its current planning for this land.',
        detail:
            'This is not PRYZM\'s judgement — it is published by the ajuntament in the zoning layer\'s own ' +
            'observations field, quoted below verbatim. Drawing an envelope from a plan whose publisher has ' +
            'disowned it would be a confident mis-citation. ⚠ This affects about 23.8 % of Balears buildable ' +
            'land by area (Palma, Andratx and Eivissa). Consult the ajuntament directly.',
    },
    'not-buildable-class': {
        headline: 'This land is not urban or urbanisable soil, so a zone fitxa does not govern it.',
        detail:
            'MUIB classes this polygon outside sòl urbà / sòl urbanitzable. Rústic land is governed by a ' +
            'different regime — the island territorial plan and the rustic-category rules — which PRYZM does not hold.',
    },
    'no-fitxa-url': {
        headline: 'This zone publishes no link to its normative fitxa, so no parameters can be read.',
        detail:
            'The zoning layer carries the zone identity but no fitxa URL for this record, and the layer itself ' +
            'publishes no numeric parameter. There is nothing to read a height or a buildability from.',
    },
    'fitxa-unreachable': {
        headline: 'The zone\'s normative fitxa could not be fetched — a temporary failure, not an answer.',
        detail:
            'The zone was identified but its fitxa page did not load. ⚠ NOT "this zone publishes no rules": ' +
            'nothing was established, and retrying may succeed.',
    },
    'fitxa-unparsable': {
        headline: 'The fitxa loaded but PRYZM could not read it reliably, so it publishes nothing from it.',
        detail:
            'The parser saw parameter rows it could not read, which means the page has changed shape. Reporting ' +
            'the parameters it DID read would understate the zone while looking like a complete answer, so it ' +
            'reports none. This is a PRYZM defect to fix, not a statement about your land.',
    },
    'fitxa-identity-mismatch': {
        headline: 'The fitxa returned does not belong to this zone — PRYZM will not quote it.',
        detail:
            'The zoning record and the fitxa disagree about which entity they describe. Quoting it would attach ' +
            'another zone\'s numbers to your parcel: a plausible answer about the wrong land.',
    },
    'no-drawable-parameters': {
        headline: 'This zone\'s fitxa publishes no combination of parameters an envelope can be drawn from.',
        detail:
            'The fitxa was read cleanly. What it prints is not enough to shape a solid — most often a ' +
            'buildability coefficient with NO height and NO footprint rule, which fixes floor AREA while fixing ' +
            'neither the footprint nor the height. Drawing one would mean inventing the missing half.',
    },
};

/**
 * ⚠ THE REFUSAL CODE PER REASON — and the three-way split is load-bearing, not tidiness.
 *
 * `EnvelopeRefusalCode` already distinguishes the exact axes this provider distinguishes, and using
 * the wrong member re-opens the §CONTEXT-DATA-HONESTY hole the vocabulary was widened to close:
 *
 *  • `source-data-unavailable` — TRANSIENT. The source did not answer. This is the ONLY code that
 *    earns the "usually clears on a second attempt" retry card. Stamping it on a durable absence
 *    offers a retry that can never succeed; stamping something else on a real outage tells the user
 *    "there is nothing here" when nothing whatever was established.
 *  • `no-plan-at-point` — DURABLE ABSENCE. The source answered, completely, and publishes nothing
 *    here. Cacheable, not retryable.
 *  • `no-rule-pack` — a statement about PRYZM'S COVERAGE or PRYZM'S SOFTWARE, never about the land.
 *  • `derived-plan` — a LEGAL statement: the governing determination sits in a document PRYZM does
 *    not hold. That is precisely what a superseded record, a plan its own publisher has disowned,
 *    and a rustic regime each mean.
 *  • `overlay-uncertain` — a real boundary between two zones; the uncertainty is spatial, not ours.
 */
const BALEARS_REFUSAL_CODE: Readonly<Record<BalearsMuibRefusalReason, EnvelopeRefusal['code']>> = {
    'out-of-balears': 'no-rule-pack',
    'endpoint-unreachable': 'source-data-unavailable',
    'no-zoning-here': 'no-plan-at-point',
    'only-superseded-records': 'derived-plan',
    'ambiguous-zone': 'overlay-uncertain',
    'plan-not-current': 'derived-plan',
    'not-buildable-class': 'derived-plan',
    'no-fitxa-url': 'no-plan-at-point',
    'fitxa-unreachable': 'source-data-unavailable',
    'fitxa-unparsable': 'no-rule-pack',
    'fitxa-identity-mismatch': 'no-rule-pack',
    'no-drawable-parameters': 'no-rule-pack',
};

/**
 * The honest refusal for a Balears parcel PRYZM cannot answer.
 *
 * ⚠ `legallyGrounded` IS PER-REASON, AND THE SPLIT IS THE POINT.
 *   • `plan-not-current`, `not-buildable-class` and `only-superseded-records` are grounded in the
 *     PUBLISHER'S OWN statement about the land — the ordinance/record says so, and the citation is
 *     theirs. Those are legal statements.
 *   • Everything else is a statement about PRYZM'S COVERAGE OR OUR SOFTWARE. Claiming a legal "no"
 *     for those would tell the owner of a perfectly buildable plot that the law forbids building —
 *     the opposite error, and the worse one (the Murcia reasoning, applied here).
 */
export function balearsRefusal(
    reason: BalearsMuibRefusalReason,
    opts: {
        readonly zoneCode?: string | null;
        readonly zoneLabel?: string | null;
        readonly municipality?: string | null;
        /** The provider's `detail` — for `plan-not-current` this is the publisher's verbatim words. */
        readonly detail?: string | null;
        readonly knownFacts?: readonly string[];
        readonly ordinanceRef?: string | null;
    } = {},
): EnvelopeRefusal {
    const copy = REFUSAL_COPY[reason];
    const where = opts.municipality ? ` (${opts.municipality})` : '';
    const zone =
        opts.zoneLabel && opts.zoneLabel.trim()
            ? `${opts.zoneLabel.trim()}${opts.zoneCode ? ` (${opts.zoneCode})` : ''}`
            : opts.zoneCode && opts.zoneCode.trim()
              ? `Zone ${opts.zoneCode}`
              : 'This Balears parcel';

    const legallyGrounded =
        reason === 'plan-not-current' ||
        reason === 'not-buildable-class' ||
        reason === 'only-superseded-records';

    const quoted =
        reason === 'plan-not-current' && opts.detail
            ? ` The ajuntament's own words: “${opts.detail.trim()}”.`
            : opts.detail
              ? ` (${opts.detail.trim()})`
              : '';

    return {
        code: BALEARS_REFUSAL_CODE[reason],
        headline: `${zone}${where} — ${copy.headline}`,
        detail: `${copy.detail}${quoted} ${BALEARS_ROADMAP_LINE}`,
        ordinanceRef: opts.ordinanceRef ?? null,
        legallyGrounded,
        knownFacts: [...(opts.knownFacts ?? [])],
    };
}

/**
 * §BALEARS-REGISTRY-REFUSAL — the answer on the REGISTRY path, where NO fetch has happened.
 *
 * ⚠ THIS IS A DIFFERENT ANSWER FROM EVERY MEMBER OF `BalearsMuibRefusalReason`, AND CONFLATING THEM
 * WOULD BE THE §CONTEXT-DATA-HONESTY COLLAPSE ONE LAYER UP. `resolveZoneDisposition()` is consulted
 * with a zone code and no network; reusing `balearsRefusal('endpoint-unreachable')` here would assert
 * that a lookup was attempted and failed, and reusing `'no-drawable-parameters'` would assert the
 * fitxa was read. Neither happened. Catalonia hit exactly this and solved it the same way
 * (`catalunyaRegistryRefusal`, "an explicit `'not-attempted'` rather than claiming a lookup failed").
 *
 * ⇒ `no-rule-pack`: a statement about PRYZM's own state, never about the land. `legallyGrounded`
 * is FALSE — the Balears ordinance has said nothing on this path, and claiming a legal "no" would
 * tell the owner of a perfectly buildable plot that the law forbids building.
 */
export function balearsRegistryRefusal(
    zoneCode: string | null,
    zoneLabel: string | null,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal {
    const zone =
        zoneLabel && zoneLabel.trim()
            ? `${zoneLabel.trim()}${zoneCode ? ` (${zoneCode})` : ''}`
            : zoneCode && zoneCode.trim()
              ? `Zone ${zoneCode}`
              : 'This Balears parcel';
    return {
        code: 'no-rule-pack',
        headline:
            `${zone} — PRYZM publishes no buildable figure in the Illes Balears: the reading of the ` +
            'MUIB fitxa is not yet human-signed.',
        detail:
            'The Govern de les Illes Balears publishes the parameters for this zone, and PRYZM can ' +
            'read them at the point. What is missing is a signature on the reading (L-449 reserves ' +
            'that to a person) and the constraint layers nobody has modelled. ⚠ NO LOOKUP WAS ' +
            'ATTEMPTED ON THIS PATH — this is a statement about PRYZM\'s publication state, not a ' +
            'failed query and not a statement about your land. ' +
            BALEARS_ROADMAP_LINE,
        ordinanceRef: null,
        legallyGrounded: false,
        knownFacts: [...knownFacts],
    };
}

/**
 * ADR-0293 — the OPEN-TOP statement that MUST accompany any Balears envelope, restated from the
 * provider so a caller holding only the pack still gets it. ⛔ Non-empty by construction: an open top
 * with nothing named is a closed box wearing a label.
 */
export const BALEARS_OPEN_TOP_REASONS: readonly string[] = BALEARS_MISSING_CONSTRAINTS;
