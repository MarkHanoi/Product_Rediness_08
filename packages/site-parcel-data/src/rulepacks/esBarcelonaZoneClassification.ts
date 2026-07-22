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
    if (clau === '12' || clau === '12b') {
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
    if (clau === '22a' || clau === '22@') {
        return (
            'This zone states its limits as a maximum ground occupation and a floor-area index ' +
            '(m² of floor per m² of site) rather than as setback distances. PRYZM can read those ' +
            'two numbers but cannot yet turn them into an envelope, and a generic setback ' +
            'estimate would answer a different question from the one this zone asks. We would ' +
            'rather show you nothing than something wrong.'
        );
    }
    // *Edificació aïllada* — separations ARE the right shape here. The blocker is that we hold
    // none for this subzone, and the generic defaults belong to a different zone entirely.
    if (clau === '20a' || clau.startsWith('20a/') || clau === '21' || clau.startsWith('21/')) {
        return (
            'This zone IS governed by real separation distances to the street and to the ' +
            'boundaries — so an envelope of the usual shape is the right answer here. What PRYZM ' +
            'does not yet hold is THIS subzone’s own sourced numbers: its separations, its ' +
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

/** What PRYZM covers today vs next — kept beside the copy that cites it so they cannot drift. */
const BCN_ROADMAP_LINE =
    'Barcelona coverage today: clau 13a / 13E (the Eixample) and clau 13b (densificació urbana ' +
    'semiintensiva), where the buildable depth is constructed per PGM Art. 242 from the real ' +
    'cadastral block. Next: 12 / 12b, 22a and the 20a family. Each zone ships only once its ' +
    'governing article has been read and accepted — which is why this one is not here yet.';

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
