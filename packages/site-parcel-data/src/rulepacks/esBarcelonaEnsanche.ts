// ADR-0271 P5 — Barcelona (INE 08019) *ensanche* rule pack, clau 13a / 13E.
//
// ⚠ THE FOUNDER SIGNED THE SOURCE, AND THIS RECORDS EXACTLY WHAT THAT DID AND DID NOT AUTHORISE.
//
// Founder decision 2026-07-20: *"I accept what the PDF says in 2009."* — the INITIAL L-449 gate,
// against the AMB/MMAMB *Normativa Urbanística Metropolitana* (Dec 2010, consolidated 31-12-2009).
//
// ⚠ SUPERSEDED 2026-07-21 (L-526). The primary-source research
// (`docs/04-reference/spain/barcelona-catalonia/L-526-LEGAL-FINDINGS.md`) found that citation both
// STALE + ANACHRONISTIC (the AMB as an institution did not exist until 21-07-2011, so an "AMB Dec
// 2010" attribution is impossible) and MIS-ATTRIBUTED (it named Art. 322.1 for the depth; depth is
// Art. 242, edificabilitat is Art. 322). The founder RE-EXERCISED the L-449 gate on 2026-07-21,
// accepting the CURRENT consolidated PGM refós in the **RPUC** (Registre de Planejament Urbanístic
// de Catalunya) / AMB Geoportal de Planejament (**NUMAMB**) — a living consolidated text — as the
// source. `BCN_ORDINANCE_REF` below carries the corrected citation.
//
// The pack STILL ships `estimated-ruleset` (amber badge, `ordinance-pdf` provenance, the "verify
// against ordinance" affordance) — re-citing corrected the ATTRIBUTION, not the confidence tier. The
// per-parcel figures are not yet certified against the MUC/RPUC *fitxa urbanística* (see L-525 "still
// to certify"): the exact profunditat + the official street width for parcel 0230904DF3803. C58
// §1.2/§1.4.
//
// WHAT THE ACCEPTANCE UNLOCKED — the Art. 242.2 CONSTRUCTION, which is the whole point:
// the ordinance does not state a *profunditat edificable*, it states how to DERIVE one — a figure
// similar to the block, equidistant from the street frontages, leaving ≥30% of the block area as
// interior free space, capped 30 m, floored 12 m (Art. 242 minimum; L-526). Those parameters ARE in the accepted
// source, and they are what `block-derived-alignment` needs. So *área de implantación máxima*
// becomes a REAL, CITED, per-block computation rather than a placeholder.
//
// ⚠ WHAT IT DID **NOT** UNLOCK, and this is deliberate, not an oversight:
//
//   • **`maxHeight_m` / `maxFloors` stay NULL.** The accepted document contains NO height bands.
//     The circulating 9,00/12,35/15,70/19,05/22,40/25,75 m table at 3,35 m/floor is the claimed
//     *Barcelona variant*, and verification never located it in this source — what it repeatedly
//     confirmed was the GENERIC PGM at 3,05 m/floor, with band values we also do not hold.
//     Encoding either would be a number the signed source does not contain. An absent number is
//     honest; a plausible one is not (`jurisdictions/README.md`).
//     ⚠ The Art. 327 §2 modification (exp. 2007/028428, DOGC 29-09-2008) is a HEIGHT-TABLE change
//     (L-526), NOT a depth change. The current RPUC/NUMAMB consolidation carries it; the height bands
//     stay NULL here only because encoding them is L-525a (needs the *ample oficial del carrer*), not
//     because the source lacks them. The old "not reflected" caveat was internally inconsistent and is
//     dropped from the citation.
//
//   • **`plotRatioFAR` stays NULL — and that is a FINDING, not a gap.** PGM Art. 322.1: for
//     densificació urbana zones *"l'edificabilitat es defineix per l'envolupant màxima de volum"*.
//     There IS no per-parcel FAR here; the envelope IS the rule. The 2,20 / 1,20 m²st/m²s
//     coefficients that exist are procedurally gated to PERI / estudi de detall actuacions
//     (Art. 322.2/.3), so applying either per-parcel would over-constrain every plot in the
//     district — a C58 §1.11 category error (a real number answering a different question).
//
//   • **Setbacks are NULL, not zero.** An alignment-governed zone has no honest front/side/rear
//     triple (C58 §1.7a). `null` ≠ `0`: the containment check SKIPS a null edge, whereas `0`
//     would assert "the ordinance requires zero here", which we have not established.
//
// ⚠ ZONE CODE — `13a` vs `13E`, UNRESOLVED AND DELIBERATELY SO. Live MUC `MUC_4QUAL` returns
// `13a` across the whole Eixample and never `13E`; the 2002 *Ordenança de rehabilitació i millora
// de l'Eixample* Art. 2 (PRIMARY, BCNROC handle 11703/89247) says `13E` **substitutes** clau 13 in
// that área and inherits 13's rules residually. Both codes are therefore registered against the
// SAME rule set, so a parcel resolves whichever the provider reports. **This is not a claim that
// they are equivalent** — it is a refusal to pick while the 2002 ordinance's force is unknown
// (two 2015 *Derogació* rows never reached). If it is in force, 13E governs and may add
// courtyard rules we do not carry.
//
// ⚠ NOT MODELLED AT ALL, and it may make edificabilitat incomplete: the volumetric rules between
// *implantación × storeys* and real buildable floor area — *cossos sortints* / tribunes, *planta
// baixa*, *àtic* / *sotacoberta*, *patis de llum*. Zero coverage in the corpus. In the Eixample
// projecting tribunes are near-universal, so this is a live risk, not a theoretical one.
//
// Strategic context: ADR-0271, ADR-0270, C58 §1.2/§1.4/§1.6/§1.7a/§1.11, L-460, L-461,
// docs/04-reference/jurisdictions/es/cat/08019-barcelona/SOURCES.md.

import {
    JurisdictionZoningContractSchema,
    type JurisdictionZoningContract,
    type GeometricRule,
} from '@pryzm/schemas';

/**
 * The governing citation carried on every value in this pack. Corrected 2026-07-21 (L-526):
 * depth = Art. 242 (drop the old Art. 322.1 depth attribution — 322 is edificabilitat, not depth);
 * height = Arts. 238 + 240 + 327; source re-cited to the current consolidated RPUC/NUMAMB refós
 * (the anachronistic "AMB Dec 2010 / 31-12-2009" is dropped). Founder re-accepted 2026-07-21.
 */
export const BCN_ORDINANCE_REF =
    'PGM-1976 NNUU — profunditat edificable: Art. 242 (per-block construction, applied via Art. 327.1). ' +
    'Edificabilitat: Art. 322 (envolupant màxima de volum — not a per-parcel FAR). ' +
    'Alçada reguladora: Arts. 238 + 240 + 327. Source: the current consolidated PGM refós in the ' +
    'Registre de Planejament Urbanístic de Catalunya (RPUC) / AMB Geoportal de Planejament (NUMAMB) — ' +
    'a living consolidated text, not a frozen PDF. Founder-accepted 2026-07-21 (L-449 gate; supersedes ' +
    'the 2026-07-20 AMB-Dec-2010 acceptance).';

/**
 * Art. 242.2 as a rule, not a number. The three parameters below are the ordinance's own
 * construction — they are what makes the depth derivable per block instead of guessed.
 */
export const BCN_ENSANCHE_RULE: GeometricRule = {
    kind: 'block-derived-alignment',
    // *Alineació a vial* — the façade sits ON the street line, which is why a setback triple
    // cannot express this zone at all (ADR-0270).
    alignTo: 'street',
    alignmentOffset_m: 0,
    // *Mitgera* — build to both side boundaries. This is the configuration that exposed L-462.
    sideTreatment: 'party-wall',
    interiorFreeRatio: 0.3,   // "≥30% of the block as interior free space"
    // §L-525/L-526 — the PGM Art. 242 minimum depth is 12 m (primary-source verdict, 2026-07-21:
    // "where the construction yields < 12 m, 12 m is taken", plus the 8 m inscribed-circle interior
    // rule); the pack previously used 11 m. NOTE: raising this to 12 m does NOT by itself make the
    // depth correct on a HALF-illa block — the visible ~11 m floor came from Catastro masa 02309
    // being only HALF a Cerdà illa (6,686 m² vs ~12,000 m²), so the all-perimeter inset over-erodes
    // it. The real depth fix is illa-assembly (L-525b, see `L-526-LEGAL-FINDINGS.md`); this line
    // just makes the ordinance floor legally correct.
    // §L-594 — 11 m, NOT 12. ⚠ THIS WAS AN OVER-STATEMENT, CORRECTED AGAINST THE PRIMARY TEXT.
    //
    // The packs shipped `12` citing "Art. 242 — 12 m, verified". The primary text
    // (`docs/04-reference/spain/barcelona-catalonia/PGM-NNUU-metropolitana.pdf`, p. 81, Art. 242.4)
    // says otherwise, verbatim:
    //
    //   *"Quan un cop complertes les condicions de l'apartat 2 resultin, en alguna alineació,
    //    edificacions amb una profunditat edificable INFERIOR A 11 m., s'haurà de prendre aquesta
    //    dimensió com a profunditat edificable, sempre que sigui possible inscriure una
    //    circumferència de vuit metres de diàmetre."*
    //
    // ⚠ DIRECTION: `minDepth_m` is a FLOOR, so a HIGHER floor permits a DEEPER building wherever the
    // Art. 242.2 construction yields less. 12 therefore OVER-STATED buildable depth — the direction
    // C58 §1.4 forbids, and the third over-statement found in one day (after L-586's 65% inset and
    // L-591's median street width).
    //
    // ⚠ HOW IT GOT IN, because the mechanism matters more than the metre: two agents disagreed, and
    // the ASSERTIVE one was believed. One said "12, corrected by L-526"; the other said "11, and
    // GeometricRule's own docstring says 11". Neither was checked against the ordinance until the
    // conflict forced it. **When two sources disagree about a legal number, read the law — do not
    // pick the more confident sentence.**
    //
    // ⚠ NOT MODELLED: the floor is CONDITIONAL — it applies only *"sempre que sigui possible
    // inscriure una circumferència de vuit metres de diàmetre"*, and Art. 242.5 adds that where even
    // that fails and the total width between opposing alignments is under 30 m, the parcels must be
    // FULLY buildable. We apply the 11 m floor unconditionally, which is the conservative reading of
    // the first clause and ignores the second.
    minDepth_m: 11,
    maxDepth_m: 30,           // ordinance cap
};

/** Shared zone body — registered under both `13a` and `13E`; see the header on why. */
function ensancheZone(code: string, label: string) {
    return {
        code,
        label,
        permittedUse: ['residential', 'mixed'] as const,
        // NULL, every one, and each for a stated reason in the header. Not "to be filled later".
        maxHeight_m: null,
        maxFloors: null,
        plotRatioFAR: null,
        maxCoverage: null,
        setbacks: { front_m: null, side_m: null, rear_m: null },
        geometricRule: BCN_ENSANCHE_RULE,
        fieldProvenance: {
            // The construction parameters come from the accepted PDF — hence `ordinance-pdf`,
            // which is what drives the amber "estimated" badge rather than a green chip.
            'alignment.depth': 'ordinance-pdf',
            'alignment.offset': 'ordinance-pdf',
            'alignment.sideTreatment': 'ordinance-pdf',
            permittedUse: 'ordinance-pdf',
        },
        ordinanceRef: BCN_ORDINANCE_REF,
    };
}

/**
 * The Barcelona *ensanche* pack.
 *
 * `defaultConfidence: 'estimated-ruleset'` is NOT provisional pending better data — it is the
 * correct label for a value whose source disclaims its own authority. It cannot become
 * `structured` by finding a cleaner copy of the same document.
 */
export const ES_BARCELONA_ENSANCHE_PACK: JurisdictionZoningContract =
    JurisdictionZoningContractSchema.parse({
        jurisdictionId: 'es-08019-barcelona',
        displayName: 'Barcelona — Eixample (PGM clau 13a/13E)',
        source: 'catastro-muc',
        crs: 'EPSG:4326',
        lastReviewed: '2026-07-20',
        defaultConfidence: 'estimated-ruleset',
        zones: [
            ensancheZone('13a', 'Densificació Urbana Intensiva (clau 13a)'),
            ensancheZone('13E', 'Eixample — subzona de densificació urbana (clau 13E)'),
        ],
    });

/** The zone codes this pack answers for — used by the provider to decide applicability. */
export const BCN_ENSANCHE_ZONE_CODES = ['13a', '13E'] as const;
