// ADR-0271 P5 — Barcelona (INE 08019) *ensanche* rule pack, clau 13a / 13E.
//
// ⚠ THE FOUNDER SIGNED THE SOURCE, AND THIS RECORDS EXACTLY WHAT THAT DID AND DID NOT AUTHORISE.
//
// Founder decision 2026-07-20: *"I accept what the PDF says in 2009."* — the INITIAL L-449 gate,
// against the AMB/MMAMB *Normativa Urbanística Metropolitana* (Dec 2010, consolidated 31-12-2009).
//
// ⚠ SUPERSEDED 2026-07-21 (L-526). The primary-source research
// (`docs/04-reference/jurisdictions/es/es-ct/08019-barcelona/L-526-LEGAL-FINDINGS.md`) found that citation both
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
// ⚠ ZONE CODE — `13a` vs `13E`. **RESOLVED 2026-08-01 (L-667). `13E` IS IN FORCE, AND IT IS A
// SUPPLEMENT OVER `13a`, NOT A SECOND RULE SET.**
//
// This paragraph used to read *"UNRESOLVED AND DELIBERATELY SO … a refusal to pick while the 2002
// ordinance's force is unknown (two 2015 Derogació rows never reached)"*. **Both halves are now
// closed**, and by different evidence, so read the replacement rather than the memory:
//
//   • **FORCE — closed on the primary source.** The founder inspected the 2026 repeal annex itself
//     (`GM_ordenanca-derogacio-consell-municipal-annex_2026.pdf`, BCNROC `11703/144636`) on
//     2026-08-01. It repeals the **1986** *Ordenança de rehabilitació i millora de l'Eixample* and
//     contains **no express reference** to the 2002 consolidated ordinance, to clau `13E`, or to
//     the provisions creating the `13E` subzone. ⚠ **That is the ANNEX TEXT, not the BCNROC
//     `dc.relation.replaces` catalogue field** — an earlier draft of L-667 rested on the metadata,
//     called it proof, and was withdrawn. The distinction is the whole reason the finding is now
//     citable. See `findings/L-667-13E-IN-FORCE-CLOSED.md`.
//   • **SHAPE — decided by the founder (DEC-2).** The 2002 text says *«La qualificació 13 Eixample
//     (clau 13E) **substitueix** la qualificació … (clau 13)…»*: it substitutes WITHIN ITS ÁMBITO
//     and inherits the rest residually. So `13E` **inherits `13a` and adds only what the 2002
//     ordinance states on top** — a SUPPLEMENT with an explicit delta (`BCN_13E_SUPPLEMENT`), never
//     a parallel pack. A standalone would duplicate every 13a value and drift from it at the first
//     amendment; the delta keeps one source of truth and makes the difference auditable.
//
// ⚠ THE DELTA IS **EMPTY TODAY, AND DECLARED EMPTY** — not absent, and not "nothing to see". PRYZM
// does not hold the 2002 ordinance's CURRENT consolidated text, and transcribing the 2002 text as
// published would be wrong: see `BCN_13E_TRANSCRIPTION_PRECONDITION`. Until it is transcribed,
// `13E` resolving to exactly `13a`'s rules is the honest approximation — and it is now a KNOWN one,
// with a named place to put the difference.
//
// ⚠ NOT MODELLED, and the corpus still has zero coverage of them: the volumetric rules between
// *implantación × storeys* and real buildable floor area — *planta baixa*, *àtic* / *sotacoberta*,
// *patis de llum*.
//
// ⚠⚠ §COSSOS-SORTINTS (L-672) — **THE TRIBUNES HALF OF THAT SENTENCE WAS WRONG AND IS WITHDRAWN.**
// This header used to call unmodelled *cossos sortints* *"a live risk, not a theoretical one"*, and
// the Barcelona closure register carried it as a **P1** blocker. It rested on an unexamined
// premise: that a tribuna is part of the envelope we fail to draw. **The PGM defines it as the
// opposite.** Art. 223.2.g: a *cos sortint* is one that *"sobresurt de l'alineació de façana"* —
// it is DEFINED by projecting BEYOND the alignment, so it cannot be inside the envelope whose outer
// surface is that alignment. Art. 229.2 names *"els miradors, tribunes i similars"* as the enclosed
// variety, and Art. 230.I measures the *vol* outward FROM the façade plane, capped at 1/10 of the
// street width and 1,50 m. ⇒ For this clau a tribuna is **additional permitted volume outside the
// envelope**, so omitting it **UNDER-states** — the safe direction (C58 §1.4) — and folding it in
// would over-state, which is the direction that must never be got wrong on the densest land in the
// city. It is a MORPHOLOGY allowance over a resolved envelope, not an envelope parameter of any
// KIND, and it is recorded once, cited, in `esBarcelonaCossosSortints.ts`.
// ⚠ Nor does it make *edificabilitat* incomplete HERE: Art. 322 defines this zone's edificabilitat
// as *"l'envolupant màxima de volum"* (ADR-0271), so there is no FAR ceiling for Art. 229.3.a's
// sostre computation to consume. That argument is zone-specific — do not carry it to clau 12, whose
// Art. 316.2 index is real.
//
// Strategic context: ADR-0271, ADR-0270, C58 §1.2/§1.4/§1.6/§1.7a/§1.11, L-460, L-461,
// docs/04-reference/jurisdictions/es/cat/08019-barcelona/SOURCES.md.

import { trace } from '@opentelemetry/api';
import {
    JurisdictionZoningContractSchema,
    type JurisdictionZoningContract,
    type GeometricRule,
} from '@pryzm/schemas';

/**
 * P8 — one tracer for this module's exported constructor. Precedent: `zoneRefusal.ts` and
 * `registry.ts` in this same directory. A span on a pure builder is a no-op without an exporter,
 * so the pack's purity is unaffected.
 */
const _tracer = trace.getTracer('pryzm.zoning.es.bcn');

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
    // (`docs/04-reference/jurisdictions/es/es-ct/08019-barcelona/PGM-NNUU-metropolitana.pdf`, p. 81, Art. 242.4)
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

// ═════════════════════════════════════════════════════════════════════════════════════════════
// §DEC-2 — clau `13E` AS A **SUPPLEMENT OVER `13a`**. Founder-decided 2026-08-01.
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** The clau whose rules `13E` inherits. One constant, so "inherits 13a" is a value, not a habit. */
export const BCN_ENSANCHE_BASE_ZONE_CODE = '13a';

/** The supplementing clau. */
export const BCN_13E_ZONE_CODE = '13E';

/**
 * L-667 — the evidence `13E`'s legal force rests on. **IN FORCE**, established on the repeal annex
 * ITSELF, not on catalogue metadata.
 *
 * ⚠ THE PROVENANCE FIELD IS THE POINT. An earlier draft of L-667 read the BCNROC
 * `dc.relation.replaces` catalogue field, called it proof of survival, and was withdrawn as an
 * overclaim — a catalogue entry may be partial, and absence from it is not absence from the annex
 * (the `not-located ≠ does-not-exist` rule, L-661, applied to ourselves). What closed it is the
 * founder reading the 7-page annex. Anything that cites this constant is citing the annex.
 */
export const BCN_13E_INSTRUMENT_STATUS = {
    /** IN FORCE. Not `presumed-in-force`, and not `evidenced-not-proven` — both are superseded. */
    status: 'in-force',
    closedOn: '2026-08-01',
    /** The instrument that CREATES `13E`. Separate handle from the 1986 ordinance that was repealed. */
    instrument:
        'Ordenança de rehabilitació i millora de l’Eixample — *text refós* [2002], BCNROC handle ' +
        '11703/89247. Art. 2: «La qualificació 13 Eixample (clau 13E) substitueix la qualificació ' +
        '… (clau 13)…». Catalogued under *Ordenances Vigents*; CIDO (Diputació de Barcelona, ' +
        'normativa_local/50141) independently records it *Vigent*.',
    /**
     * ⚠ WHAT WAS ACTUALLY READ, and it is the annex, not a catalogue field. The finding, verbatim:
     * *"The 2026 Annex to the Ordenança de derogació de les disposicions municipals obsoletes
     * repeals the 1986 Ordenança de rehabilitació i millora de l'Eixample. The annex contains no
     * express reference to the 2002 consolidated ordinance, to clau 13E, or to the provisions
     * creating the 13E subzone. No primary source reviewed expressly repeals the 2002 legal
     * framework establishing 13E."*
     */
    evidence:
        'GM_ordenanca-derogacio-consell-municipal-annex_2026.pdf (7 pp), BCNROC item ' +
        '39d8ed76-3365-4d32-a6f1-bf9dea45646a · hdl 11703/144636 — the annex to the 2026 Ordenança ' +
        'de derogació de les disposicions municipals obsoletes (Acord 10/2025, Plenari 30-01-2026, ' +
        'in force 14-02-2026). Read directly by the founder on 2026-08-01. It repeals the 1986 ' +
        'Eixample ordinance and makes NO express reference to the 2002 text refós, to clau 13E, or ' +
        'to the provisions creating the 13E subzone.',
    /** ⚠ The annex text, NOT the BCNROC `dc.relation.replaces` catalogue field. See the docstring. */
    evidenceIsPrimarySource: true,
    /**
     * ⚠ THE ONLY THING THAT REOPENS THIS. Note what does NOT: the 1986 repeal. The annex names its
     * targets individually by handle, and the 2002 *text refós* is a separate instrument with its
     * own handle — so "the base was repealed, therefore the consolidation falls" is a reading the
     * annex does not support and nobody has asserted from a source.
     */
    reopensIf:
        'An express repeal of the 2002 framework in a source not yet reviewed. The 1986 repeal is ' +
        'not that.',
    findingRef:
        'docs/04-reference/jurisdictions/es/es-ct/08019-barcelona/findings/L-667-13E-IN-FORCE-CLOSED.md',
} as const;

/**
 * ⚠⚠ **READ THIS BEFORE TRANSCRIBING A SINGLE VALUE INTO `BCN_13E_SUPPLEMENT.delta`.**
 *
 * The 2002 *text refós* is **NOT** the current law. Transcribing it as published would encode a
 * state that has not been in force for over a decade, under a citation that looks authoritative —
 * the L-526 failure class. Any transcription must start from the CURRENT consolidated state.
 */
export const BCN_13E_TRANSCRIPTION_PRECONDITION = {
    /** ⚠ NEVER the 2002 text as published. */
    startFrom: 'the CURRENT consolidated text of the 2002 ordinance, not the 2002 text as published',
    /** Art. 15 was partially NON-APPLIED by a 2012 judicial declaration of partial nullity. */
    art15PartialNullityYear: 2012,
    /** …and Art. 15 was then modified three times. Every one must be applied before transcribing. */
    subsequentModificationYears: Object.freeze([2018, 2019, 2023]),
    why:
        'Art. 15 carries a 2012 partial nullity plus modifications in 2018, 2019 and 2023. A ' +
        'transcription of the 2002 text as published would state a rule that has not been in force ' +
        'for over a decade, under a citation that reads as authoritative.',
    /** PRYZM does not hold that consolidated text today. That is why the delta below is empty. */
    consolidatedTextHeld: false,
} as const;

/**
 * The 2002 ordinance's DELTA over `13a` — the ONLY place a `13E`-specific rule may be written.
 *
 * Every field is optional and every one, when present, OVERRIDES the inherited `13a` value. Absent
 * ⇒ inherited. That is the *substitueix … within its ámbito, inherits the rest residually* rule of
 * the 2002 text, expressed as data.
 *
 * ⚠ This is where the courtyard / *patis* / rehabilitation conditions go once the CURRENT
 * consolidated text is held — see `BCN_13E_TRANSCRIPTION_PRECONDITION` first.
 */
export interface Bcn13ESupplementDelta {
    readonly maxHeight_m?: number | null;
    readonly maxFloors?: number | null;
    readonly plotRatioFAR?: number | null;
    readonly maxCoverage?: number | null;
    readonly geometricRule?: GeometricRule | null;
    /** When the delta becomes non-empty this MUST name the 2002 ordinance alongside the PGM. */
    readonly ordinanceRef?: string;
}

/**
 * §DEC-2 — the `13E` supplement. **Inheritance made visible in code**, rather than implied by two
 * codes sharing an array.
 *
 * ⚠ `delta` IS EMPTY, AND `deltaIsEmpty` DECLARES IT EMPTY. Those are two different statements and
 * the second one is why the field exists: an empty object could mean "nothing applies", "nobody has
 * looked" or "somebody deleted the contents". `deltaIsEmpty` + `deltaEmptyBecause` say which, in
 * the shipping data, where a test can assert it — the §CONTEXT-DATA-HONESTY rule (an absence and a
 * measured zero must never be the same value) applied to a rule set instead of to a fetch.
 */
export const BCN_13E_SUPPLEMENT = Object.freeze({
    zoneCode: BCN_13E_ZONE_CODE,
    /** ⚠ `13E` does not stand alone. It resolves THROUGH this clau's rules. */
    inheritsFromZoneCode: BCN_ENSANCHE_BASE_ZONE_CODE,
    /** The zone label the card shows. Names the clau in the ordinance's own words (L-553 rule 1). */
    label: 'Eixample — subzona de densificació urbana (clau 13E)',
    /** L-667 — why we are entitled to resolve this clau at all. */
    instrumentStatus: BCN_13E_INSTRUMENT_STATUS,
    /** ⚠ Read BEFORE filling `delta`. */
    transcriptionPrecondition: BCN_13E_TRANSCRIPTION_PRECONDITION,
    /** EMPTY today. The only place a 13E-specific rule may be written. */
    delta: Object.freeze({}) as Bcn13ESupplementDelta,
    /** ⚠ DECLARED empty, not merely absent. See the docstring. */
    deltaIsEmpty: true,
    deltaEmptyBecause:
        'PRYZM does not hold the CURRENT consolidated text of the 2002 Ordenança de rehabilitació i ' +
        'millora de l’Eixample (Art. 15 carries a 2012 partial nullity plus 2018 / 2019 / 2023 ' +
        'modifications), so no 13E-specific rule has been transcribed. Nothing has been dropped and ' +
        'nothing is pending review: the delta is empty because the source has not been read, and a ' +
        '13E parcel therefore resolves to exactly clau 13a’s rules — a KNOWN approximation, not an ' +
        'assertion that the two are equivalent.',
    /** The one open item on `13E`. Everything else about it is closed. */
    openItem:
        'Transcribe the 2002 ordinance’s courtyard / *patis* / rehabilitation conditions into ' +
        '`delta`, starting from the CURRENT consolidated text (see `transcriptionPrecondition`).',
} as const);

/** Shared zone body — the `13a` base, which `13E` inherits; see the header on why. */
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
        displayName: 'Barcelona — Eixample (PGM clau 13a + clau 13E supplement)',
        source: 'catastro-muc',
        crs: 'EPSG:4326',
        lastReviewed: '2026-07-20',
        defaultConfidence: 'estimated-ruleset',
        zones: [
            ensancheZone(BCN_ENSANCHE_BASE_ZONE_CODE, 'Densificació Urbana Intensiva (clau 13a)'),
            // ⚠ §DEC-2 — DERIVED from the row above, never re-typed. See `bcn13ESupplementedZone`.
            bcn13ESupplementedZone(),
        ],
    });

/**
 * §DEC-2 — build clau `13E`'s zone body: **`13a`'s, plus the 2002 ordinance's delta.**
 *
 * ⚠ THE INHERITANCE IS THE IMPLEMENTATION, NOT A COMMENT ABOUT ONE. `13E` used to be a second call
 * to `ensancheZone(...)` with a different string — identical by coincidence of two literals, and
 * the day someone corrected 13a's `minDepth_m` (as §L-594 did, 12 → 11) they would have had to
 * remember to correct a second call site. Here there is one base and one override point, so 13E
 * cannot silently diverge from 13a, and every future divergence has to be written into
 * `BCN_13E_SUPPLEMENT.delta` where it is visible and citable.
 *
 * ⚠ TODAY THE DELTA IS EMPTY, so the returned zone equals `13a`'s in every rule-bearing field —
 * only `code` and `label` differ. That is asserted, not assumed (`esBarcelonaPack.test.ts`).
 *
 * ⚠ THE CITATION STAYS `BCN_ORDINANCE_REF` (the PGM) WHILE THE DELTA IS EMPTY, and that is
 * deliberate. Every value in this zone comes from the PGM; appending the 2002 ordinance to the
 * citation would attach an authoritative-looking reference to a document that states none of them —
 * the L-526 error. The 2002 instrument and its status are published as DATA
 * (`BCN_13E_SUPPLEMENT.instrumentStatus`), and the day the delta carries a value the delta's own
 * `ordinanceRef` overrides this line.
 *
 * P8 — OTel span. Called once at module load; a span without an exporter is a no-op.
 */
export function bcn13ESupplementedZone() {
    const span = _tracer.startSpan('pryzm.zoning.es.bcn.bcn13ESupplementedZone');
    try {
        span.setAttribute('bcn.clau', BCN_13E_ZONE_CODE);
        span.setAttribute('bcn.clau.inheritsFrom', BCN_ENSANCHE_BASE_ZONE_CODE);
        span.setAttribute('bcn.clau.deltaIsEmpty', BCN_13E_SUPPLEMENT.deltaIsEmpty);
        const base = ensancheZone(BCN_ENSANCHE_BASE_ZONE_CODE, BCN_13E_SUPPLEMENT.label);
        // Spread order IS the rule: inherit everything, then let the delta override. An absent
        // delta key inherits; a present one wins. Nothing else is possible, which is the point.
        return { ...base, ...BCN_13E_SUPPLEMENT.delta, code: BCN_13E_ZONE_CODE };
    } finally {
        span.end();
    }
}

/**
 * The zone codes this pack answers for — used by the provider to decide applicability.
 *
 * ⚠ `13E` is here because it RESOLVES THROUGH `13a` (§DEC-2), not because the two are equivalent.
 * The pair is derived from the base code + the supplement's own code so the array cannot drift from
 * the zones the pack actually publishes.
 */
export const BCN_ENSANCHE_ZONE_CODES = [
    BCN_ENSANCHE_BASE_ZONE_CODE,
    BCN_13E_ZONE_CODE,
] as const;
