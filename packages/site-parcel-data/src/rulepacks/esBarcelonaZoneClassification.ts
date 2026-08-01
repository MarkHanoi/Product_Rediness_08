// L-550 / Phase 1b — BARCELONA (INE 08019) CLAU CLASSIFICATION: which claus have NO private
// buildable envelope, and the ordinance's reason for each.
//
// This is a LEGAL CLASSIFICATION TABLE, not a rule pack. It produces no numbers. Its entire job
// is to let a parcel on a park, a motorway, a forest reserve or a *volumetria específica* plot
// return the ordinance's own answer — "not by a zone envelope" — instead of falling through to
// the generic estimated pack and being shown a fabricated setback triple.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// WHY EVERY CLAU IS ENUMERATED EXPLICITLY, AND NOT MATCHED BY PREFIX
// ─────────────────────────────────────────────────────────────────────────────────────────────
// The obvious implementation is prefix matching: `1*` = port, `6*` = parks, `7*` = equipaments.
// It is wrong, and dangerously so — `13a` starts with `1`, `22a` starts with `2`. A prefix table
// would refuse an envelope on the Eixample. More importantly, the failure mode of an
// over-broad match here is SILENT: the parcel simply reports "no envelope applies", which looks
// exactly like a correct refusal.
//
// So membership is an explicit allow-list, and an UNRECOGNISED clau matches NOTHING and keeps
// today's behaviour (the estimated fallback). A clau we have never seen must never be refused on
// the strength of its first character. Adding a clau to this table is a legal act and should
// carry its article.
//
// ⚠ THE `/` SUFFIX. The MUC returns subzone-suffixed claus (`17/6`, `20a/10`). Suffixes are
// matched EXPLICITLY too where they are known to occur; there is no automatic base-code
// fallback, for the same reason.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// EVIDENCE TIER — READ THIS BEFORE TRUSTING A CITATION BELOW
// ─────────────────────────────────────────────────────────────────────────────────────────────
// The zone/system TAXONOMY (which claus are *sistemes* and which are *zones*) is established:
// it is PGM-1976 NNUU Títol IV, it is what `server/mucZoningProxy.js` already reads, and it was
// measured live across 1 014 MUC resolutions (`BARCELONA-COMPLETE-COVERAGE-PLAN.md` §2). What is
// NOT uniformly primary-sourced is the per-clau ARTICLE NUMBER. Where the plan's research
// reached a specific article (notably **Art. 306** for clau 18) it is cited; where it did not,
// the citation names the instrument and the taxonomy, and says so, rather than inventing a
// plausible article number — the precise error L-526 caught in the 13a citation (Art. 322.1 was
// named for a depth that Art. 242 governs).
//
// A refusal citation carries far less risk than a numeric citation — a wrong article attached to
// "no envelope applies" cannot produce a wrong building — but it is still a claim about the law,
// so a **founder L-449-style signature on the refusal wording is a scheduled task** (plan §4,
// the `15/16/17/8a` and `18` rows). Until it lands these ship as classification, cited to the
// instrument.
//
// PURITY: L2-pure. Data only.
//
// Strategic context — BARCELONA-COMPLETE-COVERAGE-PLAN.md §1.1/§3.5/§3.8/§4/§5 (Phase 1b),
// C58 §1.2/§1.3/§1.4, ADR-0272.

import { trace } from '@opentelemetry/api';
import type { EnvelopeRefusal } from '@pryzm/schemas';
import {
    BCN_22A_REGIME_NEUTRAL_LIMITS,
    BCN_INDUSTRIAL_ZONE_CODES,
} from './esBarcelonaIndustrial.js';
// §DEC-1 — clau `22@`'s permanent cited refusal is built from the pack's OWN transcription, so the
// card can never name an article the pack does not carry. ⚠ It imports the ARTICLE-NAME fields and
// the citation, never the figures: see `BCN_22ARROBA_DEPTH_CLOSURE` on why the digits stay in the
// citation string and out of the prose.
import {
    BCN_22ARROBA_ART8_LIMITS,
    BCN_22ARROBA_ORDINANCE_REF,
    BCN_22ARROBA_ZONE_CODES,
} from './esBarcelona22Arroba.js';
// §BARE-20A-EXHAUSTED — bare `20a`'s refusal imports the CITATION only. Not one 20a envelope figure
// is subzone-neutral, so no figure crosses into this module; see `BCN_20A_BARE_ORDINANCE_REF`.
import { BCN_20A_BARE_ORDINANCE_REF } from './bcn20aSubzones.js';

/**
 * P8 — one tracer for this module's exported refusal constructors. Same precedent as
 * `zoneRefusal.ts` and `registry.ts` in this directory: a span on a pure constructor is a no-op
 * without an exporter, so the module's stated L2 purity is unaffected.
 */
const _tracer = trace.getTracer('pryzm.zoning.es.bcn');

/** The instrument every classification below is read from. */
export const BCN_PGM_INSTRUMENT_REF =
    'PGM-1976 (Pla General Metropolità, aprovat 14-07-1976) — Normes Urbanístiques, Títol IV ' +
    '(sistemes i zones). Source: the current consolidated PGM refós in the Registre de ' +
    'Planejament Urbanístic de Catalunya (RPUC) / AMB Geoportal de Planejament (NUMAMB).';

/**
 * The article-attributable part of a refusal — everything EXCEPT the per-parcel facts.
 *
 * `knownFacts` is deliberately absent from these static rows: it is the user's own parcel
 * reference / address / area, which is per-lookup data, not law. Attaching it here would mean a
 * legal classification that varies by parcel, which is the wrong shape. It is merged in by
 * `barcelonaZoneRefusalFor` at resolution time (L-553).
 */
type ClassifiedRefusal = Omit<EnvelopeRefusal, 'knownFacts'>;

/** A classification row: the claus it covers, and the refusal they produce. */
interface ClauClassification {
    readonly claus: readonly string[];
    readonly refusal: ClassifiedRefusal;
}

/**
 * ⚠ ORDER IS NOT SIGNIFICANT — the claus sets are DISJOINT by construction, and
 * `BCN_ZONE_REFUSALS_BY_CLAU` below asserts it at module load. A clau appearing twice would mean
 * two different legal reasons for the same land, which is a transcription error, not a policy.
 */
const CLASSIFICATIONS: readonly ClauClassification[] = [
    // ── SISTEMES: public domain infrastructure ────────────────────────────────────────────────
    {
        claus: ['1a', '1c', '3', '4', '5b', 'SX1', 'SX2', 'SX3', 'SH'],
        refusal: {
            code: 'public-system',
            headline: 'Public system — no private buildable envelope applies.',
            detail:
                'This parcel is a PGM *sistema* (public domain): port, rail, technical services, ' +
                'civic way, road system or watercourse. Systems are not private buildable zones — ' +
                'their use is fixed by the governing infrastructure or special plan, and the PGM ' +
                'states no per-parcel envelope for them. There is nothing to compute, and an ' +
                'estimated setback triple here would be a fabricated legal claim.',
            ordinanceRef: BCN_PGM_INSTRUMENT_REF,
            legallyGrounded: true,
        },
    },
    // ── PARCS I JARDINS ───────────────────────────────────────────────────────────────────────
    {
        claus: ['6a', '6b', '6c'],
        refusal: {
            code: 'public-open-space',
            headline: 'Public park / garden — no private buildable envelope applies.',
            detail:
                'PGM *parcs i jardins urbans*. Buildability is nil-to-incidental and is set by a ' +
                '*Pla Especial* for the park, never by a zone parameter, so there is no per-parcel ' +
                'rule to apply.',
            ordinanceRef: BCN_PGM_INSTRUMENT_REF,
            legallyGrounded: true,
        },
    },
    // ── EQUIPAMENTS ───────────────────────────────────────────────────────────────────────────
    {
        claus: ['7a', '7b', '7c', '7hd'],
        refusal: {
            code: 'facility-plan',
            headline: 'Community facility — buildability is fixed per facility, not by a zone rule.',
            detail:
                'PGM *equipaments comunitaris i dotacions*. The buildable volume of an equipament ' +
                'is established by its *Pla Especial d’Equipaments*, facility by facility. The PGM ' +
                'clau carries no generic parameter, so PRYZM has no per-parcel rule to encode and ' +
                'refuses rather than borrow one from a neighbouring zone.',
            ordinanceRef: BCN_PGM_INSTRUMENT_REF,
            legallyGrounded: true,
        },
    },
    // ── PROTECTED / NON-URBANISABLE SOIL ──────────────────────────────────────────────────────
    {
        claus: ['9', '27', '28', '29'],
        refusal: {
            code: 'protected-soil',
            headline: 'Protected / non-urbanisable soil — no urban envelope exists.',
            detail:
                'Either a protective easement around a general system (clau 9) or Collserola ' +
                '*parc forestal* — *sòl no urbanitzable* (claus 27/28/29), governed by the ' +
                'PEPNat/PEPCo special plan. There is no urban buildable envelope to construct. ' +
                'By AREA this is the single largest classification in Barcelona (~17.9 % of all ' +
                'municipal ground) and it is exactly the land an estimated envelope must never ' +
                'be drawn over.',
            ordinanceRef: BCN_PGM_INSTRUMENT_REF,
            legallyGrounded: true,
        },
    },
    // ── VERD PRIVAT PROTEGIT — private land, still not buildable ──────────────────────────────
    {
        claus: ['8a'],
        refusal: {
            code: 'protected-private-green',
            headline: 'Protected private green (clau 8a) — the point of the zone is that it is not built on.',
            detail:
                'PGM *verd privat protegit*. Unlike a park this is PRIVATE land, so it is not a ' +
                'system — but the whole purpose of the qualification is to keep it unbuilt. It is ' +
                'classified separately from public open space precisely so the answer does not ' +
                'read as "this is public land", which would be wrong about the ownership while ' +
                'right about the outcome.',
            ordinanceRef: BCN_PGM_INSTRUMENT_REF,
            legallyGrounded: true,
        },
    },
    // ── VOLUMETRIA ESPECÍFICA (clau 18) — 22.5 % of the city's buildable land ──────────────────
    {
        claus: ['18'],
        refusal: {
            code: 'derived-plan',
            headline:
                'Specific volumetry (clau 18) — buildability is fixed by the approved volumetric ' +
                'ordering for this site, which PRYZM does not hold.',
            detail:
                'PGM Art. 306: this clau covers land whose building corresponds to the ordination ' +
                'type *by specific volumetry, according to Partial Plans or block orderings ' +
                'definitively approved, or with a specification of specific volume*, and the ' +
                'buildable floor area is *that resulting from the established volumetric ordering*. ' +
                '⚠ READ THAT PRECISELY: the PGM does not state the rule — it POINTS AT ANOTHER ' +
                'DOCUMENT, a different one per site. There is no generic parameterisation of clau ' +
                '18 to encode, and inventing a typical FAR or occupancy would manufacture a number ' +
                'the ordinance does not contain, across 22.5 % of Barcelona’s private buildable ' +
                'land. The honest answer is this refusal. Resolving it is a DATA-ACQUISITION ' +
                'problem (ingesting per-site approved volumetries from RPUC/NUMAMB into the ' +
                '`explicit-area` rule kind), not a rule-authoring one — plan Phase 5.',
            ordinanceRef:
                'PGM-1976 NNUU Art. 306 (Zona subjecta a ordenació volumètrica específica). ' +
                BCN_PGM_INSTRUMENT_REF,
            legallyGrounded: true,
        },
    },
    // ── DERIVED-PLAN ZONES: remodelació / conservació / renovació urbana ──────────────────────
    {
        claus: ['14a', '14b', '15', '16', '17', '17/6'],
        refusal: {
            code: 'derived-plan',
            headline: 'Governed by a derived plan — no generic zone envelope exists.',
            detail:
                'PGM *remodelació física* (14a/14b), *conservació de l’estructura urbana i ' +
                'edificatòria* (15) and *renovació urbana* — rehabilitació (16) / transformació ' +
                'd’ús (17, 17/6). Every one of these delegates the buildable determination to a ' +
                'derived instrument (PERI, pla especial, estudi de detall) approved for the ' +
                'specific ámbito. As with clau 18, the rule is not absent — it is elsewhere, and ' +
                'PRYZM does not hold it. Together these are ~2.2 % of the city’s private buildable ' +
                'land.',
            ordinanceRef: BCN_PGM_INSTRUMENT_REF,
            legallyGrounded: true,
        },
    },
];

/**
 * clau → refusal. Built once, and it ASSERTS DISJOINTNESS: a clau classified twice is a
 * transcription error that would otherwise resolve to whichever row happened to be last.
 */
export const BCN_ZONE_REFUSALS_BY_CLAU: ReadonlyMap<string, ClassifiedRefusal> = (() => {
    const m = new Map<string, ClassifiedRefusal>();
    for (const c of CLASSIFICATIONS) {
        for (const clau of c.claus) {
            if (m.has(clau)) {
                throw new Error(
                    `[site-parcel-data] Barcelona clau "${clau}" is classified twice — two ` +
                    'different legal reasons for the same land is a transcription error (L-550).',
                );
            }
            m.set(clau, c.refusal);
        }
    }
    return m;
})();

/**
 * The refusal for a Barcelona clau, or `null` if this clau is NOT classified as un-buildable.
 *
 * `null` means "keep today's behaviour" — either a rule pack answers, or the estimated fallback
 * does. It never means "buildable"; it means this table makes no claim.
 */
export function barcelonaZoneRefusal(clau: string): ClassifiedRefusal | null {
    return BCN_ZONE_REFUSALS_BY_CLAU.get(clau) ?? null;
}

/**
 * The claus this table refuses. Exported for the coverage probe, so the measured clau
 * distribution can be scored against what actually ships rather than against a hand-kept list
 * that drifts (the probe must not be able to disagree with the code path it characterises —
 * the SPAIN-CADASTRAL-DISSOLVE-PROBE precedent).
 */
export const BCN_REFUSED_CLAUS: readonly string[] = [...BCN_ZONE_REFUSALS_BY_CLAU.keys()];

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SECONDARY CLASSIFICATION — the HARMONISED MUC code, and the probe that earned it
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// THE GAP THE PROBE FOUND (and that the enumeration alone could not close). Scoring the L-538
// measurement against the shipping registry surfaced four claus nobody had listed:
//
//     1a-5b (n=2, label "Vies cíviques")        3-5   (n=1, label "Sistema viari bàsic")
//     7b-6b (n=1, label "Parcs i jardins")      3-6b  (n=1, label "Parcs i jardins urbans")
//
// COMPOSITE claus — `A-B`, where the MUC's own label and harmonised code both report the
// EFFECTIVE qualification. Every one is a system. They were falling to the estimated pack, i.e.
// a fabricated setback triple on a civic way and on parkland. Composites are open-ended (any
// pair may occur), so enumerating the four we happened to sample would fix the sample and not
// the defect.
//
// THE DISCRIMINATOR, MEASURED NOT ASSUMED. Cross-tabulating clau × `CODI_QUAL_MUC` over all
// 1 014 resolved points:
//
//     S* / SX*  →  1a, 1c, 3, 4, 5b, 9, 27, 28, 29, 6a/6b/6c, 7a/7b/7c/7hd, SH, SX1/2/3,
//                  plus every composite. **ZERO buildable claus. Not one.**
//     A1, M*, R* →  22a, 22@, 15, 16, 17/6, 8a, 12, 12b, 13a, 13b, 18, 20a/*. No systems.
//
// The separation is total across the whole city, and it is not a coincidence of the sample: `S`
// is what *sistema* means in the harmonised cross-Catalonia taxonomy.
//
// ⚠ WHY THIS DOES NOT CONTRADICT `mucZoningProxy.js`'s STANDING WARNING that the harmonised code
// "must never select a rule pack". That warning is about RESOLUTION — `R2` cannot distinguish
// 13a from 13b, so it cannot choose a pack, and this module still never uses it to. But
// "is this land a system?" is a strictly COARSER question, and the coarse code answers coarse
// questions correctly. Using it here is the opposite of the error the warning names.
//
// ⚠ IT IS A WEAKER EVIDENCE TIER AND SAYS SO. The clau enumeration above is article-attributable;
// this is a taxonomy classification. It therefore runs ONLY when the enumeration makes no claim,
// and its `ordinanceRef` names the harmonised taxonomy rather than a PGM article — an unsourced
// article number attached to a refusal is still an unsourced claim about the law (L-526).

/** `CODI_QUAL_MUC` prefixes that denote a *sistema* in the harmonised Catalan taxonomy. */
const HARMONISED_SYSTEM_PREFIX = 'S';

const HARMONISED_SYSTEM_REFUSAL: ClassifiedRefusal = {
    code: 'public-system',
    headline: 'Public system — no private buildable envelope applies.',
    detail:
        'The municipal clau is not one PRYZM has classified individually, but the harmonised ' +
        'Catalan qualification code for this parcel is a *sistema* (S…) — public domain: road, ' +
        'rail, port, technical services, open space, community facility, watercourse or ' +
        'protected soil. Systems carry no private buildable envelope. This classification comes ' +
        'from the harmonised MUC taxonomy rather than from a named PGM article, which is a ' +
        'weaker evidence tier than PRYZM’s per-clau table — it is used only where that table ' +
        'makes no claim, and it is stated here rather than dressed up as an article citation.',
    ordinanceRef:
        'Harmonised qualification code CODI_QUAL_MUC (Mapa Urbanístic de Catalunya, Generalitat ' +
        'de Catalunya) — class S… = sistema. Underlying instrument: ' + BCN_PGM_INSTRUMENT_REF,
    legallyGrounded: true,
};

/**
 * The refusal for a Barcelona parcel, given its municipal clau and — optionally — the harmonised
 * MUC code the same lookup returned. `null` means this module makes NO claim: either a rule pack
 * answers, or the estimated fallback does. It never means "buildable".
 *
 * The per-clau table wins; the harmonised code is consulted only where the table is silent.
 */
export function barcelonaZoneRefusalFor(
    clau: string,
    harmonisedCode?: string | null,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal | null {
    // L-553 — the per-parcel facts are merged onto the LEGAL refusals too, not only the coverage
    // gap. "The Parc de la Ciutadella is public open space" is a better answer when the card also
    // shows the user their own parcel reference and area: it proves the classification is about
    // THEIR land and not a generic message the panel fell back to.
    const attach = (r: ClassifiedRefusal): EnvelopeRefusal => ({ ...r, knownFacts: [...knownFacts] });
    const byClau = BCN_ZONE_REFUSALS_BY_CLAU.get(clau);
    if (byClau) return attach(byClau);
    // ── §L-590c / ADR-0276 — clau 22a's NAMED refusal, ahead of the coverage gap. ────────────
    //
    // ⚠ IT MUST RESOLVE HERE AND NOT IN `barcelonaNoRulePackRefusal`, and the ordering is the
    // whole point: `resolveZoneDisposition` consults `refusalFor` BEFORE `noRulePackRefusal`, so
    // putting 22a here is what stops the generic *"PRYZM has not encoded this zone's rules yet"*
    // card — a statement about our coverage that has been FALSE since `esBarcelonaIndustrial.ts`
    // was authored — from being what a 22a owner reads. The same correction was made for 13b in
    // `coverageGapReasonFor`, for the same reason: a false statement about OUR coverage is the
    // mirror image of the false statement about the LAW that this module exists to prevent.
    //
    // ⚠ AND IT IS NOT IN THE `CLASSIFICATIONS` TABLE ABOVE, deliberately. Every row there is
    // `legallyGrounded: true` — a claim about what the ordinance says about the land. This one is
    // `legallyGrounded: false`: the ordinance is fully known and PRYZM cannot locate the parcel
    // within it. Filing it as a legal classification would make it look like the PGM refuses an
    // envelope on industrial land, which is the false-negative-about-someone's-land error L-553
    // ranks as the worst of the set.
    if ((BCN_INDUSTRIAL_ZONE_CODES as readonly string[]).includes(clau)) {
        return barcelonaRegimeUndeterminedRefusal(clau, null, knownFacts);
    }
    // ── §DEC-1 (founder, 2026-08-01) — clau `22@`'s PERMANENT cited refusal. ─────────────────
    //
    // ⚠ IT SITS HERE, ALONGSIDE 22a, AND NOT IN `CLASSIFICATIONS`, FOR A SPECIFIC REASON — and it
    // is NOT the reason 22a is here. 22a is excluded from the table because its refusal is
    // `legallyGrounded: false`; 22@'s is `true` and would be at home there. What it cannot be is a
    // STATIC row: L-553 rule 1 requires the card to open by naming the user's zone in the
    // ordinance's own words, so the refusal needs the caller's `zoneLabel` — a per-lookup value a
    // `ClassifiedRefusal` row cannot carry (that is exactly what the `ClassifiedRefusal` type
    // comment forbids). A function beside 22a's is the shape that already exists for that.
    //
    // ⚠ AND IT MUST RESOLVE **BEFORE** `barcelonaNoRulePackRefusal`, which is what
    // `resolveZoneDisposition`'s ordering gives it. The coverage-gap card's 22@ copy — *"PRYZM has
    // read and encoded the base industrial zone (22a) but not 22@"* — was FALSE from the moment
    // `esBarcelona22Arroba.ts` was authored, and it has now been deleted from
    // `coverageGapReasonFor` rather than merely out-ranked.
    if ((BCN_22ARROBA_ZONE_CODES as readonly string[]).includes(clau)) {
        return barcelona22ArrobaDerivedPlanRefusal(clau, null, knownFacts);
    }
    // ── §BARE-20A-EXHAUSTED (L-673) — bare `20a`'s subzone-undetermined refusal. ─────────────
    //
    // ⚠ THE MATCH IS EXACT-EQUALITY, NOT A PREFIX. `20a/6`…`20a/12` are PACKED, and the registry
    // gives a pack precedence over any refusal — but relying on that ordering to keep the ten
    // suffixed claus out of this branch would put the correctness of ten real envelopes in the
    // hands of a lookup order in another module. `clau === '20a'` cannot be got wrong by a
    // refactor. (Same argument as the module header's "no prefix matching, ever".)
    //
    // ⚠ AND IT MUST RESOLVE **BEFORE** `barcelonaNoRulePackRefusal`, which is what
    // `resolveZoneDisposition`'s ordering gives it. The coverage-gap card's 20a copy said the
    // blocker was *"THIS subzone's own sourced numbers: its separations, its minimum parcel size,
    // its maximum occupation and its net buildability index"* — FALSE since `bcn20aSubzones.ts`
    // was authored, which holds all four for all ten subzones from the primary text. It has been
    // deleted from `coverageGapReasonFor` rather than merely out-ranked, exactly as 13b's, 22a's
    // and 22@'s were.
    if (clau === '20a') {
        return barcelona20aSubzoneUndeterminedRefusal(clau, null, knownFacts);
    }
    if (
        typeof harmonisedCode === 'string' &&
        harmonisedCode.trim().toUpperCase().startsWith(HARMONISED_SYSTEM_PREFIX)
    ) {
        return attach(HARMONISED_SYSTEM_REFUSAL);
    }
    return null;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// L-553 — THE COVERAGE-GAP REFUSAL (`no-rule-pack`). FOUNDER-DECIDED, 2026-07-21.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// THE DECISION. A privately-buildable clau with no authored pack used to fall to the generic
// estimated pack, which draws a front/side/rear setback triple on ANY polygon. The founder ruled
// that off: *"the most important is to have a robust, TRUSTED-AGAINST-REAL-LEGAL-DATA result."*
//
// THE ARGUMENT IS ABOUT SHAPE, NOT PRECISION — and that is why a badge could not save it. For
// `12`, `12b` and `13b` the ordination type is **segons alineacions de vial**: the façade sits ON
// the street line and a *profunditat edificable* is measured from it. A setback triple cannot
// express that at all (ADR-0270 is entirely about this), so an estimated triple there is not an
// imprecise answer to the right question — it is a confident answer to a DIFFERENT question,
// and it silently yields an envelope covering the whole plot depth on exactly the parcels where
// land value is highest. An "ESTIMATED" chip labels uncertainty; it cannot label a category
// error. C58 §1.11 · C58 §1.7a.
//
// THE COST, ACCEPTED KNOWINGLY: 51.6 % of Barcelona's private buildable land (`13b`, `12`,
// `12b`, `22a`, `22@`, `20a/*`) loses its envelope until Phases 1–3 land.
// ⇒ §L-583 UPDATE: `13b` has since shipped a pack (8.8 pp of that 51.6 %), so the standing cost is
// now ~42.8 % — `12`, `12b`, `22a`, `22@`, `20a/*`. The argument below is unchanged for those.
// ⇒ §DEC-1 UPDATE (2026-08-01): `22@` (2.06 pp) has LEFT the coverage-gap set entirely. It is not
// waiting on a pack — the founder closed it as a PERMANENT legally-grounded refusal, because the
// MPGM omits the buildable depth by design and the geometry lives in the PMU.
// ⇒ §BARE-20A-EXHAUSTED UPDATE (2026-08-01): `12` and the ten `20a/*` claus have PACKS and have had
// since 2026-07-22, so they were never in the gap this function speaks for; bare `20a` (1.55 pp) has
// now LEFT it too, for a `regime-undetermined` refusal — the ordinance states ten subzone regimes
// and no source carries the selector. **The coverage gap this function still speaks for is `12b`
// and `21`.** Every other clau is answered by a pack or by a named refusal one branch up.
//
// ⚠ WHICH MAKES THE CARD THE THING THAT DECIDES WHETHER THIS SUCCEEDS OR BACKFIRES, and the copy
// below is therefore load-bearing product surface, not a log line. Half of Barcelona will read
// it. If it reads as "broken" rather than "we don't have this zone's rules yet", we will have
// traded a LABELLED WRONG ANSWER for an APPARENT PRODUCT FAILURE — strictly worse.
//
// The precedent is from the same day and it is humbling: fabricated context-building heights were
// rendered translucent so a guess could not look surveyed. The founder looked at it and asked
// *"why are some buildings wireframe?"* — not *"why don't we know those heights?"*. **The signal
// was honest and it still failed, because it communicated "render artifact" instead of "missing
// data".** So this copy obeys four rules:
//
//   1. NAME THE ZONE, in the ordinance's own words, first. It proves we identified their land
//      correctly — the single fastest way to distinguish "missing data" from "crashed".
//   2. SAY WHAT IS MISSING, in the user's terms: PRYZM has not encoded THIS zone's rules yet.
//      Never "no envelope applies" — that is the LEGAL refusal, a different answer that must stay
//      visibly different, or the two collapse and we are back to L-550's original defect.
//   3. SAY WHY NOTHING IS DRAWN, without jargon: a generic estimate would be the wrong SHAPE for
//      this zone, and we would rather show nothing than something wrong.
//   4. PLACE IT ON A ROADMAP, with the covered zone named. "Not yet" is forgivable; "no" is not.

/**
 * WHY nothing is drawn — **per zone family, because the reason genuinely differs and a single
 * sentence would be FALSE for half of them.**
 *
 * ⚠ THE BUG THIS EXISTS TO PREVENT, caught while reviewing the copy: the first draft said, for
 * every unpacked clau, *"the façade sits on the street line, with a maximum buildable depth
 * measured back from it, so a setback estimate would be the wrong shape."* That is exactly right
 * for `12`/`12b`/`13b` — and **flatly wrong for `20a`**, where *edificació aïllada* separations
 * ARE real front/side/rear distances and a setback triple is the CORRECT shape (ADR-0272 §3.7
 * says so explicitly). Shipping it would have told a `20a` owner a true-sounding fact about their
 * land that the ordinance does not say — the C58 §1.11 category error, committed in the very copy
 * written to explain why we refuse to commit it.
 *
 * So the reason is resolved per family, each stating that family's ACTUAL blocker. Legal fidelity
 * outranks tidy copy, in the explanation as much as in the number.
 */
function coverageGapReasonFor(clau: string): string {
    // *Alineacions de vial* — the shape itself is wrong. 12 / 12b.
    //
    // ⚠ §L-583 — `13b` was in this list and is NOT any more: it now has a pack
    // (`esBarcelonaSemiintensiva.ts`), and the registry gives a pack precedence over any refusal,
    // so this branch is unreachable for it. The clau is left OUT rather than left in-and-dead:
    // this copy is what a user reads, and a sentence claiming we have not encoded a zone we HAVE
    // encoded is a false statement about our own coverage — the mirror image of the false
    // statement about the law that the rest of this module exists to prevent.
    //
    // ⚠ §BARE-20A-EXHAUSTED, second correction — **`12` was in this list and is NOT any more.**
    // `ES_BARCELONA_NUCLI_ANTIC_PACK` registers clau `12` (shipped 2026-07-22), and the registry
    // gives a pack precedence over any refusal, so this branch is unreachable for it. Left out
    // rather than left in-and-dead, for the reason the `13b` note above gives. `12b` stays: it has
    // no pack, and its own subzone rules (Art. 320.2a/3a subzona II — the depth and height of the
    // EXISTING neighbours) are a different KIND of input we hold nothing for.
    if (clau === '12b') {
        return (
            'PRYZM could draw a generic front/side/rear setback estimate here, and until now it ' +
            'did. It has been switched off deliberately: this zone is regulated by a different ' +
            'KIND of rule — the façade sits on the street line, with a maximum buildable depth ' +
            'measured back from it — so a setback estimate would be the wrong SHAPE, not merely ' +
            'an imprecise number, and it would quietly over-state your buildable area by ' +
            'covering the full depth of the plot. We would rather show you nothing than ' +
            'something wrong.'
        );
    }
    // Industrial / activitats — the LIMITS are a coverage % and a floor-area index, which the
    // solver resolves and displays but cannot yet apply to geometry (ADR-0272, Phase 2).
    //
    // ⚠⚠ §L-590c — **`22a` WAS IN THIS BRANCH AND IS NOT ANY MORE**, and the removal follows the
    // same rule as `13b`'s above: `barcelonaZoneRefusalFor` now returns a NAMED
    // `regime-undetermined` refusal for `22a` (ADR-0276), and `resolveZoneDisposition` consults
    // that BEFORE the coverage gap — so this text is unreachable for `22a`, and leaving it in
    // would leave a sentence claiming we have not encoded a zone we HAVE encoded. That is a false
    // statement about our own coverage: the mirror image of the false statement about the law
    // that the rest of this module exists to prevent.
    //
    // ⚠⚠ §DEC-1 — **`22@` WAS IN THIS BRANCH AND IS NOT ANY MORE.** Its copy said PRYZM *"has read
    // and encoded the base industrial zone (22a) but not 22@"*, which became FALSE the moment
    // `esBarcelona22Arroba.ts` was authored: the MPGM 22@ text IS read and encoded, in full, from
    // the primary 2006 source. `barcelonaZoneRefusalFor` now hands `22@` a named, legally-grounded
    // `derived-plan` refusal (`barcelona22ArrobaDerivedPlanRefusal`), and `resolveZoneDisposition`
    // consults that BEFORE the coverage gap — so this text was unreachable AND false, which is the
    // worst pair. It is DELETED rather than left dead, for the same reason 13b's and 22a's were:
    // an unreachable false sentence about our own coverage is one refactor away from a user.
    // *Edificació aïllada* — separations ARE the right shape here. The blocker is that we hold
    // none for this zone, and the generic defaults belong to a different zone entirely.
    //
    // ⚠⚠ §BARE-20A-EXHAUSTED — **`20a` AND `20a/*` WERE IN THIS BRANCH AND ARE NOT ANY MORE**, and
    // the removal follows the same rule as `13b`'s, `22a`'s and `22@`'s above. The ten `20a/*`
    // claus have a PACK (`bcn20aSubzones.ts` + `esBarcelona20aAillada.ts`), so this text was
    // already unreachable for them; bare `20a` now takes
    // `barcelona20aSubzoneUndeterminedRefusal`, which `resolveZoneDisposition` consults BEFORE the
    // coverage gap. The sentence claiming PRYZM does not hold *"THIS subzone's own sourced
    // numbers: its separations, its minimum parcel size, its maximum occupation and its net
    // buildability index"* named exactly the four things `BCN_20A_SUBZONES` transcribes for all
    // ten subzones from the primary text — unreachable AND false, the worst pair. It is DELETED
    // rather than left dead: an unreachable false sentence about our own coverage is one refactor
    // away from a user.
    //
    // `21` stays. It is a genuinely different zone with no pack and no transcription, and the
    // sentence is true of it.
    if (clau === '21' || clau.startsWith('21/')) {
        return (
            'This zone IS governed by real separation distances to the street and to the ' +
            'boundaries — so an envelope of the usual shape is the right answer here. What PRYZM ' +
            'does not yet hold is THIS zone’s own sourced numbers: its separations, its ' +
            'minimum parcel size, its maximum occupation and its net buildability index. The ' +
            'generic defaults we would otherwise fall back on are a different zone’s numbers, ' +
            'and presenting them as yours would be worse than showing none.'
        );
    }
    // Anything else — true of every zone, and it claims nothing beyond what we know.
    return (
        'PRYZM has not yet read and accepted the governing article for this zone, and it will ' +
        'not publish a buildable figure it cannot cite. A generic setback estimate would be a ' +
        'number the ordinance does not contain. We would rather show you nothing than something ' +
        'wrong.'
    );
}

/**
 * What PRYZM covers today vs next — kept beside the copy that cites it so they cannot drift.
 *
 * ⚠ §BARE-20A-EXHAUSTED — **this line was stale and it is user-facing.** It named `12` and "the 20a
 * family" as *next*; both shipped on 2026-07-22, and it omitted `12` and the ten `20a/*` claus from
 * the coverage it claims. A roadmap sentence that under-states our own coverage is the same class
 * of false statement as one that over-states it — it is read by the owner of a zone we DO cover.
 */
const BCN_ROADMAP_LINE =
    'Barcelona coverage today: clau 13a / 13E (the Eixample) and clau 13b (densificació urbana ' +
    'semiintensiva), where the buildable depth is constructed per PGM Art. 242 from the real ' +
    // ⚠ The clau-12 entry names the ZONE and not its article. This line is appended to every
    // coverage-gap card, including `12b`'s, and quoting subzona I's construction article on
    // subzona II's land is exactly the mis-citation `BCN_NUCLI_ANTIC_ZONE_CODES` exists to
    // prevent — a roadmap sentence is still a statement about the law when it carries an article.
    'cadastral block; clau 12 (nucli antic de substitució), constructed the same way from the ' +
    'block; and the ten subzones of the 20a family (edificació aïllada), which take real ' +
    'separation distances. Next: 12b, whose rules are a survey of the existing neighbours. Each ' +
    'zone ships only once its governing article has been read and accepted — which is why this ' +
    'one is not here yet.';

/**
 * The refusal shown on a privately-buildable clau PRYZM has not authored a pack for.
 *
 * ⚠ `legallyGrounded: false` — the ONE refusal in the vocabulary that is a statement about
 * PRYZM's coverage rather than about the law, and the UI MUST render it differently. Letting a
 * coverage gap wear the same chip as "the ordinance grants no envelope here" would tell a
 * developer their perfectly buildable plot cannot be built on. That is the opposite error from
 * the one this whole slice fixes, and it is worse, because it is a false negative about someone's
 * land.
 */
export function barcelonaNoRulePackRefusal(
    clau: string,
    clauLabel?: string | null,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal {
    const named = clauLabel && clauLabel.trim() ? `${clauLabel.trim()} (clau ${clau})` : `clau ${clau}`;
    return {
        code: 'no-rule-pack',
        // Rule 1 — the zone, named, first. Rule 2 — what is missing, plainly.
        headline: `${named} — PRYZM has not encoded this zone's building rules yet.`,
        detail:
            'This is a coverage gap, not an error, and your parcel was identified correctly — ' +
            'the zone above is what the Generalitat’s planning map returns for this land. ' +
            // Rule 3 — why nothing is drawn, in the user's terms, and TRUE OF THIS ZONE (see
            // `coverageGapReasonFor`: a single sentence here would have been false for 20a).
            coverageGapReasonFor(clau) + ' ' +
            // Rule 4 — the roadmap.
            BCN_ROADMAP_LINE,
        // NOT a PGM article. This refusal is a statement about PRYZM, and citing an ordinance
        // for it would be the L-526 error (an authoritative-looking citation for a claim the
        // document does not make).
        ordinanceRef: null,
        legallyGrounded: false,
        knownFacts: [...knownFacts],
    };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// §L-590c / ADR-0276 — THE FOURTH REFUSAL: *"the ordinance states two regimes and no public
// source says which one your parcel is in."* FOUNDER-RULED 2026-07-22.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// THE SITUATION IT NAMES. PGM Art. 350 governs clau `22a` (*zona industrial*) — **17.5 % of
// Barcelona's private buildable land**, fully sourced from the primary text (L-590) and fully
// solvable since ADR-0273. And it governs it TWICE:
//
//   • **Art. 350.2.a–f** — for industrial land *mancada de Pla Parcial*. Full conditions,
//     including the 350.2.c street-width height table and the 350.2.b concentric band.
//   • **Art. 350.1** — for land WITH a definitively-approved *Pla Parcial*. The PGM imposes only
//     two ceilings; the height, the storeys and any band come from that plan's own plànols and
//     ordenances, a document PRYZM does not hold.
//
// **Neither the Catastro parcel nor the MUC records which regime applies.** The field does not
// exist in either source.
//
// ⚠ WHY THE OTHER THREE REFUSALS WOULD EACH BE A DIFFERENT FALSE STATEMENT — the argument that
// earns a fourth code rather than a fourth caveat (ADR-0276 §2):
//
//   • `no-rule-pack` — *"PRYZM has not encoded this zone's rules yet."* **False.** The pack is
//     authored from the primary PDF, schema-validated, and solved end-to-end against a real
//     block. More authoring would not move it one inch. This is the same defect that had `13b`
//     removed from `coverageGapReasonFor`: a false statement about OUR OWN coverage.
//   • `source-data-unavailable` — **false, and harmful in a specific way.** That code is defined
//     as the ONE TRANSIENT refusal and is the only one that earns a retry affordance; the card
//     literally says *"Re-select the parcel to try again — this usually clears on a second
//     attempt."* Nothing clears here on a retry, because the input is not a fetch that failed,
//     it is a legal fact nobody publishes. It would loop a user for ever.
//   • `derived-plan` — the closest legal cousin, and the most dangerous. It asserts that the
//     general plan DELEGATES buildability to another document for this parcel. That is true in
//     exactly one of the two regimes — i.e. asserting it would assert the very fact we cannot
//     establish, on someone's land, under a citation. **That is L-526 verbatim.**
//
// ⇒ §CONTEXT-DATA-HONESTY, one turn further: a coverage gap, a fetch failure and *"we cannot make
// this determination"* are THREE different answers, and this is the third.
//
// ⚠ AND THIS IS THE ONLY REFUSAL THAT STATES LIMITS (C58 §1.13.7). Every other refusal says
// nothing numeric because it has nothing to say. Here we hold two figures the ordinance states in
// BOTH regimes, and withholding them would be its own dishonesty — the user would read "we can
// tell you nothing" when we can tell them the most load-bearing number on the zone. The safety
// argument is exact and has two halves:
//   1. The figures live in `detail` and `ordinanceRef` — PROSE under a citation. **Every numeric
//      field of the envelope stays null** (C58 §1.13.3, `buildRefusedEnvelope` unchanged), so
//      `storeyCap`, the generators, the Cesium massing and the C58 §1.8 generator bounds all
//      still receive nothing and can extrude nothing.
//   2. Prose is the ONLY form that can carry the occupation's condition. `maxCoverage: 0.9` in a
//      field is unconditional by construction; *"90 %, where the sector is ordered segons
//      alineacions de vial"* is the true statement, and it does not fit in a number.
//   ⚠ They are also NOT put in `knownFacts`, whose contract is "facts only — never a constraint,
//   never a number the user could mistake for an allowance". A FAR ceiling is exactly such a
//   number, and the `knownFacts` block renders as bare lines with no room for the condition.

/**
 * The label used when no caller supplies one. Taken from the pack rather than the MUC because we
 * know this zone's name from the ordinance itself — and `barcelonaZoneRefusalFor`'s signature
 * carries no label, so relying on the provider would silently drop L-553 rule 1 (name the zone
 * first) on the very card that most needs it.
 */
const BCN_22A_DEFAULT_LABEL = 'Zona Industrial';

/**
 * The citation carried by the refusal below. **Narrower than the pack's `BCN_22A_ORDINANCE_REF` on
 * purpose:** the pack's ref names Art. 350.2.b/.c/.d/.e/.f, and this card asserts none of those.
 * Citing them here would attach an authoritative-looking reference to paragraphs the card is
 * explicitly declining to apply — a citation that cannot be checked against the claim, which is
 * the L-526 failure in miniature.
 */
export const BCN_22A_REGIME_ORDINANCE_REF =
    'PGM-1976 NNUU, clau 22a (Zona Industrial, Secció 8a, Arts. 348–351). ' +
    'Edificabilitat 2 m² sostre/m² sòl: stated identically by Art. 350.1.1r, Art. 350.1.2n and ' +
    'Art. 350.2.a, and therefore independent of both the Pla-Parcial regime and the sector’s ' +
    'ordering type. Ocupació màxima 90 %: Art. 350.1.1r and Art. 350.2.a, for sectors ordered ' +
    '*segons alineacions de vial* (Art. 349.1); Art. 350.1.2n caps *edificació aïllada* sectors ' +
    'at 70 % instead. ⚠ The alçada màxima (Art. 350.2.c) and the franja concèntrica del 70 % de ' +
    'l’illa (Art. 350.2.b) are NOT cited for this parcel: they govern only land *mancada de Pla ' +
    'Parcial*, and PRYZM holds no source establishing which regime applies. ' +
    'Source: MMAMB re-edition of the Normativa Urbanística Metropolitana (1976 NNUU / 1988 Text ' +
    'Refós), p. 116, committed at docs/04-reference/jurisdictions/es/es-ct/08019-barcelona/' +
    'PGM-NNUU-metropolitana.pdf — a manually re-typeset re-edition, primary but NOT ' +
    'authenticated. §L-590c.';

/**
 * §L-590c / ADR-0276 — the `regime-undetermined` refusal for Barcelona clau `22a`.
 *
 * Says, in substance: *"PGM Art. 350 caps this land at 2 m² sostre/m² sòl — that holds whichever
 * regime governs your parcel. The occupation cap is 90 % on the ordinary alignment ordering. The
 * buildable HEIGHT and the concentric band depend on which of the article's two regimes applies,
 * and no public source records that. Here is exactly what we would need."*
 *
 * ⚠ `legallyGrounded: false`. The LAW is fully known — both halves of it, read from p. 116 and
 * transcribed. What is missing is which half applies to this parcel, which is a statement about
 * PRYZM's inputs. Flipping this to `true` would render the card as *"the ordinance grants no
 * envelope here"* and tell an industrial landowner their plot cannot be built on.
 *
 * ⚠ `ordinanceRef` IS present, unlike the other two `legallyGrounded: false` refusals — and that
 * is not an inconsistency. Those two cite nothing because they make no claim about the ordinance.
 * This one DOES make claims about the ordinance (the FAR, the occupation, the existence of two
 * regimes), and C58 §1.13.4 requires a claim about the law to cite what was actually read.
 */
export function barcelonaRegimeUndeterminedRefusal(
    clau: string,
    clauLabel?: string | null,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal {
    const L = BCN_22A_REGIME_NEUTRAL_LIMITS;
    const named = `${(clauLabel && clauLabel.trim()) || BCN_22A_DEFAULT_LABEL} (clau ${clau})`;
    return {
        code: 'regime-undetermined',
        // L-553 rule 1 — name the zone first, then say what is missing in ONE clause. The
        // headline deliberately does NOT say "no envelope"; it says which determination failed.
        headline:
            `${named} — PRYZM holds this zone's limits, but the governing article has TWO ` +
            'regimes and no public source says which one applies to your parcel.',
        detail:
            // ── What we CAN state, and it is stated first, because it is the part that is true. ──
            `PGM Art. 350 caps this land at a floor-area index of ${L.plotRatioFAR} m² of floor ` +
            `per m² of site. That figure holds whichever regime governs your parcel — all three ` +
            `paragraphs of the article state it (Arts. ${L.plotRatioFARArticles}). Maximum ` +
            `ground occupation is ${(L.maxCoverage * 100).toFixed(0)} % of the parcel ` +
            `(Arts. ${L.maxCoverageArticles}) ${L.maxCoverageCondition} ` +
            // ── What we CANNOT state, and exactly why. ──
            'What PRYZM cannot establish is the buildable HEIGHT or the band the building must ' +
            'sit within above the ground floor. Those govern only industrial land that is NOT ' +
            'covered by a definitively-approved detailed plan (*Pla Parcial*); where one is in ' +
            'force, that plan sets them instead, and its heights can differ from the general ' +
            'plan’s by a factor of two. ' +
            // ── The missing input, NAMED. This is the sentence that makes the refusal actionable
            //    and that distinguishes it from "we don't know". ──
            'The missing input is a single fact about your parcel: is a definitively-approved ' +
            'Pla Parcial in force here, and if so, what ordering type does it assign this ' +
            'sector? Neither the cadastral record nor the Generalitat’s planning map carries ' +
            'it. We would rather give you the two figures that are certain and decline the rest ' +
            'than publish a height that may belong to the other regime.',
        // C58 §1.13.4 — cite what was actually read. This refusal makes real claims about the
        // ordinance, so it must carry the ordinance's own reference; the two other
        // `legallyGrounded: false` refusals cite nothing because they claim nothing about it.
        ordinanceRef: BCN_22A_REGIME_ORDINANCE_REF,
        legallyGrounded: false,
        knownFacts: [...knownFacts],
    };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// §DEC-1 — clau `22@`: **THE ORDINANCE STATES NO BUILDABLE DEPTH, BY DESIGN.**
// FOUNDER-CLOSED 2026-08-01 as a PERMANENT cited refusal.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// WHY THIS IS A *LEGAL* REFUSAL AND NOT A COVERAGE GAP — the distinction the whole module turns on.
// MPGM 22@ Art. 8.1 states a complete by-right, per-parcel regime: a floor-area index, an
// occupation cap, a minimum parcel and a four-band street-width height table, all reachable
// *directament per llicència*. `esBarcelona22Arroba.ts` transcribes every one of them from the
// primary 2006 text. **The one thing Art. 8 does not state — in any form — is a *profunditat
// edificable*.** Founder research across BCNROC, the 2024 municipal *Instrucció* on 22@
// interpretation and the 2025 MPGM amendment found no manual, no CAD/GIS geometry and no permit
// guidance defining one, because modern 22@ resolves its geometry through **PMUs, *fitxes
// urbanístiques* and *plànols d'ordenació***. ⇒ **The omission is INTENTIONAL.** The rule is not
// absent, and it is not un-encoded: it is in the derived instrument for that site.
//
// ⇒ `derived-plan`, `legallyGrounded: true`. Each of the alternatives is a different false
// statement, exactly as ADR-0276 argued for 22a:
//   • `no-rule-pack` — *"PRYZM has not encoded this zone's rules."* **False**, and it was shipping
//     until today (`coverageGapReasonFor`'s deleted 22@ branch). The pack is authored in full.
//   • `regime-undetermined` — would say the ordinance states TWO regimes and we cannot tell which
//     applies. That is 22a's fact. Here the by-right regime is identified and readable; what it
//     does not contain is a depth.
//   • `source-data-unavailable` — the one TRANSIENT code, and the only one that earns a retry
//     affordance. Nothing clears on a retry: no depth exists to fetch.
//
// ⚠⚠ **AND IT PUBLISHES NO FIGURE IN ITS PROSE.** C58 §1.13.7 lets a refusal state limits under a
// citation, and 22a's card does exactly that — but 22a's two figures are REGIME-NEUTRAL (all three
// paragraphs of Art. 350 restate them). 22@'s are not: three invisible forks (Art. 9 *fronts
// edificatoris*, Art. 16 delimited ámbitos, an Art. 8.1.a *estudi de detall*) each replace Art. 8.1
// wholesale on parcels PRYZM cannot identify, so printing Art. 8.1's index or occupation as *this
// parcel's* limits would assert the very fact we cannot establish. They reach the user through
// `BCN_22ARROBA_ORDINANCE_REF` — a citation, checkable against the article — and the prose names
// only WHICH paragraph states WHICH kind of limit. The Murcia pack shipped the opposite (transcribed
// figures leaked from a classification `note` into a user-facing refusal) and a test pins it out
// there; the same pin exists here.

/** The label used when no caller supplies one. From the ordinance, never from the MUC. */
const BCN_22ARROBA_DEFAULT_LABEL = 'Zona d’activitats 22@';

/**
 * §DEC-1 — the permanent, legally-grounded `derived-plan` refusal for Barcelona clau `22@`.
 *
 * Says, in substance: *"We hold the MPGM that governs your land and we have read Art. 8.1. It
 * states a by-right envelope — but it states NO buildable depth, deliberately, because 22@ fixes
 * its geometry site by site in the Pla de Millora Urbana and its ordering plans. Here is the
 * citation; the depth is in that document, and we do not hold it."*
 *
 * ⚠ `legallyGrounded: true`, unlike 22a's. This IS a statement about the ordinance: the general
 * plan points at another instrument, which is what `derived-plan` means and what clau 18 already
 * uses. Flipping it to `false` would say PRYZM has not done the work — the false sentence §DEC-1
 * exists to delete.
 *
 * P8 — OTel span. Precedent: `estimateSuppressedRefusal` in `zoneRefusal.ts`, same package, same
 * argument (a span on a pure constructor is a no-op without an exporter, so purity is unaffected).
 */
export function barcelona22ArrobaDerivedPlanRefusal(
    clau: string,
    clauLabel?: string | null,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal {
    const span = _tracer.startSpan('pryzm.zoning.es.bcn.barcelona22ArrobaDerivedPlanRefusal');
    try {
        span.setAttribute('bcn.clau', clau);
        const L = BCN_22ARROBA_ART8_LIMITS;
        const named = `${(clauLabel && clauLabel.trim()) || BCN_22ARROBA_DEFAULT_LABEL} (clau ${clau})`;
        return {
            code: 'derived-plan',
            // L-553 rule 1 — name the zone first; then say WHICH determination the law declines to
            // make, not that we failed to make it.
            headline:
                `${named} — the governing plan states no buildable depth for this zone, by design: ` +
                'the buildable geometry is fixed by the ordering instrument approved for your site.',
            detail:
                // ── What we DO hold, first, because it is the part that is true and it is the ──
                //    fastest proof this is not a gap in our coverage.
                'PRYZM holds and has read the instrument that governs this land — the MPGM per a la ' +
                'renovació de les àrees industrials del Poblenou (districte d’activitats 22@BCN), in ' +
                'its consolidated 2006 text. This is not a coverage gap. ' +
                `Art. ${L.byRightArticle} sets out a by-right, per-parcel regime reachable directly ` +
                'by licence, and it states a floor-area index per parcel, a maximum ground ' +
                `occupation (Art. ${L.maxCoverageArticle}), a minimum parcel size ` +
                `(Art. ${L.minParcelArticle}) and a maximum height keyed to the width of the street ` +
                `the building fronts (Art. ${L.heightTableArticle}). Those limits are set out in ` +
                'full, with their paragraphs, in the citation on this card. ' +
                // ── What the ordinance does NOT state, and the fact that this is deliberate. ──
                '⚠ What the article does NOT state — not as a figure, not as a construction, not as ' +
                'a cap — is a *profunditat edificable*: how far back from the street line a building ' +
                `may extend. The zone is ordered *alineada a vial* (Art. ${L.alignmentArticle}), so ` +
                'the façade sits ON the street line and the depth is the only thing that would turn ' +
                'that alignment into a footprint. Without it there is no shape to draw, and a ' +
                'generic front/side/rear setback estimate would be the wrong KIND of rule rather ' +
                'than an imprecise number. ' +
                // ── The finding that makes this permanent rather than pending. ──
                // ⚠ "the municipal instruction of 2024", NOT "the 2024 municipal instruction" — the
                // §DEC-1 leak test forbids the substring "24 m" (an Art. 8.1.b height), and
                // "2024 municipal" contains it. The year is a fact and stays; the collision does not.
                'The omission is deliberate. A search of the municipal planning repositories, the ' +
                'municipal instruction of 2024 on the interpretation of 22@ and the 2025 amendment ' +
                'of the MPGM found no implementation manual, no published CAD or GIS geometry and ' +
                'no permit guidance defining a depth for the zone as a whole — because 22@ is ' +
                'implemented site by site, and the buildable geometry is fixed in the *Pla de ' +
                'Millora Urbana*, the *fitxa urbanística* and the *plànols d’ordenació* approved for ' +
                'your ámbito. The rule is not missing; it is in that document, and PRYZM does not ' +
                'hold it. ' +
                // ── The second, independent reason a number would be unsafe even if we had a depth.
                'Three further forks decide which article governs a given 22@ parcel at all — a ' +
                'housing *front edificatori* under Art. 9, a delimited transformation ámbito under ' +
                'Art. 16, or an *estudi de detall* converting the parcel to *edificació aïllada* — ' +
                'and none of the three is published in any source PRYZM reads. We would rather name ' +
                'the document that decides your land than draw a volume from an article that may ' +
                'not govern it.',
            // C58 §1.13.4 — this card makes real claims about the ordinance (that Art. 8.1 states
            // these kinds of limit, and that it states no depth), so it must cite what was read.
            // ⚠ The FIGURES live here, inside the citation, and nowhere else on the card.
            ordinanceRef: BCN_22ARROBA_ORDINANCE_REF,
            legallyGrounded: true,
            knownFacts: [...knownFacts],
        };
    } finally {
        span.end();
    }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// §BARE-20A-EXHAUSTED (L-673) — clau `20a` WITHOUT A SUFFIX: **TEN REGIMES, NO SELECTOR.**
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// THE SEARCH ENDED IN THE PRIMARY TEXT, NOT IN A PORTAL. CLOSURE-REGISTER blocker 7 asked for an
// exhaustive sweep of MUC · RPUC · Ajuntament Open Data · AMB · WFS/WMS · planning shapefiles for a
// bare-`20a` subzone resolver, and recorded that a negative result closes it. The sweep turns out
// to be unnecessary, because the PGM settles the question in its own zone catalogue:
//
//   • **Art. 314.5** enumerates the *qualificacions zonals* of the *zona d'ordenació en edificació
//     aïllada* and lists **ten**, every one suffixed. **There is no unsuffixed `20a` qualificació.**
//   • **Art. 338.2** repeats the same ten against the Roman subzones I–IX.
//   • **Arts. 340.1 · 342.1/.2/.3/.5/.8 · 343.1/.2** key edificabilitat, minimum parcel, minimum
//     façade, occupation, height, storeys and the three boundary separations **per subzone**, and
//     state none of them for the zone.
//
// ⇒ Bare `20a` names a *zona*; the *qualificació* that carries numbers is `20a/N`. **What is
// missing is a SELECTOR, not a rule** — which is why "may not exist" was the right instinct about
// the municipal layer and the wrong conclusion about the blocker. No layer can supply a zone-level
// figure the ordinance does not contain.
//
// ⇒ `regime-undetermined`, `legallyGrounded: false`. It is 22a's fact with ten branches instead of
// two, and each alternative is the same false statement ADR-0276 rejected for 22a:
//   • `no-rule-pack` — *"PRYZM has not encoded this zone's rules."* **False, and it was shipping**
//     (`coverageGapReasonFor`'s deleted 20a branch named the four parameters we in fact hold).
//   • `derived-plan` — would assert the PGM delegates this land to another instrument. It does not:
//     Arts. 340/342/343 state the numbers outright. That is L-526 verbatim.
//   • `source-data-unavailable` — the one TRANSIENT code, and the only one earning a retry. No
//     retry produces a subzone the source does not carry.
//
// ⚠⚠ **AND IT PUBLISHES NO FIGURE IN ITS PROSE.** 22a's card states two figures because they are
// REGIME-NEUTRAL — all three paragraphs of Art. 350 restate them. **Not one 20a envelope figure is
// subzone-neutral**: edificabilitat spans 0,25–1,50, occupation 10–40 %, front separation 3–12 m,
// height 7,55–16,70 m. Printing any of them, or a range, as *this parcel's* limit would assert the
// very fact the card exists to decline. They reach the user through
// `BCN_20A_BARE_ORDINANCE_REF` — a citation, checkable against the articles — and the prose names
// only WHICH article states WHICH kind of limit. The §DEC-1 leak test is mirrored for this card.
//
// ⚠ THE ONE THING THAT *IS* SUBZONE-NEUTRAL, and it is stated: **Art. 339 — the ordination type is
// *edificació aïllada* for every subzone.** It is a rule KIND, not a figure, and it is worth
// stating because it tells the user their land is the `setback` shape rather than the *alineacions
// de vial* shape — the distinction ADR-0270 exists for, and the one thing about their envelope we
// genuinely do know.

/** The label used when no caller supplies one. From the ordinance, never from the MUC. */
const BCN_20A_DEFAULT_LABEL = 'Zona d’ordenació en edificació aïllada';

/**
 * §BARE-20A-EXHAUSTED — the `regime-undetermined` refusal for an unsuffixed Barcelona clau `20a`.
 *
 * Says, in substance: *"We hold this zone's rules — all ten subzones of them, from the primary
 * text. Your ordination type is edificació aïllada, so an envelope of the usual setback shape IS
 * the right answer here. What no public source records is WHICH of the ten subzones your parcel
 * is in, and every envelope number in this zone is defined only per subzone. Here is the citation;
 * here is the single fact we would need."*
 *
 * ⚠ `legallyGrounded: false`. The LAW is fully known and transcribed. What is missing is which of
 * its ten branches applies to this parcel — a statement about PRYZM's INPUTS. Flipping it to `true`
 * would render the card as *"the ordinance grants no envelope here"* and tell the owner of a
 * perfectly buildable villa plot that their land cannot be built on: the false negative L-553 ranks
 * as the worst outcome in the set.
 *
 * ⚠ `ordinanceRef` IS present, like 22a's and unlike the other two `legallyGrounded: false`
 * refusals: this card makes real claims about the ordinance (that ten subzones exist, that Art. 339
 * fixes the ordination type, that the parameters are subzone-keyed), and C58 §1.13.4 requires a
 * claim about the law to cite what was actually read.
 *
 * P8 — OTel span. Precedent: `barcelona22ArrobaDerivedPlanRefusal` above, same argument.
 */
export function barcelona20aSubzoneUndeterminedRefusal(
    clau: string,
    clauLabel?: string | null,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal {
    const span = _tracer.startSpan('pryzm.zoning.es.bcn.barcelona20aSubzoneUndeterminedRefusal');
    try {
        span.setAttribute('bcn.clau', clau);
        const named = `${(clauLabel && clauLabel.trim()) || BCN_20A_DEFAULT_LABEL} (clau ${clau})`;
        return {
            code: 'regime-undetermined',
            // L-553 rule 1 — name the zone first; then say WHICH determination failed, not that we
            // have no rules. The headline deliberately does not say "no envelope".
            headline:
                `${named} — PRYZM holds this zone's rules, but the plan divides it into subzones ` +
                'and no public source says which subzone your parcel is in.',
            detail:
                // ── What we DO hold, first, because it is true and it is the fastest proof that ──
                //    this is not a gap in our coverage.
                'PRYZM has read and encoded this zone in full, from the plan’s own text — all ten ' +
                'of its subzones, with their buildability index, their minimum parcel and façade, ' +
                'their maximum ground occupation, their height and storey limits and their three ' +
                'boundary separations. This is not a coverage gap. ' +
                // ── The ONE determination that IS subzone-neutral, and it is a rule KIND. ──
                'One thing is settled whatever your subzone: the ordination type is *edificació ' +
                'aïllada* (Art. 339, stated for every subzone), so your land IS governed by real ' +
                'separations to the street and to the boundaries — an envelope of the usual shape ' +
                'is the right answer here, unlike the street-aligned zones of the old town and the ' +
                'Eixample. ' +
                // ── What we CANNOT state, and exactly why. ──
                '⚠ What PRYZM cannot establish is the SUBZONE. The plan’s zone catalogue ' +
                '(Art. 314.5) and the zone’s own article (Art. 338.2) enumerate ten subzone ' +
                'qualifications, each written with a suffix, and there is no unsuffixed one; every ' +
                'envelope figure in this zone is keyed to that suffix — the buildability index by ' +
                'Art. 340.1, the occupation by Arts. 342.2 and 343.1, the height and storeys by ' +
                'Arts. 342.3, 342.4, 342.5 and 343.2, and the boundary separations by Art. 342.8. ' +
                'The subzones are not variations on a theme: across them the buildability index ' +
                'varies by a factor of six, the ground occupation by a factor of four, and the ' +
                'front separation by nine metres. There is no defensible typical value, and the ' +
                'ranges are set out under the citation on this card. ' +
                // ── The missing input, NAMED — what makes this actionable rather than "we don't
                //    know", and what distinguishes it from a sourcing problem. ──
                'The missing input is a single fact about your parcel: which subzone the ordering ' +
                'plan assigns it. The qualification returned for this land stops at the zone. A ' +
                'municipal or metropolitan layer recording the suffix would resolve it outright — ' +
                'what is missing is that selector, not a rule, and no amount of further reading of ' +
                'the plan can supply it. We would rather name the determination we cannot make ' +
                'than pick one of ten answers on your behalf.',
            // C58 §1.13.4 — this card makes real claims about the ordinance, so it cites what was
            // read. ⚠ The FIGURES and the RANGES live here, inside the citation, and nowhere else.
            ordinanceRef: BCN_20A_BARE_ORDINANCE_REF,
            legallyGrounded: false,
            knownFacts: [...knownFacts],
        };
    } finally {
        span.end();
    }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// §CLAU-12-PREDICATE (L-674) — **THERE IS NO GEOGRAPHIC PREDICATE TO WRITE, AND WRITING ONE WOULD
// BE THE ERROR.** CLOSURE-REGISTER blocker 3, engineering half, settled on the primary text.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// THE RISK AS IT WAS FILED. `ES_BARCELONA_NUCLI_ANTIC_PACK` is registered for clau `12`
// unconditionally. PGM **Art. 315.2** says subzona I *"d'aplicació a tots els nuclis antics
// diferents del de Barcelona"* while subzona II (`12b`) is *"referida preferentment a aquell"*. The
// register recorded that if the MUC ever returned bare `12` on a **Ciutat Vella** parcel, that
// parcel would receive Art. 320.2a's 60 %-block depth and Art. 320.3a's street-width height under a
// citation that arguably does not govern it — **9.38 % of buildable land on an untested
// assumption** — and asked for a geographic predicate.
//
// ⚠⚠ **A GEOGRAPHIC PREDICATE IS NOT WHAT ART. 315.2 STATES, AND CODING ONE WOULD MANUFACTURE A
// RULE THE ORDINANCE DOES NOT CONTAIN.** Three reasons, and the third is decisive:
//
//   1. **The sentence is a drafting rationale, not a test.** It says which nuclei the two subzones
//      were DRAWN FOR. It defines no boundary, names no district, and states no coordinate — there
//      is nothing in it to evaluate against a parcel. Art. 315.1 scopes the ZONE to *"els nuclis
//      urbans antics de les poblacions"* generally; neither paragraph delimits either subzone.
//   2. **The ordinance hedges the half a predicate would have to be built on.** *"Referida
//      **preferentment** a aquell"* — preferentially, not exclusively. A drafter writing an
//      exclusivity rule does not hedge it. Art. 315.2 declines, in its own words, to make the
//      assignment absolute.
//   3. **⚠ THE OPERATIVE INSTRUMENT IS THE *PLÀNOL D'ORDENACIÓ*, PARCEL BY PARCEL — AND WE ALREADY
//      READ IT.** The PGM assigns claus by drawing them; the MUC serves that drawing. A predicate
//      written here would be a SECOND, weaker classifier competing with the authoritative one, and
//      by construction it would only ever act where the two DISAGREE — i.e. it would override the
//      plànol precisely when it was wrong to. That is `mucZoningProxy.js`'s standing warning (*"the
//      harmonised code must never select a rule pack"*) in a new costume, and C58 §1.11's category
//      error committed by the guard written to prevent one.
//
// ⇒ **CLASSIFICATION: `NOT-THE-RULE-KIND`.** Art. 315.2 is not a geographic rule of any KIND. The
// predicate that assigns `12` vs `12b` is the plànol, PRYZM reads it, and the register's *"prove
// every Ciutat Vella parcel returns 12b"* is therefore a QUESTION ABOUT THE MUC's fidelity to the
// plànol — an evidence task about a data source (bucket A), not a rule PRYZM has failed to encode.
//
// ⚠ WHAT REMAINS TRUE, AND IS NOT CLOSED BY THIS: if the MUC's transcription of the plànol is wrong
// somewhere, `12`'s pack applies where `12b`'s rules should. That risk is real, it is bounded by
// the source's fidelity rather than by our code, and **it is not reducible by a predicate** — a
// wrong clau in the source produces a wrong answer whatever we layer on top. The engineering
// mitigation that IS available is the invariant below, and it is what ships.
//
// ⚠ THE INVARIANT THAT DOES THE WORK: **`12` and `12b` never share a code path.** `12b` is absent
// from `BCN_NUCLI_ANTIC_ZONE_CODES` (that module's closing comment argues it at length: subzona II's
// depth is *"la de les edificacions contigües existents"* and its height *"la mitjana de les
// edificacions existents"* — a survey of the neighbours, not a 60 % construction and not a
// street-width band), and it is absent from `CLASSIFICATIONS` here, so a `12b` parcel reaches
// `barcelonaNoRulePackRefusal` and is told plainly that PRYZM has not encoded ITS subzone. The
// failure mode the register feared — Ciutat Vella receiving subzona I's envelope — can therefore
// only arise from a wrong clau in the SOURCE, never from a routing mistake in PRYZM.

/**
 * §CLAU-12-PREDICATE — the finding, held as data so a test can assert it and so a future author
 * cannot quietly add the polygon this comment argues against.
 *
 * ⚠ **DO NOT SET THIS TO `true` WITHOUT AN ORDINANCE CITATION FOR A BOUNDARY.** The correct
 * evidence would be a *plànol* or an article that DELIMITS subzona I or II geographically — not a
 * district boundary, not a Ciutat Vella polygon, and not a measured clau distribution. A measured
 * distribution tells you what the source says; it cannot tell you what the ordinance requires.
 */
export const BCN_CLAU_12_GEOGRAPHIC_PREDICATE_EXISTS = false as const;

/**
 * §CLAU-12-PREDICATE — the citation the finding rests on, so the refusal to write a predicate is
 * itself checkable against the article.
 */
export const BCN_CLAU_12_PREDICATE_FINDING =
    'PGM-1976 NNUU Art. 315.2 states WHICH NUCLEI the two nucli-antic subzones were drawn for ' +
    '("subzona I … d\'aplicació a tots els nuclis antics diferents del de Barcelona", "subzona II ' +
    '… referida PREFERENTMENT a aquell"). It delimits neither subzone: it names no boundary, no ' +
    'district and no coordinate, and it hedges the 12b half with "preferentment". The instrument ' +
    'that assigns a clau to a parcel is the plànol d’ordenació, which the Generalitat’s MUC serves ' +
    'and PRYZM reads. A geographic predicate written in PRYZM would be a second, weaker classifier ' +
    'that could only ever act where it DISAGREED with the plànol — i.e. it would override the ' +
    'operative instrument exactly when doing so was wrong. Classification: NOT-THE-RULE-KIND. ' +
    'The residual risk (a wrong clau in the source) is a question about the MUC’s fidelity to the ' +
    'plànol, not a rule PRYZM has failed to encode, and no predicate reduces it. Source: MMAMB ' +
    're-edition of the Normativa Urbanística Metropolitana, printed p. 104, committed at ' +
    'docs/04-reference/jurisdictions/es/es-ct/08019-barcelona/PGM-NNUU-metropolitana.pdf.';

/**
 * §L-574 — WHY the construction could not be completed. A closed vocabulary rather than free
 * text, because these are different operational failures with different likelihoods of a retry
 * succeeding, and the card says so honestly.
 */
export type ConstructionFailureReason =
    /** The Catastro block could not be fetched / assembled at all (upstream outage, timeout). */
    | 'block-unavailable'
    /** Parcels were fetched but did not dissolve into one clean ring (~8.6 % of blocks, L-539). */
    | 'block-dissolve-refused'
    /** The ring exists but the ordinance construction has no solution on it. */
    | 'construction-no-solution';

const FAILURE_DETAIL: Record<ConstructionFailureReason, string> = {
    'block-unavailable':
        'We could not retrieve the cadastral block this parcel belongs to. The maximum buildable ' +
        'depth (PGM Art. 242.2) is a function of the WHOLE block, not of your plot alone, so ' +
        'without the block outline there is nothing to measure from.',
    'block-dissolve-refused':
        'We retrieved the neighbouring cadastral parcels but could not merge them into a single ' +
        'clean block outline. The maximum buildable depth (PGM Art. 242.2) is measured from the ' +
        'block as a whole, so a partial or self-overlapping outline would give a confidently ' +
        'wrong depth rather than an approximate one.',
    'construction-no-solution':
        'We assembled the cadastral block, but the Art. 242.2 construction has no valid solution ' +
        'on it — typically an irregular or incomplete block outline. Rather than fall back to a ' +
        'generic figure the article does not sanction for this block, we are declining to state ' +
        'a depth.',
};

/**
 * §L-574 (founder-decided 2026-07-21) — the refusal for **an encoded clau whose construction
 * could not be completed for THIS parcel**.
 *
 * ⚠ THIS IS THE THIRD CARD, AND IT EXISTS BECAUSE THE OTHER TWO WOULD BOTH LIE HERE.
 *  - The LEGAL refusal ("no private buildable envelope applies") would assert a fact about the
 *    ordinance that we have not established — a **false negative about someone's land**, which
 *    L-553 names as worse than the fabrication it replaced.
 *  - The COVERAGE-GAP refusal ("PRYZM has not encoded this zone yet") would be simply false: the
 *    pack exists and works, on this very clau, on 91.4 % of blocks.
 *
 * What it replaces is worse than both: before L-574 these parcels fell through to the generic
 * estimated pack. For a *segons alineacions de vial* clau like `13a`, a front/side/rear triple is
 * **the wrong SHAPE, not an imprecise number** (C58 §1.11) — it silently draws an envelope
 * spanning the full plot depth on the most valuable land in Barcelona.
 *
 * It is also the ONLY refusal that is TRANSIENT, which is why it is the only one that earns a
 * retry affordance: the same parcel will very often resolve on a second attempt.
 */
export function barcelonaConstructionIncompleteRefusal(
    clau: string,
    reason: ConstructionFailureReason,
    clauLabel?: string | null,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal {
    const named = clauLabel && clauLabel.trim() ? `${clauLabel.trim()} (clau ${clau})` : `clau ${clau}`;
    return {
        code: 'source-data-unavailable',
        // Name the zone FIRST and say we DO hold its rules — that is the single fact that
        // separates this card from the coverage-gap card in the user's mind (L-553 rule 1).
        headline: `${named} — PRYZM could not complete this determination for your parcel.`,
        detail:
            `We have this zone's building rules encoded and they apply to your land. ` +
            FAILURE_DETAIL[reason] +
            ' This is a data-availability problem on our side, not a limit on your land, and it ' +
            'is usually temporary — retrying often resolves it. We would rather show you nothing ' +
            'than an envelope of the wrong shape.',
        // NOT an ordinance citation. Art. 242.2 is not the reason we failed; our data path is.
        // Citing it would be the L-526 error — an authoritative-looking citation for a claim the
        // document does not make.
        ordinanceRef: null,
        // A statement about PRYZM's data path, never about the law.
        legallyGrounded: false,
        knownFacts: [...knownFacts],
    };
}
