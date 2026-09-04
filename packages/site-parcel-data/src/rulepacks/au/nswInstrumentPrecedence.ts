// §NSW-INSTRUMENT-PRECEDENCE — when two instruments both draw a height on one parcel, which one
// governs, and **on the strength of which sentence**.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE PROBLEM, MEASURED — AND IT ARRIVES INSIDE ONE LAYER
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Principal/14 carries an `EPI_TYPE` coded domain (`LEP` = 40,221 · `SEPP` = 743 · other = 0), and
// on a State Significant Precinct parcel it returns **two rows** — an LEP height and a SEPP height
// (`sepp-overlap2.json` Q1, layer 134: 4 of 5 sampled). Captured verbatim in the fixture:
//
//     parramatta-north-ssp-stack  Parramatta LEP 2023            20 m   Clause 4.3
//                                 SEPP (Precincts—Central River City) 2021    6   UNITS null
//     hornsby-ehc-stack           Hornsby LEP 2013              8.5 m   Clause 4.3
//                                 SEPP (Precincts—Eastern Harbour City) 2021 9.5 m  uncited
//
// ⛔ WITHOUT THIS FILE THE RESOLVER SEES TWO `BASE` CONTROLS AND REFUSES (status D). That refusal
// is *safe* and it is *wrong*: the SEPPs say, in their own words, which prevails. Refusing when
// the instrument answers the question is the mirror image of guessing when it does not — both
// substitute the engine's convenience for the law.
//
// ⛔⛔ AND THE FIX IS NOT `EPI_TYPE === 'SEPP' ⇒ WINS`. That is tightest-number-wins wearing a
// statutory costume. Three measured reasons it is false:
//   1. **Chapter scope.** Each precinct SEPP says *"THIS CHAPTER prevails"* — a chapter, not the
//      policy, and not every SEPP. A SEPP with no such clause displaces nothing.
//   2. **Carve-outs are real and named.** SEPP (Precincts—Eastern Harbour City) 2021 s 6.3 makes
//      its own precedence *"subject to section 36(4) of the Act"*; s 4.3 of the Central River City
//      chapter excepts *SEPP No 55—Remediation of Land* by name. A blanket rule erases both.
//   3. **The direction is not always displacement.** SEPP (Precincts—Western Parkland City) 2021
//      s 4.4(2) and SEPP (Precincts—Regional) 2021 s 3.4(2) go further — *"A local environmental
//      plan DOES NOT APPLY to land shown on the Land Application Map"* — which is disapplication,
//      not inconsistency-resolution, and reaches land the height clause never mentions.
//
// So precedence is a REGISTRY of read sentences, exactly as legal ROLE is (`nswClauseRegistry.ts`),
// and an unregistered instrument pairing stays `UNRESOLVED` and refuses. The empty space is the
// honest state of knowledge.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHERE THE SENTENCES CAME FROM
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `phase0-transcripts/lep-text-probe2.json` — the consolidated instruments fetched live from
// legislation.nsw.gov.au on 2026-09-04 (200 OK, 0.87–2.7 MB each), with the nearest preceding
// clause heading recovered for every hit. Every `verbatim` below is a substring of that capture.
// ⛔ Nothing here is recalled from memory; a precedence rule asserted from memory is precisely the
// "plausible face" this lane exists to refuse.
//
// P5-adjacent purity: pure data + pure lookups. No I/O, no clock, no RNG.
// Contracts: C58 §1.2/§1.3/§1.4, C62 (authority), C74 §0, C75 (provenance).

/**
 * The instrument class, read from `EPI_TYPE`.
 *
 * ⚠ THE SAME FIELD SERVES TWO SPELLINGS AND A READER THAT KNOWS ONE IS BLIND ON HALF THE CALLS.
 * ArcGIS `/query` returns the coded-domain CODE (`'LEP'` / `'SEPP'`); `/identify` returns the
 * DESCRIPTION (`'Local Environment Plan'` / `'State Environmental Planning Policy'`). Both were
 * observed on Principal/14 in the same session (`p14-sepp-census.mjs` header records exactly this).
 * A `=== 'SEPP'` test passes on the query path and fails silently on the identify path — and the
 * identify path is the one the fixtures use.
 */
export type NswInstrumentClass = 'LEP' | 'SEPP' | 'unknown';

/**
 * Read `EPI_TYPE` in either spelling. **Total** — an unrecognised value is `'unknown'`, never
 * defaulted to `'LEP'`. An instrument whose class we cannot read is one whose precedence we cannot
 * resolve, and saying so is the point.
 */
export function nswInstrumentClass(epiType: string | null | undefined): NswInstrumentClass {
    const t = epiType?.trim() ?? '';
    if (t === '') return 'unknown';
    if (t === 'LEP' || t === 'Local Environment Plan' || t === 'Local Environmental Plan') return 'LEP';
    if (t === 'SEPP' || t === 'State Environmental Planning Policy') return 'SEPP';
    return 'unknown';
}

/**
 * How one instrument stands to another where both apply.
 *
 *  - `prevails-on-inconsistency` — the read sentence resolves an INCONSISTENCY in this
 *    instrument's favour. It displaces the other control only where the two actually conflict.
 *  - `disapplies-lep`            — stronger: the other instrument does not apply to this land at
 *    all. Not a tie-break; a removal.
 *  - `unresolved`                — ⛔ no sentence has been read. The engine refuses.
 */
export type NswPrecedenceEffect = 'prevails-on-inconsistency' | 'disapplies-lep' | 'unresolved';

/** One read precedence sentence, with the text that says it. */
export interface NswPrecedenceRuling {
    /** `EPI_NAME` exactly as the service serves it. */
    readonly instrument: string;
    readonly effect: NswPrecedenceEffect;
    /** The clause reference, as the instrument numbers it. */
    readonly clause: string;
    /**
     * ⭐ THE SENTENCE, VERBATIM. Carried into the explanation so a reader checks the LAW rather
     * than this engine's paraphrase of it. C58 §1.3: a determination owes its source.
     */
    readonly verbatim: string;
    /** Where it was read, precisely enough to re-fetch. */
    readonly source: string;
    /** Named exceptions the sentence itself carries. Never silently dropped. */
    readonly carveOuts: readonly string[];
    /**
     * A named human who verified this against the instrument. `null` = NOT SIGNED — usable in
     * development, never in a published envelope (build prompt §1.4).
     */
    readonly signedBy: string | null;
}

/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE PRECEDENCE REGISTRY — four instruments, four read sentences, ZERO signatures.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ⚠ EVERY ROW IS `signedBy: null`, AND THAT IS THE STATE OF THE WORLD, NOT AN OVERSIGHT. A lane
 * agent is not a signer. These rows let the engine COMPUTE the right answer and mark it
 * development-only; a named human reading the consolidated instrument is what makes it shippable.
 */
export const NSW_PRECEDENCE_RULINGS: readonly NswPrecedenceRuling[] = Object.freeze([
    {
        instrument: 'State Environmental Planning Policy (Precincts—Central River City) 2021',
        effect: 'prevails-on-inconsistency',
        clause: 's 2.4 / s 3.6 (Relationship with other environmental planning instruments)',
        verbatim:
            'section 74(1) of the Act, in the event of an inconsistency between this Chapter and ' +
            'another environmental planning instrument whether made before or after the commencement ' +
            'of this Chapter, this Chapter prevails to the extent of the inconsistency.',
        source:
            'legislation.nsw.gov.au epi-2021-0725 (consolidated, fetched 2026-09-04, 2,640,434 bytes); ' +
            'transcript phase0-transcripts/lep-text-probe2.json',
        carveOuts: [
            's 4.3 excepts State Environmental Planning Policy No 55—Remediation of Land by name.',
            'The clause resolves INCONSISTENCY only — where the LEP and the SEPP agree, both stand.',
        ],
        signedBy: null,
    },
    {
        instrument: 'State Environmental Planning Policy (Precincts—Eastern Harbour City) 2021',
        effect: 'prevails-on-inconsistency',
        clause: 's 2.4 / s 6.3 / s 7.3 (Relationship to other environmental planning instruments)',
        verbatim:
            'In the event of an inconsistency between this Chapter and another environmental planning ' +
            'instrument, whether made before, on or after the date on which this Chapter was made, ' +
            'this Chapter prevails to the extent of the inconsistency, subject to section 36 (4) of the Act.',
        source:
            'legislation.nsw.gov.au epi-2021-0726 (consolidated, fetched 2026-09-04, 867,093 bytes); ' +
            'transcript phase0-transcripts/lep-text-probe2.json',
        carveOuts: [
            '⚠ "subject to section 36 (4) of the Act" — the precedence is itself subordinated, and ' +
                'what s 36(4) does has NOT been read. Until it is, this row is a partial reading.',
            's 6.3(2) preserves SEPP No 55—Remediation of Land within the Cooks Cove site.',
        ],
        signedBy: null,
    },
    {
        instrument: 'State Environmental Planning Policy (Precincts—Western Parkland City) 2021',
        effect: 'disapplies-lep',
        clause: 's 4.4 (Relationship with other environmental planning instruments generally)',
        verbatim:
            '(1) In the event of an inconsistency between this Chapter and another environmental ' +
            'planning instrument, whether made before or after the commencement of this Chapter, this ' +
            'Chapter prevails to the extent of the inconsistency. (2) A local environmental plan does ' +
            'not apply to land shown on the Land Application Map.',
        source:
            'legislation.nsw.gov.au epi-2021-0728 (consolidated, fetched 2026-09-04, 2,718,235 bytes); ' +
            'transcript phase0-transcripts/lep-text-probe2.json',
        carveOuts: [
            '⛔ s 4.4(2) is scoped to "land shown on the Land Application Map" — a polygon this pack ' +
                'does NOT currently fetch. So the STRONGER effect cannot be confirmed per parcel, and ' +
                'the weaker s 4.4(1) reading is what the engine acts on. Naming the gap beats ' +
                'silently applying the stronger rule everywhere.',
        ],
        signedBy: null,
    },
    {
        instrument: 'State Environmental Planning Policy (Precincts—Regional) 2021',
        effect: 'disapplies-lep',
        clause: 's 2.4 / s 3.4 (Relationship with other environmental planning instruments)',
        verbatim:
            '(1) In the event of an inconsistency between this Chapter and another environmental ' +
            'planning instrument, whether made before or after the commencement of this Chapter, this ' +
            'Chapter prevails to the extent of the inconsistency. (2) A local environmental plan does ' +
            'not apply to land within an Activation Precinct.',
        source:
            'legislation.nsw.gov.au epi-2021-0727 (consolidated, fetched 2026-09-04, 1,459,506 bytes); ' +
            'transcript phase0-transcripts/lep-text-probe2.json',
        carveOuts: [
            's 3.4(2) is scoped to "land within an Activation Precinct" — not fetched, so the engine ' +
                'acts on s 3.4(1) only.',
            's 5.9(2): State Environmental Planning Policy (State and Regional Development) 2011 ' +
                'prevails over THIS chapter — precedence is a partial order, not a hierarchy of two.',
        ],
        signedBy: null,
    },
]);

const PREC_BY_INSTRUMENT: ReadonlyMap<string, NswPrecedenceRuling> = new Map(
    NSW_PRECEDENCE_RULINGS.map((r) => [r.instrument, r]),
);

/** Find the read precedence sentence for one instrument. `null` = UNRESOLVED, and that refuses. */
export function nswLookupPrecedence(instrument: string | null | undefined): NswPrecedenceRuling | null {
    const t = instrument?.trim() ?? '';
    if (t === '') return null;
    return PREC_BY_INSTRUMENT.get(t) ?? null;
}

/** Is this precedence ruling publishable? Build prompt §1.4 — status A requires a named signer. */
export function isNswPrecedenceSigned(r: NswPrecedenceRuling | null): boolean {
    return r !== null && typeof r.signedBy === 'string' && r.signedBy.trim().length > 0;
}

/** The outcome of asking "which of these two competing bases governs?" */
export interface NswInstrumentContest {
    /** `null` when the contest could not be resolved — the caller must then refuse. */
    readonly winnerIndex: number | null;
    readonly ruling: NswPrecedenceRuling | null;
    /** The sentence a reader is owed, whichever way it went. Always populated. */
    readonly explanation: string;
    /** `true` only when a SIGNED ruling decided it. Drives `publishable`, never the arithmetic. */
    readonly publishable: boolean;
}

/**
 * ⭐ RESOLVE A CONTEST BETWEEN COMPETING BASE CONTROLS BY INSTRUMENT, NOT BY NUMBER.
 *
 * ⛔ THERE IS NO COMPARISON OF VALUES IN THIS FUNCTION AND THERE MUST NEVER BE ONE. It is handed
 * the instrument name and class of each candidate and nothing else — deliberately, so that a
 * future edit cannot reach for `Math.min` even by accident. The Hornsby fixture is the test:
 * LEP 8.5 m against SEPP 9.5 m, where the SEPP prevails and the answer is the LARGER number.
 * Any rule that "resolves" precedence conservatively gets that parcel wrong by a metre and gets
 * `parramatta-north-ssp-stack` (LEP 20 m vs SEPP 6) wrong by fourteen.
 *
 * Resolution, in order:
 *   1. Exactly one candidate is a SEPP with a READ precedence sentence → it governs.
 *   2. More than one such SEPP → ⛔ UNRESOLVED. Two prevailing chapters need s 5.9-style ordering
 *      that has not been read.
 *   3. No SEPP, or a SEPP with no read sentence → ⛔ UNRESOLVED. `EPI_TYPE='SEPP'` alone is not a
 *      precedence rule; it is a label.
 */
export function nswResolveInstrumentContest(
    candidates: readonly { readonly instrument: string | null; readonly epiType: string | null }[],
): NswInstrumentContest {
    const seppWithRuling: number[] = [];
    for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i]!;
        if (nswInstrumentClass(c.epiType) !== 'SEPP') continue;
        if (nswLookupPrecedence(c.instrument)) seppWithRuling.push(i);
    }

    if (seppWithRuling.length === 1) {
        const idx = seppWithRuling[0]!;
        const ruling = nswLookupPrecedence(candidates[idx]!.instrument)!;
        const others = candidates
            .filter((_, i) => i !== idx)
            .map((c) => c.instrument ?? 'an unnamed instrument')
            .join(', ');
        return {
            winnerIndex: idx,
            ruling,
            publishable: isNswPrecedenceSigned(ruling),
            explanation:
                `INSTRUMENT PRECEDENCE — ${ruling.instrument} governs over ${others}, on ` +
                `${ruling.clause}: "${ruling.verbatim}" ` +
                (ruling.carveOuts.length > 0
                    ? `Carve-outs carried, not dropped: ${ruling.carveOuts.join(' · ')} `
                    : '') +
                (isNswPrecedenceSigned(ruling)
                    ? `Verified by ${ruling.signedBy}.`
                    : '⚠ This precedence ruling is UNSIGNED: it computes correctly and is not ' +
                      'publishable, because a claim about which law governs someone\'s land needs a ' +
                      'named human behind it (build prompt §1.4).'),
        };
    }

    if (seppWithRuling.length > 1) {
        return {
            winnerIndex: null,
            ruling: null,
            publishable: false,
            explanation:
                `${seppWithRuling.length} State Environmental Planning Policies with prevailing ` +
                'clauses apply to this land, and nothing read so far ranks them against each other. ' +
                'SEPP (Precincts—Regional) 2021 s 5.9(2) proves such orderings exist and are stated ' +
                'in the instruments — it subordinates that chapter to SEPP (State and Regional ' +
                'Development) 2011. Until the ordering for THIS pair is read, choosing between them ' +
                'is a legal act, not an arithmetic one.',
        };
    }

    const seppNames = candidates
        .filter((c) => nswInstrumentClass(c.epiType) === 'SEPP')
        .map((c) => c.instrument ?? 'an unnamed SEPP');
    if (seppNames.length > 0) {
        return {
            winnerIndex: null,
            ruling: null,
            publishable: false,
            explanation:
                `A State Environmental Planning Policy (${seppNames.join(', ')}) competes with a ` +
                'local environmental plan on this parcel, and NO precedence sentence has been read ' +
                'for it. ⛔ EPI_TYPE=SEPP is a label, not a rule: each precinct SEPP states that ' +
                '"THIS CHAPTER prevails", chapter by chapter, and a policy without such a clause ' +
                'displaces nothing. Reported, not resolved — a signed row in NSW_PRECEDENCE_RULINGS ' +
                'is what closes it.',
        };
    }

    return {
        winnerIndex: null,
        ruling: null,
        publishable: false,
        explanation:
            'Competing base controls, none of them a State Environmental Planning Policy. Ranking ' +
            'two local environmental plans against each other is not something any sentence read so ' +
            'far does.',
    };
}
