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

import type { EnvelopeRefusal } from '@pryzm/schemas';

/** The instrument every classification below is read from. */
export const BCN_PGM_INSTRUMENT_REF =
    'PGM-1976 (Pla General Metropolità, aprovat 14-07-1976) — Normes Urbanístiques, Títol IV ' +
    '(sistemes i zones). Source: the current consolidated PGM refós in the Registre de ' +
    'Planejament Urbanístic de Catalunya (RPUC) / AMB Geoportal de Planejament (NUMAMB).';

/** A classification row: the claus it covers, and the refusal they produce. */
interface ClauClassification {
    readonly claus: readonly string[];
    readonly refusal: EnvelopeRefusal;
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
export const BCN_ZONE_REFUSALS_BY_CLAU: ReadonlyMap<string, EnvelopeRefusal> = (() => {
    const m = new Map<string, EnvelopeRefusal>();
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
export function barcelonaZoneRefusal(clau: string): EnvelopeRefusal | null {
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

const HARMONISED_SYSTEM_REFUSAL: EnvelopeRefusal = {
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
): EnvelopeRefusal | null {
    const byClau = BCN_ZONE_REFUSALS_BY_CLAU.get(clau);
    if (byClau) return byClau;
    if (
        typeof harmonisedCode === 'string' &&
        harmonisedCode.trim().toUpperCase().startsWith(HARMONISED_SYSTEM_PREFIX)
    ) {
        return HARMONISED_SYSTEM_REFUSAL;
    }
    return null;
}
